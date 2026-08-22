# Operations and Runbooks

## Deployment readiness

Configure the public Supabase URL/publishable key and all server-only values listed in `.env.example`. `/api/health` proves the process is alive; `/api/readiness` must return 200 before enabling generation. Configure scheduled reconciliation and verify its secret-protected invocation. Keep every model spend policy disabled until its conservative reserve is reviewed.

The checked-in Hobby-compatible Vercel fallback runs daily. A production release must upgrade the hosting plan or connect an authenticated external scheduler to `/api/internal/reconcile` every two minutes; callbacks remain the primary completion path. Do not claim the missed-callback SLA while only the daily fallback is active.

## Credential rotation and revocation

1. Disable model spending policies or remove generation permission to stop new spend.
2. Issue a replacement server credential at the integration provider and update the deployment secret without logging it.
3. Redeploy, verify readiness, then revoke the old credential.
4. Rotate the callback HMAC key in the provider and deployment together, with only the minimum supported overlap.
5. Rotate the Supabase server secret, update deployment environments, redeploy, and revoke the prior secret.
6. Record actor, reason, environment, timestamps, and verification in the incident system; never put secret values in audit metadata.

## Generation incident

- Disable the affected model policy first; this is the spend kill switch.
- Use correlation IDs and safe state—not prompt/media contents—to inspect logs.
- Reconcile reserved/submitted/running records. Never create a replacement task unless the original submission state and idempotency record prove it is safe.
- Preserve usage and audit rows. Mark local removal as archive; do not call it remote cancellation.
- Repair output allowlist/validation failures and reconcile; never expose temporary result URLs.

## Retention, export, and deletion

Workspace retention defaults to 365 days. A scheduled privileged process should archive expired records, delete private objects only after links are tombstoned, and write an audit event. Usage ledger and audit logs are immutable and should be retained at least seven years unless legal requirements specify otherwise. CSV exports are server-authoritative and formula-hardened. Subject deletion removes identity-linked private assets while retaining legally required pseudonymized accounting records.

## Rollback

Pin the last healthy Vercel deployment, disable model spending, and preserve all database rows and Storage objects. Migrations are forward-only: ship a reviewed repair migration rather than dropping or rewinding production data. Verify anonymous denial, RLS isolation, readiness, callback correlation, and signed downloads before re-enabling spend.

## Monitoring

Alert on submission failure rate, callback authentication failures, reconciliation exhaustion, output ingestion failures, quota denials, latency, and credits recorded versus reserved. The no-secret default is structured console output compatible with deployment log drains. No external observability integration is claimed unless it is actually configured.
