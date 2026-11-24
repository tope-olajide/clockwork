import assert from "node:assert/strict";
import test from "node:test";
import { streamKanePhase } from "../src/engine/ai/kane-api";
import type { KanePhaseRequest, KanePhaseResult } from "../shared/protocol/game-testing";

const input = {
  snapshotId: "snapshot-1",
  projectId: "project-one",
  phaseId: "fire",
  plan: { version: 1 },
} as unknown as KanePhaseRequest;

const result = { verdict: "inconclusive", checks: [] } as unknown as KanePhaseResult;

function eventStream(events: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

function resultStream(): Response {
  return eventStream([{ type: "phase_result", result }]);
}

/** The resume loop waits between attempts; make that wait observable but instant. */
function withoutResumeWait(fn: () => Promise<void>): Promise<void> {
  const original = globalThis.setTimeout;
  (globalThis as { setTimeout: unknown }).setTimeout = (callback: () => void) => {
    callback();
    return 0;
  };
  return fn().finally(() => {
    globalThis.setTimeout = original;
  });
}

test("streamKanePhase re-posts the approved request when a stream closes without a result", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      // A dropped proxy connection: the stream ends after a progress event,
      // before the server's typed phase result.
      return eventStream([{ type: "stream_start", runId: "run-1" }]);
    }
    return resultStream();
  }) as typeof fetch;

  try {
    let delivered: KanePhaseResult | null = null;
    await withoutResumeWait(async () => {
      delivered = await streamKanePhase(input, { onResult: (value) => { delivered = value; } });
    });
    assert.equal(calls, 2);
    assert.equal((delivered as KanePhaseResult | null)?.verdict, "inconclusive");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streamKanePhase treats 409 kane-busy as retryable and returns the eventual result", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: "A phase is already running.", code: "kane-busy" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    return resultStream();
  }) as typeof fetch;

  try {
    let delivered: KanePhaseResult | null = null;
    await withoutResumeWait(async () => {
      delivered = await streamKanePhase(input);
    });
    assert.equal(calls, 2);
    assert.equal((delivered as KanePhaseResult | null)?.verdict, "inconclusive");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
