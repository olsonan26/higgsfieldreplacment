import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { csvRow } from "@/lib/files";
import { apiError, correlationId, HttpError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspaceContext } from "@/server/auth/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = correlationId(request);
  try {
    const { supabase, userId } = await requireApiUser();
    const workspaceId = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("workspaceId"));
    await requireWorkspaceContext(supabase, userId, workspaceId, "admin");
    const { data, error } = await supabase
      .from("usage_ledger")
      .select(
        "id, batch_id, generation_id, actor_id, entry_kind, credits, authoritative, created_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .limit(10_000);
    if (error)
      throw new HttpError(
        500,
        "LedgerExportFailed",
        "Usage export could not be created",
      );
    let csv =
      "\uFEFF" +
      csvRow([
        "entry_id",
        "batch_id",
        "generation_id",
        "actor_id",
        "entry_kind",
        "credits",
        "status",
        "created_at",
      ]);
    for (const row of data)
      csv += csvRow([
        row.id,
        row.batch_id,
        row.generation_id,
        row.actor_id,
        row.entry_kind,
        row.credits,
        row.authoritative ? "recorded" : "estimated",
        row.created_at,
      ]);
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: userId,
      action: "ledger.exported",
      target_type: "workspace",
      target_id: workspaceId,
      correlation_id: requestId,
      metadata: { rowCount: data.length },
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="VesperFrame-usage-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
