# Model setup (Slice 6.5)

Clockwork’s agent runs server-side model calls through `/api/ai/step`. **API keys are never sent to the browser** and are never accepted from client requests.

## Key sources (precedence)

For each provider, the server resolves credentials in this order:

1. **Environment variable** (read-only in UI) — e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
2. **Vault** — encrypted at rest in `.data/vault.json` (AES-256-GCM) using `CLOCKWORK_SECRET` or a generated `.data/secret.key` (mode `0600` when possible)
3. **Session** — stored in server process memory only; lost on restart

The UI/API exposes only `{ configured, source, hint }` (masked), never key material.

## Environment variables

- `AI_MOCK=1` — use the labeled mock transport (no provider/key required). Shown as **MOCK** in the agent header.
- `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` — legacy/simple env-based OpenAI-compatible path (Slice 6). Slice 6.5 provider/model selection via Settings takes precedence when a resolved model/key is chosen.
- `CLOCKWORK_SECRET` — optional secret used to derive the vault encryption key. If unset, Clockwork generates `.data/secret.key`. Changing/removing the secret or deleting `.data/secret.key` makes existing vault entries unreadable (re-enter keys).

## Built-in providers

OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, and Ollama are listed in Settings → AI Models. Curated models include tools/vision/context metadata; you can also add custom models per provider.

> Note: streaming in this build is implemented for **OpenAI-compatible** provider APIs. Providers with different API styles may be listed but can return a model-unavailable/unsupported error for `/step` until their adapters are added.

## Custom providers and models

- **Custom provider:** OpenAI-compatible base URL. HTTPS required except `http://localhost` / `127.0.0.1`. Base URLs are validated server-side (SSRF guard).
- **Custom model:** specify provider, model id, label, context window, and whether it supports tools/vision.

## Using the in-app vault

1. Open **Project → Settings → AI** (or the AI settings section).
2. Enter a key for a provider and choose **Save to vault** (persists encrypted across restarts) or **Session only**.
3. Click **Test connection** (consumes provider credits/network; may take up to ~15s).
4. Set a **Default model** and/or pick a model in the agent drawer.

## Local Ollama

- Provider base URL defaults to `http://localhost:11434/v1`.
- Ensure Ollama is running locally and the model is pulled (e.g. `ollama pull llama3.2`).
- An API key is typically not required for local Ollama; configure as needed for your setup.

## Security notes

- Never commit `.data/` secrets or vault files.
- Keys are not stored in `localStorage`, `sessionStorage`, client JS bundles, SSE payloads, or logs by design.
- Connection tests and agent calls consume provider credits/quota.
- Fresh installs with no key still boot the editor/player/export; the agent should show a setup/no-key state rather than crashing.
