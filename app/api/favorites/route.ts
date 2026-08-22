import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import {
  apiError,
  correlationId,
  HttpError,
  readLimitedJson,
} from "@/lib/http";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { requireWorkspaceContext } from "@/server/auth/workspace";

export const runtime = "nodejs";

const schema = z
  .object({
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid(),
    assetId: z.string().uuid(),
  })
  .strict();
const querySchema = schema.omit({ assetId: true });

export async function GET(request: Request) {
  const requestId = correlationId(request);
  try {
    const { supabase, userId } = await requireApiUser();
    const query = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    await requireWorkspaceContext(supabase, userId, query.workspaceId, "view");
    const { data, error } = await supabase
      .from("favorites")
      .select(
        "created_at, asset:assets!favorites_asset_id_fkey!inner(id, media_kind, storage_bucket, storage_path, thumbnail_path, safe_filename, mime_type, byte_size, metadata)",
      )
      .eq("workspace_id", query.workspaceId)
      .eq("project_id", query.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error)
      throw new HttpError(
        500,
        "FavoriteReadFailed",
        "Favorites could not be loaded",
      );
    const favorites = await Promise.all(
      data.map(async (row) => {
        const path = row.asset.thumbnail_path || row.asset.storage_path;
        const bucket = row.asset.thumbnail_path
          ? "vesperframe-thumbnails"
          : row.asset.storage_bucket;
        const signed = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 300);
        return {
          ...row.asset,
          favoritedAt: row.created_at,
          previewUrl: signed.data?.signedUrl || null,
        };
      }),
    );
    return Response.json(
      { favorites },
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
    const body = schema.parse(await readLimitedJson(request, 4096));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    const { error } = await supabase.from("favorites").upsert(
      {
        workspace_id: body.workspaceId,
        project_id: body.projectId,
        user_id: userId,
        asset_id: body.assetId,
      },
      { onConflict: "project_id,user_id,asset_id", ignoreDuplicates: true },
    );
    if (error)
      throw new HttpError(422, "FavoriteFailed", "Favorite could not be saved");
    return Response.json(
      { favorite: true },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", "x-request-id": requestId },
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { supabase, userId } = await requireApiUser();
    const body = schema.parse(await readLimitedJson(request, 4096));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("workspace_id", body.workspaceId)
      .eq("project_id", body.projectId)
      .eq("user_id", userId)
      .eq("asset_id", body.assetId);
    if (error)
      throw new HttpError(
        422,
        "FavoriteFailed",
        "Favorite could not be removed",
      );
    return Response.json(
      { favorite: false },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
