import { describe, expect, it } from "vitest";
import { decodeKey, encodeKey, normalizeTask } from "../lib/kie";

describe("Kie task normalization", () => {
  it("parses the unified Market result contract", () => {
    const task = normalizeTask({ data: { taskId: "task_1", state: "success", progress: 100, creditsConsumed: 12, resultJson: JSON.stringify({ resultUrls: ["https://cdn.example/result.png"] }) } });
    expect(task.state).toBe("success");
    expect(task.resultUrls).toEqual(["https://cdn.example/result.png"]);
    expect(task.creditsConsumed).toBe(12);
  });

  it("maps numeric success flags and nested video URLs", () => {
    const task = normalizeTask({ data: { taskId: "task_2", successFlag: 1, response: { videoInfo: { videoUrl: "https://cdn.example/result.mp4" } } } });
    expect(task.state).toBe("success");
    expect(task.progress).toBe(100);
    expect(task.resultUrls).toContain("https://cdn.example/result.mp4");
  });
});

describe("session key encoding", () => {
  it("round trips without exposing the plain value in cookie text", () => {
    const key = "kie_test_secret_value";
    const encoded = encodeKey(key);
    expect(encoded).not.toContain(key);
    expect(decodeKey(encoded)).toBe(key);
  });
});
