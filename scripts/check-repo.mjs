import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function requireFile(path) {
  if (!existsSync(join(root, path))) failures.push(`missing ${path}`);
}

function fail(message) {
  failures.push(message);
}

if (existsSync(join(root, "reference"))) fail("reference/ must not be in the final tree");
for (const file of readdirSync(root).filter((name) => name.endsWith(".md"))) {
  if (file !== "README.md" && file !== "features.md") fail(`stray root Markdown: ${file}`);
}
for (const file of ["README.md", "features.md", "docs/known-issues.md", "docs/implementation-log.md", "docs/testing-hooks.md", "docs/clockwork-implementation-plan.md"]) {
  requireFile(file);
}
try {
  const tracked = execFileSync("git", ["ls-files", "dist"], { cwd: root, encoding: "utf8" }).trim();
  if (tracked) fail("dist/ is tracked; it is generated");
} catch { /* no git metadata: local-only check */ }
if (existsSync(join(root, "public/player/clockwork.js"))) fail("public/player/clockwork.js is generated; build it through /api/build/player.js");

const log = existsSync(join(root, "docs/implementation-log.md")) ? readFileSync(join(root, "docs/implementation-log.md"), "utf8") : "";
for (const slice of [0, 1, 2, 3, 4, 5, 6, 6.5, 7, 8, 9]) {
  if (!log.includes(`Slice ${slice}`)) fail(`implementation log has no Slice ${slice} entry`);
}

const features = existsSync(join(root, "features.md")) ? readFileSync(join(root, "features.md"), "utf8") : "";
if (!features.includes("Only features that are")) fail("features.md is missing its completeness policy");

if (failures.length > 0) {
  console.error("Repository check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Repository check passed.");
