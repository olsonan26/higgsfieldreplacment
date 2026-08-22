import { describe, expect, it } from "vitest";
import { KIE_MODELS, modelsFor } from "../lib/models";

describe("model catalog", () => {
  it("contains verified image and video presets", () => {
    expect(modelsFor("image").length).toBeGreaterThanOrEqual(3);
    expect(modelsFor("video").length).toBeGreaterThanOrEqual(4);
    expect(KIE_MODELS.some((model) => model.id === "bytedance/seedance-2")).toBe(true);
    expect(KIE_MODELS.some((model) => model.id === "nano-banana-2")).toBe(true);
  });
});
