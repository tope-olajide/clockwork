import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button, Input, NumberInput } from "../../components/ui";
import { makeRule, newId } from "../../engine/model/factory";
import { ruleReferenceIssues } from "../../engine/model/references";
import type { Condition, ProjectDocument, Rule, RuleAction, Scene, Variable } from "../../engine/model/schema";
import { useEngineStore } from "../../engine/store/engine-store";

function useActive() {
  const document = useEngineStore((state) => state.document);
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  const scene = document?.scenes.find((candidate) => candidate.id === activeSceneId) ?? document?.scenes[0] ?? null;
  const dispatch = useEngineStore((state) => state.dispatch);
  return { document, scene, dispatch, readOnly: Boolean(document?.archivedAt) };
}

function err(dispatch: ReturnType<typeof useEngineStore.getState>["dispatch"], type: string, args: unknown): string | null {
  const result = dispatch(type, args);
  return result.ok ? null : result.error;
}

export function LogicPage() {
  const { document, scene, dispatch, readOnly } = useActive();
  if (!document || !scene) return <div className="panel-helper" style={{ padding: 16 }}>No scene is open.</div>;
  return (
    <div className="logic-page">
      <VariablesPanel document={document} dispatch={dispatch} readOnly={readOnly} />
      <RulesPanel document={document} scene={scene} dispatch={dispatch} readOnly={readOnly} />
    </div>
  );
}

function VariablesPanel({ document, dispatch, readOnly }: { document: ProjectDocument; dispatch: ReturnType<typeof useActive>["dispatch"]; readOnly: boolean }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Variable["type"]>("number");
  const [initial, setInitial] = useState("0");
  const [message, setMessage] = useState<string | null>(null);

  function parseInitial(value: string, variableType: Variable["type"]): number | boolean | string {
    if (variableType === "number") return Number(value) || 0;
    if (variableType === "boolean") return value === "true";
    return value;
  }

  function usageCount(variable: Variable): number {
    const name = variable.name;
    let count = document.settings.ui.hud.filter((h) => h.variable === name).length;
    for (const scene of document.scenes) {
      for (const rule of scene.rules) {
        if (rule.when.some((c) => c.kind === "variable" && c.name === name)) count++;
        if (rule.do.some((a) => a.kind === "set-variable" && a.name === name)) count++;
      }
      for (const object of scene.objects) {
        if (object.behaviors.some((b) => b.params?.variable === name)) count++;
      }
    }
    return count;
  }

  function add() {
    if (!name.trim()) return;
    const error = err(dispatch, "variable.add", {
      variable: { id: newId("var"), name: name.trim(), type, initial: parseInitial(initial, type) } satisfies Variable,
    });
    if (error) setMessage(error);
    else {
      setName("");
      setInitial(type === "number" ? "0" : type === "boolean" ? "false" : "");
      setMessage(null);
    }
  }

  return (
    <section className="logic-section">
      <div className="logic-section-head">
        <h2>Variables</h2>
        <span className="row-meta">Project-wide</span>
      </div>
      <p className="panel-helper">Rules, HUD, and runtime state read from these names. Renames/deletes are reference-checked.</p>
      <div className="logic-list">
        {document.variables.map((variable) => (
          <VariableRow key={variable.id} variable={variable} usage={usageCount(variable)} dispatch={dispatch} readOnly={readOnly} />
        ))}
        {document.variables.length === 0 && <div className="panel-helper">No variables yet.</div>}
      </div>
      <div className="logic-add-row">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Variable name" aria-label="New variable name" disabled={readOnly} />
        <select className="input" value={type} aria-label="New variable type" disabled={readOnly} onChange={(event) => {
          const next = event.target.value as Variable["type"];
          setType(next);
          setInitial(next === "number" ? "0" : next === "boolean" ? "false" : "");
        }}>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
          <option value="string">String</option>
        </select>
        <Input value={initial} onChange={(event) => setInitial(event.target.value)} placeholder="Initial" aria-label="New variable initial value" disabled={readOnly} />
        <Button variant="secondary" size="sm" onClick={add} disabled={readOnly || !name.trim()}><Plus size={12} /> Add</Button>
      </div>
      {message && <div className="logic-error">{message}</div>}
    </section>
  );
}

