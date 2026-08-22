import { getOptionalServerReadiness } from "@/lib/env";

export function GET() {
  const checks = getOptionalServerReadiness();
  const ready = Object.values(checks).every(Boolean);
  return Response.json(
    { status: ready ? "ready" : "not-ready", checks },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
