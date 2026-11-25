# Chat agent ↔ Kane CLI integration plan

Status: **proposal for review — no runtime code changed**
Date: 2026-11-24
Owner: Clockwork project manager / engineering
Target: make the built-in chat agent use Kane CLI as an independent browser-verification tool, prove it with a real run, and produce a blog-ready analysis of the handshake.

---

## 1. Executive summary

Clockwork already has most of the hard infrastructure:

- The chat agent already receives `verify_with_kane`, `run_ai_play`, and `run_kane_test_phase` when the selected model supports tools.
- `verify_with_kane` already creates an immutable project snapshot and calls the real `/api/kane/qa` endpoint.
- The Hono/Node server already starts `kane-cli`, streams and parses its NDJSON, and requires a real `run_end` before returning `passed`.
- A real in-app `verify_with_kane` run is recorded in `docs/kane-proof.md` as K4: passed, 12 steps, 65.2 s, with an evidence link.
- AI Play and AI Testing already reuse the same runner, snapshot model, evidence storage, redaction, and browser route.

So this is **not** a greenfield Kane integration. The real gap is that the chat path is under-exposed and under-explained:

1. The system prompt never tells the agent that Kane tools exist or when to use them.
2. The chat UI has no visible **Test with Kane** action; the user has to know to ask in prose.
3. `verify_with_kane` gives no live progress and no working Stop/cancel path.
4. The tool advertises `sceneId` but the executor does not forward it.
5. There is no verification preference (`Manual` / `Ask` / `Automatic`).
6. There is no dedicated, reproducible proof artifact for the chat → Kane handshake.
7. The existing K4 proof is buried in a long evidence ledger and is not blog-ready.

Recommended scope: **connect and expose the existing path, harden it, prove it once with real Kane, then document the handshake.** Do not build a second testing architecture.

---

## 2. What exists today

### 2.1 The live path

```text
User message in chat
        │
        ▼
useAgentSession.runTurn()
  - builds project context
  - streams /api/ai/step
        │
        ▼
Model selects tool: verify_with_kane
        │
        ▼
executeAgentTool() in the browser
  - collectProjectAssets(document)
  - POST /api/snapshots          → immutable snapshot id
  - verifyWithKane(snapshotId, objective)
        │
        ▼
POST /api/kane/qa
  - validates Kane installed / authenticated / credits
  - loads the server-side snapshot
  - builds /s/<snapshotId>?ai=1&seed=1234
  - startKaneRun()
        │
        ▼
server/kane/runner.ts
  - spawns: kane-cli run "<objective>" --url ... --agent ...
  - parses NDJSON line by line
  - treats progress steps as progress, never as a verdict
  - accepts only a terminal run_end as a result
  - writes raw.ndjson, result.json and evidence.evidence
        │
        ▼
NDJSON response → client streamKane()
        │
        ▼
Tool result appended to the model conversation
        │
        ▼
Model explains the result; ToolActivity renders the Kane card
```

### 2.2 Responsibility split

| Layer | Responsibility | Existing file(s) |
|---|---|---|
| Chat agent | Understand the request, inspect/edit the project, choose a tool, explain the result | `server/ai/system-prompt.ts`, `src/features/agent/useAgentSession.ts` |
| Tool contract | Declare safe arguments; never expose a shell or arbitrary URL | `shared/ai-tools.ts` |
| Browser executor | Snapshot the live document; invoke the existing Kane API | `src/features/agent/useAgentSession.ts` |
| Kane API client | Parse NDJSON and require a terminal result | `src/engine/ai/kane-api.ts` |
| Server route | Auth/install/credit checks, snapshot lookup, target URL, stream lifecycle | `server/routes/kane.ts` |
| Runner | Spawn CLI, parse events, preserve evidence, never infer a pass from exit code alone | `server/kane/runner.ts` |
| Result UI | Show verdict, steps, duration, final state and evidence | `src/features/agent/chat/ToolActivity.tsx` |
| AI Play | One-off autonomous play through the visible AI HUD | `src/features/ai-play/*` |
| AI Testing | Reviewed, approved, bounded phases with input receipts and assertion joins | `src/features/ai-play/TestPlanPanel.tsx`, `server/kane/phase.ts` |

### 2.3 Existing proof already in the repository

`docs/kane-proof.md` already records the important handshake:

