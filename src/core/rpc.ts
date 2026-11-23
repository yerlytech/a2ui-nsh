/**
 * Pure TypeScript A2UI v1.0 RPC lifecycle manager, inbound
 * `callRendererFunction` dispatcher, outbound `callAgentFunction` correlation,
 * fallback routing, reactive binding caching/dedup, and imperative sequential
 * evaluation.
 *
 * Zero `nsh` or I/O imports: timers, outbound transport, error reporting, and
 * URL opening enter through narrow typed seams.
 */

import {
  A2uiCatalogError,
  BASIC_CATALOG_V1_ID,
  Catalog,
  CatalogRegistry,
  buildV10CommonTypesSchema,
  isV10ProtocolVersion,
  type FunctionDefinition,
} from "./catalog";
import { DataContext, DataModel, type DataSubscription } from "./data_model";
import {
  A2uiExpressionError,
  A2uiValidationError,
  isV1DataBinding,
  isV1FunctionCall,
  unescapeAtKey,
  validateReservedKeysInDynamicValue,
} from "./expression";
import {
  A2uiFunctionError,
  DEFAULT_FUNCTION_EVAL_LIMITS,
  FunctionRegistry,
  coerceDynamicBoolean,
  evaluateDynamicValue,
  normalizeCheckRuleResult,
  type FunctionExecutionContext,
  type FunctionImplementation,
  type NormalizedValidationResult,
  type UrlOpener,
} from "./functions";
import {
  isJsonObject,
  resolveLocalRef,
  validateJsonSchema,
  type JsonObject,
  type JsonValue,
} from "./json_schema";
import type { CanonicalPointer } from "./pointer";
import type { RendererErrorEnvelope } from "./validator";

// ---------------------------------------------------------------------------
// Wire envelope types (strict A2UI v1.0)
// ---------------------------------------------------------------------------

export interface CallFunctionPayload {
  readonly "@call": string;
  readonly catalogId: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

export interface CallRendererFunctionPayload {
  readonly functionCallId: string;
  readonly surfaceId?: string;
  readonly callFunction: CallFunctionPayload;
}

export interface CallAgentFunctionPayload {
  readonly surfaceId: string;
  readonly functionCallId: string;
  readonly callFunction: CallFunctionPayload;
}

export interface CallAgentFunctionEnvelope {
  readonly version: "1.0";
  readonly callAgentFunction: CallAgentFunctionPayload;
}

export interface RpcErrorBody {
  readonly code: string;
  readonly message: string;
}

export interface FunctionResponsePayload {
  readonly functionCallId: string;
  readonly value?: unknown;
  readonly error?: RpcErrorBody;
}

export interface RendererFunctionResponseEnvelope {
  readonly version: "1.0";
  readonly rendererFunctionResponse: FunctionResponsePayload;
}

export interface AgentFunctionResponseEnvelope {
  readonly version: "1.0";
  readonly agentFunctionResponse: FunctionResponsePayload;
}

export type OutboundRpcMessage =
  | CallAgentFunctionEnvelope
  | RendererFunctionResponseEnvelope;

export type OutboundRpcHandler = (envelope: OutboundRpcMessage) => void;
export type RpcErrorReporter = (envelope: RendererErrorEnvelope) => void;

// ---------------------------------------------------------------------------
// Typed RPC error & limits
// ---------------------------------------------------------------------------

export type RpcErrorCode =
  | "TIMEOUT"
  | "DUPLICATE"
  | "CANCELLED"
  | "DISPOSED"
  | "NO_LISTENER"
  | "INVALID_FUNCTION_CALL"
  | "EXECUTION_ERROR"
  | "UNKNOWN_FUNCTION"
  | "MAX_PENDING_EXCEEDED";

/** Typed error raised for A2UI v1.0 RPC lifecycle and remote-call failures. */
export class A2uiRpcError extends Error {
  readonly category = "RpcError" as const;
  readonly code: RpcErrorCode | string;
  readonly functionCallId?: string;
  readonly surfaceId?: string;

  constructor(
    code: RpcErrorCode | string,
    message: string,
    functionCallId?: string,
    surfaceId?: string,
  ) {
    super(message);
    this.name = "A2uiRpcError";
    this.code = code;
    this.functionCallId = functionCallId;
    this.surfaceId = surfaceId;
  }
}

/** Narrow clock/timer seam so tests can control RPC timeouts deterministically. */
export interface TimerSeam {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const DEFAULT_TIMER_SEAM: TimerSeam = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/** Safety caps enforced by `RpcManager`. Override via `RpcManagerOptions.limits`. */
export interface RpcLimits {
  /** Default timeout for outbound `callAgentFunction` requests in milliseconds. */
  readonly defaultTimeoutMs: number;
  /** Maximum concurrent in-flight outbound `callAgentFunction` requests. */
  readonly maxPendingCalls: number;
  /** Maximum nested function-call evaluation depth. */
  readonly maxCallDepth: number;
}

export const DEFAULT_RPC_LIMITS: Readonly<RpcLimits> = Object.freeze({
  defaultTimeoutMs: 30_000,
  maxPendingCalls: 256,
  maxCallDepth: DEFAULT_FUNCTION_EVAL_LIMITS.maxCallDepth,
});

/** Minimal surface view needed by `RpcManager` without coupling to `processor.ts`. */
export interface RpcSurfaceView {
  readonly id: string;
  readonly defaultCatalogId?: string;
  readonly dataModel: DataModel;
}

export interface RpcManagerOptions {
  readonly catalogRegistry: CatalogRegistry;
  readonly functionRegistry?: FunctionRegistry;
  readonly getSurface?: (surfaceId: string) => RpcSurfaceView | undefined;
  readonly onOutbound?: OutboundRpcHandler;
  readonly onError?: RpcErrorReporter;
  readonly openUrl?: UrlOpener;
  readonly locale?: string;
  readonly limits?: Partial<RpcLimits>;
  readonly timers?: TimerSeam;
  readonly generateCallId?: () => string;
}

export interface CallAgentFunctionRequest {
  readonly surfaceId: string;
  readonly callFunction: CallFunctionPayload;
  readonly functionCallId?: string;
  readonly timeoutMs?: number;
}

export interface CallRendererFunctionOptions {
  readonly userActivation?: boolean;
}

// ---------------------------------------------------------------------------
// Canonicalization, JSON-number validation & schema defaults
// ---------------------------------------------------------------------------

const DEFAULT_BASIC_FN_REGISTRY = FunctionRegistry.withBasicV1();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defineOwn(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function deepClonePlain(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepClonePlain);
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    defineOwn(out, key, deepClonePlain(src[key]));
  }
  return out;
}

/**
 * Deterministic JSON serialization with object keys sorted recursively, used
 * to canonicalize reactive agent function calls for request dedup and caching.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((el) => canonicalJson(el)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries: string[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]!;
    const v = obj[k];
    if (v === undefined) {
      continue;
    }
    entries.push(`${JSON.stringify(k)}:${canonicalJson(v)}`);
  }
  return `{${entries.join(",")}}`;
}

/** Builds the canonical surface-scoped dedup/cache key for a resolved function call. */
export function canonicalCallKey(
  catalogId: string,
  functionName: string,
  args: Readonly<Record<string, unknown>>,
): string {
  return `${JSON.stringify(catalogId)}:${JSON.stringify(functionName)}:${canonicalJson(args)}`;
}

/** Returns true if `value` recursively contains `NaN`, `Infinity`, or `-Infinity`. */
export function hasNonJsonNumber(value: unknown): boolean {
  if (typeof value === "number") {
    return !Number.isFinite(value);
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      if (hasNonJsonNumber(value[i])) {
        return true;
      }
    }
    return false;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (hasNonJsonNumber(obj[key])) {
      return true;
    }
  }
  return false;
}

function normalizeUndefinedToNull(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeUndefinedToNull);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    defineOwn(out, key, normalizeUndefinedToNull(obj[key]));
  }
  return out;
}

function isDynamicBooleanRef(schema: unknown): boolean {
  if (!isJsonObject(schema)) {
    return false;
  }
  const ref = schema["$ref"];
  return (
    typeof ref === "string" &&
    (ref === "#/$defs/DynamicBoolean" ||
      ref.endsWith("common_types.json#/$defs/DynamicBoolean"))
  );
}

