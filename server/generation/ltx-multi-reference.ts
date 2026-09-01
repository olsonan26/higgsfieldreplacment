import { createHash } from "node:crypto";
import type { ReferenceInput } from "@/lib/generation/capability";
import {
  GenerationCompileError,
  stableStringify,
  type CompiledGenerationRequest,
} from "@/server/generation/compiler";

const MAX_LTX_IMAGES = 9;
const FRAME_RATE = 24;
const FRAME_COUNTS: Record<string, number> = {
  "5": 121,
  "10": 241,
  "12": 289,
};

function promptImageMentions(prompt: string) {
  return [...prompt.matchAll(/@image(\d{0,2})\b/gi)].map((match) =>
    match[1] ? Number(match[1]) : 1,
  );
}

function labelAlias(label: string | undefined) {
  if (!label) return "";
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return /^[a-z][a-z0-9_]*$/.test(normalized) ? normalized : "";
}

function distributedFrames(count: number, totalFrames: number) {
  const frames: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const ideal = ((index + 1) / (count + 1)) * (totalFrames - 1);
    let frame = Math.round(ideal / 8) * 8;
    frame = Math.max(8, Math.min(totalFrames - 9, frame));
    if (frames.length && frame <= frames[frames.length - 1])
      frame = frames[frames.length - 1] + 8;
    if (frame >= totalFrames)
      throw new GenerationCompileError([
        {
          path: "references",
          message: "The selected duration is too short for these LTX visual anchors.",
        },
      ]);
    frames.push(frame);
  }
  return frames;
}

function sanitizeProviderPayload(
  payload: { model: string; input: Record<string, unknown> },
  references: ReferenceInput[],
) {
  const replacements = new Map(
    references.map((reference) => [
      reference.providerLocator,
      `asset://${reference.assetId}`,
    ]),
  );
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") return replacements.get(value) || value;
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          visit(item),
        ]),
      );
    return value;
  };
  return visit(payload) as { model: string; input: Record<string, unknown> };
}

/**
 * LTX-2.5 accepts repeatable --image conditions. VesperFrame maps the first
 * visual reference to frame zero and distributes the remaining prompt images
 * over a fixed 8k+1 frame timeline. @image and @imageN are stable prompt names
 * for those ordered visual anchors.
 */
export function compileLtxMultiReference(
  compiled: CompiledGenerationRequest,
  references: ReferenceInput[],
) {
  const firstFrame = references.find((reference) => reference.role === "first_frame");
  const promptImages = references.filter(
    (reference) => reference.role === "reference_image",
  );
  const visuals = [
    ...(firstFrame ? [firstFrame] : []),
    ...promptImages,
  ];

  if (visuals.length > MAX_LTX_IMAGES)
    throw new GenerationCompileError([
      {
        path: "references",
        message: `LTX-2.5 accepts at most ${MAX_LTX_IMAGES} visual anchors.`,
      },
    ]);

  const mentions = promptImageMentions(compiled.rawPrompt);
  const invalidMention = mentions.find(
    (index) => index < 1 || index > visuals.length,
  );
  if (invalidMention !== undefined)
    throw new GenerationCompileError([
      {
        path: "rawPrompt",
        message: visuals.length
          ? `@image${invalidMention} is not attached. This request has ${visuals.length} LTX image${visuals.length === 1 ? "" : "s"}.`
          : "The prompt uses an @image reference, but no LTX image is attached.",
      },
    ]);

  if (!visuals.length) return compiled;

  const providerInput = { ...compiled.providerPayload.input };
  const effectiveSettings = { ...compiled.effectiveSettings };
  const warnings = [...compiled.warnings];

  if (visuals.length > 1 && String(providerInput.duration) === "auto") {
    providerInput.duration = "12";
    effectiveSettings.duration = "12";
    warnings.push({
      code: "LTX_MULTI_ANCHOR_FIXED_DURATION",
      message:
        "Multiple LTX prompt images use the 12-second timeline so every visual anchor has a deterministic keyframe position.",
    });
  }

  const duration = String(providerInput.duration || "auto");
  const anchorCount = Math.max(0, visuals.length - 1);
  let frames: number[] = [];
  if (anchorCount) {
    const totalFrames = FRAME_COUNTS[duration];
    if (!totalFrames)
      throw new GenerationCompileError([
        {
          path: "technicalSettings.duration",
          message:
            "Multiple LTX prompt images require a fixed 5, 10, or 12 second duration.",
        },
      ]);
    frames = distributedFrames(anchorCount, totalFrames);
  }

  const imageConditions = visuals.map((reference, index) => ({
    url: reference.providerLocator,
    frame_index: index === 0 ? 0 : frames[index - 1],
    strength: 1,
  }));
  providerInput.images = imageConditions;

  const mapping = visuals.map((reference, index) => {
    const canonical = index === 0 ? "@image / @image1" : `@image${index + 1}`;
    const alias = labelAlias(reference.label);
    const at = imageConditions[index].frame_index / FRAME_RATE;
    return `${canonical}${alias ? ` / @${alias}` : ""} = visual anchor ${index + 1} at ${at.toFixed(2)}s`;
  });
  const anchorGuide = [
    "LTX visual anchors — The attached images are ordered timeline references.",
    ...mapping,
    "When the prompt names an @image token, preserve the corresponding subject identity, wardrobe, objects, environment, composition, and other visible details as requested while maintaining coherent motion between anchors.",
  ].join("\n");
  const compiledPrompt = `${compiled.compiledPrompt}\n\n${anchorGuide}`;
  if (compiledPrompt.length > 20_000)
    throw new GenerationCompileError([
      {
        path: "compiledPrompt",
        message:
          "The compiled LTX prompt and visual-anchor mapping exceed 20,000 characters.",
      },
    ]);
  providerInput.prompt = compiledPrompt;

  const providerPayload = {
    ...compiled.providerPayload,
    input: providerInput,
  };
  const sanitizedRequestPreview = sanitizeProviderPayload(
    providerPayload,
    references,
  );
  const requestHash = createHash("sha256")
    .update(stableStringify(sanitizedRequestPreview))
    .digest("hex");

  warnings.push({
    code: "LTX_VISUAL_ANCHORS_ATTACHED",
    message: `${visuals.length} LTX visual anchor${visuals.length === 1 ? " is" : "s are"} attached. Use @image, @image1, through @image${visuals.length} in the prompt to refer to them by order.`,
  });

  return {
    ...compiled,
    compiledPrompt,
    providerPayload,
    sanitizedRequestPreview,
    effectiveSettings,
    warnings,
    requestHash,
  };
}
