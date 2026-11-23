/**
 * Pure TypeScript A2UI v1.0 action dispatcher:
 * - Dispatch-time evaluation of `action.event.context` and `action.event.userMessage`
 *   in declared order (sequentially awaiting routed agent calls)
 * - Strict UAX #31 identifier validation for `action.metadata.extensions`
 * - Imperative execution of `action.functionCall` (local or agent fallback)
 *   with `requiresUserActivation` enforcement and zero caching/dedup
 * - Strict v1.0 `renderer_to_agent` `action` envelope emission
 */

import { DataContext, DataModel } from "./data_model";
import {
  A2uiValidationError,
  isV1FunctionCall,
  isValidUax31Identifier,
  unescapeAtKey,
  validateReservedKeysInDynamicValue,
} from "./expression";
import type { UrlOpener } from "./functions";
import { isJsonObject } from "./json_schema";
import { parseArrayIndex, parsePointer } from "./pointer";
import {
  ReportedEvalError,
  RpcManager,
  evaluateImperativeFunctionCall,
  evaluateImperativeValue,
  type ImperativeEvalContext,
} from "./rpc";

// ---------------------------------------------------------------------------
// Wire & domain types (strict A2UI v1.0)
// ---------------------------------------------------------------------------

/** Injected ISO 8601 UTC timestamp seam so core stays deterministic in tests. */
export type ClockSeam = () => string;

const DEFAULT_CLOCK: ClockSeam = () => new Date().toISOString();

export interface ActionMetadata {
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface ActionEventInput {
  readonly name?: unknown;
  readonly userMessage?: unknown;
  readonly context?: unknown;
}

export interface ActionFunctionCallInput {
  readonly "@call": string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly catalogId?: string;
}

export type ActionPayload =
  | { readonly event: ActionEventInput }
  | { readonly functionCall: ActionFunctionCallInput };

export interface DispatchedActionBody {
  readonly name: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly timestamp: string;
  readonly context: Record<string, unknown>;
  readonly userMessage?: string;
  readonly metadata?: ActionMetadata;
}

export interface DispatchedActionEnvelope {
  readonly version: "1.0";
  readonly action: DispatchedActionBody;
}

export type ActionHandler = (envelope: DispatchedActionEnvelope) => void;

export interface DispatchActionOptions {
  readonly rpc: RpcManager;
  readonly surfaceId: string;
  readonly surfaceDefaultCatalogId?: string;
  readonly sourceComponentId: string;
  readonly dataModel: DataModel;
  readonly actionPayload: unknown;
  readonly scope?: string;
  readonly collectionIndices?: readonly number[];
  readonly metadata?: unknown;
  /** User activation state for `requiresUserActivation` checks. Default: `true`. */
  readonly userActivation?: boolean;
  readonly locale?: string;
  readonly openUrl?: UrlOpener;
  readonly nowIso?: ClockSeam;
  readonly onAction?: ActionHandler;
  /** Optional liveness predicate so actions abort cleanly if the surface was deleted mid-flight. */
  readonly isSurfaceAlive?: () => boolean;
}

export type ActionDispatchResult =
  | { readonly kind: "event"; readonly envelope: DispatchedActionEnvelope }
  | { readonly kind: "functionCall"; readonly value: unknown }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Validates an outbound `action.metadata` envelope per `renderer_to_agent.json`:
 * - Must be a JSON object with no properties other than `extensions`
 * - `extensions` (when present) must be an object whose keys are all valid
 *   Unicode UAX #31 identifiers (`^[\p{XID_Start}_][\p{XID_Continue}]*$`)
 *
 * Throws `A2uiValidationError("VALIDATION_FAILED", ...)` on violation.
 */
export function validateActionMetadata(
  rawMetadata: unknown,
  surfaceId?: string,
): ActionMetadata {
  if (!isJsonObject(rawMetadata)) {
    throw new A2uiValidationError(
      "VALIDATION_FAILED",
      "Action metadata must be an object",
      "/action/metadata",
      { surfaceId },
    );
  }

  for (const key of Object.keys(rawMetadata)) {
    if (key !== "extensions") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Action metadata does not allow property '${key}'`,
        `/action/metadata/${key}`,
        { surfaceId },
      );
    }
  }

  const rawExt = rawMetadata["extensions"];
  if (rawExt === undefined) {
    return {};
  }

  if (!isJsonObject(rawExt)) {
    throw new A2uiValidationError(
      "VALIDATION_FAILED",
      "Action metadata extensions must be an object",
      "/action/metadata/extensions",
      { surfaceId },
    );
  }

  const clonedExt: Record<string, unknown> = {};
  for (const extKey of Object.keys(rawExt)) {
    if (!isValidUax31Identifier(extKey)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Action metadata extension key '${extKey}' must be a valid UAX #31 identifier`,
        `/action/metadata/extensions/${extKey}`,
        { surfaceId },
      );
    }
    defineOwn(clonedExt, extKey, deepClonePlain(rawExt[extKey]));
  }

  return { extensions: clonedExt };
}

