"""RunPod worker for VesperFrame's private LTX-2.5 execution backend."""

from __future__ import annotations

import hashlib
import ipaddress
import os
from pathlib import Path
import socket
import subprocess
import tempfile
from urllib.parse import urlparse

import requests
import runpod

MODEL_DIR = Path(os.environ.get("LTX_MODEL_DIR", "/runpod-volume/models/ltx-2.5"))
MAX_REFERENCE_BYTES = 20_000_000
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
    "detailing_lora": "loras/ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors",
}


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


def _required_model_paths(pipeline: str) -> dict[str, Path]:
    paths = {key: MODEL_DIR / relative for key, relative in MODEL_FILES.items()}
    required = {
        key: path
        for key, path in paths.items()
        if key != "detailing_lora" or pipeline == "production"
    }
    missing = [str(path) for path in required.values() if not path.is_file()]
    if missing:
        raise RuntimeError("LTX-2.5 weights are missing from LTX_MODEL_DIR: " + ", ".join(missing))
    return paths


def _command(payload: dict, output_path: Path, work_dir: Path) -> list[str]:
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
    pipeline = payload.get("pipeline", "fast")
    if pipeline not in {"production", "fast"}:
        raise ValueError("Unsupported render pipeline")
    model = _required_model_paths(pipeline)
    command = [
        "python", "-m", "ltx_pipelines.dfr_pipeline" if pipeline == "production" else "ltx_pipelines.distilled",
        "--transformer-path", str(model["transformer"]),
        "--text-encoder-path", str(model["text_encoder"]),
        "--video-vae-path", str(model["video_vae"]),
        "--audio-vae-path", str(model["audio_vae"]),
        "--duration-head-path", str(model["duration_head"]),
        "--spatial-upsampler-path", str(model["upsampler"]),
        "--width", str(width), "--height", str(height),
        "--frame-rate", "24", "--output-path", str(output_path),
        "--prompt", prompt,
    ]
    if pipeline == "production":
        command.extend(["--detailing-lora", str(model["detailing_lora"])])
    duration = str(payload.get("duration", "5"))
    if duration == "auto":
        command.extend(["--auto-duration", "3", "12"])
    elif duration in {"5", "10"}:
        command.extend(["--num-frames", "121" if duration == "5" else "241"])
    else:
        raise ValueError("Unsupported duration")
    seed = payload.get("seed")
    if seed is not None:
        if not isinstance(seed, int) or not 0 <= seed <= 2_147_483_647:
            raise ValueError("seed is outside the supported range")
        command.extend(["--seed", str(seed)])
    if payload.get("enhance_prompt") is True:
        command.append("--enhance-prompt")
    images = payload.get("images", [])
    if not isinstance(images, list) or len(images) > 1:
        raise ValueError("At most one first-frame image is supported")
    if images:
        image = images[0]
        if not isinstance(image, dict) or not isinstance(image.get("url"), str):
            raise ValueError("Invalid first-frame input")
        reference_path = work_dir / "first-frame"
        _download_reference(image["url"], reference_path)
        command.extend(["--image", str(reference_path), "0", "1.0"])
    return command


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
        subprocess.run(_command(payload, output_path, work_dir), check=True, timeout=3_600)
        size = output_path.stat().st_size
        if size <= 0 or size > int(maximum_bytes):
            raise ValueError("Generated output is empty or exceeds its reservation")
        digest = hashlib.sha256()
        with output_path.open("rb") as media:
            for chunk in iter(lambda: media.read(1024 * 1024), b""):
                digest.update(chunk)
        with output_path.open("rb") as media:
            response = requests.put(
                signed_url,
                data=media,
                headers={"content-type": "video/mp4", "x-upsert": "false"},
                timeout=(10, 600),
                allow_redirects=False,
            )
        response.raise_for_status()
        return {
            "storagePaths": [storage_path],
            "sha256": digest.hexdigest(),
            "byteSize": size,
            "mimeType": "video/mp4",
        }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
