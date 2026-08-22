import { z } from "zod";

export const CAPABILITY_CONTRACT_VERSION = "1.0.0" as const;

export const referenceRoleSchema = z.enum([
  "first_frame",
  "last_frame",
  "reference_image",
  "reference_video",
  "reference_audio",
  "character",
  "element_image",
  "element_video",
  "element_audio",
]);

export type ReferenceRole = z.infer<typeof referenceRoleSchema>;
export type TechnicalSettingKey =
  | "aspectRatio"
  | "resolution"
  | "duration"
  | "audio"
  | "mode"
  | "seed"
  | "negativePrompt"
  | "outputFormat"
  | "promptExtend"
  | "watermark"
  | "multiShots"
  | "webSearch";

const defaultValueSchema = z
  .object({
    value: z.union([z.string(), z.number(), z.boolean()]),
    source: z.enum(["provider", "application"]),
  })
  .strict();

const technicalFieldSchema = z
  .object({
    key: z.enum([
      "aspectRatio",
      "resolution",
      "duration",
      "audio",
      "mode",
      "seed",
      "negativePrompt",
      "outputFormat",
      "promptExtend",
      "watermark",
      "multiShots",
      "webSearch",
    ]),
    label: z.string().min(1).max(80),
    providerField: z.string().regex(/^[a-z][a-z0-9_]*$/),
    kind: z.enum(["enum", "boolean", "integer", "string"]),
    values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    step: z.number().positive().optional(),
    maxLength: z.number().int().positive().optional(),
    required: z.boolean().default(false),
    defaultValue: defaultValueSchema.optional(),
    help: z.string().min(1).max(500),
  })
  .strict();

const referenceSpecSchema = z
  .object({
    role: referenceRoleSchema,
    label: z.string().min(1).max(80),
    providerField: z.string().regex(/^[a-z][a-z0-9_]*$/),
    inputKind: z.enum(["image", "video", "audio", "external_id"]),
    minimum: z.number().int().nonnegative().default(0),
    maximum: z.number().int().positive(),
    acceptedMimeTypes: z.array(z.string().min(3)).default([]),
    maxBytes: z.number().int().positive().optional(),
    minDurationSeconds: z.number().nonnegative().optional(),
    maxDurationSeconds: z.number().positive().optional(),
    totalDurationSeconds: z.number().positive().optional(),
    requiresGroup: z.boolean().default(false),
  })
  .strict();

const referenceExclusivitySchema = z
  .object({
    groups: z.array(z.array(referenceRoleSchema).min(1)).min(2),
    reason: z.string().min(1).max(500),
  })
  .strict();

const combinedQuotaSchema = z
  .object({
    limit: z.number().int().positive(),
    weights: z.partialRecord(referenceRoleSchema, z.number().int().positive()),
    reason: z.string().min(1).max(500),
  })
  .strict();

const incompatibilitySchema = z
  .object({
    when: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    disallow: z.record(
      z.string(),
      z.array(z.union([z.string(), z.number(), z.boolean()])),
    ),
    reason: z.string().min(1).max(500),
  })
  .strict();

const multiShotSchema = z
  .object({
    enabledField: z.literal("multi_shots"),
    promptsField: z.literal("multi_prompt"),
    maximumShots: z.number().int().positive(),
    promptMaxLength: z.number().int().positive(),
    shotDurationMinimum: z.number().int().positive(),
    shotDurationMaximum: z.number().int().positive(),
    totalMustMatchDuration: z.boolean(),
  })
  .strict();

export const modelCapabilitySchema = z
  .object({
    contractVersion: z.literal(CAPABILITY_CONTRACT_VERSION),
    appModelKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,95}$/),
    version: z.number().int().positive(),
    displayName: z.string().min(1).max(120),
    modelMaker: z.string().min(1).max(120),
    mediaKind: z.enum(["image", "video"]),
    adapter: z.enum([
      "seedance2",
      "kling3",
      "wan27",
      "geminiOmniVideo",
      "nanoBanana2",
      "gptImage2",
      "grokImage2",
      "grokVideo",
    ]),
    providerModelId: z.string().min(1).max(160),
    supportedModes: z.array(z.string().min(1)).min(1),
    prompt: z
      .object({
        minimum: z.number().int().nonnegative(),
        maximum: z.number().int().positive().optional(),
      })
      .strict(),
    negativePrompt: z
      .object({
        supported: z.boolean(),
        maximum: z.number().int().positive().optional(),
      })
      .strict(),
    technical: z.array(technicalFieldSchema),
    references: z.array(referenceSpecSchema),
    referenceExclusivity: z.array(referenceExclusivitySchema).default([]),
    combinedMediaQuota: combinedQuotaSchema.optional(),
    incompatibilities: z.array(incompatibilitySchema).default([]),
    multiShot: multiShotSchema.optional(),
    audioBehavior: z
      .object({
        behavior: z.enum([
          "unsupported",
          "generated-toggle",
          "reference-only",
          "generated-and-reference",
        ]),
        notes: z.string().min(1).max(500),
      })
      .strict(),
    costWarning: z
      .object({
        estimateAvailable: z.boolean(),
        text: z.string().min(1).max(500),
      })
      .strict(),
    source: z
      .object({
        documentationUrl: z.string().url().startsWith("https://"),
        providerSchemaVersion: z.string().min(1).max(120),
        verifiedAt: z.string().date(),
      })
      .strict(),
  })
  .strict();

export type ModelCapability = z.infer<typeof modelCapabilitySchema>;
export type TechnicalField = ModelCapability["technical"][number];
export type ReferenceSpec = ModelCapability["references"][number];

export type CreativeDirection = {
  filmSetup: { genre: string; era: string; tempo: string };
  camera: { body: string; lens: string; aperture: string; movement: string };
  palette: string;
  lighting: string;
};

export type ReferenceInput = {
  assetId: string;
  role: ReferenceRole;
  providerLocator: string;
  mediaKind: "image" | "video" | "audio";
  mimeType: string;
  byteSize: number;
  durationSeconds?: number;
  groupId?: string;
  label?: string;
  description?: string;
  startMs?: number;
  endMs?: number;
  startSeconds?: number;
  endSeconds?: number;
};

export type MultiShotPrompt = { prompt: string; duration: number };

export type GenerationSkillInput = {
  skillId: string;
  versionId: string;
  name: string;
  mediaScope: "image" | "video" | "both";
  markdownContent: string;
  contentSha256: string;
};

export type TechnicalSettings = Partial<
  Record<TechnicalSettingKey, string | number | boolean>
> & {
  multiPrompt?: MultiShotPrompt[];
};

export type CompileGenerationInput = {
  rawPrompt: string;
  creativeDirection: CreativeDirection;
  technicalSettings: TechnicalSettings;
  references: ReferenceInput[];
  skills?: GenerationSkillInput[];
  capability: ModelCapability;
};
