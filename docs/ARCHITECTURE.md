# Architecture

## Trust boundary

```text
Browser UI
  |  same-origin JSON requests
  v
Next.js route handlers
  |  Bearer Kie key added here only
  v
Kie.ai API
```

The browser is treated as an untrusted presentation and workflow layer. It can ask the server to verify a key, upload a reference, create a task, or poll a task. It never receives the saved key from the server.

For a single personal browser, Settings can save a key in an HttpOnly, Secure, SameSite cookie scoped to `/api/kie`. For a managed deployment, `KIE_API_KEY` is the preferred credential source and overrides the cookie.

## Generation lifecycle

1. The user chooses image/video, a preset or custom Kie model, references, and production controls.
2. Prompt refinement translates film controls into explicit shot language.
3. Preflight displays the final prompt, exact model ID, batch count, current credit balance, and editable model input.
4. On approval, `/api/kie/generate` sends `{ model, input }` to Kie's unified task endpoint.
5. The local queue persists the returned task ID immediately.
6. Active tasks poll `/api/kie/status/[taskId]` every 4.5 seconds.
7. The server normalizes provider result shapes into state, progress, result URLs, failure details, and reported credits.
8. Completed results remain in local history and can be opened/downloaded.

## Capability-aware routing

`lib/models.ts` is a small capability registry. Each preset owns its exact Kie model ID, media kind, defaults, optional reference field, and cost caveat. The composer merges only controls supported by the preset's existing fields.

Custom models deliberately bypass the preset registry. The user supplies the model ID and its documented JSON input. This avoids an unsafe universal schema and makes new Kie models usable immediately.

## Continuity and receipts

The current project state is stored under one versioned local-storage key. It includes project name, uploaded reference metadata, favorites, and task receipts. Kie URLs may be temporary, so this is workflow continuity rather than durable media storage.

The ledger follows a conservative accounting rule:

- `creditsConsumed` returned by Kie: recorded
- no provider value: unreported
- estimated USD or guessed credit conversion: never shown

This preserves the distinction between facts and estimates described in the supplied Bench Studio architecture.

## Deliberate limits

- No bundled user accounts or multi-tenant database
- No proxying of arbitrary hosts; server routes target fixed Kie domains
- No client-visible API key
- No claim that all models share one input contract
- No invented pricing
- No durable copy of provider-hosted outputs

These constraints keep the first deployed version useful, comprehensible, and safe for a personal production workflow.
