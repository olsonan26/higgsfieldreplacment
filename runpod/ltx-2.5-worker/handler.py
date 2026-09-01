"""RunPod worker for VesperFrame's private LTX-2.5 execution backend."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import socket
import tempfile
import threading
import time
from urllib.parse import urlparse

import requests
import runpod
import torch
from ltx_core.model.video_vae import AUTO_TILING, get_video_chunks_number
from ltx_pipelines.distilled import DistilledPipeline
from ltx_pipelines.utils.args import ImageConditioningInput
from ltx_pipelines.utils.media_io import encode_video
from ltx_pipelines.utils.model_paths import ModelPaths
from ltx_pipelines.utils.quantization_factory import QuantizationKind
from ltx_pipelines.utils.types import AutoDuration, OffloadMode

MODEL_DIR = Path(os.environ.get("LTX_MODEL_DIR", "/runpod-volume/models/ltx-2.5"))
MAX_REFERENCE_BYTES = 20_000_000
MAX_REFERENCE_IMAGES = 9
MAX_SAFETENSORS_HEADER_BYTES = 64 * 1024 * 1024
DIMENSIONS = {
    ("720p", "16:9"): (1024, 576),
    ("720p", "9:16"): (576, 1024),
    ("720p", "1:1"): (768, 768),
    ("1080p", "16:9"): (1920, 1088),
    ("1080p", "9:16"): (1088, 1920),
    ("1080p", "1:1"): (1088, 1088),
}
MODEL_FILES = {
    "transformer": "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors",
    "text_encoder": "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    "video_vae": "vae/ltx-2.5-video-vae-bf16.safetensors",
    "audio_vae": "vae/ltx-2.5-audio-vae-bf16.safetensors",
    "upsampler": "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
    "duration_head": "model_patches/ltx-2.5-duration-head-bf16.safetensors",
}

_PIPELINE_LOCK = threading.Lock()


def _log(event: str, **fields: object) -> None:
    print(json.dumps({"event": event, **fields}, separators=(",", ":")), flush=True)


def _public_https_url(value: str, allowed_hosts: set[str]) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Only credential-free HTTPS URLs are accepted")
    host = parsed.hostname.lower().rstrip(".")
    if allowed_hosts and host not in allowed_hosts:
        raise ValueError("Reference host is not allowed")
    for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM):
        address = ipaddress.ip_address(item[4][0])
        if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
            raise ValueError("Reference URL resolved to a non-public address")
    return value


def _download_reference(url: str, destination: Path) -> None:
    allowed = {
        host.strip().lower()
        for host in os.environ.get("LTX_REFERENCE_ALLOWED_HOSTS", "").split(",")
        if host.strip()
    }
    safe_url = _public_https_url(url, allowed)
    with requests.get(safe_url, timeout=(10, 60), stream=True, allow_redirects=False) as response:
        response.raise_for_status()
        total = 0
        with destination.open("wb") as output:
            for chunk in response.iter_content(1024 * 1024):
                total += len(chunk)
                if total > MAX_REFERENCE_BYTES:
                    raise ValueError("Reference exceeds the 20 MB worker limit")
                output.write(chunk)


def _validate_safetensors_file(path: Path) -> None:
    """Reject truncated or malformed model files before loading them onto the GPU."""
    file_size = path.stat().st_size
    if file_size < 9:
        raise RuntimeError(f"LTX-2.5 weight is empty or truncated: {path}")
    with path.open("rb") as handle:
        header_length = int.from_bytes(handle.read(8), byteorder="little", signed=False)
        if header_length <= 1 or header_length > MAX_SAFETENSORS_HEADER_BYTES:
            raise RuntimeError(f"Invalid safetensors header length for {path}")
        if 8 + header_length > file_size:
            raise RuntimeError(f"Truncated safetensors header for {path}")
        try:
            header = json.loads(handle.read(header_length))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Invalid safetensors header for {path}") from exc
    if not isinstance(header, dict):
        raise RuntimeError(f"Invalid safetensors metadata for {path}")
    maximum_data_end = 0
    tensor_count = 0
    for name, entry in header.items():
        if name == "__metadata__":
            continue
        if not isinstance(entry, dict):
            raise RuntimeError(f"Invalid tensor entry in {path}: {name}")
        offsets = entry.get("data_offsets")
        if (
            not isinstance(offsets, list)
            or len(offsets) != 2
            or not all(isinstance(value, int) and value >= 0 for value in offsets)
            or offsets[0] > offsets[1]
        ):
            raise RuntimeError(f"Invalid tensor offsets in {path}: {name}")
        maximum_data_end = max(maximum_data_end, offsets[1])
        tensor_count += 1
    if tensor_count == 0:
        raise RuntimeError(f"No tensors found in {path}")
    expected_minimum_size = 8 + header_length + maximum_data_end
    if file_size < expected_minimum_size:
        raise RuntimeError(
            f"LTX-2.5 weight is truncated: {path} has {file_size} bytes, "
            f"needs at least {expected_minimum_size}"
        )


@lru_cache(maxsize=1)
def _required_model_paths() -> dict[str, Path]:
    paths = {key: MODEL_DIR / relative for key, relative in MODEL_FILES.items()}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise RuntimeError("LTX-2.5 weights are missing from LTX_MODEL_DIR: " + ", ".join(missing))
    for path in paths.values():
        _validate_safetensors_file(path)
    return paths


def _offload_mode() -> OffloadMode:
    raw = os.environ.get("LTX_OFFLOAD_MODE", "none").strip().lower()
    try:
        return OffloadMode(raw)
    except ValueError as exc:
        raise RuntimeError("LTX_OFFLOAD_MODE must be one of: none, cpu, disk") from exc


@lru_cache(maxsize=1)
def _fast_pipeline() -> DistilledPipeline:
    started = time.perf_counter()
    model = _required_model_paths()
    paths = ModelPaths.from_split(
        transformer_path=str(model["transformer"]),
        text_encoder_path=str(model["text_encoder"]),
        video_vae_path=str(model["video_vae"]),
        audio_vae_path=str(model["audio_vae"]),
        duration_head_path=str(model["duration_head"]),
    )
    quantization = QuantizationKind.FP8_CAST.to_policy(
        checkpoint_path=str(model["transformer"])
    )
    pipeline = DistilledPipeline(
        model_paths=paths,
        spatial_upsampler_path=str(model["upsampler"]),
        loras=[],
        quantization=quantization,
        offload_mode=_offload_mode(),
    )
    _log(
        "ltx.pipeline.ready",
        seconds=round(time.perf_counter() - started, 3),
        offloadMode=_offload_mode().value,
    )
    return pipeline


def _validate_request(payload: dict) -> tuple[str, int, int, int, int | AutoDuration, int, bool]:
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not 3 <= len(prompt) <= 20_000:
        raise ValueError("prompt must contain 3 to 20,000 characters")
    profile = (str(payload.get("resolution", "720p")), str(payload.get("aspect_ratio", "16:9")))
    if profile not in DIMENSIONS:
        raise ValueError("Unsupported resolution and aspect-ratio combination")
    width, height = DIMENSIONS[profile]
    if payload.get("output_width") != width or payload.get("output_height") != height:
        raise ValueError("Compiled output dimensions do not match the selected profile")
    frame_rate = payload.get("frame_rate", 24)
    if frame_rate != 24:
        raise ValueError("Only 24 fps is supported by this worker profile")
    if payload.get("pipeline", "fast") != "fast":
        raise ValueError("Only the resident distilled fast pipeline is enabled")

    duration = str(payload.get("duration", "auto"))
    if duration == "auto":
        num_frames: int | AutoDuration = AutoDuration(min_seconds=3, max_seconds=12)
    elif duration in {"5", "10", "12"}:
        num_frames = {"5": 121, "10": 241, "12": 289}[duration]
    else:
        raise ValueError("Unsupported duration")

    seed = payload.get("seed", 10)
    if not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed <= 2_147_483_647:
        raise ValueError("seed is outside the supported range")

    return (
        prompt,
        width,
        height,
        frame_rate,
        num_frames,
        seed,
        payload.get("enhance_prompt") is True,
    )


def _prepare_images(payload: dict, work_dir: Path, num_frames: int | AutoDuration) -> list[ImageConditioningInput]:
    images = payload.get("images", [])
    if not isinstance(images, list) or len(images) > MAX_REFERENCE_IMAGES:
        raise ValueError(f"At most {MAX_REFERENCE_IMAGES} image conditions are supported")

    seen_frames: set[int] = set()
    zero_frame_count = 0
    pending: list[tuple[str, Path, int, float]] = []
    fixed_num_frames = num_frames if isinstance(num_frames, int) else None

    for index, image in enumerate(images):
        if not isinstance(image, dict) or not isinstance(image.get("url"), str):
            raise ValueError("Invalid image condition")
        frame_index = image.get("frame_index", 0 if index == 0 else None)
        strength = image.get("strength", 1.0)
        if not isinstance(frame_index, int) or isinstance(frame_index, bool) or frame_index < 0:
            raise ValueError("Image frame_index must be a non-negative integer")
        if not isinstance(strength, (int, float)) or isinstance(strength, bool) or not 0 < float(strength) <= 1:
            raise ValueError("Image strength must be greater than 0 and no more than 1")
        if frame_index in seen_frames:
            raise ValueError("Image conditions must use distinct frame indices")
        seen_frames.add(frame_index)
        if frame_index == 0:
            zero_frame_count += 1
            if zero_frame_count > 1:
                raise ValueError("Only one image condition may target frame zero")
        else:
            if fixed_num_frames is None:
                raise ValueError("Nonzero image anchors require a fixed duration")
            if frame_index % 8 != 0:
                raise ValueError("Nonzero LTX image anchors must use frame indices divisible by 8")
            if frame_index >= fixed_num_frames:
                raise ValueError("Image frame_index falls outside the generated timeline")

        suffix = Path(urlparse(image["url"]).path).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png"}:
            suffix = ".img"
        reference_path = work_dir / f"reference-{index}{suffix}"
        pending.append((image["url"], reference_path, frame_index, float(strength)))

    if pending:
        started = time.perf_counter()
        with ThreadPoolExecutor(max_workers=min(6, len(pending))) as executor:
            futures = [executor.submit(_download_reference, url, path) for url, path, _, _ in pending]
            for future in futures:
                future.result()
        _log(
            "ltx.references.ready",
            count=len(pending),
            seconds=round(time.perf_counter() - started, 3),
        )

    return [
        ImageConditioningInput(
            path=str(path),
            frame_idx=frame_index,
            strength=strength,
            crf=None,
        )
        for _, path, frame_index, strength in pending
    ]


def _generate(payload: dict, output_path: Path, work_dir: Path) -> None:
    prompt, width, height, frame_rate, num_frames, seed, enhance_prompt = _validate_request(payload)
    images = _prepare_images(payload, work_dir, num_frames)
    started = time.perf_counter()
    with _PIPELINE_LOCK, torch.inference_mode():
        result = _fast_pipeline()(
            prompt=prompt,
            seed=seed,
            height=height,
            width=width,
            frame_rate=frame_rate,
            images=images,
            num_frames=num_frames,
            vae_dtype=torch.bfloat16,
            tiling_config=AUTO_TILING,
            enhance_prompt=enhance_prompt,
            color_space=None,
        )
        encode_video(
            video=result.video,
            fps=frame_rate,
            audio=result.audio,
            output_path=str(output_path),
            video_chunks_number=get_video_chunks_number(result.num_frames, result.tiling_config),
            color_space=None,
        )
    _log(
        "ltx.generate.completed",
        frames=result.num_frames,
        seconds=round(time.perf_counter() - started, 3),
    )


def handler(event: dict) -> dict:
    event_input = event.get("input")
    if not isinstance(event_input, dict):
        raise ValueError("RunPod input must be an object")
    payload = dict(event_input)
    output_target = payload.pop("_vesper_output", None)
    if not isinstance(output_target, dict):
        raise ValueError("A VesperFrame private output reservation is required")
    signed_url = output_target.get("signed_upload_url")
    storage_path = output_target.get("storage_path")
    maximum_bytes = output_target.get("maximum_bytes", 1_073_741_824)
    if not isinstance(signed_url, str) or not isinstance(storage_path, str):
        raise ValueError("Invalid private output reservation")
    supabase_host = urlparse(signed_url).hostname or ""
    _public_https_url(signed_url, {supabase_host.lower()})

    with tempfile.TemporaryDirectory(prefix="vesper-ltx-") as temporary:
        work_dir = Path(temporary)
        output_path = work_dir / "output.mp4"
        _generate(payload, output_path, work_dir)
        if not output_path.is_file():
            raise RuntimeError("LTX-2.5 pipeline finished without creating output.mp4")
        size = output_path.stat().st_size
        if size <= 0 or size > int(maximum_bytes):
            raise ValueError("Generated output is empty or exceeds its reservation")
        digest = hashlib.sha256()
        with output_path.open("rb") as media:
            for chunk in iter(lambda: media.read(1024 * 1024), b""):
                digest.update(chunk)
        upload_started = time.perf_counter()
        with output_path.open("rb") as media:
            response = requests.put(
                signed_url,
                data=media,
                headers={"content-type": "video/mp4", "x-upsert": "false"},
                timeout=(10, 600),
                allow_redirects=False,
            )
        response.raise_for_status()
        _log(
            "ltx.output.uploaded",
            bytes=size,
            seconds=round(time.perf_counter() - upload_started, 3),
        )
        return {
            "storagePaths": [storage_path],
            "sha256": digest.hexdigest(),
            "byteSize": size,
            "mimeType": "video/mp4",
        }


def _preload() -> None:
    if os.environ.get("LTX_PRELOAD_ON_START", "1").strip().lower() in {"0", "false", "no"}:
        _log("ltx.pipeline.preload_skipped")
        return
    _fast_pipeline()


if __name__ == "__main__":
    _preload()
    runpod.serverless.start({"handler": handler})
