/**
 * Pure TypeScript A2UI v1.0 reactive ComponentNode resolver (Stage C5).
 *
 * Resolves a surface's flat component dictionary into a reactive tree of
 * `ComponentNode`s with scoped data bindings (`ResolvedBinding` /
 * `WritableBinding`), template repeaters preserving surviving node identity,
 * pending/unknown-type/cyclic placeholders, separate metadata reactivity,
 * reactive `@checks` validation state, dispatch-time actions, and complete
 * subscription disposal.
 *
 * Zero `nsh` or I/O imports (Design Rules 1–3).
 */

import {
  deriveCollectionIndicesFromScope,
  dispatchAction as dispatchCoreAction,
  type ActionDispatchResult,
  type ActionHandler,
  type ClockSeam,
} from "./actions";
import {
  CatalogRegistry,
  type Catalog,
  type ComponentMetadata,
} from "./catalog";
import {
  DataContext,
  deepEqual,
  type DataSubscription,
} from "./data_model";
import {
  isCallExpression,
  isPathExpression,
  isV1DataBinding,
  isV1FunctionCall,
  parseExpressionTemplate,
  type ExpressionPart,
} from "./expression";
import {
  FunctionRegistry,
  coerceDynamicBoolean,
  evaluateCheckRules,
  evaluateDynamicValue,
  type FunctionExecutionContext,
  type UrlOpener,
} from "./functions";
import { isJsonObject, resolveLocalRef, type JsonObject } from "./json_schema";
import {
  encodePointerSegment,
  resolvePath,
  type CanonicalPointer,
} from "./pointer";
import type {
  ComponentChange,
  ComponentModel,
  MessageProcessor,
  SurfaceModel,
} from "./processor";
import { RpcManager } from "./rpc";

/** Component type name used for `pending` placeholder nodes. */
export const PLACEHOLDER_TYPE = "Placeholder" as const;

/** Resolution state of a node in the reactive component tree. */
export type NodeState = "resolved" | "pending" | "unknown-type" | "cyclic";

/** Resolved component property dictionary. */
export type NodeProps = Record<string, unknown>;

/** Optional per-dispatch metadata and activation flags passed when invoking a `NodeAction`. */
export interface NodeActionDispatchOptions {
  readonly metadata?: ComponentMetadata;
  readonly userActivation?: boolean;
}

/** Bound action closure exposed on a `ComponentNode`'s action properties. */
export type NodeAction = (
  options?: NodeActionDispatchOptions,
) => Promise<ActionDispatchResult>;

/**
 * Immutable snapshot of a resolved dynamic value in a `ComponentNode`'s props.
 * Literal and `@call` values resolve to read-only `ResolvedBinding` instances.
 */
export class ResolvedBinding<T = unknown> {
  readonly value: T;

  constructor(value: T) {
    this.value = value;
  }
}

/**
 * Writable dynamic binding backed by a mutable `DataModel` path.
 * Calling `set(nextValue)` writes through the node's scoped data path.
 */
export class WritableBinding<T = unknown> extends ResolvedBinding<T> {
  readonly set: (value: T) => void;
  /** Authored `@path` string before scope resolution. */
  readonly path: string;
  /** Canonical RFC 6901 pointer resolved against the node's `dataPath`. */
  readonly resolvedPath: CanonicalPointer;

  constructor(
    value: T,
    set: (value: T) => void,
    path: string,
    resolvedPath: CanonicalPointer,
  ) {
    super(value);
    this.set = set;
    this.path = path;
    this.resolvedPath = resolvedPath;
  }
}

/** Type guard narrowing a `ResolvedBinding` to a `WritableBinding`. */
export function isWritable<T>(
  binding: ResolvedBinding<T>,
): binding is WritableBinding<T> {
  return binding instanceof WritableBinding;
}

/**
 * Structural equivalence check for two `ResolvedBinding` snapshots used by
 * change-detection stabilization.
 */
export function sameBinding(
  a: ResolvedBinding<unknown>,
  b: ResolvedBinding<unknown>,
): boolean {
  if (isWritable(a) !== isWritable(b)) {
    return false;
  }
  if (
    isWritable(a) &&
    isWritable(b) &&
    (a.path !== b.path || a.resolvedPath !== b.resolvedPath)
  ) {
    return false;
  }
  return deepEqual(a.value, b.value);
}

/** Public read-only contract for a resolved node in the component tree. */
export interface ComponentNode<TProps extends NodeProps = NodeProps> {
  /** Distinct sibling identifier (includes scoped path and `#n` duplicate ordinal). */
  readonly instanceId: string;
  /** Document-unique runtime node identifier assigned on creation. */
  readonly id: string;
  /** Component ID from the A2UI payload. */
  readonly componentId: string;
  /** Catalog component type (or `"Placeholder"` for pending nodes). */
  readonly type: string;
  /** Resolved catalog ID, or `undefined` on pending/cyclic placeholders without a model. */
  readonly catalogId: string | undefined;
  /** Canonical data-model scope path this node resolves against (e.g. `"/"`, `"/people/0"`). */
  readonly dataPath: CanonicalPointer;
  /** Resolution state (`resolved`, `pending`, `unknown-type`, `cyclic`). */
  readonly state: NodeState;
  /** True whenever `state !== "resolved"`. */
  readonly isPlaceholder: boolean;
  /** True after this node has been disposed. */
  readonly disposed: boolean;
  /** Current resolved properties snapshot. */
  readonly props: TProps;
  /** Current envelope metadata (tracked independently from `props`). */
  readonly metadata: ComponentMetadata | undefined;
  /** Current resolved `@accessibility` attributes, if declared on the component. */
  readonly accessibility: Readonly<Record<string, unknown>> | undefined;
  /** Subscribes to changes in `props` (does not fire on metadata-only updates). */
  onPropsChange(listener: (props: TProps) => void): () => void;
  /** Subscribes to changes in envelope `metadata` (independent of `props`). */
  onMetadataChange(
    listener: (metadata: ComponentMetadata | undefined) => void,
  ): () => void;
  /** Subscribes to changes in resolved `@accessibility` attributes (independent of `props`). */
  onAccessibilityChange(
    listener: (
      accessibility: Readonly<Record<string, unknown>> | undefined,
    ) => void,
  ): () => void;
  /** Subscribes to node destruction (fires at most once, on disposal). */
  onDestroyed(listener: () => void): () => void;
  /** Registers a cleanup callback executed when this node is disposed. */
  addCleanup(cleanup: () => void): void;
  /** Serializes this node and its subtree into plain JSON for debugging/tests. */
  toJSON(): Record<string, unknown>;
}

/** Type guard narrowing an unknown value to a `ComponentNode`. */
export function isComponentNode(value: unknown): value is ComponentNode {
  return value instanceof MutableComponentNode;
}

let nextNodeIdCounter = 1;
function allocateNodeId(): string {
  const id = `a2ui-node-${nextNodeIdCounter}`;
  nextNodeIdCounter += 1;
  return id;
}

const ID_PART_ESCAPES: Readonly<Record<string, string>> = {
  "~": "~0",
  "#": "~1",
  "[": "~2",
  "]": "~3",
  ">": "~4",
  "@": "~5",
};

function escapeIdPart(part: string): string {
  return part.replace(/[~#[\]>@]/g, (m) => ID_PART_ESCAPES[m]!);
}

function instanceIdFor(
  componentId: string,
  dataPath: CanonicalPointer,
  occurrence: number,
): string {
  const trimmed =
    dataPath.length > 1 ? dataPath.replace(/\/+$/, "") : "/";
  const base =
    trimmed === "/"
      ? escapeIdPart(componentId)
      : `${escapeIdPart(componentId)}-[${escapeIdPart(trimmed)}]`;
  return occurrence > 1 ? `${base}#${occurrence}` : base;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isComponentNode(value) ||
    value instanceof ResolvedBinding
  ) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function shallowEqualProps(a: NodeProps, b: NodeProps): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (let i = 0; i < keysA.length; i += 1) {
    const key = keysA[i]!;
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is(a[key], b[key])
    ) {
      return false;
    }
  }
  return true;
}

