import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, correlationId, readLimitedJson } from "@/lib/http";
import { generationDraftSchema } from "@/lib/generation/request-schema";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { requireWorkspaceContext } from "@/server/auth/workspace";
import { resolveGenerationDraft } from "@/server/generation/resolve-draft";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { supabase, userId } = await requireApiUser();
    const draft = generationDraftSchema.parse(await readLimitedJson(request));
    const workspace = await requireWorkspaceContext(
      supabase,
      userId,
      draft.workspaceId,
      "view",
    );
    const { compiled } = await resolveGenerationDraft(supabase, draft);
    return NextResponse.json(
      {
        preflightVersion: "1.0",
        canSubmit: workspace.role !== "viewer" && workspace.generationAllowed,
        compiledPrompt: compiled.compiledPrompt,
        effectiveSettings: compiled.effectiveSettings,
        references: compiled.referenceSummary,
        skills: compiled.skillSummary,
        batchCount: draft.batchCount,
        warnings: compiled.warnings,
        sanitizedRequestPreview: compiled.sanitizedRequestPreview,
        capabilityVersion: compiled.capabilityVersion,
        requestHash: compiled.requestHash,
      },
      { headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
