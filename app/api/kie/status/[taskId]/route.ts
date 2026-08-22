import { NextResponse } from "next/server";
import { getKieKey, kieRequest, normalizeTask, safeError } from "@/lib/kie";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { key } = await getKieKey();
    if (!key) return NextResponse.json({ error: "Connect a Kie.ai API key in Settings first." }, { status: 401 });
    const { taskId } = await params;
    if (!/^[A-Za-z0-9_.:-]{4,250}$/.test(taskId)) {
      return NextResponse.json({ error: "Invalid task id." }, { status: 400 });
    }
    const result = await kieRequest(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, key);
    return NextResponse.json(normalizeTask(result));
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 502 });
  }
}
