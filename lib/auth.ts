import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error || typeof subject !== "string") return null;
  return { supabase, userId: subject };
}

export async function requireAuthenticatedUser() {
  const context = await getAuthenticatedUser();
  if (!context) redirect("/login");
  return context;
}

export async function requireApiUser() {
  const context = await getAuthenticatedUser();
  if (!context) throw new AuthenticationError();
  return context;
}

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor() {
    super("Authentication required");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;

  constructor(message = "You do not have permission for this action") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function canEdit(role: WorkspaceRole) {
  return role === "owner" || role === "admin" || role === "editor";
}

export function canAdminister(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}