function coerceDynamicBooleanArgs(
  args: Record<string, unknown>,
  argsSchema: JsonObject,
): Record<string, unknown> {
  const argProps = argsSchema["properties"];
  if (!isJsonObject(argProps)) {
    return args;
  }
  let mutated = false;
  const out: Record<string, unknown> = { ...args };
  for (const key of Object.keys(out)) {
    const propSchema = argProps[key];
    if (!isJsonObject(propSchema)) {
      continue;
    }
    if (isDynamicBooleanRef(propSchema)) {
      out[key] = coerceDynamicBoolean(out[key]);
      mutated = true;
    } else if (
      propSchema["type"] === "array" &&
      isDynamicBooleanRef(propSchema["items"]) &&
      Array.isArray(out[key])
    ) {
      out[key] = (out[key] as unknown[]).map((el) => coerceDynamicBoolean(el));
      mutated = true;
    }
  }
  return mutated ? out : args;
}

function resolveSchemaNode(
  schema: JsonValue,
  root: JsonObject,
  depth: number,
): JsonObject | undefined {
  if (depth > 16 || !isJsonObject(schema)) {
    return undefined;
  }
  if (typeof schema["$ref"] === "string") {
    const target = resolveLocalRef(root, schema["$ref"]);
    if (target !== undefined) {
      return resolveSchemaNode(target, root, depth + 1);
    }
  }
  return schema;
}

/**
 * Recursively clones `value` and fills missing object properties from JSON
 * Schema `default` annotations (including nested objects).
 */
export function applySchemaDefaults(
  value: unknown,
  schema: JsonValue,
  root: JsonObject,
  depth = 0,
): unknown {
  if (depth > 32) {
    return deepClonePlain(value);
  }
  const resolved = resolveSchemaNode(schema, root, 0);
  if (!resolved) {
    return deepClonePlain(value);
  }
  if (value === undefined) {
    if (Object.prototype.hasOwnProperty.call(resolved, "default")) {
      return applySchemaDefaults(
        deepClonePlain(resolved["default"]),
        resolved,
        root,
        depth + 1,
      );
    }
    return undefined;
  }
  if (isPlainObject(value) && isJsonObject(resolved["properties"])) {
    const props = resolved["properties"];
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const propSchema = props[key];
      const nextVal =
        propSchema !== undefined
          ? applySchemaDefaults(value[key], propSchema, root, depth + 1)
          : deepClonePlain(value[key]);
      defineOwn(out, key, nextVal);
    }
    for (const propKey of Object.keys(props)) {
      if (Object.prototype.hasOwnProperty.call(out, propKey)) {
        continue;
      }
      const propSchema = resolveSchemaNode(props[propKey]!, root, 0);
      if (
        propSchema &&
        Object.prototype.hasOwnProperty.call(propSchema, "default")
      ) {
        defineOwn(
          out,
          propKey,
          applySchemaDefaults(
            deepClonePlain(propSchema["default"]),
            propSchema,
            root,
            depth + 1,
          ),
        );
      }
    }
    return out;
  }
  if (Array.isArray(value) && resolved["items"] !== undefined) {
    const itemSchema = resolved["items"];
    return value.map((item) =>
      applySchemaDefaults(item, itemSchema, root, depth + 1),
    );
  }
  return deepClonePlain(value);
}

let cachedCommonTypesSchema: JsonObject | undefined;
function getCommonTypesSchema(): JsonObject {
  if (!cachedCommonTypesSchema) {
    cachedCommonTypesSchema = buildV10CommonTypesSchema();
  }
  return cachedCommonTypesSchema;
}

function resolveCommonTypesExternalRef(
  ref: string,
): { readonly root: JsonObject; readonly schema: JsonValue } | undefined {
  const hashIdx = ref.indexOf("#");
  if (hashIdx < 0) {
    return undefined;
  }
  const uri = ref.slice(0, hashIdx);
  const fragment = ref.slice(hashIdx);
  if (
    uri === "common_types.json" ||
    uri.endsWith("/common_types.json")
  ) {
    const root = getCommonTypesSchema();
    const schema = resolveLocalRef(root, fragment);
    if (schema !== undefined) {
      return { root, schema };
    }
  }
  return undefined;
}

function extractFunctionArgsSchema(
  fnName: string,
  fnDef?: FunctionDefinition,
  catalog?: Catalog,
  extraSchema?: JsonObject,
): { readonly argsSchema: JsonObject; readonly root: JsonObject } | undefined {
  if (extraSchema) {
    return {
      argsSchema: extraSchema,
      root: catalog ? catalog.validationSchema : getCommonTypesSchema(),
    };
  }
  if (catalog) {
    const vSchema = catalog.validationSchema;
    const vFns = vSchema["functions"];
    if (isJsonObject(vFns) && isJsonObject(vFns[fnName])) {
      const fnSchema = vFns[fnName] as JsonObject;
      const props = fnSchema["properties"];
      if (isJsonObject(props) && isJsonObject(props["args"])) {
        return { argsSchema: props["args"], root: vSchema };
      }
      if (isJsonObject(fnSchema["parameters"])) {
        return { argsSchema: fnSchema["parameters"], root: vSchema };
      }
    }
  }
  if (!fnDef || !isJsonObject(fnDef.schema)) {
    return undefined;
  }
  const root: JsonObject = catalog
    ? catalog.validationSchema
    : getCommonTypesSchema();
  const props = fnDef.schema["properties"];
  if (isJsonObject(props) && isJsonObject(props["args"])) {
    return { argsSchema: props["args"], root };
  }
  if (isJsonObject(fnDef.schema["parameters"])) {
    return { argsSchema: fnDef.schema["parameters"], root };
  }
  return undefined;
}

export interface ParsedFunctionArgsResult {
  readonly ok: true;
  readonly args: Record<string, unknown>;
}

export interface FailedFunctionArgsResult {
  readonly ok: false;
  readonly message: string;
}

/**
 * Applies JSON Schema defaults and validates resolved function `args` against
 * the function's catalog or explicit parameter schema.
 */
export function parseAndValidateFunctionArgs(
  fnName: string,
  resolvedArgs: Readonly<Record<string, unknown>>,
  fnDef?: FunctionDefinition,
  catalog?: Catalog,
  extraSchema?: JsonObject,
): ParsedFunctionArgsResult | FailedFunctionArgsResult {
  const extracted = extractFunctionArgsSchema(
    fnName,
    fnDef,
    catalog,
    extraSchema,
  );
  if (!extracted) {
    return {
      ok: true,
      args: deepClonePlain(resolvedArgs) as Record<string, unknown>,
    };
  }
  const { argsSchema, root } = extracted;
  const coerced = coerceDynamicBooleanArgs(
    { ...resolvedArgs },
    argsSchema,
  );
  const withDefaults = applySchemaDefaults(
    coerced,
    argsSchema,
    root,
  ) as Record<string, unknown>;

  const issues = validateJsonSchema(argsSchema, withDefaults, root, {
    resolveExternalRef: resolveCommonTypesExternalRef,
  });
  if (issues.length > 0) {
    const first = issues[0]!;
    return {
      ok: false,
      message: `Validation failed for function '${fnName}': ${first.message}`,
    };
  }
  return { ok: true, args: withDefaults };
}

