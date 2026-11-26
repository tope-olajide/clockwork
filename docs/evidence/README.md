# Kane evidence bundle

Sanitized, committable summaries of the Kane CLI runs that back the claims in
[`../kane-proof.md`](../kane-proof.md), [`../demo-readiness-evidence.md`](../demo-readiness-evidence.md)
and [`../known-issues.md`](../known-issues.md). Each file is a few hundred bytes
so the whole bundle stays reviewable in a clone.

## Why this is an extract, not the raw artifacts

A real Kane run writes an NDJSON stream (tens of KB) and an `.evidence` pack
(megabytes of screenshots). Those are gitignored under `.testmuai/` because they
are large and contain machine-specific absolute paths. The files here are
generated from them by [`scripts/kane/export-evidence.mjs`](../../scripts/kane/export-evidence.mjs),
which keeps the verdict, summary, final state, step counts, duration, run id and
CLI version, and drops:

- absolute paths (`C:\Users\…` → `<repo>/` or `<home>/`)
- e-mail addresses (→ `<email>`)
- external test-manager dashboard links
- evidence/artifact paths and any credit, balance or key fields

Regenerate after new runs with:

```bash
node scripts/kane/export-evidence.mjs
```

## Index

| Claim in the docs | File | Verdict | Runner duration | Session |
|---|---|---|---|---|
| Saved engine E2E replays 1/1 steps | `runs/engine-template-e2e.json` | passed | 164 s | `55efd401…` |
| K1 editor smoke: menus, inspector, hierarchy, asset import | `runs/k1-editor-smoke.json` | passed | wall clock 366 s | `—` |
| K2 agent change: double jump applied, tested, undone | `runs/k2-agent-double-jump.json` | passed | wall clock 463 s | `bded0577…` |
| K3a real-model tool call repairs the unreachable coin | `runs/k3a.json` | passed | wall clock 340 s | `—` |
| K3b undo/redo of an agent-authored move | `runs/k3b-undo-redo.json` | passed | wall clock 280 s | `—` |
| K4 terminal objective verifies a real browser run | `runs/k4-terminal2.json` | passed | wall clock 257 s | `—` |
| K5 AI Play reaches `WON` with 3 coins | `runs/k5-attempt2.json` | passed | 115 s | `89c07452…` |
| A bad objective is rejected (negative control) | `runs/negative-control-attempt1.json` | failed, as designed | wall clock 62 s | `—` |
| The same scene passes once the defect is fixed | `runs/negative-control-attempt2.json` | passed | wall clock 62 s | `—` |
| Space Shooter loss → `R` restart returns to `PLAYING` | `runs/space-shooter-restart.json` | passed | wall clock 477 s | `e866a518…` |

`durationSeconds` is the runner's own figure and matches the number quoted in
the docs. `wallClockSeconds` spans the whole NDJSON stream, so it includes CLI
startup and is larger; some older objectives do not emit a runner duration.

All runs used Kane CLI **0.10.6** (each file records `cliVersion`) against the
local dev server at `http://localhost:5173`.

## What is deliberately absent

- **No Space Invaders run is offered as a pass.** Its HUD readouts were never
  consistent in a single run, which is exactly what `known-issues.md` says, so
  no artifact is presented as proof of a clean pass.
- **Old exploratory attempts are not exported.** Only runs cited by the docs
  appear here; the untracked run directory keeps the rest.
- **No raw `.evidence` packs.** They are 1–8 MB each; the summary files carry
  the verdict and state they were extracted from.
