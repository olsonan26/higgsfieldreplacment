import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getIngestionEnvironment } from "@/lib/env";
import { HttpError } from "@/lib/http";

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  )
    return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && octets[2] === 2) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && octets[2] === 100))) ||
    (a === 203 && b === 0 && octets[2] === 113)
  );
}

function isPrivateIpv6(address: string) {
  const value = address.toLowerCase().split("%")[0];
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("ff") ||
    value.startsWith("2001:db8") ||
    value.startsWith("::ffff:")
  );
}

export async function assertSafeResultUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(422, "UnsafeResultUrl", "Result URL is invalid");
  }
  const allowedHosts = getIngestionEnvironment().RESULT_ALLOWED_HOSTS;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !allowedHosts.includes(url.hostname.toLowerCase())
  ) {
    throw new HttpError(
      422,
      "UnsafeResultUrl",
      "Result URL is outside the configured ingestion allowlist",
    );
  }
  if (isIP(url.hostname))
    throw new HttpError(
      422,
      "UnsafeResultUrl",
      "Literal-IP result URLs are not allowed",
    );
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = (await lookup(url.hostname, {
      all: true,
      verbatim: true,
    })) as Array<{ address: string; family: number }>;
  } catch {
    throw new HttpError(
      502,
      "ResultHostLookupFailed",
      "Result host could not be verified",
    );
  }
  if (
    !addresses.length ||
    addresses.some((entry) =>
      entry.family === 4
        ? isPrivateIpv4(entry.address)
        : isPrivateIpv6(entry.address),
    )
  ) {
    throw new HttpError(
      422,
      "UnsafeResultUrl",
      "Result host resolved to a prohibited network",
    );
  }
  return url;
}

export async function downloadValidatedResultUrl(
  initialUrl: string,
  maximumBytes: number,
) {
  let url = await assertSafeResultUrl(initialUrl);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "image/*,video/*" },
      });
    } catch {
      clearTimeout(timeout);
      throw new HttpError(
        502,
        "ResultDownloadFailed",
        "Generated result could not be downloaded",
      );
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      clearTimeout(timeout);
      const location = response.headers.get("location");
      if (!location || redirects === 3)
        throw new HttpError(
          502,
          "ResultRedirectRejected",
          "Generated result redirected outside the supported limit",
        );
      url = await assertSafeResultUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) {
      clearTimeout(timeout);
      throw new HttpError(
        502,
        "ResultDownloadFailed",
        "Generated result could not be downloaded",
      );
    }
    const declared = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(declared) && declared > maximumBytes) {
      clearTimeout(timeout);
      throw new HttpError(
        422,
        "ResultTooLarge",
        "Generated result exceeds the durable-ingestion limit",
      );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        clearTimeout(timeout);
        throw new HttpError(
          422,
          "ResultTooLarge",
          "Generated result exceeds the durable-ingestion limit",
        );
      }
      chunks.push(value);
    }
    clearTimeout(timeout);
    return Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      total,
    );
  }
  throw new HttpError(
    502,
    "ResultDownloadFailed",
    "Generated result could not be downloaded",
  );
}
