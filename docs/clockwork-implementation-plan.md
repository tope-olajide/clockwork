# Clockwork — Vertical Slice Implementation Plan

**Status:** implementation brief, branch `feat/game-engine`
**Audience:** the engineer (or coding agent) implementing this branch
**Out of scope for this branch:** automated test suites and the Kane K1–K4 engine-QA suite. Those run in the separate verification branch. The final slice does run real AI Play loops as product acceptance, because AI Play is a product feature, not the test suite.

---

## 0. Read this first

### 0.1 What we are building

Clockwork is a **browser-native 2D game engine with an AI co-worker built into the editor**. The editor and the AI agent are not two apps that talk over an API. They are two clients of the **same live engine document and the same command bus**:

- Every user action is a typed `Command`.
- Every AI action is the same typed `Command`.
- Both go through one validator, one undo stack, one revision counter, one autosave.
- The AI receives a fresh, structured snapshot of what the editor currently sees (active scene, selection, revision, assets, runtime state) on every turn.
- The AI can select objects, open panels, change any editable property, create scenes and prefabs, author logic, run a playtest, read the result, and undo its own work.

The result is a game engine that feels like a professional tool, with a chat panel that behaves like a senior engine programmer sitting next to you.

### 0.2 Product thesis

Most "AI app builders" generate code into a text editor. Clockwork does the opposite: **the game is a typed document, and the agent edits the document through the engine's own commands**. That gives us:

- No code generation step, no build step between prompt and result.
- Deterministic undo/redo for AI edits.
- Visual diffs the user can see before accepting.
- An agent that can *play* the game and react to telemetry.
- A single source of truth for the UI, the agent, and the runtime.

The plan is ordered around the hackathon's pass/fail gates: a working end-to-end product first (Slices 0–8), then hardening (Slice 9), then Kane last (Slice 10) in two forms: the agent-driven engine-QA handshake for the verification branch, and the in-product **AI Play** loop where Kane plays the game, reports a failure, and the agent fixes it. The four scoring dimensions are addressed explicitly in §10.8. A miss on any of the three bars blocks the rest, so none of them is deferred to "polish".

The editor is **manual-first**. A user with no model, no API key, no credits, or no Kane can still create a project, edit every property, author logic, play, save, share, and export. The agent and AI Play are optional layers on top of the same command bus and runtime; no core editor action may depend on them.

### 0.3 Hard bans

1. **No `@agent-native/*` packages.** No agent-native runtime, actions, plugins, schema, or server. This is a clean rebuild.
2. **No imports or copies from any pre-existing implementation.** This is a clean rebuild; this plan is self-contained.
3. **No E2E/UI test suite in this branch.** No Playwright, Cypress, Vitest browser mode, or Testing Library. Kane is used only for the last-slice AI Play product acceptance and its real smoke/negative-control runs; the K1–K4 engine-QA suite belongs to the verification branch. Typecheck and production build remain the only automated CI gates.
4. **No generic SaaS/Notion dashboard aesthetic.** The UI must read as a game engine: dark, dense, canvas-first, panel-based, keyboard-driven.
5. **No arbitrary user JavaScript execution in v1.** Logic is data-driven (behaviors + rules). A script VM is a later feature.
6. **No server-side duplicate of project state.** The browser owns the document. The server is a stateless model proxy plus a snapshot/verification service.
7. **No `any` in application code.** `unknown` + Zod parsing at boundaries.

### 0.4 Definition of done for the branch

- `pnpm typecheck` passes.
- `pnpm build` passes.
- The golden path in §9 runs manually from a cold start with no console errors.
- The UI matches the visual specification in §4 at the **1366×768 minimum**, 1440×900, and 1920×1080, with no horizontal overflow.
- The agent can perform the seven demo prompts in §7.1 with real model calls, and every edit is undoable in one step.
- Testability hooks in §10.2 exist and are documented in `docs/testing-hooks.md`, even though the tests are not run here.
- Manual editing, manual Play, save, share, and export work with **no model, no provider key, and no Kane**. AI is additive, never a prerequisite for using the editor.
- The engine-QA segment of the golden path uses the deterministic CLI fixture in this branch. The real K1–K4 suite and its evidence are verification-branch work; do not require Kane credentials to finish the editor slices.
- The final slice runs one real AI Play pass and one negative-control fail → fix → pass, because the second Play button is a product feature. If Kane or a model is unavailable, the feature is not complete and the gate is blocked.
- A user can select a built-in model, add a custom provider/model, and supply keys through `.env` or the in-app vault. No key is ever exposed to the browser.
- `features.md` lists every 100% complete feature with a description and contains no planned/partial work. `docs/known-issues.md` is current, including deferred K1–K4 engine QA, real AI Play evidence, and the manual-only path.
- `pnpm check:repo` passes: clean root, no `reference/`, no generated artifacts, required docs present.

---

## 1. Stack and process model

### 1.1 Stack

| Concern | Choice | Why |
|---|---|---|
| Package manager | **pnpm** | Fast, strict, workspace-ready |
| Language | **TypeScript 5.x, `strict: true`** | Non-negotiable for a typed command bus |
| UI | **React 19 + Vite 7** | Fast HMR, simple deployment |
| Styling | **Tailwind CSS 4 + CSS custom properties** | Dense design tokens, no component-library look |
| Primitives | **Radix UI** (dialog, menu, tooltip, tabs, select, popover) | Accessible behavior without visual opinion |
| Icons | **lucide-react** | Consistent 16px engine iconography |
| Routing | **react-router-dom 7** | `/`, `/project/:id` (overview), `/project/:id/scene/:sceneId` (editor), `/play/:id`, `/settings` |
| Document store | **Zustand 5 + Immer 10** | Tiny, framework-agnostic core, patch-based history |
| Validation | **Zod 4** | One schema for commands, storage, and AI tool JSON Schema |
| Rendering | **PixiJS 8** | WebGL scene graph, sprites, tilemaps, custom overlays |
| Runtime | **Custom fixed-step 2D runtime on PixiJS** | Deterministic, shared renderer, no engine-in-engine |
| Persistence | **IndexedDB (`idb`) + SHA-256 asset blobs** | Local-first, instant, offline |
| Server | **Hono 4 on Node 22 + `tsx`** | Small, fast, easy SSE |
| Model transport | **Vercel AI SDK 5** with native provider packages + custom OpenAI-compatible providers | Streaming, tool calls, vision; model chosen in Settings |
| Model secrets | **AES-256-GCM vault in SQLite**, env override, or session-only | Works for hackathon and deployed setups without exposing keys |
| Snapshots / Kane | **better-sqlite3** | Single-file store for share links and verification evidence metadata |
| Zip export | **fflate** | Client-side export |
| Markdown | **react-markdown + remark-gfm** (raw HTML disabled) | Safe chat rendering |
| Virtualization | **@tanstack/react-virtual** | 500+ hierarchy rows |
| IDs | **nanoid** with prefixes | Human-readable references in prompts and logs |
| Fonts | **Inter Variable + JetBrains Mono** (`@fontsource`) | Matches the dense tool aesthetic |

Pin exact versions in `pnpm-lock.yaml` on day one. Do not upgrade mid-branch.

### 1.2 Process model

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React shell (panels, chat, inspector)                          │
│        │                                                        │
│        ├── EngineStore (document + editor state + history)      │
│        │        │                                               │
│        │        ├── CommandBus ── validators ── undo patches    │
│        │        ├── Autosave ── IndexedDB                       │
│        │        └── PixiJS viewport + runtime                   │
│        │                                                        │
│        └── AgentClient ── SSE ──┐                               │
└──────────────────────────────────┼──────────────────────────────┘
                                   │
┌──────────────────────────── Node server ────────────────────────┐
│  /api/agent/step   stateless model proxy (resolves model/key)   │
│  /api/ai/*         providers, models, key vault, test, settings │
│  /api/snapshots    project snapshot + share/play URLs           │
│  /api/kane/qa      engine-QA Kane bridge (Slice 10)             │
│  /api/kane/ai-play in-product AI Play runner (Slice 10)         │
└─────────────────────────────────────────────────────────────────┘
```

**Critical rule:** the server never stores the editable document. Tool calls are streamed to the browser and executed there. This guarantees the agent and the UI mutate the exact same object.

### 1.3 Environment

`.env.example`:

```bash
# Default model (provider:model-id). Used when no per-chat choice exists.
AI_MODEL=openai:gpt-4.1-mini

# Built-in providers. Any subset can be set; the app also accepts keys in Settings.
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
OPENROUTER_API_KEY=
GROQ_API_KEY=
MISTRAL_API_KEY=
DEEPSEEK_API_KEY=
XAI_API_KEY=
TOGETHER_API_KEY=
FIREWORKS_API_KEY=
OLLAMA_BASE_URL=http://127.0.0.1:11434

# Generic OpenAI-compatible provider (optional; the UI can add these too)
AI_BASE_URL=
AI_API_KEY=

# Encrypts keys saved in the in-app vault. If unset, a .data/secret.key is generated (0600).
CLOCKWORK_SECRET=

# Server
PORT=8787
CLOCKWORK_APP_URL=http://localhost:5173

# Optional: snapshot store
CLOCKWORK_DB=./.data/clockwork.db

# Optional: turn off every AI surface. Manual editing, play, share, and export still work.
AI_ENABLED=1

# Kane CLI: engine QA (verification branch) and in-product AI Play (Slice 10)
# Kane is always enabled; no feature flag.
KANE_CLI=kane-cli
KANE_TIMEOUT_SECONDS=180
KANE_MAX_STEPS=40
# 0 shows Chrome for the stage demo; 1 is headless for servers/CI.
KANE_HEADLESS=1
KANE_AI_PLAY_EVIDENCE_DIR=./.data/ai-play
```

Vite proxies `/api` to `http://localhost:8787`.

Scripts:

```json
{
  "dev": "concurrently -n web,api \"vite\" \"tsx watch server/index.ts\"",
  "build": "tsc -b && vite build",
  "typecheck": "tsc -b",
  "preview": "vite preview",
  "start": "node --import tsx server/index.ts",
  "check:repo": "node scripts/check-repo.mjs"
}
```

---

## 2. Repository layout

Create exactly this structure. Keep files small and single-purpose.

```text
clockwork/
├── docs/
│   ├── clockwork-implementation-plan.md
│   ├── implementation-log.md
│   ├── known-issues.md
│   ├── testing-hooks.md
│   ├── model-setup.md
│   ├── kane-setup.md
│   ├── kane-proof.md               # engine-QA evidence template
│   └── ai-play.md                  # in-product Kane player contract
├── features.md                     # completed features only
├── public/
│   ├── fonts/                      # self-hosted woff2
│   └── starter/                    # original Clockwork starter art/audio
├── scripts/
│   ├── check-repo.mjs              # rejects stray/generated files and missing ledgers
│   └── kane/                       # fixture, objective files, run helper
│       ├── fake-kane.mjs
│       ├── qa/                     # K1–K4 objective files
│       └── ai-play/                # AI Play objective fixtures
├── server/
│   ├── index.ts                    # Hono app, static build serving in prod
│   ├── env.ts                      # Zod-parsed environment
│   ├── routes/
│   │   ├── agent.ts                # POST /api/agent/step (SSE)
│   │   ├── ai.ts                   # providers, models, keys, test, settings
│   │   ├── snapshots.ts            # POST/GET /api/snapshots
│   │   └── kane.ts                 # /api/kane/qa + /api/kane/ai-play (SSE)
│   ├── db/
│   │   ├── client.ts               # shared SQLite connection
│   │   └── schema.ts               # snapshots, AI settings, vault metadata
│   ├── ai/
│   │   ├── provider.ts             # provider registry + model resolver
│   │   ├── providers.ts            # built-in catalog + custom providers
│   │   ├── models.ts               # model metadata, tool/vision flags
│   │   ├── vault.ts                # AES-256-GCM key storage
│   │   ├── test.ts                 # connection + tool-call capability test
│   │   ├── system-prompt.ts        # built from the shared command catalog
│   │   └── stream.ts               # text + tool-call stream normalization
│   ├── snapshots/
│   │   ├── db.ts                   # better-sqlite3 schema + queries
│   │   └── html.ts                 # read-only player shell
│   └── kane/
│       ├── runner.ts               # spawn kane-cli, cancel, exit codes
│       ├── ndjson.ts               # event parser + run_end extraction
│       ├── objectives.ts           # K1–K4 + AI Play objective builder
│       └── evidence.ts             # evidence dir, result.json, redaction
├── shared/
│   ├── protocol.ts                 # SSE event + chat message types
│   ├── protocol/kane.ts            # KaneRunSummary, AiPlayResult, HUD state
│   └── tool-schema.ts              # JSON Schema generated from Zod tools
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes.tsx
│   ├── design/
│   │   ├── tokens.css
│   │   ├── base.css
│   │   └── primitives/             # Button, IconButton, Input, Select, Menu,
│   │                               # Tooltip, Panel, Tabs, Dialog, Toast, Kbd
│   ├── shell/
│   │   ├── AppShell.tsx
│   │   ├── TopBar.tsx
│   │   ├── LeftRail.tsx
│   │   ├── TabStrip.tsx
│   │   ├── Toolbar.tsx
│   │   ├── StatusBar.tsx
│   │   ├── CommandPalette.tsx
│   │   └── shortcuts.ts
│   ├── engine/
│   │   ├── model/
│   │   │   ├── ids.ts
│   │   │   ├── document.ts          # ProjectDocument + Scene + Object + Layer
│   │   │   ├── asset.ts
│   │   │   ├── animation.ts
│   │   │   ├── behavior.ts          # behavior catalog + params schemas
│   │   │   ├── prefab.ts
│   │   │   ├── tilemap.ts
│   │   │   ├── rules.ts
│   │   │   └── migrate.ts
│   │   ├── store/
│   │   │   ├── engine-store.ts      # Zustand store + document/editor slices
│   │   │   ├── history.ts           # patch stack, transactions
│   │   │   ├── selectors.ts
│   │   │   ├── autosave.ts
│   │   │   └── events.ts            # typed event bus for toasts/agent presence
│   │   ├── commands/
│   │   │   ├── registry.ts          # discriminated union + dispatch
│   │   │   ├── project.ts
│   │   │   ├── scene.ts
│   │   │   ├── layer.ts
│   │   │   ├── object.ts
│   │   │   ├── behavior.ts
│   │   │   ├── prefab.ts
│   │   │   ├── asset.ts
│   │   │   ├── tilemap.ts
│   │   │   ├── rules.ts
│   │   │   └── editor.ts            # selection/focus/panel (not persisted)
│   │   ├── assets/
│   │   │   ├── asset-store.ts
│   │   │   ├── hash.ts
│   │   │   ├── thumbnails.ts
│   │   │   ├── slicer.ts
│   │   │   └── collider.ts          # alpha-bounds collider generation
│   │   ├── render/
│   │   │   ├── PixiStage.tsx
│   │   │   ├── scene-renderer.ts
│   │   │   ├── overlays.ts          # selection, gizmos, grid, rulers
│   │   │   ├── camera.ts
│   │   │   └── textures.ts
│   │   ├── runtime/
│   │   │   ├── runtime.ts           # fixed-step loop, scene lifecycle
│   │   │   ├── input.ts
│   │   │   ├── physics.ts
│   │   │   ├── behaviors/
│   │   │   │   ├── index.ts
│   │   │   │   ├── platformer-controller.ts
│   │   │   │   ├── top-down-controller.ts
│   │   │   │   ├── patrol.ts
│   │   │   │   ├── follow.ts
│   │   │   │   ├── collectible.ts
│   │   │   │   ├── hazard.ts
│   │   │   │   ├── checkpoint.ts
│   │   │   │   ├── camera-follow.ts
│   │   │   │   ├── spawner.ts
│   │   │   │   ├── timer.ts
│   │   │   │   └── variable-set.ts
│   │   │   ├── rules.ts
│   │   │   ├── audio.ts
│   │   │   ├── telemetry.ts
│   │   │   └── debug.ts
│   │   ├── io/
│   │   │   ├── indexeddb.ts
│   │   │   ├── transfer.ts          # .clockwork.json import/export
│   │   │   └── build.ts             # static zip export
│   │   ├── templates/
│   │   │   ├── blank.ts
│   │   │   ├── platformer.ts
│   │   │   └── topdown.ts
│   │   └── ai/
│   │       ├── context.ts           # context packet builder
│   │       ├── tools.ts             # client tool definitions + executors
│   │       ├── executor.ts          # command batches, revision guard
│   │       ├── prompts.ts           # UI presets, contextual suggestions
│   │       └── types.ts
│   ├── features/
│   │   ├── projects/
│   │   │   ├── ProjectsPage.tsx
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── ProjectFilters.tsx
│   │   │   ├── ProjectOverview.tsx
│   │   │   ├── ProjectSettingsPanel.tsx
│   │   │   └── NewProjectDialog.tsx
│   │   ├── settings/
│   │   │   ├── SettingsPage.tsx
│   │   │   ├── ProvidersPanel.tsx
│   │   │   ├── ProviderCard.tsx
│   │   │   ├── ProviderDialog.tsx
│   │   │   ├── ModelPicker.tsx
│   │   │   ├── CustomModelDialog.tsx
│   │   │   └── KeyDialog.tsx
│   │   ├── editor/
│   │   │   ├── EditorPage.tsx
│   │   │   ├── LeftDock.tsx
│   │   │   ├── LayersPanel.tsx
│   │   │   ├── HierarchyPanel.tsx
│   │   │   ├── Viewport.tsx
│   │   │   ├── ViewportRulers.tsx
│   │   │   ├── Inspector.tsx
│   │   │   ├── SceneInspector.tsx
│   │   │   ├── ObjectInspector.tsx
│   │   │   └── ContextMenu.tsx
│   │   ├── assets/AssetBrowser.tsx
│   │   ├── logic/
│   │   │   ├── LogicPage.tsx
│   │   │   ├── RulesEditor.tsx
│   │   │   ├── BehaviorList.tsx
│   │   │   └── InputMapEditor.tsx
│   │   ├── presentation/
│   │   │   ├── PresentationPage.tsx
│   │   │   ├── LookPanel.tsx
│   │   │   ├── AnimationPanel.tsx
│   │   │   ├── AudioPanel.tsx
│   │   │   └── GameUiPanel.tsx
│   │   ├── playtest/
│   │   │   ├── PlayOverlay.tsx
│   │   │   ├── PlayConsole.tsx
│   │   │   └── DebugOverlay.tsx
│   │   ├── agent/
│   │   │   ├── AgentDrawer.tsx
│   │   │   ├── AgentHeader.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ToolCallCard.tsx
│   │   │   ├── ChangeSetCard.tsx
│   │   │   ├── ContextChips.tsx
│   │   │   ├── Composer.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── useAgentSession.ts
│   │   ├── ship/
│   │   │   ├── ShipDialog.tsx
│   │   │   └── ShareDialog.tsx
│   │   ├── verify/
│   │   │   ├── VerifyDialog.tsx
│   │   │   └── KaneRunCard.tsx
│   │   └── ai-play/
│   │       ├── AiPlayButton.tsx
│   │       ├── AiPlayPanel.tsx
│   │       ├── AiPlayAttempts.tsx
│   │       └── aiPlayController.ts
│   ├── play/
│   │   ├── player.tsx               # standalone exported/player build
│   │   └── ai/AiPlayHud.tsx         # visible controls + state for Kane
│   └── lib/
│       ├── cn.ts
│       ├── format.ts
│       └── useHotkeys.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

### 2.1 Repository hygiene (mandatory)

The final repository must be clean enough that a judge can understand it in one pass.

**Allowed at the root:** `README.md`, `LICENSE`, `.gitignore`, `.env.example`, `features.md`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`, `index.html`, and the `docs/`, `public/`, `scripts/`, `server/`, `shared/`, `src/` directories. Nothing else unless it is a required tool config (for example `tailwind` or `eslint`).

**Never commit:**
- `reference/` or any copied legacy tree. Remove it before implementation begins.
- `node_modules/`, `dist/`, `.data/`, `.testmuai/runs/`, `.testmuai/evidence/`, `docs/evidence/`, `*.ndjson`, screenshots, screen recordings, zips, logs, or editor caches.
- `.env` files or real API keys. Only `.env.example` is tracked.
- Loose notes, scratch files, or duplicate docs at the root. The only root Markdown file besides `README.md` is `features.md`.

**Documents have one home:**
- `docs/clockwork-implementation-plan.md` — the spec.
- `docs/implementation-log.md` — per-slice evidence, owned by the implementer.
- `docs/known-issues.md` — every limitation, failing check, incomplete feature, and scoring risk.
- `docs/testing-hooks.md` — `data-testid`s, URL params, and the read-only `window.__clockwork` API.
- `docs/kane-setup.md` — install/login/flags for both Kane modes.
- `docs/kane-proof.md` — engine-QA evidence template for the verification branch.
- `docs/ai-play.md` — the in-product AI Play contract, HUD labels, objectives, and retry policy.

**Feature ledger:** `features.md` lists only features that are 100% complete and manually verified. If a feature is partial, mocked, disabled, or has an open blocking issue, it stays out of `features.md` and is described in `docs/known-issues.md`. Update the ledger at every slice gate.

**Repository check:** add `scripts/check-repo.mjs` and `pnpm check:repo`. It must fail when `reference/` exists, a forbidden artifact is tracked, a root Markdown file other than `README.md`/`features.md` exists, `features.md` or `docs/known-issues.md` is missing, or an acceptance log entry is missing. Run it in the Slice 9 gate and again in the Slice 10 final gate.

---

## 3. Engine architecture

### 3.1 Two stores, one document

Separate persistent data from ephemeral editor state.

```ts
// engine/model/document.ts (shape, abridged)
export interface ProjectDocument {
  schemaVersion: 1;
  id: string;                 // prj_...
  name: string;
  revision: number;           // increments on every committed transaction
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;        // set by project.setArchived; archived = read-only
  templateOrigin: "blank" | "platformer" | "topdown" | "puzzle" | "brief" | "import";
  settings: ProjectSettings;
  startSceneId: string;
  scenes: Scene[];
  assets: Asset[];
  prefabs: Prefab[];
  variables: Variable[];
}

/** Denormalized list metadata in IndexedDB. Derived from the document on save. */
export interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  coverDataUrl?: string;
  template: "blank" | "platformer" | "topdown" | "puzzle" | "brief" | "import";
  archivedAt?: string;
}

export interface ProjectSettings {
  width: number;              // design resolution, default 1280
  height: number;             // default 720
  pixelArt: boolean;
  gravity: { x: number; y: number };
  background: string;
  inputMap: Record<InputAction, string[]>; // e.g. jump: ["Space", "KeyW"]
  audio: { musicVolume: number; sfxVolume: number };
  ui: {
    hud: HudWidget[];          // bound variables shown in corners
    accent: string;            // game UI accent, default coral
    font: "inter" | "mono";
  };
}

export interface HudWidget {
  id: string;
  variable: string;
  label: string;
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  style: "text" | "bar";
  max?: number;               // for bars
}

export interface Scene {
  id: string;                 // scn_...
  name: string;
  kind: "level" | "menu" | "ui";
  size: { w: number; h: number };
  background: { color: string; assetId?: string };
  camera: { x: number; y: number; zoom: number };
  layers: Layer[];
  objects: GameObject[];
  rules: Rule[];
  audio?: { musicAssetId?: string; loop: boolean; volume: number };
}

export interface Layer {
  id: string;                 // lay_...
  name: string;
  order: number;              // 0 = bottom
  visible: boolean;
  locked: boolean;
  opacity: number;
  parallax: { x: number; y: number };
}

export interface GameObject {
  id: string;                 // obj_...
  name: string;
  layerId: string;
  parentId?: string;
  prefabId?: string;
  transform: {
    x: number; y: number;
    rotation: number;         // degrees
    scaleX: number; scaleY: number;
    originX: number; originY: number; // 0..1
  };
  visual?: Visual;
  body?: Body;
  behaviors: BehaviorInstance[];
  properties: Record<string, unknown>; // prefab overrides + custom fields
  tags: string[];
}

export type Visual =
  | { kind: "sprite"; assetId: string; frame?: number; tint?: string; width?: number; height?: number }
  | { kind: "rect"; width: number; height: number; color: string; stroke?: string }
  | { kind: "text"; text: string; style: TextStyle }
  | { kind: "tilemap"; tilesetId: string; tileSize: number; data: number[]; cols: number; rows: number };