function serializeValue(value: unknown): unknown {
  if (isComponentNode(value)) {
    return value.toJSON();
  }
  if (value instanceof ResolvedBinding) {
    return serializeValue(value.value);
  }
  if (typeof value === "function") {
    return "<Action>";
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Mutable internal implementation of `ComponentNode` owned by `NodeResolver`.
 */
export class MutableComponentNode<TProps extends NodeProps = NodeProps>
  implements ComponentNode<TProps>
{
  readonly instanceId: string;
  readonly id = allocateNodeId();
  readonly componentId: string;
  readonly type: string;
  readonly catalogId: string | undefined;
  readonly dataPath: CanonicalPointer;
  readonly state: NodeState;

  private _props: TProps;
  private _metadata: ComponentMetadata | undefined;
  private _accessibility: Readonly<Record<string, unknown>> | undefined;
  private _disposed = false;
  private readonly propsListeners: Array<(props: TProps) => void> = [];
  private readonly metadataListeners: Array<
    (metadata: ComponentMetadata | undefined) => void
  > = [];
  private readonly accessibilityListeners: Array<
    (accessibility: Readonly<Record<string, unknown>> | undefined) => void
  > = [];
  private readonly destroyedListeners: Array<() => void> = [];
  private readonly cleanups: Array<() => void> = [];

  constructor(options: {
    readonly instanceId: string;
    readonly componentId: string;
    readonly type: string;
    readonly catalogId?: string;
    readonly dataPath: CanonicalPointer;
    readonly state: NodeState;
    readonly initialProps: TProps;
    readonly initialMetadata?: ComponentMetadata;
    readonly initialAccessibility?: Readonly<Record<string, unknown>>;
  }) {
    this.instanceId = options.instanceId;
    this.componentId = options.componentId;
    this.type = options.type;
    this.catalogId = options.catalogId;
    this.dataPath = options.dataPath;
    this.state = options.state;
    this._props = options.initialProps;
    this._metadata = options.initialMetadata;
    this._accessibility = options.initialAccessibility;
  }

  get isPlaceholder(): boolean {
    return this.state !== "resolved";
  }

  get disposed(): boolean {
    return this._disposed;
  }

  get props(): TProps {
    return this._props;
  }

  get metadata(): ComponentMetadata | undefined {
    return this._metadata;
  }

  get accessibility(): Readonly<Record<string, unknown>> | undefined {
    return this._accessibility;
  }

  onPropsChange(listener: (props: TProps) => void): () => void {
    this.propsListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.propsListeners.indexOf(listener);
      if (idx >= 0) {
        this.propsListeners.splice(idx, 1);
      }
    };
  }

  onMetadataChange(
    listener: (metadata: ComponentMetadata | undefined) => void,
  ): () => void {
    this.metadataListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.metadataListeners.indexOf(listener);
      if (idx >= 0) {
        this.metadataListeners.splice(idx, 1);
      }
    };
  }

  onAccessibilityChange(
    listener: (
      accessibility: Readonly<Record<string, unknown>> | undefined,
    ) => void,
  ): () => void {
    this.accessibilityListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.accessibilityListeners.indexOf(listener);
      if (idx >= 0) {
        this.accessibilityListeners.splice(idx, 1);
      }
    };
  }

  onDestroyed(listener: () => void): () => void {
    this.destroyedListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.destroyedListeners.indexOf(listener);
      if (idx >= 0) {
        this.destroyedListeners.splice(idx, 1);
      }
    };
  }

  addCleanup(cleanup: () => void): void {
    if (this._disposed) {
      cleanup();
      return;
    }
    this.cleanups.push(cleanup);
  }

  setProps(next: TProps, suppressNotify = false): boolean {
    if (this._disposed) {
      return false;
    }
    if (shallowEqualProps(this._props, next)) {
      return false;
    }
    this._props = next;
    if (!suppressNotify && this.propsListeners.length > 0) {
      const snapshot = this.propsListeners.slice();
      for (let i = 0; i < snapshot.length; i += 1) {
        if (!this._disposed) {
          snapshot[i]!(next);
        }
      }
    }
    return true;
  }

  setMetadata(next: ComponentMetadata | undefined): boolean {
    if (this._disposed) {
      return false;
    }
    if (deepEqual(this._metadata, next)) {
      return false;
    }
    this._metadata = next;
    if (this.metadataListeners.length > 0) {
      const snapshot = this.metadataListeners.slice();
      for (let i = 0; i < snapshot.length; i += 1) {
        if (!this._disposed) {
          snapshot[i]!(next);
        }
      }
    }
    return true;
  }

  setAccessibility(
    next: Readonly<Record<string, unknown>> | undefined,
    suppressNotify = false,
  ): boolean {
    if (this._disposed) {
      return false;
    }
    if (deepEqual(this._accessibility, next)) {
      return false;
    }
    this._accessibility = next;
    if (!suppressNotify && this.accessibilityListeners.length > 0) {
      const snapshot = this.accessibilityListeners.slice();
      for (let i = 0; i < snapshot.length; i += 1) {
        if (!this._disposed) {
          snapshot[i]!(next);
        }
      }
    }
    return true;
  }

  toJSON(): Record<string, unknown> {
    if (this.isPlaceholder) {
      return { id: this.componentId, type: this.type, state: this.state };
    }
    const out: Record<string, unknown> = {
      id: this.componentId,
      type: this.type,
    };
    for (const [key, val] of Object.entries(this._props)) {
      out[key] = serializeValue(val);
    }
    if (this._metadata !== undefined) {
      out["metadata"] = this._metadata;
    }
    return out;
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    const cleanups = this.cleanups.splice(0, this.cleanups.length);
    for (let i = 0; i < cleanups.length; i += 1) {
      cleanups[i]!();
    }
    const destroyed = this.destroyedListeners.splice(
      0,
      this.destroyedListeners.length,
    );
    for (let i = 0; i < destroyed.length; i += 1) {
      destroyed[i]!();
    }
    this.propsListeners.length = 0;
    this.metadataListeners.length = 0;
    this.accessibilityListeners.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Schema inspection: classifies properties into dynamic, action, structural,
// nested child references, and static shapes.
// ---------------------------------------------------------------------------

type RefFieldSpec =
  | { readonly kind: "single" }
  | { readonly kind: "list" }
  | { readonly kind: "nested"; readonly keys: ReadonlySet<string> };

type BehaviorNode =
  | {
      readonly type: "DYNAMIC";
      readonly coerceBoolean: boolean;
      readonly objectShape?: Readonly<Record<string, BehaviorNode>>;
    }
  | { readonly type: "ACTION" }
  | { readonly type: "STRUCTURAL" }
  | { readonly type: "STATIC" }
  | { readonly type: "ARRAY"; readonly element: BehaviorNode }
  | {
      readonly type: "OBJECT";
      readonly shape: Readonly<Record<string, BehaviorNode>>;
      readonly catchall?: BehaviorNode;
    };

interface ComponentSchemaInfo {
  readonly refFields: ReadonlyMap<string, RefFieldSpec>;
  readonly behavior: BehaviorNode;
}

const schemaInfoCache = new WeakMap<
  Catalog,
  Map<string, ComponentSchemaInfo>
>();

const DYNAMIC_REF_SUFFIXES: ReadonlySet<string> = new Set([
  "DynamicString",
  "DynamicNumber",
  "DynamicBoolean",
  "DynamicStringList",
  "DynamicValue",
  "DataBinding",
  "FunctionCall",
]);

function extractDefName(ref: string): string | undefined {
  const hashIdx = ref.indexOf("#/$defs/");
  if (hashIdx >= 0) {
    return ref.slice(hashIdx + "#/$defs/".length);
  }
  return undefined;
}

function isChildRefName(name: string | undefined): boolean {
  return name === "Child" || name === "ComponentId";
}

function isChildListRefName(name: string | undefined): boolean {
  return name === "ChildList";
}

function resolveSchemaNode(
  schema: unknown,
  rootSchema: JsonObject,
  seen: Set<string>,
): JsonObject | undefined {
  if (!isJsonObject(schema)) {
    return undefined;
  }
  const ref = schema["$ref"];
  if (typeof ref === "string" && ref.startsWith("#/")) {
    if (seen.has(ref)) {
      return undefined;
    }
    const target = resolveLocalRef(rootSchema, ref);
    if (isJsonObject(target)) {
      const nextSeen = new Set(seen);
      nextSeen.add(ref);
      return resolveSchemaNode(target, rootSchema, nextSeen);
    }
  }
  return schema;
}

function classifyBehavior(
  rawSchema: unknown,
  rootSchema: JsonObject,
  seen: Set<string>,
): BehaviorNode {
  if (!isJsonObject(rawSchema)) {
    return { type: "STATIC" };
  }

  const ref = rawSchema["$ref"];
  if (typeof ref === "string") {
    const defName = extractDefName(ref);
    if (defName !== undefined) {
      if (defName === "DynamicBoolean") {
        return { type: "DYNAMIC", coerceBoolean: true };
      }
      if (DYNAMIC_REF_SUFFIXES.has(defName)) {
        return { type: "DYNAMIC", coerceBoolean: false };
      }
      if (defName === "Action") {
        return { type: "ACTION" };
      }
      if (isChildRefName(defName) || isChildListRefName(defName)) {
        return { type: "STRUCTURAL" };
      }
    }
    if (ref.startsWith("#/") && !seen.has(ref)) {
      const resolved = resolveLocalRef(rootSchema, ref);
      if (isJsonObject(resolved)) {
        const nextSeen = new Set(seen);
        nextSeen.add(ref);
        return classifyBehavior(resolved, rootSchema, nextSeen);
      }
    }
  }

  // Check oneOf / anyOf unions (e.g. inline `{ oneOf: [{ type: "boolean" }, DataBinding, FunctionCall] }`).
  const unionBranches = (
    Array.isArray(rawSchema["oneOf"])
      ? rawSchema["oneOf"]
      : Array.isArray(rawSchema["anyOf"])
        ? rawSchema["anyOf"]
        : undefined
  ) as readonly unknown[] | undefined;

  if (unionBranches && unionBranches.length > 0) {
    let hasDynamicBranch = false;
    let hasBooleanBranch = false;
    let hasActionBranch = false;
    let hasStructuralBranch = false;
    let mergedObjectShape: Record<string, BehaviorNode> | undefined;

    for (let i = 0; i < unionBranches.length; i += 1) {
      const branch = unionBranches[i];
      if (isJsonObject(branch) && branch["type"] === "boolean") {
        hasBooleanBranch = true;
      }
      const classified = classifyBehavior(branch, rootSchema, seen);
      if (classified.type === "DYNAMIC") {
        hasDynamicBranch = true;
        if (classified.coerceBoolean) {
          hasBooleanBranch = true;
        }
      } else if (classified.type === "ACTION") {
        hasActionBranch = true;
      } else if (classified.type === "STRUCTURAL") {
        hasStructuralBranch = true;
      } else if (
        classified.type === "OBJECT" &&
        Object.keys(classified.shape).length > 0
      ) {
        mergedObjectShape = { ...(mergedObjectShape ?? {}), ...classified.shape };
      }
    }

    if (hasDynamicBranch) {
      return mergedObjectShape
        ? {
            type: "DYNAMIC",
            coerceBoolean: hasBooleanBranch,
            objectShape: mergedObjectShape,
          }
        : { type: "DYNAMIC", coerceBoolean: hasBooleanBranch };
    }
    if (hasActionBranch) {
      return { type: "ACTION" };
    }
    if (hasStructuralBranch) {
      return { type: "STRUCTURAL" };
    }
  }

  // Merge allOf object branches if present.
  if (Array.isArray(rawSchema["allOf"])) {
    const mergedShape: Record<string, BehaviorNode> = {};
    let catchall: BehaviorNode | undefined;
    for (let i = 0; i < rawSchema["allOf"].length; i += 1) {
      const sub = classifyBehavior(rawSchema["allOf"][i], rootSchema, seen);
      if (sub.type === "OBJECT") {
        for (const [k, v] of Object.entries(sub.shape)) {
          mergedShape[k] = v;
        }
        if (sub.catchall) {
          catchall = sub.catchall;
        }
      }
    }
    if (isJsonObject(rawSchema["properties"])) {
      for (const [k, propSchema] of Object.entries(rawSchema["properties"])) {
        mergedShape[k] = classifyBehavior(propSchema, rootSchema, seen);
      }
    }
    if (isJsonObject(rawSchema["additionalProperties"])) {
      catchall = classifyBehavior(
        rawSchema["additionalProperties"],
        rootSchema,
        seen,
      );
    }
    return { type: "OBJECT", shape: mergedShape, catchall };
  }

  if (rawSchema["type"] === "array" && rawSchema["items"] !== undefined) {
    return {
      type: "ARRAY",
      element: classifyBehavior(rawSchema["items"], rootSchema, seen),
    };
  }

  if (
    rawSchema["type"] === "object" ||
    isJsonObject(rawSchema["properties"])
  ) {
    const shape: Record<string, BehaviorNode> = {};
    if (isJsonObject(rawSchema["properties"])) {
      for (const [k, propSchema] of Object.entries(rawSchema["properties"])) {
        shape[k] = classifyBehavior(propSchema, rootSchema, seen);
      }
    }
    const catchall = isJsonObject(rawSchema["additionalProperties"])
      ? classifyBehavior(rawSchema["additionalProperties"], rootSchema, seen)
      : undefined;
    return { type: "OBJECT", shape, catchall };
  }

  return { type: "STATIC" };
}

function classifyRefField(
  propSchema: unknown,
  rootSchema: JsonObject,
): RefFieldSpec | undefined {
  if (!isJsonObject(propSchema)) {
    return undefined;
  }
  const ref = propSchema["$ref"];
  if (typeof ref === "string") {
    const defName = extractDefName(ref);
    if (isChildRefName(defName)) {
      return { kind: "single" };
    }
    if (isChildListRefName(defName)) {
      return { kind: "list" };
    }
  }
  const resolved = resolveSchemaNode(propSchema, rootSchema, new Set());
  if (!resolved) {
    return undefined;
  }
  if (resolved["type"] === "array" && isJsonObject(resolved["items"])) {
    const items = resolved["items"];
    const itemRef = items["$ref"];
    if (typeof itemRef === "string") {
      const defName = extractDefName(itemRef);
      if (isChildRefName(defName)) {
        return { kind: "list" };
      }
    }
    const resolvedItem = resolveSchemaNode(items, rootSchema, new Set());
    if (resolvedItem && isJsonObject(resolvedItem["properties"])) {
      const nestedKeys = new Set<string>();
      for (const [subKey, subSchema] of Object.entries(
        resolvedItem["properties"],
      )) {
        const subRef = classifyRefField(subSchema, rootSchema);
        if (subRef && (subRef.kind === "single" || subRef.kind === "list")) {
          nestedKeys.add(subKey);
        }
      }
      if (nestedKeys.size > 0) {
        return { kind: "nested", keys: nestedKeys };
      }
    }
  }
  return undefined;
}

function collectObjectPropertiesFromSchema(
  schema: JsonObject,
  rootSchema: JsonObject,
  out: Record<string, unknown>,
  seen: Set<string>,
): void {
  const ref = schema["$ref"];
  if (typeof ref === "string" && ref.startsWith("#/") && !seen.has(ref)) {
    const target = resolveLocalRef(rootSchema, ref);
    if (isJsonObject(target)) {
      const nextSeen = new Set(seen);
      nextSeen.add(ref);
      collectObjectPropertiesFromSchema(target, rootSchema, out, nextSeen);
    }
  }
  if (Array.isArray(schema["allOf"])) {
    for (let i = 0; i < schema["allOf"].length; i += 1) {
      const branch = schema["allOf"][i];
      if (isJsonObject(branch)) {
        collectObjectPropertiesFromSchema(branch, rootSchema, out, seen);
      }
    }
  }
  if (isJsonObject(schema["properties"])) {
    for (const [k, v] of Object.entries(schema["properties"])) {
      out[k] = v;
    }
  }
}

function inspectComponentSchema(
  catalog: Catalog,
  compType: string,
): ComponentSchemaInfo {
  let byType = schemaInfoCache.get(catalog);
  if (!byType) {
    byType = new Map();
    schemaInfoCache.set(catalog, byType);
  }
  const cached = byType.get(compType);
  if (cached) {
    return cached;
  }

  const rootSchema = catalog.getValidationSchemaRef();
  const compSchemas = rootSchema["components"] as JsonObject | undefined;
  const rawCompSchema = compSchemas?.[compType] ?? catalog.components.get(compType)?.schema;

  const refFields = new Map<string, RefFieldSpec>();
  let behavior: BehaviorNode = { type: "OBJECT", shape: {} };

  if (isJsonObject(rawCompSchema)) {
    behavior = classifyBehavior(rawCompSchema, rootSchema, new Set());
    const allProps: Record<string, unknown> = {};
    collectObjectPropertiesFromSchema(rawCompSchema, rootSchema, allProps, new Set());
    for (const [propName, propSchema] of Object.entries(allProps)) {
      if (propName === "id" || propName === "component") {
        continue;
      }
      const spec = classifyRefField(propSchema, rootSchema);
      if (spec) {
        refFields.set(propName, spec);
      }
    }
  }

  const info: ComponentSchemaInfo = { refFields, behavior };
  byType.set(compType, info);
  return info;
}

// ---------------------------------------------------------------------------
// Dependency path collection (discovers every canonical data path a component
// subscribes to, while excluding `Action` payloads which evaluate lazily).
// ---------------------------------------------------------------------------

function collectPathsFromExpressionParts(
  parts: readonly ExpressionPart[],
  scope: CanonicalPointer,
  out: Set<CanonicalPointer>,
): void {
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (isPathExpression(part)) {
      out.add(resolvePath(part.path, scope));
    } else if (isCallExpression(part)) {
      for (const argVal of Object.values(part.args)) {
        if (typeof argVal === "object" && argVal !== null) {
          if (isPathExpression(argVal)) {
            out.add(resolvePath(argVal.path, scope));
          } else if (isCallExpression(argVal)) {
            collectPathsFromExpressionParts([argVal], scope, out);
          }
        }
      }
    }
  }
}

