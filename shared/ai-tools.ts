import type { Slice6ReadToolName } from "./protocol";

export interface ToolDefinition {
  type: "function";
  function: {
    name: Slice6ReadToolName;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export const SLICE6_TOOL_DEFINITIONS: ToolDefinition[] = [
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