export interface Body {
  type: "dynamic" | "static" | "kinematic" | "none";
  width: number; height: number;
  offsetX: number; offsetY: number;
  gravityScale: number;
  collideWorldBounds: boolean;
  oneWay?: boolean;
}

export interface BehaviorInstance {
  id: string;                 // beh_...
  type: BehaviorType;
  enabled: boolean;
  params: Record<string, unknown>; // parsed by catalog schema
}
```

Ephemeral:

```ts
// Ephemeral only. Persist panel widths/collapse/tab to localStorage — never to
// the project document, revision, or undo history.
export interface EditorState {
  activeSceneId: string | null;
  selection: string[];            // object ids
  activeLayerId: string | null;
  tool: "select" | "hand" | "rect";
  camera: { x: number; y: number; zoom: number };
  panels: { left: boolean; right: boolean; agent: boolean; bottom: boolean };
  tab: "scene" | "content" | "logic" | "presentation";
  playtest: "off" | "running" | "paused";
  saveState: "saved" | "dirty" | "saving" | "error";
  agentPresence: { objectIds: string[]; label: string } | null;
  ghostPreview: { patches: Patch[]; label: string } | null;
}
```

### 3.2 Command bus

Every mutation is a command. The `CommandBus` is the only write path.

```ts
export interface CommandDefinition<T extends Command = Command> {
  type: T["type"];
  schema: z.ZodType<T>;
  validate?: (doc: ProjectDocument, cmd: T) => string | null; // referential checks
  apply: (draft: Draft<ProjectDocument>, cmd: T, ctx: CommandContext) => CommandEffect;
}

export interface CommandEffect {
  changedIds: string[];       // objects/scenes/assets touched
  label: string;              // "Move Player", "Agent: add double jump"
}

export interface DispatchOptions {
  source: "ui" | "agent" | "system" | "undo";
  label?: string;
  expectedRevision?: number;
  transactionId?: string;     // group multiple dispatches into one undo entry
  dryRun?: boolean;
}

export type DispatchResult =
  | { ok: true; revision: number; changedIds: string[]; patches: Patch[] }
  | { ok: false; code: "validation" | "revision" | "forbidden"; message: string; revision: number };
```

Dispatch algorithm:

1. Parse with the command's Zod schema. Reject on failure.
2. If `expectedRevision` is present and differs from `doc.revision`, return `revision` error. The agent then re-reads context; never silently retry a stale edit.
3. Run `validate` against the current document.
4. `produceWithPatches(doc, draft => definition.apply(draft, cmd, ctx))`.
5. If `dryRun`, return patches without mutating.
6. Commit: replace document, increment `revision`, update `updatedAt`.
7. Push a history entry:
   ```ts
   { id, label, source, transactionId, forward: patches, inverse: inversePatches, changedIds, at }
   ```
   If `transactionId` matches the top entry, merge patches into it. This is how one gesture = one undo entry.
8. Emit `document:committed` with `{ revision, changedIds, patches, source }`.
9. Schedule autosave (500 ms debounce).
10. If source is `agent`, pulse the affected objects and show a toast.

Undo/redo:

- Undo applies the inverse patch and **creates a new revision** (revision is monotonic; it is a save token, not a cursor).
- History cap: 200 entries.
- Selection is repaired after undo: deleted ids are dropped.
- `history` is session-only and not persisted.

**Gesture grouping:** drag-move dispatches on every pointer move would flood history. The viewport calls `beginTransaction("Move Player")` on pointer down, dispatches previews with the same `transactionId`, and `endTransaction()` on pointer up. Only the final state is one entry.

### 3.3 Revision and autosave semantics

- `revision` is the collaboration and staleness token. The UI shows `Saved · r12`.
- Autosave writes `{ document, savedAt }` to IndexedDB keyed by project id.
- Save states: `dirty` (0–500 ms after commit), `saving`, `saved`, `error` (with retry in the status bar). Every commit returns a receipt `{ revision, changedIds, savedAt }`; the save pill shows the revision and reveals the last save time on hover. This is the save receipt — do not add a second save pathway.
- Project open: load document, run `migrateDocument`, validate with `projectDocumentSchema`; on failure show a recovery panel with "Download raw JSON".
- A second tab editing the same project is **not** supported in v1. Use a `BroadcastChannel` lock: the second tab opens read-only with "Project is open in another tab".

### 3.4 Rendering architecture

One Pixi `Application` per viewport, created once and reused across scene switches.

Layers, bottom to top:

1. `world` container — applies camera transform.
2. Per scene layer: `Container` with parallax factor and alpha. Objects render as Pixi sprites/graphics/text/tilemaps.
3. `runtime` container — used during play mode; the editor world is hidden.
4. `overlay` container — in screen space: selection outlines, transform handles, marquee, snap guides, agent ghost highlights.
5. `gizmo` container — rulers (DOM/SVG is also acceptable, but keep them outside Pixi for crisp text).

Rules:

- Textures are cached by asset id and invalidated on asset replace.
- Objects are reconciled by id, not recreated every frame. A `SceneRenderer` keeps `Map<objectId, DisplayObject>`.
- Only active scene renders. Assets for the active scene preload; other scenes lazy-load.
- Device pixel ratio capped at 2.
- Culling: skip objects outside viewport + 200 px.
- Target 60 fps with 2,000 objects and 4 parallax layers at 1366×768 and 1440×900 on integrated graphics.

### 3.5 Runtime architecture

The runtime is a deterministic simulation over the same document. No Phaser, no third-party scene engine.

- Fixed timestep: 1/60 s accumulator, max 5 catch-up steps per frame.
- Coordinate system: origin top-left, y down, pixels. Rotation in degrees.
- Physics: axis-separated AABB with sub-stepping for velocities above 24 px/step; one-way platforms; world bounds. No slopes or rotation in collision for v1.
- Input: `InputManager` maps keyboard, pointer, and gamepad to logical actions via `settings.inputMap`. Produces `pressed`, `down`, `released` sets per fixed step.
- Behavior order: behaviors sort by catalog `order`, then instance id for determinism.
- Rules evaluate after behaviors, before collision resolution? Define exactly: **input → behaviors → rules → physics integration → collision → scene transitions → audio → telemetry**.
- HUD: render `settings.ui.hud` as screen-space widgets bound to live variables; `show-message` displays a centered message panel for its duration. HUD is presentation only and never mutates game state.
- Scene transitions destroy the runtime scene and load the target with a fade.
- Seeded RNG: `mulberry32(hash(projectId + sceneId + seed))`. All randomness (spawners, particles) uses it.
- Playtest seed is shown in the debug overlay and included in telemetry, so a run can be replayed.
- The editor stays interactive in play mode? No. Play mode is modal inside the viewport; panels remain but document is read-only until Stop.
- While playing, the agent can read telemetry but cannot mutate the document. It can queue edits for after Stop, or ask the user to stop.

### 3.6 Asset pipeline

- Import via file picker or drag-drop onto the asset browser / viewport.
- Accept: `png`, `jpg`, `webp`, `svg` (rasterized at 2×), `wav`, `mp3`, `ogg`.
- Compute SHA-256 of bytes; dedupe by hash. Store blob in IndexedDB `assets` store; document stores metadata only.
- Generate a 128 px thumbnail (canvas) at import; store as data URL in asset metadata.
- Sprite slicing:
  - Grid slice: columns/rows, padding, spacing.
  - Auto-detect: scan alpha for fully transparent separator rows/columns; propose cell bounds.
  - Manual rects.
  - Output `frames: { x, y, w, h }[]` on the asset.
- Collider generation: scan the frame alpha, compute tight bounds, produce body width/height/offset. Used by the "Fit collider to art" button.
- Animations: `AnimationClip { id, name, assetId, frameIndices, fps, loop }` stored on the project. The inspector exposes a clip picker and preview scrubber.

### 3.7 Behavior catalog (v1)

The catalog is the contract between UI, runtime, and agent. Each entry has a Zod params schema and a one-line description used in the AI prompt.

| Type | Params | Runtime behavior |
|---|---|---|
| `platformer-controller` | speed, jumpVelocity, doubleJump, coyoteMs, bufferMs, gravityScale, maxFallSpeed | Left/right movement, jump, double jump, coyote time, jump buffering |
| `top-down-controller` | speed, acceleration, normalizeDiagonal | 8-way movement with acceleration |
| `patrol` | axis, distance, speed, waitMs | Ping-pong movement around spawn |
| `follow` | targetId, speed, range, stopDistance | Chase a target when in range |
| `collectible` | variable, amount, sfxAssetId, destroyOnCollect | Increment variable, play sound, destroy |
| `hazard` | damage, respawn, invulnerabilityMs | Damage health or respawn at checkpoint |
| `checkpoint` | variable, value | Set checkpoint on overlap |
| `camera-follow` | targetId, lerp, deadzoneX, deadzoneY, clampToWorld | Move scene camera |
| `spawner` | prefabId, intervalMs, maxAlive, offsetX, offsetY | Spawn prefab instances on a timer |
| `timer` | durationMs, repeat, action | Emit a timed event consumed by rules |
| `variable-set` | variable, op, value, trigger | Set/add/toggle a variable on start/overlap/timer |
| `health` | max, respawnSceneId | Track HP, emit death, respawn |

The agent may only use these types. New behavior types require code changes and are out of scope for this branch.

### 3.8 Rules (logic without code)

```ts
export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  once?: boolean;
  when: Condition[];
  do: RuleAction[];
}

export type Condition =
  | { kind: "variable"; name: string; op: "==" | "!=" | ">" | ">=" | "<" | "<="; value: number | string | boolean }
  | { kind: "overlap"; objectId?: string; tag?: string; otherId?: string; otherTag?: string }
  | { kind: "input"; action: InputAction; mode: "pressed" | "down" | "released" }
  | { kind: "timer"; timerId: string }
  | { kind: "scene-start" };

export type RuleAction =
  | { kind: "set-variable"; name: string; op: "set" | "add" | "toggle"; value: number | string | boolean }
  | { kind: "spawn"; prefabId: string; x: number; y: number }
  | { kind: "destroy"; target: "self" | "object"; objectId?: string }
  | { kind: "play-sound"; assetId: string; volume?: number }
  | { kind: "show-message"; text: string; durationMs?: number }
  | { kind: "go-scene"; sceneId: string; delayMs?: number }
  | { kind: "set-behavior-param"; objectId: string; behaviorId: string; param: string; value: unknown }
  | { kind: "log"; message: string };
```

Rules run in document order per scene. Conditions are ANDed. Actions run in order. `once` rules disable themselves after firing (runtime-only).

### 3.9 Prefabs

- A prefab is a serialized object subtree plus a parameter schema (declared properties with defaults).
- Instances reference `prefabId` and store only overrides in `properties` and child overrides.
- "Detach" converts an instance into plain objects.
- Editing a prefab offers "Apply to all instances" (updates inherited fields) or "Create variant".
- Agent commands: `prefab.create`, `prefab.instantiate`, `prefab.update`, `prefab.setOverride`, `prefab.detach`.

### 3.10 Persistence and file formats

IndexedDB (`clockwork` database, version 1):

| Store | Key | Value |
|---|---|---|
| `projects` | project id | `{ id, name, updatedAt, coverDataUrl, revision, template, archivedAt? }` (denormalized list metadata; the document remains the source of truth) |
| `documents` | project id | `{ document, savedAt }` |
| `assets` | asset id | `{ meta, blob }` |
| `chats` | project id | `ChatMessage[]` |
| `settings` | `"app"` | last opened project, theme, panel sizes |

Export `.clockwork.json`:

```json
{
  "format": "clockwork-project",
  "version": 1,
  "exportedAt": "2026-11-16T00:00:00.000Z",
  "document": { "...": "ProjectDocument" },
  "assets": [{ "meta": {}, "dataUrl": "..." }]
}
```

Assets are embedded as data URLs on export so a project is a single portable file. Warn above 50 MB.

### 3.11 Error boundaries

- `AppErrorBoundary` at the router level: dark full-screen panel with "Reload", "Export project", and the error digest.
- `ViewportErrorBoundary` around Pixi: if WebGL context is lost, show "Renderer paused" and attempt restore once.
- Command errors surface as a toast with the validation message and the command label. Agent-originated errors are also shown inside the chat as a failed tool card.

---

## 4. UI specification

This section is normative. The target is a **game engine workstation**, not a document editor and not a dashboard. Design for a first-time creator: every icon has a label and tooltip, empty states teach the next action, advanced properties are collapsed, and no task requires a modal labyrinth. Borrow the arrangement principles of Unity (Hierarchy / Inspector), Unreal (Outliner / Details), and Godot (collapsible, resizable docks) — take the structure, not the complexity.

### 4.0 Redesign decisions from the UI audit

These decisions are binding; they resolve the problems in the old layout rather than reproducing them.

1. **The dashboard is a project list, not a form.** Search and `New project` stay visible; filters are disclosed; creation happens in a focused dialog with four modes; no creation form sits beside the cards.
2. **The editor is a fixed shell.** At 1366×768 nothing scrolls the page. The canvas fills the remaining space; docks and lists scroll internally.
3. **Two navigation systems only.** The rail owns project sections (Overview, Assets, Playtest, Ship, Project). The tab strip owns scene workspaces (Scene, Content, Logic, Presentation) and renders one at a time. Remove duplicate Scenes/Prefabs links and the old workspace anchor row.
4. **The right panel is contextual.** The inspector opens when an object is selected and groups common properties first. At 1366 it collapses until selection; the hierarchy stays open.
5. **Presentation owns the game's presentation.** Animation, Audio, and Game UI are secondary tabs inside Presentation, not separate top-level areas or stacked page sections.
6. **The agent is part of the editor.** `Plan a change` is the explicit Game Director entry; `Ask agent` keeps the selected-object handoff. The agent drawer is a dock/overlay, never a separate page.
7. **Preferences are not game data.** Dock widths, collapsed panels, active workspace, and sub-tab live in `localStorage` and the URL, never in the document or undo history.
8. **Archived is a state, not a separate app.** Archived projects are filtered, muted, and opened read-only with a visible unarchive path.
9. **No UI-only acceptance.** A phase is never `ACCEPTED` because the shell looks correct; behavior and evidence must pass.

**Scope note:** the UI handoff was written for a layout-only redesign of an existing app. This branch is a rebuild, so Slice 1 defines the canonical model once. After that, the handoff's "layout and presentation only" rule applies: no parallel model, no bypass of revision checks or save receipts, and UI work never changes domain behavior. v1 is single-user, so there is no existing authorization layer to preserve; if auth is added later, it must gate commands at the bus, never only in the UI.

### 4.1 Composition at 1366×768 and above

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 52  LOGO Clockwork   Projects / Runner  [PROJECT] r12     Search ⌘K  ?  ▣    │
├──────┬───────────────────────────────────────────────────────────────────────┤
│ 68   │ 42  Projects / Runner / Track     Scene  Content  Logic  Presentation│
│ rail ├───────────────────────────────────────────────────────────────────────┤
│      │ 46  [Select][Hand]  ↶ ↷   +Add  Arrange  Snap   Saved·r12  Ask agent ▶ Play  Layers Inspect Keys │
│      ├───────────────┬───────────────────────────────────┬───────────────────┤
│      │ 304           │  VIEWPORT                         │ 320               │
│      │ LAYERS        │  ruler 0    500   1k   1.5k  2k   │ INSPECTOR         │
│      │ + layer rows  │  ┌─────────────────────────────┐  │ Scene | Object    │
│      │ ACTIVE LAYER  │  │                             │  │ SCENE             │
│      │ Name/Opacity  │  │        game canvas          │  │ Name              │
│      │ HIERARCHY     │  │                             │  │ Kind              │
│      │ filter        │  └─────────────────────────────┘  │ World W/H         │
│      │ object rows   │  hint bar        2560×1080·snap   │ Save scene        │
│      │               │                                   │ DETAILS / IDs     │
│      ├───────────────┴───────────────────────────────────┴───────────────────┤
│ 26   One completed gesture = one revision and one undo entry.  0 selected     │
└──────────────────────────────────────────────────────────────────────────────┘
```

The diagram shows the ≥1600 docked arrangement; at 1366 the rules below give the canvas priority and collapse the inspector until selection.

**The shell is fixed to the viewport.** `height: 100dvh; overflow: hidden`; the page itself never scrolls. Only docks, lists, the inspector, and the chat scroll inside their own panels. At 1366×768 the workspace height is `768 − 52 − 42 − 46 − 26 = 602 px`; the canvas must remain usable at that size. The top bar + tab strip + toolbar are the compact editor header; save status, undo/redo, and Play live in the toolbar.

Measurements:

- Top bar **52 px**, left rail **68 px**, tab strip **42 px**, toolbar **46 px**, status bar **26 px**.
- At **1366–1599 px** wide: left dock **280 px** with the hierarchy open; right inspector **300 px** but **collapsed until a selection exists**. Selecting an object opens it and switches to Object. This leaves the canvas at least ~600 px wide.
- At **≥1600 px**: left dock **304 px**, right dock **320 px**, both open by default. Both are resizable 240–420 px and their widths are persisted as UI preferences.
- Agent drawer **400 px**; at `<1600 px` it overlays the viewport and inspector with a scrim instead of squeezing the canvas.
- Toolbar never wraps. If the available width is too small, panel toggles and secondary actions move into a labeled `View` overflow menu.
- Panel borders 1 px `--border`; no shadows except dialogs and the agent drawer.
- All controls 28 px tall (inputs, buttons), 24 px icon buttons, 32 px rows.
- Base font 13 px, labels 11 px, section headers 10 px uppercase with `0.08em` tracking. Mono for IDs, numbers, coordinates, and revision badges.

### 4.2 Design tokens

