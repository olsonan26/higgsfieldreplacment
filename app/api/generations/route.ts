import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { generationSubmissionSchema } from "@/lib/generation/request-schema";
import {
  apiError,
  correlationId,
  HttpError,
  readLimitedJson,
} from "@/lib/http";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { requireWorkspaceContext } from "@/server/auth/workspace";
import { submitGenerationBatch } from "@/server/generation/submit";

export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export async function GET(request: Request) {
  const requestId = correlationId(request);
  try {
    const { supabase, userId } = await requireApiUser();
    const query = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    await requireWorkspaceContext(supabase, userId, query.workspaceId, "view");
    const { data: generations, error } = await supabase
      .from("generations")
      .select(
        "id, batch_id, ordinal, state, progress, raw_prompt, compiled_prompt, settings_snapshot, capability_snapshot, provider_result_metadata, estimated_credits, recorded_credits, display_error_code, display_error_message, submitted_at, completed_at, archived_at, created_at, updated_at",
      )
      .eq("workspace_id", query.workspaceId)
      .eq("project_id", query.projectId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error)
      throw new HttpError(
        500,
        "QueueReadFailed",
        "Generation queue could not be loaded",
      );
    const generationIds = generations.map((generation) => generation.id);
    const { data: outputLinks, error: outputError } = generationIds.length
      ? await supabase
          .from("generation_assets")
          .select(
            "generation_id, sort_order, asset:assets!generation_assets_asset_id_fkey!inner(id, media_kind, storage_bucket, storage_path, thumbnail_path, safe_filename, mime_type, byte_size, sha256, metadata)",
          )
          .in("generation_id", generationIds)
          .eq("direction", "output")
          .order("sort_order")
      : { data: [], error: null };
    if (outputError)
      throw new HttpError(
        500,
        "QueueOutputReadFailed",
        "Generated outputs could not be loaded",
      );
    const outputs = new Map<string, Array<Record<string, unknown>>>();
    for (const link of outputLinks) {
      const path = link.asset.thumbnail_path || link.asset.storage_path;
      const bucket = link.asset.thumbnail_path
        ? "vesperframe-thumbnails"
        : link.asset.storage_bucket;
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 300);
      outputs.set(link.generation_id, [
        ...(outputs.get(link.generation_id) || []),
        {
          ...link.asset,
          sortOrder: link.sort_order,
          previewUrl: data?.signedUrl || null,
        },
      ]);
    }
    return NextResponse.json(
      {
        generations: generations.map((generation) => ({
          ...generation,
          outputs: outputs.get(generation.id) || [],
        })),
      },
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
    const body = generationSubmissionSchema.parse(
      await readLimitedJson(request),
    );
    const workspace = await requireWorkspaceContext(
      supabase,
      userId,
      body.workspaceId,
      "edit",
    );
    if (!workspace.generationAllowed)
      throw new HttpError(
        403,
        "GenerationDisabled",
        "Generation permission is disabled for this membership",
      );
    const result = await submitGenerationBatch(
      supabase,
      userId,
      body,
      requestId,
    );
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: { "Cache-Control": "no-store", "x-request-id": requestId },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
