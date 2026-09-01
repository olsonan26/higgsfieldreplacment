import { describe, expect, it } from "vitest";
import type { ReferenceInput } from "@/lib/generation/capability";
import { compileGenerationRequest } from "@/server/generation/compiler";
import { compileLtxMultiReference } from "@/server/generation/ltx-multi-reference";
import { LTX_25_CAPABILITY_V4 } from "@/server/providers/generation-provider/ltx25-v4";

const creativeDirection = {
  filmSetup: { genre: "General", era: "Contemporary", tempo: "Measured" },
  camera: {
    body: "Digital cinema",
    lens: "Natural 50mm",
    aperture: "f/4 moderate",
    movement: "Slow dolly",
  },
  palette: "Natural",
  lighting: "Natural daylight",
};

function imageReference(
  index: number,
  role: "first_frame" | "reference_image" = "reference_image",
): ReferenceInput {
  return {
    assetId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    role,
    providerLocator: `https://project.supabase.co/storage/v1/object/sign/ref-${index}.png?token=test`,
    mediaKind: "image",
    mimeType: "image/png",
    byteSize: 1024,
    label: `reference-${index}.png`,
  };
}

function compile(rawPrompt: string, references: ReferenceInput[]) {
  const base = compileGenerationRequest({
    rawPrompt,
    creativeDirection,
    technicalSettings: {},
    references,
    skills: [],
    capability: LTX_25_CAPABILITY_V4,
  });
  return compileLtxMultiReference(base, references);
}

describe("LTX-2.5 prompt image anchors", () => {
  it("accepts nine ordered prompt images and maps them to deterministic keyframes", () => {
    const references = Array.from({ length: 9 }, (_, index) =>
      imageReference(index + 1),
    );
    const result = compile(
      "Move from @image through @image2, @image3, @image4, @image5, @image6, @image7, @image8 and finish on @image9.",
      references,
    );
    const images = result.providerPayload.input.images as Array<{
      url: string;
      frame_index: number;
      strength: number;
    }>;

    expect(result.effectiveSettings.duration).toBe("12");
    expect(result.providerPayload.input.duration).toBe("12");
    expect(images).toHaveLength(9);
    expect(images[0].frame_index).toBe(0);
    expect(images.slice(1).every((image) => image.frame_index % 8 === 0)).toBe(
      true,
    );
    expect(new Set(images.map((image) => image.frame_index)).size).toBe(9);
    expect(images.at(-1)!.frame_index).toBeLessThan(289);
    expect(result.compiledPrompt).toContain(
      "@image9 / @reference_9 = visual anchor 9",
    );
    expect(result.sanitizedRequestPreview.input.images).not.toEqual(images);
  });

  it("keeps auto duration when there is only one opening image", () => {
    const result = compile("Animate @image with restrained motion.", [
      imageReference(1, "first_frame"),
    ]);
    const images = result.providerPayload.input.images as Array<{
      frame_index: number;
    }>;
    expect(result.effectiveSettings.duration).toBe("auto");
    expect(images).toHaveLength(1);
    expect(images[0].frame_index).toBe(0);
  });

  it("rejects prompt image tokens that are not attached", () => {
    expect(() =>
      compile("Transition from @image1 to missing @image3.", [
        imageReference(1),
        imageReference(2),
      ]),
    ).toThrow(/@image3 is not attached/);
  });

  it("enforces the nine-image combined capability quota", () => {
    const references = [
      imageReference(1, "first_frame"),
      ...Array.from({ length: 9 }, (_, index) => imageReference(index + 2)),
    ];
    expect(() => compile("Use @image1 through @image9.", references)).toThrow(
      /at most nine visual anchors|combined|nine/i,
    );
  });
});
