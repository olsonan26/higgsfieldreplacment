import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { apiError, correlationId, HttpError } from "@/lib/http";
import { requireWorkspaceContext } from "@/server/auth/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = correlationId(request);
  try {
    const { supabase, userId } = await requireApiUser();
    const workspaceId = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("workspaceId"));
    await requireWorkspaceContext(supabase, userId, workspaceId, "view");
    const { data, error } = await supabase
      .from("usage_ledger")
      .select(
        "id, batch_id, generation_id, actor_id, entry_kind, credits, authoritative, metadata, created_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error)
      throw new HttpError(
        500,
        "LedgerReadFailed",
        "Usage ledger could not be loaded",
      );
    return Response.json(
      { entries: data },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