- **K4 — in-app `verify_with_kane`:** PASSED, 12 steps, 65.2 s.
- The agent was asked in Build chat to verify that the level loads and a coin can be collected.
- The chat card showed a passed verdict, summary, duration, and an evidence link.
- The agent's reply referenced the Kane verdict, final state and evidence.
- **K3a:** a separate real agent repair → play → win loop passed in one browser flow.
- **K5:** a real AI Play fail → deterministic fix → pass loop passed.

This means the PM's core requirement is already partly true. The plan should make that truth obvious, reliable and demonstrable rather than claiming it is new.

---

## 3. Gap analysis against the PM brief

| PM requirement | Current state | Plan |
|---|---|---|
| Chat agent can invoke Kane through its tool system | **Exists** (`verify_with_kane`, `run_ai_play`, `run_kane_test_phase`) | Keep; make discoverable and guided |
| Visible **Test with Kane** action | Missing | Add a chat-header action and inline test sheet |
| Agent offers testing after relevant changes | Missing | Add post-change offer + preference |
| Manual / Ask / Automatic preference | Missing | Add local setting, default **Ask** |
| Kane targets correct game/editor | Game snapshot works; editor target not exposed to chat | Game target in P0; editor target explicitly deferred |
| Real Kane execution, not a simulation | **Exists** and proven | Re-prove with current code and Meadow Run |
| Progress and final result visible in chat | Final card exists; live progress missing | Stream steps into the running card + Stop |
| Structured result the model can reason about | **Exists** (`AiPlayResult`) | Keep shape; add target/status metadata |
| Failure → diagnosis → bounded repair/retest | Agent can reason, but no enforced bound in chat path | Prompt policy + one retry maximum |
| Passing results based on real Kane execution | **Exists**; no run_end is already an error | Add tests that lock this invariant |
| AI Play and AI Testing continue / are reused | **Exists** | No duplicate runner; link to them from chat |
| Reusable regression tests | Existing approved-plan replay and saved `testmd` path | Surface a regression action; do not invent a new format |
| No shell / no arbitrary URL to model | **Exists** | Keep and test |
| No mock Kane | Existing runner is real; fake runner only in tests | Keep fixture-only test boundary |

---

## 4. Recommended scope

### P0 — required for the hackathon proof

1. **Teach the agent when to use Kane.**
   - Extend `server/ai/system-prompt.ts` to list the Kane tools in Ask/Build/Plan.
   - State the policy:
     - gameplay/runtime/input/collision/UI changes may need browser verification;
     - pure naming/description/colour-only edits usually do not;
     - use `verify_with_kane` for a one-off check;
     - use `run_ai_play` when Kane must play to an outcome;
     - use `run_kane_test_phase` only with an approved plan;
     - never say “verified” unless the tool result says `passed`;
     - never alter the objective to manufacture a pass;
     - after a real failure, diagnose the evidence and retry at most once.
   - Add the current Kane readiness and preference to the context packet so the agent does not call a tool that cannot run.

2. **Add a visible “Test with Kane” entry point to chat.**
   - Header button: `Test with Kane` (`data-testid="agent-kane-test"`).
   - Opens an inline sheet above the composer, not a separate testing app.
   - Default objective is generated from the current project/scene, for example:
     > Open the current scene in Play, verify it loads without runtime errors, and verify the player moves when the game is played.
   - User can edit the objective before running.
   - Two actions:
     - **Ask agent to verify** — sends a structured user message so the agent chooses `verify_with_kane`.
     - **Prepare with agent** — if the objective is ambiguous, the agent asks for the missing expected behaviour instead of guessing.
   - Disabled with an actionable reason if Kane is missing, signed out, out of credits, or the model has no tool support.

3. **Stream progress and support cancellation.**
   - `verifyWithKane` and `streamAiPlay` already accept `onEvent`; wire them through `executeAgentTool` into the running `AgentToolCard`.
   - Card shows the latest Kane step, step count, elapsed time, and a **Stop** action.
   - Capture `runId` from `stream_start`; on Stop, call the existing cancel endpoint for that run.
   - If the user stops before `runId` exists, mark the card `canceled` and do not invent a verdict.
   - Preserve the existing rule: no `run_end`, no pass.