function collectDynamicPaths(
  value: unknown,
  scope: CanonicalPointer,
  out: Set<CanonicalPointer>,
): void {
  if (value === null || value === undefined || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      collectDynamicPaths(value[i], scope, out);
    }
    return;
  }
  if (isV1DataBinding(value)) {
    out.add(resolvePath(value["@path"], scope));
    return;
  }
  if (isV1FunctionCall(value)) {
    const fnName = value["@call"];
    const args = value["args"];
    if (args && isPlainObject(args)) {
      if (fnName === "formatString" && typeof args["value"] === "string") {
        try {
          const parts = parseExpressionTemplate(args["value"]);
          collectPathsFromExpressionParts(parts, scope, out);
        } catch {
          // Malformed template string will surface during evaluation.
        }
      }
      for (const argVal of Object.values(args)) {
        collectDynamicPaths(argVal, scope, out);
      }
    }
    return;
  }
  for (const val of Object.values(value as Record<string, unknown>)) {
    collectDynamicPaths(val, scope, out);
  }
}

function isActionObject(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    return false;
  }
  const key = keys[0]!;
  return (
    (key === "event" || key === "functionCall") && isPlainObject(value[key])
  );
}

/**
 * Preserves reference identity for unchanged values across materializations so
 * `MutableComponentNode.setProps` shallow comparison never emits spurious
 * notifications.
 */
