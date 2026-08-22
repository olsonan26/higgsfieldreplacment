export type MediaKind = "image" | "video" | "audio";

export type KieModel = {
  id: string;
  label: string;
  vendor: string;
  kind: MediaKind;
  description: string;
  badge?: string;
  referenceField?: string;
  defaults: Record<string, unknown>;
  costNote: string;
};

export const KIE_MODELS: KieModel[] = [
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    vendor: "Google",
    kind: "image",
    description: "Fast, polished image creation with strong text and layout handling.",
    badge: "POPULAR",
    referenceField: "image_input",
    defaults: { aspect_ratio: "16:9", resolution: "1K", output_format: "png", image_input: [] },
    costNote: "Kie credits vary by resolution and current model pricing.",
  },
  {
    id: "gpt-image-2-text-to-image",
    label: "GPT Image 2",
    vendor: "OpenAI via Kie",
    kind: "image",
    description: "Precise instruction following and cinematic text-to-image generation.",
    badge: "NEW",
    defaults: { aspect_ratio: "auto" },
    costNote: "Kie credits vary by model settings.",
  },
  {
    id: "grok-imagine-image-2-0/text-to-image",
    label: "Grok Imagine Image 2.0",
    vendor: "xAI via Kie",
    kind: "image",
    description: "Photoreal image generation with a compact, flexible input contract.",
    defaults: { aspect_ratio: "16:9" },
    costNote: "Kie credits vary by model settings.",
  },
  {
    id: "bytedance/seedance-2",
    label: "Seedance 2.0",
    vendor: "ByteDance via Kie",
    kind: "video",
    description: "Multimodal cinematic video with references, audio, and camera-aware motion.",
    badge: "DIRECTOR",
    referenceField: "reference_image_urls",
    defaults: {
      aspect_ratio: "16:9",
      resolution: "720p",
      duration: 5,
      generate_audio: false,
      return_last_frame: false,
      web_search: false,
      reference_image_urls: [],
    },
    costNote: "Video spend depends on duration, resolution, and audio.",
  },
  {
    id: "kling-3.0/video",
    label: "Kling 3.0",
    vendor: "Kuaishou via Kie",
    kind: "video",
    description: "Premium single-shot or multi-shot video with sound and element references.",
    badge: "PRO",
    referenceField: "image_urls",
    defaults: { aspect_ratio: "16:9", duration: "5", mode: "pro", sound: true, multi_shots: false, image_urls: [] },
    costNote: "Pro and 4K modes consume more Kie credits.",
  },
  {
    id: "grok-imagine/text-to-video",
    label: "Grok Imagine Video",
    vendor: "xAI via Kie",
    kind: "video",
    description: "Fast text-to-video for concept passes and visual exploration.",
    defaults: { aspect_ratio: "16:9", mode: "normal", duration: "6", resolution: "480p" },
    costNote: "Kie credits vary by duration and resolution.",
  },
  {
    id: "wan/2-7-text-to-video",
    label: "Wan 2.7",
    vendor: "Alibaba via Kie",
    kind: "video",
    description: "High-resolution text-to-video with prompt extension and seed control.",
    defaults: { ratio: "16:9", resolution: "1080p", duration: 5, prompt_extend: true, watermark: false },
    costNote: "Kie credits vary by duration and resolution.",
  },
  {
    id: "gemini-omni-video",
    label: "Gemini Omni Video",
    vendor: "Google via Kie",
    kind: "video",
    description: "Multimodal video generation with images, audio identities, and source video.",
    referenceField: "image_urls",
    defaults: { duration: "4", image_urls: [] },
    costNote: "Kie credits vary by media inputs and duration.",
  },
];

export function modelsFor(kind: MediaKind) {
  return KIE_MODELS.filter((model) => model.kind === kind);
}

export function modelById(id: string) {
  return KIE_MODELS.find((model) => model.id === id);
}
