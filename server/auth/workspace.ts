import "server-only";

import {
  AuthorizationError,
  canAdminister,
  canEdit,
  type WorkspaceRole,
} from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type WorkspaceContext = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  generationAllowed: boolean;
};

export async function requireWorkspaceContext(
  supabase: SupabaseServerClient,
  userId: string,
  workspaceId: string,
  permission: "view" | "edit" | "admin" = "view",
): Promise<WorkspaceContext> {
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("role, generation_allowed")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new AuthorizationError();
  if (permission === "edit" && !canEdit(data.role))
    throw new AuthorizationError();
  if (permission === "admin" && !canAdminister(data.role))
    throw new AuthorizationError();
  return {
    workspaceId,
    userId,
    role: data.role,
    generationAllowed: data.generation_allowed,
  };
}

export async function requireProject(
  supabase: SupabaseServerClient,
  workspaceId: string,
  projectId: string,
  includeArchived = false,
) {
  let query = supabase
    .from("projects")
    .select(
      "id, workspace_id, name, description, archived_at, deleted_at, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", projectId)
    .is("deleted_at", null);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.maybeSingle();
  if (error || !data)
    throw new AuthorizationError("Project is not available in this workspace");
  return data;
}
