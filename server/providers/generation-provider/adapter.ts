import "server-only";

import { z } from "zod";
import {
  getGenerationProviderEnvironment,
  getRunpodEnvironment,
} from "@/lib/env";

const RUNPOD_PREFIX = "runpod:";
const LTX_25_MODEL = "self-hosted/ltx-2.5-distilled";

const envelopeSchema = z
  .object({
    code: z.number().optional(),
    msg: z.string().optional(),
    message: z.string().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

const createDataSchema = z
  .object({ taskId: z.string().min(1).max(300) })
  .passthrough();

export type NormalizedProviderTask = {
  taskId: string;
  state: "waiting" | "queued" | "running" | "success" | "failed";
  progress: number;
  resultUrls: string[];
  safeError?: string;
  consumedCredits?: number;
  completedAt?: Date;
  storagePaths?: string[];
};

export class ProviderAdapterError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message = "Generation service request failed",
  ) {
    super(message);
    this.name = "ProviderAdapterError";
  }
}

async function providerRequest(path: string, init: RequestInit) {
  const environment = getGenerationProviderEnvironment();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(
      new URL(path, environment.GENERATION_PROVIDER_BASE_URL),
      {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${environment.GENERATION_PROVIDER_API_KEY}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      },
    );
    const raw = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ProviderAdapterError(
        "PROVIDER_INVALID_JSON",
        response.status >= 500,
      );
    }
    const envelope = envelopeSchema.safeParse(parsed);
    if (
      !response.ok ||
      !envelope.success ||
      (envelope.data.code !== undefined && envelope.data.code >= 400)
    ) {
      throw new ProviderAdapterError(
        `PROVIDER_HTTP_${response.status}`,
        response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }
    return envelope.data;
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ProviderAdapterError("PROVIDER_TIMEOUT", true);
    throw new ProviderAdapterError("PROVIDER_NETWORK", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function runpodRequest(path: string, init: RequestInit) {
  const environment = getRunpodEnvironment();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(
      `${environment.RUNPOD_API_BASE_URL.replace(/\/$/, "")}/${environment.RUNPOD_ENDPOINT_ID}${path}`,
      {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${environment.RUNPOD_API_KEY}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      },
    );
    const raw = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ProviderAdapterError(
        "RUNPOD_INVALID_JSON",
        response.status >= 500,
      );
    }
    if (!response.ok)
      throw new ProviderAdapterError(
        `RUNPOD_HTTP_${response.status}`,
        response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      );
    return parsed;
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ProviderAdapterError("RUNPOD_TIMEOUT", true);
    throw new ProviderAdapterError("RUNPOD_NETWORK", true);
  } finally {
    clearTimeout(timeout);
  }
}

export async function createProviderTask(payload: {
  model: string;
  input: Record<string, unknown>;
  callbackUrl: string;
}) {
  if (payload.model === LTX_25_MODEL) {
    const callbackUrl = new URL(payload.callbackUrl);
    callbackUrl.searchParams.set("backend", "runpod");
    const response = await runpodRequest("/run", {
      method: "POST",
      body: JSON.stringify({
        input: payload.input,
        webhook: callbackUrl.toString(),
      }),
    });
    const parsed = z
      .object({ id: z.string().min(1).max(300) })
      .safeParse(response);
    if (!parsed.success)
      throw new ProviderAdapterError("RUNPOD_MISSING_TASK_ID", false);
    return { taskId: `${RUNPOD_PREFIX}${parsed.data.id}` };
  }
  const envelope = await providerRequest("/api/v1/jobs/createTask", {
    method: "POST",
    body: JSON.stringify({
      model: payload.model,
      input: payload.input,
      callBackUrl: payload.callbackUrl,
    }),
  });
  const data = createDataSchema.safeParse(envelope.data);
  if (!data.success)
    throw new ProviderAdapterError("PROVIDER_MISSING_TASK_ID", false);
  return { taskId: data.data.taskId };
}

