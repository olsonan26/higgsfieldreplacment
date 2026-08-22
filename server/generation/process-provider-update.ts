import "server-only";

import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/http";
import { ingestGenerationOutputs } from "@/server/assets/ingest-output";
import type { NormalizedProviderTask } from "@/server/providers/generation-provider/adapter";

type AdminClient = ReturnType<typeof createAdminClient>;

async function recordAuthoritativeUsage(
  admin: AdminClient,
  generation: {
    id: string;
    workspace_id: string;
    batch_id: string;
    created_by: string;
    estimated_credits: number;
  },
  credits: number | undefined,
  taskId: string,
) {
  if (credits === undefined) return;
  const externalHash = createHash("sha256")
    .update(`${taskId}:${credits}`)
    .digest("hex");
  await admin
    .from("usage_ledger")
    .insert({
      workspace_id: generation.workspace_id,
      batch_id: generation.batch_id,
      generation_id: generation.id,
      actor_id: generation.created_by,
      entry_kind: "usage_recorded",
      credits,
      authoritative: true,
      external_record_hash: externalHash,
      metadata: { source: "provider_receipt" },
    })
    .then(({ error }) => {
      if (error && error.code !== "23505")
        throw new HttpError(
          500,
          "UsageLedgerFailed",
          "Usage receipt could not be recorded",
        );
    });
  await admin
    .from("usage_ledger")
    .insert({
      workspace_id: generation.workspace_id,
      batch_id: generation.batch_id,
      generation_id: generation.id,
      actor_id: generation.created_by,
      entry_kind: "estimate_released",
      credits: generation.estimated_credits,
      authoritative: false,
      metadata: { reason: "authoritative_usage_recorded" },
    })
    .then(({ error }) => {
      if (error && error.code !== "23505")
        throw new HttpError(
          500,
          "UsageLedgerFailed",
          "Usage estimate could not be released",
        );
    });
}

async function updateBatchTerminalState(admin: AdminClient, batchId: string) {
  const { data } = await admin
    .from("generations")
    .select("state")
    .eq("batch_id", batchId);
  if (!data?.length) return;
  const terminal = new Set(["succeeded", "failed", "cancelled", "timed_out"]);
  if (!data.every((row) => terminal.has(row.state))) return;
  const succeeded = data.filter((row) => row.state === "succeeded").length;
  await admin
    .from("generation_batches")
    .update({
      state:
        succeeded === data.length
          ? "completed"
          : succeeded > 0
            ? "partial"
            : "failed",
    })
    .eq("id", batchId);
}

export async function processProviderUpdate(
  admin: AdminClient,
  update: NormalizedProviderTask,
  source: "webhook" | "reconciliation",
) {
  const { data: generation, error } = await admin
    .from("generations")
    .select(
      "id, batch_id, workspace_id, project_id, created_by, provider_task_id, state, estimated_credits, recorded_credits",
    )
    .eq("provider_task_id", update.taskId)
    .maybeSingle();
  if (error || !generation)
    throw new HttpError(
      404,
      "GenerationNotFound",
      "Generation callback correlation was not found",
    );
  if (["succeeded", "cancelled"].includes(generation.state))
    return { state: generation.state, duplicate: true };

  const now = new Date();
  if (
    update.state === "waiting" ||
    update.state === "queued" ||
    update.state === "running"
  ) {
    const state = update.state === "running" ? "running" : "queued";
    await admin
      .from("generations")
      .update({
        state,
        progress: Math.min(update.progress, 99),
        last_reconciled_at:
          source === "reconciliation" ? now.toISOString() : undefined,
        next_reconcile_at: new Date(now.getTime() + 30_000).toISOString(),
      })
      .eq("id", generation.id);
    return { state, duplicate: false };
  }

  if (update.state === "failed") {
    await recordAuthoritativeUsage(
      admin,
      generation,
      update.consumedCredits,
      update.taskId,
    );
    await admin
      .from("generations")
      .update({
        state: "failed",
        progress: update.progress,
        recorded_credits: update.consumedCredits,
        display_error_code: "GENERATION_FAILED",
        display_error_message:
          update.safeError ||
          "The generation service could not complete this request.",
        completed_at: (update.completedAt || now).toISOString(),
        next_reconcile_at: null,
        provider_result_metadata: {
          resultCount: 0,
          receiptStatus:
            update.consumedCredits === undefined ? "estimated" : "recorded",
        },
      })
      .eq("id", generation.id);
    await updateBatchTerminalState(admin, generation.batch_id);
    return { state: "failed", duplicate: false };
  }

  await admin
    .from("generations")
    .update({
      state: "ingesting",
      progress: 99,
      next_reconcile_at: new Date(now.getTime() + 60_000).toISOString(),
    })
    .eq("id", generation.id);
  try {
    const ingested = await ingestGenerationOutputs(
      admin,
      generation,
      update.resultUrls,
    );
    await recordAuthoritativeUsage(
      admin,
      generation,
      update.consumedCredits,
      update.taskId,
    );
    await admin
      .from("generations")
      .update({
        state: "succeeded",
        progress: 100,
        recorded_credits: update.consumedCredits,
        completed_at: (update.completedAt || now).toISOString(),
        next_reconcile_at: null,
        display_error_code: null,
        display_error_message: null,
        provider_result_metadata: {
          resultCount: ingested.outputCount,
          assetIds: ingested.assets,
          receiptStatus:
            update.consumedCredits === undefined ? "estimated" : "recorded",
        },
      })
      .eq("id", generation.id);
    await admin.from("audit_logs").insert({
      workspace_id: generation.workspace_id,
      actor_id: generation.created_by,
      action: "generation.outputs_ingested",
      target_type: "generation",
      target_id: generation.id,
      metadata: { outputCount: ingested.outputCount },
    });
    await updateBatchTerminalState(admin, generation.batch_id);
    return { state: "succeeded", duplicate: ingested.alreadyIngested };
  } catch (ingestionError) {
    await admin
      .from("generations")
      .update({
        state: "ingesting",
        display_error_code:
          ingestionError instanceof HttpError
            ? ingestionError.code
            : "OUTPUT_INGESTION_FAILED",
        display_error_message:
          "The result is complete but durable private storage ingestion must be retried.",
        next_reconcile_at: new Date(now.getTime() + 60_000).toISOString(),
      })
      .eq("id", generation.id);
    throw ingestionError;
  }
}
