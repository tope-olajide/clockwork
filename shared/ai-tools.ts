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
      description:
        "Get a scene by id: layers, a compact object index (ids, transforms, bodies, behavior types, visual summary), and rules. Large visual payloads (shape primitives, tilemap data) are summarized; use get_object for one object's full definition, or pass detail:'full'.",
      parameters: {
        type: "object",
        properties: {
          sceneId: { type: "string", description: "Scene id to inspect" },
          detail: {
            type: "string",
            enum: ["summary", "full"],
            description: "summary (default) omits bulky visual data; full returns the raw scene",
          },
        },
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
      name: "get_game_test_profile",
      description: "Get the versioned game-test profile for this project's template: which labelled controls a browser agent may press, which read-only observations and objectives it may assert, and which registered scenarios it may use. Returns available: false when the template has no profile. Never invent actions or observations outside this profile.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_test_plan",
      description: "Propose a bounded, reviewable game-test plan for the open project. Copy the user's goal verbatim into userGoal, call get_game_test_profile first, and use only that profile's control and observation ids. The plan is validated against the profile, project revision and hard budgets; a rejection lists the exact unsupported parts. This never runs Kane, starts a session or edits the project — it only produces a draft the user must review and approve.",
      parameters: {
        type: "object",
        properties: {
          userGoal: { type: "string", description: "The user's instruction, copied verbatim" },
          sceneId: { type: "string", description: "Scene to test; defaults to the start scene" },
          seed: { type: "number", description: "Deterministic seed, default 1234" },
          scenarioId: { type: "string", description: "Optional registered scenario id from the profile" },
          phases: {
            type: "array",
            description: "1-3 bounded phases; each does one thing and states its assertions",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Lowercase dash id" },
                objectiveId: { type: "string", description: "Optional profile objective id" },
                purpose: { type: "string", description: "Why this phase exists" },
                kaneObjective: { type: "string", description: "Short browser-executable instruction using visible profile labels" },
                allowedControlIds: { type: "array", items: { type: "string" } },
                assertions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      observationId: { type: "string", description: "Profile observation id" },
                      operator: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "increased"] },
                      expected: { type: ["string", "number", "boolean"] },
                    },
                    required: ["id", "observationId", "operator", "expected"],
                    additionalProperties: false,
                  },
                },
                stopWhen: {
                  type: "array",
                  items: { type: "string", enum: ["passed", "failed", "lost", "won", "budget-exhausted"] },
                },
              },
              required: ["id", "purpose", "kaneObjective", "allowedControlIds", "assertions", "stopWhen"],
              additionalProperties: false,
            },
          },
          budget: {
            type: "object",
            properties: {
              maxKanePhases: { type: "number", description: "1-3" },
              maxKaneStepsPerPhase: { type: "number", description: "1-12" },
              maxWallTimeSecondsPerPhase: { type: "number", description: "30-600" },
              maxFramesPerAdvance: { type: "number", description: "1-600" },
              maxFramesPerPhase: { type: "number", description: "1-3600" },
            },
            required: ["maxKanePhases", "maxKaneStepsPerPhase", "maxWallTimeSecondsPerPhase", "maxFramesPerAdvance", "maxFramesPerPhase"],
            additionalProperties: false,
          },
        },
        required: ["userGoal", "phases", "budget"],
        additionalProperties: false,
      },
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
      name: "list_commands",
      description:
        "List project commands as one-line signatures (name?: optional). Pass `prefixes` (e.g. [\"variable\",\"hud\",\"behavior\"]) to get only those. Call this before apply_commands when you are not certain of a command's args.",
      parameters: {
        type: "object",
        properties: {
          prefixes: { type: "array", items: { type: "string" }, description: "Optional command families: project, scene, layer, object, objects, prefab, rule, variable, hud, behavior, asset, tilemap" },
        },
        additionalProperties: false,
      },
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
      description: "Run a bounded headless preflight (no canvas, no browser) to catch runtime errors before a Kane phase. Headless telemetry is never Kane evidence and cannot satisfy a test-plan criterion.",
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
      description: [
        "Verify behaviour with a structured check. Use the control and readout ids in context.kane.testMode (or get_game_test_profile).",
        "The check first runs free in the engine simulator with the same inputs. If an expectation fails there, Kane is NOT run and you get the simulator's values: fix the game or the check (e.g. more frames, a jump, move the coin) before calling again.",
        "Only when the simulator agrees does Kane run once in a real browser (1-3 minutes), clicking one button per step in paused Test Mode and reading the readouts. Clockwork judges Kane's stored values, so status \"passed\" means both agree.",
        "60 frames = 1 second. Example: {title:\"Coin raises score\", steps:[{control:\"move-right\",frames:90}], expect:[{readout:\"score\",equals:1},{readout:\"coin-count\",changed:true}]}.",
        "Alternatively pass only `objective` (no steps/expect) when the user gives an exact Kane objective: it is sent to Kane verbatim against the real-time player. Never reword a user-supplied objective.",
        "Follow the returned nextStep. Never call again with an identical check at the same revision.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "What is being verified, in a few words" },
          steps: {
            type: "array",
            description: "Up to 6 steps run in order. Empty means just read the starting state.",
            items: {
              type: "object",
              properties: {
                control: { type: "string", description: "Control id (hold controls stay down for the frames; press controls fire once then the game runs the frames), or \"wait\"" },
                frames: { type: "number", description: "Frames for this step, 1-600" },
                with: { type: "array", items: { type: "string" }, description: "Optional press controls fired at the start of the step, e.g. [\"jump\"] while moving" },
              },
              required: ["control", "frames"],
              additionalProperties: false,
            },
          },
          expect: {
            type: "array",
            description: "1-6 expectations on readouts after the steps",
            items: {
              type: "object",
              properties: {
                readout: { type: "string", description: "Readout id" },
                equals: { type: ["string", "number", "boolean"], description: "Exact value" },
                atLeast: { type: "number" },
                atMost: { type: "number" },
                changed: { type: "boolean", description: "true: must differ from the start; false: must stay the same" },
              },
              required: ["readout"],
              additionalProperties: false,
            },
          },
          objective: { type: "string", description: "Verbatim Kane objective, only when there is no structured expect (under 1,000 characters)" },
          sceneId: { type: "string", description: "Optional scene to start from" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_ai_play",
      description: "Run the in-product AI Play loop: Kane plays a read-only snapshot through the visible AI HUD and returns status, final_state, steps and evidence. Each call performs exactly one run and never repeats or auto-fixes by itself. On failure, diagnose; if you apply a non-destructive fix, call this tool again with the same seed at most once.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "Optional gameplay goal for this run" },
          sceneId: { type: "string", description: "Optional scene id to start from; defaults to the project's start scene" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_kane_test_phase",
      description: "Run exactly one phase of the human-approved test plan through Kane in Clockwork Test Mode and return a typed verdict (passed, failed, inconclusive or cancelled) with per-assertion actual values, accepted input count and evidence. Requires an approved plan for the current revision; pass only a phaseId from that plan. Never claim a pass unless verdict is passed. After the result, cite the phase, verdict and assertion values against the original goal, and only run a different phase when that result calls for it; at most two follow-up phases within the plan budget. Explain where the causal chain stopped instead of only saying \"failed\": no accepted input means the input never reached the game; an accepted input whose expected effect observation did not change means the effect was not created; an effect that exists while the target or score observation did not change means the effect missed or the result rule did not run. Use the returned observations, not assumptions.",
      parameters: {
        type: "object",
        properties: {
          phaseId: { type: "string", description: "Id of a phase in the approved plan" },
          replayTestKey: { type: "string", description: "Optional registry key for a recorded testmd replay (e.g. from the phase panel). Omit for a fresh authored run; a replay failure stays a failure and never re-authors." },
        },
        required: ["phaseId"],
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
