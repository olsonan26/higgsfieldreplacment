# VesperFrame

**Direct the impossible.**

VesperFrame is an authenticated, capability-aware image and video direction workspace. It keeps projects, references, generation history, private outputs, favorites, usage records, and reusable Generation Skills durable and tenant-isolated with Supabase.

## Product guarantees

- Every displayed setting comes from the selected model's versioned capability manifest.
- Creative direction and selected Generation Skills are compiled automatically on both Preflight and Generate. Opening the optional compiled preview is never required.
- The raw prompt, compiled prompt, exact effective settings, capability version, skill versions, and sanitized request snapshot are stored separately.
- Generation is denied unless the signed-in member, workspace quota, rate limit, concurrency limit, and model spend policy all allow it.
- Remote tasks are recorded before submission, callbacks are deduplicated, reconciliation runs without a browser tab, and successful media is ingested into private storage.
- Application APIs and user-facing copy remain integration-provider neutral.

Generation Skills are inert Markdown direction documents, not executable code. VesperFrame guarantees that every enabled skill's exact, hash-verified text is included once in the compiled request and snapshotted with the job. No generative model can honestly guarantee perfect semantic compliance; preflight makes the exact instructions auditable before spend.

## Local setup

1. Copy `.env.example` to `.env.local` and provide the documented values. Never commit it.
2. Apply the ordered migrations in `supabase/migrations` and seed the verified capability fixtures with `supabase/seed.sql`.
3. Install and verify:

```powershell
npm install
npm run verify
```

4. Start the app with `npm run dev`.

The readiness endpoint reports `503` until all server-only persistence, callback, ingestion, and generation credentials are configured. This fail-closed state prevents an incomplete deployment from spending.

## Architecture and operations

- [Enterprise remediation and release gates](docs/ENTERPRISE_REMEDIATION_PLAN.md)
- [Capability matrix](docs/CAPABILITY_MATRIX.md)
- [Interaction inventory](docs/INTERACTION_INVENTORY.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Operations and rollback runbook](docs/OPERATIONS.md)

The product name and tagline are working choices. Formal trademark and domain clearance remain launch gates.
