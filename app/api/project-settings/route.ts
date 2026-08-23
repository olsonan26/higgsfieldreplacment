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
const referenceSchema = z
  .object({
    assetId: z.string().uuid(),
    role: z.string().min(1).max(80),
    groupId: z.string().max(120).optional(),
    label: z.string().max(160).optional(),
    description: z.string().max(1000).optional(),
    startMs: z.number().int().min(0).max(3_600_000).optional(),
    endMs: z.number().int().min(0).max(3_600_000).optional(),
    startSeconds: z.number().min(0).max(3600).optional(),
    endSeconds: z.number().min(0).max(3600).optional(),
    fileName: z.string().max(255).optional(),
  })
  .strict();
const settingsSchema = z
  .object({
    mediaKind: z.enum(["image", "video"]),
    capabilityKey: z.string().min(1).max(160),
    rawPrompt: z.string().max(20_000),
    creativeDirection: z.record(z.string(), z.unknown()),
    technicalSettings: z.record(z.string(), z.unknown()),
    references: z.array(referenceSchema).max(50),
    skillVersionIds: z.array(z.string().uuid()).max(20),
    batchCount: z.number().int().min(1).max(4),
  })
  .strict();
const saveSchema = querySchema.extend({ settings: settingsSchema }).strict();

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
      .from("project_settings")
      .select("version, settings, created_at")
      .eq("workspace_id", query.workspaceId)
      .eq("project_id", query.projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new HttpError(
        500,
        "ProjectSettingsReadFailed",
        "Project settings could not be loaded",
      );
    return NextResponse.json(
      { projectSettings: data },
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
    const body = saveSchema.parse(await readLimitedJson(request, 196_608));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    await requireProject(supabase, body.workspaceId, body.projectId, true);
    const { data, error } = await supabase.rpc("append_project_settings", {
      target_workspace_id: body.workspaceId,
      target_project_id: body.projectId,
      settings_value: body.settings as Json,
    });
    if (error || !data)
      throw new HttpError(
        422,
        "ProjectSettingsSaveFailed",
        "Project settings could not be saved",
      );
    return NextResponse.json(
      { projectSettings: data },
      { status: 201, headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