export function normalizeRunpodTask(payload: unknown): NormalizedProviderTask {
  const parsed = z
    .object({
      id: z.string().min(1).max(300),
      status: z.string().min(1).max(80),
      output: z.unknown().optional(),
      error: z.unknown().optional(),
      executionTime: z.number().nonnegative().optional(),
    })
    .passthrough()
    .parse(payload);
  const stateMap: Record<string, NormalizedProviderTask["state"]> = {
    IN_QUEUE: "queued",
    IN_PROGRESS: "running",
    COMPLETED: "success",
    FAILED: "failed",
    CANCELLED: "failed",
    TIMED_OUT: "failed",
  };
  const state = stateMap[parsed.status.toUpperCase()] || "waiting";
  const output =
    parsed.output && typeof parsed.output === "object"
      ? (parsed.output as Record<string, unknown>)
      : {};
  const storagePaths = Array.isArray(output.storagePaths)
    ? output.storagePaths.filter(
        (item): item is string =>
          typeof item === "string" && /^[A-Za-z0-9._/-]{3,600}$/.test(item),
      )
    : [];
  return {
    taskId: `${RUNPOD_PREFIX}${parsed.id}`,
    state,
    progress: state === "success" ? 100 : state === "running" ? 50 : 0,
    resultUrls: [],
    storagePaths,
    ...(state === "failed"
      ? {
          safeError:
            "The private video worker could not complete this request.",
        }
      : {}),
  };
}

function collectHttpsUrls(
  value: unknown,
  found = new Set<string>(),
): Set<string> {
  if (typeof value === "string") {
    if (value.startsWith("https://")) found.add(value);
    else if (
      (value.startsWith("{") || value.startsWith("[")) &&
      value.length <= 1_000_000
    ) {
      try {
        collectHttpsUrls(JSON.parse(value), found);
      } catch {
        /* Not embedded JSON. */
      }
    }
  } else if (Array.isArray(value))
    value.forEach((item) => collectHttpsUrls(item, found));
  else if (value && typeof value === "object")
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectHttpsUrls(item, found),
    );
  return found;
}

export function normalizeProviderTask(
  payload: unknown,
): NormalizedProviderTask {
  const envelope = envelopeSchema.parse(payload);
  const data = (
    envelope.data && typeof envelope.data === "object" ? envelope.data : {}
  ) as Record<string, unknown>;
  const taskId = String(data.taskId || data.task_id || "");
  if (!taskId)
    throw new ProviderAdapterError("PROVIDER_MISSING_TASK_ID", false);
  const rawState = String(
    data.state || data.status || data.successFlag || "waiting",
  ).toUpperCase();
  const stateMap: Record<string, NormalizedProviderTask["state"]> = {
    "0": "running",
    "1": "success",
    "2": "failed",
    "3": "failed",
    PENDING: "waiting",
    WAITING: "waiting",
    QUEUING: "queued",
    QUEUED: "queued",
    GENERATING: "running",
    RUNNING: "running",
    SUCCESS: "success",
    FAILED: "failed",
    FAIL: "failed",
  };
  const state = stateMap[rawState] || "waiting";
  const rawProgress = Number(data.progress ?? (state === "success" ? 100 : 0));
  const progress = Number.isFinite(rawProgress)
    ? Math.max(
        0,
        Math.min(rawProgress <= 1 ? rawProgress * 100 : rawProgress, 100),
      )
    : 0;
  const credits = Number(data.creditsConsumed ?? data.consumedCredits);
  const completed = Number(data.completeTime ?? data.completedAt);
  return {
    taskId,
    state,
    progress,
    resultUrls: [
      ...collectHttpsUrls(
        data.resultJson ?? data.result ?? data.response ?? data.videoInfo ?? {},
      ),
    ],
    ...(state === "failed"
      ? { safeError: "The generation service could not complete this request." }
      : {}),
    ...(Number.isFinite(credits) && credits >= 0
      ? { consumedCredits: credits }
      : {}),
    ...(Number.isFinite(completed) && completed > 0
      ? {
          completedAt: new Date(
            completed > 10_000_000_000 ? completed : completed * 1000,
          ),
        }
      : {}),
  };
}

export async function getProviderTask(taskId: string) {
  if (!/^[A-Za-z0-9._:-]{3,300}$/.test(taskId))
    throw new ProviderAdapterError("PROVIDER_INVALID_TASK_ID", false);
  if (taskId.startsWith(RUNPOD_PREFIX)) {
    const remoteId = taskId.slice(RUNPOD_PREFIX.length);
    if (!/^[A-Za-z0-9._-]{3,300}$/.test(remoteId))
      throw new ProviderAdapterError("RUNPOD_INVALID_TASK_ID", false);
    return normalizeRunpodTask(
      await runpodRequest(`/status/${encodeURIComponent(remoteId)}`, {
        method: "GET",
      }),
    );
  }
  const envelope = await providerRequest(
    `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { method: "GET" },
  );
  return normalizeProviderTask(envelope);
}