function VariableRow({ variable, usage, dispatch, readOnly }: { variable: Variable; usage: number; dispatch: ReturnType<typeof useActive>["dispatch"]; readOnly: boolean }) {
  const [name, setName] = useState(variable.name);
  const [initial, setInitial] = useState(String(variable.initial));
  const [error, setError] = useState<string | null>(null);

  function save() {
    const parsed = variable.type === "number" ? Number(initial) : variable.type === "boolean" ? initial === "true" : initial;
    const result = dispatch("variable.update", { variableId: variable.id, patch: { name: name.trim() || variable.name, initial: parsed } });
    setError(result.ok ? null : result.error);
  }

  function remove() {
    const result = dispatch("variable.delete", { variableId: variable.id });
    setError(result.ok ? null : result.error);
  }

  return (
    <div className="logic-row">
      <Input value={name} onChange={(event) => setName(event.target.value)} onBlur={save} aria-label={`Variable ${variable.name} name`} disabled={readOnly} />
      <span className="chip">{variable.type}</span>
      <span className="chip">{usage} uses</span>
      <Input value={initial} onChange={(event) => setInitial(event.target.value)} onBlur={save} aria-label={`Variable ${variable.name} initial`} disabled={readOnly} />
      <Button variant="ghost" size="sm" onClick={remove} disabled={readOnly} aria-label={`Delete variable ${variable.name}`}><Trash2 size={12} /></Button>
      {error && <div className="logic-error full">{error}</div>}
    </div>
  );
}