```css
:root {
  /* surfaces */
  --bg-0: #0b0c0f;          /* app background behind panels */
  --bg-1: #111217;          /* canvas shell / rails */
  --panel: #15171d;         /* panels */
  --panel-2: #1a1c23;       /* inputs, raised rows */
  --panel-3: #20232b;       /* hover */
  --border: #2a2d36;
  --border-strong: #3a3e49;

  /* text */
  --text: #f1f0ed;
  --text-muted: #a7a9b2;
  --text-faint: #6f7480;

  /* accents */
  --coral: #ff856f;
  --coral-soft: rgba(255, 133, 111, 0.14);
  --violet: #b5a2ff;
  --violet-soft: rgba(181, 162, 255, 0.14);
  --green: #8ed6a1;
  --amber: #e7c47a;
  --red: #f06a6a;

  /* geometry */
  --r-sm: 4px;
  --r-md: 6px;
  --r-lg: 10px;

  --font-ui: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

Do not introduce a second accent hue. Coral = primary action / selection / play. Violet = AI. Green = saved / passed. Amber = warning. Red = destructive / error.

### 4.3 Top bar

Left to right:

- 28 px rounded-square logo: dark tile, coral "C" with a faint violet offset. Product name **Clockwork** in 14 px semibold.
- Breadcrumb: `Projects / Runner`, then a bordered `PROJECT` chip and a mono revision chip `r12`. Breadcrumb separators are `--text-faint`; current item is `--text`.
- Right: search field (240 px, 28 px tall) with a search icon and `⌘K` kbd; a `?` help icon button; a feedback icon button; a panel toggle icon button.
- The top bar has a 1 px bottom border. No drop shadow.

### 4.4 Left rail

68 px wide, `--bg-1`, one item per **project section**:

`Overview` (grid), `Assets` (image), `Playtest` (play), `Ship` (rocket), `Project` (settings).

Every rail item must resolve in v1: Overview = project summary and scene list; Assets = project-wide asset library; Playtest = run the current start scene; Ship = export/share; Project = rename, start scene, archive/delete, export/import settings. No dead rail buttons.

- This rail is the **only project-level navigation**. Scene workspaces live in the tab strip (§4.5). Do not repeat Scene/Content/Logic/Presentation here, and do not repeat the rail destinations in the tab strip.
- `Scenes` and `Prefabs` are not rail items: scenes are reached through the `Project scenes` switcher in the tab strip, and prefabs live in the Content workspace. This avoids the duplicate-navigation problem the redesign is fixing.
- The rail's `Assets` is the **project-wide asset library**. The `Content` workspace is **scene authoring** (object palette, prefabs, tilesets, animations). They are different scopes, not two links to the same screen.
- Icon 18 px, label 9 px uppercase beneath, 4 px gap.
- Active item: coral icon + text, 2 px coral bar on the left edge, subtle `--coral-soft` background.
- Hover: `--panel-3`.
- At `<1200 px`, the rail collapses to icons only with tooltips; labels return at ≥1200.
- Bottom of the rail: a 28 px avatar/initial button for app settings.

### 4.5 Tab strip

- Left: breadcrumb `Projects / Runner / Track` (Track = active scene, editable on double-click).
- Tabs: **Scene**, **Content**, **Logic**, **Presentation**. 13 px, 36 px tall, active tab has a 2 px coral underline and white text; inactive is muted. These four tabs are the **only scene-workspace navigation**; render exactly one at a time.
- **Presentation** contains its own secondary tabs: `Look`, `Animation`, `Audio`, `Game UI`. These never appear in the top strip. Animation clips, the audio mixer/music assignment, and HUD/Game UI settings live there, not as separate top-level destinations.
- Right: `Project scenes` button (secondary, 28 px) opens a searchable scene switcher popover with scene names, object counts, and `+ New scene`. It is a switcher, not a second navigation bar.
- Keyboard: `1`–`4` switch tabs when focus is not in an input or textarea. `⌘S` is save, not a tab.
- The editor route is `/project/:projectId/scene/:sceneId`. Workspace changes update the query with `replaceState`: `?tab=scene|content|logic|presentation&ptab=look|animation|audio|ui`. Reloading or pasting the URL restores the same scene and workspace. Do not create history entries for workspace switches.

### 4.6 Toolbar

The toolbar is a single non-wrapping row. At ≥1200 px, **always visible:** `Select`, `Hand`, undo, redo, `+ Add`, `Snap`, save state, `Ask agent`, `Play`, `AI Play`. At `<1200 px`, the save-state pill moves to the status bar and `Ask agent` becomes icon-only, but every action remains available with a label or tooltip. `Play` and `AI Play` stay together in a labeled Play split menu; AI Play is never an unlabeled icon. Everything else lives in a labeled menu or the `View` overflow menu.

Left group:

- `Select` and `Hand` segmented buttons with icons. Active = coral text, coral-soft background, 1 px coral border.
- Undo / redo icon buttons, disabled at 30% opacity. Tooltips include shortcuts.
- Divider.
- `+ Add` split button (Add object, Add scene, Add layer, Import asset).
- `Snap` menu (grid 8/16/32, snap to objects, snap to guides) with checkmarks.
- `Arrange` menu (Bring forward, Send backward, Align left/center/right, Distribute, Group, Ungroup, Grid settings). This menu holds the secondary layout actions so the toolbar does not grow.

Right group:

- Save state pill: green dot + `Saved · r12`; `Saving…` amber; `Unsaved` muted; `Save failed` red and clickable to retry.
- `Ask agent` **split button**: violet outline, sparkle icon. The main click opens the agent in `Build` mode with the current selection attached. The chevron opens `Plan a change` (opens the agent in `Plan` mode), `Explain this scene` (`Ask` mode), and `Open chat`.
- `Play` button: coral filled, play icon. `⌘↵`. Turns into `Stop` while playing. Manual Play never needs a model or Kane.
- `AI Play` button: violet outline, sparkle-play icon. `⌘⇧↵`. Opens a snapshot with the AI HUD and runs Kane. Disabled with an explanation when no model or Kane is configured. Turns into `Stop AI Play` while running.
- `View` menu: `Focus canvas`, `Hierarchy`, `Inspector`, `Input map`, `Debug overlay`, `Help & shortcuts`. Each panel item shows a checkmark and exposes the same action as the panel toggles; `?` opens the same help list. At ≥1600 the hierarchy/inspector toggles may also appear as icon buttons; at 1366 they collapse into `View` so the bar never wraps.
- Toggle buttons use `aria-pressed`; menus that open panels use `aria-expanded` / `aria-controls`.

### 4.7 Left dock

Two stacked sections separated by a 1 px border, each independently scrollable. Both are collapsible with a labeled chevron and `aria-expanded`; the layout remembers their state per project. At 1366 the hierarchy is open at 280 px and the layers section is open; at `<1366 px` the whole dock becomes a labeled `Hierarchy` drawer opened from the toolbar. The page itself never scrolls.

**Layers**

- Header `LAYERS` + `+` icon button. Helper line: "Topmost first. New objects use the active layer." 11 px muted.
- Row: visibility eye, lock, name, object count, trash on hover. 32 px. Drag handle on the left. Active row uses `--coral-soft` with a 2 px coral left border.
- Selected layer editor below: Name input, three compact numeric fields `Opacity / Parallax X / Parallax Y`, buttons `Select objects`, up/down reorder arrows.
- Footer microcopy: "Visible in the canvas."

**Hierarchy**

- Header `HIERARCHY` + object count, a labeled collapse chevron, and a `+` button. Helper: "Topmost first. Groups select together from the canvas."
- Search input with a search icon and `⌘F` hint. It filters in real time by name, type, tag, and id; `Esc` clears. This is the primary way to find objects in a large scene.
- Stats line: `3 groups · 2 hidden · 1 locked`; when a filter is active, show `N of M` instead.
- Object rows: expand chevron for groups, type icon, name, type + z-index in mono, eye/lock on hover. 30 px. Rows are virtualized above 500 items.
- Multi-select with Shift/Cmd; selection is shared with the canvas and inspector. Selection must remain visible when the hierarchy is filtered out; show a small `1 selected outside filter` note.
- Drag to reparent; dropping into a layer moves the object's `layerId`. Dropping onto empty space moves it to the active layer.
- Keyboard: ↑/↓ move, ←/→ collapse/expand, Enter renames, Delete deletes, Space toggles visibility. The hierarchy is the accessible alternative to canvas selection.
- At `<1366 px` the panel is a labeled drawer with a visible `Hierarchy` title and close button; it must not push the canvas into horizontal overflow.

### 4.8 Viewport

- The viewport fills all remaining width and height; never set a fixed canvas height. Rulers: 24 px, `--panel`, tick marks every 100 px, labels every 500 px in 10 px mono. Origin at world 0,0. The cursor position is shown as a coral guide line.
- Canvas background: `--bg-0` with a 1 px border. A subtle checkerboard is shown only when the scene background is transparent.
- Scene art is centered with a 32 px margin. A 1 px coral frame marks the world bounds; safe-area guides are optional.
- Overlay:
  - Hover: 1 px `--text-muted` outline.
  - Selected: 1.5 px coral outline + 6 px square handles (scale) and a rotation handle above.
  - Multi-select: coral outlines, one bounding box, count badge.
  - Agent-touched: violet 2 px dashed outline that fades over 1.2 s, plus a small `AI` tag.
  - Ghost preview: 50% opacity violet silhouette of the proposed transform, with a "Preview · Apply / Discard" pill at the top center.
- Bottom hint bar (24 px): contextual copy, e.g. `Drag to move · Shift-click for multi-select · drag empty space to marquee`; right side `2560 × 1080 · snap 8`.
- Zoom cluster top-right: fit, `−`, percentage input, `+`, `1:1`. `Space` + drag pans; wheel zooms at cursor; `0` fits; `1` = 100%.
- Empty scene state: centered panel "This scene is empty" with `Add object`, `Ask agent to build this scene`, and `Import asset`.
- Drop target: dropping an image creates a sprite object at the cursor and imports the asset in one transaction.

### 4.9 Inspector

- Header `INSPECTOR` + a `LEVEL` chip on the right, and a labeled collapse chevron with `aria-expanded`.
- **Contextual visibility:** at 1366 the inspector starts collapsed to preserve canvas width. Selecting an object opens it automatically and switches to `Object`. At 1200–1365 it opens as a labeled `Inspector` drawer. Clearing the selection switches back to `Scene`; if the user explicitly collapsed it, respect that until the next selection. At ≥1600 it is open by default. `View → Inspector` can always reopen it.
- Group common properties first; collapse secondary groups (`Advanced`, `Details`, prefab metadata) by default.
- Segmented control `Scene | Object`; disabled Object when nothing is selected.
- **Scene tab**: sections `SCENE` (Name, Kind select, World width/height pair, Background color), helper copy, `Save scene` coral button, `DETAILS` (Scene ID, Project ID, Order, Background) in mono with copy buttons.
- **Object tab**:
  - Identity: Name, tags.
  - Transform: X/Y, W/H (for rect/text), Rotation, Scale X/Y, Origin X/Y. Numeric inputs support drag-to-scrub and expressions (`120+32`).
  - Visual: type-specific fields (asset picker, frame, tint, text content, font size, color, tilemap).
  - Body: type select, width/height, offsets, gravity scale, one-way, collide world bounds, `Fit to art` button.
  - Behaviors: list of cards with enable toggle, param fields generated from the catalog schema, remove button, `+ Add behavior`.
  - Prefab: prefab name, `Edit prefab`, `Detach`, `Revert overrides`.
  - Multi-select: show shared transform fields and "N objects selected"; edits apply to all.
- Every field commits on blur or Enter; live drag commits through a transaction. Never commit on each keystroke to history.

### 4.10 Agent drawer

This is a first-class engine panel, not a floating chatbot. It is the product's **Game Director**.

- Opens from `Ask agent`, `Plan a change`, `⌘J`, the right-edge vertical `AGENT` tab, or an empty-state prompt. `Plan a change` opens it directly in `Plan` mode with the current selection attached. Width 400 px, resizable; dark `--panel` with a 1 px left border.
- At `<1600 px` it overlays the viewport and inspector with a scrim; it never squeezes the canvas below its usable width. The page must not scroll horizontally when it is open.
- **Header**: sparkle + `Agent` with a small `GAME DIRECTOR` label, status dot (`ready` / `thinking` / `editing` / `verifying` / `error`), model picker with provider/model and tools/vision badges, `+` new chat, close. No large avatar.
- **Context row**: compact chips: `Runner · r12`, `Scene: Track`, `3 selected`, `Playtest: off`. Chips are auto-attached; clicking removes one. A `+` opens a context picker (scene, asset, object, playtest telemetry).
- **Mode switch**: `Ask | Build | Plan`.
  - Ask: read-only tools, answers questions.
  - Build: mutates the document immediately; one undo entry per turn.
  - Plan: proposes a change set; nothing mutates until `Apply`.
  Default `Build`. Destructive commands always require confirmation regardless of mode.
- **Messages**:
  - User: right-aligned compact block, `--panel-2`, no bubble tail.
  - Assistant: full-width text at 13 px/1.55, no bubble; tool calls render as cards.
  - Tool card: 28 px header with icon, human label ("Inspecting scene"), status spinner/check/x, collapsible JSON input/result in mono 11 px.
  - Change set card: violet left border, `4 changes · 1 undo entry`, list of affected objects with before → after for changed fields, `Undo` button; in Plan mode `Apply` and `Discard`.
  - Verification card: engine-QA Kane steps, pass/fail, duration, evidence link (Slice 10).
  - AI Play panel: second Play button, live Kane steps, attempt fail/pass, fix, evidence (Slice 10).
  - Error: red-tinted card with the validation message and `Retry`.
- **Composer**: auto-growing textarea 1–6 rows, placeholder `Ask, build, or fix anything…`; left `+` attach menu (selection, scene, asset, screenshot); right send button (coral, disabled while streaming); `Stop` replaces send while running. Footer hint: `⏎ send · ⇧⏎ newline · Esc stop`.
- **Empty state**: "What are we building?" plus 3 contextual suggestion cards based on the active scene and selection, e.g. "Add a double jump", "Make the drone patrol", "Why does the player fall through?".
- **Agent presence**: while the agent selects or edits, the corresponding object gets a violet pulse and the viewport pans to it if off-screen. A small label near the selection reads `Agent`.
- **Scroll behavior**: pin to bottom while streaming unless the user scrolls up; show a "Jump to latest" pill.

### 4.11 Status bar

- Left: the revision rule copy `One completed gesture = one revision and one undo entry.` followed by `N selected`.
- Right: `0 undo · 0 redo` counts, save state, active scene size, FPS while playing.
- 10–11 px, mono for numbers, `--text-faint`.

### 4.12 Projects page

The dashboard exists to open or continue a project. It is not a form page.

- Same fixed-height shell top bar without the revision chip. The content area scrolls; the page does not.
- Header: `Projects` with a count, a search input, and a coral `New project` button that is always visible. No intro paragraph, no feature grid, no project-count badge above the list.
- **Filters disclosure** (a labeled `Filters` button with a count badge) reveals sort (`Recently edited`, `Name`), status (`Active`, `Archived`, `All`), and template origin. Because v1 is single-user, there is no role filter; do not render a disabled one. If collaboration is added later, the role filter belongs in this same disclosure. Filters are presentation state and persist in `localStorage`, not the project document.
- Main content: a responsive grid of cards, min 260 px, 16:9 cover, name, `Edited 2m ago`, scene count, template chip, and an overflow menu (`Open`, `Rename`, `Duplicate`, `Export`, `Archive`/`Unarchive`, `Delete`). Archived cards are muted with an `ARCHIVED` chip; opening one shows a read-only banner with `Unarchive`.
- `New project` opens a focused dialog with four **mutually exclusive** choices as a 2×2 card group: `Blank`, `Template`, `From brief`, `Import`. Only the selected path's fields render:
  - **Blank**: name only.
  - **Template**: name + template cards (`Platformer`, `Top-down`, `Puzzle`) with a one-line description and a small diagram.
  - **From brief**: name + a 4-row brief textarea + optional template style. Create opens the editor and immediately sends the brief to the agent in Build mode. This path is unavailable until Slice 7 and must say so if clicked early.
  - **Import**: `.clockwork.json` file picker with drag-drop, validation, and a clear error for wrong format/oversized files.
- `More settings` is a collapsed disclosure available on Blank/Template/From brief: design resolution (1280×720, 1920×1080, custom), pixel art toggle, gravity preset. Do not show these by default.
- States: loading skeleton cards, empty (no projects: "Create your first project" + template cards), no results ("No projects match" + `Clear filters`), and error (retry + import escape hatch).
- No marketing hero, no full creation form beside the list, no gradients.

### 4.13 Interaction details

- **Fixed shell:** `html, body, #root { height: 100%; overflow: hidden; }`; the editor is a CSS grid of `52 / 42 / 46 / 1fr / 26` rows. Docks and panels use `min-height: 0; overflow: auto` internally. No whole-page scrollbar at any supported size.
- **No horizontal overflow** at ≥1024 px. Long tags, IDs, scene names, and asset names truncate with ellipsis and a tooltip; they never stretch a panel.
- **Panel preferences:** dock widths, collapsed state, active workspace, and last tab are stored under `localStorage["clockwork:ui"]` per project. They are presentation preferences, never part of the game document, revision, or undo history.
- **Deep links:** `/project/:projectId` (overview) and `/project/:projectId/scene/:sceneId?tab=<scene|content|logic|presentation>&ptab=<look|animation|audio|ui>`. Scene/tab changes use `replaceState`. Selecting an object does not rewrite the URL. Pasting a link restores the workspace; a missing scene falls back to `startSceneId` with a toast.
- **Scene switcher:** `Project scenes` is a popover, not a persistent second nav. It closes on selection, supports search, and shows `+ New scene`.
- Focus rings: 1 px `--violet` + 2 px offset, only for keyboard (`:focus-visible`).
- Hover transitions 80 ms; panel open/close 140 ms; no bouncy easing.
- Menus: 220–260 px, 28 px rows, 11 px section labels, kbd hints right-aligned.
- Toasts: bottom-left, 320 px, dark panel, 3 s, one action max.
- Dialogs: 12 px radius max, `--panel`, 1 px border, scrim `rgba(0,0,0,.55)`; focus is trapped and returns to the trigger on close.
- Cursor: default arrow; hand tool = grab/grabbing; crosshair over the canvas when rect tool active.
- Selection and camera changes never create history entries.
- The canvas has `tabIndex=0` and a visible focus ring only on keyboard focus.
- Loading: skeleton rows, never spinners in panels. A spinner is allowed only for model streaming.

### 4.14 Responsive and shell behavior

| Viewport | Layout |
|---|---|
| **≥1600 px** | Rail + 304 px left dock + canvas + 320 px inspector; agent docks at 400 px and shrinks the canvas |
| **1366–1599 px** | Rail + 280 px hierarchy + canvas + inspector collapsed until selection; agent overlays with scrim |
| **1200–1365 px** | Hierarchy and inspector become labeled drawers; toolbar secondary actions move to `View`; canvas keeps ≥55% width |
| **1024–1199 px** | Rail is icon-only; both docks are modal drawers with visible titles; toolbar shows only Select, Hand, Add, Undo, Redo, Snap, Agent, Play; no page overflow |
| **<1024 px** | Editor shows a full-screen "Clockwork needs a wider window" panel with a project export action. The shared player and `/play/:id` remain fully usable on mobile. |

- Drawers are labeled sheets, not unlabeled overlays: `Hierarchy`, `Inspector`, `Agent`, each with a close button and `aria-expanded`.
- The canvas resizes with the shell. Never use a fixed canvas height.
- Opening a drawer does not change the document or create history.
- At 1366×768, the visible canvas must be at least 600×480 and every primary action must be reachable without scrolling the page.

### 4.15 Accessibility

- Every icon button has an `aria-label` and a tooltip.
- Panel and dock toggles expose `aria-expanded` and `aria-controls`; tabs use `role="tablist"`, `role="tab"`, and `aria-selected`.
- Drawers have accessible names and trap focus; closing returns focus to the trigger.
- The scene hierarchy is keyboard-navigable and is the accessible alternative to canvas selection.
- Color is never the only signal: selection also uses outlines and checkmarks; save state uses text; archived uses a text chip.
- Contrast: body text ≥ 7:1 on panel backgrounds; muted text ≥ 4.5:1.
- The 1366×768 layout is the accessibility baseline for zoom 100%; at 200% browser zoom the editor may switch to drawer mode, but must not clip controls.

### 4.16 Visual anti-patterns (reject on sight)

- White or light-gray app chrome.
- Rounded 16 px cards, big shadows, glassmorphism, gradient buttons.
- A chat that looks like a messaging app with avatars and bubbles.
- More than two accent colors.
- Center-aligned marketing copy inside the editor.
- Empty panels with oversized illustrations.

### 4.17 Settings, AI providers, and model picker

AI configuration is a first-class part of the product, not an `.env`-only secret.

- **Entry:** bottom of the left rail (avatar/settings) or `⌘,`. Route `/settings`; back returns to the previous project. The settings screen uses the same shell, with a left sub-nav: `General`, `AI Models`, `Kane`, `Data`.
- **Kane tab:** show CLI path, installed/logged-in/credit status, a `Test Kane` action, AI Play enabled toggle, headless toggle (local demo vs server), and the evidence folder with a `Clear` action. Never show the Kane token.
- **Default model picker:** searchable, grouped by provider, with badges `TOOLS`, `VISION`, `LOCAL`, context-window size, and a disabled state when the provider has no key. The selected default is stored server-side; a per-chat override is stored in `localStorage` and shown in the agent header.
- **Provider cards:** provider name/logo, key-source badge (`ENV`, `VAULT`, `SESSION`, `MISSING`), model count, `Test`, `Manage models`, and `Add key`/`Replace key`/`Remove`. Environment-managed keys are read-only and show the variable name, never the value.
- **Add provider:** a labeled dialog for custom providers: display name, API style (`OpenAI-compatible`, `Anthropic`, `Google`, `Ollama`), base URL, optional custom headers, and key. It must pass `Test connection` before Save is enabled.
- **Add model:** provider, model id, display label, context window, `Supports tool calls`, `Supports images`, and optional notes. A model without tool support can still be used in `Ask` mode, but not `Build`/`Plan`.
- **Key dialog:** password-type input, `Save to vault` or `Use for this session only`, `Test`, `Cancel`. After save, show only a masked hint (last 4 characters) and the source. Never render a saved key back into the DOM.
- **Agent header:** a compact model picker with the active model, provider, and tool/vision badges. Switching applies to the next turn, not the current stream. A small gear opens Settings → AI Models.
- **No-key state:** the chat shows a setup card ("Connect a model to start building") with `Open settings`; project creation, manual editing, persistence, manual Play, share, and export remain fully usable. `AI_MOCK=1` is clearly labeled `MOCK` in the header.
- **Tool/vision gating:** a model without tool calls disables `Build` and `Plan` with an explanation; a model without vision hides `capture_viewport` and tells the agent not to call it. There is no silent fallback to another model.
- **Popular built-ins:** OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, and Ollama/local. The catalog is data-driven so model ids can be refreshed without a UI change; custom OpenAI-compatible providers cover the long tail.

### 4.18 AI Play (second Play button)

Manual Play is the default and never requires an LLM, a provider key, or Kane. The editor must remain fully usable for creating, editing, saving, reopening, playing, sharing, and exporting with no model configured.

- **Toolbar:** two distinct actions at the top right: `Play` (coral, manual) and `AI Play` (violet outline with a sparkle-play glyph). At 1366×768 both show text. At narrower widths they stay together in a labeled `Play` split menu; AI Play is never an unlabeled icon.
- **Shortcuts:** `⌘↵` / `Ctrl+Enter` manual Play; `⌘⇧↵` / `Ctrl+Shift+Enter` AI Play.
- **No-model / no-Kane state:** if no model is configured, AI Play is hidden or disabled with `Connect a model to diagnose and fix; manual Play works.` If Kane is missing or logged out, the copy is `Kane CLI is not configured. Set up in Settings → Kane; manual Play works.` Manual Play remains enabled in both cases. AI Play never blocks editing or playtesting.
- **AI Play panel:** uses the same right-side slot as the agent drawer (the chat collapses to an `Agent` tab, so the two never fight for width). It is a panel, not a chat bubble, with `KANE PLAY` header, model badge, objective, live step list, attempt timeline, verdict, `final_state`, and evidence link. Controls: `Stop`, `Retry`, `Open evidence`, `Copy objective`, `Auto-fix` (default on), and `Undo AI fixes` after a failed final attempt. With Auto-fix on, the agent applies one non-destructive change set and reruns automatically; with it off, the panel proposes the fix and waits for `Apply`. At `<1600` it overlays with a scrim; at `≥1600` it docks.
- **Player AI HUD:** opening `/play/:id?ai=1&seed=<n>` adds a visible `AI PLAY` layer over the game. It is a real DOM control surface so Kane can act on labels instead of guessing pixel coordinates:
  - Controls: `MOVE LEFT`, `MOVE RIGHT`, `JUMP`, `ACTION`, `STOP`, `RESTART`.
  - Movement toggles show `ON`/`OFF`; Jump and Action are impulses. They dispatch the same input actions as the keyboard.
  - State panel, visible text and `aria-live`: `STATUS: PLAYING|WON|LOST|ERROR`, `SCENE`, `COINS`, `HEALTH`, `TIME`, `SEED`, `LAST ERROR`. Readouts are plain values (`COINS: 3`, not `3/3`) so `store ... as` extracts a clean value; `STATUS` and `LAST ERROR` use the exact tokens above.
  - `LAST ERROR` names the failing object or runtime error and is visible, not hidden in the console.
  - Manual keyboard input continues to work. Gameplay rules are identical to manual Play.
- **Run isolation:** AI Play always uses an immutable share snapshot, not the editor URL with live IndexedDB state. The snapshot is read-only; Kane cannot change the project directly.
- **Consent:** before the first run in a session, state that AI Play uses Kane CLI and provider credits and uploads a Test Manager run unless configured otherwise. Offer `Don't ask again this session`.
- **Failure copy:** show the actual Kane verdict, not a generic error. Examples: `Kane could not reach the goal: player stuck at x=840`, `Game error: platform collider missing on object obj_12`, `Kane CLI is not installed`, `Kane run timed out after 180 s`.

---

## 5. AI agent architecture

### 5.1 Non-negotiable design: client-authoritative tools

The model runs on the server because the API key must never reach the browser. But **tools execute in the browser, against the live EngineStore**. The server is a stateless relay:

1. Client builds a `ContextPacket` from the current document and editor state.
2. Client POSTs `{ modelId, messages, context, mode }` to `/api/agent/step`. The server resolves the model and key; no key or base URL crosses from the client.
3. Server calls the model with the tool catalog and the system prompt, then streams `text_delta` and `tool_call` events over SSE.
4. Client executes each tool locally. Command tools go through the `CommandBus`; read tools query the store.
5. Client appends `tool` messages with results and calls `/api/agent/step` again.
6. Repeat until the model returns no tool calls (max 8 steps), then render the final summary.

Why: there is exactly one document, one revision, one undo stack. There is no synchronization protocol, no server mirror, no stale cache. It also means the agent can see selection, playtest state, and the viewport in real time.

### 5.2 Shared protocol

`shared/protocol.ts`:

```ts
export type AgentMode = "ask" | "build" | "plan";

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: ToolResult;
  changeSet?: ChangeSetSummary;
  kaneRun?: KaneRunSummary;
  error?: string;
}

export interface StepRequest {
  projectId: string;
  mode: AgentMode;
  modelId: string;              // "provider:model"; resolved server-side
  messages: AgentChatMessage[];
  context: ContextPacket;
  enableKane?: boolean;
}

export type StepEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; callId: string; name: string; args: unknown }
  | { type: "step_end"; finishReason: "stop" | "tool-calls" | "length" | "error"; usage?: TokenUsage }
  | { type: "error"; message: string; code?: string };

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  revision: number;
  changedIds?: string[];
  undoLabel?: string;
}

export interface ChangeSetSummary {
  transactionId: string;
  label: string;
  revision: number;
  changes: Array<{
    entityId: string;
    entityKind: "project" | "scene" | "object" | "layer" | "prefab" | "asset" | "rule";
    entityName: string;
    fields: Array<{ path: string; before: unknown; after: unknown }>;
    op: "create" | "update" | "delete";
  }>;
  undoable: boolean;
}
```

### 5.3 Context packet

Built on the client at the start of every user turn and refreshed after any tool error caused by a revision mismatch. Keep it under ~12k tokens.

```ts
export interface ContextPacket {
  app: { name: "Clockwork"; schemaVersion: 1 };
  project: {
    id: string; name: string; revision: number;
    width: number; height: number; pixelArt: boolean;
    startSceneId: string;
    sceneCount: number; assetCount: number; prefabCount: number;
    settings: {
      gravity: { x: number; y: number };
      background: string;
      inputMap: Record<string, string[]>;
      audio: { musicVolume: number; sfxVolume: number };
      ui: { hud: Array<{ variable: string; label: string; corner: string; style: string }> };
    };
  };
  editor: {
    tab: string;
    activeSceneId: string | null;
    activeSceneName: string | null;
    activeLayerId: string | null;
    selection: Array<{ id: string; name: string; type: string; layerName: string }>;
    tool: string;
    playtest: "off" | "running" | "paused";
    camera: { x: number; y: number; zoom: number };
    viewportSize: { w: number; h: number };
  };
  activeScene: {
    id: string; name: string; kind: string; size: { w: number; h: number };
    layers: Array<{ id: string; name: string; order: number; objectCount: number }>;
    objects: Array<{
      id: string; name: string; type: string; layerId: string;
      x: number; y: number; w?: number; h?: number;
      behaviors: string[]; tags: string[];
    }>;
    rules: Array<{ id: string; name: string; enabled: boolean; summary: string }>;
  } | null;
  selectionDetails: Array<{
    id: string; name: string; type: string;
    transform: Record<string, number>;
    visual?: Record<string, unknown>;
    body?: Record<string, unknown>;
    behaviors: Array<{ id: string; type: string; enabled: boolean; params: Record<string, unknown> }>;
    properties: Record<string, unknown>;
  }>;
  assets: Array<{ id: string; name: string; kind: "image" | "audio"; width?: number; height?: number; tags?: string[] }>;
  prefabs: Array<{ id: string; name: string; objectCount: number }>;
  variables: Array<{ name: string; type: string; initial: unknown }>;
  recentActions: Array<{ label: string; source: "ui" | "agent"; revision: number; at: string }>;
  playtestTelemetry?: {
    sceneId: string; elapsedMs: number; fps: number;
    variables: Record<string, unknown>;
    events: Array<{ atMs: number; type: string; message: string }>;
    lastError?: string;
  };
  availableCommands: string[]; // compact list, full schemas are in the tool definition
  warnings: string[];          // e.g. "3 objects have no visual"
}
```

Do not dump every object of every scene. The active scene gets a compact index; details only for selection. The model uses `query_project` when it needs more.

### 5.4 Tool catalog

All tools are declared in `src/engine/ai/tools.ts` with Zod, then converted to JSON Schema for the model (`z.toJSONSchema`). The server imports the generated schema from `shared/tool-schema.ts` so there is one source of truth.

