import "server-only";

import sharp, { type Blend } from "sharp";
import { HttpError } from "@/lib/http";

export type LayerInput = {
  buffer: Buffer;
  opacity: number;
  blend: "over" | "multiply" | "screen" | "overlay";
};

export type LayerAdjustments = {
  brightness: number;
  saturation: number;
  blur: number;
  sharpen: number;
  rotate: 0 | 90 | 180 | 270;
};

async function overlayBuffer(layer: LayerInput, width: number, height: number) {
  const { data, info } = await sharp(layer.buffer, {
    limitInputPixels: 100_000_000,
  })
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (layer.opacity < 1) {
    for (let index = 3; index < data.length; index += 4) {
      data[index] = Math.round(data[index] * layer.opacity);
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function compositeImageLayers(
  layers: LayerInput[],
  adjustments: LayerAdjustments,
) {
  if (layers.length < 1 || layers.length > 5)
    throw new HttpError(
      422,
      "LayerCountInvalid",
      "Choose between one and five image layers",
    );
  const base = sharp(layers[0].buffer, { limitInputPixels: 100_000_000 });
  const metadata = await base.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > 40_000_000
  )
    throw new HttpError(
      422,
      "LayerDimensionsInvalid",
      "The base layer dimensions are unsupported",
    );

  const overlays = await Promise.all(
    layers.slice(1).map(async (layer) => ({
      input: await overlayBuffer(layer, metadata.width!, metadata.height!),
      blend: layer.blend as Blend,
      gravity: "centre" as const,
    })),
  );
  let compositePipeline = base.modulate({
    brightness: adjustments.brightness,
    saturation: adjustments.saturation,
  });
  if (overlays.length)
    compositePipeline = compositePipeline.composite(overlays);
  let pipeline = sharp(await compositePipeline.png().toBuffer());
  if (adjustments.rotate) pipeline = pipeline.rotate(adjustments.rotate);
  if (adjustments.blur > 0) pipeline = pipeline.blur(adjustments.blur);
  if (adjustments.sharpen > 0)
    pipeline = pipeline.sharpen({ sigma: adjustments.sharpen });
  return pipeline.png({ compressionLevel: 8 }).toBuffer();
}
