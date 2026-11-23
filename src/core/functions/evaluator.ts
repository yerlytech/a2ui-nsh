/**
 * Runtime evaluator for A2UI v1.0 dynamic values, catalog-routed function calls,
 * schema-aware `DynamicBoolean` argument coercion, `@checks` evaluation, and
 * surface component/template expansion.
 */

import {
  A2uiCatalogError,
  BASIC_CATALOG_V1_ID,
  isV10ProtocolVersion,
  type Catalog,
  type FunctionDefinition,
} from "../catalog";
import { DataContext } from "../data_model";
import {
  isV1DataBinding,
  isV1FunctionCall,
  unescapeAtKey,
} from "../expression";
import { isJsonObject, type JsonObject } from "../json_schema";
import type { ComponentModel, SurfaceModel } from "../processor";
import {
  setTemplateCallDispatcher,
} from "./basic_functions";
import { coerceDynamicBoolean, evaluateCheckRules } from "./coercion";
import { FunctionRegistry } from "./registry";
import {
  A2uiFunctionError,
  DEFAULT_FUNCTION_EVAL_LIMITS,
  type ComponentValidationState,
  type FunctionExecutionContext,
  type FunctionImplementation,
} from "./types";

const DEFAULT_FUNCTION_REGISTRY = FunctionRegistry.withBasicV1();

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

function isDynamicBooleanRef(schema: unknown): boolean {
  if (!isJsonObject(schema)) {
    return false;
  }
  const ref = schema["$ref"];
  if (
    typeof ref === "string" &&
    (ref === "#/$defs/DynamicBoolean" ||
      ref.endsWith("common_types.json#/$defs/DynamicBoolean"))
  ) {
    return true;
  }
  return false;
}

/**
 * Coerces resolved arguments matching `DynamicBoolean` (or arrays of
 * `DynamicBoolean`) in a function's JSON schema before passing them to the
 * function implementation.
 */
function coerceArgsFromSchema(
  args: Record<string, unknown>,
  fnDef: FunctionDefinition | undefined,
): Record<string, unknown> {
  if (!fnDef || !isJsonObject(fnDef.schema)) {
    return args;
  }
  const topProps = fnDef.schema["properties"];
  if (!isJsonObject(topProps)) {
    return args;
  }
  const argsSchema = topProps["args"];
  if (!isJsonObject(argsSchema)) {
    return args;
  }
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

function resolveCatalogForCall(
  fnName: string,
  explicitCatalogId: string | undefined,
  fromTemplate: boolean,
  context: FunctionExecutionContext,
): Catalog {
  const registry = context.catalogRegistry!;
  const surfaceId = context.surfaceId ?? "main";
  const targetId =
    explicitCatalogId ??
    (fromTemplate ? context.inheritedCatalogId : undefined) ??
    context.surfaceDefaultCatalogId;

  if (targetId === undefined) {
    throw new A2uiCatalogError(
      "CATALOG_NOT_FOUND",
      `Surface '${surfaceId}' has no default catalogId to resolve function '${fnName}'`,
      surfaceId,
    );
  }

  const catalog = registry.get(targetId);
  if (!catalog || !isV10ProtocolVersion(catalog.protocolVersion)) {
    throw new A2uiCatalogError(
      "CATALOG_NOT_FOUND",
      `Catalog not found: ${targetId}`,
      surfaceId,
    );
  }

  return catalog;
}

function enforceCallPolicies(
  fnName: string,
  allowedCallers: string,
  requiresUserActivation: boolean,
  context: FunctionExecutionContext,
): void {
  const caller = context.caller ?? "renderer";
  if (caller === "renderer" && allowedCallers === "agentOnly") {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Function '${fnName}' cannot be called by renderer (allowedCallers: agentOnly)`,
      fnName,
    );
  }
  if (caller === "agent" && allowedCallers === "rendererOnly") {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Function '${fnName}' cannot be called by agent (allowedCallers: rendererOnly)`,
      fnName,
    );
  }
  if (requiresUserActivation && context.userActivation === false) {
    throw new A2uiFunctionError(
      "USER_ACTIVATION_REQUIRED",
      `Function '${fnName}' requires user activation`,
      fnName,
    );
  }
}

