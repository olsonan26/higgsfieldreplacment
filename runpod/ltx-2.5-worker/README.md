# VesperFrame LTX-2.5 worker

This private RunPod Serverless worker executes the official Lightricks
distilled pipeline, pinned to commit
`a95ab856bf29407b6b066ede0abe1846050db56c`.
It does not bake model weights, API keys, prompts, or generated media into the
container image.

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
The optional production-detailing IC-LoRA has a separate contact-sharing and
marketing consent gate. It is not required or advertised by this release. Run
the download script with `-IncludeProductionDetailing` only after the account
owner separately accepts those terms and a versioned capability enables DFR.

## Endpoint policy

- Recommended production starting point: one 80 GB or larger GPU, one GPU per
  worker, max one concurrent job per worker.
- Use a network volume and an execution timeout of at least 60 minutes.
- Start with zero warm workers while testing; add one warm worker only after
  runtime and spend are understood.
- Configure `LTX_REFERENCE_ALLOWED_HOSTS` to the Supabase project storage host.
- The worker only uploads to a two-hour signed private Storage reservation.
  It never receives a Supabase service credential.

The VesperFrame adapter uses asynchronous `/run`, webhooks, and server-side
status reconciliation. A browser tab is not required to remain open.
