const FORMULA_PREFIX = /^[\s\u0000-\u001f]*[=+\-@]/;

export function safeFilename(value: string, fallback = "asset") {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\\/\x00-\x1f\x7f]/g, "-")
    .replace(/\s+/g, "-");
  const cleaned = normalized
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const result = (cleaned || fallback).slice(0, 180);
  return result || fallback;
}

export function brandedDownloadFilename(
  projectName: string,
  mediaKind: "image" | "video" | "audio" | "document" | "other",
  extension: string,
) {
  const project = safeFilename(projectName, "project").slice(0, 80);
  const safeExtension =
    extension
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || "bin";
  return `VesperFrame-${project}-${mediaKind}-${new Date().toISOString().replace(/[:.]/g, "-")}.${safeExtension}`;
}

export function hardenCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  const hardened = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${hardened.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]) {
  return values.map(hardenCsvCell).join(",") + "\r\n";
}
