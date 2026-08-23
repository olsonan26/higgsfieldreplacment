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
export type StudioProjectDraft = {
  mediaKind: "image" | "video";
  capabilityKey: string;
  rawPrompt: string;
  creativeDirection: Record<string, unknown>;
  technicalSettings: Record<string, unknown>;
  references: Array<{
    assetId: string;
    role: string;
    groupId?: string;
    label?: string;
    description?: string;
    startMs?: number;
    endMs?: number;
    startSeconds?: number;
    endSeconds?: number;
    fileName?: string;
  }>;
  skillVersionIds: string[];
  batchCount: number;
};
export type StudioInitialData = {
  user: { id: string; displayName: string };
  deploymentReady: boolean;
  workspaces: StudioWorkspace[];
  activeWorkspace: StudioWorkspace;
  projects: StudioProject[];
  activeProject: StudioProject | null;
  projectSettings: {
    version: number;
    settings: Record<string, unknown>;
  } | null;
  capabilities: PublicCapability[];
};

export type StudioView =
  | "studio"
  | "explore"
  | "assets"
  | "audio"
  | "layers"
  | "prompts"
  | "queue"
  | "favorites"
  | "ledger"
  | "settings";

export type PromptVersion = {
  id: string;
  version: number;
  raw_prompt: string;
  compiled_prompt: string;
  creative_direction: Record<string, unknown>;
  technical_settings: Record<string, unknown>;
  restored_from_id: string | null;
  created_at: string;
  capability: {
    app_model_key: string;
    display_name: string;
    media_kind: "image" | "video";
    version: number;
  } | null;
};
