import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import {
  apiError,
  correlationId,
  HttpError,
  readLimitedJson,
} from "@/lib/http";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { requireWorkspaceContext } from "@/server/auth/workspace";
import { sanitizePrototypeImport } from "@/server/import/prototype";

export const runtime = "nodejs";

const requestSchema = z
  .object({ workspaceId: z.string().uuid(), payload: z.unknown() })
  .strict();

export async function POST(request: Request) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { supabase, userId } = await requireApiUser();
    const body = requestSchema.parse(await readLimitedJson(request, 1_048_576));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    const imported = sanitizePrototypeImport(body.payload);
    const { data, error } = await supabase.rpc("import_prototype_snapshot", {
      target_workspace_id: body.workspaceId,
      source_key_value: "prototype-browser-v1",
      payload_hash_value: imported.payloadHash,
      project_name_value: imported.projectName,
      sanitized_payload_value: imported.sanitized,
      summary_value: imported.summary,
    });
    if (error)
      throw new HttpError(
        error.code === "23505" ? 409 : 422,
        "PrototypeImportFailed",
        error.code === "23505"
          ? "Prototype data was already imported for this account"
          : "Prototype data could not be imported",
      );
    return Response.json(data, {
      status: 201,
      headers: { "Cache-Control": "no-store", "x-request-id": requestId },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
