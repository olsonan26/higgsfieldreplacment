import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProviderTask,
  getProviderTask,
  normalizeRunpodTask,
} from "@/server/providers/generation-provider/adapter";

function configureRunpod() {
  vi.stubEnv("RUNPOD_API_KEY", "runpod-test-key-long-enough");
  vi.stubEnv("RUNPOD_ENDPOINT_ID", "endpoint-123");
  vi.stubEnv("RUNPOD_API_BASE_URL", "https://api.runpod.test/v2");
}

describe("private LTX-2.5 RunPod adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("submits asynchronously with a neutral callback and prefixes the task id", async () => {
    configureRunpod();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "job-123", status: "IN_QUEUE" }), {
        status: 200,
      }),
    );
    const result = await createProviderTask({
      model: "self-hosted/ltx-2.5-distilled",
      input: { prompt: "A quiet mountain lake" },
      callbackUrl:
        "https://vesper.example/api/webhooks/generation-provider?generation=00000000-0000-4000-8000-000000000000&correlation=abcdefghijklmnopqrstuvwxyz0123456789",
    });
    expect(result).toEqual({ taskId: "runpod:job-123" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.runpod.test/v2/endpoint-123/run");
    expect(JSON.parse(String(init?.body))).toEqual({
      input: { prompt: "A quiet mountain lake" },
      webhook: expect.stringContaining("backend=runpod"),
    });
  });

  it("normalizes completed private-storage output without accepting URLs", () => {
    expect(
      normalizeRunpodTask({
        id: "job-123",
        status: "COMPLETED",
        output: {
          storagePaths: [
            "workspace/project/generation/VesperFrame-generation-1.mp4",
          ],
          resultUrls: ["https://attacker.example/result.mp4"],
        },
      }),
    ).toMatchObject({
      taskId: "runpod:job-123",
      state: "success",
      resultUrls: [],
      storagePaths: [
        "workspace/project/generation/VesperFrame-generation-1.mp4",
      ],
    });
  });

  it("reconciles prefixed tasks against the configured endpoint", async () => {
    configureRunpod();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "job-123", status: "IN_PROGRESS" }), {
        status: 200,
      }),
    );
    const result = await getProviderTask("runpod:job-123");
    expect(result.state).toBe("running");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.runpod.test/v2/endpoint-123/status/job-123",
    );
  });
});