/**
 * Derives enclosing collection iteration indices by walking `scope` against
 * `dataModel` and collecting numeric segments that index into arrays.
 */
export function deriveCollectionIndicesFromScope(
  scope: string,
  dataModel: DataModel,
): readonly number[] {
  const parsed = parsePointer(scope);
  if (parsed.segments.length === 0) {
    return [];
  }
  const indices: number[] = [];
  let cursor: unknown = dataModel.get("/");
  for (let i = 0; i < parsed.segments.length; i += 1) {
    if (cursor === null || cursor === undefined || typeof cursor !== "object") {
      break;
    }
    const seg = parsed.segments[i]!;
    if (Array.isArray(cursor)) {
      const idx = parseArrayIndex(seg);
      if (idx === null) {
        break;
      }
      indices.push(idx);
      cursor = cursor[idx];
    } else {
      cursor = (cursor as Record<string, unknown>)[seg];
    }
  }
  return indices;
}

// ---------------------------------------------------------------------------
// Action dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatches an A2UI v1.0 component `Action` (`{ event }` or `{ functionCall }`).
 *
 * - Rejects invalid `metadata` synchronously (throwing `A2uiValidationError`)
 *   before evaluating any bindings or sending any messages.
 * - For `event` actions: resolves `context` entries in declared order and
 *   `userMessage` at dispatch time, enforcing `userMessage` string/null type
 *   rules and emitting a strict v1.0 `action` envelope via `onAction`.
 * - For `functionCall` actions: executes imperatively (local or agent fallback,
 *   never sharing/caching) and dispatches no outbound `action` event.
 */
export async function dispatchAction(
  options: DispatchActionOptions,
): Promise<ActionDispatchResult> {
  const {
    rpc,
    surfaceId,
    surfaceDefaultCatalogId,
    sourceComponentId,
    dataModel,
    actionPayload,
    scope = "/",
    userActivation = true,
    locale,
    openUrl,
    nowIso = DEFAULT_CLOCK,
    onAction,
    isSurfaceAlive,
  } = options;

  // Validate action.metadata upfront (must throw ValidationError and dispatch nothing).
  const validatedMetadata =
    options.metadata !== undefined
      ? validateActionMetadata(options.metadata, surfaceId)
      : undefined;

  if (!isPlainObject(actionPayload)) {
    rpc.reportSurfaceError(
      surfaceId,
      "INVALID_ACTION",
      "Action payload must be an object containing 'event' or 'functionCall'",
    );
    return { kind: "failed" };
  }

  const hasEvent = Object.prototype.hasOwnProperty.call(actionPayload, "event");
  const hasFnCall = Object.prototype.hasOwnProperty.call(
    actionPayload,
    "functionCall",
  );
  if (hasEvent === hasFnCall) {
    rpc.reportSurfaceError(
      surfaceId,
      "INVALID_ACTION",
      "Action payload must contain exactly one of 'event' or 'functionCall'",
    );
    return { kind: "failed" };
  }

  const dataContext = new DataContext(dataModel, scope);
  const collectionIndices =
    options.collectionIndices ??
    deriveCollectionIndicesFromScope(scope, dataModel);

  const evalCtx: ImperativeEvalContext = {
    rpc,
    surfaceId,
    surfaceDefaultCatalogId,
    dataContext,
    collectionIndices,
    userActivation,
    locale,
    openUrl,
    allowAgentRouting: true,
    reportErrors: true,
  };

  if (hasEvent) {
    return dispatchEventAction(
      actionPayload["event"],
      evalCtx,
      sourceComponentId,
      validatedMetadata,
      nowIso,
      onAction,
      isSurfaceAlive,
    );
  }

  return dispatchFunctionCallAction(
    actionPayload["functionCall"],
    evalCtx,
  );
}

