import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { brandedDownloadFilename } from "@/lib/files";
import { apiError, correlationId, HttpError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceContext } from "@/server/auth/workspace";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const requestId = correlationId(request);
  try {
    const { assetId } = await context.params;
    const { supabase, userId } = await requireApiUser();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const query = z
      .object({ workspaceId: z.string().uuid(), projectId: z.string().uuid() })
      .parse(params);
    await requireWorkspaceContext(supabase, userId, query.workspaceId, "view");
    const { data, error } = await supabase
      .from("project_assets")
      .select(
        "asset:assets!project_assets_asset_id_fkey!inner(id, media_kind, storage_bucket, storage_path, safe_filename, mime_type), project:projects!project_assets_project_id_fkey!inner(name)",
      )
      .eq("workspace_id", query.workspaceId)
      .eq("project_id", query.projectId)
      .eq("asset_id", assetId)
      .maybeSingle();
    if (error || !data)
      throw new HttpError(404, "AssetNotFound", "Asset is unavailable");
    const extension =
      data.asset.safe_filename.split(".").pop() ||
      data.asset.mime_type.split("/").pop() ||
      "bin";
    const filename = brandedDownloadFilename(
      data.project.name,
      data.asset.media_kind,
      extension,
    );
    const { data: signed, error: signError } = await supabase.storage
      .from(data.asset.storage_bucket)
      .createSignedUrl(data.asset.storage_path, 60, { download: filename });
    if (signError || !signed?.signedUrl)
      throw new HttpError(
        500,
        "DownloadSigningFailed",
        "Private download could not be signed",
      );
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      workspace_id: query.workspaceId,
      actor_id: userId,
      action: "asset.downloaded",
      target_type: "asset",
      target_id: assetId,
      correlation_id: requestId,
      metadata: {},
    });
    return Response.redirect(signed.signedUrl, 307);
  } catch (error) {
    return apiError(error, requestId);
  }
}
