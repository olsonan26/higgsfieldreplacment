import { createHash } from "node:crypto";
import { MODEL_CAPABILITIES } from "@/server/providers/generation-provider/capabilities";
import { stableStringify } from "@/server/generation/compiler";

function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

const rows = MODEL_CAPABILITIES.map((capability) => {
  const manifest = stableStringify(capability);
  const fixtureHash = createHash("sha256").update(manifest).digest("hex");
  return `(${[
    literal(capability.appModelKey),
    String(capability.version),
    literal(capability.mediaKind),
    `${literal(manifest)}::jsonb`,
    literal(capability.source.documentationUrl),
    literal(capability.source.providerSchemaVersion),
    `${literal(`${capability.source.verifiedAt}T00:00:00Z`)}::timestamptz`,
    literal(fixtureHash),
    "true",
  ].join(", ")})`;
});

process.stdout.write(
  `-- Generated from the schema-validated TypeScript capability fixtures.\n\ninsert into public.model_capabilities (app_model_key, version, media_kind, manifest, source_url, provider_schema_version, verified_at, fixture_hash, enabled)\nvalues\n  ${rows.join(",\n  ")}\non conflict (app_model_key, version) do nothing;\n\ncreate index if not exists favorites_asset_idx on public.favorites(asset_id);\n`,
);
