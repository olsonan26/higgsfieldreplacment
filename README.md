# HF//R — Private Kie.ai Production Studio

A practical, independent image-and-video production studio inspired by the strongest parts of Higgsfield Cinema Studio. It connects directly to **your Kie.ai account**, supports curated presets and **any Kie model ID**, and keeps project continuity, generation status, references, and credit receipts in one responsive interface.

This project is independent and is not affiliated with Higgsfield or Kie.ai.

## What works

- Cinematic image and video composer with aspect ratio, resolution, duration, sound, and batch controls
- Director controls for genre, era, tempo, camera body, lens, aperture, camera movement, palette, and lighting
- Prompt refinement that turns those controls into a production-ready shot description
- Current model presets for Nano Banana 2, GPT Image 2, Grok Imagine, Seedance 2, Kling 3, Wan 2.7, and Gemini Omni Video
- **Any-model mode:** paste a Kie model identifier and its exact input JSON contract
- Server-side Kie integration for credit verification, file upload, task creation, and task polling
- HttpOnly, Secure cookie option for a personal browser key; `KIE_API_KEY` environment variable for a managed deployment
- Reusable image/video/audio reference library
- Persistent local project, favorites, queue, and generation history
- Receipt ledger that distinguishes reported Kie credits from unknown cost and exports CSV
- Desktop, tablet, and mobile layouts

## Add your Kie.ai key

You have two supported options.

### In the app

1. Open **Settings** or **Connect Kie**.
2. Paste your Kie.ai API key.
3. The server verifies it against your live Kie credit balance.
4. The key is returned only in an HttpOnly cookie scoped to the Kie API routes, so client JavaScript cannot read it after connection.

This is convenient for a personal deployment. The browser still stores the credential cookie on that device, so do not use this mode on a shared computer.

### In Vercel (recommended for a private managed deployment)

Add this environment variable in the Vercel project:

```text
KIE_API_KEY=your_key_here
```

Never prefix it with `NEXT_PUBLIC_`; that would expose it to browser code. Redeploy after changing the variable.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Production checks:

```bash
npm test
npm run lint
npm run build
```

## How any-model routing works

The app submits the unified Kie Market contract:

```json
{
  "model": "provider/model-id",
  "input": {
    "prompt": "Your production prompt",
    "model_specific_field": "value"
  }
}
```

Open the model picker, scroll to **Use any current or future Kie model**, enter the model ID from that model's Kie documentation, and select **Use model**. Before spending credits, the confirmation screen lets you edit the complete input JSON.

Because model contracts differ, the custom JSON is intentionally passed through unchanged except that `prompt` is always added. This keeps the studio compatible with new Kie models without pretending every provider accepts the same fields.

## Privacy and storage

- The Kie key never enters React state after connection and is never written to local storage.
- `KIE_API_KEY`, when present, stays on the server.
- A key entered in Settings is stored in a Secure, SameSite, HttpOnly cookie. Encoding is transport-safe, not encryption; use the Vercel environment-variable option when the deployment is shared or centrally managed.
- Project names, reference URLs, favorites, and job receipts are saved to the current browser's local storage.
- Uploaded assets use Kie temporary file storage and may expire. Download important outputs.
- The app does not invent a USD conversion or estimated credit figure. It records a task cost only when Kie returns `creditsConsumed`.

## Project structure

```text
app/
  api/kie/connection/       key verification and credit balance
  api/kie/generate/         unified task creation
  api/kie/status/[taskId]/  task polling and result normalization
  api/kie/upload/           temporary reference upload
  page.tsx                  studio entry point
components/studio.tsx       full production UI and local workflow
lib/kie.ts                  credential boundary and Kie client
lib/models.ts               capability-aware model registry
tests/                      contract normalization and registry tests
docs/                       architecture and research notes
```

## Design and product references

The implementation combines observations from the live Higgsfield generation experience with the supplied Port Konar dashboard and Bench Studio materials. Those materials influenced the capability registry, explicit preflight/spend step, server-owned credentials, reference continuity, queue, and receipts ledger. See [docs/RESEARCH.md](docs/RESEARCH.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Official API references:

- [Create task contract (GPT Image 2 example)](https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image)
- [Unified task status and results](https://docs.kie.ai/market/common/get-task-detail)
- [Base64 reference upload](https://docs.kie.ai/file-upload-api/upload-file-base-64)

## License

The original code in this repository is available under the MIT License. Third-party model names, product names, trademarks, and remote demo imagery remain the property of their respective owners.