function lookupImplementation(
  catalogId: string,
  fnName: string,
  fnRegistry: FunctionRegistry,
): FunctionImplementation | undefined {
  const direct = fnRegistry.get(catalogId, fnName);
  if (direct) {
    return direct;
  }
  if (catalogId === BASIC_CATALOG_V1_ID) {
    return DEFAULT_FUNCTION_REGISTRY.get(BASIC_CATALOG_V1_ID, fnName);
  }
  return undefined;
}

function executeResolvedCall(
  fnName: string,
  resolvedArgs: Record<string, unknown>,
  explicitCatalogId: string | undefined,
  fromTemplate: boolean,
  context: FunctionExecutionContext,
): unknown {
  const fnRegistry = context.functionRegistry ?? DEFAULT_FUNCTION_REGISTRY;
  const depth = (context.callDepth ?? 0) + 1;
  const maxDepth =
    context.limits?.maxCallDepth ?? DEFAULT_FUNCTION_EVAL_LIMITS.maxCallDepth;

  if (depth > maxDepth) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Maximum function call depth (${maxDepth}) exceeded while calling '${fnName}'`,
      fnName,
    );
  }

  // System functions (@index, etc.) are always catalogless.
  if (fnName.startsWith("@")) {
    const sysImpl =
      fnRegistry.getSystem(fnName) ?? DEFAULT_FUNCTION_REGISTRY.getSystem(fnName);
    if (!sysImpl) {
      throw new A2uiFunctionError(
        "UNKNOWN_FUNCTION",
        `Unknown system function '${fnName}'`,
        fnName,
      );
    }
    enforceCallPolicies(
      fnName,
      sysImpl.allowedCallers,
      sysImpl.requiresUserActivation,
      context,
    );
    return sysImpl.execute(resolvedArgs, {
      ...context,
      callDepth: depth,
    });
  }

  // Surface-scoped v1.0 catalog resolution when a CatalogRegistry is attached.
  if (context.catalogRegistry) {
    const catalog = resolveCatalogForCall(
      fnName,
      explicitCatalogId,
      fromTemplate,
      context,
    );
    const fnDef = catalog.functions.get(fnName);
    if (!fnDef) {
      throw new A2uiFunctionError(
        "EXPRESSION_ERROR",
        `Function '${fnName}' is not declared in catalog '${catalog.catalogId}'`,
        fnName,
      );
    }

    enforceCallPolicies(
      fnName,
      fnDef.allowedCallers,
      fnDef.requiresUserActivation,
      context,
    );

    const impl = lookupImplementation(catalog.catalogId, fnName, fnRegistry);
    if (!impl) {
      throw new A2uiFunctionError(
        "UNKNOWN_FUNCTION",
        `No local implementation registered for '${fnName}' in catalog '${catalog.catalogId}'`,
        fnName,
      );
    }

    enforceCallPolicies(
      fnName,
      impl.allowedCallers,
      impl.requiresUserActivation,
      context,
    );

    const coercedArgs = coerceArgsFromSchema(resolvedArgs, fnDef);
    return impl.execute(coercedArgs, {
      ...context,
      inheritedCatalogId: catalog.catalogId,
      callDepth: depth,
    });
  }

  // Direct standalone evaluation (no CatalogRegistry attached): resolve in Basic v1.
  const targetCatalogId = explicitCatalogId ?? BASIC_CATALOG_V1_ID;
  const impl =
    lookupImplementation(targetCatalogId, fnName, fnRegistry) ??
    lookupImplementation(BASIC_CATALOG_V1_ID, fnName, fnRegistry);
  if (!impl) {
    throw new A2uiFunctionError(
      "UNKNOWN_FUNCTION",
      `Unknown function '${fnName}'`,
      fnName,
    );
  }
  enforceCallPolicies(
    fnName,
    impl.allowedCallers,
    impl.requiresUserActivation,
    context,
  );
  return impl.execute(resolvedArgs, {
    ...context,
    inheritedCatalogId: targetCatalogId,
    callDepth: depth,
  });
}

// Wire template `${fn(...)}` dispatcher for `formatString`.
setTemplateCallDispatcher((name, resolvedArgs, context) => {
  return executeResolvedCall(
    name,
    { ...resolvedArgs },
    undefined,
    true,
    context,
  );
});

/**
 * Evaluates a v1.0 `FunctionCall` object (`{ "@call", args?, catalogId? }`),
 * enforcing v1.0 catalog resolution, `allowedCallers`, `requiresUserActivation`,
 * and schema-aware `DynamicBoolean` argument coercion.
 */
export function evaluateFunctionCall(
  call: {
    readonly "@call": string;
    readonly args?: Readonly<Record<string, unknown>>;
    readonly catalogId?: string;
  },
  context: FunctionExecutionContext,
): unknown {
  const fnName = call["@call"];
  const depth = (context.callDepth ?? 0) + 1;
  const maxDepth =
    context.limits?.maxCallDepth ?? DEFAULT_FUNCTION_EVAL_LIMITS.maxCallDepth;

  if (depth > maxDepth) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Maximum function call depth (${maxDepth}) exceeded while calling '${fnName}'`,
      fnName,
    );
  }

  // Validate catalog & policy BEFORE evaluating arguments when surface-scoped,
  // so disallowed callers or missing catalogs fail immediately without running nested args.
  if (!fnName.startsWith("@") && context.catalogRegistry) {
    const catalog = resolveCatalogForCall(fnName, call.catalogId, false, context);
    const fnDef = catalog.functions.get(fnName);
    if (!fnDef) {
      throw new A2uiFunctionError(
        "EXPRESSION_ERROR",
        `Function '${fnName}' is not declared in catalog '${catalog.catalogId}'`,
        fnName,
      );
    }
    enforceCallPolicies(
      fnName,
      fnDef.allowedCallers,
      fnDef.requiresUserActivation,
      context,
    );
  }

  // Nested JSON `@call` objects inside `args` do NOT inherit the outer call's `catalogId`.
  const argContext: FunctionExecutionContext = {
    ...context,
    inheritedCatalogId: undefined,
    callDepth: depth,
  };

  const resolvedArgs: Record<string, unknown> = {};
  if (call.args) {
    for (const key of Object.keys(call.args)) {
      defineOwn(
        resolvedArgs,
        key,
        evaluateDynamicValue(call.args[key], argContext),
      );
    }
  }

  return executeResolvedCall(
    fnName,
    resolvedArgs,
    call.catalogId,
    false,
    context,
  );
}

