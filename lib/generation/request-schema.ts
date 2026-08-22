import { z } from "zod";
import { referenceRoleSchema } from "@/lib/generation/capability";

const conciseText = z.string().trim().max(120);
const technicalValue = z.union([
  z.string().max(5000),
  z.number().finite(),
  z.boolean(),
]);

export const creativeDirectionSchema = z
  .object({
    filmSetup: z
      .object({ genre: conciseText, era: conciseText, tempo: conciseText })
      .strict(),
    camera: z
      .object({
        body: conciseText,
        lens: conciseText,
        aperture: conciseText,
        movement: conciseText,
      })
      .strict(),
    palette: conciseText,
    lighting: conciseText,
  })
  .strict();

const technicalSettingsSchema = z
  .object({
    multiPrompt: z
      .array(
        z
          .object({
            prompt: z.string().trim().min(1).max(5000),
            duration: z.number().int().min(1).max(60),
          })
          .strict(),
      )
      .max(5)
      .optional(),
  })
  .catchall(technicalValue);

export const generationDraftSchema = z
  .object({
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid(),
    capabilityKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,95}$/),
    capabilityVersion: z.number().int().positive(),
    rawPrompt: z.string().trim().min(1).max(20_000),
    creativeDirection: creativeDirectionSchema,
    technicalSettings: technicalSettingsSchema,
    references: z
      .array(
        z
          .object({
            assetId: z.string().uuid(),
            role: referenceRoleSchema,
            groupId: z
              .string()
              .regex(/^element_[A-Za-z0-9_]{1,50}$/)
              .optional(),
            label: z.string().max(120).optional(),
            description: z.string().max(500).optional(),
            startMs: z.number().int().nonnegative().optional(),
            endMs: z.number().int().positive().optional(),
            startSeconds: z.number().nonnegative().optional(),
            endSeconds: z.number().positive().optional(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    skillVersionIds: z
      .array(z.string().uuid())
      .max(5)
      .refine(
        (values) => new Set(values).size === values.length,
        "Generation Skills must be unique",
      )
      .default([]),
    batchCount: z.number().int().min(1).max(4).default(1),
  })
  .strict();

export const generationSubmissionSchema = generationDraftSchema
  .extend({
    idempotencyKey: z
      .string()
      .min(16)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/),
  })
  .strict();

export type GenerationDraft = z.infer<typeof generationDraftSchema>;
export type GenerationSubmission = z.infer<typeof generationSubmissionSchema>;
