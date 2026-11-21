import type { KanePhaseResult } from "../../shared/protocol/game-testing";

export type PhaseStart =
  | { ok: true }
  | { ok: false; reason: "running" | "budget"; completed: number };

/**
 * In-process phase session state. The key includes the project, session id and
 * plan fingerprint, so only an identical approved plan replays a stored phase
 * result. State does not survive a server restart (documented limitation).
 */
export class PhaseSessionStore {
  private readonly results = new Map<string, Map<string, KanePhaseResult>>();
  private readonly running = new Set<string>();

  getResult(key: string, phaseId: string): KanePhaseResult | undefined {
    return this.results.get(key)?.get(phaseId);
  }

  completedCount(key: string): number {
    return this.results.get(key)?.size ?? 0;
  }

  isRunning(key: string): boolean {
    return this.running.has(key);
  }

  start(key: string, maxPhases: number): PhaseStart {
    if (this.running.has(key)) return { ok: false, reason: "running", completed: this.completedCount(key) };
    const completed = this.completedCount(key);
    if (completed >= maxPhases) return { ok: false, reason: "budget", completed };
    this.running.add(key);
    return { ok: true };
  }

  finish(key: string, result: KanePhaseResult): void {
    const bucket = this.results.get(key) ?? new Map<string, KanePhaseResult>();
    bucket.set(result.phaseId, result);
    this.results.set(key, bucket);
    this.running.delete(key);
  }

  abandon(key: string): void {
    this.running.delete(key);
  }

  /** Test-only escape hatch; production state is bounded by the snapshot TTL. */
  clear(): void {
    this.results.clear();
    this.running.clear();
  }
}
