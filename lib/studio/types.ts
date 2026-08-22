import type { ModelCapability } from "@/lib/generation/capability";

export type PublicCapability = Omit<
  ModelCapability,
  "providerModelId" | "adapter"
>;
export type StudioWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "editor" | "viewer";
  generationAllowed: boolean;
};
export type StudioProject = {
  id: string;
  name: string;
  description: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type StudioInitialData = {
  user: { id: string; displayName: string };
  workspaces: StudioWorkspace[];
  activeWorkspace: StudioWorkspace;
  projects: StudioProject[];
  activeProject: StudioProject | null;
  capabilities: PublicCapability[];
};

export type StudioView =
  | "studio"
  | "assets"
  | "queue"
  | "favorites"
  | "ledger"
  | "settings";
