import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { compositeImageLayers } from "@/server/assets/layer-composite";

const defaults = {
  brightness: 1,
  saturation: 1,
  blur: 0,
  sharpen: 0,
  rotate: 0 as const,
};

async function solid(red: number, green: number, blue: number) {
  return sharp({
    create: {
      width: 4,
      height: 3,
      channels: 4,
      background: { r: red, g: green, b: blue, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe("durable layer compositor", () => {
  it("renders a bounded PNG and applies overlay opacity", async () => {
    const output = await compositeImageLayers(
      [
        { buffer: await solid(240, 0, 0), opacity: 1, blend: "over" },
        { buffer: await solid(0, 0, 240), opacity: 0.5, blend: "over" },
      ],
      defaults,
    );
    const { data, info } = await sharp(output).raw().toBuffer({
      resolveWithObject: true,
    });
    expect(info).toMatchObject({ width: 4, height: 3, channels: 4 });
    expect(data[0]).toBeGreaterThan(100);
    expect(data[2]).toBeGreaterThan(100);
    expect(output.subarray(1, 4).toString()).toBe("PNG");
  });

  it("rejects an empty or oversized stack before rendering", async () => {
    await expect(compositeImageLayers([], defaults)).rejects.toMatchObject({
      status: 422,
      code: "LayerCountInvalid",
    });
    const base = {
      buffer: await solid(0, 0, 0),
      opacity: 1,
      blend: "over" as const,
    };
    await expect(
      compositeImageLayers(
        Array.from({ length: 6 }, () => base),
        defaults,
      ),
    ).rejects.toMatchObject({ status: 422, code: "LayerCountInvalid" });
  });

  it("rotates the finished composite instead of misaligning its overlays", async () => {
    const output = await compositeImageLayers(
      [
        { buffer: await solid(0, 40, 0), opacity: 1, blend: "over" },
        { buffer: await solid(0, 0, 220), opacity: 0.4, blend: "screen" },
      ],
      { ...defaults, rotate: 90 },
    );
    await expect(sharp(output).metadata()).resolves.toMatchObject({
      width: 3,
      height: 4,
    });
  });
});
