import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encodeKey, getKieKey, KIE_COOKIE, kieRequest, safeError } from "@/lib/kie";

export const runtime = "nodejs";

async function creditFor(key: string) {
  const result = await kieRequest("/api/v1/chat/credit", key);
  return typeof result?.data === "number" ? result.data : null;
}

export async function GET() {
  const { key, source } = await getKieKey();
  if (!key) return NextResponse.json({ connected: false, source, credits: null });
  try {
    const credits = await creditFor(key);
    return NextResponse.json({ connected: true, verified: true, source, credits });
  } catch (error) {
    return NextResponse.json({ connected: true, verified: false, source, credits: null, error: safeError(error) });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (key.length < 12 || key.length > 1000) {
      return NextResponse.json({ error: "Enter a valid Kie.ai API key." }, { status: 400 });
    }
    const credits = await creditFor(key);
    const store = await cookies();
    store.set(KIE_COOKIE, encodeKey(key), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/kie",
      ...(body?.remember ? { maxAge: 60 * 60 * 24 * 30 } : {}),
    });
    return NextResponse.json({ connected: true, verified: true, source: "session", credits });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 401 });
  }
}

export async function DELETE() {
  const store = await cookies();
  store.set(KIE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/kie", maxAge: 0 });
  return NextResponse.json({ connected: false, source: process.env.KIE_API_KEY ? "server" : "none" });
}
