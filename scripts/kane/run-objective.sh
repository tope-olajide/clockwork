#!/usr/bin/env bash
set -euo pipefail

objective_file="${1:?usage: run-objective.sh <objective.txt> [start-url]}"
start_url="${2:-http://localhost:5173}"
name="$(basename "$objective_file" .txt)"
out_dir=".testmuai/runs"
mkdir -p "$out_dir"

if [[ -n "${APPDATA:-}" ]]; then
  npm_appdata="$(cygpath -u "$APPDATA" 2>/dev/null || printf '%s' "$APPDATA")"
  export PATH="$npm_appdata/npm:$PATH"
fi
export PATH="${HOME}/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if ! command -v kane-cli >/dev/null 2>&1; then
  echo "kane-cli is not on PATH. Install with: npm install -g @testmuai/kane-cli" >&2
  exit 2
fi

objective="$(cat "$objective_file")"
set +e
KANE_CLI_USER_AGENT=clockwork kane-cli run "$objective" \
  --url "$start_url" \
  --agent \
  --headless \
  --mode testing \
  --max-steps 40 \
  --timeout 240 \
  --assertion-mode dom \
  --final-validation on \
  --bug-detection continue \
  > "$out_dir/$name.ndjson" \
  2> "$out_dir/$name.stderr.log"
exit_code=$?
set -e
echo "exit=$exit_code"
node -e '
const fs = require("fs");
const path = process.argv[1];
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
let end = null;
for (const line of lines) {
  try { const event = JSON.parse(line); if (event.type === "run_end") end = event; } catch {}
}
if (!end) { console.log("no run_end; inspect the stderr log"); process.exit(0); }
console.log(JSON.stringify({
  status: end.status,
  summary: end.summary,
  duration: end.duration,
  final_state: end.final_state,
  session_dir: end.session_dir,
  test_url: end.test_url,
}, null, 2));
' "$out_dir/$name.ndjson"

exit "$exit_code"