/**
 * Recursively resolves any A2UI v1.0 `DynamicValue`:
 * - `{ "@path": string }` -> reads from `context.dataContext`
 * - `{ "@call": string, ... }` -> executes via `evaluateFunctionCall`
 * - Plain objects -> unescapes `@@` keys and evaluates property values
 * - Arrays -> evaluates each element
 * - Primitives -> returned unchanged
 */
export function evaluateDynamicValue(
  value: unknown,
  context: FunctionExecutionContext,
): unknown {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => evaluateDynamicValue(item, context));
  }
  if (isV1DataBinding(value)) {
    return context.dataContext.get(value["@path"]);
  }
  if (isV1FunctionCall(value)) {
    return evaluateFunctionCall(value, context);
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    defineOwn(
      out,
      unescapeAtKey(key),
      evaluateDynamicValue(obj[key], context),
    );
  }
  return out;
}

/**
 * Evaluates a component's `@checks` list in `context` and returns its
 * aggregated `ComponentValidationState`.
 */
export function evaluateComponentChecks(
  checks: readonly unknown[],
  context: FunctionExecutionContext,
): ComponentValidationState {
  return evaluateCheckRules(checks, (condition) =>
    evaluateDynamicValue(condition, context),
  );
}

/** Evaluated snapshot of one materialized component node on a surface. */
export interface EvaluatedComponentNode {
  readonly id: string;
  readonly type: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly validation?: ComponentValidationState;
}

export interface EvaluateSurfaceOptions {
  readonly locale?: string;
  readonly userActivation?: boolean;
  readonly openUrl?: FunctionExecutionContext["openUrl"];
  readonly catalogRegistry?: FunctionExecutionContext["catalogRegistry"];
  readonly functionRegistry?: FunctionRegistry;
}

