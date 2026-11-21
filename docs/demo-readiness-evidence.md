# Demo readiness evidence

Tracked, portable record of the live Kane runs behind `docs/demo-readiness.md`.
Paths are repo-relative; no local absolute paths. Raw run artifacts live under
`.data/ai-play/<runId>/` (gitignored); the typed results below are the reviewable
record.

## Phase 3 — first live pass through the agent

- **Date:** 2026-11-21
- **Kane CLI:** 0.10.6, authenticated
- **Planner model:** `deepseek-v4.1-flash (env)`, tool-capable
- **Project:** Space Shooter Demo (`prj_FQTuy0lXEs`), revision 0, scene `scn_0_daOQj5sE`, seed 1234, no scenario
- **User goal:** “An accepted SHOOT hold is visible in the accepted-input counter, increments shots fired and creates a projectile, without claiming a hit.”
- **Phase:** `shoot-hold-creates-projectile` — toggle SHOOT on, type 45, STEP once, toggle SHOOT off, store all four values in one read, end immediately
- **Budget:** 1 phase, 8 steps, 240 s wall, 45 frames/advance, 180 frames/phase
- **Approval:** local user, before the run; the run went through `run_kane_test_phase`, not the panel button

### Result

- **Run id:** `b967bbdd-0eec-4899-9190-77adfeb9a78e`
- **Snapshot id:** `cXfuwKVo5LENlQ`
- **Kane status:** `passed` (`run_end.status: passed`)
- **Phase verdict:** `passed`, `failureKind: none`
- **Reason:** “Kane passed and every approved assertion matched the observed values.”
- **Accepted inputs:** 1
- **Frames advanced:** 45
- **Assertions:**
  - `shots-fired-increased`: expected increase ≥ 1, actual `3` → passed
  - `projectiles-increased`: expected increase ≥ 1, actual `3` → passed
- **Runtime errors:** none
- **Duration:** 79.7 s
- **Credits consumed:** ≈ 25.03
- **Evidence:** `/api/kane/runs/b967bbdd-0eec-4899-9190-77adfeb9a78e/evidence`
- **Test Manager:** `https://test-manager.lambdatest.com/projects/01M7MPYYBFW18QG18M67X700CD/test-cases/01M7YP572T046EZPZAACGJTTR7/dashboard/share/US_ACIW3XQEOIN7GLU438RIYWFPLYNU1PG01PQZ0PLT5ZRNJU64A94KK9QCO8UTBM5I?type=summary&agentView=true&fqdn=summary-page`
- **Agent follow-up:** the same conversation cites the verdict, accepted inputs, frames, both assertion values, run id and evidence URL against the original goal, clause by clause. No pass was claimed before the typed result arrived.

### What the earlier attempts proved (honest record)

| Run id | Outcome | What it taught |
|---|---|---|
| `843dbf78-…` | INCONCLUSIVE, timeout (66 s on a 60 s budget) | Wall budget must cover Kane startup, not just gameplay frames. |
| `60843afe-…` | INCONCLUSIVE, timeout (146 s on a 140 s budget) | Navigation succeeded; the first large advance stalled. |
| `cf2518a2-…` | `failed` (config): Test Mode showed UNAVAILABLE | First-paint bug: assigning the TestController ref never re-rendered the HUD. Fixed in `SnapshotPlayerPage`. |
| `52e57ca7-…` | `failed` (step budget): repeated frame entry, 8/6 steps | 6 steps are too few once Kane retypes frame values. |
| `c9545273-…` | `failed` (automation): SHOOT click landed on STEP 10 | The profile-control row and frame-advance row overlapped at the same bottom offset. Fixed in `TestModeHud` + `base.css`. |
| `d1f11f0c-…` | INCONCLUSIVE, timeout (146 s) | All gameplay steps done, but `run_end` never arrived: the 140 s ceiling killed finalization. Ceiling raised to 300 s; objective now says end immediately with no wait steps. |
| `498a5567-…` | INCONCLUSIVE, timeout (146 s) | Compact 5-step sequence completed through the observation read, then killed during finalization. Confirmed the fix needed is time-to-finish, not fewer frames. |
| `b967bbdd-…` | **PASSED** | 5-step compact sequence, 240 s budget, 79.7 s actual. |

Total live-run spend for Phase 3, including diagnosis: 8 paid Kane runs.
