import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brandedDownloadFilename,
  csvRow,
  hardenCsvCell,
  safeFilename,
} from "@/lib/files";

describe("download and export hardening", () => {
  afterEach(() => vi.useRealTimers());

  it("normalizes unsafe filenames and constrains extensions", () => {
    expect(safeFilename("../Scene \\ one?.PNG")).toBe("Scene-one-.PNG");
    expect(safeFilename("...", "asset")).toBe("asset");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:34:56.000Z"));
    expect(
      brandedDownloadFilename("My / Project", "video", ".MP4<script>"),
    ).toBe("VesperFrame-My-Project-video-2026-08-22T12-34-56-000Z.mp4scrip");
  });

  it("prevents spreadsheet formula execution and escapes CSV quotes", () => {
    expect(hardenCsvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(hardenCsvCell("  +SUM(1,2)")).toBe('"\'  +SUM(1,2)"');
    expect(csvRow(["safe", null, "@cmd"])).toBe('"safe","","\'@cmd"\r\n');
  });
});
