import { describe, expect, it } from "vitest";
import { modelCapabilitySchema } from "@/lib/generation/capability";
import {
  MODEL_CAPABILITIES,
  getCapability,
  publicCapability,
  validateCustomCapability,
} from "@/server/providers/generation-provider/capabilities";

describe("capability registry", () => {
  it("contains one schema-valid version for every release preset", () => {
    expect(MODEL_CAPABILITIES.map((item) => item.appModelKey)).toEqual([
      "seedance-2",
      "kling-3-video",
      "wan-2-7-text-video",
      "gemini-omni-video",
      "nano-banana-2",
      "gpt-image-2",
      "grok-imagine-image-2",
      "grok-imagine-video",
    ]);
    for (const capability of MODEL_CAPABILITIES) {
      expect(modelCapabilitySchema.parse(capability)).toEqual(capability);
      expect(capability.source.verifiedAt).toBe("2026-08-22");
      expect(capability.source.documentationUrl).toMatch(
        /^https:\/\/docs\.kie\.ai\//,
      );
    }
  });

  it("removes private adapter routing fields from client capability responses", () => {
    const result = publicCapability(getCapability("seedance-2")!);
    expect(result).not.toHaveProperty("providerModelId");
    expect(result).not.toHaveProperty("adapter");
  });

  it("requires unknown/custom models to provide a fully validated manifest", () => {
    expect(() => validateCustomCapability({ appModelKey: "custom" })).toThrow();
  });

  it("does not claim unsupported generic controls", () => {
    const grokImage = getCapability("grok-imagine-image-2")!;
    expect(grokImage.technical.map((field) => field.key)).toEqual([
      "aspectRatio",
    ]);
    expect(grokImage.references).toEqual([]);

    const gptImage = getCapability("gpt-image-2")!;
    expect(gptImage.technical.map((field) => field.key)).toEqual([
      "aspectRatio",
      "resolution",
    ]);
    expect(
      gptImage.technical.some((field) => field.key === "outputFormat"),
    ).toBe(false);
  });
});
