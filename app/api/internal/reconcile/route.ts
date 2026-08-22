import { timingSafeEqual } from "node:crypto";
import { getServerEnvironment } from "@/lib/env";
import { reconcileDueGenerations } from "@/server/generation/reconcile";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const supplied = (request.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  const expected = getServerEnvironment().CRON_SECRET;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request))
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const result = await reconcileDueGenerations({ limit: 20 });
    return Response.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, error: "Reconciliation failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
