import type { z } from "zod";
import { commandDefinitions } from "../commands/registry";
import { BEHAVIOR_CATALOG } from "../model/behavior-catalog";

/**
 * The agent is told it may send `{ type, args }` commands, but the registry is
 * the only place the real args exist. Without this, a model guesses the shape
 * (e.g. `object.update` with a bare `transform` instead of `patch.transform`),
 * the app rejects it, and the retry guesses again. Derive a compact reference
 * from the zod schemas so both the tool surface and error messages can quote it.
 */

export interface CommandFieldHelp {
  name: string;
  type: string;
  required: boolean;
}

export interface CommandHelp {
  type: string;
  label: string;
  args: CommandFieldHelp[];
}

type AnySchema = z.ZodTypeAny & {
  type?: string;
  shape?: Record<string, AnySchema>;
  element?: AnySchema;
  options?: AnySchema[] | string[];
  unwrap?: () => AnySchema;
};

function unwrapOptional(schema: AnySchema): { schema: AnySchema; optional: boolean } {
  let current = schema;
  let optional = false;
  let guard = 0;
  while (current && guard < 6) {
    guard += 1;
    if (current.type === "optional" && typeof current.unwrap === "function") {
      optional = true;
      current = current.unwrap();
      continue;
    }
    if (current.type === "nullable" && typeof current.unwrap === "function") {
      optional = true;
      current = current.unwrap();
      continue;
    }
    if (current.type === "default" && typeof current.unwrap === "function") {
      current = current.unwrap();
      continue;
    }
    break;
  }
  return { schema: current, optional };
}

function typeName(schema: AnySchema, depth: number): string {
  const { schema: inner } = unwrapOptional(schema);
  const kind = inner?.type ?? "any";
  if (kind === "object" && inner.shape && depth < 2) {
    const fields = Object.entries(inner.shape).map(([name, field]) => {
      const { optional } = unwrapOptional(field as AnySchema);
      return `${name}${optional ? "?" : ""}: ${typeName(field as AnySchema, depth + 1)}`;
    });
    return fields.length ? `object{${fields.join(", ")}}` : "object";
  }
  if (kind === "array") return inner.element ? `${typeName(inner.element as AnySchema, depth + 1)}[]` : "array";
  if (kind === "enum") return `enum(${(inner.options ?? []).join("|")})`;
  if (kind === "union") {
    // Discriminated unions (rule conditions/actions, visuals) were rendered as
    // "object|object|…", hiding every valid `kind`. Name each variant instead.
    const options = (inner.options ?? []) as AnySchema[];
    const variants = options.map((option) => variantName(option, depth + 1));
    return variants.join(" | ");
  }
  if (kind === "null") return "null";
  return kind;
}

/** `{kind:"set-variable", name, op?, value}` for one union variant. */
function variantName(option: AnySchema, depth: number): string {
  const { schema: inner } = unwrapOptional(option);
  if (inner?.type !== "object" || !inner.shape) return typeName(option, depth);
  const fields = Object.entries(inner.shape).map(([name, field]) => {
    const { schema: fieldInner, optional } = unwrapOptional(field as AnySchema);
    const literal = fieldInner?.type === "literal" ? (fieldInner as any).value ?? (fieldInner as any).values?.[0] : undefined;
    if (literal !== undefined) return `${name}:${JSON.stringify(literal)}`;
    if (fieldInner?.type === "enum") return `${name}${optional ? "?" : ""}: enum(${((fieldInner.options ?? []) as string[]).join("|")})`;
    return `${name}${optional ? "?" : ""}`;
  });
  return `{${fields.join(", ")}}`;
}

/** Behaviour types with their params, so `behaviors` and `behavior.add` can be filled correctly. */
export function behaviorParamReference(): string[] {
  return BEHAVIOR_CATALOG.map((entry: any) => {
    const params = (entry.params ?? []).map((param: any) => `${param.key}: ${param.type}${param.default !== undefined && param.default !== "" ? ` = ${JSON.stringify(param.default)}` : ""}`);
    return `${entry.type}{${params.join(", ")}} - ${entry.description ?? ""}`.trim();
  });
}

function helpFor(type: string): CommandHelp | null {
  const definition = commandDefinitions().find((candidate) => candidate.type === type);
  if (!definition) return null;
  const schema = definition.schema as unknown as AnySchema;
  const shape = schema.shape ?? {};
  let label = definition.type;
  try {
    label = definition.label({} as never) || definition.type;
  } catch {
    // Labels may read args; the type is enough of a fallback here.
  }
  return {
    type: definition.type,
    label,
    args: Object.entries(shape).map(([name, field]) => {
      const { optional } = unwrapOptional(field as AnySchema);
      return { name, type: typeName(field as AnySchema, 0), required: !optional };
    }),
  };
}

/** Every command with its argument names and types, ready for the agent. */
export function commandReference(): CommandHelp[] {
  return commandDefinitions()
    .map((definition) => helpFor(definition.type))
    .filter((help): help is CommandHelp => help !== null);
}

/** One-line signature, e.g. `object.update(sceneId: string, patch: object{x?: number})`. */
export function signatureFor(type: string): string | null {
  const help = helpFor(type);
  if (!help) return null;
  return `${help.type}(${help.args.map((arg) => `${arg.name}${arg.required ? "" : "?"}: ${arg.type}`).join(", ")})`;
}

/** Appended to a rejected command so the next attempt can be correct. */
export function expectedArgsHint(type: string): string {
  const signature = signatureFor(type);
  if (!signature) {
    const known = commandDefinitions().map((definition) => definition.type);
    return `Unknown command "${type}". Known commands: ${known.slice(0, 40).join(", ")}${known.length > 40 ? ", …" : ""}.`;
  }
  // Signatures for patch-style commands are long; keep the head (arg names and
  // the nested keys that matter) rather than spending the whole tool result on it.
  const trimmed = signature.length > 600 ? `${signature.slice(0, 600)}…` : signature;
  return `Expected args: ${trimmed}.`;
}