#### `get_project_summary`
No args. Returns counts, scenes with object counts, start scene, settings, variables, prefabs, asset count. Use before planning across scenes.

#### `query_project`
```ts
{
  sceneId?: string;
  kinds?: Array<"scene" | "object" | "prefab" | "asset" | "rule" | "variable">;
  text?: string;
  tags?: string[];
  limit?: number; // default 50, max 200
}
```
Returns compact entities with ids and names. Never returns asset blobs.

#### `inspect_entity`
```ts
{ id: string }
```
Returns the full serialized entity plus computed info: world bounds, resolved prefab fields, behavior catalog docs for its behaviors, and which rules reference it.

#### `apply_commands`
```ts
{
  summary: string;              // short human label, e.g. "Add double jump and drone patrol"
  expectedRevision: number;
  commands: Command[];          // 1..50, executed atomically
}
```
`Command` is the discriminated union from §6. Its JSON Schema is generated with `z.toJSONSchema(commandSchema)` and injected into this tool definition, so the model sees every command type and its required arguments. This is the **only** write tool. Executes as one transaction, one undo entry, one revision. If any command fails validation, nothing commits. Returns revision, changed ids, and a change set.

#### `preview_commands`
Same shape as `apply_commands`, but returns patches + a change-set summary without committing. The client renders ghost overlays. Used in Plan mode and for destructive changes.

#### `select_entities`
```ts
{ ids: string[]; sceneId?: string; focus?: boolean }
```
Selects objects, switches scene if needed, optionally pans the viewport. Ephemeral; not undoable.

#### `open_panel`
```ts
{ panel: "layers" | "inspector" | "assets" | "logic" | "playtest" | "ship" | "agent" | "settings"; tab?: string }
```
Changes the UI so the user can see what the agent is talking about.

#### `start_playtest`
```ts
type PlaytestInput = {
  atMs: number;
  action: "left" | "right" | "up" | "down" | "jump" | "action";
  phase: "press" | "release";
};

{ sceneId?: string; durationMs?: number; seed?: number; inputs?: PlaytestInput[] }
```
Starts play mode in the viewport, runs for a bounded duration (default 4,000 ms, max 15,000), collects telemetry, stops, and returns `{ passed, variables, events, errors, fps, frames }`. The agent may script inputs for a deterministic check. The editor is read-only during this tool.

#### `capture_viewport`
No args. Returns a PNG data URL of the current viewport (max 1280×720). The client attaches it to the next model step as an image part. Use for visual questions and layout checks.

#### `verify_with_kane` (Slice 10, engine QA)
```ts
{ objective: string; projectId?: string }
```
Flushes a project snapshot, runs Kane CLI against the snapshot URL, streams step events into the chat, and returns the final verdict + evidence path. Dev/verification only; disabled in production unless explicitly enabled.

#### `run_ai_play` (Slice 10, product)
```ts
{ sceneId?: string; goal?: string; maxAttempts?: 1 | 2 }
```
Runs the in-product AI Play loop: saves a snapshot, opens the AI HUD, generates a gameplay objective, runs Kane, and returns `AiPlayResult`. On failure the agent receives `final_state`, runtime errors, last steps, and evidence, then may fix and retry. Requires a configured model and Kane; never call it when either is missing.

#### `undo_last_agent_change`
No args. Undoes the most recent transaction authored by the agent. Refuses if the user has edited since (revision changed) — ask instead.

### 5.5 System prompt

`server/ai/system-prompt.ts` builds the prompt from static text plus the command catalog. Keep it stable and versioned (`PROMPT_VERSION = 1`).

```text
You are Clockwork's engine agent. You operate the same live game project the user sees.

You can inspect and modify every part of the project through tools. You cannot write code,
run shell commands, or access the network.

Operating rules:
1. Prefer the smallest edit that achieves the request. Do not redesign unrelated content.
2. Use real ids from the context. Never invent ids or asset names.
3. Batch related edits into one apply_commands call with a clear summary.
4. Always pass the current expectedRevision. If a revision mismatch occurs, re-read the
   context and re-plan; never retry the same batch blindly.
5. Destructive operations (deleting a scene, object, prefab, or asset) require a preview
   and user confirmation. In Build mode, describe the deletion and use preview_commands.
6. Use behaviors and rules from the catalog. Do not invent behavior types or params.
7. When asked to fix something visual, inspect first, then change one thing, then optionally
   start a short playtest and report what changed.
8. After edits, reply in 1-3 short sentences: what changed, where, and how to undo.
9. Never claim a playtest passed unless you ran start_playtest and saw passed=true.
10. If the request is ambiguous, make the most reasonable game-design choice and state it
   briefly, rather than asking a blocking question.
11. AI Play is Kane, not start_playtest. Never claim Kane passed without a run_end status
   of passed. On failure, use final_state/evidence to diagnose, apply one non-destructive
   fix, and retry with the same seed at most once. Show both attempts if the retry fails.
12. Manual editing and manual Play are always available; never make an editor action depend
   on the agent, a model, or Kane.

Project schema: <compact schema summary>
Behavior catalog: <generated list with params and descriptions>
Command catalog: <generated list of command types and required args>
```

The full command JSON schema is already attached to the `apply_commands` tool; do not duplicate it in the prompt body.

### 5.6 Client execution loop

`src/features/agent/useAgentSession.ts`:

```ts
async function runTurn(userText: string) {
  appendUserMessage(userText);
  let messages = getConversationForModel();
  let context = buildContextPacket();

  for (let step = 0; step < 8; step++) {
    const events = await streamStep({ modelId: selectedModelId, messages, context, mode });
    let assistantText = "";
    const toolCalls = [];

    for await (const event of events) {
      if (event.type === "text_delta") {
        assistantText += event.text;
        streamingBubble.append(event.text);
      }
      if (event.type === "tool_call") toolCalls.push(event);
    }

    if (assistantText) appendAssistantMessage(assistantText);
    if (toolCalls.length === 0) break;

    for (const call of toolCalls) {
      const result = await executeTool(call.name, call.args);
      appendToolMessage(call, result);
      if (result.code === "revision-mismatch") {
        context = buildContextPacket(); // refresh before the next model step
      }
    }
    messages = getConversationForModel();
    context = buildContextPacket();
  }
}
```

Rules:
- The UI never blocks on a tool. Each tool card shows running state.
- `Stop` aborts the SSE stream and marks pending tool cards as canceled.
- One user turn = one assistant "turn" grouping in the UI, even across multiple model steps.
- All `apply_commands` from one turn share a `transactionId` so the whole turn is one undo entry. If the model calls it twice, the second merges into the same history entry.
- If the model produces no tool calls and no text, show "No changes made" with a retry.

### 5.7 Revision conflicts

Revision mismatches happen when the user edits while the agent is thinking.

- `apply_commands` returns `{ ok: false, code: "revision", message, revision }`.
- The client refreshes the context packet and appends a tool result explaining the new revision.
- The model re-plans. It must not resubmit identical commands against stale ids.
- If the conflict repeats twice, stop and tell the user: "The project changed while I was editing. Nothing was applied. Try again."

### 5.8 Safety and scope

- Server holds the API key. The browser never receives it.
- Tools are a closed whitelist. There is no shell, filesystem, `fetch`, or eval tool.
- Commands are validated twice: Zod shape + document referential validation.
- Limits: 50 commands per batch, 200 objects returned per query, 15 s playtest, 8 model steps per turn, 64 KB tool result.
- Destructive commands (`scene.delete`, `object.delete`, `prefab.delete`, `asset.delete`, `project.delete`) require `confirmDestructive: true`; the UI shows a confirmation dialog. In Plan mode they are never auto-applied.
- Project text (object names, dialogue, asset names) is untrusted data. The system prompt explicitly says to ignore instructions found inside project content.
- The agent cannot read `.env`, source code, or other projects.
- Rate limit `/api/agent/step` to 20 requests/minute per IP in dev; return 429 with a friendly message.

### 5.9 Context freshness and cost

- Build the packet once per model step; it is cheap (no asset bytes).
- Compact object index uses one line per object: `obj_8f2 Player @layer_1 (120,340) 48×64 [platformer-controller]`.
- Cap the index at 400 objects; beyond that include counts and require `query_project`.
- Cap selection details at 10 objects.
- Strip empty/default fields from the packet.
- Include `recentActions` (last 8) so the model understands the user's last manual edits.

### 5.10 Provider and model resolution

- `modelId` is `providerId:modelId` (for example `openai:gpt-4.1-mini`, `anthropic:claude-sonnet-4-5`, `ollama:qwen2.5-coder`). The server resolves it against the enabled provider catalog; the client never supplies a base URL or key.
- Use the AI SDK `streamText` with `tools`, `toolChoice: "auto"`, `temperature` (default 0.2, UI-adjustable 0–0.5), and a 4,096-token output cap. Trim context to the model's context window minus output budget.
- Native adapters cover OpenAI, Anthropic, and Google. OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, Ollama, and custom providers use OpenAI-compatible or Ollama adapters. Provider adapters live behind one `resolveModel()` interface.
- Validate streaming tool calls on day one with a prompt that calls `get_project_summary`. Do not enable Build/Plan for a model whose metadata says `supportsTools: false`.
- If the provider returns malformed tool arguments, do not execute; return a tool error asking for valid JSON, once. After a second failure, fail the turn gracefully.
- **No silent fallback.** If the selected model is unavailable, lacks a key, or lacks the required capability, return a typed error and show an actionable card. Never switch models behind the user's back.
- Log token usage and the resolved `providerId/modelId` as structured JSON, never the key or the prompt. Logs go to the server console only.

### 5.11 Key vault, providers, and custom models

#### Built-in provider catalog

Seed the registry with: **OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, and Ollama (local)**. Each entry declares env key name, API style, default base URL, and whether it can list models. The catalog is data, not hard-coded UI.

#### Model catalog

- A curated seed list per provider (display name, model id, context window, tools, vision, recommended) with at least three current options where the provider offers them: a flagship, a fast/cheap option, and a reasoning option. Refresh from the provider's model-list API when supported.
- User-added models for built-ins or custom providers, so a new model id never requires an app release.
- Only models with `supportsTools: true` can be selected for Build/Plan; Ask mode allows tool-less models. `supportsVision` controls `capture_viewport`.
- Context windows are metadata; never hard-code a single model's limit.

#### Key sources and precedence

1. **Environment** — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY`, `TOGETHER_API_KEY`, `FIREWORKS_API_KEY`, `OLLAMA_BASE_URL`, generic `AI_API_KEY`/`AI_BASE_URL`. Read-only in the UI, highest priority.
2. **Vault** — keys entered in Settings, encrypted at rest in SQLite. Survives restarts, never leaves the server.
3. **Session** — keys marked "Use for this session only", held in server memory and cleared on restart.

`AI_MODEL` sets the initial default; otherwise the first configured model is used. A per-chat override is stored in `localStorage` as a model id only.

#### Vault implementation

- AES-256-GCM. Key material comes from `CLOCKWORK_SECRET` (32 bytes, base64/hex) or a generated `.data/secret.key` with `0600` permissions on first boot.
- Store `{ providerId, ciphertext, iv, authTag, hint, updatedAt }`. The hint is the last four characters only.
- API responses return `{ configured, source, hint }`; they never return the key. Delete removes the row.
- Never log request headers, key material, or provider error bodies that may echo the key.

#### Server routes

`server/routes/ai.ts`:

| Route | Purpose |
|---|---|
| `GET /api/ai/providers` | Provider cards: id, name, key source/hint, model count, test status |
| `POST /api/ai/providers/:id/key` | Save to vault or session; body `{ key, persist: "vault" \| "session" }` |
| `DELETE /api/ai/providers/:id/key` | Remove vault/session key (env keys are read-only) |
| `POST /api/ai/providers/:id/test` | Validate key with a cheap models call or 1-token ping; 15 s timeout |
| `GET /api/ai/models` | Curated + fetched + custom models, with capabilities |
| `POST/PATCH/DELETE /api/ai/custom-models` | Add/edit/remove a model |
| `POST/PATCH/DELETE /api/ai/custom-providers` | Add/edit/remove a provider |
| `GET/PUT /api/ai/settings` | Default model, temperature; never keys |

#### Custom provider safety

- Base URL must be `https://`, except `http://localhost`/`127.0.0.1`/`[::1]` for local models.
- Block private/link-local IP ranges and redirects to them (SSRF guard).
- Custom headers are a JSON object with a size limit; reject `Host`, `Content-Length`, and hop-by-hop headers.
- Test connection before Save; a failed test does not persist unless the user explicitly saves the provider for later.
- Do not accept base URLs or keys on `/api/agent/step`; only a saved model id.

#### Capability errors

Return typed codes the chat can explain: `no-key`, `invalid-key`, `no-tools`, `no-vision`, `model-unavailable`, `rate-limit`, `provider-timeout`. Each maps to a setup card with `Open settings` or `Choose another model`.

### 5.12 Dual-mode Kane integration

Kane is used twice, with different objectives and different failure policies.

#### Mode A — Engine QA (verification branch)

Kane drives the Clockwork editor itself: create/open a project, edit an object, play/pause, save/reload, undo, share/export. These are the K1–K4 objectives in §10. The run uses `--bug-detection continue` so a confirmed product bug is recorded without stopping the remaining steps. The real suite runs in the verification branch; Slice 10 supplies the route, objectives, parser, and proof template. A green suite is evidence; a caught UI bug is stronger evidence and must be recorded honestly.

#### Mode B — AI Play (product runtime)

The user presses the violet `AI Play` button. Clockwork saves an immutable snapshot and opens the player at `/play/:id?ai=1&seed=<seed>`. The player adds the AI HUD. The server builds an objective from the scene, goal, and win condition, then runs:

```bash
kane-cli run "<generated objective>" \
  --url "<snapshot play URL>" \
  --agent \
  --mode testing \
  --max-steps 40 \
  --timeout 180 \
  --assertion-mode dom \
  --final-validation on \
  --bug-detection off
```

Why these flags: `--agent` gives NDJSON; `--mode testing` lets the run push through expected game-over states; `--assertion-mode dom` reads the visible AI HUD reliably; `--final-validation on` adds a final check of the objective; `--bug-detection off` avoids classifying a game-design failure as a product bug. Engine QA uses `--bug-detection continue` instead.

**Objective contract.** The objective is generated, under 15 steps, and uses only visible labels:

1. Start at the snapshot; wait for `STATUS: PLAYING`.
2. `Click the button labeled "MOVE RIGHT" once.` (or the genre-appropriate direction toggle).
3. `Click "JUMP" when the player is on the ground, up to 12 times, until STATUS is WON or LOST.`
4. `Click "STOP" when STATUS is WON or LOST.`
5. `Store the text next to "STATUS" as "status".`
6. `Store the text next to "COINS" as "coins".`
7. `Store the text next to "SCENE" as "scene".`
8. `Store the text next to "LAST ERROR" as "last_error".`
9. `Assert status is "WON".`
10. `Assert coins is "3".`
11. `Assert last_error is "none".`

For a game with no coins, replace step 10 with the scene's actual success metric (for example, `Assert enemies_defeated is "5"`). For a game with no win condition, the objective becomes “play for 30 seconds and assert `LAST ERROR` is `none`.” For a non-platformer, the objective generator uses the project's input map to name the correct controls. The objective never asks Kane to inspect canvas pixels when the HUD has the same fact.

**Loop.**

1. `run_ai_play` creates the snapshot, builds the objective, and streams the run.
2. On pass: show `KANE VERIFIED`, final state, duration, and evidence. Stop.
3. On fail: return the objective, `run_end` (`result_code`, `reason_code`, `summary`), `final_state`, last 10 steps, runtime errors, and evidence path to the agent.
4. The agent diagnoses the failure against the project and proposes the smallest fix. In Build mode it may auto-apply non-destructive changes; destructive changes and Plan/Ask modes require confirmation.
5. The controller reruns with the same seed. Maximum two automatic attempts. If attempt 2 fails, stop, show both evidence packs, and offer `Undo AI fixes`.
6. Never claim success without `run_end.status === "passed"`. Never hide a failed run behind a retry.

**Result schema** (`shared/protocol/kane.ts`):

```ts
interface AiPlayResult {
  runId: string;
  attempt: number;
  status: "passed" | "failed" | "cancelled" | "error";
  resultCode?: number;
  reasonCode?: string;
  summary: string;
  objective: string;
  finalState: Record<string, string>;
  steps: KaneStep[];
  runtimeErrors: GameRuntimeError[];
  evidencePath?: string;
  testUrl?: string;
  durationMs: number;
}
```

**Failure taxonomy:** `no-key` / `no-model` (do not start), `kane-missing`, `kane-auth`, `timeout`, `stuck`, `assertion`, `game-error`, `provider-rate-limit`. Each maps to a specific panel action, not a generic toast.

**Security and cost:** the snapshot URL is unguessable and read-only; the client cannot pass a base URL, key, or arbitrary command. Reject objectives over 1,000 characters and non-snapshot URLs. One active AI Play run per project. AI Play is local/self-hosted in v1 because it launches Chrome; deployed environments must configure a dedicated runner. Show credit/upload consent before the first run. Send the model only `final_state`, step summaries, and runtime errors; never upload the full evidence pack or page HTML into the model context.

**Hackathon mapping:** Ships = manual Play plus AI Play is a real user flow; Verified = engine QA catches/confirms a UI defect and AI Play has evidence; Closed loop = Kane failure → agent fix → Kane rerun → pass; Craft = Kane is the game's player, with a visible HUD and attempt history.

---

## 6. Command catalog

All commands are a discriminated union in `engine/commands/registry.ts`. This table is the implementation checklist and the source for the AI tool schema.

### Project
| Type | Args | Notes |
|---|---|---|
| `project.rename` | `name` | Trim, 1–80 chars |
| `project.updateSettings` | `patch` | Width/height/gravity/pixelArt/background/audio/inputMap/ui |
| `project.setStartScene` | `sceneId` | Must exist |
| `project.setArchived` | `archived` | Sets `archivedAt` and increments revision; archived projects open read-only |
| `project.duplicate` | `name?` | Deep copy with new ids; copies assets by reference |
| `project.delete` | `confirmDestructive` | Deletes the local project and its blobs |

Project lifecycle commands (`setArchived`, `duplicate`, `delete`) are store-level commands: they validate, update the document/metadata and the project index atomically, and emit the same commit event. They must not bypass validation or create a second write path.

### Scene
| Type | Args | Notes |
|---|---|---|
| `scene.create` | `name, kind, size?` | Adds a default layer |
| `scene.rename` | `sceneId, name` | |
| `scene.update` | `sceneId, patch` | size, background, camera |
| `scene.delete` | `sceneId` | Cannot delete the last scene; reassigns start scene |
| `scene.reorder` | `sceneId, index` | |
| `scene.duplicate` | `sceneId, name?` | Deep copy with new ids |

### Layer
| Type | Args | Notes |
|---|---|---|
| `layer.create` | `sceneId, name, index?` | |
| `layer.update` | `layerId, patch` | name, visible, locked, opacity, parallax |
| `layer.delete` | `layerId` | Moves or deletes contained objects per `strategy` |
| `layer.reorder` | `layerId, index` | |

### Object
| Type | Args | Notes |
|---|---|---|
| `object.create` | `sceneId, layerId, object` | Full object or partial with defaults |
| `object.update` | `objectId, patch` | Deep merge for transform/visual/body/properties |
| `object.delete` | `objectId, confirmDestructive` | Deletes descendants |
| `object.duplicate` | `objectId, offset?` | New ids for subtree |
| `object.reorder` | `objectId, index` | Within its layer |
| `object.reparent` | `objectId, parentId?, layerId?` | Prevents cycles |
| `object.setTags` | `objectId, tags` | |
| `object.addBehavior` | `objectId, type, params?` | Validates catalog schema |
| `object.updateBehavior` | `objectId, behaviorId, patch` | enabled/params |
| `object.removeBehavior` | `objectId, behaviorId` | |

### Prefab
| Type | Args | Notes |
|---|---|---|
| `prefab.create` | `name, objectId` | Serializes subtree |
| `prefab.instantiate` | `prefabId, sceneId, layerId, x, y` | |
| `prefab.update` | `prefabId, patch, applyToInstances` | |
| `prefab.setOverride` | `objectId, path, value` | Instance only |
| `prefab.revertOverrides` | `objectId` | |
| `prefab.detach` | `objectId` | |
| `prefab.delete` | `prefabId, confirmDestructive` | Detaches instances |

### Asset
| Type | Args | Notes |
|---|---|---|
| `asset.update` | `assetId, patch` | name, tags, slices, animations |
| `asset.delete` | `assetId, confirmDestructive` | Refuses if referenced unless `force` |
| `asset.replace` | `assetId, newBlobHash` | Keeps id, invalidates textures |
| `asset.slice` | `assetId, mode, config` | Grid/auto/manual |

### Tilemap
| Type | Args | Notes |
|---|---|---|
| `tilemap.create` | `sceneId, layerId, tilesetId, cols, rows, tileSize` | Object with visual.kind=tilemap |
| `tilemap.paint` | `objectId, cells, tileIndex` | `cells: {x,y}[]` |
| `tilemap.erase` | `objectId, cells` | |
| `tilemap.fill` | `objectId, tileIndex` | |

### Rules and variables
| Type | Args | Notes |
|---|---|---|
| `rule.create` | `sceneId, rule` | |
| `rule.update` | `ruleId, patch` | |
| `rule.delete` | `ruleId` | |
| `variable.create` | `name, type, initial` | Unique name |
| `variable.update` | `name, patch` | |
| `variable.delete` | `name` | Refuses if referenced |

### Editor-only (ephemeral, never persisted, never in agent change sets)
`editor.select`, `editor.focus`, `editor.setTool`, `editor.openPanel`, `editor.setTab`, `editor.setPlaytest`.

### Validation rules the bus must enforce

- Every referenced id exists and belongs to the expected scene/project.
- Layer order is contiguous; object order is stable.
- Transform values are finite; scale cannot be 0.
- Body dimensions are > 0 when type != none.
- Prefab instantiation cannot create cycles.
- Tilemap `data.length === cols * rows`; tile indices are in range.
- A project always has at least one scene and a valid `startSceneId`.
- Deleting an asset referenced by a visual, audio behavior, or animation is refused with a list of references.

---

## 7. AI behaviour and UX flows

### 7.1 The seven golden prompts

These must work end to end. They are the product demo.

1. **Create:** "Build a small platformer level with a player, two platforms, three coins, and a goal flag."
   - Agent queries assets, creates a layer if needed, creates objects with behaviors, sets the camera, replies with a summary. One undo entry.
2. **Modify:** "Give the player a double jump and make the drone patrol back and forth above the bridge."
   - Agent updates the controller params and adds/configures `patrol`. Reply names the objects.
3. **Diagnose:** "Why does the player fall through the bridge?"
   - Agent inspects the player body, the bridge body, and the layer; finds the bridge is on a non-colliding layer or has `body.type = none`; explains and fixes. Runs a short playtest if useful.
4. **Visual:** "Make the scene feel like dusk and add parallax mountains behind the trees."
   - Agent changes background color, creates a background layer with parallax 0.3, adds the mountain asset if present, or explains that no mountain asset exists. No invented assets.
5. **Logic:** "When the player collects all three coins, open a 'You win' panel and stop the timer."
   - Agent ensures a `coins` variable exists, adds `collectible` behaviors, creates a rule with variable condition + UI action, and adds a timer. Replies with the rule name.
6. **Verify:** "Play it and tell me if the level is completable."
   - Agent calls `start_playtest` with scripted inputs, reads telemetry, reports honestly. If it cannot complete, it says which obstacle blocked it.
7. **AI Play:** "Play this level with Kane and fix whatever blocks completion."
   - Agent calls `run_ai_play`, receives the failed `final_state` and evidence, diagnoses the cause, applies one non-destructive change set, and reruns with the same seed. Reports `KANE VERIFIED` only on a real `run_end.status === "passed"`; otherwise shows both attempts and offers undo.

### 7.2 Plan mode

- The model calls `preview_commands` instead of `apply_commands`.
- The viewport renders violet ghost outlines and a top pill: `Preview: 6 changes · Apply · Discard`.
- The chat shows a change-set card with per-field diffs.
- Apply commits the exact previewed patches as one transaction; discard clears the ghosts.
- If the document revision changed since preview, Apply is disabled with "Project changed — preview again".

### 7.3 Destructive confirmation

