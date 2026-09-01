# VesperFrame LTX-2.5 worker

This private RunPod Serverless worker executes the official Lightricks
distilled pipeline, pinned to commit
`a95ab856bf29407b6b066ede0abe1846050db56c`.
It does not bake model weights, API keys, prompts, or generated media into the
container image.

The worker now constructs the official `DistilledPipeline` once when the
container starts and keeps it resident for subsequent jobs. This avoids
starting a new Python process and reloading the LTX model for every generation.
Reference images are downloaded in parallel before inference.

The publish workflow builds the worker as
`ghcr.io/olsonan26/vesperframe-ltx25-worker:latest` and also emits an immutable
commit-SHA tag for rollback. RunPod production templates should use the SHA tag
after its GitHub Actions build succeeds.

## Weight storage

The required split checkpoint is roughly 66 GiB including the duration head.
For local use, run `scripts/download-ltx-2.5.ps1 -Destination X:\models\ltx-2.5`
and set `LTX_MODEL_DIR` to that external-drive directory. For RunPod, attach a
network volume at `/runpod-volume`, download the same files once into
`/runpod-volume/models/ltx-2.5`, and keep the Hugging Face token out of the
worker after the download finishes.

The model repository is gated. The account owner must accept the LTX-2.5
license and use a read-only Hugging Face token with gated-repository access.

## Interactive endpoint policy

For VesperFrame's interactive studio, the endpoint should be configured for a
resident warm worker rather than scale-to-zero:

- Use one 80 GB or larger GPU per worker.
- Set **minimum workers to 1** so the model is already loaded before a prompt is
  submitted.
- Keep max concurrency at one job per GPU worker.
- Use a network volume and an execution timeout of at least 60 minutes.
- Keep `LTX_PRELOAD_ON_START=1`.
- Keep `LTX_OFFLOAD_MODE=none` on an 80 GB-class GPU for the fastest inference.
  `cpu` and `disk` remain available as memory-saving fallbacks but are slower.
- Configure `LTX_REFERENCE_ALLOWED_HOSTS` to the Supabase project storage host.
- The worker only uploads to a two-hour signed private Storage reservation. It
  never receives a Supabase service credential.

A scale-to-zero endpoint can still work, but the first request after idle must
pay container startup and model-load time, so it cannot provide the
seconds-level experience expected from a hot LTX pipeline.

The VesperFrame adapter uses asynchronous `/run`, webhooks, and server-side
status reconciliation. While the Generation queue is open, VesperFrame also
polls active jobs every few seconds so queued/running/completed state changes
appear without manual refresh.
