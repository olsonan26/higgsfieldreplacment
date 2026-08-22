import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import {
  apiError,
  correlationId,
  HttpError,
  readLimitedJson,
} from "@/lib/http";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceContext } from "@/server/auth/workspace";
import { validateSourceAsset } from "@/server/assets/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

const finalizeSchema = z.object({ workspaceId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const requestId = correlationId(request);
  let assetId = "";
  let workspaceId = "";
  try {
    assertTrustedOrigin(request);
    ({ assetId } = await context.params);
    const { supabase, userId } = await requireApiUser();
    const body = finalizeSchema.parse(await readLimitedJson(request, 4096));
    workspaceId = body.workspaceId;
    await requireWorkspaceContext(supabase, userId, workspaceId, "edit");
    const { data: asset, error } = await supabase
      .from("assets")
      .select(
        "id, workspace_id, storage_bucket, storage_path, mime_type, byte_size, lifecycle_state, created_by",
      )
      .eq("workspace_id", workspaceId)
      .eq("id", assetId)
      .maybeSingle();
    if (
      error ||
      !asset ||
      asset.lifecycle_state !== "uploading" ||
      asset.created_by !== userId
    )
      throw new HttpError(
        404,
        "AssetNotFound",
        "Upload reservation is unavailable",
      );
    const admin = createAdminClient();
    const { data: blob, error: downloadError } = await admin.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path);
    if (downloadError || !blob)
      throw new HttpError(
        409,
        "AssetUploadMissing",
        "Upload has not completed",
      );
    const buffer = Buffer.from(await blob.arrayBuffer());
    const validated = await validateSourceAsset(
      buffer,
      asset.mime_type,
      Number(asset.byte_size),
    );
    const { error: updateError } = await admin
      .from("assets")
      .update({
        lifecycle_state: "ready",
        mime_type: validated.detectedMime,
        byte_size: buffer.length,
        sha256: validated.sha256,
        metadata: validated.metadata,
      })
      .eq("workspace_id", workspaceId)
      .eq("id", assetId)
      .eq("lifecycle_state", "uploading");
    if (updateError)
      throw new HttpError(
        500,
        "AssetFinalizeFailed",
        "Validated asset could not be finalized",
      );
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: userId,
      action: "asset.upload_validated",
      target_type: "asset",
      target_id: assetId,
      correlation_id: requestId,
      metadata: {
        mediaKind: validated.mediaKind,
        byteSize: buffer.length,
        contentSha256: validated.sha256,
      },
    });
    return NextResponse.json(
      {
        asset: {
          id: assetId,
          lifecycleState: "ready",
          mimeType: validated.detectedMime,
          byteSize: buffer.length,
          sha256: validated.sha256,
          metadata: validated.metadata,
        },
      },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    if (
      assetId &&
      workspaceId &&
      error instanceof HttpError &&
      error.status === 422
    ) {
      try {
        const admin = createAdminClient();
        await admin
          .from("assets")
          .update({
            lifecycle_state: "quarantined",
            metadata: { validationCode: error.code },
          })
          .eq("workspace_id", workspaceId)
          .eq("id", assetId);
      } catch {
        /* Readiness will expose missing server persistence configuration. */
      }
    }
    return apiError(error, requestId);
  }
}
