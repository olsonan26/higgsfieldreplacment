import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { apiError, correlationId, HttpError } from "@/lib/http";
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
    const query = z
      .object({ workspaceId: z.string().uuid(), projectId: z.string().uuid() })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    await requireWorkspaceContext(supabase, userId, query.workspaceId, "view");
    const { data, error } = await supabase
      .from("project_assets")
      .select(
        "asset:assets!project_assets_asset_id_fkey!inner(id, media_kind, storage_bucket, storage_path, mime_type, safe_filename)",
      )
      .eq("workspace_id", query.workspaceId)
      .eq("project_id", query.projectId)
      .eq("asset_id", assetId)
      .maybeSingle();
    if (error || !data)
      throw new HttpError(404, "AssetNotFound", "Asset is unavailable");
    if (data.asset.mime_type === "application/x.external-id")
      throw new HttpError(
        422,
        "IdentityHasNoPreview",
        "Identity references do not contain previewable media",
      );
    const { data: signed, error: signError } = await supabase.storage
      .from(data.asset.storage_bucket)
      .createSignedUrl(data.asset.storage_path, 300);
    if (signError || !signed?.signedUrl)
      throw new HttpError(
        500,
        "PreviewSigningFailed",
        "Private preview could not be signed",
      );
    return Response.json(
      {
        url: signed.signedUrl,
        mediaKind: data.asset.media_kind,
        mimeType: data.asset.mime_type,
        filename: data.asset.safe_filename,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
