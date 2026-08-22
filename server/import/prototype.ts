import { createHash } from "node:crypto";
import { z } from "zod";

const referenceSchema = z
  .object({
    id: z.string().max(160),
    name: z.string().trim().min(1).max(255),
    type: z.enum(["image", "video", "audio"]),
    createdAt: z.string().datetime(),
  })
  .strip();

const jobSchema = z
  .object({
    id: z.string().max(160),
    modelLabel: z.string().trim().min(1).max(120),
    kind: z.enum(["image", "video"]),
    prompt: z.string().max(20_000),
    state: z.string().trim().min(1).max(40),
    progress: z.number().int().min(0).max(100).default(0),
    createdAt: z.string().datetime(),
    creditsConsumed: z
      .number()
      .finite()
      .nonnegative()
      .max(1_000_000)
      .optional(),
    failure: z.string().max(500).optional(),
  })
  .strip();

const prototypeSchema = z
  .object({
    projectName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .default("Imported production"),
    references: z.array(referenceSchema).max(250).default([]),
    jobs: z.array(jobSchema).max(500).default([]),
    favorites: z.array(z.string().max(160)).max(500).default([]),
  })
  .strip();

export function sanitizePrototypeImport(input: unknown) {
  const parsed = prototypeSchema.parse(input);
  const sanitized = {
    projectName: parsed.projectName,
    references: parsed.references,
    jobs: parsed.jobs.map((job) => ({
      ...job,
      usageStatus: "unverified-historical" as const,
    })),
    favoriteCount: parsed.favorites.length,
  };
  const serialized = JSON.stringify(sanitized);
  return {
    projectName: `Imported — ${parsed.projectName}`.slice(0, 120),
    sanitized,
    payloadHash: createHash("sha256").update(serialized).digest("hex"),
    summary: {
      referenceCount: parsed.references.length,
      historicalJobCount: parsed.jobs.length,
      favoriteCount: parsed.favorites.length,
      authoritativeUsageEntries: 0,
    },
  };
}
