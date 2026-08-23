import { createHash } from "node:crypto";
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
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireProject,
  requireWorkspaceContext,
} from "@/server/auth/workspace";
import { compositeImageLayers } from "@/server/assets/layer-composite";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z
  .object({
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    layers: z
      .array(
        z
          .object({
            assetId: z.string().uuid(),
            opacity: z.number().min(0.05).max(1),
            blend: z.enum(["over", "multiply", "screen", "overlay"]),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .refine(
        (layers) =>
          new Set(layers.map((layer) => layer.assetId)).size === layers.length,
        "Each layer must use a different asset",
      ),
    adjustments: z
      .object({
        brightness: z.number().min(0.25).max(2),
        saturation: z.number().min(0).max(2),
        blur: z.number().min(0).max(20),
        sharpen: z.number().min(0).max(10),
        rotate: z.union([
          z.literal(0),
          z.literal(90),
          z.literal(180),
          z.literal(270),
        ]),
      })
      .strict(),
  })
  .strict();

export async function POST(request: Request) {
  const requestId = correlationId(request);
  let uploadedPath = "";
  try {
    assertTrustedOrigin(request);
    const { supabase, userId } = await requireApiUser();
    const body = schema.parse(await readLimitedJson(request, 65_536));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    await requireProject(supabase, body.workspaceId, body.projectId, true);

    const ids = body.layers.map((layer) => layer.assetId);
    const { data: links, error: linkError } = await supabase
      .from("project_assets")
      .select(
        "asset:assets!project_assets_asset_id_fkey!inner(id, media_kind, storage_bucket, storage_path, lifecycle_state, archived_at)",
      )
      .eq("workspace_id", body.workspaceId)
      .eq("project_id", body.projectId)
      .in("asset_id", ids);
    if (linkError)
      throw new HttpError(
        422,
        "LayerAssetInvalid",
        "Every layer must be a ready image in this project",
      );
    const byId = new Map(links.map((link) => [link.asset.id, link.asset]));
    if (
      ids.some((id) => {
        const asset = byId.get(id);
        return (
          !asset ||
          asset.media_kind !== "image" ||
          asset.lifecycle_state !== "ready" ||
          Boolean(asset.archived_at) ||
          !["vesperframe-sources", "vesperframe-generated"].includes(
            asset.storage_bucket,
          ) ||
          !asset.storage_path.startsWith(`${body.workspaceId}/`)
        );
      })
    )
      throw new HttpError(
        422,
        "LayerAssetInvalid",
        "Every layer must be a ready image in this project",
      );

    const admin = createAdminClient();
    const resolved = await Promise.all(
      body.layers.map(async (layer) => {
        const asset = byId.get(layer.assetId)!;
        const { data, error } = await admin.storage
          .from(asset.storage_bucket)
          .download(asset.storage_path);
        if (error || !data)
          throw new HttpError(
            422,
            "LayerAssetReadFailed",
            "A selected layer could not be read",
          );
        return {
          buffer: Buffer.from(await data.arrayBuffer()),
          opacity: layer.opacity,
          blend: layer.blend,
        };
      }),
    );
    const output = await compositeImageLayers(resolved, body.adjustments);
    if (output.byteLength > 104_857_600)
      throw new HttpError(
        422,
        "LayerOutputTooLarge",
        "The edited image exceeds the 100 MB output limit",
      );
    const filename = safeFilename(`${body.name}.png`);
    uploadedPath = `${body.workspaceId}/${body.projectId}/edits/${crypto.randomUUID()}-${filename}`;
    const { error: uploadError } = await admin.storage
      .from("vesperframe-generated")
      .upload(uploadedPath, output, {
        contentType: "image/png",
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadError)
      throw new HttpError(
        500,
        "LayerOutputWriteFailed",
        "The edited image could not be stored",
      );
    const { data: recorded, error: recordError } = await supabase.rpc(
      "record_derived_image_asset",
      {
        target_workspace_id: body.workspaceId,
        target_project_id: body.projectId,
        source_asset_ids_value: ids,
        original_filename_value: filename,
        safe_filename_value: filename,
        mime_type_value: "image/png",
        byte_size_value: output.byteLength,
        storage_path_value: uploadedPath,
        sha256_value: createHash("sha256").update(output).digest("hex"),
        edit_recipe_value: {
          layers: body.layers,
          adjustments: body.adjustments,
        },
      },
    );
    if (recordError || !recorded) {
      await admin.storage.from("vesperframe-generated").remove([uploadedPath]);
      uploadedPath = "";
      throw new HttpError(
        422,
        "LayerOutputRecordFailed",
        "The edited image record could not be saved",
      );
    }
    return NextResponse.json(recorded, {
      status: 201,
      headers: { "Cache-Control": "no-store", "x-request-id": requestId },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
