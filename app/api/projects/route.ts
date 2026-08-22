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

const workspaceQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  archived: z.enum(["true", "false"]).optional(),
});
const createSchema = z
  .object({
    workspaceId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).default(""),
  })
  .strict();

export async function GET(request: Request) {
  const requestId = correlationId(request);
  try {
    const { supabase, userId } = await requireApiUser();
    const query = workspaceQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    await requireWorkspaceContext(supabase, userId, query.workspaceId, "view");
    let projectsQuery = supabase
      .from("projects")
      .select("id, name, description, archived_at, created_at, updated_at")
      .eq("workspace_id", query.workspaceId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    projectsQuery =
      query.archived === "true"
        ? projectsQuery.not("archived_at", "is", null)
        : projectsQuery.is("archived_at", null);
    const { data, error } = await projectsQuery;
    if (error)
      throw new HttpError(
        500,
        "ProjectReadFailed",
        "Projects could not be loaded",
      );
    return NextResponse.json(
      { projects: data },
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
    const body = createSchema.parse(await readLimitedJson(request, 16_384));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    const { data, error } = await supabase
      .from("projects")
      .insert({
        workspace_id: body.workspaceId,
        name: body.name,
        description: body.description,
        created_by: userId,
      })
      .select("id, name, description, archived_at, created_at, updated_at")
      .single();
    if (error)
      throw new HttpError(
        422,
        "ProjectCreateFailed",
        "Project could not be created",
      );
    return NextResponse.json(
      { project: data },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", "x-request-id": requestId },
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
