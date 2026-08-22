import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { getOptionalServerReadiness } from "@/lib/env";
import {
  apiError,
  correlationId,
  HttpError,
  readLimitedJson,
} from "@/lib/http";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { requireWorkspaceContext } from "@/server/auth/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = correlationId(request);
  try {
    const { supabase, userId } = await requireApiUser();
    const workspaceId = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("workspaceId"));
    const context = await requireWorkspaceContext(
      supabase,
      userId,
      workspaceId,
      "view",
    );
    const [workspaceResult, memberResult, policyResult, capabilityResult] =
      await Promise.all([
        supabase
          .from("workspaces")
          .select(
            "id, name, slug, monthly_credit_limit, daily_generation_limit, max_concurrent_generations, retention_days",
          )
          .eq("id", workspaceId)
          .single(),
        supabase
          .from("workspace_memberships")
          .select(
            "user_id, role, generation_allowed, monthly_credit_limit, daily_generation_limit, created_at",
          )
          .eq("workspace_id", workspaceId),
        supabase
          .from("workspace_model_spend_policies")
          .select(
            "model_capability_id, estimated_credit_reserve, enabled, updated_at",
          )
          .eq("workspace_id", workspaceId),
        supabase
          .from("model_capabilities")
          .select("id, app_model_key, version, media_kind, manifest")
          .eq("enabled", true),
      ]);
    if (
      workspaceResult.error ||
      memberResult.error ||
      policyResult.error ||
      capabilityResult.error
    )
      throw new HttpError(
        500,
        "SettingsReadFailed",
        "Workspace settings could not be loaded",
      );
    const userIds = memberResult.data.map((member) => member.user_id);
    const { data: profiles, error: profileError } = userIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name, avatar_path")
          .in("id", userIds)
      : { data: [], error: null };
    if (profileError)
      throw new HttpError(
        500,
        "SettingsReadFailed",
        "Workspace members could not be loaded",
      );
    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    return Response.json(
      {
        workspace: workspaceResult.data,
        role: context.role,
        members: memberResult.data.map((member) => ({
          ...member,
          profile: profileMap.get(member.user_id) || null,
        })),
        modelPolicies: policyResult.data,
        capabilities: capabilityResult.data.map((capability) => {
          const manifest = capability.manifest as Record<string, unknown>;
          return {
            id: capability.id,
            appModelKey: capability.app_model_key,
            version: capability.version,
            mediaKind: capability.media_kind,
            displayName: String(
              manifest.displayName || capability.app_model_key,
            ),
            modelMaker: String(manifest.modelMaker || ""),
          };
        }),
        ...(context.role === "owner" || context.role === "admin"
          ? { readiness: getOptionalServerReadiness() }
          : {}),
      },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}

const workspacePatch = z
  .object({
    kind: z.literal("workspace"),
    workspaceId: z.string().uuid(),
    monthlyCreditLimit: z.number().min(0).max(1_000_000).optional(),
    dailyGenerationLimit: z.number().int().min(1).max(10_000).optional(),
    maxConcurrentGenerations: z.number().int().min(1).max(100).optional(),
    retentionDays: z.number().int().min(1).max(3650).optional(),
  })
  .strict();
const memberPatch = z
  .object({
    kind: z.literal("member"),
    workspaceId: z.string().uuid(),
    userId: z.string().uuid(),
    role: z.enum(["owner", "admin", "editor", "viewer"]).optional(),
    generationAllowed: z.boolean().optional(),
    monthlyCreditLimit: z.number().min(0).max(1_000_000).nullable().optional(),
    dailyGenerationLimit: z
      .number()
      .int()
      .min(1)
      .max(10_000)
      .nullable()
      .optional(),
  })
  .strict();
const modelPatch = z
  .object({
    kind: z.literal("modelPolicy"),
    workspaceId: z.string().uuid(),
    capabilityId: z.string().uuid(),
    estimatedCreditReserve: z.number().positive().max(100_000),
    enabled: z.boolean(),
  })
  .strict();
const patchSchema = z.discriminatedUnion("kind", [
  workspacePatch,
  memberPatch,
  modelPatch,
]);

export async function PATCH(request: Request) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { supabase, userId } = await requireApiUser();
    const body = patchSchema.parse(await readLimitedJson(request, 16_384));
    const workspace = await requireWorkspaceContext(
      supabase,
      userId,
      body.workspaceId,
      "admin",
    );
    if (body.kind === "workspace") {
      const { error } = await supabase
        .from("workspaces")
        .update({
          ...(body.monthlyCreditLimit !== undefined
            ? { monthly_credit_limit: body.monthlyCreditLimit }
            : {}),
          ...(body.dailyGenerationLimit !== undefined
            ? { daily_generation_limit: body.dailyGenerationLimit }
            : {}),
          ...(body.maxConcurrentGenerations !== undefined
            ? { max_concurrent_generations: body.maxConcurrentGenerations }
            : {}),
          ...(body.retentionDays !== undefined
            ? { retention_days: body.retentionDays }
            : {}),
        })
        .eq("id", body.workspaceId);
      if (error)
        throw new HttpError(
          422,
          "SettingsUpdateFailed",
          "Workspace limits could not be updated",
        );
    } else if (body.kind === "member") {
      const { data: targetMember, error: targetError } = await supabase
        .from("workspace_memberships")
        .select("role")
        .eq("workspace_id", body.workspaceId)
        .eq("user_id", body.userId)
        .single();
      if (targetError || !targetMember)
        throw new HttpError(
          404,
          "MemberNotFound",
          "Workspace member was not found",
        );
      const protectedRole =
        targetMember.role === "owner" ||
        targetMember.role === "admin" ||
        body.role === "owner" ||
        body.role === "admin";
      if (workspace.role !== "owner" && protectedRole)
        throw new HttpError(
          403,
          "OwnerRequired",
          "Only an owner may manage owner or admin access",
        );
      const { error } = await supabase
        .from("workspace_memberships")
        .update({
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.generationAllowed !== undefined
            ? { generation_allowed: body.generationAllowed }
            : {}),
          ...(body.monthlyCreditLimit !== undefined
            ? { monthly_credit_limit: body.monthlyCreditLimit }
            : {}),
          ...(body.dailyGenerationLimit !== undefined
            ? { daily_generation_limit: body.dailyGenerationLimit }
            : {}),
        })
        .eq("workspace_id", body.workspaceId)
        .eq("user_id", body.userId);
      if (error)
        throw new HttpError(
          422,
          "SettingsUpdateFailed",
          "Member policy could not be updated",
        );
    } else {
      const { error } = await supabase
        .from("workspace_model_spend_policies")
        .upsert(
          {
            workspace_id: body.workspaceId,
            model_capability_id: body.capabilityId,
            estimated_credit_reserve: body.estimatedCreditReserve,
            enabled: body.enabled,
            created_by: userId,
          },
          { onConflict: "workspace_id,model_capability_id" },
        );
      if (error)
        throw new HttpError(
          422,
          "SettingsUpdateFailed",
          "Model spending policy could not be updated",
        );
    }
    return Response.json(
      { updated: true },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
