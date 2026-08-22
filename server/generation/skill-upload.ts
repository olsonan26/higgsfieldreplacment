import "server-only";

import { createHash } from "node:crypto";
import { HttpError, RequestSizeError } from "@/lib/http";
import { normalizeSkillMarkdown } from "@/server/generation/compiler";

const MAX_MULTIPART_BYTES = 98_304;

export type ParsedSkillUpload = {
  fileName: string;
  markdown: string;
  contentSha256: string;
  name: string;
  description: string;
  mediaScope: "image" | "video" | "both";
};

export async function parseSkillUpload(
  request: Request,
  includeMetadata: boolean,
): Promise<ParsedSkillUpload> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_MULTIPART_BYTES)
    throw new RequestSizeError();
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_MULTIPART_BYTES) throw new RequestSizeError();
  const copy = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: bytes,
  });
  let form: FormData;
  try {
    form = await copy.formData();
  } catch {
    throw new HttpError(
      400,
      "InvalidMultipart",
      "Upload must be valid form data",
    );
  }
  const file = form.get("file");
  if (!(file instanceof File))
    throw new HttpError(
      400,
      "SkillFileRequired",
      "Choose a Markdown skill file",
    );
  if (
    !file.name.toLowerCase().endsWith(".md") ||
    file.name.length > 160 ||
    /[\\/\x00-\x1f]/.test(file.name)
  ) {
    throw new HttpError(
      422,
      "InvalidSkillFilename",
      "Generation Skills must use a safe .md filename",
    );
  }
  if (file.size < 1 || file.size > 65_536)
    throw new HttpError(
      422,
      "InvalidSkillSize",
      "Generation Skills must be 1 byte to 64 KiB",
    );
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new HttpError(
      422,
      "InvalidSkillEncoding",
      "Generation Skills must be valid UTF-8 Markdown",
    );
  }
  const markdown = normalizeSkillMarkdown(decoded);
  if (!markdown.length || markdown.length > 40_000 || markdown.includes("\0")) {
    throw new HttpError(
      422,
      "InvalidSkillContent",
      "Generation Skill content is empty or exceeds the validated limit",
    );
  }
  const fallbackName = file.name
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  const nameValue = includeMetadata
    ? String(form.get("name") || fallbackName).trim()
    : fallbackName;
  const descriptionValue = includeMetadata
    ? String(form.get("description") || "").trim()
    : "";
  const scopeValue = includeMetadata
    ? String(form.get("mediaScope") || "both")
    : "both";
  if (!nameValue || nameValue.length > 80)
    throw new HttpError(
      422,
      "InvalidSkillName",
      "Skill name must be 1 to 80 characters",
    );
  if (descriptionValue.length > 500)
    throw new HttpError(
      422,
      "InvalidSkillDescription",
      "Skill description must be at most 500 characters",
    );
  if (!(["image", "video", "both"] as string[]).includes(scopeValue))
    throw new HttpError(
      422,
      "InvalidSkillScope",
      "Skill scope must be image, video, or both",
    );
  return {
    fileName: file.name,
    markdown,
    contentSha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
    name: nameValue,
    description: descriptionValue,
    mediaScope: scopeValue as ParsedSkillUpload["mediaScope"],
  };
}

export function skillSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 54) || "skill";
  return `${base}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}
