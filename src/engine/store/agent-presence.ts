import { create } from "zustand";
import type { ProjectDocument } from "../model/schema";

export interface AgentPresenceState {
  objectIds: string[];
  sceneId: string | null;
  label: string;
  until: number;
}

export interface AgentGhostState {
  document: ProjectDocument;
  changedIds: string[];
  deletedIds: string[];
  sceneId: string | null;
  label: string;
}

interface AgentPresenceStore {
  presence: AgentPresenceState | null;
  ghost: AgentGhostState | null;
  setPresence: (input: { objectIds: string[]; sceneId?: string | null; label: string; durationMs?: number }) => void;
  clearPresence: () => void;
  setGhost: (input: AgentGhostState | null) => void;
  clear: () => void;
}

let clearTimer: ReturnType<typeof setTimeout> | undefined;

export const useAgentPresenceStore = create<AgentPresenceStore>((set) => ({
  presence: null,
  ghost: null,
  setPresence: ({ objectIds, sceneId = null, label, durationMs = 2500 }) => {
    if (clearTimer !== undefined) clearTimeout(clearTimer);
    const ids = objectIds.filter((id) => typeof id === "string" && id.length > 0);
    set({ presence: { objectIds: ids, sceneId, label, until: Date.now() + durationMs } });
    clearTimer = setTimeout(() => set({ presence: null }), durationMs);
  },
  clearPresence: () => {
    if (clearTimer !== undefined) clearTimeout(clearTimer);
    clearTimer = undefined;
    set({ presence: null });
  },
  setGhost: (ghost) => set({ ghost }),
  clear: () => {
    if (clearTimer !== undefined) clearTimeout(clearTimer);
    clearTimer = undefined;
    set({ presence: null, ghost: null });
  },
}));

export function clearAgentGhost(): void {
  useAgentPresenceStore.getState().setGhost(null);
}
