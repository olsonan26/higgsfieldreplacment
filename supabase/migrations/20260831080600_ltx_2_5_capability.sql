-- LTX-2.5 runs on VesperFrame's private RunPod worker. It is deliberately not
-- added to any workspace spending policy here; an owner/admin must enable the
-- model and set an explicit compute reserve after the endpoint is provisioned.
insert into public.model_capabilities (
  app_model_key,
  version,
  media_kind,
  manifest,
  source_url,
  provider_schema_version,
  verified_at,
  fixture_hash,
  enabled
)
values (
  'ltx-2-5',
  1,
  'video',
  $manifest${"contractVersion":"1.0.0","appModelKey":"ltx-2-5","version":1,"displayName":"LTX-2.5","modelMaker":"Lightricks","mediaKind":"video","adapter":"ltx25","providerModelId":"self-hosted/ltx-2.5-distilled","supportedModes":["text-to-video","first-frame-to-video"],"prompt":{"minimum":3,"maximum":20000},"negativePrompt":{"supported":false},"technical":[{"key":"resolution","label":"Resolution","providerField":"resolution","kind":"enum","values":["720p","1080p"],"required":true,"defaultValue":{"value":"720p","source":"application"},"help":"VesperFrame maps this to dimensions divisible by 64 for the official two-stage distilled pipeline."},{"key":"aspectRatio","label":"Aspect ratio","providerField":"aspect_ratio","kind":"enum","values":["16:9","9:16","1:1"],"required":true,"defaultValue":{"value":"16:9","source":"application"},"help":"Landscape, portrait, or square dimensions validated by the worker."},{"key":"duration","label":"Duration","providerField":"duration","kind":"enum","values":["auto","5","10"],"required":true,"defaultValue":{"value":"5","source":"application"},"help":"Auto uses the LTX-2.5 duration head; fixed durations compile to a frame count of 8k+1."},{"key":"frameRate","label":"Frame rate","providerField":"frame_rate","kind":"enum","values":[24],"required":true,"defaultValue":{"value":24,"source":"application"},"help":"The initial production profile is fixed at 24 fps."},{"key":"promptExtend","label":"Prompt enhancement","providerField":"enhance_prompt","kind":"boolean","required":true,"defaultValue":{"value":false,"source":"application"},"help":"Use the official optional prompt-enhancement stage."},{"key":"seed","label":"Seed","providerField":"seed","kind":"integer","minimum":0,"maximum":2147483647,"step":1,"required":false,"help":"Optional deterministic seed."}],"references":[{"role":"first_frame","label":"First frame","providerField":"images","inputKind":"image","minimum":0,"maximum":1,"acceptedMimeTypes":["image/jpeg","image/png"],"maxBytes":20000000,"requiresGroup":false}],"referenceExclusivity":[],"incompatibilities":[],"audioBehavior":{"behavior":"always-generated","notes":"The official distilled pipeline jointly generates synchronized video and audio; no decorative audio toggle is shown."},"costWarning":{"estimateAvailable":false,"text":"Self-hosted compute cost depends on RunPod GPU time and cold starts. Usage remains estimated until the worker reports runtime metadata."},"source":{"documentationUrl":"https://huggingface.co/Lightricks/LTX-2.5","providerSchemaVersion":"ltx-pipelines-a95ab856","verifiedAt":"2026-08-31"}}$manifest$::jsonb,
  'https://huggingface.co/Lightricks/LTX-2.5',
  'ltx-pipelines-a95ab856',
  '2026-08-31T00:00:00Z'::timestamptz,
  '76b4592a1f37fe92a0151c8ca6d09b78825ebc8cc5c40a0454daffd9e6585055',
  true
)
on conflict (app_model_key, version) do nothing;
