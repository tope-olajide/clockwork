import { startKaneRun } from "../../server/kane/runner";
import type { KaneEvent } from "../../shared/protocol/kane";

const run = startKaneRun({
  objective: "Collect all coins and reach the relay",
  url: "http://localhost:5173/s/fixture?ai=1&seed=1234",
  attempt: 1,
  evidenceRoot: ".data/fixture",
});
for await (const event of run.events) {
  const typed = event as KaneEvent;
  if (typed.type === "step") console.log(`step ${typed.step} ${typed.status}: ${typed.remark}`);
  else if (typed.type === "run_end") console.log(`run_end ${typed.result.status}: ${typed.result.summary} evidence=${typed.result.evidencePath ?? "none"}`);
  else if (typed.type === "error") console.log(`error ${typed.code}: ${typed.message}`);
  else console.log(typed.type);
}
