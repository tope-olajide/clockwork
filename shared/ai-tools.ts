export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export const READ_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_scenes",
      description: "List all scenes in the project with ids, names, and object counts.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_scene",
      description: "Get full scene details by scene id, including layers, objects, and rules.",
      parameters: {
        type: "object",
        properties: { sceneId: { type: "string", description: "Scene id to inspect" } },
        required: ["sceneId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_entities",
      description: "Search objects, scenes, prefabs, assets, rules, or variables by text or kind.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Case-insensitive search text" },
          kind: { type: "string", description: "Optional kind filter: scene, object, prefab, asset, rule, variable" },
          sceneId: { type: "string", description: "Optional scene scope" },
          limit: { type: "number", description: "Max results, default 50" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_object",
      description: "Get full details for a specific object by id.",
      parameters: {
        type: "object",
        properties: { objectId: { type: "string", description: "Object id" } },
        required: ["objectId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_variables",
      description: "Get project variables and their current/initial values.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_selection",
      description: "Get the currently selected editor entities and their details.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "capture_viewport",
      description: "Capture the current editor viewport as a PNG image for visual inspection.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

export const WRITE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "apply_commands",
      description: "Apply project commands as one atomic transaction (one revision, one undo entry). Use for Build mode edits.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Short human label for the change set" },
          expectedRevision: { type: "number", description: "Current project revision from context" },
          commands: {
            type: "array",
            description: "1..50 command objects executed in order",
            items: {
              type: "object",
              properties: {
                type: { type: "string", description: "Command type, e.g. object.update, scene.create, rule.create" },
                args: { type: "object", description: "Command arguments object" },
              },
              required: ["type", "args"],
              additionalProperties: true,
            },
          },
        },
        required: ["summary", "expectedRevision", "commands"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_commands",
      description: "Preview project commands without committing. Use in Plan mode and for destructive changes to show a change set.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Short human label for the proposed change set" },
          expectedRevision: { type: "number", description: "Current project revision from context" },
          commands: {
            type: "array",
            description: "1..50 command objects to preview",
            items: {
              type: "object",
              properties: {
                type: { type: "string", description: "Command type" },
                args: { type: "object", description: "Command arguments object" },
              },
              required: ["type", "args"],
              additionalProperties: true,
            },
          },
        },
        required: ["summary", "expectedRevision", "commands"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "select_entities",
      description: "Select entities in the editor and optionally focus/switch scene.",
      parameters: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" }, description: "Entity ids to select" },
          sceneId: { type: "string", description: "Scene to switch to if needed" },
          focus: { type: "boolean", description: "Whether to pan/focus viewport" },
        },
        required: ["ids"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_panel",
      description: "Open an editor panel/tab for the user.",
      parameters: {
        type: "object",
        properties: {
          panel: { type: "string", description: "Panel name, e.g. layers, inspector, assets, logic, playtest, ship, agent, settings" },
          tab: { type: "string", description: "Optional sub-tab" },
        },
        required: ["panel"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_playtest",
      description: "Start a bounded playtest and return telemetry. Editor is read-only while running.",
      parameters: {
        type: "object",
        properties: {
          sceneId: { type: "string" },
          durationMs: { type: "number", description: "Default 4000, max 15000" },
          seed: { type: "number" },
          inputs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                atMs: { type: "number" },
                action: { type: "string", description: "left|right|up|down|jump|action" },
                phase: { type: "string", description: "press|release" },
              },
              required: ["atMs", "action", "phase"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "undo_last_agent_change",
      description: "Undo the most recent agent-authored transaction. Refuses if user edited since (revision changed).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

export const SLICE6_TOOL_DEFINITIONS = READ_TOOL_DEFINITIONS;
const ALIAS_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_project_summary",
      description: "Get a compact project summary: name, revision, scene count, start scene, and current selection.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "query_project",
      description: "Query project entities by text or kind. Alias of search_entities.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Case-insensitive search text" },
          kind: { type: "string", description: "Optional kind filter: scene, object, prefab, asset, rule, variable" },
          sceneId: { type: "string", description: "Optional scene scope" },
          limit: { type: "number", description: "Max results, default 50" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_entity",
      description: "Inspect one object by id. Alias of get_object.",
      parameters: {
        type: "object",
        properties: { objectId: { type: "string", description: "Object id" } },
        required: ["objectId"],
        additionalProperties: false,
      },
    },
  },
];

export const KANE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "verify_with_kane",
      description: "Run Kane CLI against an immutable snapshot of this project in a real browser and return the verdict, steps and evidence. Use for engine QA; never claim a pass without run_end.status passed.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string", description: "Plain-English verification objective under 1,000 characters" },
          sceneId: { type: "string", description: "Optional scene to start from" },
        },
        required: ["objective"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_ai_play",
      description: "Run the in-product AI Play loop: Kane plays a read-only snapshot through the visible AI HUD and returns status, final_state, steps and evidence. On failure, diagnose and apply one non-destructive fix, then retry with the same seed at most once.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "Optional gameplay goal for this run" },
          sceneId: { type: "string", description: "Optional start scene" },
          maxAttempts: { type: "number", description: "1 or 2, default 1" },
        },
        additionalProperties: false,
      },
    },
  },
];

export const ALL_AGENT_TOOL_DEFINITIONS = [...READ_TOOL_DEFINITIONS, ...ALIAS_TOOL_DEFINITIONS, ...WRITE_TOOL_DEFINITIONS, ...KANE_TOOL_DEFINITIONS];

export function toolDefinitionsForRequest(opts: { toolsEnabled: boolean; visionEnabled: boolean; allowWrites: boolean; allowKane?: boolean }) {
  const base = opts.toolsEnabled ? [...READ_TOOL_DEFINITIONS] : [];
  const filtered = base.filter((t) => opts.visionEnabled || t.function.name !== "capture_viewport");
  if (opts.toolsEnabled) filtered.push(...ALIAS_TOOL_DEFINITIONS);
  if (opts.toolsEnabled && opts.allowWrites) filtered.push(...WRITE_TOOL_DEFINITIONS);
  if (opts.toolsEnabled && opts.allowKane) filtered.push(...KANE_TOOL_DEFINITIONS);
  return filtered;
}