function stabilize(prev: unknown, next: unknown): unknown {
  if (Object.is(prev, next)) {
    return next;
  }
  if (prev instanceof ResolvedBinding && next instanceof ResolvedBinding) {
    return sameBinding(prev, next) ? prev : next;
  }
  if (isComponentNode(prev) || isComponentNode(next)) {
    return next;
  }
  if (
    Array.isArray(prev) &&
    Array.isArray(next) &&
    prev.length === next.length
  ) {
    let allSame = true;
    const out = new Array<unknown>(next.length);
    for (let i = 0; i < next.length; i += 1) {
      const item = stabilize(prev[i], next[i]);
      out[i] = item;
      if (!Object.is(item, prev[i])) {
        allSame = false;
      }
    }
    return allSame ? prev : out;
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (prevKeys.length === nextKeys.length) {
      let allSame = true;
      const out: Record<string, unknown> = {};
      for (let i = 0; i < nextKeys.length; i += 1) {
        const key = nextKeys[i]!;
        const item = stabilize(prev[key], next[key]);
        out[key] = item;
        if (
          !Object.prototype.hasOwnProperty.call(prev, key) ||
          !Object.is(item, prev[key])
        ) {
          allSame = false;
        }
      }
      return allSame ? prev : out;
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// NodeResolver
// ---------------------------------------------------------------------------

export interface NodeResolverOptions {
  readonly surface: SurfaceModel;
  /** Optional owning `MessageProcessor` (used for action dispatch, RPC, and function/catalog registries). */
  readonly processor?: MessageProcessor;
  /** Override root component ID (defaults to `"root"`). */
  readonly rootId?: string;
  /** Optional catalog registry when `processor` is not supplied. */
  readonly catalogRegistry?: CatalogRegistry;
  /** Optional function registry when `processor` is not supplied. */
  readonly functionRegistry?: FunctionRegistry;
  /** Optional action handler when `processor` is not supplied. */
  readonly onAction?: ActionHandler;
  /** Optional clock seam when `processor` is not supplied. */
  readonly nowIso?: ClockSeam;
  /** Optional URL opener seam when `processor` is not supplied. */
  readonly openUrl?: UrlOpener;
  /** Active BCP 47 locale tag for formatting functions. */
  readonly locale?: string;
}

interface ActionCacheEntry {
  readonly raw: unknown;
  readonly fn: NodeAction;
}

interface NodeRecord {
  readonly node: MutableComponentNode;
  readonly edgeKey: string;
  readonly occurrence: number;
  readonly depth: number;
  readonly parent?: MutableComponentNode;
  componentModel?: ComponentModel;
  schemaInfo?: ComponentSchemaInfo;
  childEdges: Map<string, MutableComponentNode>;
  readonly watchedPaths: Map<CanonicalPointer, DataSubscription>;
  readonly actionCache: Map<string, ActionCacheEntry>;
}

const ROOT_COMPONENT_ID = "root";
const ROOT_DATA_PATH: CanonicalPointer = "/";

/**
 * Resolves a `SurfaceModel`'s flat component dictionary into a live reactive
 * tree of `ComponentNode`s.
 */
export class NodeResolver {
  private readonly surface: SurfaceModel;
  private readonly processor?: MessageProcessor;
  private readonly rootId: string;
  private readonly catalogRegistry?: CatalogRegistry;
  private readonly functionRegistry: FunctionRegistry;
  private readonly onAction?: ActionHandler;
  private readonly nowIso?: ClockSeam;
  private readonly openUrl?: UrlOpener;
  private readonly locale?: string;

  private readonly records = new Map<MutableComponentNode, NodeRecord>();
  private readonly nodesByEdge = new Map<string, MutableComponentNode>();
  private readonly nodesByComponentId = new Map<
    string,
    Set<MutableComponentNode>
  >();
  private readonly pendingParents = new Map<
    string,
    Set<MutableComponentNode>
  >();
  /** Deduplicated error records: componentId -> dataPath -> Set<code>. */
  private readonly dispatchedErrors = new Map<
    string,
    Map<string, Set<string>>
  >();
  private readonly dirtyRecords = new Set<NodeRecord>();
  private readonly rootListeners: Array<
    (root: ComponentNode | undefined) => void
  > = [];
  private readonly surfaceUnsubs: Array<() => void> = [];

  private rootRecord?: NodeRecord;
  private _rootNode: ComponentNode | undefined;
  private _disposed = false;

  constructor(options: NodeResolverOptions) {
    this.surface = options.surface;
    this.processor = options.processor;
    this.rootId = options.rootId ?? ROOT_COMPONENT_ID;
    this.catalogRegistry = options.catalogRegistry ?? options.processor?.registry;
    this.functionRegistry =
      options.functionRegistry ??
      options.processor?.functionRegistry ??
      FunctionRegistry.withBasicV1();
    this.onAction = options.onAction;
    this.nowIso = options.nowIso;
    this.openUrl = options.openUrl;
    this.locale = options.locale;

    this.surfaceUnsubs.push(
      this.surface.onComponentsChanged((changes) =>
        this.onComponentsChanged(changes),
      ),
      this.surface.onComponentRemoved((id) => this.onComponentRemoved(id)),
      this.surface.onDisposed(() => this.dispose()),
      this.surface.dataModel.onAfterCommit(() => this.flushDirtyRecords()),
    );

    if (this.surface.components.has(this.rootId)) {
      this.buildRoot();
    }
  }

  /** Current resolved root `ComponentNode`, or `undefined` until `root` arrives. */
  get rootNode(): ComponentNode | undefined {
    return this._rootNode;
  }

  /** Number of currently mounted live nodes (including placeholders). */
  get activeNodeCount(): number {
    return this.records.size;
  }

  /** Whether this resolver has been disposed. */
  get disposed(): boolean {
    return this._disposed;
  }

  /** Subscribes to root node replacement / appearance / removal. */
  onRootNodeChange(
    listener: (root: ComponentNode | undefined) => void,
  ): () => void {
    this.rootListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.rootListeners.indexOf(listener);
      if (idx >= 0) {
        this.rootListeners.splice(idx, 1);
      }
    };
  }

  /** Tears down the entire resolved node tree and disconnects all listeners. Idempotent. */
  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    for (let i = 0; i < this.surfaceUnsubs.length; i += 1) {
      this.surfaceUnsubs[i]!();
    }
    this.surfaceUnsubs.length = 0;
    this.dirtyRecords.clear();

    const allNodes = Array.from(this.records.keys());
    for (let i = 0; i < allNodes.length; i += 1) {
      this.disposeNode(allNodes[i]!);
    }
    this.pendingParents.clear();
    this.dispatchedErrors.clear();
    this.rootRecord = undefined;
    this.setRootNode(undefined);
    this.rootListeners.length = 0;
  }

  private setRootNode(next: ComponentNode | undefined): void {
    if (Object.is(this._rootNode, next)) {
      return;
    }
    this._rootNode = next;
    if (this.rootListeners.length > 0) {
      const snapshot = this.rootListeners.slice();
      for (let i = 0; i < snapshot.length; i += 1) {
        snapshot[i]!(next);
      }
    }
  }

  private dispatchOnce(
    code: string,
    componentId: string,
    dataPath: string,
    message: string,
  ): void {
    let byPath = this.dispatchedErrors.get(componentId);
    if (!byPath) {
      byPath = new Map();
      this.dispatchedErrors.set(componentId, byPath);
    }
    let codes = byPath.get(dataPath);
    if (!codes) {
      codes = new Set();
      byPath.set(dataPath, codes);
    }
    if (codes.has(code)) {
      return;
    }
    codes.add(code);
    this.surface.emitError(code, message);
  }

  private clearDispatched(componentId: string, dataPath: string): void {
    const byPath = this.dispatchedErrors.get(componentId);
    if (byPath?.delete(dataPath) && byPath.size === 0) {
      this.dispatchedErrors.delete(componentId);
    }
  }

  private buildRoot(): void {
    if (this.rootRecord || this._disposed) {
      return;
    }
    const rootEdgeKey = `>${escapeIdPart(this.rootId)}>${escapeIdPart(this.rootId)}@/`;
    const node = this.createNode(
      this.rootId,
      ROOT_DATA_PATH,
      rootEdgeKey,
      undefined,
      1,
      0,
    );
    this.rootRecord = this.records.get(node);
    this.setRootNode(node);
  }

  private onComponentsChanged(changes: readonly ComponentChange[]): void {
    if (this._disposed) {
      return;
    }

    const parentsToRefresh = new Set<MutableComponentNode>();
    const recordsToUpdateInPlace: NodeRecord[] = [];
    let rebuildRoot = false;

    for (let i = 0; i < changes.length; i += 1) {
      const change = changes[i]!;
      const model = change.next;

      if (change.id === this.rootId) {
        if (!this.rootRecord) {
          rebuildRoot = true;
        } else {
          const sameTypeAndCatalog =
            this.rootRecord.node.state === "resolved" &&
            this.rootRecord.node.type === model.type &&
            this.rootRecord.node.catalogId === model.catalogId;
          if (!sameTypeAndCatalog) {
            rebuildRoot = true;
          } else {
            this.rootRecord.componentModel = model;
            this.rootRecord.node.setMetadata(model.metadata);
            recordsToUpdateInPlace.push(this.rootRecord);
          }
        }
      }

      // Notify any parents holding a pending placeholder for this component ID.
      const waiting = this.pendingParents.get(change.id);
      if (waiting) {
        this.pendingParents.delete(change.id);
        for (const parent of waiting) {
          if (!parent.disposed) {
            parentsToRefresh.add(parent);
          }
        }
      }

      // Check existing live non-root nodes for this component ID.
      const existingNodes = this.nodesByComponentId.get(change.id);
      if (existingNodes) {
        for (const node of existingNodes) {
          const rec = this.records.get(node);
          if (!rec || !rec.parent || node.disposed) {
            continue;
          }
          const sameTypeAndCatalog =
            node.state === "resolved" &&
            node.type === model.type &&
            node.catalogId === model.catalogId;
          if (!sameTypeAndCatalog) {
            parentsToRefresh.add(rec.parent);
          } else {
            rec.componentModel = model;
            node.setMetadata(model.metadata);
            recordsToUpdateInPlace.push(rec);
          }
        }
      }
    }

    if (rebuildRoot) {
      if (this.rootRecord) {
        this.disposeNode(this.rootRecord.node);
        this.rootRecord = undefined;
      }
      if (this.surface.components.has(this.rootId)) {
        this.buildRoot();
      } else {
        this.setRootNode(undefined);
      }
    }

    // Re-materialize updated records and affected parents top-down by depth.
    const toMaterialize = new Set<NodeRecord>();
    for (let i = 0; i < recordsToUpdateInPlace.length; i += 1) {
      const rec = recordsToUpdateInPlace[i]!;
      if (!rec.node.disposed) {
        toMaterialize.add(rec);
      }
    }
    for (const parent of parentsToRefresh) {
      const rec = this.records.get(parent);
      if (rec && !rec.node.disposed) {
        toMaterialize.add(rec);
      }
    }

    if (toMaterialize.size > 0) {
      const sorted = Array.from(toMaterialize).sort((a, b) => a.depth - b.depth);
      for (let i = 0; i < sorted.length; i += 1) {
        const rec = sorted[i]!;
        if (!rec.node.disposed) {
          this.materialize(rec, false);
        }
      }
    }
  }

  private onComponentRemoved(id: string): void {
    if (this._disposed) {
      return;
    }
    this.dispatchedErrors.delete(id);
    const affected = this.nodesByComponentId.get(id);
    if (!affected) {
      return;
    }

    const parentsToRefresh = new Set<MutableComponentNode>();
    let rootAffected = false;

    for (const node of Array.from(affected)) {
      const rec = this.records.get(node);
      if (!rec) {
        continue;
      }
      if (rec.parent) {
        parentsToRefresh.add(rec.parent);
      } else {
        rootAffected = true;
      }
    }

    if (rootAffected && this.rootRecord) {
      this.disposeNode(this.rootRecord.node);
      this.rootRecord = undefined;
      this.setRootNode(undefined);
    }

    const sortedParents = Array.from(parentsToRefresh)
      .map((p) => this.records.get(p))
      .filter((r): r is NodeRecord => r !== undefined && !r.node.disposed)
      .sort((a, b) => a.depth - b.depth);

    for (let i = 0; i < sortedParents.length; i += 1) {
      const rec = sortedParents[i]!;
      if (!rec.node.disposed) {
        this.materialize(rec, false);
      }
    }
  }

  private flushDirtyRecords(): void {
    if (this._disposed || this.dirtyRecords.size === 0) {
      return;
    }
    const batch = Array.from(this.dirtyRecords).sort(
      (a, b) => a.depth - b.depth,
    );
    this.dirtyRecords.clear();
    for (let i = 0; i < batch.length; i += 1) {
      const rec = batch[i]!;
      if (!rec.node.disposed) {
        this.materialize(rec, false);
      }
    }
  }

  private createNode(
    componentId: string,
    dataPath: CanonicalPointer,
    edgeKey: string,
    parent: MutableComponentNode | undefined,
    occurrence: number,
    depth: number,
  ): MutableComponentNode {
    const model = this.surface.components.get(componentId);
    if (!model) {
      const node = new MutableComponentNode({
        instanceId: instanceIdFor(componentId, dataPath, occurrence),
        componentId,
        type: PLACEHOLDER_TYPE,
        dataPath,
        state: "pending",
        initialProps: {},
      });
      this.registerNode(node, { edgeKey, parent, occurrence, depth });
      if (parent) {
        this.registerPendingParent(componentId, parent);
      }
      return node;
    }

    const compDef = model.catalog.components.get(model.type);
    if (!compDef) {
      this.dispatchOnce(
        "UNKNOWN_COMPONENT_TYPE",
        componentId,
        dataPath,
        `Component '${componentId}' has type '${model.type}', which is not in catalog '${model.catalogId}'.`,
      );
      const node = new MutableComponentNode({
        instanceId: instanceIdFor(componentId, dataPath, occurrence),
        componentId,
        type: model.type,
        catalogId: model.catalogId,
        dataPath,
        state: "unknown-type",
        initialProps: {},
        initialMetadata: model.metadata,
      });
      this.registerNode(node, {
        edgeKey,
        parent,
        occurrence,
        depth,
        componentModel: model,
      });
      return node;
    }

    this.clearDispatched(componentId, dataPath);
    const schemaInfo = inspectComponentSchema(model.catalog, model.type);
    const node = new MutableComponentNode({
      instanceId: instanceIdFor(componentId, dataPath, occurrence),
      componentId,
      type: model.type,
      catalogId: model.catalogId,
      dataPath,
      state: "resolved",
      initialProps: {},
      initialMetadata: model.metadata,
    });
    const record = this.registerNode(node, {
      edgeKey,
      parent,
      occurrence,
      depth,
      componentModel: model,
      schemaInfo,
    });
    // Initial materialization seeds props synchronously without emitting an update.
    this.materialize(record, true);
    return node;
  }

  private registerNode(
    node: MutableComponentNode,
    partial: {
      readonly edgeKey: string;
      readonly parent?: MutableComponentNode;
      readonly occurrence: number;
      readonly depth: number;
      readonly componentModel?: ComponentModel;
      readonly schemaInfo?: ComponentSchemaInfo;
    },
  ): NodeRecord {
    const record: NodeRecord = {
      node,
      edgeKey: partial.edgeKey,
      occurrence: partial.occurrence,
      depth: partial.depth,
      parent: partial.parent,
      componentModel: partial.componentModel,
      schemaInfo: partial.schemaInfo,
      childEdges: new Map(),
      watchedPaths: new Map(),
      actionCache: new Map(),
    };
    this.records.set(node, record);
    this.nodesByEdge.set(partial.edgeKey, node);

    let byId = this.nodesByComponentId.get(node.componentId);
    if (!byId) {
      byId = new Set();
      this.nodesByComponentId.set(node.componentId, byId);
    }
    byId.add(node);
    return record;
  }

  private registerPendingParent(
    componentId: string,
    parent: MutableComponentNode,
  ): void {
    let waiting = this.pendingParents.get(componentId);
    if (!waiting) {
      waiting = new Set();
      this.pendingParents.set(componentId, waiting);
    }
    waiting.add(parent);
  }

  private isCyclic(
    componentId: string,
    dataPath: CanonicalPointer,
    parent: MutableComponentNode,
  ): boolean {
    for (
      let cur: MutableComponentNode | undefined = parent;
      cur !== undefined;
      cur = this.records.get(cur)?.parent
    ) {
      if (cur.componentId === componentId && cur.dataPath === dataPath) {
        return true;
      }
    }
    return false;
  }

  private childNode(
    componentId: string,
    dataPath: CanonicalPointer,
    edgeKey: string,
    parentRecord: NodeRecord,
    occurrence: number,
  ): MutableComponentNode {
    const parent = parentRecord.node;
    const childDepth = parentRecord.depth + 1;
    const existing = this.nodesByEdge.get(edgeKey);
    const model = this.surface.components.get(componentId);

    if (this.isCyclic(componentId, dataPath, parent)) {
      if (
        existing &&
        !existing.disposed &&
        existing.state === "cyclic" &&
        this.records.get(existing)?.occurrence === occurrence
      ) {
        return existing;
      }
      if (existing && !existing.disposed) {
        this.disposeNode(existing);
      }
      this.dispatchOnce(
        "CYCLIC_REFERENCE",
        componentId,
        dataPath,
        `Component '${componentId}' at '${dataPath}' is referenced by one of its own descendants; rendering a placeholder instead.`,
      );
      const cyclicNode = new MutableComponentNode({
        instanceId: instanceIdFor(componentId, dataPath, occurrence),
        componentId,
        type: model?.type ?? PLACEHOLDER_TYPE,
        catalogId: model?.catalogId,
        dataPath,
        state: "cyclic",
        initialProps: {},
      });
      this.registerNode(cyclicNode, {
        edgeKey,
        parent,
        occurrence,
        depth: childDepth,
      });
      return cyclicNode;
    }

    if (existing && !existing.disposed) {
      const compDef = model ? model.catalog.components.get(model.type) : undefined;
      const existingRec = this.records.get(existing);
      const upToDate =
        existing.componentId === componentId &&
        existing.dataPath === dataPath &&
        existingRec?.occurrence === occurrence &&
        (existing.isPlaceholder
          ? (model === undefined && existing.state === "pending") ||
            (model !== undefined &&
              compDef === undefined &&
              existing.state === "unknown-type" &&
              existing.type === model.type &&
              existing.catalogId === model.catalogId)
          : model !== undefined &&
            compDef !== undefined &&
            existing.type === model.type &&
            existing.catalogId === model.catalogId);

      if (upToDate) {
        if (existing.state === "pending") {
          this.registerPendingParent(componentId, parent);
        }
        return existing;
      }
      this.disposeNode(existing);
    }

    return this.createNode(
      componentId,
      dataPath,
      edgeKey,
      parent,
      occurrence,
      childDepth,
    );
  }

  private buildEvalContext(
    record: NodeRecord,
    model: ComponentModel,
  ): FunctionExecutionContext {
    return {
      dataContext: new DataContext(
        this.surface.dataModel,
        record.node.dataPath,
      ),
      collectionIndices: deriveCollectionIndicesFromScope(
        record.node.dataPath,
        this.surface.dataModel,
      ),
      surfaceId: this.surface.id,
      surfaceDefaultCatalogId: this.surface.defaultCatalogId,
      inheritedCatalogId: model.catalogId,
      catalogRegistry: this.catalogRegistry,
      functionRegistry: this.functionRegistry,
      caller: "renderer",
      userActivation: false,
      openUrl: this.openUrl,
      locale: this.locale,
    };
  }

  /**
   * Dispatches an A2UI v1.0 action payload (`{ event }` or `{ functionCall }`)
   * on behalf of `node`, exactly as a resolved `Action` property would: scoped
   * to the node's data path, with its component ID as `sourceComponentId`.
   *
   * For catalogs whose components name their actions in plain string
   * properties (such as a form's `submit`), so the renderer can build the
   * payload at press time instead of reading a resolved `Action` property.
   */
  dispatchNodeAction(
    node: ComponentNode,
    actionPayload: unknown,
    options?: NodeActionDispatchOptions,
  ): Promise<ActionDispatchResult> {
    return this.dispatchForNode(node, actionPayload, options);
  }

  private dispatchForNode(
    node: ComponentNode,
    rawAction: unknown,
    options?: NodeActionDispatchOptions,
  ): Promise<ActionDispatchResult> {
    const userActivation = options?.userActivation ?? true;
    const collectionIndices = deriveCollectionIndicesFromScope(
      node.dataPath,
      this.surface.dataModel,
    );
    if (this.processor) {
      return this.processor.dispatchAction({
        surfaceId: this.surface.id,
        sourceComponentId: node.componentId,
        actionPayload: rawAction,
        scope: node.dataPath,
        collectionIndices,
        metadata: options?.metadata,
        userActivation,
        locale: this.locale,
      });
    }
    const fallbackRpc = new RpcManager({
      catalogRegistry: this.catalogRegistry ?? new CatalogRegistry(),
      functionRegistry: this.functionRegistry,
      getSurface: (id) => (id === this.surface.id ? this.surface : undefined),
      openUrl: this.openUrl,
      locale: this.locale,
    });
    return dispatchCoreAction({
      rpc: fallbackRpc,
      surfaceId: this.surface.id,
      surfaceDefaultCatalogId: this.surface.defaultCatalogId,
      sourceComponentId: node.componentId,
      dataModel: this.surface.dataModel,
      actionPayload: rawAction,
      scope: node.dataPath,
      collectionIndices,
      metadata: options?.metadata,
      userActivation,
      locale: this.locale,
      openUrl: this.openUrl,
      nowIso: this.nowIso,
      onAction: this.onAction,
      isSurfaceAlive: () => !this.surface.disposed,
    });
  }

  private getOrCreateAction(
    record: NodeRecord,
    cacheKey: string,
    rawAction: Record<string, unknown>,
  ): NodeAction {
    const cached = record.actionCache.get(cacheKey);
    if (cached && deepEqual(cached.raw, rawAction)) {
      return cached.fn;
    }

    const fn: NodeAction = (options?: NodeActionDispatchOptions) =>
      this.dispatchForNode(record.node, rawAction, options);

    record.actionCache.set(cacheKey, { raw: rawAction, fn });
    return fn;
  }

  private resolvePropValue(
    record: NodeRecord,
    propPathKey: string,
    rawValue: unknown,
    behavior: BehaviorNode,
    evalCtx: FunctionExecutionContext,
    deps: Set<CanonicalPointer>,
  ): unknown {
    switch (behavior.type) {
      case "DYNAMIC": {
        if (isV1DataBinding(rawValue)) {
          const authoredPath = rawValue["@path"];
          const resolvedPath = resolvePath(authoredPath, record.node.dataPath);
          deps.add(resolvedPath);
          let val = this.surface.dataModel.get(resolvedPath);
          if (behavior.coerceBoolean) {
            val = coerceDynamicBoolean(val);
          }
          const dataModel = this.surface.dataModel;
          return new WritableBinding(
            val,
            (nextVal: unknown) => {
              dataModel.set(resolvedPath, nextVal);
            },
            authoredPath,
            resolvedPath,
          );
        }
        if (isV1FunctionCall(rawValue)) {
          collectDynamicPaths(rawValue, record.node.dataPath, deps);
          let val: unknown;
          try {
            val = evaluateDynamicValue(rawValue, evalCtx);
          } catch {
            val = undefined;
          }
          if (behavior.coerceBoolean) {
            val = coerceDynamicBoolean(val);
          }
          return new ResolvedBinding(val);
        }
        if (behavior.objectShape && isPlainObject(rawValue)) {
          const resolvedObj: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rawValue)) {
            const subBehavior = Object.prototype.hasOwnProperty.call(
              behavior.objectShape,
              k,
            )
              ? behavior.objectShape[k]!
              : ({ type: "STATIC" } as const);
            const subResolved = this.resolvePropValue(
              record,
              `${propPathKey}.${k}`,
              v,
              subBehavior,
              evalCtx,
              deps,
            );
            resolvedObj[k] =
              subResolved instanceof ResolvedBinding
                ? subResolved.value
                : subResolved;
          }
          return new ResolvedBinding(resolvedObj);
        }
        let val = rawValue;
        if (behavior.coerceBoolean && val !== undefined) {
          val = coerceDynamicBoolean(val);
        }
        return new ResolvedBinding(val);
      }

      case "ACTION": {
        if (isActionObject(rawValue)) {
          return this.getOrCreateAction(record, propPathKey, rawValue);
        }
        return rawValue;
      }

      case "ARRAY": {
        if (!Array.isArray(rawValue)) {
          return rawValue;
        }
        return rawValue.map((item, idx) =>
          this.resolvePropValue(
            record,
            `${propPathKey}[${idx}]`,
            item,
            behavior.element,
            evalCtx,
            deps,
          ),
        );
      }

      case "OBJECT": {
        if (!isPlainObject(rawValue)) {
          return rawValue;
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawValue)) {
          const childBehavior = Object.prototype.hasOwnProperty.call(
            behavior.shape,
            k,
          )
            ? behavior.shape[k]!
            : (behavior.catchall ?? { type: "STATIC" as const });
          out[k] = this.resolvePropValue(
            record,
            `${propPathKey}.${k}`,
            v,
            childBehavior,
            evalCtx,
            deps,
          );
        }
        return out;
      }

      case "STRUCTURAL":
      case "STATIC":
      default:
        return rawValue;
    }
  }

  private materialize(record: NodeRecord, isInitial: boolean): void {
    if (record.node.disposed || this._disposed) {
      return;
    }
    const model = record.componentModel;
    const schemaInfo = record.schemaInfo;
    if (!model || !schemaInfo) {
      return;
    }

    const evalCtx = this.buildEvalContext(record, model);
    const deps = new Set<CanonicalPointer>();
    const newEdges = new Map<string, MutableComponentNode>();
    const occurrences = new Map<string, number>();
    const activeActionKeys = new Set<string>();

    const resolveChild = (
      slot: string,
      componentId: string,
      dataPath: CanonicalPointer,
    ): ComponentNode => {
      const occKey = `${escapeIdPart(componentId)}@${escapeIdPart(dataPath)}`;
      const occurrence = (occurrences.get(occKey) ?? 0) + 1;
      occurrences.set(occKey, occurrence);
      const edgeKey = `${record.edgeKey}>${slot}>${occKey}#${occurrence}`;
      const child = this.childNode(
        componentId,
        dataPath,
        edgeKey,
        record,
        occurrence,
      );
      newEdges.set(edgeKey, child);
      return child;
    };

    const resolveChildListValue = (
      slotKey: string,
      rawList: unknown,
    ): unknown => {
      if (Array.isArray(rawList)) {
        const out: unknown[] = [];
        for (let i = 0; i < rawList.length; i += 1) {
          const item = rawList[i];
          if (typeof item === "string" && item.length > 0) {
            out.push(resolveChild(slotKey, item, record.node.dataPath));
          } else {
            out.push(item);
          }
        }
        return out;
      }
      if (
        isPlainObject(rawList) &&
        typeof rawList["componentId"] === "string" &&
        typeof rawList["path"] === "string"
      ) {
        const templateCompId = rawList["componentId"];
        const templatePath = resolvePath(rawList["path"], record.node.dataPath);
        deps.add(templatePath);
        const collection = this.surface.dataModel.get(templatePath);
        if (Array.isArray(collection)) {
          const out: ComponentNode[] = [];
          for (let i = 0; i < collection.length; i += 1) {
            const itemScope = resolvePath(String(i), templatePath);
            out.push(resolveChild(slotKey, templateCompId, itemScope));
          }
          return out;
        }
        if (isPlainObject(collection)) {
          const out: ComponentNode[] = [];
          const keys = Object.keys(collection);
          for (let i = 0; i < keys.length; i += 1) {
            const itemScope = resolvePath(
              encodePointerSegment(keys[i]!),
              templatePath,
            );
            out.push(resolveChild(slotKey, templateCompId, itemScope));
          }
          return out;
        }
        return [];
      }
      return rawList;
    };

    const objShape =
      schemaInfo.behavior.type === "OBJECT"
        ? schemaInfo.behavior.shape
        : undefined;
    const objCatchall =
      schemaInfo.behavior.type === "OBJECT"
        ? schemaInfo.behavior.catchall
        : undefined;

    const nextProps: NodeProps = {};
    const rawProps = model.properties;

    for (const [key, rawValue] of Object.entries(rawProps)) {
      const refSpec = schemaInfo.refFields.get(key);
      const propBehavior: BehaviorNode =
        objShape && Object.prototype.hasOwnProperty.call(objShape, key)
          ? objShape[key]!
          : (objCatchall ?? { type: "STATIC" });

      if (propBehavior.type === "ACTION") {
        activeActionKeys.add(key);
      }

      if (refSpec) {
        const slotKey = escapeIdPart(key);
        if (refSpec.kind === "single") {
          nextProps[key] =
            typeof rawValue === "string" && rawValue.length > 0
              ? resolveChild(slotKey, rawValue, record.node.dataPath)
              : rawValue;
          continue;
        }
        if (refSpec.kind === "list") {
          nextProps[key] = resolveChildListValue(slotKey, rawValue);
          continue;
        }
        if (refSpec.kind === "nested" && Array.isArray(rawValue)) {
          const elemBehavior: BehaviorNode =
            propBehavior.type === "ARRAY"
              ? propBehavior.element
              : { type: "STATIC" };
          nextProps[key] = rawValue.map((item, idx) => {
            if (!isPlainObject(item)) {
              return this.resolvePropValue(
                record,
                `${key}[${idx}]`,
                item,
                elemBehavior,
                evalCtx,
                deps,
              );
            }
            const itemShape =
              elemBehavior.type === "OBJECT" ? elemBehavior.shape : undefined;
            const itemCatchall =
              elemBehavior.type === "OBJECT"
                ? elemBehavior.catchall
                : undefined;
            const entry: Record<string, unknown> = {};
            for (const [subKey, subVal] of Object.entries(item)) {
              if (refSpec.keys.has(subKey)) {
                const subSlot = `${slotKey}[${idx}].${escapeIdPart(subKey)}`;
                if (typeof subVal === "string" && subVal.length > 0) {
                  entry[subKey] = resolveChild(
                    subSlot,
                    subVal,
                    record.node.dataPath,
                  );
                } else if (Array.isArray(subVal) || isPlainObject(subVal)) {
                  entry[subKey] = resolveChildListValue(subSlot, subVal);
                } else {
                  entry[subKey] = subVal;
                }
              } else {
                const subBehavior: BehaviorNode =
                  itemShape &&
                  Object.prototype.hasOwnProperty.call(itemShape, subKey)
                    ? itemShape[subKey]!
                    : (itemCatchall ?? { type: "STATIC" });
                entry[subKey] = this.resolvePropValue(
                  record,
                  `${key}[${idx}].${subKey}`,
                  subVal,
                  subBehavior,
                  evalCtx,
                  deps,
                );
              }
            }
            return entry;
          });
          continue;
        }
      }

      nextProps[key] = this.resolvePropValue(
        record,
        key,
        rawValue,
        propBehavior,
        evalCtx,
        deps,
      );
    }

    // Prune stale action cache entries for removed properties.
    for (const cachedKey of Array.from(record.actionCache.keys())) {
      if (!activeActionKeys.has(cachedKey)) {
        record.actionCache.delete(cachedKey);
      }
    }

    // Evaluate reactive `@checks` when declared on the component.
    if (model.checks !== undefined && model.checks.length > 0) {
      for (let i = 0; i < model.checks.length; i += 1) {
        const rule = model.checks[i];
        if (isPlainObject(rule)) {
          collectDynamicPaths(rule["condition"], record.node.dataPath, deps);
        }
      }
      const checkState = evaluateCheckRules(model.checks, (condition) => {
        try {
          return evaluateDynamicValue(condition, evalCtx);
        } catch {
          return false;
        }
      });
      nextProps["isValid"] = checkState.isValid;
      nextProps["validationErrors"] = checkState.validationErrors;
      nextProps["validationResults"] = checkState.validationResults;
    }

    // Resolve `@accessibility` dynamic fields if present on the component.
    if (model.accessibility !== undefined) {
      collectDynamicPaths(model.accessibility, record.node.dataPath, deps);
      const resolvedA11y: Record<string, unknown> = {};
      for (const [aKey, aVal] of Object.entries(model.accessibility)) {
        try {
          const evaluated = evaluateDynamicValue(aVal, evalCtx);
          resolvedA11y[aKey] =
            aKey === "hidden" ? coerceDynamicBoolean(evaluated) : evaluated;
        } catch {
          resolvedA11y[aKey] = undefined;
        }
      }
      record.node.setAccessibility(resolvedA11y, isInitial);
    } else {
      record.node.setAccessibility(undefined, isInitial);
    }

    // Dispose any previously referenced child nodes no longer in `newEdges`.
    for (const [oldEdgeKey, oldChild] of record.childEdges) {
      if (!newEdges.has(oldEdgeKey)) {
        this.disposeNode(oldChild);
        if (oldChild.isPlaceholder) {
          let stillWaiting = false;
          for (const other of newEdges.values()) {
            if (
              other.isPlaceholder &&
              other.componentId === oldChild.componentId
            ) {
              stillWaiting = true;
              break;
            }
          }
          if (!stillWaiting) {
            const waiting = this.pendingParents.get(oldChild.componentId);
            if (waiting) {
              waiting.delete(record.node);
              if (waiting.size === 0) {
                this.pendingParents.delete(oldChild.componentId);
              }
            }
          }
        }
      }
    }
    record.childEdges = newEdges;

    // Reconcile per-node deduplicated `DataModel` path subscriptions.
    this.syncSubscriptions(record, deps);

    // Stabilize references against previous props so unchanged keys do not emit.
    const previous = record.node.props;
    for (const key of Object.keys(nextProps)) {
      nextProps[key] = stabilize(previous[key], nextProps[key]);
    }
    record.node.setProps(nextProps, isInitial);
  }

  private syncSubscriptions(
    record: NodeRecord,
    nextPaths: ReadonlySet<CanonicalPointer>,
  ): void {
    // Unsubscribe removed paths.
    for (const [path, sub] of record.watchedPaths) {
      if (!nextPaths.has(path)) {
        sub.unsubscribe();
        record.watchedPaths.delete(path);
      }
    }
    // Subscribe newly discovered paths.
    for (const path of nextPaths) {
      if (!record.watchedPaths.has(path)) {
        const sub = this.surface.dataModel.subscribe(path, () => {
          if (!record.node.disposed && !this._disposed) {
            this.dirtyRecords.add(record);
          }
        });
        record.watchedPaths.set(path, sub);
      }
    }
  }

  private disposeNode(node: MutableComponentNode): void {
    if (node.disposed) {
      return;
    }
    const record = this.records.get(node);
    if (record) {
      this.dirtyRecords.delete(record);
      for (const child of record.childEdges.values()) {
        this.disposeNode(child);
      }
      record.childEdges.clear();

      for (const sub of record.watchedPaths.values()) {
        sub.unsubscribe();
      }
      record.watchedPaths.clear();
      record.actionCache.clear();

      if (this.nodesByEdge.get(record.edgeKey) === node) {
        this.nodesByEdge.delete(record.edgeKey);
      }
      this.records.delete(node);
    }

    const byId = this.nodesByComponentId.get(node.componentId);
    if (byId) {
      byId.delete(node);
      if (byId.size === 0) {
        this.nodesByComponentId.delete(node.componentId);
      }
    }

    for (const [compId, waiting] of this.pendingParents) {
      waiting.delete(node);
      if (waiting.size === 0) {
        this.pendingParents.delete(compId);
      }
    }

    if (node.state === "cyclic") {
      this.clearDispatched(node.componentId, node.dataPath);
    }

    node.dispose();
  }
}
