import type { ProjectDocument, Rule, Scene } from "./schema";

export interface ReferenceIssue {
  path: string;
  message: string;
}

export function ruleReferenceIssues(document: ProjectDocument, scene: Scene, rule: Rule): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  const objectIds = new Set(scene.objects.map((object) => object.id));
  const variableNames = new Set(document.variables.map((variable) => variable.name));
  const sceneIds = new Set(document.scenes.map((candidate) => candidate.id));
  const assetIds = new Set(document.assets.map((asset) => asset.id));
  const prefabIds = new Set(document.prefabs.map((prefab) => prefab.id));

  rule.when.forEach((condition, index) => {
    if (condition.kind === "variable" && !variableNames.has(condition.name)) {
      issues.push({ path: `when.${index}.name`, message: `Variable “${condition.name}” does not exist.` });
    }
    if (condition.kind === "overlap") {
      if (!condition.objectId && !condition.tag) {
        issues.push({ path: `when.${index}.objectId`, message: "Choose an object or tag for the left side." });
      }
      if (!condition.otherId && !condition.otherTag) {
        issues.push({ path: `when.${index}.otherId`, message: "Choose an object or tag for the right side." });
      }
      if (condition.objectId && !objectIds.has(condition.objectId)) {
        issues.push({ path: `when.${index}.objectId`, message: "The selected object was deleted." });
      }
      if (condition.otherId && !objectIds.has(condition.otherId)) {
        issues.push({ path: `when.${index}.otherId`, message: "The selected object was deleted." });
      }
    }
  });

  rule.do.forEach((action, index) => {
    if (action.kind === "go-scene" && !sceneIds.has(action.sceneId)) {
      issues.push({ path: `do.${index}.sceneId`, message: "The target scene was deleted." });
    }
    if (action.kind === "set-variable" && !variableNames.has(action.name)) {
      issues.push({ path: `do.${index}.name`, message: `Variable “${action.name}” does not exist.` });
    }
    if (action.kind === "play-sound" && !assetIds.has(action.assetId)) {
      issues.push({ path: `do.${index}.assetId`, message: "The audio asset was deleted." });
    }
    if (action.kind === "spawn" && !prefabIds.has(action.prefabId)) {
      issues.push({ path: `do.${index}.prefabId`, message: "The prefab was deleted." });
    }
    if (action.kind === "destroy" && action.target === "object" && action.objectId && !objectIds.has(action.objectId)) {
      issues.push({ path: `do.${index}.objectId`, message: "The selected object was deleted." });
    }
    if (action.kind === "set-behavior-param") {
      const object = scene.objects.find((candidate) => candidate.id === action.objectId);
      if (!object) issues.push({ path: `do.${index}.objectId`, message: "The selected object was deleted." });
      else if (!object.behaviors.some((behavior) => behavior.id === action.behaviorId)) {
        issues.push({ path: `do.${index}.behaviorId`, message: "The selected behavior was removed." });
      }
    }
  });

  return issues;
}

export function ruleUsages(document: ProjectDocument, variableName: string): number {
  let count = 0;
  for (const scene of document.scenes) {
    for (const rule of scene.rules) {
      for (const condition of rule.when) if (condition.kind === "variable" && condition.name === variableName) count += 1;
      for (const action of rule.do) if (action.kind === "set-variable" && action.name === variableName) count += 1;
    }
  }
  for (const widget of document.settings.ui.hud) if (widget.variable === variableName) count += 1;
  return count;
}
