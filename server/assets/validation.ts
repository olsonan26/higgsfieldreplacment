import "server-only";

import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { parseBuffer } from "music-metadata";
import sharp from "sharp";
import { HttpError } from "@/lib/http";

const MIME_EQUIVALENTS: Record<string, string[]> = {
  "image/jpeg": ["image/jpeg"],
  "image/png": ["image/png"],
  "image/webp": ["image/webp"],
  "video/mp4": ["video/mp4"],
  "video/quicktime": ["video/quicktime"],
  "audio/mpeg": ["audio/mpeg"],
  "audio/wav": ["audio/vnd.wave", "audio/wav", "audio/x-wav"],
  "audio/x-wav": ["audio/vnd.wave", "audio/wav", "audio/x-wav"],
  "audio/mp4": ["audio/mp4", "video/mp4"],
};

function isoMediaDuration(buffer: Buffer) {
  const marker = buffer.indexOf(Buffer.from("mvhd", "ascii"));
  if (marker < 0 || marker + 36 > buffer.length) return undefined;
  const version = buffer[marker + 4];
  const timescaleOffset = version === 1 ? marker + 24 : marker + 16;
  const durationOffset = version === 1 ? marker + 28 : marker + 20;
  if (durationOffset + (version === 1 ? 8 : 4) > buffer.length)
    return undefined;
  const timescale = buffer.readUInt32BE(timescaleOffset);
  if (!timescale) return undefined;
  const duration =
    version === 1
      ? Number(buffer.readBigUInt64BE(durationOffset))
      : buffer.readUInt32BE(durationOffset);
  const seconds = duration / timescale;
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 86_400
    ? seconds
    : undefined;
}

export async function validateSourceAsset(
  buffer: Buffer,
  claimedMime: string,
  claimedBytes: number,
) {
  if (buffer.byteLength !== claimedBytes)
    throw new HttpError(
      422,
      "AssetSizeMismatch",
      "Uploaded file size does not match its reservation",
    );
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !MIME_EQUIVALENTS[claimedMime]?.includes(detected.mime)) {
    throw new HttpError(
      422,
      "AssetSignatureMismatch",
      "Uploaded file signature does not match its declared media type",
    );
  }
  const mediaKind = claimedMime.startsWith("image/")
    ? "image"
    : claimedMime.startsWith("video/")
      ? "video"
      : "audio";
  const metadata: Record<string, string | number | boolean> = {
    validatedBySignature: true,
  };
  if (mediaKind === "image") {
    const info = await sharp(buffer, {
      limitInputPixels: 100_000_000,
    }).metadata();
    if (
      !info.width ||
      !info.height ||
      info.width > 16_384 ||
      info.height > 16_384
    )
      throw new HttpError(
        422,
        "InvalidImageDimensions",
        "Image dimensions are unsupported",
      );
    metadata.width = info.width;
    metadata.height = info.height;
  } else if (mediaKind === "video") {
    const duration = isoMediaDuration(buffer);
    if (!duration)
      throw new HttpError(
        422,
        "VideoDurationUnavailable",
        "Video duration could not be validated",
      );
    metadata.durationSeconds = Math.round(duration * 1000) / 1000;
  } else {
    try {
      const parsed = await parseBuffer(
        buffer,
        { mimeType: claimedMime, size: buffer.length },
        { duration: true, skipCovers: true },
      );
      if (
        !parsed.format.duration ||
        parsed.format.duration <= 0 ||
        parsed.format.duration > 3600
      )
        throw new Error("duration");
      metadata.durationSeconds =
        Math.round(parsed.format.duration * 1000) / 1000;
    } catch {
      throw new HttpError(
        422,
        "AudioDurationUnavailable",
        "Audio duration could not be validated",
      );
    }
  }
  return {
    detectedMime:
      detected.mime === "audio/vnd.wave" ? "audio/wav" : detected.mime,
    mediaKind,
    metadata,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
