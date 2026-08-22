# VesperFrame Model Capability Matrix

Status: implementation inventory. Provider contracts are versioned fixtures, not UI guesses. Official source pages and their verified date are stored with every capability; the checked-in registry and contract snapshots are the executable source of truth.

## Contract requirements

Every `ModelCapability` version records:

- stable application model key and private provider model identifier;
- media kind and supported generation modes;
- aspect ratios, resolutions, durations, output formats, audio behavior, seeds, negative prompts, prompt extension and watermark behavior where documented;
- reference roles, MIME kinds, per-role counts, combined media quota, ordering and incompatible combinations;
- prompt/negative-prompt limits, typed provider field mappings, defaults and explicit coercions;
- cost-warning metadata without inventing a price;
- provider schema version, primary documentation URL, verification date and fixture hash.

The UI may only render values in the selected capability. The server recompiles and revalidates the same capability version at preflight and reservation. An unknown model cannot use generic controls: an admin must provide a schema-valid capability manifest or use an explicit advanced-only payload editor that makes no support claims.

## Initial registry scope

| Application key        | Media | Required modes / behavior to verify                                               | References to verify                                                        | Primary source                                                  | Verification state                                         |
| ---------------------- | ----- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `seedance-2`           | Video | Resolution, aspect ratio, duration, audio generation, first/last frame and quotas | Image, video, audio, first frame, last frame                                | https://docs.kie.ai/market/bytedance/seedance-2                 | Verified 2026-08-22; fixture + payload snapshots committed |
| `kling-3-video`        | Video | Standard, professional and 4K modes; ratios; duration; multi-shot; sound          | First/last frame, named element/character, video and audio where documented | https://docs.kie.ai/market/kling/kling-3-0                      | Verified 2026-08-22; fixture + payload snapshots committed |
| `wan-2-7-text-video`   | Video | Negative prompt, resolution, ratio, duration, prompt extension, watermark, seed   | Optional audio URL                                                          | https://docs.kie.ai/market/wan/2-7-text-to-video                | Verified 2026-08-22; fixture + payload snapshots committed |
| `gemini-omni-video`    | Video | Supported duration/mode behavior and combined quota                               | Image, audio, video and character reference types                           | https://docs.kie.ai/market/gemini-omni-video                    | Verified 2026-08-22; fixture + payload snapshots committed |
| `nano-banana-2`        | Image | Exact aspect ratio, resolution and output format                                  | Exact image-reference behavior and count                                    | https://docs.kie.ai/market/google/nanobanana2                   | Verified 2026-08-22; fixture + payload snapshots committed |
| `gpt-image-2`          | Image | Exact aspect ratio, quality/format behavior                                       | Exact reference behavior                                                    | https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image        | Verified 2026-08-22; fixture + payload snapshots committed |
| `grok-imagine-image-2` | Image | Exact aspect ratio and output behavior                                            | Exact reference behavior                                                    | https://docs.kie.ai/market/grok-imagine-image-2-0/text-to-image | Verified 2026-08-22; fixture + payload snapshots committed |
| `grok-imagine-video`   | Video | Exact ratio, duration, resolution/mode behavior                                   | Exact supported references                                                  | https://docs.kie.ai/market/grok-imagine/text-to-video           | Verified 2026-08-22; fixture + payload snapshots committed |

Task lifecycle normalization is verified against https://docs.kie.ai/market/common/get-task-detail and covered by fixtures for pending, active, successful and failed terminal responses.

## Compiler invariants

`compileGenerationRequest` is pure and deterministic. Its output contains `compiledPrompt`, `providerPayload`, `warnings`, `capabilityVersion` and a sanitized request preview/hash. It must satisfy all of these invariants:

1. The raw prompt is never mutated.
2. Film setup, camera, movement, palette and lighting are compiled automatically on every preflight and Generate, whether or not Refine was opened.
3. Compiling the same input repeatedly produces byte-equivalent output and never duplicates creative instructions.
4. Changing any input invalidates the prior preview and produces a new immutable prompt/settings version on save or submission.
5. Every enabled control is either represented in the compiled prompt or in an exact documented provider field.
6. Unsupported values, references and combinations fail before any spend reservation.
7. Coercions are explicit warnings in preflight and never silent approximations.
8. Sanitized previews omit credentials, callback secrets, signed URLs and sensitive transport metadata.
9. Up to five explicitly selected, media-compatible Generation Skills are normalized to LF, hash-verified, appended exactly once, shown in preflight, and included in the model prompt on every Generate. They are inert Markdown, not executable instructions. The full compiled prompt limit is enforced after skill content is attached.

## Release evidence

For every checked-in capability, contract snapshots must assert the exact sanitized outgoing payload for defaults, every enumerated field, each reference role, boundary counts, incompatible combinations and any documented mode-dependent behavior. The verification state above changes to `Verified YYYY-MM-DD` only when the fixture and tests land from the cited primary source.