function RulesPanel({ document, scene, dispatch, readOnly }: { document: ProjectDocument; scene: Scene; dispatch: ReturnType<typeof useActive>["dispatch"]; readOnly: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const variableNames = useMemo(() => document.variables.map((variable) => variable.name), [document.variables]);

  function addRule() {
    const rule = makeRule(`Rule ${scene.rules.length + 1}`);
    if (variableNames[0]) {
      rule.when = [{ kind: "variable", name: variableNames[0]!, op: ">=", value: 1 }];
      rule.do = [{ kind: "show-message", text: "Rule triggered", durationMs: 1200 }];
    } else {
      rule.when = [{ kind: "scene-start" }];
      rule.do = [{ kind: "log", message: "Scene started" }];
    }
    const result = dispatch("rule.add", { sceneId: scene.id, rule });
    setError(result.ok ? null : result.error);
  }

  return (
    <section className="logic-section">
      <div className="logic-section-head">
        <h2>Rules</h2>
        <span className="row-meta">Scene: {scene.name}</span>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={readOnly}><Plus size={12} /> Add rule</Button>
      </div>
      <p className="panel-helper">Rules evaluate in order each frame. Unknown references are rejected on save; existing broken refs are flagged and skipped in play.</p>
      <div className="logic-list">
        {scene.rules.map((rule, index) => (
          <RuleEditor
            key={rule.id}
            rule={rule}
            index={index}
            total={scene.rules.length}
            document={document}
            scene={scene}
            dispatch={dispatch}
            readOnly={readOnly}
          />
        ))}
        {scene.rules.length === 0 && <div className="panel-helper">No rules yet. Add one to react to variables, input, or overlap.</div>}
      </div>
      {error && <div className="logic-error">{error}</div>}
    </section>
  );
}

function rulePreview(document: ProjectDocument, scene: Scene, rule: Rule): string {
  const when = rule.when.map((c) => describeCondition(document, scene, c)).join(" and ");
  const action = rule.do.map((a) => describeAction(document, a)).join(", then ");
  return `When ${when || "…"} → ${action || "…"}`;
}

function describeCondition(_document: ProjectDocument, scene: Scene, condition: Condition): string {
  if (condition.kind === "variable") return `${condition.name} ${condition.op} ${String(condition.value)}`;
  if (condition.kind === "overlap") {
    const obj = condition.objectId ? scene.objects.find((o) => o.id === condition.objectId)?.name ?? "missing object" : "any object";
    return `${obj} overlaps ${condition.otherTag ?? condition.otherId ?? "anything"}`;
  }
  if (condition.kind === "input") return `${condition.action} is ${condition.mode}`;
  if (condition.kind === "timer") return `timer ${condition.timerId} fires`;
  return "scene starts";
}

function describeAction(_document: ProjectDocument, action: RuleAction): string {
  if (action.kind === "set-variable") return `${action.op} ${action.name}${action.value !== undefined ? ` ${String(action.value)}` : ""}`;
  if (action.kind === "show-message") return `show message "${action.text}"`;
  if (action.kind === "go-scene") return `go to ${_document.scenes.find((s) => s.id === action.sceneId)?.name ?? "missing scene"}`;
  if (action.kind === "play-sound") return `play sound ${_document.assets.find((a) => a.id === action.assetId)?.name ?? "missing asset"}`;
  if (action.kind === "spawn") return `spawn ${_document.prefabs.find((p) => p.id === action.prefabId)?.name ?? "missing prefab"}`;
  if (action.kind === "destroy") return `destroy ${action.target}`;
  if (action.kind === "set-behavior-param") return `set behavior ${action.param}`;
  return `log ${action.message}`;
}

function RuleEditor({
  rule,
  index,
  total,
  document,
  scene,
  dispatch,
  readOnly,
}: {
  rule: Rule;
  index: number;
  total: number;
  document: ProjectDocument;
  scene: Scene;
  dispatch: ReturnType<typeof useActive>["dispatch"];
  readOnly: boolean;
}) {
  const issues = ruleReferenceIssues(document, scene, rule);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<Rule>) {
    const result = dispatch("rule.update", { sceneId: scene.id, ruleId: rule.id, patch });
    setError(result.ok ? null : result.error);
  }

  function remove() {
    const result = dispatch("rule.delete", { sceneId: scene.id, ruleId: rule.id });
    setError(result.ok ? null : result.error);
  }

  function move(delta: number) {
    const result = dispatch("rule.reorder", { sceneId: scene.id, ruleId: rule.id, toIndex: Math.max(0, Math.min(total - 1, index + delta)) });
    setError(result.ok ? null : result.error);
  }

  return (
    <div className={`rule-card${issues.length ? " flagged" : ""}`}>
      <div className="rule-card-head">
        <Input value={rule.name} aria-label={`Rule ${rule.name} name`} disabled={readOnly} onChange={(event) => update({ name: event.target.value })} />
        <label className="logic-check"><input type="checkbox" checked={rule.enabled} disabled={readOnly} onChange={(event) => update({ enabled: event.target.checked })} /> Enabled</label>
        <label className="logic-check"><input type="checkbox" checked={rule.once} disabled={readOnly} onChange={(event) => update({ once: event.target.checked })} /> Once</label>
        <Button variant="ghost" size="sm" aria-label="Move rule up" disabled={readOnly || index === 0} onClick={() => move(-1)}><ChevronUp size={12} /></Button>
        <Button variant="ghost" size="sm" aria-label="Move rule down" disabled={readOnly || index === total - 1} onClick={() => move(1)}><ChevronDown size={12} /></Button>
        <Button variant="ghost" size="sm" aria-label="Delete rule" disabled={readOnly} onClick={remove}><Trash2 size={12} /></Button>
      </div>
      <p className="panel-helper rule-preview" style={{ margin: "4px 0 6px" }}>{rulePreview(document, scene, rule)}</p>
      {issues.length > 0 && (
        <div className="rule-flag" role="status">
          <AlertTriangle size={13} /> {issues[0]!.message} Flagged rules are skipped in play and cannot be saved with new invalid references.
        </div>
      )}
      <div className="rule-grid">
        <div>
          <div className="inspector-section-title">When</div>
          {rule.when.map((condition, conditionIndex) => (
            <ConditionEditor
              key={conditionIndex}
              condition={condition}
              document={document}
              scene={scene}
              readOnly={readOnly}
              onChange={(next) => update({ when: rule.when.map((item, itemIndex) => (itemIndex === conditionIndex ? next : item)) })}
              onRemove={() => update({ when: rule.when.filter((_, itemIndex) => itemIndex !== conditionIndex) })}
            />
          ))}
          <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => update({ when: [...rule.when, defaultCondition(document, scene)] })}>+ Condition</Button>
        </div>
        <div>
          <div className="inspector-section-title">Do</div>
          {rule.do.map((action, actionIndex) => (
            <ActionEditor
              key={actionIndex}
              action={action}
              document={document}
              scene={scene}
              readOnly={readOnly}
              onChange={(next) => update({ do: rule.do.map((item, itemIndex) => (itemIndex === actionIndex ? next : item)) })}
              onRemove={() => update({ do: rule.do.filter((_, itemIndex) => itemIndex !== actionIndex) })}
            />
          ))}
          <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => update({ do: [...rule.do, { kind: "show-message", text: "Message", durationMs: 1500 }] })}>+ Action</Button>
        </div>
      </div>
      {error && <div className="logic-error">{error}</div>}
    </div>
  );
}

