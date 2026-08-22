import { describe, expect, it } from "vitest";
import { sanitizePrototypeImport } from "@/server/import/prototype";

describe("prototype import", () => {
  it("retains useful metadata while stripping transport data and marking usage unverified", () => {
    const result = sanitizePrototypeImport({
      projectName: "Midnight Production",
      references: [
        {
          id: "ref-1",
          name: "subject.png",
          type: "image",
          createdAt: "2026-08-20T00:00:00.000Z",
          url: "https://temporary.example/private.png",
        },
      ],
      jobs: [
        {
          id: "job-1",
          taskId: "paid-task-secret",
          model: "private/provider-id",
          modelLabel: "Video model",
          kind: "video",
          prompt: "A quiet night drive",
          state: "success",
          progress: 100,
          resultUrls: ["https://temporary.example/output.mp4"],
          createdAt: "2026-08-21T00:00:00.000Z",
          creditsConsumed: 2,
        },
      ],
      favorites: ["job-1"],
    });
    expect(result.projectName).toBe("Imported — Midnight Production");
    expect(result.sanitized.references[0]).not.toHaveProperty("url");
    expect(result.sanitized.jobs[0]).not.toHaveProperty("taskId");
    expect(result.sanitized.jobs[0]).not.toHaveProperty("resultUrls");
    expect(result.sanitized.jobs[0]).not.toHaveProperty("model");
    expect(result.sanitized.jobs[0].usageStatus).toBe("unverified-historical");
    expect(result.summary).toEqual({
      referenceCount: 1,
      historicalJobCount: 1,
      favoriteCount: 1,
      authoritativeUsageEntries: 0,
    });
    expect(result.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
