# VesperFrame Enterprise Remediation and Release Gates

This document is the execution record for converting the prototype into VesperFrame — “Direct the impossible.” It is not a claim of readiness. A gate is complete only with implementation, automated evidence, and live verification.

## Ordered implementation gates

1. **Identity and spend protection:** Supabase SSR authentication; protected application/API routes; workspace memberships with owner/admin/editor/viewer roles; RLS and defense-in-depth authorization; no browser-readable provider credential; authenticated quota, rate and concurrency checks on every spend path.
2. **Durable data and private storage:** repeatable migrations, generated types and development seed; normalized project/settings/assets/generation/ledger/idempotency/webhook/audit schema; private source/output/thumbnail buckets; signed access; one-time explicit prototype import.
3. **Capability-aware compiler:** typed versioned registry; current official-source fixtures; deterministic and idempotent prompt/settings/reference compilation; neutral preflight; unsupported combinations blocked.
4. **Durable generation workflow:** reserve records before remote submission; per-item partial-failure safety; idempotent retries; correlated/deduplicated callback; bounded reconciliation; validated output ingestion; immutable usage records.
5. **Truthful product interactions:** implement every shipped interaction in `INTERACTION_INVENTORY.md`; remove Explore, Audio generation mode, Edit Layers and the fake Prompt Lab route; server-authoritative projects, assets, favorites, queue and ledger.
6. **VesperFrame identity and accessibility:** original wordmark/icon; tokenized cinematic palette; metadata/manifest/OG/exports/toasts copy; responsive safe-area layouts; labelled keyboard dialogs, visible focus, reduced motion, 44 px primary targets.
7. **Operations and assurance:** security headers, origin/CSRF checks, limits, SSRF defense, redacted logs/correlation IDs, health/readiness, metrics hooks, retention/export/deletion and credential rotation runbooks, dependency/secret scanning.
8. **Release proof:** formatting, lint, typecheck, unit/contract/integration/policy/E2E/accessibility/visual suites, production build, migration validation, dependency audit, live Supabase advisor checks, GitHub push, Vercel deployment and authenticated live smoke tests.

## Non-negotiable release matrix

- [ ] Anonymous users cannot read private data, upload, inspect balance, or spend.
- [ ] Every enabled control is supported and compiled exactly as intended.
- [ ] Creative direction applies on Generate without Refine.
- [ ] Unsupported controls/reference roles cannot be submitted.
- [ ] Partial batches preserve every paid task and retries do not duplicate spend.
- [ ] Callback/reconciliation completion survives browser closure and ingests private durable outputs.
- [ ] Project data, history, usage and audit state are cross-device and tenant-isolated.
- [ ] Every visible action has success/failure/busy/permission/keyboard evidence or is removed.
- [ ] Old identity, imitation mark, neon-lime theme and user-facing integration-vendor branding are absent from built/public artifacts.
- [ ] All required checks pass with exact summarized output.
- [ ] Production deployment is configured with server-only secrets and verified at the served URL.

## Launch checklist

- [ ] Formal trademark clearance for **VesperFrame** and “Direct the impossible.”
- [ ] Domain, social handle and app-store naming clearance.
- [ ] Security/privacy review of prompts, private media, retention, deletion and export terms.
- [ ] Production incident owners, spend-alert recipients and rollback authority assigned.
- [ ] Real-provider smoke test explicitly approved by environment flag and hard micro-budget.

## Rollback principle

Database migrations are forward-only and additive during this remediation. A deployment rollback must pin the prior Vercel deployment, disable generation spend at the server gate, preserve ledger/generation rows, and apply a reviewed forward repair rather than destructively reverting production data.