4. **Fix the small contract defects.**
   - Forward `sceneId` from `verify_with_kane` into the objective/request, or remove it from the schema so the model is not misled.
   - Add a project-level concurrency guard for `/api/kane/qa` so a chat verification cannot collide with AI Play for the same project.
   - Return a clear `kane-busy` 409 with the active run id.
   - Add a generic `POST /api/kane/runs/:runId/cancel` alias, reusing the existing `activeRuns` map, so chat does not depend on an AI-Play-named endpoint.

5. **Add the post-change offer.**
   - After a successful `apply_commands` that affects runtime/gameplay, append a small action to the assistant message:
     - “Double-jump has been implemented. Verify it with Kane?”
   - Default behaviour is **offer**, not auto-run.
   - If the change is clearly non-behavioural (rename, description, colour only), the agent should say why browser verification is unnecessary.
   - The action sends the same structured test request; it is not a second execution path.

6. **Prove it once with real Kane and publish the proof.**
   - Create a reproducible proof script that drives the real chat UI, triggers the chat tool, and records:
     - user prompt;
     - tool name and arguments;
     - snapshot id;
     - Kane run id;
     - verdict;
     - step count and duration;
     - final state;
     - evidence URL;
     - the agent's final explanation.
   - Write `docs/chat-kane-proof.md` (or extend `docs/kane-proof.md` with a clearly linked section).
   - Store raw NDJSON and `result.json` under `.data/ai-play/<runId>/`; the evidence pack stays downloadable through the existing endpoint.
   - Do not call it passed unless the raw `run_end` says passed.

### P1 — recommended for a complete product story

7. **Verification preference.**
   - Three values stored per browser:
     - `manual` — only run when asked;
     - `ask` — after relevant changes, offer a button (default);
     - `auto` — run one bounded verification immediately after a relevant successful change.
   - Surface in the chat header or the existing Settings → AI Models section, not a new settings page.
   - Include the value in the context packet.
   - In `auto`, enforce a hard limit of one run per change set and never retry without a new user message.
   - A separate explicit **Test with Kane** click always overrides `manual`.

8. **Route to existing capabilities instead of duplicating them.**
   - One-off check → `verify_with_kane`.
   - “Play this game and tell me if it wins” → `run_ai_play`.
   - Substantial mechanic or repeatable regression → existing `propose_test_plan` + approval + `run_kane_test_phase`.
   - Saved `_test.md` replay → existing `run_kane_test_phase({ replayTestKey })`.
   - The chat UI can recommend the right route, but must not create a fourth test format.

### P2 — explicitly deferred

9. **Editor-target verification from chat.**
   - Current chat Kane runs target the immutable snapshot player. The Clockwork editor is already tested by the separate saved engine E2E harness (`.testmuai/tests/engine-template-e2e_test.md`).
   - Exposing the editor to the chat tool would let a model drive the live app while it is editing, create session conflicts, and duplicate the developer QA harness.
   - Recommendation: document the editor harness as the editor target and keep the chat tool focused on the game. Revisit only if the hackathon judging explicitly requires chat-triggered editor tests.

---

## 5. Proposed implementation details

### 5.1 Tool contract

Keep the existing tool names for compatibility. Add only what is needed.

```ts
verify_with_kane({
  objective: string,        // required, <= 1000 chars
  sceneId?: string,         // forwarded, validated against the open project
})
```

Do **not** add:

- `url`
- `command`
- `args`
- `env`
- arbitrary shell strings
- a path to a test file

The server still builds the URL and CLI args. The model never sees credentials, base URLs, or local evidence paths.

Recommended result additions:

```ts
{
  target: "game-snapshot",
  status: "passed" | "failed" | "cancelled" | "error",
  runId,
  snapshotId,
  objective,
  summary,
  finalState,
  steps,
  runtimeErrors,
  durationMs,
  evidenceUrl?,
  testUrl?
}
```

`status` must come from `run_end` (or the saved-test `test_md_done` synthesis), never from an exit code alone.

### 5.2 Chat state

Add to `useAgentSession`:

- `kaneStatus` (reuse `fetchKaneStatus`).
- `verificationPreference` (`manual` / `ask` / `auto`).
- `kaneTestSheetOpen`.
- `kaneProgress` keyed by tool-card id.
- `kaneRunId` while a run is active.

Add to `AgentToolCard`:

```ts
progress?: {
  message: string;
  step?: number;
  runId?: string;
  startedAt: number;
};
```

Update `ToolActivity` to render that progress and a Stop button. Keep the existing full result card after completion.

### 5.3 Server