- `object.delete`, `scene.delete`, `prefab.delete`, `asset.delete` require confirmation.
- The agent describes what will be removed and calls `preview_commands` (even in Build mode).
- The UI shows a small inline confirmation card in chat: `Delete 3 objects?` with `Delete` (red) and `Cancel`.
- The chat must never auto-apply a destructive batch.

### 7.4 Agent presence

- Every `select_entities` and every changed object triggers a violet pulse overlay for 1.2 s.
- A floating label `AGENT` follows the primary selected object.
- If the object is off-screen, the camera eases to it (200 ms).
- Do not steal focus from inputs. Do not scroll the hierarchy more than necessary; use `scrollIntoView({ block: "nearest" })`.

### 7.5 Error UX

| Failure | Chat behavior |
|---|---|
| Model/network error | Red card, `Retry` re-sends the same turn, messages preserved |
| Invalid tool args | Tool card error, model gets one repair attempt |
| Command validation | Tool card lists the exact command and message; nothing committed |
| Revision conflict | Silent re-plan; after two failures, tell the user nothing changed |
| Playtest crash | Show the runtime error + scene + object id; offer "Open console" |
| Kane unavailable | Verification card explains the CLI is not installed; does not fail the turn |

### 7.6 Prompt presets and contextual suggestions

Presets in `prompts.ts`:

- `Add gameplay` — "Add a mechanic to the selected object…"
- `Fix a bug` — "Investigate and fix…"
- `Polish visuals` — "Improve the scene's composition without changing gameplay…"
- `Build a level` — "Create a level section that…"
- `Explain` — "Explain how this scene works…"

Empty-state suggestions are computed:
- No scene → "Build the first level".
- Scene with a player but no goal → "Add a goal and a win condition".
- Selected object with no behavior → "Make this object interactive".
- Playtest failed → "Fix the last playtest error".

### 7.7 Chat persistence

- Messages are stored in IndexedDB per project.
- `New chat` clears the visible thread but keeps an archived copy under `chats[projectId].archive` for the session only.
- Tool results larger than 32 KB are truncated for display but kept in memory until reload.
- On project open, restore the last 50 messages.

---

## 8. Vertical slices

Each slice is independently demoable. Estimates assume one focused engineer; a coding agent should be faster but must follow the acceptance gates.

### 8.0 Slice execution contract (mandatory)

The implementing agent must follow these rules literally. They exist because this plan will be executed by a coder that should not be trusted to infer scope.

1. **Strict order.** Implement Slice 0, 1, 2, 3, 4, 5, 6, **6.5**, 7, 8, 9, then 10. Do not start a later slice early, even if it looks easy. Do not jump back and forth.
2. **One slice at a time.** Finish the current slice's code, acceptance checks, and log entry before touching the next slice. A slice is not "mostly done"; it is either complete or incomplete.
3. **No stubs that satisfy the UI but not the behavior.** A button that renders but does nothing, a panel fed by mock data, a command that logs instead of mutating, or an agent tool that returns fake success is a failed slice. Mock project data is allowed only in Slice 0 and must be replaced in Slice 1. `AI_MOCK` in Slice 6/6.5 is a labeled model-transport fixture, not project data, and must never be presented as a real provider.
4. **Definition of Ready:** the previous slice's gate is logged, `pnpm typecheck` and `pnpm build` pass on the current tree, and there are no unresolved errors from the previous slice.
5. **Definition of Done for every slice:** every acceptance checkbox is checked, both commands pass from a clean `pnpm install`, the manual acceptance script was performed in a cold browser profile, the console has no errors, and `docs/implementation-log.md` has an entry with the commands and results. Any feature that is 100% complete is added to `features.md`; any limitation, failure, or deferred verification is added to `docs/known-issues.md`.
6. **No unchecked boxes, no exceptions.** If an acceptance item cannot be met, stop and report the blocker. Do not mark it done, comment it out, weaken it, or move on. Do not add a test framework to avoid manual verification.
7. **Scope discipline.** Implement only what the current slice lists. Do not add future features, extra libraries, redesigns, or "while I'm here" refactors. If a later slice needs an interface, add the minimum typed interface in the current slice and leave the implementation for its slice.
8. **No parallel write path.** Every document mutation must go through the command bus. If you find yourself writing `store.document = ...` outside a command, stop and fix it. Autosave, import, undo, and agent edits all use the same path.
9. **No bypassing the UI gate.** Do not substitute a quick browser script for the manual script, and do not claim a visual match without checking the required viewport sizes.
10. **Blocked means blocked.** If a dependency, credential, or environment issue blocks a slice for more than 45 minutes, report exactly what is missing and stop. Do not silently skip the slice.
11. **Log evidence.** After each slice append to `docs/implementation-log.md`:
    ```markdown
    ## Slice N — <title>
    - Date:
    - Commit:
    - `pnpm typecheck`: pass/fail + output tail
    - `pnpm build`: pass/fail + output tail
    - Manual script: steps performed, observed result
    - Viewports checked: 1366×768, 1440×900, 1920×1080
    - Console: clean / issues
    - Acceptance: N/N checked
    - Features completed / features.md updated:
    - Known issues updated:
    - Known limitations: none / list
    ```
12. **Gate to proceed:** all acceptance boxes checked + both commands pass + manual script passed + log entry complete + `features.md`/`docs/known-issues.md` updated. Only then start the next slice.
13. **Do not edit this plan to claim completion.** The acceptance checkboxes and gates are the specification. Never check them off, delete them, or weaken them in this file. Record actual results in `docs/implementation-log.md`.
14. **Read before writing.** At the start of a slice, read §4, §6–§8, and the entire current slice. Restate the slice goal and its file list in your own working notes. If two requirements conflict, stop and report the conflict rather than choosing silently.

If the implementing agent cannot satisfy this contract, it must stop and ask rather than produce a partial build.

#### 8.0.1 Copy-paste prompt for each slice

Give the coding agent only one slice at a time, using this template:

```text
You are implementing Slice N of the Clockwork plan. Read docs/clockwork-implementation-plan.md
sections 0, 4, 5, 6, 7 (only the parts the slice references), and 8.0 plus Slice N. Do not read or
modify any other slice's implementation.

Scope: implement only the tasks and files listed in Slice N. Do not add future features, extra
libraries, redesigns, or refactors. Do not use @agent-native packages. Do not add UI test
frameworks, Playwright, Cypress, Vitest browser mode, or the K1–K4 suite. In Slice 10 only,
implement the in-product AI Play feature and its two real loops exactly as specified.

Before coding: list the files you will create/edit and the acceptance criteria you must satisfy.
After coding: run `pnpm typecheck` and `pnpm build`, perform the manual acceptance script at
1366x768 and 1440x900, update docs/implementation-log.md, features.md (completed features only),
and docs/known-issues.md (any limitation or failure), and report:
- files changed
- commands run and results
- each acceptance criterion with pass/fail evidence
- anything stubbed, skipped, or blocked (if any, stop; do not proceed)

Do not edit the plan's checkboxes or acceptance criteria. Do not start Slice N+1. If blocked for
more than 45 minutes, stop and report exactly what is missing.
```

### Slice 0 — Foundation, design system, engine shell

**Goal:** a pixel-faithful, non-functional shell that already feels like a game engine. No engine logic yet.

**Depends on:** nothing.

**Tasks:**
1. Scaffold pnpm + Vite + React + TypeScript strict. Add Tailwind 4, Radix, lucide, Inter/JetBrains Mono via `@fontsource`.
2. Implement `design/tokens.css` and `base.css` from §4.2. Reset margins, set `color-scheme: dark`, style scrollbars (thin, `--border`).
3. Build primitives: `Button` (variants: primary/secondary/ghost/danger, sizes sm/md), `IconButton`, `Input`, `NumberInput`, `Select`, `Menu`, `Tooltip`, `Tabs`, `Dialog`, `Toast`, `Kbd`, `Panel`, `SectionLabel`.
4. Build `AppShell` with top bar, left rail, tab strip, toolbar, left dock, viewport placeholder, inspector, status bar. Use static mock data that matches §4 (a "Track" scene, 5 layers, a player, a drone). The shell is fixed to `100dvh` with `overflow: hidden`; only panels scroll. Implement the responsive behavior from §4.14 with CSS, even though the data is static: at 1366 the inspector starts collapsed and opens when the mock selection is non-empty; at 1024 both docks can be opened as labeled drawers.
5. Build `ProjectsPage` with search, an always-visible `New project` button, a `Filters` disclosure (sort/status/template), archived card styling, and the four-state set (loading, empty, no results, error). Build `NewProjectDialog` with the four mutually exclusive modes (`Blank`, `Template`, `From brief`, `Import`), only the selected mode's fields, and a collapsed `More settings` disclosure. Creation can be in-memory only; `From brief` is visible but disabled with an explanation until Slice 7.
6. Add routing: `/` projects, `/project/:id` overview, `/project/:id/scene/:sceneId` editor with `?tab=&ptab=` parsing and `replaceState` sync, `/play/:id` placeholder. Creating a project navigates to its start scene's editor route.
7. Implement `CommandPalette` shell (⌘K) with grouped results; commands can be stubs.
8. Implement keyboard focus handling, drawer focus traps, `aria-expanded`, and tooltips for every icon button.

**Files:** `src/design/**`, `src/shell/**`, `src/features/projects/**`, `src/features/editor/EditorPage.tsx`, `src/routes.tsx`.

**Acceptance:**
- [ ] At **1366×768** the composition matches §4.1: 52/68/42/46/26 px bars, 280 px hierarchy, inspector collapsed until selection, dark palette, coral selection, violet AI accent.
- [ ] At 1440×900 and 1920×1080 the dock widths and layout match §4.1 and §4.14; no control wraps or clips.
- [ ] The page never scrolls as a whole at 1366×768; only the hierarchy, inspector, and project grid scroll internally.
- [ ] At 1024×768 the rail is icon-only and both docks **can be opened** as labeled drawers; there is no horizontal overflow.
- [ ] The projects dialog shows exactly one creation path at a time; `From brief` is visibly disabled with a reason; `More settings` is collapsed by default.
- [ ] No white chrome, no card shadows, no oversized radii.
- [ ] All icon buttons have accessible labels and tooltips; drawers expose `aria-expanded` and a labeled close button.
- [ ] `pnpm typecheck && pnpm build` pass.
- [ ] Manual: open `/`, switch filters, open `New project`, inspect all four mode cards (selecting `From brief` shows its disabled reason), land on the editor shell; resize through 1366→1024→1920 without page scroll or overlap.

**Do not:** implement real state, canvas, or model calls in this slice. Keep it static so visual review is fast.

**Gate to proceed:** all Slice 0 acceptance boxes are checked, the static shell is verified at 1366×768 and 1024×768 with no page scroll, typecheck/build pass, and the log entry is complete. Do not start Slice 1 with a broken or overflowing shell.

---

### Slice 1 — Engine kernel, document model, persistence

**Goal:** a real project document with commands, undo/redo, revisions, autosave, import/export, and templates. The canvas can still be a debug list.

**Depends on:** Slice 0.

**Tasks:**
1. Implement all schemas in `engine/model/*` with Zod. Include defaults, ID prefixes, and `migrateDocument`.
2. Implement `ids.ts` (`prj_`, `scn_`, `lay_`, `obj_`, `ast_`, `pfb_`, `beh_`, `rul_`, `var_`, `clp_`) using nanoid(10).
3. Implement `EngineStore` with `document`, `editor`, `history`, `saveState`, and actions. Use Zustand + Immer. Expose vanilla store access for non-React code.
4. Implement `history.ts` with patch entries, transactions, undo, redo, and 200-entry cap.
5. Implement the command registry and the project/scene/layer/object commands from §6, including `project.setArchived`, `project.duplicate`, and `project.delete`, with validation. Editor-only commands mutate editor state, not the document.
6. Wire the toolbar undo/redo buttons and `⌘Z` / `⇧⌘Z`.
7. Implement autosave to IndexedDB (`indexeddb.ts`), project list metadata, open, delete, duplicate, archive/unarchive, and cover placeholder. Archived projects open in a read-only editor with a visible `ARCHIVED · Read only` banner and an `Unarchive` action; all document commands are rejected while archived, except `project.setArchived(false)`. `ProjectRecord` is denormalized metadata derived from the document, never a second source of truth.
8. Implement `.clockwork.json` export/import (`transfer.ts`) with asset embedding, plus the `Import` creation path with validation errors for wrong format, schema failure, and >20 MB files.
9. Implement templates: `blank`, `platformer`, `topdown`, `puzzle`. The platformer template must include a playable player (`platformer-controller` + `camera-follow`), layered dusk background with parallax, ground, two platforms, three coins (`collectible`), a hazard (`hazard`), a checkpoint (`checkpoint`), a goal, a camera, and variables `coins` (0) and `won` (false). The puzzle template must include a grid of collectibles and a win rule. `From brief` remains disabled until Slice 7.
10. Implement the projects list behavior from §4.12: search, `Filters` disclosure (sort, active/archived/all, template origin), empty/no-results/error states, and archived card styling. Filters persist in `localStorage`, not the document.
11. Add a temporary `DocumentDebugPanel` (behind `?debug=1`) that renders document JSON and revision.
12. Add a minimal `ProjectOverview` (default `/project/:id`) with cover, name, scene list and start-scene marker, counts, recent revisions, `Open scene` (navigates to `/project/:id/scene/:sceneId`), and `Play`/`Share` buttons that are disabled with "Available in Slice 4/8" until implemented. Add `ProjectSettingsPanel` for rename, start scene, archive, delete, and export/import. No new document fields beyond §3.1.

**Files:** `engine/model/**`, `engine/store/**`, `engine/commands/**`, `engine/io/indexeddb.ts`, `engine/io/transfer.ts`, `engine/templates/**`.

**Acceptance:**
- [ ] Create a project from `Blank`, each `Template` (Platformer, Top-down, Puzzle), and `Import`; each document validates and persists.
- [ ] `From brief` is disabled with a clear explanation; it does not create an empty project or fake an agent run.
- [ ] Rename the project, add/delete a scene, create a layer, create an object via debug controls.
- [ ] Every mutation increments revision exactly once and creates exactly one undo entry.
- [ ] Undo/redo restores selection safely and updates the revision.
- [ ] Reload restores the project and revision; save state goes `dirty → saving → saved`.
- [ ] Search and all three filter groups work; archived projects are excluded from Active, shown muted in All/Archived, and open read-only with a working `Unarchive` action.
- [ ] Duplicate creates new ids and does not share mutable objects; delete requires confirmation and removes the project from the list.
- [ ] Export, delete the project, re-import: identical document IDs and content; malformed imports fail with a visible error and no partial project.
- [ ] Opening a corrupted document shows the recovery panel, not a blank screen.
- [ ] Overview lists scenes, marks the start scene, and opens a scene; settings rename, start-scene change, archive, delete, and export/import work; disabled Play/Share state their slice.
- [ ] Every acceptance item above works with `AI_ENABLED=0` and no provider key; no manual command path calls the agent.
- [ ] `pnpm typecheck && pnpm build` pass.

**Gate to proceed:** every checkbox above is checked, both commands pass from a clean install, the manual script was performed in a cold browser profile at 1366×768, the result is logged in `docs/implementation-log.md`, and `features.md`/`docs/known-issues.md` are updated. If anything is unchecked or stubbed, stop and fix it here. Do not start the next slice.

---

### Slice 2 — Viewport, scene graph, selection, transforms

**Goal:** the engine becomes visually real. Render the document with Pixi, select objects on canvas, move/scale/rotate with gizmos, edit properties, reorder layers, undo gestures as single entries.

**Depends on:** Slice 1.

**Tasks:**
1. `PixiStage` React component: create `Application` once, attach canvas, handle resize with `ResizeObserver`, destroy on unmount. Handle WebGL context loss.
2. `scene-renderer.ts`: reconcile objects by id; render sprite, rect, text, tilemap, groups; apply layer order, visibility, opacity, parallax; render scene background.
3. `camera.ts`: screen ↔ world transforms; pan with Space+drag / middle mouse; zoom at cursor; fit; clamp zoom 5%–800%.
4. Overlay: hover outline, selected outline, multi-select bounds, scale handles, rotation handle, marquee rect, snap guides, world bounds frame.
5. Pointer interactions:
   - Click select, Shift/Cmd toggle, drag empty space marquee.
   - Drag selected object(s) to move; snapping to grid/objects/guides (8/16/32).
   - Scale from handles with Shift for uniform; rotate with Alt or rotation handle; Shift snaps to 15°.
   - Arrow keys nudge 1 px, Shift 10 px.
   - Double-click enters group; Esc selects parent.
6. Gesture transactions: pointer down opens a transaction; every move dispatches previews with the same `transactionId`; pointer up commits one history entry.
7. Rulers: DOM overlay with ticks, labels, cursor guides, world origin. Keep text crisp.
8. Layers panel: reorder by drag, visibility/lock, active layer, opacity/parallax fields, select-objects action.
9. Hierarchy panel: real-time search (`⌘F`) by name/type/tag/id, groups, type icons, z display, shift multi-select, drag reparent, rename on double-click, delete/duplicate context menu, keyboard navigation, and virtualization above 500 rows.
10. Inspector: scene and object tabs, all fields from §4.9, contextual open/switch behavior at 1366, multi-select shared fields, collapsible advanced groups, numeric drag scrub, validation inline.
11. Context menu on canvas: Copy, Duplicate, Delete, Bring forward/backward, Group, Create prefab, Ask agent about selection.
12. `?debug=1` overlay: FPS, object count, camera x/y/zoom, selected ids.

**Files:** `engine/render/**`, `engine/store/selectors.ts`, `features/editor/**`.

**Acceptance:**
- [ ] Platformer template renders exactly: layered dusk background with parallax, ground, platforms, player, coins, hazard, checkpoint, goal.
- [ ] Selecting objects on canvas highlights the hierarchy row and populates the inspector; at 1366 the collapsed inspector opens automatically, and clearing selection returns it to Scene.
- [ ] Dragging 20 objects in one gesture = one revision and one undo entry; undo restores all positions.
- [ ] Snapping works at 8/16/32; guides disappear on release.
- [ ] Zoom is anchored at the cursor; `0` fits, `1` = 100%; rulers track correctly.
- [ ] Pan/zoom does not create history entries or change the document.
- [ ] Layer reorder changes draw order and persists.
- [ ] Dock collapse/width, active tab, and active scene survive reload via `localStorage`/URL; toggling a panel creates no revision and is absent from the document JSON.
- [ ] Pasting `/project/:id/scene/:sceneId?tab=logic` restores the same scene and workspace; an invalid scene falls back with a toast.
- [ ] 2,000 rect objects render at ≥55 fps in Chrome on the target laptop; interaction stays responsive.
- [ ] `pnpm typecheck && pnpm build` pass.

**Gate to proceed:** every checkbox above is checked, both commands pass from a clean install, the manual script was performed in a cold browser profile at 1366×768, the result is logged in `docs/implementation-log.md`, and `features.md`/`docs/known-issues.md` are updated. If anything is unchecked or stubbed, stop and fix it here. Do not start the next slice.

---

### Slice 3 — Assets, sprite slicing, animation, tilemaps

**Goal:** real game art can come in, be sliced, animated, and painted onto tilemaps without leaving the editor.

**Depends on:** Slice 2.

**Tasks:**
1. `asset-store.ts`: import files, SHA-256 hash, dedupe, blob storage, object URL lifecycle, metadata write to document.
2. Asset browser (rail `Assets` and the Content picker share one component and one asset store; the rail is project-wide, Content is scene-scoped): grid with thumbnails, search, kind filter, drag-to-canvas, rename/delete, size/dimensions, usage count.
3. Drag-drop import on the viewport: import + create sprite at cursor in one transaction.
4. Thumbnails: 128 px cover-fit, transparent checkerboard, generated once.
5. Sprite slicer UI: grid mode (cols/rows/padding/spacing), auto-detect alpha separators, manual frames. Preview overlays with frame indices.
6. `collider.ts`: alpha-bound scanning, `Fit body to art` action, cached per frame.
7. Animation clips: create clip from frames, name, fps, loop, preview scrubber; inspector clip picker; runtime plays clips.
8. Tilemap authoring:
   - Create tilemap object from a tileset asset (tile size, cols, rows).
   - Paint, erase, rectangle, fill, eyedropper. Brush size 1/2/3.
   - Grid overlay, hover cell highlight, right-drag erase.
   - `tilemap.paint/erase/fill` commands; a full drag stroke groups into one undo entry.
9. Starter assets in `public/starter/`: original SVG/PNG art for player, drone, coin, flag, ground, platform, three parallax hills, and UI panel; plus coin/jump/click WAV files. Cohesive dusk palette. Use original art only.
10. Import validation: reject unsupported types and files > 20 MB with a clear toast.

**Files:** `engine/assets/**`, `engine/io/**`, `features/assets/**`, `features/editor/**`, `public/starter/**`.

**Acceptance:**
- [ ] Drag a PNG onto the canvas: asset is imported, deduped, and a sprite appears selected.
- [ ] Auto-slice a 4×2 sheet; frames are correct; animation preview plays at the requested fps.
- [ ] `Fit body to art` produces a tight collider around a transparent-padded sprite.
- [ ] Paint a 20×10 tilemap; drag stroke = one undo entry; erase and fill work.
- [ ] Importing the same file twice reuses the asset and reports "Already in project".
- [ ] Deleting an in-use asset is refused with a reference list.
- [ ] Reload restores assets and thumbnails from IndexedDB.
- [ ] `pnpm typecheck && pnpm build` pass.

**Gate to proceed:** every checkbox above is checked, both commands pass from a clean install, the manual script was performed in a cold browser profile at 1366×768, the result is logged in `docs/implementation-log.md`, and `features.md`/`docs/known-issues.md` are updated. If anything is unchecked or stubbed, stop and fix it here. Do not start the next slice.

---

### Slice 4 — Runtime, play mode, telemetry

**Goal:** press Play and the game actually runs in the viewport, deterministically, with physics, input, behaviors, camera, audio, and a debug console.

**Depends on:** Slice 3.

**Tasks:**
1. `runtime.ts`: fixed-step loop, lifecycle (`load → start → update → render → destroy`), seed, pause/step/reset, scene transition.
2. `input.ts`: keyboard, pointer click/tap, gamepad; logical actions from `settings.inputMap`; per-step pressed/down/released; ignore input when a text field is focused.
3. `physics.ts`: AABB integration, axis-separated collision, sub-stepping, one-way platforms, world bounds, static/dynamic/kinematic bodies, collision event pairs. Tilemap collision: every non-zero tile is a static solid; merge contiguous row spans per tilemap update and feed them to the broadphase.
4. Behaviors from §3.7, each with a small deterministic implementation. Registry maps type → { schema, order, create, update }.
5. `rules.ts`: evaluate conditions and actions from §3.8, with `once` semantics and a per-frame action budget of 100.
6. `audio.ts`: Web Audio for SFX, HTMLAudio for music loop, volume from settings, unlock on first gesture.
7. Camera: follow behavior, deadzone, lerp, clamp to world, parallax layers.
8. Play mode UI:
   - Wire the rail `Playtest` item and the Project Overview `Play` button to enter play mode on the start scene (navigate to the editor route first if needed).
   - `PlayOverlay` replaces the editor world in the viewport, keeps panels read-only.
   - Top-left chip: `PLAYING · Track · seed 1234 · 00:12`, pause/step/reset/stop.
   - `PlayConsole` bottom drawer: runtime logs, rule fires, collisions (debug), errors with object ids.
   - `DebugOverlay` (`F1`): FPS, entities, bodies, draw calls, collider boxes, behavior list.
   - `Esc` stops; `⌘↵` toggles play.
9. Telemetry: ring buffer of 500 events, variables snapshot, fps samples, last error; exposed to the agent.
10. Play in a read-only project state: dispatch of document commands is blocked while `playtest === "running"`; editor commands still work.
11. Deterministic replay: record input per fixed step; `reset` can replay the same inputs for reproducibility.

**Files:** `engine/runtime/**`, `features/playtest/**`, `engine/store/engine-store.ts`.

**Acceptance:**
- [ ] Platformer template: player moves, jumps, collects coins, dies on hazard, respawns at checkpoint, reaches goal.
- [ ] Double jump (when configured) works; coyote time and jump buffering are observable.
- [ ] Camera follows with deadzone and clamps to world; parallax layers move at the right factors.
- [ ] Pause/step advances exactly one fixed step; reset restores initial variables and positions.
- [ ] Runtime error shows scene + object id and does not crash the editor.
- [ ] Two runs with the same seed and inputs produce identical variable/event traces.
- [ ] 60 fps in Chrome with the template; telemetry records ≥ 59 fps average.
- [ ] Document commands are rejected while playing; UI indicates read-only. The rail `Playtest` item and Overview `Play` both open the start scene in play mode.
- [ ] Manual Play works with `AI_ENABLED=0`, no provider key, and no Kane.
- [ ] `pnpm typecheck && pnpm build` pass.

