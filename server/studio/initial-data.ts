import "server-only";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getOptionalServerReadiness } from "@/lib/env";
import {
  MODEL_CAPABILITIES,
  publicCapability,
} from "@/server/providers/generation-provider/capabilities";

export async function loadStudioInitialData(
  requestedWorkspaceId?: string,
  requestedProjectId?: string,
) {
  const deploymentReady = Object.values(getOptionalServerReadiness()).every(
    Boolean,
  );
  const { supabase, userId } = await requireAuthenticatedUser();
  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("workspace_id, role, generation_allowed")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (membershipError || !memberships.length)
    redirect("/login?error=workspace");
  const workspaceIds = memberships.map((membership) => membership.workspace_id);
  const { data: workspaceRows } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .in("id", workspaceIds);
  const workspaceMap = new Map(
    (workspaceRows || []).map((workspace) => [workspace.id, workspace]),
  );
  const workspaces = memberships
    .map((membership) => ({
      ...workspaceMap.get(membership.workspace_id)!,
      role: membership.role,
      generationAllowed: membership.generation_allowed,
    }))
    .filter((workspace) => workspace.id);
  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === requestedWorkspaceId) ||
    workspaces[0];
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, description, archived_at, created_at, updated_at")
    .eq("workspace_id", selectedWorkspace.id)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const selectedProject =
    (projects || []).find((project) => project.id === requestedProjectId) ||
    projects?.[0] ||
    null;
  const { data: projectSettings } = selectedProject
    ? await supabase
        .from("project_settings")
        .select("version, settings")
        .eq("workspace_id", selectedWorkspace.id)
        .eq("project_id", selectedProject.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_path")
    .eq("id", userId)
    .maybeSingle();
  return {
    user: {
      id: userId,
      displayName: profile?.display_name || "VesperFrame creator",
    },
    deploymentReady,
    workspaces,
    activeWorkspace: selectedWorkspace,
    projects: projects || [],
    activeProject: selectedProject,
    projectSettings: projectSettings
      ? {
          version: projectSettings.version,
          settings: projectSettings.settings as Record<string, unknown>,
        }
      : null,
    capabilities: MODEL_CAPABILITIES.map(publicCapability),
  };
}
