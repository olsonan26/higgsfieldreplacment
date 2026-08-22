import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { safeFilename } from "@/lib/files";
import {
  apiError,
  correlationId,
  HttpError,
  readLimitedJson,
} from "@/lib/http";
import { assertTrustedOrigin } from "@/lib/security/origin";
import {
  requireProject,
  requireWorkspaceContext,
} from "@/server/auth/workspace";

export const runtime = "nodejs";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
});
const reserveSchema = querySchema
  .extend({
    originalFilename: z.string().trim().min(1).max(255),
    mimeType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
    ]),
    byteSize: z.number().int().min(1).max(104_857_600),
    role: z.enum([
      "source",
      "reference_image",
      "reference_video",
      "reference_audio",
      "first_frame",
      "last_frame",
      "character",
      "element",
    ]),
  })
  .strict();

export async function GET(request: Request) {
  const requestId = correlationId(request);
  try {
    const { supabase, userId } = await requireApiUser();
    const query = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    await requireWorkspaceContext(supabase, userId, query.workspaceId, "view");
    await requireProject(supabase, query.workspaceId, query.projectId, true);
    const { data: links, error } = await supabase
      .from("project_assets")
      .select(
        "role, role_label, sort_order, asset:assets!project_assets_asset_id_fkey!inner(id, media_kind, storage_bucket, storage_path, thumbnail_path, original_filename, safe_filename, mime_type, byte_size, sha256, metadata, lifecycle_state, created_at, archived_at)",
      )
      .eq("workspace_id", query.workspaceId)
      .eq("project_id", query.projectId)
      .order("sort_order");
    if (error)
      throw new HttpError(500, "AssetReadFailed", "Assets could not be loaded");
    const assets = await Promise.all(
      links.map(async (link) => {
        const asset = link.asset;
        let previewUrl: string | null = null;
        if (asset.lifecycle_state === "ready" && !asset.archived_at) {
          const path = asset.thumbnail_path || asset.storage_path;
          const bucket = asset.thumbnail_path
            ? "vesperframe-thumbnails"
            : asset.storage_bucket;
          const { data } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, 300);
          previewUrl = data?.signedUrl || null;
        }
        return {
          ...asset,
          role: link.role,
          roleLabel: link.role_label,
          sortOrder: link.sort_order,
          previewUrl,
        };
      }),
    );
    return NextResponse.json(
      { assets },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { supabase, userId } = await requireApiUser();
    const body = reserveSchema.parse(await readLimitedJson(request, 16_384));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    const storageName = `source-${crypto.randomUUID().slice(0, 8)}-${safeFilename(body.originalFilename)}`;
    const { data: reservation, error } = await supabase.rpc(
      "reserve_source_asset",
      {
        target_workspace_id: body.workspaceId,
        target_project_id: body.projectId,
        original_filename_value: body.originalFilename,
        safe_filename_value: storageName,
        mime_type_value: body.mimeType,
        byte_size_value: body.byteSize,
        requested_role: body.role,
      },
    );
    if (
      error ||
      !reservation ||
      typeof reservation !== "object" ||
      Array.isArray(reservation)
    )
      throw new HttpError(
        422,
        "AssetReserveFailed",
        "Source upload could not be reserved",
      );
    const result = reservation as Record<string, unknown>;
    const storagePath = String(result.storagePath || "");
    const assetId = String(result.assetId || "");
    const { data: signed, error: signError } = await supabase.storage
      .from("vesperframe-sources")
      .createSignedUploadUrl(storagePath);
    if (signError || !signed?.token)
      throw new HttpError(
        500,
        "UploadSigningFailed",
        "Private upload could not be signed",
      );
    return NextResponse.json(
      { assetId, storagePath, uploadToken: signed.token },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", "x-request-id": requestId },
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