- Reuse `startKaneRun`, `parseNdjsonLine`, `toResult`, `activeRuns`.
- Add `activeByProject` lookup to `/qa`; key by `qa:<projectId>` so a QA run and an AI Play run cannot both occupy the same project without an explicit conflict response.
- Add `POST /api/kane/runs/:runId/cancel` as an alias for the existing cancel logic.
- Validate `sceneId` against the snapshot document before building the objective; an unknown scene is a 400.
- Keep `X-Kane-Run`; the client needs it for cancellation and evidence.
- Keep evidence redaction on every user-visible result.

### 5.4 Prompt and context

Add an optional `kane` block to `ContextPacket`:

```ts
kane?: {
  installed: boolean;
  authenticated: boolean;
  credits?: number;
  preference: "manual" | "ask" | "auto";
  reason?: string;
}
```

Add to the system prompt, not the tool description alone. The tool description is seen only when the model is choosing tools; the prompt is what makes the behaviour reliable.

Suggested policy text:

> When a change affects gameplay, input, physics, collision, scene interaction, HUD or completion, a browser check may be appropriate. Use `verify_with_kane` for a one-off independent check. Use `run_ai_play` when Kane must play to a win/loss outcome. Use `run_kane_test_phase` only after the user has approved a plan. A Kane result is evidence only when the tool returns `status: "passed"` with a terminal verdict. If it fails, use the returned evidence and observations to diagnose; repair at most once and retest once. Do not rewrite the objective to make a failure pass.

### 5.5 UI placement

```text
┌─ Clockwork Agent ────────────────────────────────┐
│ [model] [Test with Kane] [history] [new] [close] │
├──────────────────────────────────────────────────┤
│ conversation                                     │
│                                                  │
│  ┌ Test with Kane ────────────────────────────┐  │
│  │ Objective: [............................]  │  │
│  │ [Ask agent to verify]  [Cancel]           │  │
│  └────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────┤
│ composer                                         │
└──────────────────────────────────────────────────┘
```

The sheet is intentionally inside the chat. There is no separate “Kane console”.

### 5.6 Progress card

```text
KANE · working
Step 4 · Clicking “MOVE RIGHT” on the snapshot player
00:38                         [Stop]
```

On completion:

```text
PASSED · ENGINE QA · 8 steps · 42.1s
Objective: Verify the level loads and the player can move.
STATUS: PLAYING · COINS: 1 · LAST ERROR: none
[Open evidence]
```

On failure or infrastructure error, use `FAILED` / `CANCELLED` / `ERROR` and show the reason. Never show `PASSED` without a terminal event.

---

## 6. Verification strategy

### 6.1 Automated tests

Add or extend tests for:

1. **Tool gating**
   - Kane tools are absent when `allowKane` is false.
   - Read/build/plan tools are unchanged.

2. **Argument safety**
   - `verify_with_kane` forwards only `objective`, `sceneId`, `snapshotId`, `seed`.
   - A `url`, `command`, `path`, or unknown key is rejected or ignored, never executed.
   - Objective length is bounded.

3. **No false pass**
   - `toResult` with no `run_end` is `error`, not `passed`.
   - A failed `run_end` is `failed`, not `passed`.
   - A cancelled run is `cancelled`.
   - A 0 exit code after a crash is still `error`.

4. **Cancel**
   - A `stream_start` run id is captured.
   - Stop calls the cancel endpoint with that id.
   - The card ends `canceled`, not `passed`.

5. **Concurrency**
   - A second `/qa` for the same project returns 409 `kane-busy`.
   - AI Play and QA cannot both run for one project.
   - The lock is released after success, error or cancellation.

6. **Preference**
   - Default is `ask`.
   - `manual` never auto-offers.
   - `auto` runs at most once per successful change set.
   - A failed run does not auto-retry indefinitely.

7. **Fixture stream**
   - Reuse `scripts/kane/fake-kane.mjs` for the above; no test ever needs real credits.

### 6.2 Real proof run

Environment confirmed:

| Item | Value |
|---|---|
| Kane CLI | 0.10.6 |
| Auth | authenticated as `davidtheatomicshift` |
| Credits | 6,799.5232 available |
| Clockwork origin | local Vite server, normally `http://localhost:5173` |
| Browser | local Chrome via Kane |

Recommended proof sequence:

