import { NextResponse } from "next/server";
import { getKieKey, KIE_UPLOAD_BASE, kieRequest, safeError } from "@/lib/kie";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { key } = await getKieKey();
    if (!key) return NextResponse.json({ error: "Connect a Kie.ai API key in Settings first." }, { status: 401 });
    const body = await request.json();
    const base64Data = typeof body?.base64Data === "string" ? body.base64Data : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) : "reference.png";
    if (!base64Data.startsWith("data:") || base64Data.length > 14_000_000) {
      return NextResponse.json({ error: "Upload a valid image, video, or audio file under 10 MB." }, { status: 400 });
    }
    const result = await kieRequest("/api/file-base64-upload", key, {
      method: "POST",
      body: JSON.stringify({ base64Data, uploadPath: "higgsfield-replacement/references", fileName }),
    }, KIE_UPLOAD_BASE);
    const url = result?.data?.downloadUrl || result?.data?.fileUrl;
    if (!url) return NextResponse.json({ error: "Kie.ai uploaded the file but returned no URL." }, { status: 502 });
    return NextResponse.json({ url, fileName: result?.data?.fileName || fileName, expiresAt: result?.data?.expiresAt || null });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 502 });
  }
}
