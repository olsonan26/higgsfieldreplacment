# Product research and implementation map

## Live Higgsfield behaviors inspected

The live `/generate` and video creation experiences were inspected at desktop size. The useful product patterns carried into this independent build are:

- Dark production shell with a persistent global and project navigation layer
- Fast image/video mode switching
- A dense composer that keeps model and output controls close to the prompt
- Reference media as a first-class input
- Film setup, camera setup, camera movement, color, and lighting direction
- Searchable model selection with current-provider badges
- Visible generation queue and result cards
- Responsive behavior instead of a desktop-only canvas

This is a functional reinterpretation, not a copy of Higgsfield source code, proprietary assets, branding, authentication, or backend behavior.

## Supplied Port Konar dashboard patterns incorporated

The supplied Port Konar production dashboard informed:

- Local project continuity
- Kie task queue and polling
- Model-oriented request routing
- Reference handling
- Credit/job history surfaces
- A production-dashboard feel rather than a single prompt box

## Supplied Bench Studio patterns incorporated

The supplied Bench Studio technical references informed:

- The server owns provider credentials; browser code is untrusted
- Model capabilities and defaults live in a registry
- Spend-producing actions require explicit preflight confirmation
- The UI distinguishes recorded provider usage from estimates or unknown cost
- Prompt refinement is a deliberate workflow stage
- Provider errors remain visible instead of being converted into false success

## Open-source references reviewed

- The official Higgsfield repositories and SDKs were checked for public integration conventions.
- `DaanKieft/ai-influencer` was reviewed as a useful example of a local-first, bring-your-own-account, Vercel-friendly AI production interface.
- The public Bench Studio repository named by the supplied documentation was considered alongside the supplied technical references.

No third-party source code or private assets were copied into this repository.

## Feature map

| Product need                            | Implementation                                         |
| --------------------------------------- | ------------------------------------------------------ |
| Add a Kie key inside the product        | Settings modal → server verification → HttpOnly cookie |
| Centrally managed credential            | Vercel `KIE_API_KEY`                                   |
| Use curated models                      | Capability registry in `lib/models.ts`                 |
| Use any Kie model                       | Custom model ID + editable JSON preflight              |
| Keep characters/locations/frames nearby | My Elements reference library                          |
| Know what is running                    | Persistent queue + polling                             |
| Know what was spent                     | Receipts ledger using provider-reported credits only   |
| Work on phone and desktop               | Three responsive layout breakpoints                    |
| Avoid accidental spend                  | Explicit confirmation screen before task creation      |