1. Start Clockwork and a tool-capable model.
2. Create or open **Clockwork Meadows** (already a full starter with 168 objects).
3. Open the chat and click **Test with Kane**.
4. Use an objective that is visible and bounded:
   > Open the current scene in Play. Verify the game canvas and HUD are visible, click the stage to move right, and verify the player leaves the start position without a runtime error.
5. Ask the agent to verify.
6. Record:
   - the tool call card going from `working` to `PASSED`;
   - at least one live progress step;
   - the run id;
   - duration;
   - final state;
   - evidence link;
   - the agent's explanation.
7. Verify the server artifacts exist in `.data/ai-play/<runId>/`:
   - `raw.ndjson` contains a terminal `run_end`;
   - `result.json` says `"status": "passed"`;
   - `evidence.evidence` exists and downloads.
8. Write `docs/chat-kane-proof.md` with the exact command, environment, run id, objective, result and limitations.

**Negative control:** run one deliberately unsatisfiable objective (for example, assert a nonexistent HUD value or an impossible win state) and confirm the UI shows FAILED/INCONCLUSIVE, never PASSED. This is the proof that the integration is not a rubber stamp. Budget one extra run.

**Cost control:** one happy-path run and at most one negative-control run. Do not run an unbounded suite. Existing runs range roughly from 15 to 80 credits; budget accordingly.

### 6.3 Proof evidence hierarchy

For the blog and submission, present evidence in this order:

1. **Code path** — exact files and functions.
2. **Unit/fixture tests** — no false pass, cancellation, concurrency, argument safety.
3. **App-level CDP test** — a real chat message produces a real tool card.
4. **Real Kane run** — terminal `run_end`, final state, duration, run id.
5. **Evidence pack** — downloadable `.evidence` plus `raw.ndjson`.
6. **Agent explanation** — what the model concluded from the structured result.

This makes the claim much stronger than “I clicked a button and it worked”.

---

## 7. Blog-ready explanation of how the two systems communicate

This section is the analysis to expand after implementation.

### 7.1 The handshake in one paragraph

Clockwork does not let the model run shell commands. The model chooses a typed tool, `verify_with_kane`, whose arguments are only an objective and an optional scene. The browser-side agent executor snapshots the current project, uploads it to the local server, and calls the existing Kane route with the snapshot id. The Hono server verifies the snapshot, builds the browser URL and CLI arguments, and starts `kane-cli` in agent mode. Kane emits NDJSON progress; the runner parses it and treats only a terminal `run_end` as a verdict. The typed result returns to the model as a tool message. The model explains the result; the UI renders the verdict and evidence. The model's implementation claim and Kane's independent browser verdict remain separate facts.

### 7.2 Why the separation matters

- The model can edit the project but cannot certify its own edit.
- The server owns the CLI invocation, URL construction, authentication and evidence paths.
- Kane owns the browser actions and the final `run_end`.
- Clockwork judges the terminal result, not an exit code or a progress message.
- A failed run remains failed; a missing run_end becomes an error, not a pass.

### 7.3 Three levels of verification

| Method | What it proves | What it does not prove |
|---|---|---|
| `start_playtest` | Seeded engine simulation, no browser | Not Kane evidence; not real browser rendering |
| `verify_with_kane` | One real browser run of a bounded objective | Not full regression coverage; not every mechanic |
| AI Testing phase | Approved plan, input receipts, typed observations, strict assertion join | Only approved assertions; not arbitrary gameplay quality |

This is the honest answer to “did the feature work?”: use the right level for the claim.

### 7.4 Limitations to state in the blog

- Kane reads the rendered canvas and DOM, not semantic game state directly. Clockwork exposes structured HUD/test hooks where available.
- A real browser run costs time and credits; caching and saved-test replay matter.
- An LLM may choose not to call the tool; the visible button and system prompt are part of the product, not just UX.
- A passing objective is evidence for that objective, not a proof of the whole game.
- The current chat target is the immutable game snapshot, not the live editor.
- Real LLM turns can be non-deterministic; the tool result and evidence are deterministic evidence, but the agent's prose is not.

---

## 8. Files expected to change

### Chat / client

