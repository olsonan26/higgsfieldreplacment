import { NextResponse } from "next/server";
import { getKieKey, kieRequest, safeError } from "@/lib/kie";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { key } = await getKieKey();
    if (!key) return NextResponse.json({ error: "Connect a Kie.ai API key in Settings first." }, { status: 401 });
    const body = await request.json();
    const model = typeof body?.model === "string" ? body.model.trim() : "";
    const input = body?.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : null;
    if (!model || model.length > 250 || !input || typeof input.prompt !== "string" || !input.prompt.trim()) {
      return NextResponse.json({ error: "A model id and non-empty input.prompt are required." }, { status: 400 });
    }
    const result = await kieRequest("/api/v1/jobs/createTask", key, {
      method: "POST",
      body: JSON.stringify({ model, input }),
    });
    const taskId = result?.data?.taskId;
    if (!taskId) return NextResponse.json({ error: "Kie.ai accepted the request but returned no task id." }, { status: 502 });
    return NextResponse.json({ taskId, model, state: "waiting" });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 502 });
  }
}
