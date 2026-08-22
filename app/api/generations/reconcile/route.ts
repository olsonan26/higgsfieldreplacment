import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import {
  apiError,
  correlationId,
  HttpError,
  readLimitedJson,
} from "@/lib/http";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceContext } from "@/server/auth/workspace";
import { reconcileDueGenerations } from "@/server/generation/reconcile";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z
  .object({ workspaceId: z.string().uuid(), projectId: z.string().uuid() })
  .strict();

export async function POST(request: Request) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { supabase, userId } = await requireApiUser();
    const body = schema.parse(await readLimitedJson(request, 4096));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    const admin = createAdminClient();
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", body.workspaceId)
      .eq("actor_id", userId)
      .eq("action", "generation.manual_reconcile")
      .gte("created_at", oneMinuteAgo);
    if ((count || 0) >= 3)
      throw new HttpError(
        429,
        "ReconcileRateLimited",
        "Refresh reconciliation is temporarily rate limited",
      );
    await admin.from("audit_logs").insert({
      workspace_id: body.workspaceId,
      actor_id: userId,
      action: "generation.manual_reconcile",
      target_type: "project",
      target_id: body.projectId,
      correlation_id: requestId,
      metadata: {},
    });
    const result = await reconcileDueGenerations({
      limit: 10,
      workspaceId: body.workspaceId,
      projectId: body.projectId,
    });
    return Response.json(
      { ok: true, checked: result.checked },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