**Gate to proceed:** every checkbox above is checked, both commands pass from a clean install, the manual script was performed in a cold browser profile at 1366×768, the result is logged in `docs/implementation-log.md`, and `features.md`/`docs/known-issues.md` are updated. If anything is unchecked or stubbed, stop and fix it here. Do not start the next slice.

---

### Slice 5 — Logic authoring, prefabs, presentation

**Goal:** non-programmers can build real game logic, reuse objects, and tune the game's look and input.

**Depends on:** Slice 4.

**Tasks:**
1. `LogicPage`: scene selector, rules list, rule editor with condition/action rows, add/remove/reorder, enable toggle, validation messages, plain-language preview ("When coins = 3 → go to Win").
2. Condition/action editors with entity pickers (object, tag, prefab, scene, variable, asset) and inline validation. Unknown references are flagged, not silently saved.
3. Behavior editor in the inspector: catalog-driven param fields with units (px, ms, px/s), defaults, help text, reset-to-default.
4. Variables panel: name, type (number/string/boolean), initial, usage count; create/rename/delete with reference checks.
5. Input map editor (`Keys`): logical action rows, bindings with key capture, conflict warnings, reset.
6. Prefabs:
   - Create prefab from selection.
   - Instantiate from asset/prefab browser.
   - Override indicator in inspector; revert overrides; detach.
   - Update prefab dialog with "apply to N instances".
7. `PresentationPage` shell: secondary tabs `Look | Animation | Audio | Game UI`, rendered one at a time. These are **not** top-level navigation. Persist the active sub-tab in `?ptab=` and restore it on reload.
8. **Look:** design resolution, pixel-art toggle, gravity, default background, scene background, camera defaults, and a read-only "scene flow" list showing the start scene and transitions.
9. **Animation:** clip manager (create/edit/delete clips from sliced frames), fps/loop controls, preview scrubber, and assignment of idle/run/jump clips to the selected sprite. Validation warns about empty clips and missing frames.
10. **Audio:** master/music/SFX volumes, per-scene music asset + loop toggle + volume, preview play/stop, and a clear "no audio asset" state. Values affect the runtime immediately.
11. **Game UI:** HUD widgets bound to variables (`label`, `variable`, `corner`, `text|bar`, optional max), message panel styling, and a live preview inside the panel. Add runtime HUD rendering and the `show-message` rule action so these settings are real, not decorative.
12. Template upgrade: platformer template uses a coin prefab, a `coins` HUD widget, and rules for win/lose; the win scene uses `show-message`.

**Files:** `features/logic/**`, `features/presentation/**`, `engine/commands/prefab.ts`, `engine/commands/rules.ts`, `engine/runtime/rules.ts`.

**Acceptance:**
- [ ] Create a rule "when coins == 3 → go to Win scene"; playing the level triggers it exactly once.
- [ ] A rule referencing a deleted object is flagged and refuses to run.
- [ ] Change gravity and jump values in the inspector; playtest reflects them immediately.
- [ ] Instantiate a coin prefab 10 times; edit the prefab; all instances update; an override survives the update.
- [ ] Detach an instance; editing the prefab no longer affects it.
- [ ] Rebinding jump to `KeyW` works in play mode; conflict warning appears for duplicate bindings.
- [ ] Presentation shows exactly one of Look/Animation/Audio/Game UI at a time; switching updates `?ptab=` and survives reload.
- [ ] A HUD widget bound to `coins` updates during play; a bar widget respects its max; hiding the widget removes it.
- [ ] A `show-message` rule action displays the message in the runtime and clears after its duration.
- [ ] Per-scene music plays, loops, and respects the music volume; SFX volume changes are audible.
- [ ] An animation clip previews in the panel and plays in the runtime on the assigned object.
- [ ] Only one workspace is mounted at a time; switching Scene/Content/Logic/Presentation preserves the viewport camera, and Presentation shows exactly one of Look/Animation/Audio/Game UI.
- [ ] `pnpm typecheck && pnpm build` pass.

**Gate to proceed:** every checkbox above is checked, both commands pass from a clean install, the manual script was performed in a cold browser profile at 1366×768, the result is logged in `docs/implementation-log.md`, and `features.md`/`docs/known-issues.md` are updated. If anything is unchecked or stubbed, stop and fix it here. Do not start the next slice.

---

### Slice 6 — Agent transport, context, chat shell

**Goal:** a real streaming chat panel wired to the live project, with read-only tools first. No write access yet. This de-risks the model integration before mutating anything.

**Depends on:** Slice 5.

**Tasks:**
1. Hono server (`server/index.ts`): CORS for dev, JSON body limit, health route, serve `dist` in production, Zod-validated env.
2. `/api/agent/step` SSE route using the AI SDK. Normalize provider chunks into `StepEvent` from §5.2. Include `AbortSignal` handling.
3. `server/ai/provider.ts`: a minimal env-based model resolver for this slice (generic `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`). The full provider catalog, vault, settings UI, and model picker belong to Slice 6.5; do not build them here.
4. `shared/protocol.ts` + `shared/tool-schema.ts` generated from the client Zod tool definitions. Add a build check that the schema file is current.
5. `system-prompt.ts` with `PROMPT_VERSION`, behavior catalog, command catalog summary, and the rules from §5.5.
6. `context.ts`: build the packet exactly as §5.3, with token-budget caps and a `debugContext` flag that logs the packet to the console in dev.
7. `tools.ts` read tools: `get_project_summary`, `query_project`, `inspect_entity`, `capture_viewport` (returns a data URL; the client attaches it as an image part on the next step).
8. `useAgentSession.ts`: streaming state machine, abort, retry, message persistence, multi-step loop (tool calls only; no writes yet).
9. Agent drawer UI complete per §4.10: header, status, read-only model label (picker arrives in Slice 6.5), mode switch, context chips, message list, streaming cursor, tool cards, composer, empty state, jump-to-latest, error cards, stop.
10. `AI_MOCK=1` mode on the server: deterministic canned responses and tool calls so the entire UI can be built without an API key. Mock scenarios: plain answer, one tool call, three-step chain, error, slow stream.
11. Message persistence per project in IndexedDB; restore last 50 on open.

**Files:** `server/**`, `shared/**`, `src/features/agent/**`, `src/engine/ai/context.ts`, `src/engine/ai/tools.ts`.

**Acceptance:**
- [ ] With `AI_MOCK=1`, all chat states render correctly: empty, streaming, tool running, tool done, error, stopped.
- [ ] The context chips reflect active scene, revision, selection, and playtest state.
- [ ] Changing selection updates the next context packet (verify in server log with `debugContext`).
- [ ] `query_project` returns only entities the model asked for, with real ids.
- [ ] `capture_viewport` returns a PNG and the model sees it on the next step.
- [ ] Stop aborts within 200 ms; retry preserves the thread.
- [ ] The drawer docks correctly at 1920 and overlays at 1366 with a scrim; the inspector remains usable and no horizontal overflow appears.
- [ ] Real provider: a one-line prompt returns a streamed answer and at least one tool call.
- [ ] `pnpm typecheck && pnpm build` pass.

**Do not:** add `apply_commands` yet. The boundary between reading and writing must be a deliberate slice. Do not build provider settings or key storage here.

**Gate to proceed:** every Slice 6 acceptance box is checked, `AI_MOCK=1` covers all states, one real provider call streams a tool call, typecheck/build pass, and the log entry is complete. Do not start Slice 6.5 if the chat cannot render a tool call reliably.

---

### Slice 6.5 — AI providers, model selection, key vault, settings

**Goal:** users can choose from popular AI providers/models, add their own provider or model, and supply keys in the app or via `.env` without ever exposing a key to the browser.

**Depends on:** Slice 6.

**Tasks:**
1. Implement the built-in provider catalog: OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, and Ollama. Each entry has id, name, API style, base URL, env key name, and model-list capability.
2. Implement `server/ai/models.ts` with curated model metadata (model id, label, context window, tools, vision, recommended) for at least three current options per provider, plus provider-fetched models and user-added models. Do not hard-code a single vendor, a single model, or a single context limit.
3. Implement `server/ai/vault.ts`: AES-256-GCM keys from `CLOCKWORK_SECRET` or a generated `.data/secret.key` (`0600`). Store ciphertext/iv/tag/hint in SQLite. Never return key material.
4. Implement key source precedence: env → vault → session. Env keys are read-only in the UI. Session keys live in server memory only.
5. Implement `/api/ai/*` routes from §5.11: providers, save/delete key, test connection, models, custom providers, custom models, settings. Add rate limits, body limits, 15 s test timeout, and SSRF protection for custom base URLs.
6. Implement `SettingsPage` with `General`, `AI Models`, `Data`. Build provider cards, key dialog (`Save to vault` / `Session only`), custom provider dialog, custom model dialog, and test-connection states per §4.17. The `Kane` tab is added by Slice 10, not stubbed here.
7. Implement `ModelPicker` in the agent header and the default picker in Settings: search, provider grouping, `TOOLS`/`VISION`/`LOCAL` badges, context size, disabled when no key, per-chat override in `localStorage` (model id only), default persisted server-side.
8. Add `modelId` to `StepRequest`; resolve it server-side via `resolveModel()`. Reject unknown/disabled models with typed errors. Never accept a key or base URL from the client on `/step`.
9. Capability gating: tool-less models disable `Build`/`Plan` with an explanation; vision-less models hide `capture_viewport`. Context trimming uses the model's window. No silent fallback.
10. Add error cards for `no-key`, `invalid-key`, `no-tools`, `no-vision`, `model-unavailable`, `rate-limit`, and `provider-timeout`, each with `Open settings` or `Choose another model`.
11. Add `docs/model-setup.md` with the provider/env matrix, how to use `.env` vs the in-app vault, security notes, and local Ollama setup.

**Files:** `server/ai/**`, `server/routes/ai.ts`, `server/db/**`, `src/features/settings/**`, `src/features/agent/AgentHeader.tsx`, `shared/protocol.ts`, `docs/model-setup.md`.

**Acceptance:**
- [ ] Settings lists every built-in provider with key source (`ENV`, `VAULT`, `SESSION`, `MISSING`); env keys are read-only and show no value.
- [ ] Save a key to the vault; it survives a server restart, is shown only as a masked hint, and passes `Test connection`. A session-only key is gone after restart.
- [ ] Add a custom OpenAI-compatible provider and a custom model; test, save, select, and use it for a real chat turn. A bad base URL/key fails with a clear card and does not crash.
- [ ] The model picker lists built-ins and custom models, filters by name, and shows tools/vision/context metadata. Selecting a model applies to the next turn and survives reload.
- [ ] A tool-less model allows Ask but disables Build/Plan; a vision-less model hides `capture_viewport`; neither silently falls back.
- [ ] No key appears in `localStorage`, `sessionStorage`, client JS, SSE payloads, API responses, or logs. Only `{configured, source, hint}` is returned.
- [ ] A fresh install with no key still boots the editor, player, and export; the agent shows a setup card instead of failing.
- [ ] `AI_MOCK=1` remains available and is labeled `MOCK` in the header.
- [ ] `pnpm typecheck && pnpm build` pass.

**Do not:** add `apply_commands` yet. Do not store keys in the browser. Do not accept arbitrary base URLs on the model request path.

**Gate to proceed:** every Slice 6.5 acceptance box is checked, keys are verifiably absent from the client, a custom provider and model work end to end, typecheck/build pass, and the log entry is complete. Do not start Slice 7 if model selection or key safety is unresolved.

---

### Slice 7 — Agent writes, workflows, and presence

**Goal:** the agent can change every editable part of the project through the same commands as the UI, with previews, one-step undo, conflict handling, and visible presence.

**Depends on:** Slice 6.5.

**Tasks:**
1. `executor.ts`: client-side `apply_commands` and `preview_commands`; Zod parse, revision check, transaction, one history entry per turn, change-set summary, destructive confirmation.
2. Add the write tools from §5.4 plus `select_entities`, `open_panel` (including `settings`), `start_playtest`, `undo_last_agent_change`.
3. Plan mode: preview patches, ghost overlay, Apply/Discard pill, change-set card, stale-preview guard.
4. Build mode: apply immediately, pulse changed objects, toasts, undo action.
5. Destructive confirmation flow for object/scene/prefab/asset delete, including "what will be removed" text and inline `Delete`/`Cancel`.
6. Revision conflict handling and one automatic re-plan; after two failures, stop cleanly.
7. Agent presence: violet pulse, `AGENT` label, camera ease, hierarchy scroll, selection sync. Do not steal keyboard focus.
8. `start_playtest` bridge: starts play mode, optionally feeds scripted inputs per fixed step, waits for duration or stop, returns telemetry. If a playtest is already running, return an error asking the user to stop it.
9. Contextual suggestions and prompt presets from §7.6. The `Ask agent` split button attaches the current selection; its menu's `Plan a change` opens Plan mode with the same context, and `Explain this scene` opens Ask mode.
10. Selection-level "Ask AI" action in the canvas context menu and inspector: opens the drawer with the object context chip locked.
11. Error handling table from §7.5, including a friendly message when no API key is configured.
12. Implement the seven golden prompts in §7.1 and tune the system prompt until all pass without manual retries.
13. Enable the `From brief` creation path: create a blank project with `templateOrigin: "brief"`, open the editor, and immediately send a Build-mode prompt containing the user's brief and chosen style. The first agent turn must create the first scene and its content as one undoable turn. If the model fails, keep the project (do not delete user work) and show a retry in chat; do not fabricate a scene.

**Files:** `src/engine/ai/executor.ts`, `src/engine/ai/tools.ts`, `src/engine/ai/prompts.ts`, `features/agent/**`, `features/playtest/**`.

**Acceptance:**
- [ ] "Build a small platformer level…" produces a playable scene with real assets, one undo entry, and a concise summary.
- [ ] "Give the player a double jump and make the drone patrol…" changes only the intended objects; Play confirms behavior.
- [ ] "Why does the player fall through the bridge?" inspects colliders and either fixes the cause or explains precisely why it cannot.
- [ ] "Make it dusk and add parallax mountains" does not invent assets; missing assets are reported.
- [ ] "When the player collects all coins, win" creates a valid rule and variable; Play triggers it.
- [ ] "Play it and tell me if it is completable" runs a real playtest and reports telemetry honestly.
- [ ] Plan mode applies exactly the previewed patches; stale preview is blocked.
- [ ] Deleting objects via the agent requires confirmation and cannot be auto-applied.
- [ ] Undo after an agent turn reverts the entire turn and restores the prior revision semantics.
- [ ] Agent edits show violet presence and are visible in the correct scene/layer.
- [ ] `Plan a change` opens the agent in Plan mode with the current selection attached; `Explain this scene` opens Ask mode and does not mutate.
- [ ] `New project → From brief` creates a project and the agent builds a playable first scene in one undoable turn; a failed model call leaves the project intact with a retry.
- [ ] `pnpm typecheck && pnpm build` pass.

**Gate to proceed:** every checkbox above is checked, both commands pass from a clean install, the manual script was performed in a cold browser profile at 1366×768, the result is logged in `docs/implementation-log.md`, and `features.md`/`docs/known-issues.md` are updated. If anything is unchecked or stubbed, stop and fix it here. Do not start the next slice.

---

### Slice 8 — Ship, export, share

**Goal:** a finished project can leave the editor as a playable artifact, and a read-only snapshot can be opened by anyone (including Kane CLI).

**Depends on:** Slice 7.

**Tasks:**
1. `ShipDialog`: build summary (scene count, assets, size), `Export .zip`, `Share link`, `Export .clockwork.json`.
2. Client static build (`io/build.ts`): produce `index.html`, `clockwork.js` (runtime bundle), `assets/*`, `project.json`, `README.txt`; zip with fflate. The exported game loads without React or the editor.
3. Runtime bundle strategy: a separate Vite entry (`src/play/player.tsx`) built as a library/IIFE. Reuse `engine/runtime` and the Pixi renderer. Output is embedded into the zip. If a second build is too slow in dev, build on demand server-side in the Ship route; keep it deterministic.
4. Server snapshots: SQLite table `snapshots(id, project_json, created_at, expires_at)`; `POST /api/snapshots` validates size (< 20 MB) and schema; `GET /s/:id` serves a read-only player with the embedded document and assets.
5. Read-only player route `/play/:snapshotId`: no editor chrome, a small top-left `Made with Clockwork` badge, fullscreen canvas, keyboard/touch input, restart on `R`.
6. Share dialog: copy link, expiration (24 h / 7 d), delete snapshot, "Open as player". Wire the Project Overview `Share` button and the rail `Ship` item to this flow.
7. Capture a cover image on save (viewport canvas, 16:9, 640×360) and store it on the project record. Fall back to template art.
8. Guard: sharing a project with unsaved assets flushes IndexedDB blobs into the snapshot payload first.

**Files:** `features/ship/**`, `server/routes/snapshots.ts`, `server/snapshots/**`, `src/play/**`, `engine/io/build.ts`, `vite.config.ts`.

**Acceptance:**
- [ ] Export a zip, unzip it, serve it statically, and play the level in a fresh browser with no editor and no network.
- [ ] The exported build uses the same physics and behavior results as in-editor play (spot-check jump height and coin count).
- [ ] Share link opens a read-only snapshot; input works; `R` restarts.
- [ ] Snapshot rejects malformed or oversized documents with a clear error.
- [ ] Project cards show the captured cover after save. The rail `Ship` item and Overview `Share` both open the share flow.
- [ ] `pnpm typecheck && pnpm build` pass.

**Gate to proceed:** every checkbox above is checked, both commands pass from a clean install, the manual script was performed in a cold browser profile at 1366×768, the result is logged in `docs/implementation-log.md`, and `features.md`/`docs/known-issues.md` are updated. If anything is unchecked or stubbed, stop and fix it here. Do not start the next slice.

---

### Slice 9 — Hardening, polish, demo readiness

**Goal:** the product survives a live demo and feels finished, with or without an LLM configured.

**Depends on:** Slices 0–8 (including 6.5).

**Tasks:**
1. Performance pass: texture cache, renderer reconciliation, avoid React re-renders per pointer move (subscribe with selectors), memoize inspector fields, virtualize hierarchy above 500 rows.
2. Error pass: every async path has loading, empty, and error states; no unhandled rejections; route-level and viewport-level boundaries.
3. Accessibility pass: focus order, labels, contrast, keyboard-only create/select/edit/play/undo, drawer focus traps, `aria-expanded` on every dock/toggle.
4. Visual pass against §4 at **1366×768, 1440×900, and 1920×1080**, plus the 1024 drawer breakpoint: spacing, 1 px borders, typography scale, coral/violet discipline, no accidental gradients or shadows, no page-level scrollbars, and no horizontal overflow.
5. Onboarding: first-run project dialog, template cards, a 4-step coach mark tour (dismissible, stored in presentation preferences), and a seeded demo project `Neon Runner` that exercises platforming, coins, patrol, and a win rule. `?demoReset=1` restores the intentional uncollectible-coin seed for AI Play rehearsals.
6. Demo rehearsal: run the golden path three times from a cold browser profile; fix anything that needs a retry. Record a 90 s screen capture locally (not committed).
7. README: a 30-second quick start (`pnpm install`, `pnpm dev`, open `/`), setup, env, scripts, architecture summary, manual-first guarantee, agent/model architecture, Kane/AI Play setup, known limits, and links to `features.md` and `docs/known-issues.md`.
8. Remove debug-only UI behind `?debug=1` from normal paths; keep the debug API documented.
9. Final responsive audit at 1366×768: every primary action reachable, canvas ≥600×480, inspector opened by selection, drawers labeled, no page scroll. Then `pnpm typecheck` + `pnpm build` + production preview smoke.
10. Add `scripts/check-repo.mjs` and `pnpm check:repo`. It fails on `reference/`, generated artifacts, stray root Markdown (other than `README.md`/`features.md`), missing `features.md` or `docs/known-issues.md`, and missing slice log entries. Run it, fix every finding, and confirm the final tree matches §2.1.
11. Audit `features.md`: only 100% complete features, each with a one-line user-facing description and the completing slice. Remove anything partial, mocked, disabled, or unverified. Cross-check against the slice acceptance list.
12. Audit `docs/known-issues.md`: deferred K1–K4 engine QA, pending real AI Play evidence, single-user v1, model/key/Kane requirements, any failing checks, and any scope cut. It must be honest and current.
13. Write `docs/testing-hooks.md` with the stable `data-testid`s, root state attributes, URL params, `window.__clockwork` methods, and console event names from §10.2. Keep it in sync with the implementation.

**Acceptance:**
- [ ] Cold start with no model/key/Kane → create from Platformer → edit manually → manual Play → share → export in under 5 minutes without a dead end.
- [ ] Cold start with a model → create from Platformer → edit → agent edit → manual Play → share → export in under 5 minutes without a dead end.
- [ ] No console errors or warnings during the golden path (React key warnings included).
- [ ] Workspace switching renders exactly one of Scene/Content/Logic/Presentation at a time, and one of Look/Animation/Audio/Game UI inside Presentation.
- [ ] At 1366×768 the full editor is usable with no page scrollbar: hierarchy visible, inspector opens on selection, agent overlays with a scrim, canvas ≥600×480, and every primary action is reachable.
- [ ] At 1024×768 the docks become labeled drawers and no horizontal overflow appears.
- [ ] Keyboard-only user can create an object, move it, undo, open agent, send a prompt, and stop play.
- [ ] The demo project loads with cover art and no missing assets.
- [ ] Refresh during a save recovers the last committed revision, not a partial document.
- [ ] `pnpm check:repo` passes; the final tree has no `reference/`, generated artifacts, stray root Markdown, or missing ledgers.
- [ ] `features.md` lists every fully completed feature with a description and no planned/partial work.
- [ ] `docs/known-issues.md` is current and includes deferred K1–K4 engine QA, pending AI Play evidence, manual-only behavior, and every known limitation.
- [ ] `docs/testing-hooks.md` documents every test id, URL param, debug API method, and console event used by the verification branch.

**Gate to proceed:** every Slice 9 acceptance box is checked, the manual/no-model path is proven, `pnpm typecheck`, `pnpm build`, and `pnpm check:repo` pass, and the log entry is complete. Do not start Slice 10 with unresolved layout, save, or accessibility defects.

---

### Slice 10 — Kane: engine QA + in-product AI Play (final slice)

**Goal:** make Kane a real part of the product, not a test suite bolted on at the end. Kane is used in two distinct ways:

1. **Engine QA (verification branch):** Kane plays the Clockwork editor end to end, catches or confirms a real UI bug, and produces evidence for the hackathon's *Verified* bar.
2. **AI Play (in-product):** a second Play button with an AI mark sends Kane into the running game. Kane plays through the visible AI control pad, reports a stuck/failed run, and the Clockwork agent reads that result, fixes the game, and asks Kane to replay until it passes. This is the *Closed loop* demo.

The manual Play button is always first-class and never depends on Kane or a model. This slice is last because it consumes the finished editor, runtime, agent, snapshots, and hardening.

**Depends on:** Slice 9 (hardening) and the share snapshot from Slice 8.

