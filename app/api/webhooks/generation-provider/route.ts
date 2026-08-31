import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, correlationId, HttpError } from "@/lib/http";
import { logEvent } from "@/lib/logging";
import { createAdminClient } from "@/lib/supabase/admin";
import { processProviderUpdate } from "@/server/generation/process-provider-update";
import {
  normalizeProviderTask,
  normalizeRunpodTask,
} from "@/server/providers/generation-provider/adapter";
import {
  readWebhookBody,
  verifyCallbackCorrelation,
  verifyProviderWebhookSignature,
} from "@/server/security/webhook";

export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({
  generation: z.string().uuid(),
  correlation: z.string().min(32).max(160),
  backend: z.enum(["runpod"]).optional(),
});

export async function POST(request: Request) {
  const requestId = correlationId(request);
  let eventId: string | null = null;
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
    const query = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const { raw, payload, bodyHash } = await readWebhookBody(request);
    const update =
      query.backend === "runpod"
        ? normalizeRunpodTask(payload)
        : normalizeProviderTask(payload);
    const signatureTimestamp = verifyProviderWebhookSignature(
      update.taskId,
      request,
    );
    const { data: generation, error } = await admin
      .from("generations")
      .select("id, workspace_id, provider_task_id, callback_token_hash")
      .eq("id", query.generation)
      .maybeSingle();
    if (error || !generation)
      throw new HttpError(
        401,
        "InvalidCallbackCorrelation",
        "Callback authentication failed",
      );
    verifyCallbackCorrelation(
      query.correlation,
      generation.callback_token_hash,
    );
    if (
      generation.provider_task_id &&
      generation.provider_task_id !== update.taskId
    )
      throw new HttpError(
        401,
        "TaskCorrelationMismatch",
        "Callback task correlation failed",
      );
    if (!generation.provider_task_id) {
      const { error: taskLinkError } = await admin
        .from("generations")
        .update({ provider_task_id: update.taskId })
        .eq("id", generation.id)
        .is("provider_task_id", null);
      if (taskLinkError)
        throw new HttpError(
          409,
          "TaskCorrelationConflict",
          "Callback task could not be correlated",
        );
    }
    const eventKey = createHash("sha256")
      .update(
        `${update.taskId}:${signatureTimestamp ?? "correlation-only"}:${bodyHash}`,
      )
      .digest("hex");
    const { data: event, error: eventError } = await admin
      .from("provider_webhook_events")
      .insert({
        workspace_id: generation.workspace_id,
        generation_id: generation.id,
        event_key: eventKey,
        body_hash: bodyHash,
        payload_summary: {
          taskIdHash: createHash("sha256").update(update.taskId).digest("hex"),
          state: update.state,
          resultCount: update.resultUrls.length,
          byteSize: Buffer.byteLength(raw),
        },
        state: "received",
      })
      .select("id")
      .maybeSingle();
    if (eventError?.code === "23505")
      return NextResponse.json(
        { accepted: true, duplicate: true },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    if (eventError || !event)
      throw new HttpError(
        500,
        "WebhookPersistenceFailed",
        "Callback could not be persisted",
      );
    eventId = event.id;
    await admin
      .from("provider_webhook_events")
      .update({ state: "processing" })
      .eq("id", eventId);
    const result = await processProviderUpdate(admin, update, "webhook");
    await admin
      .from("provider_webhook_events")
      .update({ state: "processed", processed_at: new Date().toISOString() })
      .eq("id", eventId);
    logEvent("info", "generation.webhook_processed", {
      correlationId: requestId,
      workspaceId: generation.workspace_id,
      generationId: generation.id,
      state: result.state,
    });
    return NextResponse.json(
      { accepted: true, duplicate: result.duplicate },
      {
        status: 200,
        headers: { "Cache-Control": "no-store", "x-request-id": requestId },
      },
    );
  } catch (error) {
    if (eventId && admin) {
      await admin
        .from("provider_webhook_events")
        .update({
          state: "failed",
          display_error_code:
            error instanceof HttpError
              ? error.code
              : "WEBHOOK_PROCESSING_FAILED",
        })
        .eq("id", eventId);
      return NextResponse.json(
        {
          error: "Callback processing will be retried",
          code: "WebhookRetry",
          correlationId: requestId,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return apiError(error, requestId);
  }
}
