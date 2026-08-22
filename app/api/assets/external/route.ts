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

export const runtime = "nodejs";

const schema = z
  .object({
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid(),
    label: z.string().trim().min(1).max(120),
    externalId: z.string().regex(/^[A-Za-z0-9._:-]{3,200}$/),
    role: z.enum(["character", "reference_audio"]),
  })
  .strict();

export async function POST(request: Request) {
  const requestId = correlationId(request);
  try {
    assertTrustedOrigin(request);
    const { supabase, userId } = await requireApiUser();
    const body = schema.parse(await readLimitedJson(request, 16_384));
    await requireWorkspaceContext(supabase, userId, body.workspaceId, "edit");
    const { data, error } = await supabase.rpc(
      "create_external_reference_asset",
      {
        target_workspace_id: body.workspaceId,
        target_project_id: body.projectId,
        reference_label: body.label,
        external_id_value: body.externalId,
        requested_role: body.role,
      },
    );
    if (error)
      throw new HttpError(
        422,
        "ExternalReferenceFailed",
        "External reference could not be created",
      );
    return Response.json(
      { reference: data },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", "x-request-id": requestId },
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
