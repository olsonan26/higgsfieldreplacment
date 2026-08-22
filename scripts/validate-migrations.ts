import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const directory = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(directory)
  .filter((file) => file.endsWith(".sql"))
  .sort();
if (!files.length) throw new Error("No SQL migrations were found");

const seen = new Set<string>();
for (const file of files) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file))
    throw new Error(`Invalid migration filename: ${file}`);
  const version = file.slice(0, 14);
  if (seen.has(version))
    throw new Error(`Duplicate migration version: ${version}`);
  seen.add(version);
  const sql = readFileSync(join(directory, file), "utf8");
  if (
    /security\s+definer/i.test(sql) &&
    !/set\s+search_path\s*=\s*''/i.test(sql)
  ) {
    throw new Error(
      `SECURITY DEFINER migration lacks an empty search_path: ${file}`,
    );
  }
}

const combined = files
  .map((file) => readFileSync(join(directory, file), "utf8"))
  .join("\n");
const required = [
  "enable row level security",
  "reserve_generation_batch",
  "provider_webhook_events",
  "generation_skill_snapshots",
  "guard_membership_administration",
  "storage.objects",
];
for (const fragment of required) {
  if (!combined.toLowerCase().includes(fragment.toLowerCase()))
    throw new Error(`Required migration control is missing: ${fragment}`);
}

console.log(
  `Validated ${files.length} ordered migrations and required security controls.`,
);
