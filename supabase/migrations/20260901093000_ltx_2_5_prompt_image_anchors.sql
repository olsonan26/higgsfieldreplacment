-- LTX-2.5 v4 adds truthful support for the official repeatable --image
-- conditioning flag. VesperFrame limits a request to nine visual anchors and
-- keeps the worker on the installed distilled pipeline.
alter table public.model_capabilities disable trigger capability_immutable;
update public.model_capabilities
set enabled = false
where app_model_key = 'ltx-2-5' and version = 3 and enabled;
alter table public.model_capabilities enable trigger capability_immutable;

insert into public.model_capabilities (
  app_model_key, version, media_kind, manifest, source_url,
  provider_schema_version, verified_at, fixture_hash, enabled
)
values (
  'ltx-2-5',
  4,
  'video',
  $manifest${"contractVersion":"1.0.0","appModelKey":"ltx-2-5","version":4,"displayName":"LTX-2.5","modelMaker":"Lightricks","mediaKind":"video","adapter":"ltx25","providerModelId":"self-hosted/ltx-2.5-distilled","supportedModes":["text-to-video","first-frame-to-video","prompt-image-anchors-to-video"],"prompt":{"minimum":3,"maximum":20000},"negativePrompt":{"supported":false},"technical":[{"key":"resolution","label":"Resolution","providerField":"resolution","kind":"enum","values":["720p","1080p"],"required":true,"defaultValue":{"value":"720p","source":"application"},"help":"VesperFrame maps this to dimensions divisible by 64 for the official LTX-2.5 distilled pipeline."},{"key":"aspectRatio","label":"Aspect ratio","providerField":"aspect_ratio","kind":"enum","values":["16:9","9:16","1:1"],"required":true,"defaultValue":{"value":"16:9","source":"application"},"help":"Landscape, portrait, or square dimensions validated by the private worker."},{"key":"duration","label":"Duration","providerField":"duration","kind":"enum","values":["auto","5","10","12"],"required":true,"defaultValue":{"value":"auto","source":"application"},"help":"Auto uses the duration head up to 12 seconds. Twelve seconds is the longest fixed profile enabled on this worker."},{"key":"frameRate","label":"Frame rate","providerField":"frame_rate","kind":"enum","values":[24],"required":true,"defaultValue":{"value":24,"source":"application"},"help":"The deployed distilled profile is fixed at 24 fps."},{"key":"promptExtend","label":"Prompt enhancement","providerField":"enhance_prompt","kind":"boolean","required":true,"defaultValue":{"value":false,"source":"application"},"help":"Use the official optional prompt-enhancement stage."},{"key":"seed","label":"Seed","providerField":"seed","kind":"integer","minimum":0,"maximum":2147483647,"step":1,"required":false,"help":"Optional deterministic seed."}],"references":[{"role":"first_frame","label":"Opening image (@image / @image1)","providerField":"images","inputKind":"image","minimum":0,"maximum":1,"acceptedMimeTypes":["image/jpeg","image/png"],"maxBytes":20000000,"requiresGroup":false},{"role":"reference_image","label":"Prompt image (@image1 … @image9)","providerField":"images","inputKind":"image","minimum":0,"maximum":9,"acceptedMimeTypes":["image/jpeg","image/png"],"maxBytes":20000000,"requiresGroup":false}],"referenceExclusivity":[],"combinedMediaQuota":{"limit":9,"weights":{"first_frame":1,"reference_image":1},"reason":"LTX-2.5 accepts at most nine visual anchors in one generation."},"incompatibilities":[],"audioBehavior":{"behavior":"always-generated","notes":"The official distilled pipeline jointly generates synchronized video and audio; no decorative audio toggle is shown."},"costWarning":{"estimateAvailable":false,"text":"This release uses the official distilled pipeline. Self-hosted compute cost depends on RunPod GPU time and cold starts; usage remains estimated until the worker reports runtime metadata."},"source":{"documentationUrl":"https://huggingface.co/Lightricks/LTX-2.5","providerSchemaVersion":"ltx-pipelines-a95ab856-multi-image","verifiedAt":"2026-09-01"}}$manifest$::jsonb,
  'https://huggingface.co/Lightricks/LTX-2.5',
  'ltx-pipelines-a95ab856-multi-image',
  '2026-09-01T00:00:00Z'::timestamptz,
  '0ebe723dc67b6bdb079de04c9ad125549a49c69dd85edaea75afa39ac461d18a',
  true
)
on conflict (app_model_key, version) do nothing;
