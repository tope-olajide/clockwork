export type AgentMode = "ask" | "build" | "plan";

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: ToolResult;
}

export interface StepRequest {
  projectId: string;
  mode: AgentMode;
  modelId: string;
  messages: AgentChatMessage[];
  context: ContextPacket;
}

export type StepEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; callId: string; name: string; args: unknown }
  | { type: "step_end"; finishReason: "stop" | "tool-calls" | "length" | "error"; usage?: { promptTokens?: number; completionTokens?: number } }
  | { type: "error"; message: string; code?: string };

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  revision: number;
}

export interface ContextPacket {
  app: { name: "Clockwork"; schemaVersion: 1 };
  project: {
    id: string;
    name: string;
    revision: number;
    width: number;
    height: number;
    pixelArt: boolean;
    startSceneId: string;
    sceneCount: number;
    assetCount: number;
    prefabCount: number;
    settings: {
      gravity: { x: number; y: number };
      background: string;
      audio?: { musicVolume?: number; sfxVolume?: number; masterVolume?: number };
    };
  };
  editor: {
    tab: string;
    activeSceneId: string | null;
    activeSceneName: string | null;
    activeLayerId: string | null;
    selection: Array<{ id: string; name: string; type?: string; layerName?: string }>;
    lockedSelection?: { id: string; name: string } | null;
    tool: string;
    playtest: "off" | "running" | "paused";
    camera: { x: number; y: number; zoom: number };
    viewportSize: { w: number; h: number };
  };
  activeScene: {
    id: string;
    name: string;
    size: { w: number; h: number };
    layers: Array<{ id: string; name: string; order: number; objectCount: number }>;
    objects: Array<{
      id: string;
      name: string;
      layerId: string;
      x: number;
      y: number;
      w?: number;
      h?: number;
      behaviors: string[];
      tags: string[];
      prefabId?: string;
    }>;
    rules: Array<{ id: string; name: string; enabled: boolean; summary: string }>;
  } | null;
  selectionDetails: Array<Record<string, unknown>>;
  assets: Array<{ id: string; name: string; kind?: string; type?: string }>;
  prefabs: Array<{ id: string; name: string; objectCount?: number }>;
  variables: Array<{ name: string; type: string; initial: unknown }>;
  recentActions: Array<{ label: string; source: "ui" | "agent"; revision: number; at: string }>;
  playtestTelemetry?: {
    sceneId?: string;
    elapsedMs?: number;
    fps?: number;
    variables?: Record<string, unknown>;
    events?: Array<{ atMs?: number; type?: string; message?: string }>;
    lastError?: string;
  };
  availableCommands: string[];
  warnings: string[];
}

export const SLICE6_READ_TOOLS = [
  "list_scenes",
  "get_scene",
  "search_entities",
  "get_object",
  "get_variables",
  "get_selection",
  "capture_viewport",
] as const;

export type Slice6ReadToolName = (typeof SLICE6_READ_TOOLS)[number];
