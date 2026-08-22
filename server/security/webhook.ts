import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError, RequestSizeError } from "@/lib/http";
import { getGenerationProviderEnvironment } from "@/lib/env";

function equalText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyCallbackCorrelation(token: string, expectedHash: string) {
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(token))
    throw new HttpError(
      401,
      "InvalidCallbackCorrelation",
      "Callback authentication failed",
    );
  const actual = createHash("sha256").update(token).digest("hex");
  if (!equalText(actual, expectedHash))
    throw new HttpError(
      401,
      "InvalidCallbackCorrelation",
      "Callback authentication failed",
    );
}

export function verifyProviderWebhookSignature(
  taskId: string,
  request: Request,
) {
  const timestamp = request.headers.get("x-webhook-timestamp") || "";
  const signature = (request.headers.get("x-webhook-signature") || "").replace(
    /^sha256=/i,
    "",
  );
  if (
    !/^\d{10}$/.test(timestamp) ||
    !/^[A-Za-z0-9+/=_-]{40,100}$/.test(signature)
  ) {
    throw new HttpError(
      401,
      "InvalidWebhookSignature",
      "Callback signature verification failed",
    );
  }
  const timestampMs = Number(timestamp) * 1000;
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > 300_000
  ) {
    throw new HttpError(
      401,
      "StaleWebhook",
      "Callback timestamp is outside the accepted window",
    );
  }
  const environment = getGenerationProviderEnvironment();
  const expected = createHmac(
    "sha256",
    environment.GENERATION_PROVIDER_WEBHOOK_HMAC_KEY,
  )
    .update(`${taskId}.${timestamp}`)
    .digest("base64");
  const normalized = signature.replace(/-/g, "+").replace(/_/g, "/");
  if (!equalText(normalized, expected))
    throw new HttpError(
      401,
      "InvalidWebhookSignature",
      "Callback signature verification failed",
    );
  return timestamp;
}

export async function readWebhookBody(
  request: Request,
  maximumBytes = 1_048_576,
) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maximumBytes)
    throw new RequestSizeError();
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maximumBytes)
    throw new RequestSizeError();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new HttpError(
      400,
      "InvalidWebhookJson",
      "Callback body must be valid JSON",
    );
  }
  return {
    raw,
    payload,
    bodyHash: createHash("sha256").update(raw).digest("hex"),
  };
}
