import "server-only";

import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { getIngestionEnvironment } from "@/lib/env";
import { safeFilename } from "@/lib/files";
import { HttpError } from "@/lib/http";
import type { createAdminClient } from "@/lib/supabase/admin";
import { downloadValidatedResultUrl } from "@/server/security/ssrf";

type AdminClient = ReturnType<typeof createAdminClient>;
const allowedOutputTypes = new Map([
  ["image/jpeg", { kind: "image" as const, extension: "jpg" }],
  ["image/png", { kind: "image" as const, extension: "png" }],
  ["image/webp", { kind: "image" as const, extension: "webp" }],
  ["video/mp4", { kind: "video" as const, extension: "mp4" }],
  ["video/webm", { kind: "video" as const, extension: "webm" }],
  ["video/quicktime", { kind: "video" as const, extension: "mov" }],
]);

async function thumbnailFor(
  buffer: Buffer,
  kind: "image" | "video",
  generationId: string,
) {
  if (kind === "image")
    return sharp(buffer, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({
        width: 960,
        height: 960,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  const safeId = generationId.replace(/[^a-f0-9-]/gi, "").slice(0, 36);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#101626"/><circle cx="480" cy="250" r="68" fill="#7C5CFF"/><path d="M458 210v80l70-40z" fill="#F4F1EA"/><text x="480" y="390" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#F4F1EA">VesperFrame video</text><text x="480" y="430" text-anchor="middle" font-family="monospace" font-size="16" fill="#54D6FF">${safeId}</text></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

export async function ingestGenerationOutputs(
  admin: AdminClient,
  generation: {
    id: string;
    workspace_id: string;
    project_id: string;
    created_by: string;
  },
  resultUrls: string[],
) {
  if (!resultUrls.length || resultUrls.length > 8)
    throw new HttpError(
      422,
      "InvalidResultCount",
      "Generation returned an unsupported number of results",
    );
  const { data: existing } = await admin
    .from("generation_assets")
    .select("asset_id, sort_order")
    .eq("generation_id", generation.id)
    .eq("direction", "output");
  const existingByPosition = new Map(
    (existing || []).map((row) => [row.sort_order, row.asset_id]),
  );
  const environment = getIngestionEnvironment();
  const saved: string[] = [];
  const metadata: Array<{
    assetId: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
  }> = [];
  for (const [index, resultUrl] of resultUrls.entries()) {
    const existingAssetId = existingByPosition.get(index);
    if (existingAssetId) {
      saved.push(existingAssetId);
      continue;
    }
    const broadLimit = Math.max(
      environment.MAX_GENERATED_IMAGE_BYTES,
      environment.MAX_GENERATED_VIDEO_BYTES,
    );
    const buffer = await downloadValidatedResultUrl(resultUrl, broadLimit);
    const detected = await fileTypeFromBuffer(buffer);
    const type = detected ? allowedOutputTypes.get(detected.mime) : undefined;
    if (!detected || !type)
      throw new HttpError(
        422,
        "InvalidResultSignature",
        "Generated result has an unsupported file signature",
      );
    const limit =
      type.kind === "image"
        ? environment.MAX_GENERATED_IMAGE_BYTES
        : environment.MAX_GENERATED_VIDEO_BYTES;
    if (buffer.length > limit)
      throw new HttpError(
        422,
        "ResultTooLarge",
        "Generated result exceeds its media limit",
      );
    if (type.kind === "image")
      await sharp(buffer, { limitInputPixels: 100_000_000 }).metadata();
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const assetId = crypto.randomUUID();
    const outputName = safeFilename(
      `VesperFrame-${generation.id}-${index + 1}.${type.extension}`,
    );
    const outputPath = `${generation.workspace_id}/${generation.project_id}/${generation.id}/${outputName}`;
    const thumbnailPath = `${generation.workspace_id}/${generation.project_id}/${generation.id}/thumb-${index + 1}.webp`;
    const thumbnail = await thumbnailFor(buffer, type.kind, generation.id);
    const { error: outputUploadError } = await admin.storage
      .from("vesperframe-generated")
      .upload(outputPath, buffer, {
        contentType: detected.mime,
        upsert: false,
      });
    if (outputUploadError)
      throw new HttpError(
        500,
        "OutputStorageFailed",
        "Generated result could not be saved to private storage",
      );
    const { error: thumbnailUploadError } = await admin.storage
      .from("vesperframe-thumbnails")
      .upload(thumbnailPath, thumbnail, {
        contentType: "image/webp",
        upsert: false,
      });
    if (thumbnailUploadError)
      throw new HttpError(
        500,
        "ThumbnailStorageFailed",
        "Generated thumbnail could not be saved",
      );
    const { error: assetError } = await admin.from("assets").insert({
      id: assetId,
      workspace_id: generation.workspace_id,
      media_kind: type.kind,
      storage_bucket: "vesperframe-generated",
      storage_path: outputPath,
      thumbnail_path: thumbnailPath,
      original_filename: outputName,
      safe_filename: outputName,
      mime_type: detected.mime,
      byte_size: buffer.length,
      sha256,
      metadata: { generated: true, outputIndex: index },
      lifecycle_state: "ready",
      created_by: generation.created_by,
    });
    if (assetError)
      throw new HttpError(
        500,
        "OutputAssetPersistenceFailed",
        "Generated result metadata could not be saved",
      );
    const { error: linkError } = await admin.from("generation_assets").insert({
      generation_id: generation.id,
      asset_id: assetId,
      workspace_id: generation.workspace_id,
      direction: "output",
      role: "generated_output",
      sort_order: index,
    });
    if (linkError)
      throw new HttpError(
        500,
        "OutputLinkPersistenceFailed",
        "Generated result link could not be saved",
      );
    await admin.from("project_assets").insert({
      workspace_id: generation.workspace_id,
      project_id: generation.project_id,
      asset_id: assetId,
      role: "generated_output",
      sort_order: index,
      created_by: generation.created_by,
    });
    saved.push(assetId);
    metadata.push({
      assetId,
      mimeType: detected.mime,
      byteSize: buffer.length,
      sha256,
    });
  }
  return {
    outputCount: saved.length,
    alreadyIngested: existingByPosition.size === resultUrls.length,
    assets: saved,
    metadata,
  };
}

export async function ingestPreparedGenerationOutputs(
  admin: AdminClient,
  generation: {
    id: string;
    workspace_id: string;
    project_id: string;
    created_by: string;
  },
  storagePaths: string[],
) {
  if (!storagePaths.length || storagePaths.length > 8)
    throw new HttpError(
      422,
      "InvalidResultCount",
      "Generation returned an unsupported number of results",
    );
  const expectedPrefix = `${generation.workspace_id}/${generation.project_id}/${generation.id}/`;
  if (
    storagePaths.some(
      (path) =>
        !path.startsWith(expectedPrefix) ||
        path.includes("..") ||
        !/^[A-Za-z0-9._/-]{3,600}$/.test(path),
    )
  )
    throw new HttpError(
      422,
      "InvalidPreparedOutputPath",
      "Worker output did not match its private reservation",
    );
  const { data: existing } = await admin
    .from("generation_assets")
    .select("asset_id, sort_order")
    .eq("generation_id", generation.id)
    .eq("direction", "output");
  const existingByPosition = new Map(
    (existing || []).map((row) => [row.sort_order, row.asset_id]),
  );
  const environment = getIngestionEnvironment();
  const saved: string[] = [];
  const metadata: Array<{
    assetId: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
  }> = [];
  for (const [index, storagePath] of storagePaths.entries()) {
    const existingAssetId = existingByPosition.get(index);
    if (existingAssetId) {
      saved.push(existingAssetId);
      continue;
    }
    const { data: blob, error: downloadError } = await admin.storage
      .from("vesperframe-generated")
      .download(storagePath);
    if (downloadError || !blob)
      throw new HttpError(
        502,
        "PreparedOutputUnavailable",
        "The worker output has not reached private storage",
      );
    const buffer = Buffer.from(await blob.arrayBuffer());
    const detected = await fileTypeFromBuffer(buffer);
    const type = detected ? allowedOutputTypes.get(detected.mime) : undefined;
    if (!detected || !type)
      throw new HttpError(
        422,
        "InvalidResultSignature",
        "Generated result has an unsupported file signature",
      );
    const limit =
      type.kind === "image"
        ? environment.MAX_GENERATED_IMAGE_BYTES
        : environment.MAX_GENERATED_VIDEO_BYTES;
    if (buffer.length > limit)
      throw new HttpError(
        422,
        "ResultTooLarge",
        "Generated result exceeds its media limit",
      );
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const outputName = safeFilename(
      storagePath.split("/").at(-1) ||
        `VesperFrame-${generation.id}-${index + 1}.${type.extension}`,
    );
    const thumbnailPath = `${expectedPrefix}thumb-${index + 1}.webp`;
    const { data: preparedAsset } = await admin
      .from("assets")
      .select("id")
      .eq("storage_bucket", "vesperframe-generated")
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (preparedAsset) {
      await admin.from("generation_assets").upsert(
        {
          generation_id: generation.id,
          asset_id: preparedAsset.id,
          workspace_id: generation.workspace_id,
          direction: "output",
          role: "generated_output",
          sort_order: index,
        },
        { onConflict: "generation_id,asset_id,direction,role" },
      );
      await admin.from("project_assets").upsert(
        {
          workspace_id: generation.workspace_id,
          project_id: generation.project_id,
          asset_id: preparedAsset.id,
          role: "generated_output",
          sort_order: index,
          created_by: generation.created_by,
        },
        { onConflict: "project_id,asset_id,role" },
      );
      saved.push(preparedAsset.id);
      metadata.push({
        assetId: preparedAsset.id,
        mimeType: detected.mime,
        byteSize: buffer.length,
        sha256,
      });
      continue;
    }
    const thumbnail = await thumbnailFor(buffer, type.kind, generation.id);
    const { error: thumbnailUploadError } = await admin.storage
      .from("vesperframe-thumbnails")
      .upload(thumbnailPath, thumbnail, {
        contentType: "image/webp",
        upsert: true,
      });
    if (thumbnailUploadError)
      throw new HttpError(
        500,
        "ThumbnailStorageFailed",
        "Generated thumbnail could not be saved",
      );
    const assetId = crypto.randomUUID();
    const { error: assetError } = await admin.from("assets").insert({
      id: assetId,
      workspace_id: generation.workspace_id,
      media_kind: type.kind,
      storage_bucket: "vesperframe-generated",
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      original_filename: outputName,
      safe_filename: outputName,
      mime_type: detected.mime,
      byte_size: buffer.length,
      sha256,
      metadata: {
        generated: true,
        outputIndex: index,
        directWorkerUpload: true,
      },
      lifecycle_state: "ready",
      created_by: generation.created_by,
    });
    if (assetError)
      throw new HttpError(
        500,
        "OutputAssetPersistenceFailed",
        "Generated result metadata could not be saved",
      );
    const { error: linkError } = await admin.from("generation_assets").insert({
      generation_id: generation.id,
      asset_id: assetId,
      workspace_id: generation.workspace_id,
      direction: "output",
      role: "generated_output",
      sort_order: index,
    });
    if (linkError)
      throw new HttpError(
        500,
        "OutputLinkPersistenceFailed",
        "Generated result link could not be saved",
      );
    await admin.from("project_assets").insert({
      workspace_id: generation.workspace_id,
      project_id: generation.project_id,
      asset_id: assetId,
      role: "generated_output",
      sort_order: index,
      created_by: generation.created_by,
    });
    saved.push(assetId);
    metadata.push({
      assetId,
      mimeType: detected.mime,
      byteSize: buffer.length,
      sha256,
    });
  }
  return {
    outputCount: saved.length,
    alreadyIngested: existingByPosition.size === storagePaths.length,
    assets: saved,
    metadata,
  };
}
