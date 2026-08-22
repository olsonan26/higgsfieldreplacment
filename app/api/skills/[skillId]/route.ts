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
import { requireWorkspaceContext } from "@/server/auth/workspace";
import { parseSkillUpload } from "@/server/generation/skill-upload";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    workspaceId: z.string().uuid(),
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    mediaScope: z.enum(["image", "video", "both"]).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 1,
    "At least one change is required",
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ skillId: string }> },
) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { skillId } = await context.params;
    const { supabase, userId } = await requireApiUser();
    const body = patchSchema.parse(await readLimitedJson(request, 16_384));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    const changes = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.mediaScope !== undefined
        ? { media_scope: body.mediaScope }
        : {}),
      ...(body.archived !== undefined
        ? { archived_at: body.archived ? new Date().toISOString() : null }
        : {}),
    };
    const { data, error } = await supabase
      .from("generation_skills")
      .update(changes)
      .eq("workspace_id", body.workspaceId)
      .eq("id", skillId)
      .select(
        "id, name, description, media_scope, archived_at, active_version_id, updated_at",
      )
      .maybeSingle();
    if (error || !data)
      throw new HttpError(
        404,
        "SkillNotFound",
        "Generation Skill is unavailable",
      );
    return NextResponse.json(
      { skill: data },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ skillId: string }> },
) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { skillId } = await context.params;
    const { supabase, userId } = await requireApiUser();
    const workspaceId = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("workspaceId"));
    await requireWorkspaceContext(supabase, userId, workspaceId, "edit");
    const upload = await parseSkillUpload(request, false);
    const { data, error } = await supabase.rpc("add_generation_skill_version", {
      target_workspace_id: workspaceId,
      target_skill_id: skillId,
      original_filename_value: upload.fileName,
      markdown_content_value: upload.markdown,
      content_sha256_value: upload.contentSha256,
    });
    if (error)
      throw new HttpError(
        422,
        "SkillVersionFailed",
        "Generation Skill version could not be created",
      );
    return NextResponse.json(
      { skillVersion: data },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", "x-request-id": requestId },
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
