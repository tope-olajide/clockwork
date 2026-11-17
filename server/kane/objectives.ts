interface ObjectiveBehavior {
  type: string;
}

interface ObjectiveObject {
  tags: string[];
  behaviors: ObjectiveBehavior[];
  transform: { x: number; y: number };
}

interface ObjectiveHud {
  variable: string;
  label: string;
  visible?: boolean;
}

interface ObjectiveVariable {
  name: string;
  type: string;
}

interface ObjectiveRuleAction {
  kind: string;
  name?: string;
  value?: unknown;
}

interface ObjectiveRule {
  do: ObjectiveRuleAction[];
}

interface ObjectiveScene {
  id: string;
  name: string;
  objects: ObjectiveObject[];
  rules: ObjectiveRule[];
}

export interface KaneProjectDocument {
  name: string;
  startSceneId: string;
  scenes: ObjectiveScene[];
  variables: ObjectiveVariable[];
  settings: { ui: { hud: ObjectiveHud[] } };
}

interface ObjectiveInput {
  document: KaneProjectDocument;
  sceneId?: string;
  goal?: string;
  seed?: number;
}

function sceneFor(document: KaneProjectDocument, sceneId?: string) {
  return document.scenes.find((scene) => scene.id === sceneId)
    ?? document.scenes.find((scene) => scene.id === document.startSceneId)
    ?? document.scenes[0];
}

function coinCount(document: KaneProjectDocument, sceneId?: string): number {
  const scene = sceneFor(document, sceneId);
  if (!scene) return 0;
  return scene.objects.filter((object) =>
    object.tags.includes("coin")
    || object.behaviors.some((behavior) => behavior.type === "collectible"),
  ).length;
}

function hudLabel(document: KaneProjectDocument, variable: string, fallback: string): string {
  const widget = document.settings.ui.hud.find((item) => item.variable === variable && item.visible !== false);
  return widget?.label?.trim() || fallback;
}

function winVariable(document: KaneProjectDocument): string {
  for (const scene of document.scenes) {
    for (const rule of scene.rules) {
      for (const action of rule.do) {
        if (action.kind === "set-variable" && action.value === true && action.name) return action.name;
      }
    }
  }
  return document.variables.find((variable) => variable.type === "boolean" && /win|won|complete/i.test(variable.name))?.name ?? "won";
}

/** Builds a short objective that talks only in visible AI HUD labels. */
export function buildAiPlayObjective(input: ObjectiveInput): string {
  const { document } = input;
  const scene = sceneFor(document, input.sceneId);
  const coinTotal = coinCount(document, input.sceneId);
  const coinsLabel = hudLabel(document, "coins", "COINS");
  const winName = winVariable(document);
  const goal = input.goal?.trim()
    || (coinTotal > 0
      ? `Collect all ${coinTotal} ${coinsLabel.toLowerCase()} and reach the end of the scene.`
      : `Reach the end of the scene.`);
  const player = scene?.objects.find((object) => object.tags.includes("player"));
  const targets = scene?.objects.filter((object) =>
    object.tags.includes("coin") || object.tags.includes("goal"),
  ) ?? [];
  // Small test scenes need one movement, not a jump loop; each jump can cost
  // 15–25 seconds of Kane agent time.
  const compact = Boolean(player && targets.length > 0 && targets.every((target) =>
    Math.abs(target.transform.x - player.transform.x) < 520
    && Math.abs(target.transform.y - player.transform.y) < 260,
  ));
  const movement = compact
    ? `Click "MOVE RIGHT" once.`
    : `Click "MOVE RIGHT" once. Click "JUMP" only when the player is on the ground, up to 6 times.`;

  const outcome = coinTotal > 0
    ? `Assert STATUS is "WON", ${coinsLabel} is "${coinTotal}" and LAST ERROR is "none".`
    : `Assert STATUS is "WON", ${winName} is "true" and LAST ERROR is "none".`;
  return [
    `${goal} ${movement} Wait 3 seconds.`,
    outcome,
  ].join("\n");
}

/** The objective Kane reads when validating the player and AI HUD itself. */
export function buildPlayerQaObjective(document: KaneProjectDocument, seed = 1234): string {
  const coinsLabel = hudLabel(document, "coins", "COINS");
  return [
    `Open the Clockwork player for ${document.name} at seed ${seed}.`,
    `Verify the page has a visible "AI PLAY" panel and a "GAME STATE" panel.`,
    `Verify the buttons "MOVE LEFT", "MOVE RIGHT", "JUMP", "ACTION", "STOP" and "RESTART" are visible.`,
    `Click "MOVE RIGHT" once and verify its label changes to include ON.`,
    `Click "JUMP" once and verify the player remains interactive and STATUS is still a visible value.`,
    `Click "STOP" and store the text next to "STATUS" as "status".`,
    `Store the text next to "${coinsLabel}" as "coins".`,
    `Store the text next to "LAST ERROR" as "last_error".`,
    `Assert last_error is "none".`,
  ].join("\n");
}

export function objectivePreview(document: KaneProjectDocument): string {
  return buildAiPlayObjective({ document });
}
