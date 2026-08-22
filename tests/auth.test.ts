import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), redirect: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  AuthenticationError,
  AuthorizationError,
  canAdminister,
  canEdit,
  getAuthenticatedUser,
  requireApiUser,
  requireAuthenticatedUser,
} from "@/lib/auth";
import {
  requireProject,
  requireWorkspaceContext,
} from "@/server/auth/workspace";

function authClient(result: unknown) {
  return { auth: { getClaims: vi.fn().mockResolvedValue(result) } };
}

function queryClient(result: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return { client: { from: vi.fn().mockReturnValue(query) }, query };
}

describe("authentication and authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/login");
    });
  });

  it("returns only a validated authenticated subject", async () => {
    const client = authClient({
      data: { claims: { sub: "user-123" } },
      error: null,
    });
    mocks.createClient.mockResolvedValue(client);
    await expect(getAuthenticatedUser()).resolves.toEqual({
      supabase: client,
      userId: "user-123",
    });
    mocks.createClient.mockResolvedValue(
      authClient({ data: { claims: {} }, error: null }),
    );
    await expect(getAuthenticatedUser()).resolves.toBeNull();
    mocks.createClient.mockResolvedValue(
      authClient({ data: null, error: new Error("invalid") }),
    );
    await expect(requireApiUser()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("redirects page requests but denies API requests when unauthenticated", async () => {
    mocks.createClient.mockResolvedValue(
      authClient({ data: null, error: null }),
    );
    await expect(requireAuthenticatedUser()).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("implements the owner/admin/editor/viewer role boundaries", () => {
    expect(canAdminister("owner")).toBe(true);
    expect(canAdminister("admin")).toBe(true);
    expect(canAdminister("editor")).toBe(false);
    expect(canAdminister("viewer")).toBe(false);
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("admin")).toBe(true);
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
    expect(new AuthorizationError().status).toBe(403);
  });

  it("derives workspace access from the authenticated membership row", async () => {
    const editor = queryClient({
      data: { role: "editor", generation_allowed: true },
      error: null,
    });
    await expect(
      requireWorkspaceContext(
        editor.client as never,
        "actor",
        "workspace",
        "edit",
      ),
    ).resolves.toEqual({
      workspaceId: "workspace",
      userId: "actor",
      role: "editor",
      generationAllowed: true,
    });
    const viewer = queryClient({
      data: { role: "viewer", generation_allowed: false },
      error: null,
    });
    await expect(
      requireWorkspaceContext(
        viewer.client as never,
        "actor",
        "workspace",
        "edit",
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const missing = queryClient({ data: null, error: null });
    await expect(
      requireWorkspaceContext(missing.client as never, "actor", "workspace"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("requires a project inside the authorized workspace and applies archive filtering", async () => {
    const row = { id: "project", workspace_id: "workspace", name: "Project" };
    const available = queryClient({ data: row, error: null });
    await expect(
      requireProject(available.client as never, "workspace", "project"),
    ).resolves.toEqual(row);
    expect(available.query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(available.query.is).toHaveBeenCalledWith("archived_at", null);
    const denied = queryClient({ data: null, error: null });
    await expect(
      requireProject(denied.client as never, "workspace", "other", true),
    ).rejects.toThrow("Project is not available in this workspace");
  });
});
