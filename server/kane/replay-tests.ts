import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export interface ReplayTestEntry {
  /** Stable key the client sends as `replayTestKey`. */
  key: string;
  /** Repo-relative `_test.md` file holding the steps and recordings. */
  testFile: string;
  /** The only phase id this recording may replay. Anything else needs a fresh authored run. */
  phaseId: string;
  label: string;
}

const KEY_TEXT = /^[a-z0-9-]{1,64}$/;

/**
 * Recorded phase replays. A replay is allowed only for the phase id it was
 * recorded for: the steps encode that phase's controls, reads and assertions.
 * A changed objective, changed assertions, or a different phase needs a fresh
 * authored run, which can then be saved as a new registry entry.
 */
export const PHASE_REPLAY_TESTS: ReplayTestEntry[] = [
  {
    key: "space-shooter-fire",
    testFile: join("scripts", "kane", "tests", "phases", "space-shooter-fire_test.md"),
    phaseId: "fire-creates-projectile",
    label: "Space Shooter: hold SHOOT, advance frames, read shots and projectiles",
  },
];

/**
 * Resolves a client-supplied replay key to an absolute `_test.md` path.
 * The path always comes from this registry, never from the request, so a
 * caller cannot point the runner at an arbitrary file.
 */
export function resolveReplayTest(key: unknown):
  | { ok: true; entry: ReplayTestEntry; file: string }
  | { ok: false; error: string } {
  if (typeof key !== "string" || !KEY_TEXT.test(key)) {
    return { ok: false, error: "Unknown replay test. Ask for the recorded replay list before retrying." };
  }
  const entry = PHASE_REPLAY_TESTS.find((candidate) => candidate.key === key);
  if (!entry) {
    return { ok: false, error: `No recorded replay for key \"${key}\". Run the authored phase first, then save it as a replay.` };
  }
  const root = resolve(process.cwd());
  const file = resolve(root, entry.testFile);
  if (file !== root && !file.startsWith(root + sep)) {
    return { ok: false, error: `Recorded replay \"${key}\" points outside the project.` };
  }
  if (!entry.testFile.endsWith("_test.md") || !file.endsWith("_test.md")) {
    return { ok: false, error: `Recorded replay \"${key}\" is not a _test.md file.` };
  }
  let size = -1;
  try {
    const stat = statSync(file);
    size = stat.isFile() ? stat.size : -1;
  } catch {
    size = -1;
  }
  if (size < 0 || !existsSync(file)) {
    return { ok: false, error: `Recorded replay \"${key}\" has not been authored yet. Run the phase without a replay key first so the recording exists.` };
  }
  return { ok: true, entry, file };
}

/** The replay list the panel shows; absolute paths stay server-side. */
export function listReplayTests(): Array<Pick<ReplayTestEntry, "key" | "phaseId" | "label">> {
  return PHASE_REPLAY_TESTS.map(({ key, phaseId, label }) => ({ key, phaseId, label }));
}
