import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type {
  CreativeDirection,
  GenerationSkillInput,
  ReferenceInput,
  TechnicalSettings,
} from "@/lib/generation/capability";
import { getCapability } from "@/server/providers/generation-provider/capabilities";
import {
  compileCreativeDirection,
  compileGenerationRequest,
  GenerationCompileError,
} from "@/server/generation/compiler";

const direction: CreativeDirection = {
  filmSetup: { genre: "Noir", era: "1980s", tempo: "Measured" },
  camera: {
    body: "35mm Film",
    lens: "Anamorphic",
    aperture: "f/4 Moderate",
    movement: "Dolly zoom",
  },
  palette: "Nocturne",
  lighting: "Moonlit",
};

const assetIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
  "88888888-8888-4888-8888-888888888888",
];

function reference(
  index: number,
  overrides: Partial<ReferenceInput>,
): ReferenceInput {
  return {
    assetId: assetIds[index],
    role: "reference_image",
    providerLocator: `https://hgpzghectlmvxhakgrdg.supabase.co/storage/v1/sign/object/source/${assetIds[index]}?token=secret`,
    mediaKind: "image",
    mimeType: "image/png",
    byteSize: 1024,
    ...overrides,
  };
}

function compile(
  model: string,
  settings: TechnicalSettings = {},
  references: ReferenceInput[] = [],
  rawPrompt = "A lone cyclist crosses a rain-lit bridge",
  skills: GenerationSkillInput[] = [],
) {
  return compileGenerationRequest({
    rawPrompt,
    creativeDirection: direction,
    technicalSettings: settings,
    references,
    skills,
    capability: getCapability(model)!,
  });
}

function generationSkill(
  overrides: Partial<GenerationSkillInput> = {},
): GenerationSkillInput {
  const markdownContent =
    overrides.markdownContent ??
    "# Product photography\n- Use a centered hero composition.\n- Preserve exact label spelling.";
  return {
    skillId: "99999999-9999-4999-8999-999999999999",
    versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Product photography",
    mediaScope: "image",
    markdownContent,
    contentSha256: createHash("sha256").update(markdownContent).digest("hex"),
    ...overrides,
  };
}

