import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/logging";
import { processProviderUpdate } from "@/server/generation/process-provider-update";
import { getProviderTask } from "@/server/providers/generation-provider/adapter";

const DEFAULT_MAX_ATTEMPTS = 12;
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const PRIVATE_GPU_MAX_ATTEMPTS = 20;
const PRIVATE_GPU_TIMEOUT_MS = 75 * 60_000;

function nextDelay(attempt: number) {
  const base = Math.min(15_000 * 2 ** Math.max(0, attempt), 300_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

export async function reconcileDueGenerations(
  options: { limit?: number; workspaceId?: string; projectId?: string } = {},
) {
  const admin = createAdminClient();
  const now = new Date();
  let query = admin
    .from("generations")
    .select(
      "id, workspace_id, provider_task_id, state, reconciliation_attempts, submitted_at, created_at",
    )
    .in("state", ["submitting", "submitted", "queued", "running", "ingesting"])
    .lte("next_reconcile_at", now.toISOString())
    .order("next_reconcile_at", { ascending: true });
  if (options.workspaceId)
    query = query.eq("workspace_id", options.workspaceId);
  if (options.projectId) query = query.eq("project_id", options.projectId);
  const { data: rows, error } = await query.limit(
    Math.min(Math.max(options.limit || 20, 1), 50),
  );
  if (error) throw new Error("Reconciliation queue could not be loaded");
  const outcomes: Array<{ id: string; state: string }> = [];
  for (const row of rows) {
    const age =
      now.getTime() - new Date(row.submitted_at || row.created_at).getTime();
    if (!row.provider_task_id) {
      if (row.state === "submitting" && age > 120_000) {
        await admin
          .from("generations")
          .update({
            state: "failed",
            display_error_code: "PROVIDER_SUBMISSION_UNCERTAIN",
            display_error_message:
              "Submission was interrupted before a task identifier was durably confirmed; automatic retry is disabled to prevent duplicate spend.",
            completed_at: now.toISOString(),
            next_reconcile_at: null,
          })
          .eq("id", row.id);
        outcomes.push({ id: row.id, state: "failed" });
      }
      continue;
    }
    const privateGpuTask = row.provider_task_id.startsWith("runpod:");
    const maximumAttempts = privateGpuTask
      ? PRIVATE_GPU_MAX_ATTEMPTS
      : DEFAULT_MAX_ATTEMPTS;
    const timeoutMs = privateGpuTask
      ? PRIVATE_GPU_TIMEOUT_MS
      : DEFAULT_TIMEOUT_MS;
    if (row.reconciliation_attempts >= maximumAttempts || age > timeoutMs) {
      await admin
        .from("generations")
        .update({
          state: "timed_out",
          display_error_code: "GENERATION_TIMEOUT",
          display_error_message:
            "The task exceeded the bounded server reconciliation window. A later authenticated callback can still recover it.",
          completed_at: now.toISOString(),
          next_reconcile_at: null,
        })
        .eq("id", row.id);
      outcomes.push({ id: row.id, state: "timed_out" });
      continue;
    }
    try {
      const update = await getProviderTask(row.provider_task_id);
      const result = await processProviderUpdate(
        admin,
        update,
        "reconciliation",
      );
      await admin
        .from("generations")
        .update({
          reconciliation_attempts: row.reconciliation_attempts + 1,
          last_reconciled_at: now.toISOString(),
        })
        .eq("id", row.id);
      outcomes.push({ id: row.id, state: result.state });
    } catch {
      const attempt = row.reconciliation_attempts + 1;
      await admin
        .from("generations")
        .update({
          reconciliation_attempts: attempt,
          last_reconciled_at: now.toISOString(),
          next_reconcile_at: new Date(
            now.getTime() + nextDelay(attempt),
          ).toISOString(),
        })
        .eq("id", row.id);
      outcomes.push({ id: row.id, state: "retry_scheduled" });
      logEvent("warn", "generation.reconciliation_retry", {
        workspaceId: row.workspace_id,
        generationId: row.id,
        count: attempt,
      });
    }
  }
  return { checked: rows.length, outcomes };
}
