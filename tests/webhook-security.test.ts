import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyProviderWebhookSignature } from "@/server/security/webhook";

function configureProviderEnvironment() {
  vi.stubEnv("GENERATION_PROVIDER_API_KEY", "provider-key-for-tests");
  vi.stubEnv("GENERATION_PROVIDER_BASE_URL", "https://api.example.com");
  vi.stubEnv(
    "GENERATION_PROVIDER_WEBHOOK_HMAC_KEY",
    "test-webhook-key-that-is-at-least-thirty-two-characters",
  );
}

describe("provider webhook authentication", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the documented correlation-only callback contract", () => {
    expect(
      verifyProviderWebhookSignature(
        "task-123",
        new Request("https://example.com/api/webhooks/generation-provider"),
      ),
    ).toBeNull();
  });

  it("validates optional signature headers when they are present", () => {
    configureProviderEnvironment();
    const taskId = "task-123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac(
      "sha256",
      "test-webhook-key-that-is-at-least-thirty-two-characters",
    )
      .update(`${taskId}.${timestamp}`)
      .digest("base64");
    const request = new Request(
      "https://example.com/api/webhooks/generation-provider",
      {
        headers: {
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature": `sha256=${signature}`,
        },
      },
    );

    expect(verifyProviderWebhookSignature(taskId, request)).toBe(timestamp);
  });

  it("rejects incomplete or invalid signature headers", () => {
    configureProviderEnvironment();
    const timestamp = String(Math.floor(Date.now() / 1000));

    expect(() =>
      verifyProviderWebhookSignature(
        "task-123",
        new Request("https://example.com", {
          headers: { "x-webhook-timestamp": timestamp },
        }),
      ),
    ).toThrow("Callback signature verification failed");
    expect(() =>
      verifyProviderWebhookSignature(
        "task-123",
        new Request("https://example.com", {
          headers: {
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature":
              "sha256=invalid-signature-value-that-is-long-enough-0000",
          },
        }),
      ),
    ).toThrow("Callback signature verification failed");
  });
});