- `server/ai/system-prompt.ts` — Kane tool policy.
- `shared/protocol.ts` — optional `kane` context block.
- `src/features/agent/useAgentSession.ts` — status, preference, progress, cancel, scene forwarding, post-change offer.
- `src/features/agent/AgentDrawer.tsx` — Test with Kane action and inline sheet.
- `src/features/agent/chat/ToolActivity.tsx` — live progress, Stop, richer result card.
- `src/features/agent/chat/ChatComposer.tsx` — optional preference/action placement.
- `src/features/agent/kane-tool-args.ts` — validate/normalize tool args.
- `src/engine/ai/kane-api.ts` — pass handlers/signal and expose cancel.
- `src/design/base.css` — sheet, progress and card styles.

### Server

- `server/routes/kane.ts` — concurrency guard, generic cancel alias, scene validation.
- `server/kane/runner.ts` — only if result metadata or cancel semantics need a small extension.
- `shared/ai-tools.ts` — tighten descriptions and result expectations; no new shell surface.

### Tests / docs

- `tests/kane-tool-args.test.ts`
- `tests/kane-runner.test.ts`
- `tests/agent-kane.test.ts` (new)
- `tests/kane-concurrency.test.ts` (new)
- `docs/chat-kane-integration-plan.md` (this file)
- `docs/chat-kane-proof.md` (new, after the real run)
- `docs/ai-play.md` / `docs/kane-proof.md` — cross-link the chat proof and the proof hierarchy.

No changes to AI Play or AI Testing behaviour are required. No second runner, no new test-file format, no direct shell tool.

---

## 9. Acceptance criteria mapping

| # | Acceptance criterion | How this plan satisfies it |
|---|---|---|
| 1 | Chat agent can invoke Kane through tools | Existing tools + prompt guidance + tests |
| 2 | User can request testing from chat | Header **Test with Kane** action |
| 3 | Agent offers testing after relevant work | Post-change offer; default Ask preference |
| 4 | Kane targets the correct game/editor | Game snapshot validated by id; editor target explicitly deferred to existing harness |
| 5 | Real Kane CLI execution | Existing runner; real proof run required |
| 6 | Progress and final results visible | Live steps, Stop, verdict card |
| 7 | Agent receives structured results | Typed `AiPlayResult` tool message |
| 8 | Failure → diagnosis → bounded repair/retest | Prompt policy, one retry maximum, evidence-driven |
| 9 | Passes based on actual Kane execution | `run_end` requirement + negative control |
| 10 | AI Play / AI Testing still work | Reuse only; regression tests |
| 11 | Reusable regression tests | Existing approved-plan replay / `testmd` path, surfaced as an option |
| 12 | No parallel testing system | One runner, one snapshot store, one evidence path |

---

## 10. Risks and decisions needed

| Risk | Mitigation |
|---|---|
| The model ignores the new tool | Visible button + system prompt + post-change offer |
| Run costs credits / takes minutes | One bounded proof run; progress and cancel; saved-test replay later |
| Chat verification conflicts with AI Play | Project-level server lock + 409 |
| Context grows too large | Add only a small `kane` status block; keep result step slice |
| False pass | Keep `run_end` gate; fixture negative tests; real negative control |
| Model “fixes” a test by changing the objective | Prompt rule + unchanged objective stored in the result + code review |
| Editor target is expected by judges | Document the existing saved engine E2E as the editor path; add P2 only if required |

### Decision requested from the PM

1. Is **game-snapshot verification** enough for the hackathon demo, with editor verification left to the existing developer E2E harness?
2. Is the **Test with Kane** action expected to always invoke the agent (and therefore require a configured model), or should there also be a pre-written objective that can run without an LLM?
3. Should the first proof use **Clockwork Meadows** (current large starter) or a smaller deterministic starter to reduce runtime and cost?

Recommended answers: game snapshot yes; agent-driven with a deterministic default objective; use Clockwork Meadows for the demo story, but keep the objective short and bounded.

---

## 11. What will not be built

- No mock Kane interface presented as real.
- No arbitrary shell execution exposed to the model.
- No duplicate Kane bridge.
- No replacement for AI Play or AI Testing.
- No artificial gameplay powers for Kane.
- No “passed” verdict from a missing `run_end` or a process exit code.
- No silent objective changes to turn a failure into a pass.
- No full editor-control surface for the chat agent in this scope.

---

## 12. Recommended next step

Approve P0. Implement it as one vertical slice:

**prompt/context → visible Test with Kane → live progress/cancel → tests → one real Kane proof → blog-ready analysis.**

That is the smallest change that makes the PM's requirement demonstrably true, while preserving the existing AI Play and AI Testing architecture.