async function dispatchEventAction(
  rawEvent: unknown,
  evalCtx: ImperativeEvalContext,
  sourceComponentId: string,
  metadata: ActionMetadata | undefined,
  nowIso: ClockSeam,
  onAction: ActionHandler | undefined,
  isSurfaceAlive: (() => boolean) | undefined,
): Promise<ActionDispatchResult> {
  const { rpc, surfaceId } = evalCtx;

  if (!isPlainObject(rawEvent)) {
    rpc.reportSurfaceError(
      surfaceId,
      "INVALID_ACTION",
      "Action 'event' must be an object",
    );
    return { kind: "failed" };
  }

  const eventName = rawEvent["name"];
  if (typeof eventName !== "string" || eventName.length === 0) {
    rpc.reportSurfaceError(
      surfaceId,
      "INVALID_ACTION",
      "Action event requires a non-empty string 'name'",
    );
    return { kind: "failed" };
  }

  const rawContext = rawEvent["context"];
  if (rawContext !== undefined && !isPlainObject(rawContext)) {
    rpc.reportSurfaceError(
      surfaceId,
      "INVALID_ACTION",
      "Action event 'context' must be an object",
    );
    return { kind: "failed" };
  }

  // Evaluate context entries sequentially in declared key order.
  const resolvedContext: Record<string, unknown> = {};
  if (rawContext !== undefined) {
    const keys = Object.keys(rawContext);
    for (let i = 0; i < keys.length; i += 1) {
      if (isSurfaceAlive && !isSurfaceAlive()) {
        return { kind: "cancelled" };
      }
      const key = keys[i]!;
      const rawVal = rawContext[key];

      try {
        validateReservedKeysInDynamicValue(rawVal, `/context/${key}`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        rpc.reportSurfaceError(
          surfaceId,
          "EXPRESSION_ERROR",
          `Action event context entry '${key}' is invalid: ${detail}`,
        );
        return { kind: "failed" };
      }

      try {
        const resolved = await evaluateImperativeValue(rawVal, evalCtx);
        defineOwn(resolvedContext, unescapeAtKey(key), resolved);
      } catch (err) {
        if (err instanceof ReportedEvalError) {
          return err.cancelled ? { kind: "cancelled" } : { kind: "failed" };
        }
        const msg = err instanceof Error ? err.message : String(err);
        rpc.reportSurfaceError(surfaceId, "EXPRESSION_ERROR", msg);
        return { kind: "failed" };
      }
    }
  }

  if (isSurfaceAlive && !isSurfaceAlive()) {
    return { kind: "cancelled" };
  }

  // Evaluate optional userMessage (DynamicString; null/undefined omits the field).
  let resolvedUserMessage: string | undefined;
  if (
    Object.prototype.hasOwnProperty.call(rawEvent, "userMessage") &&
    rawEvent["userMessage"] !== undefined
  ) {
    const rawUserMsg = rawEvent["userMessage"];
    try {
      validateReservedKeysInDynamicValue(rawUserMsg, "/userMessage");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      rpc.reportSurfaceError(
        surfaceId,
        "EXPRESSION_ERROR",
        `Action event userMessage is invalid: ${detail}`,
      );
      return { kind: "failed" };
    }

    let evaluatedMsg: unknown;
    try {
      evaluatedMsg = await evaluateImperativeValue(rawUserMsg, evalCtx);
    } catch (err) {
      if (err instanceof ReportedEvalError) {
        return err.cancelled ? { kind: "cancelled" } : { kind: "failed" };
      }
      const msg = err instanceof Error ? err.message : String(err);
      rpc.reportSurfaceError(surfaceId, "EXPRESSION_ERROR", msg);
      return { kind: "failed" };
    }

    if (isSurfaceAlive && !isSurfaceAlive()) {
      return { kind: "cancelled" };
    }

    if (evaluatedMsg !== null && evaluatedMsg !== undefined) {
      if (typeof evaluatedMsg !== "string") {
        rpc.reportSurfaceError(
          surfaceId,
          "INVALID_ACTION",
          `Action event 'userMessage' must resolve to a string or null (got ${typeof evaluatedMsg})`,
        );
        return { kind: "failed" };
      }
      resolvedUserMessage = evaluatedMsg;
    }
  }

  if (isSurfaceAlive && !isSurfaceAlive()) {
    return { kind: "cancelled" };
  }

  const body: DispatchedActionBody = {
    name: eventName,
    surfaceId,
    sourceComponentId,
    timestamp: nowIso(),
    context: resolvedContext,
    ...(resolvedUserMessage !== undefined
      ? { userMessage: resolvedUserMessage }
      : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };

  const envelope: DispatchedActionEnvelope = {
    version: "1.0",
    action: body,
  };

  onAction?.(envelope);
  return { kind: "event", envelope };
}

async function dispatchFunctionCallAction(
  rawCall: unknown,
  evalCtx: ImperativeEvalContext,
): Promise<ActionDispatchResult> {
  const { rpc, surfaceId } = evalCtx;

  if (!isV1FunctionCall(rawCall)) {
    rpc.reportSurfaceError(
      surfaceId,
      "INVALID_ACTION",
      "Action 'functionCall' must be a valid v1.0 FunctionCall object",
    );
    return { kind: "failed" };
  }

  try {
    validateReservedKeysInDynamicValue(rawCall, "/functionCall");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    rpc.reportSurfaceError(surfaceId, "INVALID_ACTION", detail);
    return { kind: "failed" };
  }

  try {
    const value = await evaluateImperativeFunctionCall(rawCall, evalCtx);
    return { kind: "functionCall", value };
  } catch (err) {
    if (err instanceof ReportedEvalError) {
      return err.cancelled ? { kind: "cancelled" } : { kind: "failed" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    rpc.reportSurfaceError(surfaceId, "EXECUTION_ERROR", msg);
    return { kind: "failed" };
  }
}
