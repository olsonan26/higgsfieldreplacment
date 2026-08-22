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

export const runtime = "nodejs";

const patchSchema = z
  .object({
    workspaceId: z.string().uuid(),
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    archived: z.boolean().optional(),
    deleted: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) => Object.keys(body).length > 1,
    "At least one change is required",
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { projectId } = await context.params;
    const { supabase, userId } = await requireApiUser();
    const body = patchSchema.parse(await readLimitedJson(request, 16_384));
    await requireWorkspaceContext(
      supabase,
      userId,
      body.workspaceId,
      body.deleted !== undefined ? "admin" : "edit",
    );
    const changes = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.archived !== undefined
        ? { archived_at: body.archived ? new Date().toISOString() : null }
        : {}),
      ...(body.deleted !== undefined
        ? { deleted_at: body.deleted ? new Date().toISOString() : null }
        : {}),
    };
    const { data, error } = await supabase
      .from("projects")
      .update(changes)
      .eq("workspace_id", body.workspaceId)
      .eq("id", projectId)
      .select("id, name, description, archived_at, deleted_at, updated_at")
      .maybeSingle();
    if (error || !data)
      throw new HttpError(404, "ProjectNotFound", "Project is unavailable");
    return NextResponse.json(
      { project: data },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { projectId } = await context.params;
    const { supabase, userId } = await requireApiUser();
    const body = z
      .object({ workspaceId: z.string().uuid() })
      .strict()
      .parse(await readLimitedJson(request, 4096));
    const workspace = await requireWorkspaceContext(
      supabase,
      userId,
      body.workspaceId,
      "admin",
    );
    if (workspace.role !== "owner")
      throw new HttpError(
        403,
        "OwnerRequired",
        "Only a workspace owner may move a project to trash",
      );
    const { data, error } = await supabase
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("workspace_id", body.workspaceId)
      .eq("id", projectId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data)
      throw new HttpError(404, "ProjectNotFound", "Project is unavailable");
    return NextResponse.json(
      {
        deleted: true,
        recovery:
          "Project data is retained until the workspace retention window expires.",
      },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