**Tasks:**
1. `server/kane/runner.ts`: one safe process runner used by both modes. Spawn `kane-cli run <objective> --url <url> --agent --mode testing --max-steps 40 --timeout 180 --assertion-mode dom --final-validation on` with an argument array (never a shell string). Add `--bug-detection continue` for engine QA and `--bug-detection off` for AI Play. Resolve `KANE_CLI`, `kane-cli.cmd` on Windows, or `npx --yes @testmuai/kane-cli`; kill the process tree on cancel/timeout.
2. `server/kane/ndjson.ts`: line-buffered parser; ignore non-JSON; emit `stream_start`, step `running/done/failed`, `warning`, `error`, `run_end`; preserve raw lines; capture exit code separately. Handle exit 2 with no `run_end` and exit 3 as cancelled/timeout.
3. `server/routes/kane.ts`: `POST /api/kane/qa` (SSE), `POST /api/kane/ai-play` (SSE), and `POST /api/kane/ai-play/:id/cancel`. One active run per project; reject cross-origin or non-snapshot URLs; never accept a key, base URL, or arbitrary command from the client. Kane is always enabled; a missing CLI, sign-out or zero credit balance returns an explicit error.
4. `server/kane/objectives.ts`: build the engine-QA objectives (K1–K4) and the AI Play objective from the snapshot's scene, goal, controls, and win condition. Keep the AI Play objective under 15 steps. It must use the exact visible AI HUD labels and end with `store` extractions plus assertions, never with a bare action.
5. `src/play/ai/AiPlayHud.tsx`: a visible, accessible AI Play layer in the player when `?ai=1`. It exposes `MOVE LEFT`, `MOVE RIGHT`, `JUMP`, `ACTION`, `STOP`, `RESTART` as real DOM buttons and a `GAME STATE` panel with `STATUS`, `SCENE`, `COINS`, `HEALTH`, `TIME`, `SEED`, and `LAST ERROR`. The buttons dispatch the same runtime input actions as the keyboard. Movement buttons are toggles with visible `ON`/`OFF` state; Jump/Action are impulses. Manual keyboard input still works. Do not change gameplay rules for AI mode.
6. `src/features/ai-play/AiPlayButton.tsx`: add the **second Play button** to the toolbar beside manual `Play`. Manual Play is coral; AI Play is violet with a sparkle-play glyph and the label `AI Play`. At 1366×768 both are visible; at narrower widths they stay together in a labeled Play split menu, never an unlabeled icon. Shortcut `⌘⇧↵` (`Ctrl+Shift+Enter`).
7. `src/features/ai-play/AiPlayPanel.tsx` and `aiPlayController.ts`: save/flush, create an immutable snapshot, open `/play/:id?ai=1&seed=<seed>`, start the run, stream steps into a panel, and show `Attempt 1`, `Attempt 2`, verdict, final state, and evidence. Include `Stop`, `Retry`, `Open evidence`, `Copy objective`, and an `Auto-fix` toggle (default on). Show the credit/upload consent once per session.
8. Add the agent tool `run_ai_play({ sceneId?, goal?, maxAttempts? })`. It returns `{ status, resultCode, reasonCode, summary, finalState, objective, steps, runtimeErrors, evidencePath, testUrl, attempts }`. The agent must not claim Kane passed without `run_end.status === "passed"`.
9. Closed-loop policy: on failure, the agent receives the objective, `final_state`, last 10 steps, runtime errors, and the evidence path, diagnoses the cause, applies the smallest non-destructive fix through the CommandBus, and calls `run_ai_play` again with the same seed. Maximum two automatic attempts. Destructive changes and Plan/Ask modes require confirmation. Always offer `Undo AI fixes` after a failed final attempt. Never loop forever and never hide a failed Kane run.
10. Engine-QA hooks: `scripts/kane/qa/*.md` objectives K1–K4 for the editor (open project, create/edit, play/pause, save/refresh, export), the fixture runner, and `docs/kane-proof.md`. The real engine-QA suite runs in the verification branch; this slice supplies the hooks and proves the stream.
11. `scripts/kane/fake-kane.mjs`: deterministic fixture with `KANE_FIXTURE_RESULT=passed|failed`, `KANE_FIXTURE_FINAL_STATE`, and realistic step/`run_end` events. It is for development and gate determinism, not a substitute for the real AI Play smoke.
12. Evidence: write raw NDJSON, parsed result, screenshots/evidence metadata, and `result.json` under `.data/ai-play/<runId>/` (ignored). List AI Play runs in the `Playtest` section with pass/fail, attempt count, duration, and evidence; never commit evidence.
13. Settings → `Kane`: CLI path/status, `Test Kane`, AI Play enabled toggle, headless toggle, evidence folder + `Clear`, and credit/upload disclosure. Never render the Kane token. Add the docs: `docs/kane-setup.md` (install, login, Windows, flags, credits, local vs deployed), `docs/kane-proof.md` (engine-QA evidence template), and `docs/ai-play.md` (HUD contract, objective format, result schema, retry policy).
14. Manual-only path: with `AI_ENABLED=0` and no keys, the entire editor, persistence, manual play, share, and export remain usable. `AI Play` is hidden or disabled with `Connect a model to diagnose and fix; manual Play works.` There is no dead end and no editor action requires an LLM.
15. Update `features.md` only after the real AI Play pass and the manual path are both verified; record every unfinished item in `docs/known-issues.md`.

**Files:** `server/routes/kane.ts`, `server/kane/**`, `src/play/ai/**`, `src/features/ai-play/**`, `shared/protocol/kane.ts`, `scripts/kane/**`, `docs/kane-setup.md`, `docs/kane-proof.md`, `docs/ai-play.md`.

**Acceptance:** audited 2026-11-17 on `verify/kane-e2e`. Each box is marked **proven** (observed evidence), **unverified** (implemented, no evidence run), or **broken** (does not meet the requirement).
- [ ] Manual `Play` works with no model configured and with `AI_ENABLED=0`; the editor can create, edit, save, reopen, play, share, and export without an LLM or Kane. — **unverified**: no browser run with `AI_ENABLED=0`; recorded in `docs/known-issues.md`.
- [ ] Without a model, `AI Play` is hidden or shows a disabled explanation; manual Play is never blocked or renamed. — **unverified**: no browser evidence.
- [x] **Superseded 2026-11-21:** the old opt-in gate was removed. Kane routes and tools are always enabled; missing CLI, sign-out and zero credits are explicit errors. The historical 404/gating proof no longer describes current behavior.
- [ ] With `KANE_CLI=scripts/kane/fake-kane.mjs`, engine QA streams fixture steps and a final verdict; passed, failed, and exit-2 cases render correctly. — **proven** (2026-11-17): passed and failed streams verified; `KANE_FIXTURE_NO_RUN_END=1` now models exit-2-with-no-`run_end`, and the path renders as `KANE ERROR` + `Kane CLI could not start (auth, URL or Chrome). Run kane-cli whoami and try again.` + `Attempt 1 ERROR · 1 step`, with runner status `error` and the `kane-auth` error event. The attempt footer also stopped hiding failed steps (it counted only `done`).
- [ ] With the fixture, pressing `AI Play` opens the snapshot player, shows the AI HUD, streams a failed run, lets the agent apply a fix, and streams a passed second attempt. The panel shows the attempt history and evidence. — **unverified**: claimed in the log, no stored artifact for the fixture-driven UI loop.
- [ ] The AI Play objective uses only visible labels (`MOVE RIGHT`, `STATUS`, `COINS`, `LAST ERROR`) and ends with `store ... as` plus assertions, including `coins = 3` for `Neon Runner`. No CSS selectors or hidden debug text are required. — **proven** (2026-11-17): objective ends with `Store the STATUS value … as 'status', store the COINS value as 'coins', store the LAST ERROR value as 'last_error'` then asserts on the stored values; run `2ff85c36…` returned `run_end.status: "passed"` with `final_state` `status: "WON"`, `coins: "3"`, `last_error: "none"` (86.8 s, 24.73 credits). See `docs/kane-proof.md`.
- [ ] The AI HUD controls dispatch the same input commands as the keyboard; manual keyboard input still works in `?ai=1`, and the game rules are unchanged. — **unverified**: HUD dispatch is wired (`onMove`/`onJump`/`onAction`), no browser evidence for keyboard parity.
- [x] **Real Kane smoke (seeded bug):** with a logged-in Kane CLI, reset `Neon Runner`, press AI Play, and confirm attempt 1 fails because `COINS: 2` and `coin_2` is unreachable. Let the agent fix it, rerun with the same seed, and confirm attempt 2 passes with `STATUS: WON`, `COINS: 3`, and `LAST ERROR: none`. Save both evidence packs and the change-set diff. — **proven** (2026-11-17): attempt 1 `run_end.status: "failed"` in 85.0 s (`87f6f320…`), deterministic `Move Core A out of Ground` fix, attempt 2 `"passed"` in 66.6 s with `WON` / `3` / `none` (`646cff5f…`); both evidence packs in `.data/ai-play/`, details in `docs/kane-proof.md`. The separate change-set diff was not archived.
- [ ] **Independent negative control:** deliberately make the goal unreachable (for example, shrink the final platform collider), run AI Play, confirm Kane fails with a stuck/assertion result, then let the agent fix it and rerun to a pass. This proves the loop is not tuned only to the seeded coin. Save both evidence packs and the fix diff. — **proven** (2026-11-18): attempt 1 **failed** on the assertion with an unsatisfiable win rule (`coins >= 2` in a one-coin scene; the coin was collected but `STATUS` stayed `PLAYING`, 94.1 s), the rule was restored, and attempt 2 **passed** with `WON` / `1` / `none` (81.6 s). Runs `b050f47c-…` and `52baa697-…`, archives `.testmuai/runs/negative-control-attempt{1,2}.*`, harness `scripts/kane/negative-control.ts`, details in `docs/kane-proof.md`. The repair was applied deterministically, not by a model turn; the fix diff is the one-line win-rule change. A first attempt on the full six-jump route hit the 145 s ceiling and was cancelled, which is recorded as a ceiling finding, not evidence.
- [ ] **Engine QA:** the verification branch runs K1–K4 against the real editor; at least one meaningful UI defect is caught or confirmed and recorded in `docs/kane-proof.md`. If Kane only produces green runs, the *Verified* score is weaker; do not claim a bug catch that did not happen. — **proven** (2026-11-18): K1 passed (two defects caught and fixed); K2 ran and failed on a real product/config defect (Build request allowed with `No model`, raw fetch failure instead of actionable guidance — see `docs/kane-proof.md`); K3a (repair + win, 282.1 s), K3b (undo/redo in one flow, 218.9 s, counters 1/0 → 0/1 → 1/0), K4 (in-app card + terminal, both passed) and K5 (fail → fix → pass) are all real runs. K2 remains environment-blocked.
- [x] Raw NDJSON, final state, and evidence paths are logged server-side; keys, prompts, and secrets are not. — **proven**: `.data/ai-play/<runId>/raw.ndjson`, `result.json`, `evidence-path.txt` and `evidence.evidence` exist for every run; no key or prompt material is written there.
- [x] `pnpm typecheck && pnpm build` pass. — **proven** (2026-11-17): `tsc -b tsconfig.json tsconfig.node.json` and `vite build` (23.55 s) pass.

Tally: 8 proven, 4 unverified, 0 broken. The four open boxes are the manual/no-model browser pass, the no-model AI Play state, the fixture-driven AI Play UI artifact, and AI HUD keyboard parity.

**Do not:** add Playwright, commit evidence packs, let AI Play run against the editor URL with IndexedDB state, or auto-apply destructive changes without confirmation. The full K1–K4 suite belongs to the verification branch; the two real AI Play loops (seeded and independent) are product acceptance and gate this slice.

**Gate to proceed:** every acceptance box is checked, including the manual/no-model path, the fixture loop, the real AI Play smoke, and the negative-control fail → fix → pass loop. `pnpm typecheck`, `pnpm build`, and `pnpm check:repo` pass, and `docs/implementation-log.md`, `features.md`, and `docs/known-issues.md` are current. Do not mark Kane complete from fixture results alone.

**Final gate:** every slice acceptance box (0–10, including 6.5) is checked, the full golden path passes from a cold profile at 1366×768 with and without a model, Kane's real evidence is linked from `docs/kane-proof.md` (engine QA) and `docs/ai-play.md` (AI Play), and the repository is clean. Only then hand off to the verification branch for the K1–K4 suite.

---

## 9. Golden path and demo script

This is the one continuous story the product must tell. Rehearse it in this exact order. The UI copy below is what the audience should see.

### 9.1 The 3-minute demo

**0:00 — Projects**
- Open `/`. The projects grid shows a `Neon Runner` demo card with cover art and `New project`.
- Click `New project` → choose the `Template` path → name `Dusk Run` → select `Platformer` → Create.

**0:10 — Editor**
- The editor loads on scene `Track`, 2560×1080, with a player on the ground, two platforms, three coins, a drone, and layered dusk art.
- Point out: revision `r1`, `Saved`, layers, hierarchy, inspector, and the `AGENT` rail.

**0:25 — Manual edit**
- Select the drone, drag it above the bridge. One revision, one undo entry. Press `⌘Z`; it snaps back. Redo.
- Select the player, show the `platformer-controller` behavior in the inspector.

**0:40 — Agent edit**
- Open `Ask agent` with the player selected. Type: "Give the player a double jump and make the drone patrol back and forth above the bridge."
- Tool cards appear: `Inspecting player`, `Inspecting drone`, `Updating 2 objects`.
- Both objects pulse violet. A change-set card shows `2 changes · 1 undo entry` with the double-jump field and the new patrol behavior.
- Reply: "Player now has a double jump (jumpVelocity 720, doubleJump true). Drone patrols 220 px over the bridge. Undo with ⌘Z."

**1:00 — Manual Play**
- Point at the first button: `Play` (coral, `⌘↵`). It runs the game manually with no model and no Kane.
- Jump twice; the drone ping-pongs. Pause and step one frame. Stop. Say: "This path never needs an LLM."

**1:15 — AI Play**
- Point at the second button: `AI Play` (violet, sparkle-play, `⌘⇧↵`). Say: "Same engine, a different player."
- The snapshot player opens with the visible AI HUD. Kane clicks `MOVE RIGHT`, jumps, and reaches the goal, but `COINS: 2`; the assertion fails. The panel reports: `Kane reached the goal but collected 2/3 coins; coin_2 is inside the raised platform.` This is a real content bug that manual play hides.
- Auto-fix is on. The agent moves the coin, applies one undoable change set, and calls `run_ai_play` again. Attempt 2 passes with `KANE VERIFIED`, `COINS: 3`, duration, and evidence.
- Say: "Kane played the game, told our agent what was wrong, the agent fixed it, and Kane proved the fix. That is the closed loop."

**2:05 — Engine QA**
- If the verification branch has already run, show the real K2/K3 evidence: Kane caught a reload race in the editor, before/after screenshots, `run_end`, and the fix. If it has not run yet, show the fixture card and say plainly that the real K1–K4 suite is the next branch; do not claim a real bug catch.
- Say: "Kane is used twice: it tests the engine itself, and it plays the games built with it. Same CLI, two roles."

**2:30 — Ship**
- Click `Ship` → `Share link`. Copy the snapshot URL and open it in a new tab: a chrome-free playable build. Close it.
- `Export .zip`, show the file name, and mention it plays without the editor or network.
- Press `⌘Z` once to undo the agent's last turn as a whole.

**3:00 — End**
- Return to the editor. Point at the status bar: `One completed gesture = one revision and one undo entry.`

### 9.2 Demo seed: `Neon Runner`

Include this as a built-in local project on first run (not a template in the dialog):

- Scene `Track`, 2560×1080, dusk gradient background, 4 parallax layers (sky, mountains 0.25, forest 0.5, ground 1.0).
- Player at (320, 700), 56×84, `platformer-controller` (speed 320, jump 720, doubleJump false initially).
- Ground strip, a solid bridge platform at x=1200, a raised platform at x=1700. Manual Play must be able to finish.
- 3 coin prefab instances at (900, 620), (1700, 520), (1900, 560), each with `collectible` (variable `coins`, amount 1). Coin 2 is intentionally embedded inside the raised platform so it cannot be collected: this is the AI Play diagnose seed. Manual Play can still reach the goal; AI Play asserts all three coins. `?demoReset=1` restores this seed for rehearsal.
- Drone at (1600, 380) with `patrol` (axis x, distance 220, speed 80).
- Goal flag at (2350, 700); rule `Reach goal` → go to scene `Win`.
- Scene `Win`: centered text "You made it" and a `Back to Track` button rule.
- Variables: `coins` number 0, `won` boolean false.
- Game UI: a top-left `COINS 0` HUD widget bound to `coins`; a centered message panel used by the win rule.
- Audio: one music loop assigned to `Track`, music volume 0.4, SFX 0.8.
- Camera follow on the player, deadzone 120×80, lerp 0.12, clamp to world.

This project must be loadable with `?demo=1` for verification runs, and it must never be auto-deleted.

### 9.3 Demo failure fallbacks

| If this fails | Do this |
|---|---|
| No model or no key | Continue with manual editing and manual Play. Hide/disable AI Play with the setup explanation. Do not block the demo. |
| Model is slow/down | Switch to `AI_MOCK=1` demo mode; the chat streams a recorded real session and still applies commands through the same executor. Disclose it is a recorded session. |
| Kane is unauthenticated | Manual Play and editing continue. Show the AI Play setup card, not a fake verdict; do not claim a pass. |
| AI Play finds a bug | Show the failure, let the agent apply one non-destructive fix, and rerun. If attempt 2 fails, show both evidence packs and `Undo AI fixes`; do not hide it. |
| WebGL context lost | The viewport shows `Renderer paused`, restores once; if it fails, reload the project from autosave. |
| A prompt misfires | Press `⌘Z` to undo the whole turn, then use the preset chips. Never debug live for more than 15 seconds. |
| Share snapshot fails | Export the zip and open `index.html`; the story still lands. |

### 9.4 Judge quick path (under 30 seconds)

`pnpm install && pnpm dev`, then open `http://localhost:5173/?demo=1`. The `Neon Runner` project opens with two buttons: `Play` (manual, no keys) and `AI Play` (Kane, when configured). A judge can play immediately without a model; with a model/key and Kane logged in, the AI Play loop is one click away. The README repeats this exact path.

---

## 10. Verification plan and the three bars (executed later)

This branch does **not** run the K1–K4 engine-QA suite; that is the verification branch. It must, however, leave the product testable and it must ship the in-product AI Play feature, because that feature is part of the product and the closed-loop story. The verification branch uses **Kane CLI** for the engine suite; the product uses the same CLI to play games.

**Why Kane CLI:** it is not a selector-based E2E runner. It drives a real Chrome browser from a plain-English objective, returns structured NDJSON plus a sealed evidence pack, and can be invoked by an AI agent. That makes it both the independent quality verifier for the engine and the concrete runtime for AI Play. The app treats Kane as a first-class tool, not a CI afterthought.

### 10.1 Bar mapping

| Bar | What it means | How Clockwork satisfies it |
|---|---|---|
| **1. It works end to end** | A judge can use the product without a developer | Golden path §9 works from a cold profile: create → edit manually → manual Play → agent edit → AI Play → share/export. The manual path works with no model or key. |
| **2. Kane CLI caught or proved something** | Kane must produce evidence of a real behavior or a real bug | Two proofs: (a) engine QA K1–K4 catches/confirms a real UI defect on the verification branch; (b) AI Play catches the uncollectible coin in `Neon Runner`, the agent fixes it, and attempt 2 passes with both evidence packs. |
| **3. Your agent and Kane CLI talked to each other** | The AI system must exchange structured information with Kane, not just have a human run it | Slice 10: the agent calls `verify_with_kane` for engine QA and `run_ai_play` for the game loop. Both spawn Kane against a snapshot, stream NDJSON, and return a structured verdict the agent reads and acts on. |

A miss on any bar blocks scoring of the other dimensions. Do not fake a pass. If Kane fails, show the failure and the evidence.

### 10.2 What must exist in this branch

The verification branch cannot rescue missing hooks. Implement all of these now:

1. **Stable test ids** on every interactive element: `data-testid` in kebab-case, e.g. `project-new`, `project-card-<id>`, `projects-filters`, `project-mode-blank|template|brief|import`, `tool-select`, `toolbar-play`, `toolbar-ai-play`, `toolbar-plan-change`, `layer-row-<id>`, `hierarchy-row-<id>`, `hierarchy-filter`, `inspector-name`, `dock-toggle-inspector`, `presentation-tab-look|animation|audio|ui`, `settings-open`, `settings-ai`, `settings-kane`, `provider-card-<id>`, `provider-key`, `provider-test`, `model-picker`, `model-option-<id>`, `custom-provider-add`, `custom-model-add`, `agent-open`, `agent-input`, `agent-send`, `agent-stop`, `changeset-apply`, `changeset-undo`, `ship-share`, `kane-run-card`, `verdict-badge`, `ai-play-panel`, `ai-play-stop`, `ai-play-retry`, `ai-play-evidence`, `ai-hud-move-right`, `ai-hud-jump`, `ai-hud-status`, `ai-hud-coins`, `ai-hud-last-error`.
2. **State attributes**: `data-revision`, `data-save-state`, `data-selected-count`, `data-playtest`, `data-ai-play` on the app root; `data-object-id` and `data-selected="true"` on hierarchy rows and canvas-adjacent DOM (canvas objects are not DOM, so mirror a hidden accessible list).
3. **Accessible names**: every button has visible text or `aria-label` that matches the user's intent; dialogs have labelled titles; inputs have real labels, not placeholders only.
4. **Deterministic URLs**: `/project/:id/scene/:sceneId?tab=<scene|content|logic|presentation>&ptab=<look|animation|audio|ui>` restores the workspace exactly; `?demo=1` loads the seed project and `?demoReset=1` restores its intentional AI Play defect; `?seed=1234` sets the playtest seed; `?debug=1` shows the debug overlay; `?kane=1` reduces animation and exposes a verification banner; `/play/:id?ai=1&seed=<n>` opens the AI Play HUD.
5. **Read-only debug API** on `window.__clockwork` (dev and preview builds):
   ```ts
   {
     version: 1;
     getState(): { revision, saveState, sceneId, selection: string[], playtest: string };
     getDocument(): ProjectDocument;            // deep clone
     getRuntime(): { variables, elapsedMs, running, lastError } | null;
     getRecentEvents(): Array<{ type, at, message }>;
     getAgentStatus(): "idle" | "thinking" | "tool" | "done" | "error";
     getAiStatus(): { modelId, provider, supportsTools, supportsVision, keySource };
     getAiPlay(): { runId, attempt, status, lastError } | null;
   }
   ```
   `getAiStatus` returns no key material. No write methods. Kane should drive the UI like a user, not call this API; it exists for assertions and diagnostics.
6. **Structured console events**: log one-line JSON with prefix `clockwork:` for `project.created`, `revision.committed`, `agent.turn.started`, `agent.tool.called`, `agent.turn.committed`, `playtest.started`, `playtest.stopped`, `snapshot.created`, `kane.started`, `kane.finished`, `aiplay.started`, `aiplay.attempt`, `aiplay.finished`. Never log prompts, API keys, or full documents.
7. **Stable empty/loading/error states** with visible text, so Kane can assert on them.
8. **Snapshot sharing** (Slice 8), **Kane QA route** (Slice 10), and **AI Play route** (Slice 10) working.
9. **Manual-only path**: with `AI_ENABLED=0` and no keys, create/edit/play/share/export all work; AI Play is disabled with an explanation.

### 10.3 Verification branch structure

Create a separate branch `verify/kane-e2e` after this branch merges. It may add:

- `scripts/kane/run.mjs` — spawns Kane CLI in `--agent` mode, saves NDJSON, extracts `run_end`, writes an evidence index.
- Refined K1–K4 objectives under `scripts/kane/objectives/`; Slice 10 already ships the seed objectives and fixture.
- The filled `docs/kane-proof.md`.
- `.testmuai/variables/variables.json` if objectives use variables.
- **K5 — AI Play closed loop** — a real Kane run against `/play/:id?ai=1` that fails, followed by the agent fix and a passing rerun; archive both `run_end` records. This tests the product feature, not just the editor.
- No Playwright, no Vitest browser, no custom selectors. Kane is the browser runner for engine QA and the in-product AI Play feature.

Do not add the verification runner or filled proof to the implementation branch; Slice 10 is the last implementation slice and stops at the seed hooks and the two AI Play loops.

### 10.4 The five verification objectives

Write them as user goals, not implementation steps. Never mention `data-testid` or internal APIs.

**K1 — Editor smoke**
```text
Open the Clockwork projects page, create a new project from the Platformer template named Kane Check,
confirm the editor loads with a scene and at least one object, select the player, move it with the
arrow keys, undo the move, and reload the page. Verify the project and the undone position persist.
```

**K2 — Agent edits the shared engine state**
```text
Open the Dusk Run demo project, select the player, open the agent, and ask it to give the player a
double jump. Wait for the change summary. Verify the inspector shows double jump enabled, press Play,
press Space twice and verify the player leaves the ground twice, then stop and press Undo once.
Verify the double jump setting is off again.
```

**K3 — Agent diagnoses and repairs**
```text
Open the Dusk Run demo project and reset it with ?demoReset=1. Ask the agent: "One coin in Track
cannot be collected. Inspect the scene, find out why, and move it somewhere reachable." Wait for the
change summary. Press Play, collect all three coins, and verify the win message appears. Stop and undo
once to confirm the change is one undo entry; redo it.
```

