import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { apiError, correlationId, HttpError } from "@/lib/http";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { requireWorkspaceContext } from "@/server/auth/workspace";
import { parseSkillUpload, skillSlug } from "@/server/generation/skill-upload";

export const runtime = "nodejs";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  mediaKind: z.enum(["image", "video"]).optional(),
});

export async function GET(request: Request) {
  const requestId = correlationId(request);
  try {
    const { supabase, userId } = await requireApiUser();
    const query = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    await requireWorkspaceContext(supabase, userId, query.workspaceId, "view");
    let skillsQuery = supabase
      .from("generation_skills")
      .select(
        "id, name, slug, description, media_scope, active_version_id, archived_at, created_at, updated_at",
      )
      .eq("workspace_id", query.workspaceId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (query.mediaKind)
      skillsQuery = skillsQuery.in("media_scope", [query.mediaKind, "both"]);
    const { data: skills, error } = await skillsQuery;
    if (error)
      throw new HttpError(
        500,
        "SkillReadFailed",
        "Generation Skills could not be loaded",
      );
    const versionIds = skills
      .map((skill) => skill.active_version_id)
      .filter((id): id is string => Boolean(id));
    const { data: versions, error: versionError } = versionIds.length
      ? await supabase
          .from("generation_skill_versions")
          .select(
            "id, skill_id, version, original_filename, markdown_content, content_sha256, created_at",
          )
          .in("id", versionIds)
      : { data: [], error: null };
    if (versionError)
      throw new HttpError(
        500,
        "SkillReadFailed",
        "Generation Skill versions could not be loaded",
      );
    const versionMap = new Map(
      versions.map((version) => [version.id, version]),
    );
    return NextResponse.json(
      {
        skills: skills.map((skill) => ({
          ...skill,
          activeVersion: skill.active_version_id
            ? versionMap.get(skill.active_version_id) || null
            : null,
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
    const workspaceId = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("workspaceId"));
    await requireWorkspaceContext(supabase, userId, workspaceId, "edit");
    const upload = await parseSkillUpload(request, true);
    const { data, error } = await supabase.rpc("create_generation_skill", {
      target_workspace_id: workspaceId,
      skill_name: upload.name,
      skill_slug: skillSlug(upload.name),
      skill_description: upload.description,
      skill_media_scope: upload.mediaScope,
      original_filename_value: upload.fileName,
      markdown_content_value: upload.markdown,
      content_sha256_value: upload.contentSha256,
    });
    if (error)
      throw new HttpError(
        error.code === "23505" ? 409 : 422,
        "SkillCreateFailed",
        "Generation Skill could not be created",
      );
    return NextResponse.json(
      { skill: data },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", "x-request-id": requestId },
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