function isTemplateChildren(
  value: unknown,
): value is { readonly path: string; readonly componentId: string } {
  return (
    isPlainObject(value) &&
    typeof value["path"] === "string" &&
    typeof value["componentId"] === "string"
  );
}

function collectDirectChildIds(comp: ComponentModel): string[] {
  const ids: string[] = [];
  const props = comp.properties;
  if (typeof props["child"] === "string") {
    ids.push(props["child"]);
  }
  if (Array.isArray(props["children"])) {
    for (const entry of props["children"]) {
      if (typeof entry === "string") {
        ids.push(entry);
      }
    }
  }
  if (typeof props["trigger"] === "string") {
    ids.push(props["trigger"]);
  }
  if (typeof props["content"] === "string") {
    ids.push(props["content"]);
  }
  if (Array.isArray(props["tabs"])) {
    for (const tab of props["tabs"]) {
      if (isPlainObject(tab) && typeof tab["child"] === "string") {
        ids.push(tab["child"]);
      }
    }
  }
  return ids;
}

/**
 * Evaluates a surface's component tree starting from `"root"`, expanding
 * collection templates (`children: { path, componentId }`) into suffixed node
 * IDs (`<id>_<index>`) with scoped `DataContext` and `collectionIndices`, and
 * evaluating all dynamic bindings, function calls, and `@checks`.
 */
export function evaluateSurfaceComponents(
  surface: SurfaceModel,
  options: EvaluateSurfaceOptions = {},
): Map<string, EvaluatedComponentNode> {
  const result = new Map<string, EvaluatedComponentNode>();

  const evalComponent = (
    compId: string,
    nodeId: string,
    dataContext: DataContext,
    collectionIndices: readonly number[],
    indexSuffix: string,
  ): void => {
    const comp = surface.components.get(compId);
    if (!comp) {
      return;
    }

    const ctx: FunctionExecutionContext = {
      dataContext,
      collectionIndices,
      locale: options.locale,
      userActivation: options.userActivation ?? false,
      openUrl: options.openUrl,
      surfaceDefaultCatalogId: surface.defaultCatalogId,
      surfaceId: surface.id,
      caller: "renderer",
      catalogRegistry: options.catalogRegistry,
      functionRegistry: options.functionRegistry ?? DEFAULT_FUNCTION_REGISTRY,
    };

    const evaluatedProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(comp.properties)) {
      if (k === "children" && isTemplateChildren(v)) {
        const listPath = dataContext.resolvePath(v.path);
        const listVal = surface.dataModel.get(listPath);
        const expandedIds: string[] = [];
        if (Array.isArray(listVal)) {
          for (let idx = 0; idx < listVal.length; idx += 1) {
            const itemContext = new DataContext(
              surface.dataModel,
              `${listPath === "/" ? "" : listPath}/${idx}`,
            );
            const nextIndices = [...collectionIndices, idx];
            const nextSuffix = `${indexSuffix}_${idx}`;
            const childNodeId = `${v.componentId}${nextSuffix}`;
            expandedIds.push(childNodeId);
            evalComponent(
              v.componentId,
              childNodeId,
              itemContext,
              nextIndices,
              nextSuffix,
            );
          }
        }
        evaluatedProps[k] = expandedIds;
      } else {
        evaluatedProps[k] = evaluateDynamicValue(v, ctx);
      }
    }

    const validation =
      comp.checks && comp.checks.length > 0
        ? evaluateComponentChecks(comp.checks, ctx)
        : undefined;

    result.set(nodeId, {
      id: nodeId,
      type: comp.type,
      properties: evaluatedProps,
      validation,
    });

    for (const childId of collectDirectChildIds(comp)) {
      const childNodeId = indexSuffix.length > 0 ? `${childId}${indexSuffix}` : childId;
      evalComponent(childId, childNodeId, dataContext, collectionIndices, indexSuffix);
    }
  };

  const rootCtx = new DataContext(surface.dataModel, "/");
  if (surface.components.has("root")) {
    evalComponent("root", "root", rootCtx, [], "");
  } else {
    for (const id of surface.components.keys()) {
      if (!result.has(id)) {
        evalComponent(id, id, rootCtx, [], "");
      }
    }
  }

  return result;
}
