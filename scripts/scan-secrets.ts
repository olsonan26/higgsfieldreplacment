import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const rules = [
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { name: "GitHub token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b/ },
  {
    name: "Supabase server secret",
    pattern: /\bsb_secret_(?!replace|example)[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "JWT-like service credential",
    pattern:
      /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  },
];
const findings: string[] = [];

for (const file of listed) {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;
  for (const rule of rules)
    if (rule.pattern.test(content)) findings.push(`${file}: ${rule.name}`);
}

if (findings.length)
  throw new Error(`Potential committed secrets found:\n${findings.join("\n")}`);
console.log(
  `Scanned ${listed.length} repository files; no high-confidence secrets found.`,
);
