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

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ generationId: string }> },
) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { generationId } = await context.params;
    const { supabase, userId } = await requireApiUser();
    const body = z
      .object({
        workspaceId: z.string().uuid(),
        projectId: z.string().uuid(),
        archived: z.boolean(),
      })
      .strict()
      .parse(await readLimitedJson(request, 4096));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    const { data, error } = await supabase
      .from("generations")
      .update({ archived_at: body.archived ? new Date().toISOString() : null })
      .eq("workspace_id", body.workspaceId)
      .eq("project_id", body.projectId)
      .eq("id", generationId)
      .select("id, archived_at")
      .maybeSingle();
    if (error || !data)
      throw new HttpError(
        404,
        "GenerationNotFound",
        "Generation is unavailable",
      );
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      workspace_id: body.workspaceId,
      actor_id: userId,
      action: body.archived ? "generation.archived" : "generation.restored",
      target_type: "generation",
      target_id: generationId,
      correlation_id: requestId,
      metadata: {},
    });
    return Response.json(
      { generation: data },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
