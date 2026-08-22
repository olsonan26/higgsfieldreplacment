import { cookies } from "next/headers";

export const KIE_API_BASE = "https://api.kie.ai";
export const KIE_UPLOAD_BASE = "https://kieai.redpandaai.co";
export const KIE_COOKIE = "kie_session_key";

export type NormalizedTask = {
  taskId: string;
  model?: string;
  state: string;
  progress: number;
  resultUrls: string[];
  failure?: string;
  creditsConsumed?: number;
  createdAt?: number;
  completedAt?: number;
};

export function encodeKey(key: string) {
  return Buffer.from(key, "utf8").toString("base64url");
}

export function decodeKey(value: string) {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

export async function getKieKey() {
  const envKey = process.env.KIE_API_KEY?.trim();
  if (envKey) return { key: envKey, source: "server" as const };
  const store = await cookies();
  const cookieValue = store.get(KIE_COOKIE)?.value;
  const key = cookieValue ? decodeKey(cookieValue) : "";
  return key ? { key, source: "session" as const } : { key: "", source: "none" as const };
}

export async function kieRequest(path: string, key: string, init: RequestInit = {}, base = KIE_API_BASE) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({ msg: `Kie.ai returned HTTP ${response.status}` }));
  if (!response.ok || (typeof data?.code === "number" && data.code >= 400)) {
    const message = data?.msg || data?.message || data?.error || `Kie.ai request failed (${response.status})`;
    throw new Error(String(message));
  }
  return data;
}

function collectUrls(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) found.add(value);
    else if ((value.startsWith("{") || value.startsWith("[")) && value.length < 1_000_000) {
      try { collectUrls(JSON.parse(value), found); } catch { /* not JSON */ }
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, found));
    return found;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectUrls(item, found));
  }
  return found;
}

export function normalizeTask(payload: unknown): NormalizedTask {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const data = (body.data && typeof body.data === "object" ? body.data : body) as Record<string, unknown>;
  const rawState = String(data.state || data.status || data.successFlag || "waiting");
  const stateMap: Record<string, string> = {
    "0": "generating",
    "1": "success",
    "2": "fail",
    "3": "fail",
    PENDING: "waiting",
    GENERATING: "generating",
    SUCCESS: "success",
    FAILED: "fail",
    FAIL: "fail",
  };
  const state = stateMap[rawState.toUpperCase()] || rawState.toLowerCase();
  const progressValue = Number(data.progress ?? (state === "success" ? 100 : 0));
  const progress = Number.isFinite(progressValue) ? Math.max(0, Math.min(progressValue <= 1 ? progressValue * 100 : progressValue, 100)) : 0;
  const resultCandidate = data.resultJson ?? data.result ?? data.response ?? data.videoInfo ?? data;
  const resultUrls = [...collectUrls(resultCandidate)].filter((url) => !url.includes("callback"));
  return {
    taskId: String(data.taskId || data.task_id || ""),
    model: typeof data.model === "string" ? data.model : undefined,
    state,
    progress,
    resultUrls,
    failure: String(data.failMsg || data.errorMessage || data.error || "") || undefined,
    creditsConsumed: typeof data.creditsConsumed === "number" ? data.creditsConsumed : undefined,
    createdAt: typeof data.createTime === "number" ? data.createTime : undefined,
    completedAt: typeof data.completeTime === "number" ? data.completeTime : undefined,
  };
}

export function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected Kie.ai error";
}
