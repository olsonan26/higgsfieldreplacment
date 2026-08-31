import { getOptionalServerReadiness } from "@/lib/env";

export function GET() {
  const checks = getOptionalServerReadiness();
  const ready = Object.entries(checks)
    .filter(([name]) => name !== "ltx25Credential")
    .every(([, configured]) => configured);
  return Response.json(
    { status: ready ? "ready" : "not-ready", checks },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
