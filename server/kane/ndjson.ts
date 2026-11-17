import type { KaneStep } from "../../shared/protocol/kane";

export interface ParsedLine {
  raw: unknown;
  step?: KaneStep;
}

export function parseNdjsonLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return { raw: JSON.parse(trimmed) };
  } catch {
    return null;
  }
}

export function stepFromEvent(event: unknown): KaneStep | null {
  if (!event || typeof event !== "object") return null;
  const item = event as Record<string, unknown>;
  if (typeof item.step !== "number" || typeof item.status !== "string" || typeof item.remark !== "string") return null;
  if (item.status !== "running" && item.status !== "done" && item.status !== "failed") return null;
  return {
    step: item.step,
    status: item.status,
    remark: item.remark,
    childId: typeof item.child_id === "string" ? item.child_id : undefined,
  };
}

export function textFromEvent(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const item = event as Record<string, unknown>;
  return typeof item.message === "string" ? item.message : null;
}