function lookupLocalImplementation(
  catalogId: string,
  fnName: string,
  fnRegistry: FunctionRegistry,
  rawCatalogId?: string,
): FunctionImplementation | undefined {
  const direct = fnRegistry.get(catalogId, fnName);
  if (direct) {
    return direct;
  }
  if (rawCatalogId && rawCatalogId !== catalogId) {
    const aliasMatch = fnRegistry.get(rawCatalogId, fnName);
    if (aliasMatch) {
      return aliasMatch;
    }
  }
  if (catalogId === BASIC_CATALOG_V1_ID) {
    return DEFAULT_BASIC_FN_REGISTRY.get(BASIC_CATALOG_V1_ID, fnName);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tracking DataContext for reactive binding subscriptions
// ---------------------------------------------------------------------------

class TrackingDataContext extends DataContext {
  readonly readPaths = new Set<CanonicalPointer>();

  constructor(model: DataModel, basePath = "/") {
    super(model, basePath);
  }

  override get(path: string): unknown {
    const resolved = this.resolvePath(path);
    this.readPaths.add(resolved);
    return this.model.get(resolved);
  }
}

// ---------------------------------------------------------------------------
// Internal RPC manager state structures
// ---------------------------------------------------------------------------

interface PendingOutboundCall {
  readonly callId: string;
  readonly surfaceId: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: Error) => void;
  readonly timer?: unknown;
  settled: boolean;
}

type SharedInFlightListener = (
  outcome:
    | { readonly ok: true; readonly value: unknown }
    | {
        readonly ok: false;
        readonly cancelled: boolean;
        readonly error: A2uiRpcError;
      },
) => void;

interface SharedInFlightCall {
  readonly callKey: string;
  readonly callId: string;
  readonly surfaceId: string;
  readonly listeners: Set<SharedInFlightListener>;
  settled: boolean;
}

interface SurfaceRoutingCache {
  readonly inFlight: Map<string, SharedInFlightCall>;
  readonly settledValues: Map<string, unknown>;
}

// ---------------------------------------------------------------------------
// RpcManager
// ---------------------------------------------------------------------------

/**
 * Manages A2UI v1.0 bidirectional function RPC:
 * - Inbound `callRendererFunction` -> `rendererFunctionResponse`
 * - Outbound `callAgentFunction` <-> `agentFunctionResponse` correlation
 * - Timeouts, duplicate ID rejection, surface cancellation, disposal
 * - Per-surface reactive call sharing and settled value caching
 */
export class RpcManager {
  readonly catalogRegistry: CatalogRegistry;
  readonly functionRegistry: FunctionRegistry;
  readonly limits: RpcLimits;

  private readonly getSurfaceFn?: (surfaceId: string) => RpcSurfaceView | undefined;
  private readonly onOutbound?: OutboundRpcHandler;
  private readonly onError?: RpcErrorReporter;
  private readonly openUrl?: UrlOpener;
  private readonly locale?: string;
  private readonly timers: TimerSeam;
  private readonly generateCallIdFn: () => string;

  private readonly pending = new Map<string, PendingOutboundCall>();
  private readonly surfaceCaches = new Map<string, SurfaceRoutingCache>();
  private readonly activeBindings = new Map<string, Set<ReactiveEvaluation>>();
  private nextAutoId = 1;
  private isDisposed = false;

  constructor(options: RpcManagerOptions) {
    this.catalogRegistry = options.catalogRegistry;
    this.functionRegistry =
      options.functionRegistry ?? FunctionRegistry.withBasicV1();
    this.getSurfaceFn = options.getSurface;
    this.onOutbound = options.onOutbound;
    this.onError = options.onError;
    this.openUrl = options.openUrl;
    this.locale = options.locale;
    this.timers = options.timers ?? DEFAULT_TIMER_SEAM;
    this.limits = {
      defaultTimeoutMs:
        options.limits?.defaultTimeoutMs ?? DEFAULT_RPC_LIMITS.defaultTimeoutMs,
      maxPendingCalls:
        options.limits?.maxPendingCalls ?? DEFAULT_RPC_LIMITS.maxPendingCalls,
      maxCallDepth:
        options.limits?.maxCallDepth ?? DEFAULT_RPC_LIMITS.maxCallDepth,
    };
    this.generateCallIdFn =
      options.generateCallId ??
      (() => {
        const id = `rpc-${this.nextAutoId}`;
        this.nextAutoId += 1;
        return id;
      });
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  get hasOutboundListener(): boolean {
    return this.onOutbound !== undefined;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  getSurface(surfaceId: string): RpcSurfaceView | undefined {
    return this.getSurfaceFn?.(surfaceId);
  }

  getOpenUrl(): UrlOpener | undefined {
    return this.openUrl;
  }

  getLocale(): string | undefined {
    return this.locale;
  }

  /** Reports a renderer-to-agent error envelope through the configured error sink. */
  reportError(envelope: RendererErrorEnvelope): void {
    this.onError?.(envelope);
  }

  /** Emits a `surfaceId`-scoped error envelope. */
  reportSurfaceError(surfaceId: string, code: string, message: string): void {
    this.reportError({
      version: "1.0",
      error: { code, surfaceId, message },
    });
  }

  /** Emits a `functionCallId`-scoped error envelope (omitting `surfaceId` per v1.0). */
  reportCallError(functionCallId: string, code: string, message: string): void {
    this.reportError({
      version: "1.0",
      error: { code, functionCallId, message },
    });
  }

  private getOrCreateSurfaceCache(surfaceId: string): SurfaceRoutingCache {
    let cache = this.surfaceCaches.get(surfaceId);
    if (!cache) {
      cache = {
        inFlight: new Map(),
        settledValues: new Map(),
      };
      this.surfaceCaches.set(surfaceId, cache);
    }
    return cache;
  }

  /** Registers an active reactive binding so surface deletion can dispose it. */
  registerReactiveBinding(surfaceId: string, binding: ReactiveEvaluation): void {
    let set = this.activeBindings.get(surfaceId);
    if (!set) {
      set = new Set();
      this.activeBindings.set(surfaceId, set);
    }
    set.add(binding);
  }

  unregisterReactiveBinding(surfaceId: string, binding: ReactiveEvaluation): void {
    const set = this.activeBindings.get(surfaceId);
    if (set) {
      set.delete(binding);
      if (set.size === 0) {
        this.activeBindings.delete(surfaceId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Outbound callAgentFunction & inbound agentFunctionResponse
  // -------------------------------------------------------------------------

  /**
   * Sends a `callAgentFunction` message and returns a Promise that resolves or
   * rejects when the matching `agentFunctionResponse` arrives, times out, is
   * cancelled, or the RPC manager is disposed.
   */
  callAgentFunction(request: CallAgentFunctionRequest): Promise<unknown> {
    return this.dispatchAgentCallWithId(request).promise;
  }

  /**
   * Internal helper returning both the assigned `functionCallId` and settlement
   * promise so reactive bindings and error reporters know the exact call ID.
   */
  dispatchAgentCallWithId(request: CallAgentFunctionRequest): {
    readonly functionCallId: string;
    readonly promise: Promise<unknown>;
  } {
    const surfaceId = request.surfaceId;
    const callId = request.functionCallId ?? this.generateCallIdFn();

    if (this.isDisposed) {
      return {
        functionCallId: callId,
        promise: Promise.reject(
          new A2uiRpcError(
            "DISPOSED",
            "RPC manager has been disposed",
            callId,
            surfaceId,
          ),
        ),
      };
    }

    if (!this.onOutbound) {
      return {
        functionCallId: callId,
        promise: Promise.reject(
          new A2uiRpcError(
            "NO_LISTENER",
            `No outbound listener registered to send callAgentFunction '${request.callFunction["@call"]}'`,
            callId,
            surfaceId,
          ),
        ),
      };
    }

    if (this.pending.has(callId)) {
      return {
        functionCallId: callId,
        promise: Promise.reject(
          new A2uiRpcError(
            "DUPLICATE",
            `Duplicate pending functionCallId '${callId}'`,
            callId,
            surfaceId,
          ),
        ),
      };
    }

    if (this.pending.size >= this.limits.maxPendingCalls) {
      return {
        functionCallId: callId,
        promise: Promise.reject(
          new A2uiRpcError(
            "MAX_PENDING_EXCEEDED",
            `Maximum pending RPC calls (${this.limits.maxPendingCalls}) exceeded`,
            callId,
            surfaceId,
          ),
        ),
      };
    }

    const timeoutMs = request.timeoutMs ?? this.limits.defaultTimeoutMs;
    const promise = new Promise<unknown>((resolve, reject) => {
      const entry: PendingOutboundCall = {
        callId,
        surfaceId,
        resolve,
        reject,
        settled: false,
      };

      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        const timerHandle = this.timers.setTimeout(() => {
          if (entry.settled) {
            return;
          }
          entry.settled = true;
          this.pending.delete(callId);
          reject(
            new A2uiRpcError(
              "TIMEOUT",
              `callAgentFunction '${request.callFunction["@call"]}' timed out after ${timeoutMs}ms`,
              callId,
              surfaceId,
            ),
          );
        }, timeoutMs);
        (entry as { timer?: unknown }).timer = timerHandle;
      }

      this.pending.set(callId, entry);

      const envelope: CallAgentFunctionEnvelope = {
        version: "1.0",
        callAgentFunction: {
          surfaceId,
          functionCallId: callId,
          callFunction: {
            "@call": request.callFunction["@call"],
            catalogId: request.callFunction.catalogId,
            args:
              request.callFunction.args !== undefined
                ? (deepClonePlain(request.callFunction.args) as Record<
                    string,
                    unknown
                  >)
                : {},
          },
        },
      };

      this.onOutbound!(envelope);
    });

    return { functionCallId: callId, promise };
  }

  /**
   * Correlates an inbound `agentFunctionResponse` with a pending outbound call.
   * Unknown, late, or post-dispose responses are silently ignored (`false`).
   */
  handleAgentFunctionResponse(payload: FunctionResponsePayload): boolean {
    const entry = this.pending.get(payload.functionCallId);
    if (!entry || entry.settled) {
      return false;
    }

    entry.settled = true;
    if (entry.timer !== undefined) {
      this.timers.clearTimeout(entry.timer);
    }
    this.pending.delete(payload.functionCallId);

    if (payload.error) {
      entry.reject(
        new A2uiRpcError(
          payload.error.code,
          payload.error.message,
          payload.functionCallId,
          entry.surfaceId,
        ),
      );
    } else {
      entry.resolve(payload.value === undefined ? null : payload.value);
    }
    return true;
  }

  /**
   * Cancels all pending outbound calls belonging to `surfaceId` with RPC code
   * `CANCELLED`. Pass `clearCache: true` when the surface itself is deleted.
   */
  cancelSurfaceCalls(
    surfaceId: string,
    options: { readonly clearCache?: boolean } = {},
  ): number {
    let cancelledCount = 0;
    const toCancel: PendingOutboundCall[] = [];
    for (const entry of this.pending.values()) {
      if (entry.surfaceId === surfaceId && !entry.settled) {
        toCancel.push(entry);
      }
    }

    const cache = this.surfaceCaches.get(surfaceId);
    if (cache) {
      cache.inFlight.clear();
      if (options.clearCache === true) {
        cache.settledValues.clear();
        this.surfaceCaches.delete(surfaceId);
      }
    }

    if (options.clearCache === true) {
      const bindings = this.activeBindings.get(surfaceId);
      if (bindings) {
        for (const binding of Array.from(bindings)) {
          binding.dispose();
        }
        this.activeBindings.delete(surfaceId);
      }
    }

    for (let i = 0; i < toCancel.length; i += 1) {
      const entry = toCancel[i]!;
      if (entry.settled) {
        continue;
      }
      entry.settled = true;
      if (entry.timer !== undefined) {
        this.timers.clearTimeout(entry.timer);
      }
      this.pending.delete(entry.callId);
      cancelledCount += 1;
      entry.reject(
        new A2uiRpcError(
          "CANCELLED",
          `Pending call '${entry.callId}' cancelled for surface '${surfaceId}'`,
          entry.callId,
          surfaceId,
        ),
      );
    }

    return cancelledCount;
  }

  /**
   * Permanently disposes RPC state: cancels all in-flight calls with
   * `CANCELLED`, clears caches/bindings, and rejects subsequent calls with
   * `DISPOSED`.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    const allPending = Array.from(this.pending.values());
    this.pending.clear();

    for (const set of this.activeBindings.values()) {
      for (const binding of Array.from(set)) {
        binding.dispose();
      }
    }
    this.activeBindings.clear();
    this.surfaceCaches.clear();

    for (let i = 0; i < allPending.length; i += 1) {
      const entry = allPending[i]!;
      if (entry.settled) {
        continue;
      }
      entry.settled = true;
      if (entry.timer !== undefined) {
        this.timers.clearTimeout(entry.timer);
      }
      entry.reject(
        new A2uiRpcError(
          "CANCELLED",
          `Pending call '${entry.callId}' cancelled due to RPC disposal`,
          entry.callId,
          entry.surfaceId,
        ),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Surface-scoped reactive binding dedup & value cache
  // -------------------------------------------------------------------------

  getCachedReactiveResult(
    surfaceId: string,
    callKey: string,
  ): { readonly hit: boolean; readonly value?: unknown } {
    const cache = this.surfaceCaches.get(surfaceId);
    if (!cache || !cache.settledValues.has(callKey)) {
      return { hit: false };
    }
    return { hit: true, value: cache.settledValues.get(callKey) };
  }

  /**
   * Looks up or dispatches a shared in-flight reactive `callAgentFunction`
   * request for `(surfaceId, callKey)`. Identical reactive calls share one
   * outbound request; settled values populate the surface cache, while errors
   * are reported once and never cached.
   */
  subscribeOrStartReactiveAgentCall(
    surfaceId: string,
    callKey: string,
    callFunction: CallFunctionPayload,
    listener: SharedInFlightListener,
  ): { readonly callId: string; unsubscribe: () => void } {
    const cache = this.getOrCreateSurfaceCache(surfaceId);
    const existing = cache.inFlight.get(callKey);
    if (existing && !existing.settled) {
      existing.listeners.add(listener);
      return {
        callId: existing.callId,
        unsubscribe: () => {
          existing.listeners.delete(listener);
        },
      };
    }

    const { functionCallId, promise } = this.dispatchAgentCallWithId({
      surfaceId,
      callFunction,
    });

    const shared: SharedInFlightCall = {
      callKey,
      callId: functionCallId,
      surfaceId,
      listeners: new Set([listener]),
      settled: false,
    };
    cache.inFlight.set(callKey, shared);

    promise.then(
      (value) => {
        if (shared.settled) {
          return;
        }
        shared.settled = true;
        if (cache.inFlight.get(callKey) === shared) {
          cache.inFlight.delete(callKey);
        }
        const normalized = value === undefined ? null : value;
        if (!this.isDisposed && this.surfaceCaches.get(surfaceId) === cache) {
          cache.settledValues.set(callKey, normalized);
        }
        const snapshot = Array.from(shared.listeners);
        shared.listeners.clear();
        for (let i = 0; i < snapshot.length; i += 1) {
          snapshot[i]!({ ok: true, value: normalized });
        }
      },
      (err: unknown) => {
        if (shared.settled) {
          return;
        }
        shared.settled = true;
        if (cache.inFlight.get(callKey) === shared) {
          cache.inFlight.delete(callKey);
        }
        const rpcErr =
          err instanceof A2uiRpcError
            ? err
            : new A2uiRpcError(
                "EXECUTION_ERROR",
                err instanceof Error ? err.message : String(err),
                functionCallId,
                surfaceId,
              );
        const cancelled =
          rpcErr.code === "CANCELLED" || rpcErr.code === "DISPOSED";
        if (!cancelled) {
          this.reportCallError(
            functionCallId,
            "EXPRESSION_ERROR",
            rpcErr.message,
          );
        }
        const snapshot = Array.from(shared.listeners);
        shared.listeners.clear();
        for (let i = 0; i < snapshot.length; i += 1) {
          snapshot[i]!({ ok: false, cancelled, error: rpcErr });
        }
      },
    );

    return {
      callId: functionCallId,
      unsubscribe: () => {
        shared.listeners.delete(listener);
      },
    };
  }

  // -------------------------------------------------------------------------
  // Inbound callRendererFunction execution
  // -------------------------------------------------------------------------

  /**
   * Executes an inbound, envelope-validated `callRendererFunction` message and
   * emits the corresponding `rendererFunctionResponse` envelope (always, even
   * for `void` functions or errors).
   */
  async handleCallRendererFunction(
    payload: CallRendererFunctionPayload,
    options: CallRendererFunctionOptions = {},
  ): Promise<RendererFunctionResponseEnvelope> {
    const { functionCallId, surfaceId, callFunction } = payload;
    const fnName = callFunction["@call"];
    const requestedCatalogId = callFunction.catalogId;
    const userActivation = options.userActivation ?? false;

    const emitResponse = (
      responseBody: FunctionResponsePayload,
    ): RendererFunctionResponseEnvelope => {
      const envelope: RendererFunctionResponseEnvelope = {
        version: "1.0",
        rendererFunctionResponse: responseBody,
      };
      this.onOutbound?.(envelope);
      return envelope;
    };

    const fail = (
      code: string,
      message: string,
    ): RendererFunctionResponseEnvelope =>
      emitResponse({
        functionCallId,
        error: { code, message },
      });

    // 1. Surface context resolution (explicit surfaceId or isolated empty model).
    let dataContext: DataContext;
    let surfaceDefaultCatalogId: string | undefined;
    if (surfaceId !== undefined) {
      const surface = this.getSurfaceFn?.(surfaceId);
      if (!surface) {
        return fail("INVALID_FUNCTION_CALL", `Surface not found: ${surfaceId}`);
      }
      dataContext = new DataContext(surface.dataModel, "/");
      surfaceDefaultCatalogId = surface.defaultCatalogId;
    } else {
      dataContext = new DataContext(new DataModel({}), "/");
      surfaceDefaultCatalogId = undefined;
    }

    // 2. Catalog lookup & protocol version check.
    const catalog = this.catalogRegistry.get(requestedCatalogId);
    if (!catalog) {
      return fail(
        "INVALID_FUNCTION_CALL",
        `Catalog not found: ${requestedCatalogId}`,
      );
    }
    if (!isV10ProtocolVersion(catalog.protocolVersion)) {
      return fail(
        "INVALID_FUNCTION_CALL",
        `Catalog '${requestedCatalogId}' protocol version '${catalog.protocolVersion}' does not match message protocol version '1.0'.`,
      );
    }

    // 3. Function definition & local implementation lookup.
    const fnDef = catalog.functions.get(fnName);
    const impl = lookupLocalImplementation(
      catalog.catalogId,
      fnName,
      this.functionRegistry,
      requestedCatalogId,
    );
    if (!impl) {
      return fail("INVALID_FUNCTION_CALL", `Function not found: ${fnName}`);
    }

    // 4. Security boundaries: allowedCallers & requiresUserActivation.
    const disallowedForAgent =
      (fnDef !== undefined && fnDef.allowedCallers === "rendererOnly") ||
      impl.allowedCallers === "rendererOnly";
    if (disallowedForAgent) {
      return fail(
        "INVALID_FUNCTION_CALL",
        `Function '${fnName}' cannot be called by agent (allowedCallers is rendererOnly).`,
      );
    }

    const needsActivation =
      fnDef?.requiresUserActivation === true ||
      impl.requiresUserActivation === true;
    if (needsActivation && !userActivation) {
      return fail(
        "INVALID_FUNCTION_CALL",
        `Function '${fnName}' requires user activation context to execute.`,
      );
    }

    // 5. Resolve dynamic arguments (`@path`, `@call`, `@@` unescaping).
    const rawArgs = callFunction.args ?? {};
    let resolvedArgs: Record<string, unknown>;
    try {
      const evaluated = await this.evaluateRpcCallArguments(
        rawArgs,
        dataContext,
        surfaceId,
        surfaceDefaultCatalogId,
        userActivation,
      );
      resolvedArgs = normalizeUndefinedToNull(evaluated) as Record<
        string,
        unknown
      >;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail("EXECUTION_ERROR", msg);
    }

    // 6. Validate resolved arguments against the function schema & apply defaults.
    const parsedArgs = parseAndValidateFunctionArgs(
      fnName,
      resolvedArgs,
      fnDef,
      catalog,
      impl.parametersSchema,
    );
    if (!parsedArgs.ok) {
      return fail(
        "INVALID_FUNCTION_CALL",
        `Invalid arguments for function '${fnName}': ${parsedArgs.message}`,
      );
    }

    // 7. Execute implementation (supports both sync and async handlers).
    const execContext: FunctionExecutionContext = {
      dataContext,
      locale: this.locale,
      userActivation,
      openUrl: this.openUrl,
      inheritedCatalogId: catalog.catalogId,
      surfaceDefaultCatalogId,
      surfaceId,
      caller: "agent",
      catalogRegistry: this.catalogRegistry,
      functionRegistry: this.functionRegistry,
    };

    try {
      const rawResult = await impl.execute(parsedArgs.args, execContext);
      const normalized = rawResult === undefined ? null : rawResult;
      return emitResponse({
        functionCallId,
        value: normalized,
      });
    } catch {
      return fail(
        "EXECUTION_ERROR",
        "An error occurred during function execution.",
      );
    }
  }

  private async evaluateRpcCallArguments(
    rawArgs: Readonly<Record<string, unknown>>,
    dataContext: DataContext,
    surfaceId: string | undefined,
    surfaceDefaultCatalogId: string | undefined,
    userActivation: boolean,
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(rawArgs)) {
      const val = await evaluateImperativeValue(rawArgs[key], {
        rpc: this,
        surfaceId: surfaceId ?? "",
        surfaceDefaultCatalogId,
        dataContext,
        userActivation,
        allowAgentRouting: surfaceId !== undefined && this.hasOutboundListener,
        reportErrors: false,
      });
      defineOwn(out, unescapeAtKey(key), val);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Imperative sequential evaluation (actions, events, callRendererFunction args)
// ---------------------------------------------------------------------------

export interface ImperativeEvalContext {
  readonly rpc: RpcManager;
  readonly surfaceId: string;
  readonly surfaceDefaultCatalogId?: string;
  readonly dataContext: DataContext;
  readonly collectionIndices?: readonly number[];
  readonly userActivation: boolean;
  readonly locale?: string;
  readonly openUrl?: UrlOpener;
  /** Whether unimplemented functions may route to `callAgentFunction`. Default: true. */
  readonly allowAgentRouting?: boolean;
  /** Whether errors should be emitted to `rpc.onError` before throwing. Default: true. */
  readonly reportErrors?: boolean;
  readonly callDepth?: number;
}

/** Internal sentinel signaling an error was already emitted to `rpc.onError`. */
export class ReportedEvalError extends Error {
  readonly original: Error;
  readonly cancelled: boolean;

  constructor(original: Error, cancelled = false) {
    super(original.message);
    this.name = "ReportedEvalError";
    this.original = original;
    this.cancelled = cancelled;
  }
}

function reportAndWrap(
  ctx: ImperativeEvalContext,
  code: string,
  message: string,
  functionCallId?: string,
): never {
  if (ctx.reportErrors !== false) {
    if (functionCallId !== undefined) {
      ctx.rpc.reportCallError(functionCallId, code, message);
    } else {
      ctx.rpc.reportSurfaceError(ctx.surfaceId, code, message);
    }
  }
  const err = new A2uiFunctionError("EXPRESSION_ERROR", message);
  throw new ReportedEvalError(err, false);
}

/**
 * Evaluates an A2UI v1.0 `FunctionCall` imperatively (sequential argument
 * resolution, never reading/writing the reactive surface cache or sharing
 * in-flight requests, halting immediately on the first failure).
 */
export async function evaluateImperativeFunctionCall(
  call: {
    readonly "@call": string;
    readonly args?: Readonly<Record<string, unknown>>;
    readonly catalogId?: string;
  },
  ctx: ImperativeEvalContext,
): Promise<unknown> {
  const fnName = call["@call"];
  const depth = (ctx.callDepth ?? 0) + 1;
  if (depth > ctx.rpc.limits.maxCallDepth) {
    reportAndWrap(
      ctx,
      "EXPRESSION_ERROR",
      `Maximum function call depth (${ctx.rpc.limits.maxCallDepth}) exceeded while calling '${fnName}'`,
    );
  }

  // 1. System functions (`@index`, etc.) are always local and never routed.
  if (fnName.startsWith("@")) {
    const sysImpl =
      ctx.rpc.functionRegistry.getSystem(fnName) ??
      DEFAULT_BASIC_FN_REGISTRY.getSystem(fnName);
    if (!sysImpl) {
      reportAndWrap(
        ctx,
        "EXPRESSION_ERROR",
        `Unknown system function '${fnName}'`,
      );
    }
    const resolvedArgs = await evaluateImperativeArgsSequential(
      call.args,
      ctx,
      depth,
    );
    try {
      return await sysImpl.execute(resolvedArgs, {
        dataContext: ctx.dataContext,
        collectionIndices: ctx.collectionIndices,
        locale: ctx.locale ?? ctx.rpc.getLocale(),
        userActivation: ctx.userActivation,
        openUrl: ctx.openUrl ?? ctx.rpc.getOpenUrl(),
        surfaceDefaultCatalogId: ctx.surfaceDefaultCatalogId,
        surfaceId: ctx.surfaceId,
        caller: "renderer",
        catalogRegistry: ctx.rpc.catalogRegistry,
        functionRegistry: ctx.rpc.functionRegistry,
        callDepth: depth,
      });
    } catch (err) {
      if (err instanceof ReportedEvalError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      reportAndWrap(ctx, "EXECUTION_ERROR", msg);
    }
  }

  // 2. Resolve catalog strictly (explicit call.catalogId -> surface default -> CATALOG_ERROR).
  const targetCatalogId = call.catalogId ?? ctx.surfaceDefaultCatalogId;
  if (targetCatalogId === undefined) {
    reportAndWrap(
      ctx,
      "CATALOG_ERROR",
      `Surface '${ctx.surfaceId}' has no default catalogId to resolve function '${fnName}'`,
    );
  }
  const catalog = ctx.rpc.catalogRegistry.get(targetCatalogId);
  if (!catalog || !isV10ProtocolVersion(catalog.protocolVersion)) {
    reportAndWrap(
      ctx,
      "CATALOG_ERROR",
      `Catalog not found: ${targetCatalogId}`,
    );
  }

  const fnDef = catalog.functions.get(fnName);
  const impl = lookupLocalImplementation(
    catalog.catalogId,
    fnName,
    ctx.rpc.functionRegistry,
    targetCatalogId,
  );

  // 3. Enforce boundaries BEFORE evaluating args or dispatching.
  const effectiveAllowedCallers =
    fnDef?.allowedCallers ?? impl?.allowedCallers ?? "rendererOnly";
  if (effectiveAllowedCallers === "agentOnly") {
    reportAndWrap(
      ctx,
      "EXPRESSION_ERROR",
      `Function '${fnName}' cannot be called by renderer (allowedCallers is agentOnly)`,
    );
  }

  const requiresActivation =
    fnDef?.requiresUserActivation === true ||
    impl?.requiresUserActivation === true;
  if (requiresActivation && !ctx.userActivation) {
    reportAndWrap(
      ctx,
      "EXPRESSION_ERROR",
      `Function '${fnName}' requires user activation`,
    );
  }

  if (!impl && (ctx.allowAgentRouting === false || !ctx.rpc.hasOutboundListener)) {
    reportAndWrap(
      ctx,
      "EXPRESSION_ERROR",
      `Function '${fnName}' has no local implementation and no outbound listener is available`,
    );
  }

  // 4. Sequentially resolve arguments (preserving order and halting on first failure).
  const resolvedArgs = await evaluateImperativeArgsSequential(
    call.args,
    ctx,
    depth,
  );

  // 5. Local execution path.
  if (impl) {
    const parsed = parseAndValidateFunctionArgs(
      fnName,
      resolvedArgs,
      fnDef,
      catalog,
      impl.parametersSchema,
    );
    if (!parsed.ok) {
      reportAndWrap(ctx, "EXPRESSION_ERROR", parsed.message);
    }

    const execCtx: FunctionExecutionContext = {
      dataContext: ctx.dataContext,
      collectionIndices: ctx.collectionIndices,
      locale: ctx.locale ?? ctx.rpc.getLocale(),
      userActivation: ctx.userActivation,
      openUrl: ctx.openUrl ?? ctx.rpc.getOpenUrl(),
      inheritedCatalogId: catalog.catalogId,
      surfaceDefaultCatalogId: ctx.surfaceDefaultCatalogId,
      surfaceId: ctx.surfaceId,
      caller: "renderer",
      catalogRegistry: ctx.rpc.catalogRegistry,
      functionRegistry: ctx.rpc.functionRegistry,
      callDepth: depth,
      onTemplatePartError: (err) => {
        if (ctx.reportErrors !== false) {
          ctx.rpc.reportSurfaceError(
            ctx.surfaceId,
            "EXPRESSION_ERROR",
            err.message,
          );
        }
      },
    };

    try {
      return await impl.execute(parsed.args, execCtx);
    } catch (err) {
      if (err instanceof ReportedEvalError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof A2uiCatalogError) {
        reportAndWrap(ctx, "CATALOG_ERROR", msg);
      }
      reportAndWrap(ctx, "EXECUTION_ERROR", msg);
    }
  }

  // 6. Agent fallback path (never cached, never shared).
  if (hasNonJsonNumber(resolvedArgs)) {
    reportAndWrap(
      ctx,
      "EXPRESSION_ERROR",
      `Function '${fnName}' arguments contain a non-JSON number (NaN or Infinity)`,
    );
  }

  const parsed = parseAndValidateFunctionArgs(
    fnName,
    resolvedArgs,
    fnDef,
    catalog,
  );
  if (!parsed.ok) {
    reportAndWrap(ctx, "EXPRESSION_ERROR", parsed.message);
  }

  const { functionCallId, promise } = ctx.rpc.dispatchAgentCallWithId({
    surfaceId: ctx.surfaceId,
    callFunction: {
      "@call": fnName,
      catalogId: catalog.catalogId,
      args: parsed.args,
    },
  });

  try {
    return await promise;
  } catch (err) {
    if (
      err instanceof A2uiRpcError &&
      (err.code === "CANCELLED" || err.code === "DISPOSED")
    ) {
      throw new ReportedEvalError(err, true);
    }
    const msg = err instanceof Error ? err.message : String(err);
    reportAndWrap(ctx, "EXPRESSION_ERROR", msg, functionCallId);
  }
}

async function evaluateImperativeArgsSequential(
  rawArgs: Readonly<Record<string, unknown>> | undefined,
  ctx: ImperativeEvalContext,
  depth: number,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (!rawArgs) {
    return out;
  }
  const argCtx: ImperativeEvalContext = { ...ctx, callDepth: depth };
  for (const key of Object.keys(rawArgs)) {
    defineOwn(
      out,
      key,
      await evaluateImperativeValue(rawArgs[key], argCtx),
    );
  }
  return out;
}

/**
 * Recursively evaluates any A2UI v1.0 `DynamicValue` imperatively in sequential
 * order (for action `functionCall` arguments, event `context`/`userMessage`,
 * and `callRendererFunction` arguments).
 */
export async function evaluateImperativeValue(
  value: unknown,
  ctx: ImperativeEvalContext,
): Promise<unknown> {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i += 1) {
      out.push(await evaluateImperativeValue(value[i], ctx));
    }
    return out;
  }
  if (isV1DataBinding(value)) {
    return ctx.dataContext.get(value["@path"]);
  }
  if (isV1FunctionCall(value)) {
    return evaluateImperativeFunctionCall(value, ctx);
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    defineOwn(
      out,
      unescapeAtKey(key),
      await evaluateImperativeValue(obj[key], ctx),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reactive binding & check-rule evaluation with fallback routing
// ---------------------------------------------------------------------------

export type ReactiveEvaluationStatus = "resolved" | "pending" | "failed";

export interface ReactiveEvaluationOptions {
  readonly scope?: string;
  readonly collectionIndices?: readonly number[];
  readonly locale?: string;
  readonly onChange?: (value: unknown, status: ReactiveEvaluationStatus) => void;
}

type NodeEvalOutcome =
  | { readonly status: "resolved"; readonly value: unknown }
  | { readonly status: "pending" }
  | { readonly status: "failed" };

/**
 * Reactive evaluator for a single dynamic value binding on a surface.
 *
 * - Evaluates sibling agent calls in parallel within a single pass
 * - Shares in-flight calls and reuses settled answers via `RpcManager`'s
 *   per-surface cache (with canonicalized argument key order)
 * - Remembers per-call-site failures so unrelated data changes do not resend a
 *   failed call, while argument changes clear the failure and retry
 * - Does NOT remember cancelled calls as failures, so re-evaluation retries
 * - Automatically subscribes to all read `DataModel` paths and disposes cleanly
 */
export class ReactiveEvaluation {
  readonly surfaceId: string;

  private readonly rpc: RpcManager;
  private readonly expression: unknown;
  private readonly scope: string;
  private readonly collectionIndices?: readonly number[];
  private readonly locale?: string;
  private readonly onChange?: (
    value: unknown,
    status: ReactiveEvaluationStatus,
  ) => void;

  private currentValue: unknown = null;
  private currentStatus: ReactiveEvaluationStatus = "pending";
  private lastErrorMsg?: string;
  private isDisposed = false;

  /** Tracks `siteKey -> signature` for calls that failed on THIS binding. */
  private readonly failedCallSignatures = new Map<string, string>();
  /** Active `DataModel` subscriptions by canonical pointer path. */
  private readonly dataSubs = new Map<CanonicalPointer, DataSubscription>();
  /** Active `SharedInFlightCall` subscriptions keyed by `siteKey + callKey`. */
  private readonly rpcSubs = new Map<string, () => void>();

  constructor(
    rpc: RpcManager,
    surfaceId: string,
    expression: unknown,
    options: ReactiveEvaluationOptions = {},
  ) {
    this.rpc = rpc;
    this.surfaceId = surfaceId;
    this.expression = expression;
    this.scope = options.scope ?? "/";
    this.collectionIndices = options.collectionIndices;
    this.locale = options.locale;
    this.onChange = options.onChange;

    this.rpc.registerReactiveBinding(surfaceId, this);
    this.evaluateNow();
  }

  get value(): unknown {
    return this.currentValue;
  }

  get status(): ReactiveEvaluationStatus {
    return this.currentStatus;
  }

  get lastErrorMessage(): string | undefined {
    return this.lastErrorMsg;
  }

  /** Re-runs evaluation synchronously against current data model & surface cache. */
  evaluateNow(): void {
    if (this.isDisposed) {
      return;
    }
    const surface = this.rpc.getSurface(this.surfaceId);
    if (!surface) {
      return;
    }

    const trackingCtx = new TrackingDataContext(surface.dataModel, this.scope);
    const neededRpcSubs = new Map<
      string,
      {
        readonly siteKey: string;
        readonly callKey: string;
        readonly callFunction: CallFunctionPayload;
      }
    >();

    const outcome = this.evalNode(
      this.expression,
      "root",
      trackingCtx,
      surface.defaultCatalogId,
      0,
      neededRpcSubs,
    );

    this.syncDataSubscriptions(surface.dataModel, trackingCtx.readPaths);
    this.syncRpcSubscriptions(neededRpcSubs);

    const prevStatus = this.currentStatus;
    const prevValue = this.currentValue;

    if (outcome.status === "resolved") {
      this.currentStatus = "resolved";
      this.currentValue = outcome.value === undefined ? null : outcome.value;
    } else {
      this.currentStatus = outcome.status;
      this.currentValue = null;
    }

    if (
      this.onChange &&
      (prevStatus !== this.currentStatus || prevValue !== this.currentValue)
    ) {
      this.onChange(this.currentValue, this.currentStatus);
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    for (const sub of this.dataSubs.values()) {
      sub.unsubscribe();
    }
    this.dataSubs.clear();
    for (const unsub of this.rpcSubs.values()) {
      unsub();
    }
    this.rpcSubs.clear();
    this.failedCallSignatures.clear();
    this.rpc.unregisterReactiveBinding(this.surfaceId, this);
  }

  private syncDataSubscriptions(
    model: DataModel,
    neededPaths: ReadonlySet<CanonicalPointer>,
  ): void {
    for (const [path, sub] of this.dataSubs) {
      if (!neededPaths.has(path)) {
        sub.unsubscribe();
        this.dataSubs.delete(path);
      }
    }
    for (const path of neededPaths) {
      if (!this.dataSubs.has(path)) {
        const sub = model.subscribe(path, () => {
          this.evaluateNow();
        });
        this.dataSubs.set(path, sub);
      }
    }
  }

  private syncRpcSubscriptions(
    needed: ReadonlyMap<
      string,
      {
        readonly siteKey: string;
        readonly callKey: string;
        readonly callFunction: CallFunctionPayload;
      }
    >,
  ): void {
    for (const [subId, unsub] of this.rpcSubs) {
      if (!needed.has(subId)) {
        unsub();
        this.rpcSubs.delete(subId);
      }
    }
    for (const [subId, info] of needed) {
      if (this.rpcSubs.has(subId)) {
        continue;
      }
      const handle = this.rpc.subscribeOrStartReactiveAgentCall(
        this.surfaceId,
        info.callKey,
        info.callFunction,
        (result) => {
          this.rpcSubs.delete(subId);
          if (this.isDisposed) {
            return;
          }
          if (!result.ok) {
            if (result.cancelled) {
              // Cancelled calls report no error and are NOT remembered as failures.
              return;
            }
            this.lastErrorMsg = result.error.message;
            this.failedCallSignatures.set(info.siteKey, info.callKey);
            this.evaluateNow();
            return;
          }
          this.failedCallSignatures.delete(info.siteKey);
          this.evaluateNow();
        },
      );
      this.rpcSubs.set(subId, handle.unsubscribe);
    }
  }

  private recordAndReportLocalFailure(
    siteKey: string,
    signature: string,
    code: string,
    message: string,
  ): NodeEvalOutcome {
    const prev = this.failedCallSignatures.get(siteKey);
    if (prev !== signature) {
      this.failedCallSignatures.set(siteKey, signature);
      this.lastErrorMsg = message;
      this.rpc.reportSurfaceError(this.surfaceId, code, message);
    }
    return { status: "failed" };
  }

  private evalNode(
    node: unknown,
    siteKey: string,
    dataContext: TrackingDataContext,
    surfaceDefaultCatalogId: string | undefined,
    depth: number,
    neededRpcSubs: Map<
      string,
      {
        readonly siteKey: string;
        readonly callKey: string;
        readonly callFunction: CallFunctionPayload;
      }
    >,
  ): NodeEvalOutcome {
    if (node === null || node === undefined || typeof node !== "object") {
      return { status: "resolved", value: node };
    }
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      let anyPending = false;
      let anyFailed = false;
      for (let i = 0; i < node.length; i += 1) {
        const res = this.evalNode(
          node[i],
          `${siteKey}[${i}]`,
          dataContext,
          surfaceDefaultCatalogId,
          depth,
          neededRpcSubs,
        );
        if (res.status === "failed") {
          anyFailed = true;
        } else if (res.status === "pending") {
          anyPending = true;
        } else {
          out.push(res.value);
        }
      }
      if (anyFailed) return { status: "failed" };
      if (anyPending) return { status: "pending" };
      return { status: "resolved", value: out };
    }
    if (isV1DataBinding(node)) {
      return { status: "resolved", value: dataContext.get(node["@path"]) };
    }
    if (isV1FunctionCall(node)) {
      return this.evalFunctionCallNode(
        node,
        siteKey,
        dataContext,
        surfaceDefaultCatalogId,
        depth,
        neededRpcSubs,
      );
    }

    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let anyPending = false;
    let anyFailed = false;
    for (const key of Object.keys(obj)) {
      const res = this.evalNode(
        obj[key],
        `${siteKey}.${key}`,
        dataContext,
        surfaceDefaultCatalogId,
        depth,
        neededRpcSubs,
      );
      if (res.status === "failed") {
        anyFailed = true;
      } else if (res.status === "pending") {
        anyPending = true;
      } else {
        defineOwn(out, unescapeAtKey(key), res.value);
      }
    }
    if (anyFailed) return { status: "failed" };
    if (anyPending) return { status: "pending" };
    return { status: "resolved", value: out };
  }

  private evalFunctionCallNode(
    call: {
      readonly "@call": string;
      readonly args?: Readonly<Record<string, unknown>>;
      readonly catalogId?: string;
    },
    siteKey: string,
    dataContext: TrackingDataContext,
    surfaceDefaultCatalogId: string | undefined,
    depth: number,
    neededRpcSubs: Map<
      string,
      {
        readonly siteKey: string;
        readonly callKey: string;
        readonly callFunction: CallFunctionPayload;
      }
    >,
  ): NodeEvalOutcome {
    const fnName = call["@call"];
    const nextDepth = depth + 1;
    if (nextDepth > this.rpc.limits.maxCallDepth) {
      return this.recordAndReportLocalFailure(
        siteKey,
        `depth:${fnName}`,
        "EXPRESSION_ERROR",
        `Maximum function call depth (${this.rpc.limits.maxCallDepth}) exceeded while calling '${fnName}'`,
      );
    }

    // 1. Universal `@`-prefixed system functions never route to the agent.
    if (fnName.startsWith("@")) {
      const sysImpl =
        this.rpc.functionRegistry.getSystem(fnName) ??
        DEFAULT_BASIC_FN_REGISTRY.getSystem(fnName);
      if (!sysImpl) {
        return this.recordAndReportLocalFailure(
          siteKey,
          `sys:${fnName}`,
          "EXPRESSION_ERROR",
          `Unknown system function '${fnName}'`,
        );
      }
      const argOutcome = this.evalArgsObject(
        call.args,
        siteKey,
        dataContext,
        surfaceDefaultCatalogId,
        nextDepth,
        neededRpcSubs,
      );
      if (argOutcome.status !== "resolved") {
        return argOutcome;
      }
      try {
        const value = sysImpl.execute(argOutcome.args, {
          dataContext,
          collectionIndices: this.collectionIndices,
          locale: this.locale ?? this.rpc.getLocale(),
          userActivation: false,
          openUrl: this.rpc.getOpenUrl(),
          surfaceDefaultCatalogId,
          surfaceId: this.surfaceId,
          caller: "renderer",
          catalogRegistry: this.rpc.catalogRegistry,
          functionRegistry: this.rpc.functionRegistry,
          callDepth: nextDepth,
        });
        return { status: "resolved", value };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return this.recordAndReportLocalFailure(
          siteKey,
          `syserr:${fnName}:${canonicalJson(argOutcome.args)}`,
          "EXPRESSION_ERROR",
          msg,
        );
      }
    }

    // 2. Catalog resolution.
    const targetCatalogId = call.catalogId ?? surfaceDefaultCatalogId;
    if (targetCatalogId === undefined) {
      return this.recordAndReportLocalFailure(
        siteKey,
        `nocat:${fnName}`,
        "CATALOG_ERROR",
        `Surface '${this.surfaceId}' has no default catalogId to resolve function '${fnName}'`,
      );
    }
    const catalog = this.rpc.catalogRegistry.get(targetCatalogId);
    if (!catalog || !isV10ProtocolVersion(catalog.protocolVersion)) {
      return this.recordAndReportLocalFailure(
        siteKey,
        `badcat:${targetCatalogId}:${fnName}`,
        "CATALOG_ERROR",
        `Catalog not found: ${targetCatalogId}`,
      );
    }

    const fnDef = catalog.functions.get(fnName);
    const impl = lookupLocalImplementation(
      catalog.catalogId,
      fnName,
      this.rpc.functionRegistry,
      targetCatalogId,
    );

    // 3. Enforce boundaries before evaluating arguments or dispatching.
    const effectiveAllowedCallers =
      fnDef?.allowedCallers ?? impl?.allowedCallers ?? "rendererOnly";
    if (effectiveAllowedCallers === "agentOnly") {
      return this.recordAndReportLocalFailure(
        siteKey,
        `agentOnly:${catalog.catalogId}:${fnName}`,
        "EXPRESSION_ERROR",
        `Function '${fnName}' cannot be called by renderer (allowedCallers is agentOnly)`,
      );
    }

    const requiresActivation =
      fnDef?.requiresUserActivation === true ||
      impl?.requiresUserActivation === true;
    if (requiresActivation) {
      return this.recordAndReportLocalFailure(
        siteKey,
        `activation:${catalog.catalogId}:${fnName}`,
        "EXPRESSION_ERROR",
        `Function '${fnName}' requires user activation`,
      );
    }

    if (!impl && !this.rpc.hasOutboundListener) {
      return this.recordAndReportLocalFailure(
        siteKey,
        `nolistener:${catalog.catalogId}:${fnName}`,
        "EXPRESSION_ERROR",
        `Function '${fnName}' has no local implementation and no outbound listener is available`,
      );
    }

    // 4. Evaluate all sibling arguments together (parallel dispatch for reactive bindings).
    const argOutcome = this.evalArgsObject(
      call.args,
      siteKey,
      dataContext,
      surfaceDefaultCatalogId,
      nextDepth,
      neededRpcSubs,
    );
    if (argOutcome.status !== "resolved") {
      return argOutcome;
    }

    const resolvedArgs = argOutcome.args;

    // 5. Local function execution.
    if (impl) {
      const parsed = parseAndValidateFunctionArgs(
        fnName,
        resolvedArgs,
        fnDef,
        catalog,
        impl.parametersSchema,
      );
      if (!parsed.ok) {
        return this.recordAndReportLocalFailure(
          siteKey,
          `invalid:${catalog.catalogId}:${fnName}:${canonicalJson(resolvedArgs)}`,
          "EXPRESSION_ERROR",
          parsed.message,
        );
      }

      const templateErrorKey = `tpl:${siteKey}:${canonicalJson(parsed.args)}`;
      const templateErrorsReported =
        this.failedCallSignatures.get(templateErrorKey) === "reported";

      try {
        const value = impl.execute(parsed.args, {
          dataContext,
          collectionIndices: this.collectionIndices,
          locale: this.locale ?? this.rpc.getLocale(),
          userActivation: false,
          openUrl: this.rpc.getOpenUrl(),
          inheritedCatalogId: catalog.catalogId,
          surfaceDefaultCatalogId,
          surfaceId: this.surfaceId,
          caller: "renderer",
          catalogRegistry: this.rpc.catalogRegistry,
          functionRegistry: this.rpc.functionRegistry,
          callDepth: nextDepth,
          onTemplatePartError: (err) => {
            if (!templateErrorsReported) {
              this.failedCallSignatures.set(templateErrorKey, "reported");
              this.lastErrorMsg = err.message;
              this.rpc.reportSurfaceError(
                this.surfaceId,
                "EXPRESSION_ERROR",
                err.message,
              );
            }
          },
        });
        return { status: "resolved", value };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code =
          err instanceof A2uiCatalogError
            ? "CATALOG_ERROR"
            : "EXPRESSION_ERROR";
        return this.recordAndReportLocalFailure(
          siteKey,
          `exec:${catalog.catalogId}:${fnName}:${canonicalJson(parsed.args)}`,
          code,
          msg,
        );
      }
    }

    // 6. Agent fallback path.
    if (hasNonJsonNumber(resolvedArgs)) {
      return this.recordAndReportLocalFailure(
        siteKey,
        `nonjson:${catalog.catalogId}:${fnName}`,
        "EXPRESSION_ERROR",
        `Function '${fnName}' arguments contain a non-JSON number (NaN or Infinity)`,
      );
    }

    const parsed = parseAndValidateFunctionArgs(
      fnName,
      resolvedArgs,
      fnDef,
      catalog,
    );
    if (!parsed.ok) {
      return this.recordAndReportLocalFailure(
        siteKey,
        `schema:${catalog.catalogId}:${fnName}:${canonicalJson(resolvedArgs)}`,
        "EXPRESSION_ERROR",
        parsed.message,
      );
    }

    const callKey = canonicalCallKey(catalog.catalogId, fnName, parsed.args);

    // If THIS binding already failed for this exact (catalogId, fnName, canonicalArgs),
    // stay failed without resending until its own arguments change.
    const prevFailedKey = this.failedCallSignatures.get(siteKey);
    if (prevFailedKey === callKey) {
      return { status: "failed" };
    }
    if (prevFailedKey !== undefined) {
      this.failedCallSignatures.delete(siteKey);
    }

    // Check surface settled cache first.
    const cached = this.rpc.getCachedReactiveResult(this.surfaceId, callKey);
    if (cached.hit) {
      return { status: "resolved", value: cached.value };
    }

    // Schedule shared in-flight subscription (dispatches at most one outbound call).
    const subId = `${siteKey}::${callKey}`;
    neededRpcSubs.set(subId, {
      siteKey,
      callKey,
      callFunction: {
        "@call": fnName,
        catalogId: catalog.catalogId,
        args: parsed.args,
      },
    });
    return { status: "pending" };
  }

  private evalArgsObject(
    rawArgs: Readonly<Record<string, unknown>> | undefined,
    siteKey: string,
    dataContext: TrackingDataContext,
    surfaceDefaultCatalogId: string | undefined,
    depth: number,
    neededRpcSubs: Map<
      string,
      {
        readonly siteKey: string;
        readonly callKey: string;
        readonly callFunction: CallFunctionPayload;
      }
    >,
  ):
    | { readonly status: "resolved"; readonly args: Record<string, unknown> }
    | { readonly status: "pending" }
    | { readonly status: "failed" } {
    const out: Record<string, unknown> = {};
    if (!rawArgs) {
      return { status: "resolved", args: out };
    }
    let anyPending = false;
    let anyFailed = false;
    for (const key of Object.keys(rawArgs)) {
      const res = this.evalNode(
        rawArgs[key],
        `${siteKey}/args/${key}`,
        dataContext,
        surfaceDefaultCatalogId,
        depth,
        neededRpcSubs,
      );
      if (res.status === "failed") {
        anyFailed = true;
      } else if (res.status === "pending") {
        anyPending = true;
      } else {
        defineOwn(out, key, res.value);
      }
    }
    if (anyFailed) return { status: "failed" };
    if (anyPending) return { status: "pending" };
    return { status: "resolved", args: out };
  }
}

/**
 * Reactive evaluator for a component `CheckRule` condition:
 * - While pending on an agent call, the rule does NOT fail (`passed === true`)
 * - When resolved, normalizes boolean or `ValidationResult` answers
 * - When an agent or local error occurs, fails closed (`passed === false`) with
 *   the rule's message (falling back to the error message)
 */
export class ReactiveCheckEvaluation {
  private readonly inner: ReactiveEvaluation;
  private readonly ruleMessage?: string;

  constructor(
    rpc: RpcManager,
    surfaceId: string,
    condition: unknown,
    ruleMessage?: string,
    options: Omit<ReactiveEvaluationOptions, "onChange"> & {
      readonly onChange?: (
        passed: boolean,
        result: NormalizedValidationResult,
      ) => void;
    } = {},
  ) {
    this.ruleMessage = ruleMessage;
    this.inner = new ReactiveEvaluation(rpc, surfaceId, condition, {
      scope: options.scope,
      collectionIndices: options.collectionIndices,
      locale: options.locale,
      onChange: options.onChange
        ? () => {
            options.onChange!(this.passed, this.validationResult);
          }
        : undefined,
    });
  }

  get status(): ReactiveEvaluationStatus {
    return this.inner.status;
  }

  get passed(): boolean {
    return this.validationResult.valid;
  }

  get validationResult(): NormalizedValidationResult {
    if (this.inner.status === "pending") {
      return { valid: true, message: "", severity: "error" };
    }
    if (this.inner.status === "failed") {
      return {
        valid: false,
        message:
          this.ruleMessage ?? this.inner.lastErrorMessage ?? "Validation failed",
        severity: "error",
      };
    }
    return normalizeCheckRuleResult(this.inner.value, this.ruleMessage);
  }

  dispose(): void {
    this.inner.dispose();
  }
}

// Re-export helpers used internally by `actions.ts` so validation stays consistent.
export {
  A2uiExpressionError,
  A2uiValidationError,
  evaluateDynamicValue,
  validateReservedKeysInDynamicValue,
};
