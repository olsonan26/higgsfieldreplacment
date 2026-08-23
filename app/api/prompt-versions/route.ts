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
import {
  requireProject,
  requireWorkspaceContext,
} from "@/server/auth/workspace";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
});

const saveSchema = querySchema
  .extend({
    action: z.literal("save").default("save"),
    rawPrompt: z.string().max(20_000),
    compiledPrompt: z.string().max(30_000),
    creativeDirection: z.record(z.string(), z.unknown()),
    technicalSettings: z.record(z.string(), z.unknown()),
    capabilityKey: z.string().min(1).max(160),
    capabilityVersion: z.number().int().positive(),
  })
  .strict();

const restoreSchema = querySchema
  .extend({
    action: z.literal("restore"),
    versionId: z.string().uuid(),
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
    const { data, error } = await supabase
      .from("prompt_versions")
      .select(
        "id, version, raw_prompt, compiled_prompt, creative_direction, technical_settings, restored_from_id, created_at, model_capability_id, capability:model_capabilities(app_model_key, display_name, media_kind, version)",
      )
      .eq("workspace_id", query.workspaceId)
      .eq("project_id", query.projectId)
      .order("version", { ascending: false })
      .limit(100);
    if (error)
      throw new HttpError(
        500,
        "PromptVersionReadFailed",
        "Prompt versions could not be loaded",
      );
    return NextResponse.json(
      { versions: data },
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
    const payload = await readLimitedJson(request, 131_072);
    const discriminator = z
      .object({ action: z.enum(["save", "restore"]).default("save") })
      .passthrough()
      .parse(payload);
    if (discriminator.action === "restore") {
      const body = restoreSchema.parse(payload);
      await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
      const { data: source, error: sourceError } = await supabase
        .from("prompt_versions")
        .select(
          "id, raw_prompt, compiled_prompt, creative_direction, technical_settings, model_capability_id, capability:model_capabilities(app_model_key, display_name, media_kind, version)",
        )
        .eq("workspace_id", body.workspaceId)
        .eq("project_id", body.projectId)
        .eq("id", body.versionId)
        .single();
      if (sourceError || !source)
        throw new HttpError(
          404,
          "PromptVersionNotFound",
          "Prompt version was not found",
        );
      if (!source.model_capability_id)
        throw new HttpError(
          422,
          "PromptCapabilityMissing",
          "This historical prompt has no verified model contract",
        );
      const { data: appended, error } = await supabase.rpc(
        "append_prompt_version",
        {
          target_workspace_id: body.workspaceId,
          target_project_id: body.projectId,
          raw_prompt_value: source.raw_prompt,
          compiled_prompt_value: source.compiled_prompt,
          creative_direction_value: source.creative_direction,
          technical_settings_value: source.technical_settings,
          capability_id_value: source.model_capability_id,
          restored_from_value: source.id,
        },
      );
      if (error || !appended)
        throw new HttpError(
          422,
          "PromptRestoreFailed",
          "Prompt version could not be restored",
        );
      return NextResponse.json(
        {
          restored: {
            ...source,
            id: String((appended as Record<string, unknown>).id),
            version: Number((appended as Record<string, unknown>).version),
            restored_from_id: source.id,
            created_at: new Date().toISOString(),
          },
        },
        { status: 201, headers: { "x-request-id": requestId } },
      );
    }

    const body = saveSchema.parse(payload);
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    await requireProject(supabase, body.workspaceId, body.projectId, true);
    const { data: capability, error: capabilityError } = await supabase
      .from("model_capabilities")
      .select("id")
      .eq("app_model_key", body.capabilityKey)
      .eq("version", body.capabilityVersion)
      .eq("enabled", true)
      .single();
    if (capabilityError || !capability)
      throw new HttpError(
        422,
        "CapabilityNotFound",
        "Verified model contract was not found",
      );
    const { data: appended, error } = await supabase.rpc(
      "append_prompt_version",
      {
        target_workspace_id: body.workspaceId,
        target_project_id: body.projectId,
        raw_prompt_value: body.rawPrompt,
        compiled_prompt_value: body.compiledPrompt,
        creative_direction_value: body.creativeDirection as Json,
        technical_settings_value: body.technicalSettings as Json,
        capability_id_value: capability.id,
      },
    );
    if (error || !appended)
      throw new HttpError(
        422,
        "PromptVersionSaveFailed",
        "Prompt version could not be saved",
      );
    return NextResponse.json(
      { version: appended },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
