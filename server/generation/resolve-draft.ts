import "server-only";

import { createHash } from "node:crypto";
import { GenerationCompileError } from "@/server/generation/compiler";
import { compileGenerationRequest } from "@/server/generation/compiler";
import {
  modelCapabilitySchema,
  type GenerationSkillInput,
  type ReferenceInput,
} from "@/lib/generation/capability";
import type { GenerationDraft } from "@/lib/generation/request-schema";
import type { createClient } from "@/lib/supabase/server";
import { requireProject } from "@/server/auth/workspace";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function resolveGenerationDraft(
  supabase: SupabaseServerClient,
  draft: GenerationDraft,
) {
  await requireProject(supabase, draft.workspaceId, draft.projectId);

  const { data: capabilityRow, error: capabilityError } = await supabase
    .from("model_capabilities")
    .select("id, app_model_key, version, manifest, fixture_hash")
    .eq("app_model_key", draft.capabilityKey)
    .eq("version", draft.capabilityVersion)
    .eq("enabled", true)
    .maybeSingle();
  if (capabilityError || !capabilityRow)
    throw new GenerationCompileError([
      {
        path: "capabilityKey",
        message: "The selected model capability is unavailable.",
      },
    ]);
  const capability = modelCapabilitySchema.parse(capabilityRow.manifest);

  const referenceIds = draft.references.map((reference) => reference.assetId);
  const { data: assetRows, error: assetError } = referenceIds.length
    ? await supabase
        .from("assets")
        .select(
          "id, workspace_id, media_kind, storage_bucket, storage_path, mime_type, byte_size, metadata, lifecycle_state",
        )
        .eq("workspace_id", draft.workspaceId)
        .in("id", referenceIds)
    : { data: [], error: null };
  if (assetError || assetRows.length !== new Set(referenceIds).size) {
    throw new GenerationCompileError([
      {
        path: "references",
        message: "One or more reference assets are unavailable.",
      },
    ]);
  }
  const assets = new Map(assetRows.map((asset) => [asset.id, asset]));
  const references: ReferenceInput[] = [];
  for (const reference of draft.references) {
    const asset = assets.get(reference.assetId)!;
    if (asset.lifecycle_state !== "ready")
      throw new GenerationCompileError([
        {
          path: "references",
          message: "Every reference must finish validation before generation.",
        },
      ]);
    const spec = capability.references.find(
      (candidate) => candidate.role === reference.role,
    );
    let locator = "";
    let mimeType = asset.mime_type;
    if (spec?.inputKind === "external_id") {
      const externalId = jsonRecord(asset.metadata).externalId;
      if (typeof externalId !== "string")
        throw new GenerationCompileError([
          {
            path: "references",
            message: "This reference is missing its validated identity.",
          },
        ]);
      locator = externalId;
      mimeType = "application/x.external-id";
    } else {
      const { data, error } = await supabase.storage
        .from(asset.storage_bucket)
        .createSignedUrl(asset.storage_path, 3600);
      if (error || !data?.signedUrl)
        throw new GenerationCompileError([
          {
            path: "references",
            message: "A private reference could not be signed.",
          },
        ]);
      locator = data.signedUrl;
    }
    const metadata = jsonRecord(asset.metadata);
    references.push({
      assetId: asset.id,
      role: reference.role,
      providerLocator: locator,
      mediaKind:
        asset.media_kind === "audio"
          ? "audio"
          : asset.media_kind === "video"
            ? "video"
            : "image",
      mimeType,
      byteSize: Number(asset.byte_size),
      ...(typeof metadata.durationSeconds === "number"
        ? { durationSeconds: metadata.durationSeconds }
        : {}),
      ...(reference.groupId ? { groupId: reference.groupId } : {}),
      ...(reference.label ? { label: reference.label } : {}),
      ...(reference.description ? { description: reference.description } : {}),
      ...(reference.startMs !== undefined
        ? { startMs: reference.startMs }
        : {}),
      ...(reference.endMs !== undefined ? { endMs: reference.endMs } : {}),
      ...(reference.startSeconds !== undefined
        ? { startSeconds: reference.startSeconds }
        : {}),
      ...(reference.endSeconds !== undefined
        ? { endSeconds: reference.endSeconds }
        : {}),
    });
  }

  const skills: GenerationSkillInput[] = [];
  if (draft.skillVersionIds.length) {
    const { data: versions, error: versionError } = await supabase
      .from("generation_skill_versions")
      .select("id, skill_id, workspace_id, markdown_content, content_sha256")
      .eq("workspace_id", draft.workspaceId)
      .in("id", draft.skillVersionIds);
    if (versionError || versions.length !== draft.skillVersionIds.length)
      throw new GenerationCompileError([
        {
          path: "skillVersionIds",
          message: "One or more Generation Skills are unavailable.",
        },
      ]);
    const skillIds = versions.map((version) => version.skill_id);
    const { data: skillRows, error: skillError } = await supabase
      .from("generation_skills")
      .select("id, name, media_scope, active_version_id, archived_at")
      .eq("workspace_id", draft.workspaceId)
      .in("id", skillIds);
    if (skillError || skillRows.length !== new Set(skillIds).size)
      throw new GenerationCompileError([
        {
          path: "skillVersionIds",
          message: "One or more Generation Skills are unavailable.",
        },
      ]);
    const versionMap = new Map(
      versions.map((version) => [version.id, version]),
    );
    const skillMap = new Map(skillRows.map((skill) => [skill.id, skill]));
    for (const versionId of draft.skillVersionIds) {
      const version = versionMap.get(versionId)!;
      const skill = skillMap.get(version.skill_id)!;
      if (skill.archived_at || skill.active_version_id !== version.id)
        throw new GenerationCompileError([
          {
            path: "skillVersionIds",
            message: `${skill.name} is no longer the active version.`,
          },
        ]);
      const actualHash = createHash("sha256")
        .update(version.markdown_content, "utf8")
        .digest("hex");
      if (actualHash !== version.content_sha256)
        throw new GenerationCompileError([
          {
            path: "skillVersionIds",
            message: `${skill.name} failed its integrity check.`,
          },
        ]);
      skills.push({
        skillId: skill.id,
        versionId: version.id,
        name: skill.name,
        mediaScope: skill.media_scope,
        markdownContent: version.markdown_content,
        contentSha256: version.content_sha256,
      });
    }
  }

  const compiled = compileGenerationRequest({
    rawPrompt: draft.rawPrompt,
    creativeDirection: draft.creativeDirection,
    technicalSettings: draft.technicalSettings,
    references,
    skills,
    capability,
  });
  return { capabilityRow, capability, references, skills, compiled };
}
