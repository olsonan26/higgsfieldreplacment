import "server-only";

import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import {
  getGenerationProviderEnvironment,
  getPersistenceEnvironment,
  getPublicEnvironment,
} from "@/lib/env";
import { HttpError } from "@/lib/http";
import { logEvent } from "@/lib/logging";
import type { GenerationSubmission } from "@/lib/generation/request-schema";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { stableStringify } from "@/server/generation/compiler";
import { resolveGenerationDraft } from "@/server/generation/resolve-draft";
import {
  createProviderTask,
  ProviderAdapterError,
} from "@/server/providers/generation-provider/adapter";
import type { Database, Json } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AssetRole = Database["public"]["Enums"]["asset_role"];

const reservationSchema = z.object({
  batchId: z.string().uuid(),
  generations: z.array(
    z.object({
      id: z.string().uuid(),
      ordinal: z.number().int(),
      state: z.string(),
    }),
  ),
  replayed: z.boolean(),
});

function callbackToken(
  workspaceId: string,
  userId: string,
  idempotencyKey: string,
  ordinal: number,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(`callback:${workspaceId}:${userId}:${idempotencyKey}:${ordinal}`)
    .digest("base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function inputAssetRole(role: string): AssetRole {
  if (
    role === "first_frame" ||
    role === "last_frame" ||
    role === "reference_image" ||
    role === "reference_video" ||
    role === "reference_audio" ||
    role === "character"
  )
    return role;
  return "element";
}

export async function submitGenerationBatch(
  supabase: SupabaseServerClient,
  userId: string,
  submission: GenerationSubmission,
  correlationId: string,
) {
  // Parse every required server credential before any database reservation or spend.
  getPersistenceEnvironment();
  const providerEnvironment = getGenerationProviderEnvironment();
  const publicEnvironment = getPublicEnvironment();
  const admin = createAdminClient();
  const { capabilityRow, capability, references, compiled } =
    await resolveGenerationDraft(supabase, submission);

  const batchRequestHash = createHash("sha256")
    .update(
      stableStringify({
        workspaceId: submission.workspaceId,
        projectId: submission.projectId,
        actorId: userId,
        idempotencyKey: submission.idempotencyKey,
        compiledRequestHash: compiled.requestHash,
        batchCount: submission.batchCount,
        references: compiled.referenceSummary,
        skills: compiled.skillSummary,
      }),
    )
    .digest("hex");

  const items: Json[] = Array.from(
    { length: submission.batchCount },
    (_, ordinal) => {
      const token = callbackToken(
        submission.workspaceId,
        userId,
        submission.idempotencyKey,
        ordinal,
        providerEnvironment.GENERATION_PROVIDER_WEBHOOK_HMAC_KEY,
      );
      return {
        modelCapabilityId: capabilityRow.id,
        capabilityVersion: capability.version,
        rawPrompt: compiled.rawPrompt,
        compiledPrompt: compiled.compiledPrompt,
        settingsSnapshot: {
          technicalSettings: submission.technicalSettings as Json,
          effectiveSettings: compiled.effectiveSettings as Json,
          creativeDirection: submission.creativeDirection as Json,
          references: submission.references.map(
            ({ assetId, role, groupId }) => ({
              assetId,
              role,
              ...(groupId ? { groupId } : {}),
            }),
          ),
          skills: compiled.skillSummary.map((skill) => ({
            versionId: skill.versionId,
            contentSha256: skill.contentSha256,
          })),
          ordinal,
        },
        capabilitySnapshot: capability as unknown as Json,
        sanitizedRequestSnapshot:
          compiled.sanitizedRequestPreview as unknown as Json,
        requestHash: compiled.requestHash,
        callbackTokenHash: tokenHash(token),
      };
    },
  );

  const { data: reserved, error: reserveError } = await supabase.rpc(
    "reserve_generation_batch",
    {
      target_workspace_id: submission.workspaceId,
      target_project_id: submission.projectId,
      idempotency_key_value: submission.idempotencyKey,
      request_hash_value: batchRequestHash,
      items,
    },
  );
  if (reserveError) {
    const safeMessage = reserveError.message.includes("spending policy")
      ? "This model is not enabled for workspace spending"
      : reserveError.message.includes("limit")
        ? "A workspace quota, rate, spending, or concurrency limit was reached"
        : "The generation batch could not be reserved";
    throw new HttpError(409, "GenerationReservationDenied", safeMessage);
  }
  const reservation = reservationSchema.parse(reserved);
  const generationIds = reservation.generations
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((item) => item.id);
  const { data: currentRows, error: stateError } = await admin
    .from("generations")
    .select("id, ordinal, state, provider_task_id")
    .eq("workspace_id", submission.workspaceId)
    .in("id", generationIds);
  if (stateError || currentRows.length !== generationIds.length)
    throw new HttpError(
      500,
      "GenerationStateUnavailable",
      "Reserved generation state could not be loaded",
    );
  const currentById = new Map(currentRows.map((row) => [row.id, row]));

  await admin
    .from("generation_batches")
    .update({ state: "submitting" })
    .eq("id", reservation.batchId);
  const outcomes: Array<{
    id: string;
    ordinal: number;
    state: string;
    taskId?: string;
    errorCode?: string;
  }> = [];
  let acceptedCount = 0;

  for (const generation of reservation.generations.sort(
    (a, b) => a.ordinal - b.ordinal,
  )) {
    const current = currentById.get(generation.id)!;
    if (current.provider_task_id || !["reserved"].includes(current.state)) {
      outcomes.push({
        id: current.id,
        ordinal: current.ordinal,
        state: current.state,
        ...(current.provider_task_id
          ? { taskId: current.provider_task_id }
          : {}),
      });
      if (current.provider_task_id) acceptedCount += 1;
      continue;
    }

    try {
      if (references.length) {
        const links = references.map((reference, index) => ({
          generation_id: generation.id,
          asset_id: reference.assetId,
          workspace_id: submission.workspaceId,
          direction: "input" as const,
          role: inputAssetRole(reference.role),
          sort_order: index,
        }));
        const { error: linkError } = await admin
          .from("generation_assets")
          .upsert(links, {
            onConflict: "generation_id,asset_id,direction,role",
            ignoreDuplicates: true,
          });
        if (linkError)
          throw new HttpError(
            500,
            "GenerationInputPersistenceFailed",
            "Generation inputs could not be persisted",
          );
      }
      await admin
        .from("generations")
        .update({
          state: "submitting",
          progress: 0,
          next_reconcile_at: new Date(Date.now() + 120_000).toISOString(),
        })
        .eq("id", generation.id)
        .eq("state", "reserved");
      const token = callbackToken(
        submission.workspaceId,
        userId,
        submission.idempotencyKey,
        generation.ordinal,
        providerEnvironment.GENERATION_PROVIDER_WEBHOOK_HMAC_KEY,
      );
      const callbackUrl = new URL(
        "/api/webhooks/generation-provider",
        publicEnvironment.NEXT_PUBLIC_APP_URL,
      );
      callbackUrl.searchParams.set("generation", generation.id);
      callbackUrl.searchParams.set("correlation", token);
      const provider = await createProviderTask({
        model: compiled.providerPayload.model,
        input: compiled.providerPayload.input,
        callbackUrl: callbackUrl.toString(),
      });
      const now = new Date();
      const { error: updateError } = await admin
        .from("generations")
        .update({
          provider_task_id: provider.taskId,
          state: "submitted",
          submitted_at: now.toISOString(),
          next_reconcile_at: new Date(now.getTime() + 15_000).toISOString(),
        })
        .eq("id", generation.id)
        .is("provider_task_id", null);
      if (updateError)
        throw new HttpError(
          500,
          "GenerationSubmissionPersistenceFailed",
          "Accepted task could not be persisted",
        );
      acceptedCount += 1;
      outcomes.push({
        id: generation.id,
        ordinal: generation.ordinal,
        state: "submitted",
        taskId: provider.taskId,
      });
      logEvent("info", "generation.submitted", {
        correlationId,
        workspaceId: submission.workspaceId,
        actorId: userId,
        batchId: reservation.batchId,
        generationId: generation.id,
        modelKey: capability.appModelKey,
      });
    } catch (error) {
      const errorCode =
        error instanceof ProviderAdapterError
          ? error.code
          : error instanceof HttpError
            ? error.code
            : "SUBMISSION_FAILED";
      const ambiguous =
        error instanceof ProviderAdapterError &&
        (error.retryable || error.code === "PROVIDER_MISSING_TASK_ID");
      await admin
        .from("generations")
        .update({
          state: "failed",
          display_error_code: ambiguous
            ? "PROVIDER_SUBMISSION_UNCERTAIN"
            : errorCode,
          display_error_message: ambiguous
            ? "Submission outcome is uncertain. VesperFrame will not retry automatically because that could duplicate spend."
            : "This item could not be submitted.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation.id)
        .is("provider_task_id", null);
      if (
        !ambiguous &&
        error instanceof ProviderAdapterError &&
        /^PROVIDER_HTTP_4/.test(error.code)
      ) {
        const estimate = await admin
          .from("generations")
          .select("estimated_credits")
          .eq("id", generation.id)
          .single();
        if (estimate.data)
          await admin.from("usage_ledger").insert({
            workspace_id: submission.workspaceId,
            batch_id: reservation.batchId,
            generation_id: generation.id,
            actor_id: userId,
            entry_kind: "estimate_released",
            credits: estimate.data.estimated_credits,
            authoritative: false,
            metadata: { reason: "provider_rejected_before_acceptance" },
          });
      }
      outcomes.push({
        id: generation.id,
        ordinal: generation.ordinal,
        state: "failed",
        errorCode: ambiguous ? "PROVIDER_SUBMISSION_UNCERTAIN" : errorCode,
      });
      logEvent("error", "generation.submission_failed", {
        correlationId,
        workspaceId: submission.workspaceId,
        actorId: userId,
        batchId: reservation.batchId,
        generationId: generation.id,
        modelKey: capability.appModelKey,
        code: errorCode,
      });
    }
  }

  const failedCount = outcomes.filter(
    (outcome) => outcome.state === "failed",
  ).length;
  const batchState =
    acceptedCount > 0 && failedCount > 0
      ? "partial"
      : acceptedCount > 0
        ? "submitted"
        : "failed";
  await admin
    .from("generation_batches")
    .update({ state: batchState })
    .eq("id", reservation.batchId);
  await admin.from("audit_logs").insert({
    workspace_id: submission.workspaceId,
    actor_id: userId,
    action: "generation.batch_submitted",
    target_type: "generation_batch",
    target_id: reservation.batchId,
    correlation_id: correlationId,
    metadata: { acceptedCount, failedCount, replayed: reservation.replayed },
  });
  return {
    batchId: reservation.batchId,
    replayed: reservation.replayed,
    state: batchState,
    generations: outcomes,
  };
}