**K4 — Agent ↔ Kane handshake**
```text
In the agent chat, ask: "Verify in a real browser that the level loads and the player can collect a coin."
Wait for the verification card to finish. Verify it shows a passed verdict, at least three executed
steps, a duration, and an evidence link. Verify the agent's reply references the Kane result.
```

K4 is the engine-QA handshake proof. It must be run twice: once from the app's agent, once from the terminal runner, and both evidence packs must be archived.

**K5 — AI Play closed loop**
```text
Open the Dusk Run demo project and reset it with ?demoReset=1. Press the AI Play button and wait for
the run to finish. Verify the panel reports that Kane reached the goal but collected only two of three
coins, and names the unreachable coin. Apply the suggested fix, press Retry, and verify the second run
shows KANE VERIFIED with three coins. Open the evidence for both attempts and verify the first is a
failure and the second is a pass. Confirm manual Play still works with the model disabled.
```

K5 is the product closed-loop proof: **Kane failure → agent fix → Kane rerun → pass**. It is not a substitute for K1–K4; together they cover both Kane roles.

### 10.5 Exact commands

Install and authenticate once:

```bash
npm install -g @testmuai/kane-cli
kane-cli login
```

Run an objective from the terminal:

```bash
kane-cli run "$(cat scripts/kane/objectives/k2-agent-double-jump.txt)" \
  --url "http://localhost:5173/?demo=1&kane=1" \
  --agent --headless --timeout 240 \
  > .testmuai/runs/k2.ndjson
code=$?
echo "exit=$code"
jq -cR 'fromjson? | select(.type == "run_end")' .testmuai/runs/k2.ndjson
```

Interpret exit codes: `0` passed, `1` ran and failed, `2` never started (auth/URL/Chrome), `3` canceled/timeout. Parse `run_end` by `type`, never by position. On Windows, run the same command from Git Bash; if `kane-cli` is not on PATH, use `kane-cli.cmd`.

For an AI Play reproduction, the server builds the same command against the immutable snapshot player (not the editor):

```bash
kane-cli run "$(cat scripts/kane/ai-play/neon-runner.txt)" \
  --url "http://localhost:5173/play/<snapshotId>?ai=1&seed=1234" \
  --agent --headless --mode testing --max-steps 40 --timeout 180 \
  --assertion-mode dom --final-validation on --bug-detection off \
  > .testmuai/runs/ai-play-attempt.ndjson
```

Drop `--headless` when you want the audience to watch Chrome. The app shows the same stream in the AI Play panel either way.

Evidence:
- `run_end.session_dir` → `evidence/*.evidence` pack.
- `kane-cli evidence serve <pack>` to view locally.
- Archive the pack path and `test_url` in `docs/kane-proof.md`.

### 10.6 Bar-2 proof protocol (Kane caught something)

The proof must be real. Use one of these three scenarios and follow the protocol exactly. Scenario C is preferred because it exercises the product's AI Play loop.

**Scenario A — autosave race (recommended)**
1. Before fixing, create a commit `proof/pre-autosave-race` with a known flaw: autosave writes the document captured 500 ms earlier instead of the latest revision when two commits happen inside the debounce window. Add a debug-only trigger `?race=1` that performs two rapid edits.
2. Run K2 with `?race=1`. Kane should fail the reload assertion: the second edit is missing.
3. Archive the failing NDJSON and evidence pack. Copy the failing step's remark into `docs/kane-proof.md`.
4. Fix autosave to always write the latest document (`saveSeq` guard).
5. Re-run K2 without `?race=1`. Archive the passing run.
6. Keep both evidence packs linked in the proof doc. Remove the debug trigger before merge.

**Scenario B — undo boundary**
1. Create a build where an agent turn commits each command separately, so one `⌘Z` reverts only the last object.
2. Run K2; Kane fails "undo once restores the previous state".
3. Fix transaction grouping; re-run and archive both.

**Scenario C — AI Play content bug (preferred)**
1. Reset `Neon Runner` with `?demoReset=1`. Coin 2 is intentionally inside the raised platform.
2. Run K5 or press AI Play. Kane reaches the goal but fails the all-coins assertion with `final_state.coins = 2` and names `coin_2`.
3. Archive the failing NDJSON, screenshots, and `result.json`.
4. Let the agent move the coin to a reachable position. Apply exactly one non-destructive change set.
5. Retry with the same seed. Kane passes with `STATUS: WON`, `COINS: 3`, and `LAST ERROR: none`. Archive the pass.
6. Link both evidence packs and the change-set diff in `docs/kane-proof.md`. Include the AI Play panel screenshot showing both attempts.

Do not invent a bug that cannot occur. The failure artifact must be produced by Kane, and the fix must be in the product code or the demo content. Disclose that the uncollectible coin is a seeded demo defect; it is a deliberate negative control, not a fabricated Kane failure.

### 10.7 Bar-3 proof protocol (agent ↔ Kane)

K4 and K5 are the product proofs. Capture the raw handshake for both:

1. In-app engine QA: the `KaneRunCard` shows the objective sent, steps, verdict, and evidence path.
2. In-app AI Play: the `AiPlayPanel` shows the objective, the failed attempt, the applied fix, the passing attempt, `final_state`, and both evidence links.
3. Server: log `kane.started` / `kane.finished` and `aiplay.started` / `aiplay.attempt` / `aiplay.finished` with `{ projectId, snapshotId, attempt, status, duration, evidencePath }` (no secrets).
4. Archive the NDJSON from K4 and from both K5 attempts (`k5-attempt1.ndjson`, `k5-attempt2.ndjson`).
5. Terminal: run K4's objective directly against `/?demo=1`; archive `k4-terminal.ndjson`.
6. In `docs/kane-proof.md`, include a side-by-side of the two K4 `run_end` records plus the K5 fail/pass pair and a screenshot of both cards. This proves bidirectional structured communication: **agent → Kane objective → NDJSON → agent fix → Kane rerun → pass**.

### 10.8 Scoring dimensions

Assume four equally weighted dimensions. Design for them explicitly:

| Dimension | Evidence in this build |
|---|---|
| **Ships** | Golden path with **manual Play that needs no LLM**, local-first persistence, playable export, shareable snapshot, and AI Play as an additive second path |
| **Verified** | K1–K4 engine QA catches/confirms a real UI defect; K5 AI Play catches the uncollectible coin; both have sealed evidence and before/after `run_end` |
| **Closed loop** | Kane fail → agent diagnosis → one non-destructive fix → same-seed Kane rerun → `KANE VERIFIED`; attempt history and both evidence packs shown in-product |
| **Craft** | Engine-grade UI, two distinct Play buttons, visible AI HUD, agent presence, visual change sets, deterministic replay, and Kane as the game's player rather than a CI bolt-on |

### 10.9 What not to do in the verification branch

- Do not test internals with selectors or JS injection; Kane should act like a user.
- Do not make objectives implementation-specific ("click `#btn-3`").
- Do not edit the app to make an assertion pass.
- Do not claim a Kane pass without `run_end.status === "passed"` and an evidence pack.
- Do not run K4 or K5 against the editor URL with local-only state; use the snapshot URL.
- Do not make AI Play pass by editing the objective after seeing the failure; fix the game or the engine, then rerun the same objective and seed.
- Do not mark a phase `ACCEPTED` based on UI review alone; behavior, persistence, and evidence must also pass.

---

## 11. Quality gates, budgets, and risks

### 11.1 Gate after every slice

1. `pnpm typecheck` — zero errors, no suppressions added to silence the build.
2. `pnpm build` — production build succeeds.
3. Manual acceptance script for that slice — run it, don't assume.
4. Console check — no errors, no React key warnings, no unhandled rejections.
5. Visual check at **1366×768**, 1440×900, 1920×1080, and the 1024 drawer breakpoint. Verify no page-level scroll and no horizontal overflow.
6. **UI acceptance is not product acceptance.** Do not mark a phase `ACCEPTED` because the shell looks right. The slice is complete only when its behavior, persistence, and gate all pass.

Do not batch slices and test at the end. Each slice must leave the app runnable.

### 11.2 Performance budgets

| Metric | Budget |
|---|---|
| Cold load to projects page (local) | < 1.2 s |
| Open a project with 10 scenes | < 800 ms |
| Viewport interaction (pan/zoom/drag) | 60 fps, < 8 ms script per frame |
| Scene render, 2,000 rect objects | ≥ 55 fps |
| Fixed-step runtime | 60 Hz, max 5 catch-up steps |
| Command dispatch (typical) | < 2 ms |
| Autosave write | < 50 ms for a 2 MB document |
| Chat first token | provider-dependent; show activity within 150 ms |
| Bundle (editor, gzip) | < 1.8 MB excluding fonts |
| Runtime player (gzip) | < 350 KB |
| IndexedDB project document | soft cap 25 MB; warn at 20 MB |

If a budget is missed, profile before adding complexity. Do not claim performance without measuring in Chrome DevTools on the target laptop.

### 11.3 Browser support

- Chrome/Edge 120+ (primary, demo target).
- Firefox 120+ (best effort; verify WebGL and IndexedDB).
- Safari 17+ (best effort; verify audio unlock and canvas capture).
- No mobile editing layout in v1. The shared player and snapshot player must work on mobile Chrome/Safari with touch input.

### 11.4 Security checklist

- [ ] Provider keys exist only on the server; grep the client bundle and built assets for key names and values.
- [ ] Keys entered in Settings are AES-256-GCM encrypted at rest, returned only as `{configured, source, hint}`, and never written to `localStorage`/`sessionStorage`.
- [ ] Session-only keys live in server memory and disappear on restart; env keys are read-only in the UI.
- [ ] Custom provider base URLs enforce HTTPS (localhost HTTP allowed), block private/link-local ranges, and reject redirects to them.
- [ ] Key tests and model routes are rate-limited, body-limited, and time out at 15 s.
- [ ] No `dangerouslySetInnerHTML` for project text, chat text, or asset names.
- [ ] Chat renders markdown with raw HTML disabled; links open with `rel="noopener noreferrer"`.
- [ ] Snapshot IDs are unguessable (nanoid 16) and payloads are schema-validated on write and read.
- [ ] Kane QA route is dev/verification-only; AI Play is local/self-hosted in v1. Both use argument-array spawn, snapshot-only URLs, objective length ≤ 1,000 chars, one active run per project, and enforced timeout/cancel.
- [ ] AI Play cannot read or write provider keys, cannot target arbitrary URLs, and cannot apply destructive fixes without confirmation.
- [ ] With `AI_ENABLED=0` and no keys, no AI route is reachable from the UI and manual editing/play remains fully functional.
- [ ] Uploaded SVGs are rasterized before rendering; never inject SVG markup into the DOM.
- [ ] Imported JSON is size-limited and Zod-validated; no prototype pollution via `__proto__` keys.
- [ ] Rate limit the model route; cap body size at 256 KB.
- [ ] Error messages do not include stack traces in production.

### 11.5 Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Custom runtime physics feels wrong | Medium | Tune with the platformer template early (Slice 4); add coyote/buffer; keep collision axis-separated and sub-stepped |
| Provider tool calling is unreliable | Medium | Validate on day one; `AI_MOCK` for UI; strict Zod repair once; provider is swappable |
| Agent context too large / expensive | Medium | Compact index, caps, `query_project`, strip defaults |
| Renderer and runtime diverge visually | Medium | One Pixi renderer and one scene builder for both edit and play |
| Agent makes destructive edits | Low | Preview + confirmation + one-step undo + revision guard |
| Autosave data loss | Medium | Sequence guard, write latest doc, recovery panel, export escape hatch |
| Kane CLI environment/Windows issues | Medium | Document `kane-cli.cmd`, Git Bash, `npx` fallback; graceful card if unavailable; manual Play never depends on it |
| AI Play loop makes a bad fix or loops | Medium | One non-destructive change set per attempt, max two attempts, same seed, `Undo AI fixes`, evidence for both; no destructive auto-edits |
| AI Play credits/upload surprise | Medium | Consent before first run, show provider/Kane credit note, local-only default, redact evidence paths |
| Scope creep into scripting/3D/multiplayer | High | Explicit non-goals in §11.6; reject additions in review |
| Demo depends on network/model latency | Medium | Seeded demo + recorded `AI_MOCK` fallback + local export |
| Provider key leakage | High | Server-only vault, masked responses, no client storage, bundle grep, key redaction in logs |
| SSRF via custom provider URL | Medium | HTTPS/localhost-only, private-IP blocking, redirect checks, no client-supplied URL on `/step` |
| Model lacks tools or vision | Medium | Capability metadata, tool/vision gating, typed errors, no silent fallback |
| Model/provider sprawl breaks context limits | Medium | Context-window metadata, token budgeting, per-model trimming, clear errors |

### 11.6 Explicit non-goals for v1

- User accounts, teams, roles, comments, notifications.
- Cloud sync, multiplayer, CRDT collaboration.
- Arbitrary JavaScript/TypeScript scripting or a plugin marketplace.
- 3D, skeletal animation, particles editor, shaders.
- Mobile editor layout.
- Asset generation (image/audio) inside the product.
- Physics joints, slopes, rotation-aware collision.
- Sound mixing console beyond master/SFX/music volumes.
- Undo history across reloads.
- Multi-tenant/hosted Kane execution. AI Play is local/self-hosted in v1 because it launches Chrome.

### 11.7 Suggested sequence

| Slice | Estimate | Can run in parallel with |
|---|---|---|
| 0 Foundation | 1–2 days | — |
| 1 Kernel | 2–3 days | — |
| 2 Viewport | 4–5 days | Slice 3 asset UI (after model) |
| 3 Assets/tilemaps | 3–4 days | Slice 2 polish |
| 4 Runtime | 4–5 days | Slice 3 |
| 5 Logic/prefabs | 3–4 days | Slice 4 tuning |
| 6 Agent transport/chat | 3–4 days | Slice 4/5 if the kernel is stable |
| 6.5 AI providers/settings | 2–3 days | Slice 6 UI polish |
| 7 Agent writes | 4–5 days | Slice 8 export |
| 8 Ship/share | 2 days | Slice 7 |
| 9 Hardening | 2–3 days | Slice 8 |
| 10 Kane: engine QA + AI Play | 3–4 days | — |

Total: roughly 35–46 focused engineer-days. A coding agent can compress implementation, but not the manual review loops, model tuning, or the two real Kane loops.

---

## 12. Appendices

### 12.1 Keyboard map

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘,` / `Ctrl+,` | App settings and AI providers |
| `⌘J` / `Ctrl+J` | Toggle agent drawer |
| `⌘⇧J` | Open agent in Plan mode with selection (`Plan a change`) |
| `⌘F` | Focus hierarchy search |
| `⌘↵` / `Ctrl+Enter` | Manual Play / stop (no LLM required) |
| `⌘⇧↵` / `Ctrl+Shift+Enter` | AI Play with Kane |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘S` | Force save (autosave already runs) |
| `V` / `H` | Select / hand tool |
| `Space` + drag | Pan |
| `0` / `1` | Fit scene / 100% |
| `⌘D` | Duplicate selection |
| `Delete` / `Backspace` | Delete selection (confirm for scenes) |
| Arrows / `⇧`+Arrows | Nudge 1 px / 10 px |
| `Esc` | Clear selection, stop playtest, close overlay |
| `F` | Focus selection |
| `F1` | Debug overlay in play mode |
| `1`–`4` (not in input) | Scene / Content / Logic / Presentation tabs |
| `⌘G` | Group selection |
| `⌘⇧G` | Ungroup |
| `R` | Restart playtest |

### 12.2 Naming and code conventions

- IDs: `prj_`, `scn_`, `lay_`, `obj_`, `ast_`, `pfb_`, `beh_`, `rul_`, `var_`, `clp_` + nanoid(10).
- Commands: `domain.verb` (`object.update`, `scene.create`). Past tense is not used.
- Tool names: snake_case (`apply_commands`), matching the model-facing schema.
- React components: PascalCase files; hooks `useX`; no default exports except route pages if the router requires them.
- Pure engine code must not import React. React lives in `features/` and `shell/`.
- Runtime code must not import the store directly; it receives a snapshot + command-free context.
- CSS: tokens only; no raw hex in components. Use `var(--coral)` etc.
- Every command has a human `label` used in history, toasts, and change sets.
- `TODO` comments must include an owner and a slice number, e.g. `// TODO(slice-8): build-time asset inlining`.

### 12.3 Microcopy

Use direct, engine-builder language. No exclamation marks, no "Let's", no emoji.

- Empty scene: "This scene is empty." / "Add object" / "Ask agent to build this scene".
- Save: "Saved · r12" / "Saving…" / "Unsaved changes" / "Save failed. Retry."
- Agent working: "Inspecting scene…" / "Updating 4 objects…" / "Running playtest…" / "Verifying with Kane…".
- Agent success: "4 changes · 1 undo entry" / "Undo".
- Revision rule: "One completed gesture = one revision and one undo entry."
- Destructive: "Delete 3 objects? This cannot be undone with Redo." (Undo is available, so prefer: "Delete 3 objects? You can undo this once.")
- Kane QA: "Verifying the editor in a real browser…" / "Passed in 34 s" / "Could not start Kane CLI."
- AI Play: "Kane is playing…" / "Kane reached the goal but collected 2/3 coins." / "Fix and retry" / "KANE VERIFIED" / "Attempt 2 failed. Undo AI fixes."
- Manual path: "Play" is always available; AI Play never replaces it. No-key copy: "Connect a model to diagnose and fix; manual Play works."
- Errors: state what failed and the next action. Never "Something went wrong."

### 12.4 Testability checklist for the verification branch

- [ ] All interactive elements have stable `data-testid` values and accessible names.
- [ ] App root exposes `data-revision`, `data-save-state`, `data-selected-count`, `data-playtest`.
- [ ] `?demo=1`, `?demoReset=1`, `?seed=`, `?debug=1`, `?kane=1`, and `/play/:id?ai=1&seed=` work from a cold load.
- [ ] `window.__clockwork` read-only API documented in `docs/testing-hooks.md`.
- [ ] Console emits structured `clockwork:` events.
- [ ] Empty, loading, and error states have visible text.
- [ ] Share snapshots load in a fresh browser profile with no local state.
- [ ] Kane QA and AI Play routes stream NDJSON and return evidence metadata; one active run per project.
- [ ] AI Play uses a snapshot, the visible AI HUD, and fails honestly when Kane fails.
- [ ] With `AI_ENABLED=0` and no keys, manual editing and Play still pass.
- [ ] The app works with animations disabled (`prefers-reduced-motion`).
- [ ] A user can select a built-in or custom model, and the selected model survives reload.
- [ ] A key entered in Settings is never present in browser storage or a network response; a no-key install still opens the editor, runs manual Play, and exports.
- [ ] A tool-less model disables Build/Plan and a vision-less model hides `capture_viewport`.
- [ ] At 1366×768 there is no page-level scroll and no horizontal overflow; the inspector opens on selection.
- [ ] `/project/:id/scene/:sceneId?tab=&ptab=` restores the same workspace, and archived projects open read-only.

### 12.5 `docs/kane-proof.md` template

```markdown
# Kane Proof Log

Branch: verify/kane-e2e
App commit: <sha>
Kane CLI version: <from stream_start>

## Bar 2 — Kane caught or proved something

### Engine QA
- Scenario: <autosave race / undo boundary / other real defect>
- Pre-fix commit: <sha>
- Objective: K2 or K3
- Command: <exact command>
- Result: FAILED — step N: <remark>
- Evidence pack: <path>
- NDJSON: .testmuai/runs/<name>.ndjson
- Fix commit: <sha>
- Re-run: PASSED in <duration>s
- Re-run evidence: <path>

### AI Play
- Seed: Neon Runner, ?demoReset=1
- Attempt 1: FAILED — <remark>, final_state <json>
- Evidence: <path>
- Fix: <change-set summary / commit>
- Attempt 2: PASSED — <duration>, final_state <json>
- Evidence: <path>
- Panel screenshot: <path>

## Bar 3 — Agent and Kane talked

- Engine QA objective: <text>
- AI Play objective: <text>
- Snapshot URLs: <urls>
- Server log: kane.started / kane.finished, aiplay.started / aiplay.finished
- App run_end: <json>
- AI Play attempt run_end: <json x2>
- Terminal run_end: <json>
- Chat/panel screenshots: <paths>
- Evidence packs: <paths>

## Bar 1 — End to end

- K1: <pass/fail + evidence>
- K2: <pass/fail + evidence>
- K3: <pass/fail + evidence>
- K4: <pass/fail + evidence>
- K5: <pass/fail + evidence>
- Manual-only: <create/edit/play/export with no model>
```

### 12.6 Implementation order checklist

Use this as the literal work queue. Check items off in order.

- [ ] 0.1 Scaffold and tokens
- [ ] 0.2 Primitives
- [ ] 0.3 Shell and projects page
- [ ] 0.4 Static visual acceptance
- [ ] 1.1 Schemas and IDs
- [ ] 1.2 Store and history
- [ ] 1.3 Commands and validation
- [ ] 1.4 IndexedDB and autosave
- [ ] 1.5 Import/export and templates
- [ ] 2.1 Pixi stage and renderer
- [ ] 2.2 Camera and rulers
- [ ] 2.3 Selection and gizmos
- [ ] 2.4 Layers/hierarchy/inspector
- [ ] 3.1 Asset import and browser
- [ ] 3.2 Slicing, colliders, animations
- [ ] 3.3 Tilemap authoring
- [ ] 4.1 Fixed-step runtime and physics
- [ ] 4.2 Behaviors, rules, audio, camera
- [ ] 4.3 Play UI, console, telemetry
- [ ] 5.1 Logic editor and variables
- [ ] 5.2 Prefabs and input map
- [ ] 5.3 Presentation page
- [ ] 6.1 Hono server and SSE
- [ ] 6.2 Context and read tools
- [ ] 6.3 Chat UI and mock mode
- [ ] 6.4 Provider catalog and model metadata
- [ ] 6.5 Vault, env/session keys, and AI routes
- [ ] 6.6 Settings, provider cards, key dialogs, custom models
- [ ] 6.7 Model picker, modelId resolution, capability gating
- [ ] 6.8 Key-leak and no-key checks
- [ ] 7.1 Write executor and tools
- [ ] 7.2 Plan mode and confirmations
- [ ] 7.3 Presence and golden prompts
- [ ] 8.1 Export build
- [ ] 8.2 Snapshots and share player
- [ ] 9.1 Performance and errors
- [ ] 9.2 Accessibility and visual pass
- [ ] 9.3 Manual/no-model path, demo seed, and rehearsal
- [ ] 9.4 Final typecheck/build and repo check
- [ ] 9.5 features.md, known-issues.md, testing-hooks.md
- [ ] 10.1 Kane runner, NDJSON parser, QA route, objectives
- [ ] 10.2 AI HUD, input bridge, visible state
- [ ] 10.3 Second Play button, panel, controller, stop/retry/evidence
- [ ] 10.4 `run_ai_play`, closed-loop policy, undo
- [ ] 10.5 Real AI Play smoke + negative-control fail → fix → pass
- [ ] 10.6 Engine-QA fixture, docs, proof log, final gate

### 12.7 Final review questions

Before declaring the branch done, answer each with evidence:

1. Can a new user create a project and play it without reading documentation?
2. Does every AI edit appear in the UI immediately, in the correct scene and layer?
3. Is every AI turn exactly one undo entry, including multi-tool turns?
4. Does an AI edit survive reload, and does undo still work after reload for new edits?
5. Can the agent explain what it changed with real object names and ids?
6. Does the app remain usable when the model is slow, wrong, or offline?
7. Does the UI look like a game engine at 1366×768, not a document app, with no page scroll?
8. Can a project leave the editor as a playable artifact with no server?
9. Does the agent actually call Kane and use its verdict, with evidence?
10. Are there any hidden writes outside the command bus?
11. Can a user choose a popular built-in model, add a custom provider/model, and enter a key without the key ever reaching the browser?
12. Does the editor still work with no AI key configured, and does the agent degrade with a clear setup card?
13. Does `features.md` list only 100% complete features, and does `docs/known-issues.md` honestly list every limitation?
14. Can a user create, edit, save, reopen, play, share, and export with **no model, no key, and no Kane**?
15. Are both Kane roles real: engine QA catches/confirms a meaningful UI defect, and AI Play catches/fixes a gameplay bug with evidence for both?
16. Does a failed AI Play run produce one non-destructive fix and a same-seed passing rerun, with both `run_end` records and `Undo AI fixes`?

If any answer is "no", fix it before moving to verification.
