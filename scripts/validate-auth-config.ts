import { readFileSync } from "node:fs";
import { join } from "node:path";

const productionOrigin = "https://higgsfieldreplacment.vercel.app";
const productionCallback = `${productionOrigin}/auth/callback`;
const configPath = join(process.cwd(), "supabase", "config.toml");
const config = readFileSync(configPath, "utf8");

const siteUrl = config.match(/^site_url\s*=\s*"([^"]+)"\s*$/m)?.[1];
if (siteUrl !== productionOrigin) {
  throw new Error(
    `Supabase Auth site_url must be ${productionOrigin}; received ${siteUrl ?? "missing"}`,
  );
}

const redirectBlock = config.match(
  /^additional_redirect_urls\s*=\s*\[([\s\S]*?)^\]/m,
)?.[1];
if (!redirectBlock) {
  throw new Error("Supabase Auth additional_redirect_urls is missing");
}

const redirectUrls = Array.from(
  redirectBlock.matchAll(/"([^"]+)"/g),
  (match) => match[1],
);
if (!redirectUrls.includes(productionCallback)) {
  throw new Error(
    `Supabase Auth redirect allowlist must include ${productionCallback}`,
  );
}

console.log(
  `Validated Supabase Auth site URL and ${redirectUrls.length} exact callback URLs.`,
);
