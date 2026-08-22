import "server-only";

type Level = "debug" | "info" | "warn" | "error";
type SafeLogFields = {
  correlationId?: string;
  workspaceId?: string;
  actorId?: string;
  projectId?: string;
  batchId?: string;
  generationId?: string;
  modelKey?: string;
  state?: string;
  durationMs?: number;
  code?: string;
  count?: number;
};

export function logEvent(
  level: Level,
  event: string,
  fields: SafeLogFields = {},
) {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.log(record);
}