describe("deterministic generation compiler", () => {
  it("compiles creative direction on Generate without mutating the raw prompt", () => {
    const result = compile("seedance-2");
    expect(result.rawPrompt).toBe("A lone cyclist crosses a rain-lit bridge");
    expect(result.compiledPrompt).toContain(
      "Film setup: Noir genre; 1980s era; Measured tempo.",
    );
    expect(result.compiledPrompt).toContain("Dolly zoom movement");
    expect(result.providerPayload.input.prompt).toBe(result.compiledPrompt);
  });

  it("is byte-deterministic and never duplicates direction across repeated previews", () => {
    const first = compile("seedance-2");
    const second = compile("seedance-2");
    expect(second).toEqual(first);
    expect(first.compiledPrompt.match(/Creative direction/g)).toHaveLength(1);
    expect(compileCreativeDirection(first.rawPrompt, direction)).toBe(
      first.compiledPrompt,
    );
  });

  it("changes the payload and hash immediately when a creative control changes", () => {
    const first = compile("seedance-2");
    const changed = compileGenerationRequest({
      rawPrompt: first.rawPrompt,
      creativeDirection: { ...direction, lighting: "Golden hour" },
      technicalSettings: {},
      references: [],
      capability: getCapability("seedance-2")!,
    });
    expect(changed.compiledPrompt).toContain("Lighting: Golden hour");
    expect(changed.requestHash).not.toBe(first.requestHash);
  });

  it("includes selected Generation Skills verbatim, deterministically, and only when selected", () => {
    const skill = generationSkill();
    const selected = compile(
      "nano-banana-2",
      {},
      [],
      "Create a perfume bottle",
      [skill],
    );
    const repeated = compile(
      "nano-banana-2",
      {},
      [],
      "Create a perfume bottle",
      [skill],
    );
    const unselected = compile(
      "nano-banana-2",
      {},
      [],
      "Create a perfume bottle",
    );

    expect(selected).toEqual(repeated);
    expect(selected.compiledPrompt).toContain(skill.markdownContent);
    expect(selected.compiledPrompt.match(/--- Skill:/g)).toHaveLength(1);
    expect(selected.providerPayload.input.prompt).toBe(selected.compiledPrompt);
    expect(selected.skillSummary).toEqual([
      expect.objectContaining({
        versionId: skill.versionId,
        contentSha256: skill.contentSha256,
      }),
    ]);
    expect(
      selected.warnings.some(
        (warning) => warning.code === "GENERATION_SKILLS_ATTACHED",
      ),
    ).toBe(true);
    expect(unselected.compiledPrompt).not.toContain(
      "Selected Generation Skills",
    );
    expect(unselected.requestHash).not.toBe(selected.requestHash);
  });

  it("normalizes CRLF skill content and rejects stale hashes, incompatible scope, duplicates, and compiled overflow", () => {
    const crlf = "# Lighting\r\nUse a cool rim light.";
    const normalized = "# Lighting\nUse a cool rim light.";
    const normalizedSkill = generationSkill({
      mediaScope: "both",
      markdownContent: crlf,
      contentSha256: createHash("sha256").update(normalized).digest("hex"),
    });
    expect(
      compile("seedance-2", {}, [], "A quiet street", [normalizedSkill])
        .compiledPrompt,
    ).toContain(normalized);
    expect(() =>
      compile("nano-banana-2", {}, [], "A quiet street", [
        generationSkill({ contentSha256: "0".repeat(64) }),
      ]),
    ).toThrow(/immutable version/);
    expect(() =>
      compile("seedance-2", {}, [], "A quiet street", [generationSkill()]),
    ).toThrow(/does not support video/);
    const duplicate = generationSkill({ mediaScope: "both" });
    expect(() =>
      compile("seedance-2", {}, [], "A quiet street", [duplicate, duplicate]),
    ).toThrow(/cannot be selected twice/);
    const oversized = "x".repeat(19950);
    expect(() =>
      compile("seedance-2", {}, [], "A quiet street", [
        generationSkill({
          mediaScope: "both",
          markdownContent: oversized,
          contentSha256: createHash("sha256").update(oversized).digest("hex"),
        }),
      ]),
    ).toThrow(/compiled prompt/);
  });

  it("produces checked-in exact default payload snapshots for every preset", () => {
    for (const capability of [
      "seedance-2",
      "kling-3-video",
      "wan-2-7-text-video",
      "gemini-omni-video",
      "nano-banana-2",
      "gpt-image-2",
      "grok-imagine-image-2",
      "ltx-2-5",
      "grok-imagine-video",
    ]) {
      expect(compile(capability).sanitizedRequestPreview).toMatchSnapshot(
        capability,
      );
    }
  });

  it("maps every non-special technical setting to its exact provider field", () => {
    for (const capability of [
      "seedance-2",
      "wan-2-7-text-video",
      "gemini-omni-video",
      "nano-banana-2",
      "grok-imagine-image-2",
      "ltx-2-5",
      "grok-imagine-video",
    ].map((key) => getCapability(key)!)) {
      const result = compile(capability.appModelKey);
      for (const field of capability.technical) {
        if (field.defaultValue)
          expect(result.providerPayload.input[field.providerField]).toBe(
            field.defaultValue.value,
          );
      }
    }
    expect(
      compile("wan-2-7-text-video", { negativePrompt: "blur", seed: 17 })
        .providerPayload.input,
    ).toMatchObject({ negative_prompt: "blur", seed: 17 });
    expect(
      compile("seedance-2", { webSearch: true }).providerPayload.input
        .web_search,
    ).toBe(true);
  });

  it("maps Seedance frame and multimodal reference roles exactly and redacts signed URLs", () => {
    const frames = compile("seedance-2", {}, [
      reference(0, { role: "first_frame" }),
      reference(1, { role: "last_frame" }),
    ]);
    expect(frames.providerPayload.input).toMatchObject({
      first_frame_url: expect.stringContaining("token=secret"),
      last_frame_url: expect.stringContaining("token=secret"),
    });
    expect(frames.sanitizedRequestPreview.input).toMatchObject({
      first_frame_url: `asset://${assetIds[0]}`,
      last_frame_url: `asset://${assetIds[1]}`,
    });

    const multimodal = compile("seedance-2", {}, [
      reference(2, { role: "reference_image" }),
      reference(3, {
        role: "reference_video",
        mediaKind: "video",
        mimeType: "video/mp4",
        durationSeconds: 8,
      }),
      reference(4, {
        role: "reference_audio",
        mediaKind: "audio",
        mimeType: "audio/mpeg",
        durationSeconds: 8,
      }),
    ]);
    expect(multimodal.sanitizedRequestPreview.input).toMatchObject({
      reference_image_urls: [`asset://${assetIds[2]}`],
      reference_video_urls: [`asset://${assetIds[3]}`],
      reference_audio_urls: [`asset://${assetIds[4]}`],
    });
  });

  it("blocks Seedance mutually exclusive scenarios and duration quotas", () => {
    expect(() =>
      compile("seedance-2", {}, [
        reference(0, { role: "first_frame" }),
        reference(1, { role: "reference_image" }),
      ]),
    ).toThrow(GenerationCompileError);
    expect(() =>
      compile("seedance-2", {}, [
        reference(2, {
          role: "reference_video",
          mediaKind: "video",
          mimeType: "video/mp4",
          durationSeconds: 9,
        }),
        reference(3, {
          role: "reference_video",
          mediaKind: "video",
          mimeType: "video/mp4",
          durationSeconds: 9,
        }),
      ]),
    ).toThrow(/combined limit/);
  });

  it("compiles Kling modes, multi-shot prompts, frame rules, named elements and audio", () => {
    const elementRefs = [
      reference(0, {
        role: "element_image",
        groupId: "element_actor",
        description: "lead actor",
      }),
      reference(1, {
        role: "element_image",
        groupId: "element_actor",
        description: "lead actor",
      }),
      reference(2, {
        role: "element_audio",
        groupId: "element_actor",
        mediaKind: "audio",
        mimeType: "audio/mpeg",
        durationSeconds: 6,
      }),
    ];
    const single = compile(
      "kling-3-video",
      { mode: "4K", audio: true },
      elementRefs,
      "A tracking shot follows @element_actor",
    );
    expect(single.sanitizedRequestPreview.input).toMatchObject({
      mode: "4K",
      sound: true,
      multi_shots: false,
      multi_prompt: [],
      kling_elements: [
        {
          name: "element_actor",
          description: "lead actor",
          element_input_urls: [
            `asset://${assetIds[0]}`,
            `asset://${assetIds[1]}`,
          ],
          element_input_audio_urls: [`asset://${assetIds[2]}`],
        },
      ],
    });

    const multi = compile(
      "kling-3-video",
      {
        duration: "6",
        multiShots: true,
        multiPrompt: [
          { prompt: "@element_actor enters the room", duration: 3 },
          { prompt: "@element_actor turns toward camera", duration: 3 },
        ],
      },
      elementRefs,
      "Sequence featuring @element_actor",
    );
    expect(multi.providerPayload.input.multi_shots).toBe(true);
    expect(multi.providerPayload.input.sound).toBe(true);
    expect(multi.providerPayload.input.multi_prompt).toHaveLength(2);
    expect(JSON.stringify(multi.providerPayload.input.multi_prompt)).toContain(
      "Creative direction",
    );
  });

  it("maps Wan negative prompt, audio, resolution, ratio, duration, prompt extension, watermark and seed", () => {
    const result = compile(
      "wan-2-7-text-video",
      {
        negativePrompt: "flicker",
        resolution: "720p",
        aspectRatio: "3:4",
        duration: 12,
        promptExtend: false,
        watermark: true,
        seed: 42,
      },
      [
        reference(0, {
          role: "reference_audio",
          mediaKind: "audio",
          mimeType: "audio/mpeg",
        }),
      ],
    );
    expect(result.sanitizedRequestPreview.input).toMatchObject({
      negative_prompt: "flicker",
      audio_url: `asset://${assetIds[0]}`,
      resolution: "720p",
      ratio: "3:4",
      duration: 12,
      prompt_extend: false,
      watermark: true,
      seed: 42,
    });
  });

  it("enforces Gemini combined media quota and source-video trim behavior", () => {
    const refs = [
      reference(0, {
        role: "reference_video",
        mediaKind: "video",
        mimeType: "video/mp4",
        durationSeconds: 20,
        startSeconds: 1,
        endSeconds: 9,
      }),
      reference(1, {
        role: "character",
        mediaKind: "image",
        mimeType: "application/x.external-id",
        providerLocator: "character_one",
      }),
      reference(2, {
        role: "reference_audio",
        mediaKind: "audio",
        mimeType: "application/x.external-id",
        providerLocator: "audio_one",
      }),
      reference(3, { role: "reference_image" }),
    ];
    const result = compile(
      "gemini-omni-video",
      { duration: "10", resolution: "4k" },
      refs,
    );
    expect(result.sanitizedRequestPreview.input).toMatchObject({
      duration: "4",
      resolution: "4k",
      image_urls: [`asset://${assetIds[3]}`],
      audio_ids: [`asset://${assetIds[2]}`],
      character_ids: [`asset://${assetIds[1]}`],
      video_list: [{ url: `asset://${assetIds[0]}`, start: 1, ends: 9 }],
    });
    expect(
      result.warnings.some(
        (warning) => warning.code === "VIDEO_DURATION_MODEL_CONTROLLED",
      ),
    ).toBe(true);

    const tooMany = Array.from({ length: 6 }, (_, index) =>
      reference(index, { role: "reference_image" }),
    );
    tooMany.push(
      reference(6, {
        role: "reference_video",
        mediaKind: "video",
        mimeType: "video/mp4",
        durationSeconds: 10,
        startSeconds: 0,
        endSeconds: 5,
      }),
    );
    expect(() => compile("gemini-omni-video", {}, tooMany)).toThrow(
      /combined total/,
    );
  });

  it("maps Nano Banana reference images and exact image settings", () => {
    const result = compile(
      "nano-banana-2",
      { aspectRatio: "21:9", resolution: "4K", outputFormat: "png" },
      [reference(0, {})],
    );
    expect(result.sanitizedRequestPreview.input).toMatchObject({
      aspect_ratio: "21:9",
      resolution: "4K",
      output_format: "png",
      image_input: [`asset://${assetIds[0]}`],
    });
  });

  it("compiles every selected LTX-2.5 setting and first frame exactly", () => {
    const result = compile(
      "ltx-2-5",
      {
        resolution: "1080p",
        aspectRatio: "9:16",
        duration: "10",
        frameRate: 24,
        promptExtend: true,
        seed: 42,
      },
      [reference(0, { role: "first_frame" })],
    );
    expect(result.sanitizedRequestPreview).toMatchObject({
      model: "self-hosted/ltx-2.5-distilled",
      input: {
        resolution: "1080p",
        aspect_ratio: "9:16",
        duration: "10",
        frame_rate: 24,
        enhance_prompt: true,
        seed: 42,
        output_width: 1088,
        output_height: 1920,
        images: [
          {
            url: `asset://${assetIds[0]}`,
            frame_index: 0,
            strength: 1,
          },
        ],
      },
    });
  });

  it("blocks GPT Image resolution/aspect incompatibilities", () => {
    expect(() =>
      compile("gpt-image-2", { aspectRatio: "1:1", resolution: "4K" }),
    ).toThrow(/4K contract/);
    expect(() =>
      compile("gpt-image-2", { aspectRatio: "auto", resolution: "2K" }),
    ).toThrow(/Auto aspect ratio/);
    expect(
      compile("gpt-image-2", { aspectRatio: "16:9", resolution: "4K" })
        .providerPayload.input,
    ).toMatchObject({ aspect_ratio: "16:9", resolution: "4K" });
  });

  it("rejects unsupported controls and reference types before spend", () => {
    expect(() => compile("grok-imagine-image-2", { resolution: "4K" })).toThrow(
      /not supported/,
    );
    expect(() => compile("grok-imagine-video", {}, [reference(0, {})])).toThrow(
      /not supported/,
    );
  });
});