function defaultCondition(document: ProjectDocument, scene: Scene): Condition {
  if (document.variables[0]) return { kind: "variable", name: document.variables[0]!.name, op: ">=", value: 1 };
  if (scene.objects[0]) return { kind: "overlap", objectId: scene.objects[0]!.id, otherTag: "goal" };
  return { kind: "scene-start" };
}

function ConditionEditor({
  condition,
  document,
  scene,
  readOnly,
  onChange,
  onRemove,
}: {
  condition: Condition;
  document: ProjectDocument;
  scene: Scene;
  readOnly: boolean;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rule-row">
      <select className="input" value={condition.kind} disabled={readOnly} aria-label="Condition kind" onChange={(event) => {
        const kind = event.target.value as Condition["kind"];
        if (kind === "variable") onChange({ kind, name: document.variables[0]?.name ?? "value", op: "==", value: 1 });
        else if (kind === "overlap") onChange({ kind, objectId: scene.objects[0]?.id, otherTag: "goal" });
        else if (kind === "input") onChange({ kind, action: "jump", mode: "pressed" });
        else if (kind === "timer") onChange({ kind, timerId: "timer" });
        else onChange({ kind });
      }}>
        <option value="variable">Variable</option>
        <option value="overlap">Overlap</option>
        <option value="input">Input</option>
        <option value="timer">Timer</option>
        <option value="scene-start">Scene start</option>
      </select>
      {condition.kind === "variable" && (
        <>
          <select className="input" value={condition.name} disabled={readOnly} aria-label="Variable name" onChange={(event) => onChange({ ...condition, name: event.target.value })}>
            {document.variables.map((variable) => <option key={variable.id} value={variable.name}>{variable.name}</option>)}
            {!document.variables.some((variable) => variable.name === condition.name) && <option value={condition.name}>{condition.name} (missing)</option>}
          </select>
          <select className="input" value={condition.op} disabled={readOnly} aria-label="Operator" onChange={(event) => onChange({ ...condition, op: event.target.value as "==" | "!=" | ">" | "<" | ">=" | "<=" })}>
            {["==", "!=", ">", "<", ">=", "<="].map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <Input value={String(condition.value)} disabled={readOnly} aria-label="Comparison value" onChange={(event) => {
            const raw = event.target.value;
            const value = raw === "true" ? true : raw === "false" ? false : Number.isFinite(Number(raw)) && raw.trim() !== "" ? Number(raw) : raw;
            onChange({ ...condition, value });
          }} />
        </>
      )}
      {condition.kind === "overlap" && (
        <>
          <select className="input" value={condition.objectId ?? ""} disabled={readOnly} aria-label="Overlap object" onChange={(event) => onChange({ ...condition, objectId: event.target.value || undefined })}>
            <option value="">Any object</option>
            {scene.objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
            {condition.objectId && !scene.objects.some((object) => object.id === condition.objectId) && <option value={condition.objectId}>Missing object</option>}
          </select>
          <Input value={condition.otherTag ?? condition.otherId ?? ""} disabled={readOnly} aria-label="Other tag or id" placeholder="other tag" onChange={(event) => onChange({ ...condition, otherTag: event.target.value || undefined, otherId: undefined })} />
        </>
      )}
      {condition.kind === "input" && (
        <>
          <select className="input" value={condition.action} disabled={readOnly} aria-label="Input action" onChange={(event) => onChange({ ...condition, action: event.target.value as "left" | "right" | "up" | "down" | "jump" | "action" })}>
            {(["left", "right", "up", "down", "jump", "action"] as const).map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
          <select className="input" value={condition.mode} disabled={readOnly} aria-label="Input mode" onChange={(event) => onChange({ ...condition, mode: event.target.value as "pressed" | "down" | "released" })}>
            <option value="pressed">Pressed</option>
            <option value="down">Held</option>
            <option value="released">Released</option>
          </select>
        </>
      )}
      {condition.kind === "timer" && <Input value={condition.timerId} disabled={readOnly} aria-label="Timer id" onChange={(event) => onChange({ ...condition, timerId: event.target.value })} />}
      <Button variant="ghost" size="sm" disabled={readOnly} aria-label="Remove condition" onClick={onRemove}><Trash2 size={12} /></Button>
    </div>
  );
}

function ActionEditor({
  action,
  document,
  scene,
  readOnly,
  onChange,
  onRemove,
}: {
  action: RuleAction;
  document: ProjectDocument;
  scene: Scene;
  readOnly: boolean;
  onChange: (action: RuleAction) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rule-row">
      <select className="input" value={action.kind} disabled={readOnly} aria-label="Action kind" onChange={(event) => {
        const kind = event.target.value as RuleAction["kind"];
        if (kind === "set-variable") onChange({ kind, name: document.variables[0]?.name ?? "value", op: "set", value: 1 });
        else if (kind === "show-message") onChange({ kind, text: "Message", durationMs: 1500 });
        else if (kind === "go-scene") onChange({ kind, sceneId: document.scenes[0]?.id ?? scene.id });
        else if (kind === "play-sound") onChange({ kind, assetId: document.assets.find((asset) => asset.kind === "audio")?.id ?? "" });
        else if (kind === "spawn") onChange({ kind, prefabId: document.prefabs[0]?.id ?? "", x: 0, y: 0 });
        else if (kind === "destroy") onChange({ kind, target: "self" });
        else if (kind === "set-behavior-param") onChange({ kind, objectId: scene.objects[0]?.id ?? "", behaviorId: scene.objects[0]?.behaviors[0]?.id ?? "", param: "speed", value: 1 });
        else onChange({ kind, message: "log" });
      }}>
        <option value="set-variable">Set variable</option>
        <option value="show-message">Show message</option>
        <option value="go-scene">Go to scene</option>
        <option value="play-sound">Play sound</option>
        <option value="spawn">Spawn prefab</option>
        <option value="destroy">Destroy</option>
        <option value="set-behavior-param">Set behavior param</option>
        <option value="log">Log</option>
      </select>
      {action.kind === "set-variable" && (
        <>
          <select className="input" value={action.name} disabled={readOnly} aria-label="Variable to set" onChange={(event) => onChange({ ...action, name: event.target.value })}>
            {document.variables.map((variable) => <option key={variable.id} value={variable.name}>{variable.name}</option>)}
            {!document.variables.some((variable) => variable.name === action.name) && <option value={action.name}>{action.name} (missing)</option>}
          </select>
          <select className="input" value={action.op} disabled={readOnly} aria-label="Set operator" onChange={(event) => onChange({ ...action, op: event.target.value as "set" | "add" | "toggle" })}>
            <option value="set">set</option>
            <option value="add">add</option>
            <option value="toggle">toggle</option>
          </select>
          <Input value={String(action.value ?? "")} disabled={readOnly} aria-label="Variable value" onChange={(event) => {
            const raw = event.target.value;
            const value = raw === "true" ? true : raw === "false" ? false : Number.isFinite(Number(raw)) && raw.trim() !== "" ? Number(raw) : raw;
            onChange({ ...action, value });
          }} />
        </>
      )}
      {action.kind === "show-message" && (
        <>
          <Input value={action.text} disabled={readOnly} aria-label="Message text" onChange={(event) => onChange({ ...action, text: event.target.value })} />
          <NumberInput value={action.durationMs ?? 1500} disabled={readOnly} aria-label="Message duration" onChange={(event) => onChange({ ...action, durationMs: Number(event.target.value) || 1000 })} />
        </>
      )}
      {action.kind === "go-scene" && (
        <select className="input" value={action.sceneId} disabled={readOnly} aria-label="Target scene" onChange={(event) => onChange({ ...action, sceneId: event.target.value })}>
          {document.scenes.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          {!document.scenes.some((candidate) => candidate.id === action.sceneId) && <option value={action.sceneId}>Missing scene</option>}
        </select>
      )}
      {action.kind === "play-sound" && (
        <select className="input" value={action.assetId} disabled={readOnly} aria-label="Sound asset" onChange={(event) => onChange({ ...action, assetId: event.target.value })}>
          <option value="">Select audio…</option>
          {document.assets.filter((asset) => asset.kind === "audio").map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          {action.assetId && !document.assets.some((asset) => asset.id === action.assetId) && <option value={action.assetId}>Missing asset</option>}
        </select>
      )}
      {action.kind === "spawn" && (
        <>
          <select className="input" value={action.prefabId} disabled={readOnly} aria-label="Prefab to spawn" onChange={(event) => onChange({ ...action, prefabId: event.target.value })}>
            <option value="">Select prefab…</option>
            {document.prefabs.map((prefab) => <option key={prefab.id} value={prefab.id}>{prefab.name}</option>)}
            {action.prefabId && !document.prefabs.some((prefab) => prefab.id === action.prefabId) && <option value={action.prefabId}>Missing prefab</option>}
          </select>
          <NumberInput value={action.x} disabled={readOnly} aria-label="Spawn X" onChange={(event) => onChange({ ...action, x: Number(event.target.value) || 0 })} />
          <NumberInput value={action.y} disabled={readOnly} aria-label="Spawn Y" onChange={(event) => onChange({ ...action, y: Number(event.target.value) || 0 })} />
        </>
      )}
      {action.kind === "destroy" && <span className="panel-helper">Destroys {action.target === "self" ? "self" : "target object"}.</span>}
      {action.kind === "set-behavior-param" && (
        <>
          <Input value={action.param} disabled={readOnly} aria-label="Behavior parameter" onChange={(event) => onChange({ ...action, param: event.target.value })} />
          <Input value={String(action.value ?? "")} disabled={readOnly} aria-label="Behavior parameter value" onChange={(event) => {
            const raw = event.target.value;
            const value = raw === "true" ? true : raw === "false" ? false : Number.isFinite(Number(raw)) && raw.trim() !== "" ? Number(raw) : raw;
            onChange({ ...action, value });
          }} />
        </>
      )}
      {action.kind === "log" && <Input value={action.message} disabled={readOnly} aria-label="Log message" onChange={(event) => onChange({ ...action, message: event.target.value })} />}
      <Button variant="ghost" size="sm" disabled={readOnly} aria-label="Remove action" onClick={onRemove}><Trash2 size={12} /></Button>
    </div>
  );
}
