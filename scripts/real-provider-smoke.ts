import { readFileSync } from "node:fs";

if (process.env.ENABLE_REAL_PROVIDER_SMOKE !== "true") {
  console.log(
    "Real-provider smoke is disabled (ENABLE_REAL_PROVIDER_SMOKE is not true). No request was sent.",
  );
  process.exit(0);
}

const cap = Number(process.env.REAL_PROVIDER_SMOKE_MAX_CREDITS ?? "0");
if (!Number.isFinite(cap) || cap <= 0 || cap > 1)
  throw new Error(
    "REAL_PROVIDER_SMOKE_MAX_CREDITS must be greater than 0 and no more than 1",
  );
const endpoint = new URL(
  "/api/generations",
  process.env.REAL_PROVIDER_SMOKE_APP_URL,
);
if (endpoint.protocol !== "https:")
  throw new Error("The real-provider smoke endpoint must use HTTPS");
const cookie = process.env.REAL_PROVIDER_SMOKE_AUTH_COOKIE;
const payloadPath = process.env.REAL_PROVIDER_SMOKE_PAYLOAD_FILE;
if (!cookie || !payloadPath)
  throw new Error(
    "An explicit auth cookie and reviewed payload file are required",
  );
const payload = JSON.parse(readFileSync(payloadPath, "utf8")) as Record<
  string,
  unknown
>;
payload.idempotencyKey = `real-smoke-${Date.now()}-${crypto.randomUUID()}`;
payload.batchCount = 1;

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie,
    origin: endpoint.origin,
  },
  body: JSON.stringify(payload),
});
const result = await response.text();
if (!response.ok)
  throw new Error(
    `Smoke request was rejected (${response.status}): ${result.slice(0, 300)}`,
  );
console.log(
  `Real-provider smoke submitted one capped generation successfully (${response.status}).`,
);
