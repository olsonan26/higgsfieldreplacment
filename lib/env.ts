import { z } from "zod";

const publicEnvironment = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("https://"),
      "Supabase URL must use HTTPS",
    ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const persistenceEnvironment = publicEnvironment.extend({
  SUPABASE_SECRET_KEY: z.string().min(20),
});

const generationProviderEnvironment = z.object({
  GENERATION_PROVIDER_API_KEY: z.string().min(16),
  GENERATION_PROVIDER_BASE_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("https://"),
      "Provider URL must use HTTPS",
    ),
  GENERATION_PROVIDER_WEBHOOK_HMAC_KEY: z.string().min(32),
});

const ingestionEnvironment = z.object({
  RESULT_ALLOWED_HOSTS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    ),
  MAX_GENERATED_IMAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(1_073_741_824)
    .default(52_428_800),
  MAX_GENERATED_VIDEO_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(2_147_483_648)
    .default(1_073_741_824),
});

const serverEnvironment = persistenceEnvironment.extend({
  ...generationProviderEnvironment.shape,
  CRON_SECRET: z.string().min(32),
  RESULT_ALLOWED_HOSTS: z.string().min(1),
  MAX_SOURCE_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(1_073_741_824)
    .default(104_857_600),
  MAX_GENERATED_IMAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(1_073_741_824)
    .default(52_428_800),
  MAX_GENERATED_VIDEO_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(2_147_483_648)
    .default(1_073_741_824),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ENABLE_REAL_PROVIDER_SMOKE: z.enum(["true", "false"]).default("false"),
  REAL_PROVIDER_SMOKE_MAX_CREDITS: z.coerce
    .number()
    .positive()
    .max(5)
    .default(1),
});

export function getPublicEnvironment() {
  return publicEnvironment.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getServerEnvironment() {
  return serverEnvironment.parse({
    ...process.env,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getPersistenceEnvironment() {
  return persistenceEnvironment.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
}

export function getGenerationProviderEnvironment() {
  return generationProviderEnvironment.parse({
    GENERATION_PROVIDER_API_KEY: process.env.GENERATION_PROVIDER_API_KEY,
    GENERATION_PROVIDER_BASE_URL: process.env.GENERATION_PROVIDER_BASE_URL,
    GENERATION_PROVIDER_WEBHOOK_HMAC_KEY:
      process.env.GENERATION_PROVIDER_WEBHOOK_HMAC_KEY,
  });
}

export function getIngestionEnvironment() {
  return ingestionEnvironment.parse({
    RESULT_ALLOWED_HOSTS: process.env.RESULT_ALLOWED_HOSTS,
    MAX_GENERATED_IMAGE_BYTES: process.env.MAX_GENERATED_IMAGE_BYTES,
    MAX_GENERATED_VIDEO_BYTES: process.env.MAX_GENERATED_VIDEO_BYTES,
  });
}

export function getOptionalServerReadiness() {
  return {
    publicConfiguration: publicEnvironment.safeParse({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    }).success,
    persistenceCredential: Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
    generationCredential: Boolean(
      process.env.GENERATION_PROVIDER_API_KEY?.trim(),
    ),
    webhookVerification: Boolean(
      process.env.GENERATION_PROVIDER_WEBHOOK_HMAC_KEY?.trim() &&
        process.env.GENERATION_PROVIDER_WEBHOOK_HMAC_KEY.trim().length >= 32,
    ),
    reconciliationCredential: Boolean(
      process.env.CRON_SECRET?.trim() &&
        process.env.CRON_SECRET.trim().length >= 32,
    ),
  };
}
