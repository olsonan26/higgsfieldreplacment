# VesperFrame Threat Model

## Assets and boundaries

Protected assets are account identity, workspace membership, prompts, source media, generated media, model credentials, callback secrets, signed URLs, budgets, usage records, and audit history. The browser is untrusted. Supabase RLS is the tenant boundary; application RBAC is defense in depth. Generation credentials and service credentials exist only in server runtimes.

## Private GPU worker boundary

- RunPod receives only a compiled request, short-lived signed reference URLs,
  an unguessable callback correlation URL, and a two-hour signed upload URL for
  one predetermined private object. It never receives the Supabase secret key.
- The adapter key and endpoint ID are server-only. Task identifiers are prefixed
  internally so reconciliation cannot send a task to the wrong backend.
- The worker rejects non-HTTPS references, credentials in URLs, redirects,
  disallowed hosts, private/reserved DNS results, oversized reference files,
  unsupported setting combinations, and outputs beyond the reservation limit.
- Callback payloads cannot choose arbitrary storage objects: ingestion requires
  the workspace/project/generation prefix reserved before submission, then
  validates the file signature, size, and checksum before creating an asset.
- Prompts, signed URLs, generated media, and provider errors must remain absent
  from worker/application logs and analytics. The worker returns only storage
  path and non-sensitive media metadata.

## Principal threats and controls

| Threat                              | Control                                                                                                                                                                                                                               | Residual risk / operation                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Anonymous or cross-workspace access | SSR route protection, authenticated APIs, membership-derived authorization, RLS on every exposed table and private Storage policy                                                                                                     | Re-run policy isolation tests and advisors after every migration                                     |
| Privilege escalation                | Owner/admin/editor/viewer checks; immutable membership identity; database trigger prevents admins from changing owner/admin members                                                                                                   | Owner account compromise remains high impact; require MFA operationally                              |
| Unauthorized or duplicate spend     | Authentication, generation permission, per-user/workspace caps, model allow policy, rate/concurrency checks, atomic reservation and idempotency                                                                                       | Capability estimates are conservative until authoritative usage arrives                              |
| Secret disclosure                   | No BYOK in browser storage/cookies; server-only environment values; allowlist structured logging; secret scan                                                                                                                         | Rotate immediately after suspected deployment/log exposure                                           |
| Direct RPC misuse                   | Every authenticated `SECURITY DEFINER` mutation re-derives `auth.uid()`, checks workspace membership/role and resource ownership, validates bounded inputs, fixes `search_path`, and grants only the narrow authenticated entry point | Revoke the RPC grant immediately; ship a corrected forward migration; review the workspace audit log |
| Forged or replayed callback         | HMAC timestamp verification, unguessable per-generation correlation, task binding, body hash and unique event key                                                                                                                     | Reconcile independently so rejecting a callback does not lose completion                             |
| SSRF or malicious output            | HTTPS and host allowlist, DNS/private-IP rejection, redirect validation, timeout/size caps, magic-byte MIME validation                                                                                                                | Allowed result hosts must be reviewed when integration endpoints change                              |
| Malicious upload                    | Reserved private path, count/size/signature checks, image dimensions and media duration validation                                                                                                                                    | Malware scanning can be added before enterprise external sharing                                     |
| Skill prompt injection              | Skills are inert Markdown, hash verified, workspace scoped, versioned, explicitly selected, displayed in preflight and snapshotted                                                                                                    | A model can still ignore or misinterpret text; exact adherence is not technically guaranteed         |
| CSV/formula injection               | Dangerous leading cells are prefixed and filenames are normalized                                                                                                                                                                     | Open exports only from trusted application downloads                                                 |
| Temporary result loss               | Server callback/reconciliation immediately ingests into private storage with checksum                                                                                                                                                 | A process crash can leave an unlinked object; retention cleanup must reconcile orphans               |

## Logging and privacy

Logs contain correlation IDs, workspace/generation identifiers, state, counts, and safe error codes only. They exclude prompt text, asset URLs, credentials, callback tokens, raw responses, and signed URLs. Product analytics must follow the same allowlist.
