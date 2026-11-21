import assert from "node:assert/strict";
import test from "node:test";
import { kaneCreditsExhausted, parseKaneCreditBalance } from "../server/kane/credits";

test("parses a Kane credit balance", () => {
  assert.equal(parseKaneCreditBalance("Available credits: 7815.6558"), 7815.6558);
  assert.equal(parseKaneCreditBalance("Available credits: 1,250"), 1250);
  assert.equal(parseKaneCreditBalance("Available credits: 0"), 0);
});

test("does not invent a balance from unrelated output", () => {
  assert.equal(parseKaneCreditBalance("Update available: 0.10.6 -> 0.10.7"), undefined);
  assert.equal(parseKaneCreditBalance("Available credits: n/a"), undefined);
});

test("classifies zero and negative balances as exhausted", () => {
  assert.equal(kaneCreditsExhausted(0), true);
  assert.equal(kaneCreditsExhausted(-1), true);
  assert.equal(kaneCreditsExhausted(0.01), false);
  assert.equal(kaneCreditsExhausted(undefined), false);
});
