export type KaneRunStatus = "passed" | "failed" | "cancelled" | "error";

export interface KaneStep {
  step: number;
  status: "running" | "done" | "failed";
  remark: string;
  childId?: string;
}

export interface KaneFinalState {
  [key: string]: string;
}

export interface AiPlayResult {
  runId: string;
  projectId?: string;
  snapshotId?: string;
  attempt: number;
  status: KaneRunStatus;
  resultCode?: number | string;
  reasonCode?: string;
  summary: string;
  objective: string;
  finalState: KaneFinalState;
  steps: KaneStep[];
  runtimeErrors: string[];
  evidencePath?: string;
  evidenceUrl?: string;
  testUrl?: string;
  durationMs: number;
  exitCode?: number;
  createdAt: string;
}

export type KaneEvent =
  | { type: "stream_start"; runId: string; command?: string }
  | { type: "step"; step: number; status: "running" | "done" | "failed"; remark: string; childId?: string }
  | { type: "warning"; message: string; code?: string }
  | { type: "error"; message: string; code?: string }
  | { type: "run_end"; result: AiPlayResult }
  | { type: "kane_status"; status: KaneCliStatus };

export interface KaneCliStatus {
  enabled: boolean;
  qaEnabled: boolean;
  aiPlayEnabled: boolean;
  installed: boolean;
  authenticated: boolean;
  user?: string;
  version?: string;
  cliPath?: string;
  credits?: number;
  evidenceDir: string;
  reason?: string;
}

export interface AiPlayRequest {
  projectId?: string;
  snapshotId: string;
  attempt?: number;
  goal?: string;
  seed?: number;
}

export interface KaneQaRequest {
  objective: string;
  snapshotId?: string;
  seed?: number;
}

export interface KaneRunSummary {
  runId: string;
  status: KaneRunStatus;
  objective: string;
  summary: string;
  durationMs: number;
  evidencePath?: string;
  evidenceUrl?: string;
  testUrl?: string;
  finalState?: KaneFinalState;
}
