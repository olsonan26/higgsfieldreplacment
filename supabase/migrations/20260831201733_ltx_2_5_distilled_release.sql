-- The separately gated DFR detailing LoRA is not present in the deployed
-- worker volume. Retire capability v2 so the UI cannot offer a production
-- control that the worker cannot honor. Historical generation snapshots remain
-- immutable; this forward version exposes only the installed distilled path.
alter table public.model_capabilities disable trigger capability_immutable;
update public.model_capabilities
set enabled = false
where app_model_key = 'ltx-2-5' and version = 2 and enabled;
alter table public.model_capabilities enable trigger capability_immutable;

insert into public.model_capabilities (
  app_model_key, version, media_kind, manifest, source_url,
  provider_schema_version, verified_at, fixture_hash, enabled
)
values (
  'ltx-2-5',
  3,
  'video',
  $manifest${"adapter":"ltx25","appModelKey":"ltx-2-5","audioBehavior":{"behavior":"always-generated","notes":"The official distilled pipeline jointly generates synchronized video and audio; no decorative audio toggle is shown."},"contractVersion":"1.0.0","costWarning":{"estimateAvailable":false,"text":"This release uses the official distilled pipeline. Self-hosted compute cost depends on RunPod GPU time and cold starts; usage remains estimated until the worker reports runtime metadata."},"displayName":"LTX-2.5","incompatibilities":[],"mediaKind":"video","modelMaker":"Lightricks","negativePrompt":{"supported":false},"prompt":{"maximum":20000,"minimum":3},"providerModelId":"self-hosted/ltx-2.5-distilled","referenceExclusivity":[],"references":[{"acceptedMimeTypes":["image/jpeg","image/png"],"inputKind":"image","label":"First frame","maxBytes":20000000,"maximum":1,"minimum":0,"providerField":"images","requiresGroup":false,"role":"first_frame"}],"source":{"documentationUrl":"https://huggingface.co/Lightricks/LTX-2.5","providerSchemaVersion":"ltx-pipelines-a95ab856","verifiedAt":"2026-08-31"},"supportedModes":["text-to-video","first-frame-to-video"],"technical":[{"defaultValue":{"source":"application","value":"720p"},"help":"VesperFrame maps this to dimensions divisible by 64 for the official two-stage distilled pipeline.","key":"resolution","kind":"enum","label":"Resolution","providerField":"resolution","required":true,"values":["720p","1080p"]},{"defaultValue":{"source":"application","value":"16:9"},"help":"Landscape, portrait, or square dimensions validated by the worker.","key":"aspectRatio","kind":"enum","label":"Aspect ratio","providerField":"aspect_ratio","required":true,"values":["16:9","9:16","1:1"]},{"defaultValue":{"source":"application","value":"5"},"help":"Auto uses the LTX-2.5 duration head; fixed durations compile to a frame count of 8k+1.","key":"duration","kind":"enum","label":"Duration","providerField":"duration","required":true,"values":["auto","5","10"]},{"defaultValue":{"source":"application","value":24},"help":"The deployed distilled profile is fixed at 24 fps.","key":"frameRate","kind":"enum","label":"Frame rate","providerField":"frame_rate","required":true,"values":[24]},{"defaultValue":{"source":"application","value":false},"help":"Use the official optional prompt-enhancement stage.","key":"promptExtend","kind":"boolean","label":"Prompt enhancement","providerField":"enhance_prompt","required":true},{"help":"Optional deterministic seed.","key":"seed","kind":"integer","label":"Seed","maximum":2147483647,"minimum":0,"providerField":"seed","required":false,"step":1}],"version":3}$manifest$::jsonb,
  'https://huggingface.co/Lightricks/LTX-2.5',
  'ltx-pipelines-a95ab856',
  '2026-08-31T00:00:00Z'::timestamptz,
  'd197458e2d51fd409460ddfcbd39a45aa8c3bd90e31442091170ba320cc757c8',
  true
)
on conflict (app_model_key, version) do nothing;
