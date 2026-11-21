/**
 * User-visible Kane text must never expose local filesystem paths. The server keeps
 * the full path in its local run logs (`result.json`, `evidence-path.txt`); clients
 * receive this redacted form.
 */
import type { AiPlayResult } from "./kane";

const WINDOWS_PATH = /(^|[^A-Za-z0-9])[A-Za-z]:[\\/][^\s"'<>|)]*/g;
const POSIX_LOCAL_PATH = /(^|[\s("'=])\/(?:Users|home|tmp|private|var|opt)\/[^\s"'<>|)]*/g;

export function redactLocalPaths(text: string): string {
  return text
    .replace(WINDOWS_PATH, "$1[local path]")
    .replace(POSIX_LOCAL_PATH, "$1[local path]");
}

export function redactStrings(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, redactLocalPaths(value)]));
}

/** Drops the local evidence path and redacts paths from all displayed run text. */
export function redactAiPlayResult(result: AiPlayResult): AiPlayResult {
  const { evidencePath: _localPath, ...safe } = result;
  return {
    ...safe,
    summary: redactLocalPaths(result.summary),
    finalState: redactStrings(result.finalState),
    steps: result.steps.map((step) => ({ ...step, remark: redactLocalPaths(step.remark) })),
    runtimeErrors: result.runtimeErrors.map(redactLocalPaths),
  };
}
