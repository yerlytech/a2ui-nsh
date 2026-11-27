/**
 * Pure TypeScript A2UI v1.0 payload, component, function-call, and topology
 * validator supporting strict and permissive modes, multi-catalog resolution,
 * envelope coexistence, recursion caps, and outbound `renderer_to_agent`
 * error payload serialization.
 */

import {
  A2uiCatalogError,
  A2uiIntegrityError,
  A2uiRecursionError,
  Catalog,
  CatalogRegistry,
  buildV10CommonTypesSchema,
  extractChildReferences,
  isV10ProtocolVersion,
  validateCompositionConstraints,
  validateCompositionEdge,
  validateRootComposition,
  validateV10CommonType,
  type ChildReference,
  type ComponentMetadata,
} from "./catalog";
import {
  A2uiValidationError,
  isValidFunctionCallName,
  isValidUax31Identifier,
  validateReservedKeysInComponent,
  type ValidationErrorDetail,
} from "./expression";
import {
  isJsonObject,
  validateJsonSchema,
  type JsonObject,
  type JsonValue,
  type SchemaValidationIssue,
} from "./json_schema";
import { A2uiDataError, parsePointer } from "./pointer";

/** Validation rules governing strictness and recursion safety limits. */
export interface ValidationConfig {
  /** Allow components unreachable from 'root'. Default: false. */
  readonly allowOrphanComponents: boolean;
  /** Allow references to component IDs not yet present on the surface. Default: false. */
  readonly allowDanglingReferences: boolean;
  /** Allow components/functions not declared in their catalog. Default: false. */
  readonly allowUnknownElements: boolean;
  /** Allow component batches before 'root' arrives. Default: false. */
  readonly allowMissingRoot: boolean;
  /**
   * Maximum component tree & JSON object nesting depth. Default: 50. Nested
   * `@call` function calls have no limit of their own: each call adds two
   * JSON levels (the call and its `args`), so this limit bounds them too.
   */
  readonly maxRecursionDepth: number;
}

/** Strict validation preset (default for A2UI v1.0 validation). */
export const STRICT_VALIDATION: Readonly<ValidationConfig> = Object.freeze({
  allowOrphanComponents: false,
  allowDanglingReferences: false,
  allowUnknownElements: false,
  allowMissingRoot: false,
  maxRecursionDepth: 50,
});

/** Permissive streaming validation preset (allows incremental out-of-order updates). */
export const PERMISSIVE_VALIDATION: Readonly<ValidationConfig> = Object.freeze({
  allowOrphanComponents: true,
  allowDanglingReferences: true,
  allowUnknownElements: true,
  allowMissingRoot: true,
  maxRecursionDepth: 50,
});

/**
 * Resolves a partial `ValidationConfig` against `STRICT_VALIDATION` so any
 * omitted rule defaults to strict.
 */
export function resolveValidationConfig(
  override?: Partial<ValidationConfig>,
  base: Readonly<ValidationConfig> = STRICT_VALIDATION,
): ValidationConfig {
  if (!override) {
    return base;
  }
  return {
    allowOrphanComponents:
      override.allowOrphanComponents ?? STRICT_VALIDATION.allowOrphanComponents,
    allowDanglingReferences:
      override.allowDanglingReferences ??
      STRICT_VALIDATION.allowDanglingReferences,
    allowUnknownElements:
      override.allowUnknownElements ?? STRICT_VALIDATION.allowUnknownElements,
    allowMissingRoot:
      override.allowMissingRoot ?? STRICT_VALIDATION.allowMissingRoot,
    maxRecursionDepth:
      override.maxRecursionDepth ?? STRICT_VALIDATION.maxRecursionDepth,
  };
}

/** Outbound A2UI v1.0 `renderer_to_agent` error message envelope. */
export type RendererErrorPayload =
  | {
      readonly code:
        | "VALIDATION_FAILED"
        | "UNALLOWED_PARENT"
        | "UNALLOWED_CHILD";
      readonly surfaceId: string;
      readonly path: string;
      readonly message: string;
    }
  | {
      readonly code: string;
      readonly surfaceId: string;
      readonly message: string;
    }
  | {
      readonly code: string;
      readonly functionCallId: string;
      readonly message: string;
    };

export interface RendererErrorEnvelope {
  readonly version: "1.0";
  readonly error: RendererErrorPayload;
}

const VALIDATION_PATH_ERROR_CODES = new Set<string>([
  "VALIDATION_FAILED",
  "UNALLOWED_PARENT",
  "UNALLOWED_CHILD",
]);

/** Converts a thrown A2UI core error into a strict v1.0 `renderer_to_agent` error envelope. */
export function toRendererError(
  err: unknown,
  fallbackSurfaceId?: string,
): RendererErrorEnvelope {
  if (err instanceof A2uiCatalogError) {
    const code =
      err.code === "CATALOG_VERSION_MISMATCH" || err.code === "CATALOG_NOT_FOUND"
        ? "CATALOG_NOT_FOUND"
        : err.code;
    return {
      version: "1.0",
      error: {
        code,
        surfaceId: err.surfaceId ?? fallbackSurfaceId ?? "",
        message: err.message,
      },
    };
  }
  if (err instanceof A2uiDataError) {
    return {
      version: "1.0",
      error: {
        code: "DATA_ERROR",
        surfaceId: fallbackSurfaceId ?? "",
        message: err.message,
      },
    };
  }
  if (err instanceof A2uiRecursionError) {
    return {
      version: "1.0",
      error: {
        code: "RECURSION_LIMIT_EXCEEDED",
        surfaceId: err.surfaceId ?? fallbackSurfaceId ?? "",
        message: err.message,
      },
    };
  }
  if (err instanceof A2uiIntegrityError) {
    return {
      version: "1.0",
      error: {
        code: err.code,
        surfaceId: err.surfaceId ?? fallbackSurfaceId ?? "",
        message: err.message,
      },
    };
  }
  if (err instanceof A2uiValidationError) {
    if (
      err.functionCallId !== undefined &&
      !VALIDATION_PATH_ERROR_CODES.has(err.code)
    ) {
      return {
        version: "1.0",
        error: {
          code: err.code,
          functionCallId: err.functionCallId,
          message: err.message,
        },
      };
    }
    if (VALIDATION_PATH_ERROR_CODES.has(err.code)) {
      return {
        version: "1.0",
        error: {
          code: err.code as
            | "VALIDATION_FAILED"
            | "UNALLOWED_PARENT"
            | "UNALLOWED_CHILD",
          surfaceId: err.surfaceId ?? fallbackSurfaceId ?? "",
          path: err.path ?? "/",
          message: err.message,
        },
      };
    }
    return {
      version: "1.0",
      error: {
        code: err.code,
        surfaceId: err.surfaceId ?? fallbackSurfaceId ?? "",
        message: err.message,
      },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    version: "1.0",
    error: {
      code: "INTERNAL_ERROR",
      surfaceId: fallbackSurfaceId ?? "",
      message,
    },
  };
}

/** Parsed result of a validated component instance ready for storage on a surface. */
export interface ValidatedComponent {
  readonly id: string;
  readonly type: string;
  readonly catalogId: string;
  readonly catalog: Catalog;
  /** Component properties excluding envelope routing/metadata (`id`, `component`, `@catalogId`, `@metadata`). */
  readonly properties: Record<string, unknown>;
  readonly metadata?: ComponentMetadata;
  readonly accessibility?: Record<string, unknown>;
  readonly checks?: readonly unknown[];
  /** Normalized wire representation preserving validated fields for topology inspection. */
  readonly normalizedWire: Record<string, unknown>;
}

const V10_ACTION_KEYS = new Set<string>([
  "createSurface",
  "updateComponents",
  "updateDataModel",
  "deleteSurface",
  "callRendererFunction",
  "agentFunctionResponse",
]);

const KNOWN_NON_V10_ACTIONS = new Set<string>([
  "beginRendering",
  "surfaceUpdate",
  "dataModelUpdate",
]);

function mapIssueKeywordToDetailCode(keyword: string): string {
  switch (keyword) {
    case "required":
      return "missing_field";
    case "type":
      return "type_mismatch";
    default:
      return "invalid_value";
  }
}

/**
 * Depth of a component object in its message: message (0) →
 * `createSurface` / `updateComponents` (1) → `components` (2) → component (3).
 */
const COMPONENT_DEPTH_IN_MESSAGE = 3;

/**
 * Depth of a data value in its message: message (0) →
 * `createSurface` / `updateDataModel` (1) → `dataModel` / `value` (2).
 * `DataModel.applyUpdate` checks no JSON depth itself: an app can call it
 * without a message, so this message check is the guard.
 */
const DATA_VALUE_DEPTH_IN_MESSAGE = 2;

/**
 * Depth of surface metadata in its message: message (0) → `createSurface`
 * (1) → `metadata` (2). A component's `@metadata` is part of the component
 * and is counted with it.
 */
const SURFACE_METADATA_DEPTH_IN_MESSAGE = 2;

/**
 * Depth of a renderer call's arguments in its message: message (0) →
 * `callRendererFunction` (1) → `callFunction` (2) → `args` (3). Nested
 * `@call`s inside `args` are counted by this limit too; the RPC call depth
 * (`RpcLimits.maxCallDepth`) stays as a second guard for calls that do not
 * come through a message.
 */
const RENDERER_CALL_ARGS_DEPTH_IN_MESSAGE = 3;

/**
 * Depth of a function response value in its message: message (0) →
 * `agentFunctionResponse` (1) → `value` (2).
 */
const FUNCTION_RESPONSE_VALUE_DEPTH_IN_MESSAGE = 2;

/** Validates JSON value nesting depth against `maxDepth` (0-based root object/array). */
export function validateJsonNestingDepth(
  value: unknown,
  maxDepth: number,
  surfaceId?: string,
  path?: string,
  currentDepth = 0,
): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (currentDepth > maxDepth) {
    throw new A2uiRecursionError(
      "RECURSION_LIMIT_EXCEEDED",
      `Global recursion limit exceeded: nesting depth exceeds maximum (${maxDepth})`,
      surfaceId,
      path,
    );
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      validateJsonNestingDepth(
        value[i],
        maxDepth,
        surfaceId,
        path,
        currentDepth + 1,
      );
    }
    return;
  }
  for (const val of Object.values(value as Record<string, unknown>)) {
    validateJsonNestingDepth(
      val,
      maxDepth,
      surfaceId,
      path,
      currentDepth + 1,
    );
  }
}

function validateMetadataEnvelope(
  rawMeta: unknown,
  path: string,
  surfaceId?: string,
): ComponentMetadata {
  if (!isJsonObject(rawMeta)) {
    throw new A2uiValidationError(
      "VALIDATION_FAILED",
      `Metadata at '${path}' must be an object`,
      path,
      { surfaceId },
    );
  }
  for (const key of Object.keys(rawMeta)) {
    if (key !== "extensions") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Metadata at '${path}' does not allow property '${key}'`,
        `${path}/${key}`,
        { surfaceId },
      );
    }
  }
  const rawExt = rawMeta["extensions"];
  if (rawExt === undefined) {
    return {};
  }
  if (!isJsonObject(rawExt)) {
    throw new A2uiValidationError(
      "VALIDATION_FAILED",
      `Metadata extensions at '${path}/extensions' must be an object`,
      `${path}/extensions`,
      { surfaceId },
    );
  }
  for (const extKey of Object.keys(rawExt)) {
    if (!isValidUax31Identifier(extKey)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Metadata extension key '${extKey}' must be a valid UAX #31 identifier`,
        `${path}/extensions/${extKey}`,
        { surfaceId },
      );
    }
  }
  return { extensions: { ...rawExt } };
}

/**
 * Checks whether a component schema declares a bare custom property (`catalogId`,
 * `metadata`, `accessibility`, `checks`) of its own, respecting the v1.0
 * transition rule: an inline `catalogId` or `metadata` beside an inline `id`
 * with the standard ComponentCommon shape is treated as the standard mixin, not
 * a custom property.
 */
export function componentSchemaDeclaresCustomBareProp(
  schema: JsonObject | undefined,
  bareName: "catalogId" | "metadata" | "accessibility" | "checks",
): boolean {
  if (!schema) {
    return false;
  }
  const visit = (node: JsonValue): boolean => {
    if (!isJsonObject(node)) {
      return false;
    }
    // Skip ComponentCommon / Checkable $ref mixins.
    if (typeof node["$ref"] === "string") {
      return false;
    }
    if (isJsonObject(node["properties"])) {
      const props = node["properties"];
      if (Object.prototype.hasOwnProperty.call(props, bareName)) {
        const propSchema = props[bareName];
        const hasInlineId = Object.prototype.hasOwnProperty.call(props, "id");
        if (hasInlineId && isStandardInlineCommonProp(bareName, propSchema)) {
          // Standard inline ComponentCommon mixin — NOT a custom property.
        } else {
          return true;
        }
      }
    }
    for (const combinator of ["allOf", "oneOf", "anyOf"] as const) {
      const list = node[combinator];
      if (Array.isArray(list)) {
        for (const branch of list) {
          if (visit(branch)) {
            return true;
          }
        }
      }
    }
    return false;
  };
  return visit(schema);
}

function isStandardInlineCommonProp(
  bareName: "catalogId" | "metadata" | "accessibility" | "checks",
  propSchema: JsonValue | undefined,
): boolean {
  if (!isJsonObject(propSchema)) {
    return false;
  }
  if (bareName === "catalogId") {
    return propSchema["type"] === "string";
  }
  if (bareName === "metadata") {
    if (propSchema["type"] !== "object") {
      return false;
    }
    const subProps = propSchema["properties"];
    if (!isJsonObject(subProps)) {
      return false;
    }
    const keys = Object.keys(subProps);
    return keys.length === 1 && keys[0] === "extensions";
  }
  return false;
}

let cachedCommonTypesV1Schema: JsonObject | undefined;
function getCachedCommonTypesV1Schema(): JsonObject {
  if (!cachedCommonTypesV1Schema) {
    cachedCommonTypesV1Schema = buildV10CommonTypesSchema();
  }
  return cachedCommonTypesV1Schema;
}

function componentSchemaAllowsChecks(
  catalog: Catalog,
  compType: string,
): boolean {
  const vSchema = catalog.getValidationSchemaRef();
  const comps = vSchema["components"] as JsonObject;
  const compSchema = comps[compType];
  if (!isJsonObject(compSchema)) {
    return false;
  }
  const props = compSchema["properties"];
  return (
    isJsonObject(props) &&
    Object.prototype.hasOwnProperty.call(props, "@checks")
  );
}

function validateDataBindingPathSyntax(
  pathValue: unknown,
  errorPath: string,
  surfaceId: string,
): void {
  if (typeof pathValue !== "string") {
    throw new A2uiValidationError(
      "VALIDATION_FAILED",
      `Invalid path syntax: '@path' must be a string`,
      errorPath,
      { surfaceId },
    );
  }
  // Check RFC 6901 escape sequences (~ must be followed by 0 or 1).
  for (let i = 0; i < pathValue.length; i += 1) {
    if (pathValue[i] === "~") {
      const next = pathValue[i + 1];
      if (next !== "0" && next !== "1") {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Invalid path syntax in '${pathValue}': invalid '~' escape sequence`,
          errorPath,
          { surfaceId },
        );
      }
      i += 1;
    }
  }
}

/**
 * Incremental per-surface adjacency & parent index so single-component
 * `updateComponents` streams validate in O(|batch|) instead of O(|surface|).
 */
export class SurfaceTopologyIndex {
  readonly childrenOf = new Map<string, readonly ChildReference[]>();
  /** Maps childId -> (parentId -> ChildReference[]). Includes forward/dangling refs. */
  readonly parentsOf = new Map<string, Map<string, ChildReference[]>>();
  /** Maps missingChildId -> Set of parentIds currently referencing it. */
  readonly danglingRefs = new Map<string, Set<string>>();
  /** Stable surface insertion index for error paths. */
  readonly surfaceOrder = new Map<string, number>();
  private nextOrder = 0;
  /** Minimum `maxRecursionDepth` the indexed graph is known to satisfy. */
  minValidatedMaxDepth = Infinity;

  applyComponent(
    id: string,
    normalizedWire: Record<string, unknown>,
    catalog: Catalog,
    existingIds: ReadonlyMap<string, unknown>,
  ): void {
    if (!this.surfaceOrder.has(id)) {
      this.surfaceOrder.set(id, this.nextOrder);
      this.nextOrder += 1;
    }

    // Remove previous outgoing edges for `id` if replacing an existing component.
    const prevRefs = this.childrenOf.get(id);
    if (prevRefs) {
      for (let i = 0; i < prevRefs.length; i += 1) {
        const prevChildId = prevRefs[i]!.childId;
        const parentMap = this.parentsOf.get(prevChildId);
        if (parentMap) {
          parentMap.delete(id);
          if (parentMap.size === 0) {
            this.parentsOf.delete(prevChildId);
          }
        }
        const dangling = this.danglingRefs.get(prevChildId);
        if (dangling) {
          dangling.delete(id);
          if (dangling.size === 0) {
            this.danglingRefs.delete(prevChildId);
          }
        }
      }
    }

    // `id` now exists on the surface, so clear any dangling-ref bucket waiting for it.
    this.danglingRefs.delete(id);

    const nextRefs = extractChildReferences(normalizedWire, catalog);
    this.childrenOf.set(id, nextRefs);

    for (let i = 0; i < nextRefs.length; i += 1) {
      const ref = nextRefs[i]!;
      let parentMap = this.parentsOf.get(ref.childId);
      if (!parentMap) {
        parentMap = new Map();
        this.parentsOf.set(ref.childId, parentMap);
      }
      let list = parentMap.get(id);
      if (!list) {
        list = [];
        parentMap.set(id, list);
      }
      list.push(ref);

      if (!existingIds.has(ref.childId)) {
        let dangling = this.danglingRefs.get(ref.childId);
        if (!dangling) {
          dangling = new Set();
          this.danglingRefs.set(ref.childId, dangling);
        }
        dangling.add(id);
      }
    }
  }

  removeComponent(id: string): void {
    const prevRefs = this.childrenOf.get(id);
    if (prevRefs) {
      for (let i = 0; i < prevRefs.length; i += 1) {
        const prevChildId = prevRefs[i]!.childId;
        const parentMap = this.parentsOf.get(prevChildId);
        if (parentMap) {
          parentMap.delete(id);
          if (parentMap.size === 0) {
            this.parentsOf.delete(prevChildId);
          }
        }
        const dangling = this.danglingRefs.get(prevChildId);
        if (dangling) {
          dangling.delete(id);
          if (dangling.size === 0) {
            this.danglingRefs.delete(prevChildId);
          }
        }
      }
      this.childrenOf.delete(id);
    }
    // Any remaining parents referencing `id` now have a dangling reference.
    const incoming = this.parentsOf.get(id);
    if (incoming && incoming.size > 0) {
      const dangling = new Set<string>();
      for (const parentId of incoming.keys()) {
        dangling.add(parentId);
      }
      this.danglingRefs.set(id, dangling);
    }
  }

  clear(): void {
    this.childrenOf.clear();
    this.parentsOf.clear();
    this.danglingRefs.clear();
    this.surfaceOrder.clear();
    this.nextOrder = 0;
    this.minValidatedMaxDepth = Infinity;
  }
}

export interface ValidateBatchContext {
  readonly surfaceId: string;
  readonly defaultCatalogId?: string;
  readonly existingComponents: ReadonlyMap<
    string,
    {
      readonly id: string;
      readonly type: string;
      readonly catalog: Catalog;
      readonly normalizedWire: Record<string, unknown>;
    }
  >;
  readonly topologyIndex?: SurfaceTopologyIndex;
  readonly config: ValidationConfig;
}

/** Validates A2UI v1.0 messages, components, nested calls, and surface topology. */
export class PayloadValidator {
  private readonly registry: CatalogRegistry;

  constructor(registry: CatalogRegistry) {
    this.registry = registry;
  }

  /**
   * Validates the top-level message envelope (version, single action, action
   * envelope fields) and returns the action name.
   */
  validateMessageEnvelope(
    msg: unknown,
    messageIndex: number,
    config: ValidationConfig,
  ): string {
    if (!isJsonObject(msg)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Message at index ${messageIndex} must be a JSON object`,
        `messages.${messageIndex}`,
      );
    }

    if (!Object.prototype.hasOwnProperty.call(msg, "version")) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "Missing required version field",
        `messages.${messageIndex}.version`,
        {
          details: [
            {
              path: `messages.${messageIndex}.version`,
              code: "missing_field",
              message: "Missing required version field",
            },
          ],
        },
      );
    }

    const version = msg["version"];
    if (typeof version !== "string" || !isV10ProtocolVersion(version)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Unsupported protocol version '${String(version)}'`,
        `messages.${messageIndex}.version`,
      );
    }

    const keys = Object.keys(msg).filter((k) => k !== "version");
    const v10Actions = keys.filter((k) => V10_ACTION_KEYS.has(k));
    const unknownActions = keys.filter((k) => !V10_ACTION_KEYS.has(k));

    if (unknownActions.length > 0) {
      const badAction = unknownActions[0]!;
      if (KNOWN_NON_V10_ACTIONS.has(badAction)) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `action '${badAction}' is not supported in protocol version 1.0`,
          `/${badAction}`,
        );
      }
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Unexpected action or property '${badAction}' in protocol version 1.0 message`,
        `/${badAction}`,
      );
    }

    if (v10Actions.length === 0) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "Message contains no recognized v1.0 action",
        "/",
      );
    }

    if (v10Actions.length > 1) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Message contains multiple conflicting update actions: ${v10Actions.join(", ")}`,
        "/",
      );
    }

    const action = v10Actions[0]!;
    const body = msg[action];

    switch (action) {
      case "createSurface":
        this.validateCreateSurfaceEnvelope(body, messageIndex, config);
        break;
      case "updateComponents":
        this.validateUpdateComponentsEnvelope(body, messageIndex);
        break;
      case "updateDataModel":
        this.validateUpdateDataModelEnvelope(body, messageIndex, config);
        break;
      case "deleteSurface":
        this.validateDeleteSurfaceEnvelope(body, messageIndex);
        break;
      case "callRendererFunction":
        this.validateCallRendererFunctionEnvelope(body, config);
        break;
      case "agentFunctionResponse":
        validateV10CommonType("FunctionResponse", body);
        // Counted from its message root as A2UI 1.0 does.
        validateJsonNestingDepth(
          (body as JsonObject)["value"],
          config.maxRecursionDepth,
          undefined,
          "/value",
          FUNCTION_RESPONSE_VALUE_DEPTH_IN_MESSAGE,
        );
        break;
    }

    return action;
  }

  private validateCreateSurfaceEnvelope(
    body: unknown,
    messageIndex: number,
    config: ValidationConfig,
  ): void {
    if (!isJsonObject(body)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "createSurface payload must be an object",
        "/createSurface",
      );
    }
    const surfaceId = body["surfaceId"];
    if (surfaceId === undefined) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "createSurface requires 'surfaceId'",
        "/surfaceId",
        {
          surfaceId: "",
          details: [
            {
              path: `messages.${messageIndex}.createSurface.surfaceId`,
              code: "missing_field",
              message: "Missing required surfaceId",
            },
          ],
        },
      );
    }
    if (typeof surfaceId !== "string") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "surfaceId must be a string",
        "/surfaceId",
        {
          surfaceId: "",
          details: [
            {
              path: `messages.${messageIndex}.createSurface.surfaceId`,
              code: "type_mismatch",
              message: "surfaceId must be a string",
            },
          ],
        },
      );
    }

    const allowedKeys = new Set([
      "surfaceId",
      "catalogId",
      "sendDataModel",
      "components",
      "dataModel",
      "metadata",
    ]);
    for (const key of Object.keys(body)) {
      if (key === "theme" && config.allowUnknownElements) {
        // In permissive mode (`strictMode: false`), v1.0 drops unsupported `theme`.
        continue;
      }
      if (!allowedKeys.has(key)) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Unexpected property '${key}' on createSurface`,
          `/${key}`,
          { surfaceId },
        );
      }
    }

    if (body["catalogId"] !== undefined && typeof body["catalogId"] !== "string") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "createSurface catalogId must be a string",
        "/catalogId",
        { surfaceId },
      );
    }
    if (
      body["sendDataModel"] !== undefined &&
      typeof body["sendDataModel"] !== "boolean"
    ) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "createSurface sendDataModel must be a boolean",
        "/sendDataModel",
        { surfaceId },
      );
    }
    if (body["dataModel"] !== undefined) {
      if (!isJsonObject(body["dataModel"])) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          "createSurface dataModel must be an object",
          "/dataModel",
          { surfaceId },
        );
      }
      // Counted from its message root as A2UI 1.0 does.
      validateJsonNestingDepth(
        body["dataModel"],
        config.maxRecursionDepth,
        surfaceId,
        "/dataModel",
        DATA_VALUE_DEPTH_IN_MESSAGE,
      );
    }
    if (body["metadata"] !== undefined) {
      validateMetadataEnvelope(body["metadata"], "/metadata", surfaceId);
      // Counted from its message root as A2UI 1.0 does.
      validateJsonNestingDepth(
        body["metadata"],
        config.maxRecursionDepth,
        surfaceId,
        "/metadata",
        SURFACE_METADATA_DEPTH_IN_MESSAGE,
      );
    }
    if (body["components"] !== undefined) {
      if (!Array.isArray(body["components"]) || body["components"].length === 0) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          "createSurface components must be a non-empty array",
          "/components",
          { surfaceId },
        );
      }
    }
  }

  private validateUpdateComponentsEnvelope(
    body: unknown,
    messageIndex: number,
  ): void {
    if (!isJsonObject(body)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "updateComponents payload must be an object",
        "/updateComponents",
      );
    }
    const surfaceId = body["surfaceId"];
    if (typeof surfaceId !== "string") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "surfaceId must be a string",
        "/surfaceId",
        {
          surfaceId: "",
          details: [
            {
              path: `messages.${messageIndex}.updateComponents.surfaceId`,
              code: surfaceId === undefined ? "missing_field" : "type_mismatch",
              message: "surfaceId must be a string",
            },
          ],
        },
      );
    }
    for (const key of Object.keys(body)) {
      if (key !== "surfaceId" && key !== "components") {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Unexpected property '${key}' on updateComponents`,
          `/${key}`,
          { surfaceId },
        );
      }
    }
    if (!Array.isArray(body["components"]) || body["components"].length === 0) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "updateComponents requires a non-empty 'components' array",
        "/components",
        { surfaceId },
      );
    }
  }

  private validateUpdateDataModelEnvelope(
    body: unknown,
    messageIndex: number,
    config: ValidationConfig,
  ): void {
    if (!isJsonObject(body)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "updateDataModel payload must be an object",
        "/updateDataModel",
      );
    }
    const surfaceId = body["surfaceId"];
    if (typeof surfaceId !== "string") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "surfaceId must be a string",
        "/surfaceId",
        {
          surfaceId: "",
          details: [
            {
              path: `messages.${messageIndex}.updateDataModel.surfaceId`,
              code: surfaceId === undefined ? "missing_field" : "type_mismatch",
              message: "surfaceId must be a string",
            },
          ],
        },
      );
    }
    for (const key of Object.keys(body)) {
      if (key !== "surfaceId" && key !== "path" && key !== "value") {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Unexpected property '${key}' on updateDataModel`,
          `/${key}`,
          { surfaceId },
        );
      }
    }
    if (!Object.prototype.hasOwnProperty.call(body, "value")) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "updateDataModel requires 'value'",
        "/value",
        { surfaceId },
      );
    }
    const path = body["path"];
    if (path !== undefined) {
      if (typeof path !== "string") {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          "Invalid path syntax: updateDataModel path must be a string",
          "/path",
          { surfaceId },
        );
      }
      if (path !== "" && !path.startsWith("/")) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Invalid path syntax: path '${path}' must start with '/'`,
          "/path",
          { surfaceId },
        );
      }
      // Validate RFC 6901 escape sequences (~0, ~1).
      for (let i = 0; i < path.length; i += 1) {
        if (path[i] === "~") {
          const next = path[i + 1];
          if (next !== "0" && next !== "1") {
            throw new A2uiValidationError(
              "VALIDATION_FAILED",
              `Invalid path syntax in path '${path}': invalid '~' escape`,
              "/path",
              { surfaceId },
            );
          }
          i += 1;
        }
      }
      // Let A2uiDataError (e.g. FORBIDDEN_SEGMENT like __proto__) propagate as DataError.
      parsePointer(path);
    }
    // Counted from its message root as A2UI 1.0 does.
    validateJsonNestingDepth(
      body["value"],
      config.maxRecursionDepth,
      surfaceId,
      "/value",
      DATA_VALUE_DEPTH_IN_MESSAGE,
    );
  }

  private validateDeleteSurfaceEnvelope(
    body: unknown,
    messageIndex: number,
  ): void {
    if (!isJsonObject(body)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "deleteSurface payload must be an object",
        "/deleteSurface",
        { surfaceId: "" },
      );
    }
    const surfaceId = body["surfaceId"];
    if (typeof surfaceId !== "string") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "deleteSurface requires string 'surfaceId'",
        "/surfaceId",
        {
          surfaceId: "",
          details: [
            {
              path: `messages.${messageIndex}.deleteSurface.surfaceId`,
              code: surfaceId === undefined ? "missing_field" : "type_mismatch",
              message: "deleteSurface requires string 'surfaceId'",
            },
          ],
        },
      );
    }
    for (const key of Object.keys(body)) {
      if (key !== "surfaceId") {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Unexpected property '${key}' on deleteSurface`,
          `/${key}`,
          { surfaceId },
        );
      }
    }
  }

  private validateCallRendererFunctionEnvelope(
    body: unknown,
    config: ValidationConfig,
  ): void {
    if (!isJsonObject(body)) {
      throw new A2uiValidationError(
        "INVALID_FUNCTION_CALL",
        "callRendererFunction payload must be an object",
        "/callRendererFunction",
      );
    }
    const functionCallId =
      typeof body["functionCallId"] === "string"
        ? body["functionCallId"]
        : undefined;
    if (!functionCallId) {
      throw new A2uiValidationError(
        "INVALID_FUNCTION_CALL",
        "callRendererFunction requires string 'functionCallId'",
        "/functionCallId",
      );
    }
    if (body["surfaceId"] !== undefined && typeof body["surfaceId"] !== "string") {
      throw new A2uiValidationError(
        "INVALID_FUNCTION_CALL",
        "callRendererFunction 'surfaceId' must be a string",
        "/surfaceId",
        { functionCallId },
      );
    }
    const callFn = body["callFunction"];
    if (!isJsonObject(callFn)) {
      throw new A2uiValidationError(
        "INVALID_FUNCTION_CALL",
        "callRendererFunction requires object 'callFunction'",
        "/callFunction",
        { functionCallId },
      );
    }
    if (typeof callFn["@call"] !== "string" || callFn["@call"].length === 0) {
      throw new A2uiValidationError(
        "INVALID_FUNCTION_CALL",
        "callRendererFunction callFunction requires non-empty '@call'",
        "/callFunction/@call",
        { functionCallId },
      );
    }
    if (
      typeof callFn["catalogId"] !== "string" ||
      callFn["catalogId"].length === 0
    ) {
      throw new A2uiValidationError(
        "INVALID_FUNCTION_CALL",
        "callRendererFunction callFunction requires string 'catalogId'",
        "/callFunction/catalogId",
        { functionCallId },
      );
    }
    if (callFn["args"] !== undefined && !isJsonObject(callFn["args"])) {
      throw new A2uiValidationError(
        "INVALID_FUNCTION_CALL",
        "callRendererFunction callFunction 'args' must be an object",
        "/callFunction/args",
        { functionCallId },
      );
    }
    // Counted from its message root as A2UI 1.0 does.
    validateJsonNestingDepth(
      callFn["args"],
      config.maxRecursionDepth,
      typeof body["surfaceId"] === "string" ? body["surfaceId"] : undefined,
      "/callFunction/args",
      RENDERER_CALL_ARGS_DEPTH_IN_MESSAGE,
    );
  }

  /**
   * Validates an incoming batch of components against catalogs, dynamic value
   * rules, nested function calls, and candidate surface topology.
   * Returns the validated components ready to be atomically committed.
   */
  validateComponentsBatch(
    rawComponents: readonly unknown[],
    ctx: ValidateBatchContext,
  ): readonly ValidatedComponent[] {
    const { surfaceId, config } = ctx;

    // 1. Check duplicate IDs inside the same batch first.
    const seenBatchIds = new Set<string>();
    const batchIndices = new Map<string, number>();
    const validatedList: ValidatedComponent[] = [];

    for (let i = 0; i < rawComponents.length; i += 1) {
      const rawComp = rawComponents[i];
      const basePath = `/components/${i}`;

      if (!isJsonObject(rawComp)) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component at index ${i} must be an object`,
          basePath,
          { surfaceId },
        );
      }

      // Global JSON nesting depth check on the component object, counted
      // from its message root as A2UI 1.0 does.
      validateJsonNestingDepth(
        rawComp,
        config.maxRecursionDepth,
        surfaceId,
        basePath,
        COMPONENT_DEPTH_IN_MESSAGE,
      );

      // ID validation
      const compId = rawComp["id"];
      if (typeof compId !== "string" || compId.length === 0) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component at index ${i} is missing string 'id'`,
          `${basePath}/id`,
          { surfaceId },
        );
      }
      if (!isValidUax31Identifier(compId)) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component id '${compId}' must be a valid UAX #31 identifier`,
          `${basePath}/id`,
          { surfaceId },
        );
      }
      if (seenBatchIds.has(compId)) {
        throw new A2uiIntegrityError(
          "INTEGRITY_ERROR",
          `Duplicate component ID '${compId}' in components batch`,
          surfaceId,
          `${basePath}/id`,
        );
      }
      seenBatchIds.add(compId);
      batchIndices.set(compId, i);

      // Component type validation (UAX #31 enforced even in permissive mode)
      const compType = rawComp["component"];
      if (typeof compType !== "string" || compType.length === 0) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component '${compId}' is missing required 'component' type`,
          `${basePath}/component`,
          { surfaceId },
        );
      }
      if (compType === "Surface") {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          "Component type 'Surface' is reserved and cannot be instantiated",
          `${basePath}/component`,
          { surfaceId },
        );
      }
      if (!isValidUax31Identifier(compType)) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component type '${compType}' must be a valid UAX #31 identifier`,
          `${basePath}/component`,
          { surfaceId },
        );
      }

      // Reserved single-@ key check
      try {
        validateReservedKeysInComponent(rawComp);
      } catch (err) {
        if (err instanceof A2uiValidationError) {
          const message = err.message.startsWith("Invalid function call name")
            ? `${err.message}: function name must be a valid UAX #31 identifier`
            : err.message;
          throw new A2uiValidationError(
            "VALIDATION_FAILED",
            message,
            err.path ? `${basePath}${err.path}` : basePath,
            { surfaceId },
          );
        }
        throw err;
      }

      const validated = this.validateSingleComponent(
        rawComp,
        compId,
        compType,
        basePath,
        ctx,
      );
      validatedList.push(validated);
    }

    // 2. Pre-flight candidate topology & composition validation.
    this.validateCandidateTopology(validatedList, batchIndices, ctx);

    return validatedList;
  }

  private validateSingleComponent(
    rawComp: JsonObject,
    compId: string,
    compType: string,
    basePath: string,
    ctx: ValidateBatchContext,
  ): ValidatedComponent {
    const { surfaceId, defaultCatalogId, config } = ctx;
    const defaultCatalog = defaultCatalogId
      ? this.registry.get(defaultCatalogId)
      : undefined;
    const defaultCompSchema = defaultCatalog?.components.get(compType)?.schema;

    // Determine catalog routing key (`@catalogId` or legacy bare `catalogId`).
    const hasAtCatalogId = Object.prototype.hasOwnProperty.call(
      rawComp,
      "@catalogId",
    );
    const hasBareCatalogId = Object.prototype.hasOwnProperty.call(
      rawComp,
      "catalogId",
    );
    const defaultDeclaresCustomCatalogId = componentSchemaDeclaresCustomBareProp(
      defaultCompSchema,
      "catalogId",
    );

    let routingCatalogId: string | undefined;
    let stripBareCatalogId = false;

    if (hasAtCatalogId) {
      const val = rawComp["@catalogId"];
      if (typeof val !== "string" || val.length === 0) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component '${compId}' has invalid non-string or empty '@catalogId'`,
          `${basePath}/@catalogId`,
          { surfaceId },
        );
      }
      if (hasBareCatalogId && !defaultDeclaresCustomCatalogId) {
        // Check target catalog before concluding conflict: target may declare custom `catalogId`.
        const targetCat = this.registry.get(val);
        const targetDeclaresCustomCatalogId =
          componentSchemaDeclaresCustomBareProp(
            targetCat?.components.get(compType)?.schema,
            "catalogId",
          );
        if (!targetDeclaresCustomCatalogId) {
          throw new A2uiValidationError(
            "VALIDATION_FAILED",
            `Component '${compId}' specifies both '@catalogId' and bare 'catalogId'`,
            `${basePath}/catalogId`,
            { surfaceId },
          );
        }
      }
      routingCatalogId = val;
    } else if (hasBareCatalogId && !defaultDeclaresCustomCatalogId) {
      const val = rawComp["catalogId"];
      if (typeof val !== "string" || val.length === 0) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component '${compId}' has invalid non-string or empty 'catalogId'`,
          `${basePath}/catalogId`,
          { surfaceId },
        );
      }
      routingCatalogId = val;
      stripBareCatalogId = true;
    }

    const effectiveCatalogId = routingCatalogId ?? defaultCatalogId;
    if (!effectiveCatalogId) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Surface '${surfaceId}' has no default catalogId and component '${compId}' does not specify '@catalogId'`,
        surfaceId,
      );
    }

    const catalog = this.registry.get(effectiveCatalogId);
    if (!catalog) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Catalog '${effectiveCatalogId}' not found for surface '${surfaceId}'`,
        surfaceId,
      );
    }
    if (!isV10ProtocolVersion(catalog.protocolVersion)) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Catalog '${effectiveCatalogId}' (protocol ${catalog.protocolVersion}) is incompatible with surface '${surfaceId}' (protocol 1.0)`,
        surfaceId,
      );
    }

    const compDef = catalog.components.get(compType);
    const compRawSchema = compDef?.schema;

    // Classify remaining envelope mixins (`metadata`, `accessibility`, `checks`).
    const declaresCustomMeta = componentSchemaDeclaresCustomBareProp(
      compRawSchema,
      "metadata",
    );
    const declaresCustomA11y = componentSchemaDeclaresCustomBareProp(
      compRawSchema,
      "accessibility",
    );
    const declaresCustomChecks = componentSchemaDeclaresCustomBareProp(
      compRawSchema,
      "checks",
    );

    const hasAtMeta = Object.prototype.hasOwnProperty.call(rawComp, "@metadata");
    const hasBareMeta = Object.prototype.hasOwnProperty.call(rawComp, "metadata");
    const hasAtA11y = Object.prototype.hasOwnProperty.call(
      rawComp,
      "@accessibility",
    );
    const hasBareA11y = Object.prototype.hasOwnProperty.call(
      rawComp,
      "accessibility",
    );
    const hasAtChecks = Object.prototype.hasOwnProperty.call(rawComp, "@checks");
    const hasBareChecks = Object.prototype.hasOwnProperty.call(rawComp, "checks");

    if (hasAtMeta && hasBareMeta && !declaresCustomMeta) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Component '${compId}' specifies both '@metadata' and legacy 'metadata'`,
        `${basePath}/metadata`,
        { surfaceId },
      );
    }
    if (hasAtA11y && hasBareA11y && !declaresCustomA11y) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Component '${compId}' specifies both '@accessibility' and legacy 'accessibility'`,
        `${basePath}/accessibility`,
        { surfaceId },
      );
    }
    if (hasAtChecks && hasBareChecks && !declaresCustomChecks) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Component '${compId}' specifies both '@checks' and legacy 'checks'`,
        `${basePath}/checks`,
        { surfaceId },
      );
    }

    // Extract & validate envelope metadata
    let parsedMetadata: ComponentMetadata | undefined;
    let stripBareMeta = false;
    if (hasAtMeta) {
      parsedMetadata = validateMetadataEnvelope(
        rawComp["@metadata"],
        `${basePath}/@metadata`,
        surfaceId,
      );
    } else if (hasBareMeta && !declaresCustomMeta) {
      parsedMetadata = validateMetadataEnvelope(
        rawComp["metadata"],
        `${basePath}/metadata`,
        surfaceId,
      );
      stripBareMeta = true;
    }

    // Extract & validate envelope accessibility
    let parsedA11y: Record<string, unknown> | undefined;
    let stripBareA11y = false;
    if (hasAtA11y) {
      parsedA11y = this.validateAccessibilityEnvelope(
        rawComp["@accessibility"],
        `${basePath}/@accessibility`,
        ctx,
      );
    } else if (hasBareA11y && !declaresCustomA11y) {
      parsedA11y = this.validateAccessibilityEnvelope(
        rawComp["accessibility"],
        `${basePath}/accessibility`,
        ctx,
      );
      stripBareA11y = true;
    }

    // Extract envelope checks
    let parsedChecks: readonly unknown[] | undefined;
    let stripBareChecks = false;
    if (hasAtChecks) {
      if (compDef && !componentSchemaAllowsChecks(catalog, compType)) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component '${compType}' does not support '@checks'`,
          `${basePath}/@checks`,
          { surfaceId },
        );
      }
      if (!Array.isArray(rawComp["@checks"])) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component '@checks' must be an array`,
          `${basePath}/@checks`,
          { surfaceId },
        );
      }
      parsedChecks = rawComp["@checks"];
    } else if (hasBareChecks && !declaresCustomChecks) {
      if (compDef && !componentSchemaAllowsChecks(catalog, compType)) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component '${compType}' does not support 'checks'`,
          `${basePath}/checks`,
          { surfaceId },
        );
      }
      if (!Array.isArray(rawComp["checks"])) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Component 'checks' must be an array`,
          `${basePath}/checks`,
          { surfaceId },
        );
      }
      parsedChecks = rawComp["checks"];
      stripBareChecks = true;
    }

    // Build schema-checkable object (envelope routing/metadata normalized out)
    const schemaCandidate: JsonObject = {};
    const storedProperties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawComp)) {
      if (k === "@catalogId" || (k === "catalogId" && stripBareCatalogId)) {
        continue;
      }
      if (k === "@metadata" || (k === "metadata" && stripBareMeta)) {
        continue;
      }
      if (k === "@accessibility" || (k === "accessibility" && stripBareA11y)) {
        continue;
      }
      if (k === "@checks" || (k === "checks" && stripBareChecks)) {
        schemaCandidate["@checks"] = v;
        continue;
      }
      schemaCandidate[k] = v;
      if (k !== "id" && k !== "component") {
        storedProperties[k] = v;
      }
    }

    // Schema validation against the resolved catalog
    if (!compDef) {
      if (!config.allowUnknownElements) {
        const msg = `Unknown component type '${compType}' in catalog '${catalog.catalogId}'`;
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          msg,
          `${basePath}/component`,
          {
            surfaceId,
            details: [
              {
                path: "/component",
                code: "invalid_value",
                message: msg,
                surfaceId,
              },
            ],
          },
        );
      }
    } else {
      // Check dynamic values, bindings, and nested function calls FIRST so
      // multi-catalog / agentOnly errors get exact diagnostics.
      this.walkDynamicValuesInComponent(schemaCandidate, basePath, ctx);
      if (parsedA11y) {
        this.walkDynamicValuesInValue(
          parsedA11y,
          `${basePath}/@accessibility`,
          ctx,
        );
      }

      // Now run structural JSON Schema validation on the component properties.
      const vSchema = catalog.getValidationSchemaRef();
      const compSchemas = vSchema["components"] as JsonObject;
      const baseCompSchema = compSchemas[compType] as JsonObject;
      const effectiveSchema: JsonObject = { ...baseCompSchema };
      if (!config.allowUnknownElements) {
        if (
          effectiveSchema["unevaluatedProperties"] === undefined &&
          effectiveSchema["additionalProperties"] === undefined
        ) {
          effectiveSchema["unevaluatedProperties"] = false;
        }
      }

      const issues = validateJsonSchema(
        effectiveSchema,
        schemaCandidate,
        vSchema,
        {
          // FunctionCalls are already multi-catalog validated above, so accept
          // well-formed FunctionCall objects during single-catalog component schema validation.
          customRefValidator: (ref, val) => {
            if (ref === "#/$defs/FunctionCall") {
              return isJsonObject(val) && typeof val["@call"] === "string"
                ? true
                : undefined;
            }
            return undefined;
          },
        },
        basePath,
      );

      if (issues.length > 0) {
        const first = issues[0]!;
        const relativePath = first.path.startsWith(basePath)
          ? first.path.slice(basePath.length) || "/"
          : first.path;
        const message =
          first.keyword === "unevaluatedProperties" ||
          first.keyword === "additionalProperties"
            ? `${first.message} on component '${compType}'`
            : `${first.message} on component '${compType}' (${relativePath})`;
        const details: ValidationErrorDetail[] = issues.map((iss) => ({
          path: iss.path.startsWith(basePath)
            ? iss.path.slice(basePath.length) || "/"
            : iss.path,
          code: mapIssueKeywordToDetailCode(iss.keyword),
          message: iss.message,
          surfaceId,
        }));
        throw new A2uiValidationError("VALIDATION_FAILED", message, first.path, {
          surfaceId,
          details,
        });
      }
    }

    // Even when component type is unknown (permissive), validate dynamic values & function calls!
    if (!compDef) {
      this.walkDynamicValuesInComponent(schemaCandidate, basePath, ctx);
      if (parsedA11y) {
        this.walkDynamicValuesInValue(
          parsedA11y,
          `${basePath}/@accessibility`,
          ctx,
        );
      }
    }

    const normalizedWire: Record<string, unknown> = {
      id: compId,
      component: compType,
      ...storedProperties,
    };
    if (parsedMetadata !== undefined) {
      normalizedWire["@metadata"] = parsedMetadata;
    }
    if (parsedA11y !== undefined) {
      normalizedWire["@accessibility"] = parsedA11y;
    }
    if (parsedChecks !== undefined) {
      normalizedWire["@checks"] = parsedChecks;
    }

    return {
      id: compId,
      type: compType,
      catalogId: catalog.catalogId,
      catalog,
      properties: storedProperties,
      metadata: parsedMetadata,
      accessibility: parsedA11y,
      checks: parsedChecks,
      normalizedWire,
    };
  }

  private validateAccessibilityEnvelope(
    rawA11y: unknown,
    path: string,
    ctx: ValidateBatchContext,
  ): Record<string, unknown> {
    if (!isJsonObject(rawA11y)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Accessibility attributes at '${path}' must be an object`,
        path,
        { surfaceId: ctx.surfaceId },
      );
    }
    const commonSchema = getCachedCommonTypesV1Schema();
    const issues = validateJsonSchema(
      { $ref: "#/$defs/AccessibilityAttributes" },
      rawA11y,
      commonSchema,
      {
        customRefValidator: (ref, val) => {
          if (ref === "#/$defs/FunctionCall") {
            return isJsonObject(val) && typeof val["@call"] === "string"
              ? true
              : undefined;
          }
          return undefined;
        },
      },
      path,
    );
    if (issues.length > 0) {
      const first = issues[0]!;
      throw new A2uiValidationError("VALIDATION_FAILED", first.message, first.path, {
        surfaceId: ctx.surfaceId,
      });
    }
    return { ...rawA11y };
  }

  private walkDynamicValuesInComponent(
    comp: JsonObject,
    basePath: string,
    ctx: ValidateBatchContext,
  ): void {
    for (const [k, v] of Object.entries(comp)) {
      if (k === "id" || k === "component") {
        continue;
      }
      this.walkDynamicValuesInValue(v, `${basePath}/${k}`, ctx);
    }
  }

  private walkDynamicValuesInValue(
    value: unknown,
    path: string,
    ctx: ValidateBatchContext,
  ): void {
    if (value === null || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        this.walkDynamicValuesInValue(value[i], `${path}/${i}`, ctx);
      }
      return;
    }

    const obj = value as JsonObject;
    const hasPath = Object.prototype.hasOwnProperty.call(obj, "@path");
    const hasCall = Object.prototype.hasOwnProperty.call(obj, "@call");

    if (hasPath && hasCall) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "Object cannot contain both '@path' and '@call'",
        path,
        { surfaceId: ctx.surfaceId },
      );
    }

    if (hasPath) {
      validateDataBindingPathSyntax(obj["@path"], `${path}/@path`, ctx.surfaceId);
      return;
    }

    if (hasCall) {
      this.validateFunctionCall(obj, path, ctx);
      return;
    }

    for (const [k, v] of Object.entries(obj)) {
      this.walkDynamicValuesInValue(v, `${path}/${k}`, ctx);
    }
  }

  private validateFunctionCall(
    callObj: JsonObject,
    path: string,
    ctx: ValidateBatchContext,
  ): void {
    const { surfaceId, defaultCatalogId, config } = ctx;

    // Validate top-level keys of FunctionCall
    for (const k of Object.keys(callObj)) {
      if (k !== "@call" && k !== "catalogId" && k !== "args") {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Unexpected property '${k}' on function call`,
          `${path}/${k}`,
          { surfaceId },
        );
      }
    }

    const fnName = callObj["@call"];
    if (typeof fnName !== "string" || fnName.length === 0) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "Function call '@call' must be a non-empty string",
        `${path}/@call`,
        { surfaceId },
      );
    }

    if (fnName.startsWith("@") && fnName !== "@index") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Undefined system function '${fnName}'`,
        `${path}/@call`,
        { surfaceId },
      );
    }

    if (!isValidFunctionCallName(fnName)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Invalid UAX #31 function name '${fnName}'`,
        `${path}/@call`,
        { surfaceId },
      );
    }

    const rawArgs = callObj["args"];
    if (rawArgs !== undefined) {
      if (!isJsonObject(rawArgs)) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Function '${fnName}' args must be an object`,
          `${path}/args`,
          { surfaceId },
        );
      }
      for (const argKey of Object.keys(rawArgs)) {
        if (!isValidUax31Identifier(argKey)) {
          throw new A2uiValidationError(
            "VALIDATION_FAILED",
            `Invalid UAX #31 function argument name '${argKey}'`,
            `${path}/args/${argKey}`,
            { surfaceId },
          );
        }
      }
    }

    // `@index` is a catalogless protocol system function.
    if (fnName === "@index") {
      if (callObj["catalogId"] !== undefined) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          "System function '@index' must not specify 'catalogId'",
          `${path}/catalogId`,
          { surfaceId },
        );
      }
      if (isJsonObject(rawArgs)) {
        for (const k of Object.keys(rawArgs)) {
          if (k !== "offset") {
            throw new A2uiValidationError(
              "VALIDATION_FAILED",
              `Unexpected argument '${k}' for '@index'`,
              `${path}/args/${k}`,
              { surfaceId },
            );
          }
        }
        if (rawArgs["offset"] !== undefined) {
          this.walkDynamicValuesInValue(
            rawArgs["offset"],
            `${path}/args/offset`,
            ctx,
          );
          const commonSchema = getCachedCommonTypesV1Schema();
          const issues = validateJsonSchema(
            { $ref: "#/$defs/DynamicNumber" },
            rawArgs["offset"],
            commonSchema,
            {
              customRefValidator: (ref, val) => {
                if (ref === "#/$defs/FunctionCall") {
                  return isJsonObject(val) && typeof val["@call"] === "string"
                    ? true
                    : undefined;
                }
                return undefined;
              },
            },
            `${path}/args/offset`,
          );
          if (issues.length > 0) {
            throw new A2uiValidationError(
              "VALIDATION_FAILED",
              issues[0]!.message,
              issues[0]!.path,
              { surfaceId },
            );
          }
        }
      }
      return;
    }

    // Validate explicit `catalogId` on the function call (even in permissive mode).
    const hasExplicitCatId = Object.prototype.hasOwnProperty.call(
      callObj,
      "catalogId",
    );
    let explicitCatId: string | undefined;
    if (hasExplicitCatId) {
      const val = callObj["catalogId"];
      if (typeof val !== "string") {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Function '${fnName}' has invalid non-string 'catalogId'`,
          `${path}/catalogId`,
          { surfaceId },
        );
      }
      if (val.length === 0) {
        throw new A2uiCatalogError(
          "CATALOG_NOT_FOUND",
          `Catalog not found: '' (empty catalogId on function call '${fnName}')`,
          surfaceId,
        );
      }
      explicitCatId = val;
    }

    const effectiveCatId = explicitCatId ?? defaultCatalogId;
    if (!effectiveCatId) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Surface '${surfaceId}' has no default catalogId and function call '${fnName}' specifies no 'catalogId'`,
        surfaceId,
      );
    }

    const fnCatalog = this.registry.get(effectiveCatId);
    if (!fnCatalog) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Catalog not found: ${effectiveCatId}`,
        surfaceId,
      );
    }
    if (!isV10ProtocolVersion(fnCatalog.protocolVersion)) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Catalog '${effectiveCatId}' (protocol ${fnCatalog.protocolVersion}) is incompatible with surface '${surfaceId}' (protocol 1.0)`,
        surfaceId,
      );
    }

    // Recurse into nested function calls / bindings inside args BEFORE schema check
    // so nested catalog/agentOnly errors are caught cleanly.
    if (isJsonObject(rawArgs)) {
      for (const [argKey, argVal] of Object.entries(rawArgs)) {
        this.walkDynamicValuesInValue(
          argVal,
          `${path}/args/${argKey}`,
          ctx,
        );
      }
    }

    const fnDef = fnCatalog.functions.get(fnName);
    if (!fnDef) {
      if (!config.allowUnknownElements) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Unrecognized function '${fnName}' in catalog '${fnCatalog.catalogId}'`,
          path,
          { surfaceId },
        );
      }
      return;
    }

    // Enforce allowedCallers: agentOnly functions cannot be called in renderer bindings/actions!
    if (fnDef.allowedCallers === "agentOnly") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Function '${fnName}' has allowedCallers 'agentOnly' and cannot be invoked in renderer component bindings or actions`,
        path,
        { surfaceId },
      );
    }

    // Validate args against the function's JSON Schema in its resolved catalog.
    const vSchema = fnCatalog.getValidationSchemaRef();
    const fnSchemas = vSchema["functions"] as JsonObject | undefined;
    const fnSchema = fnSchemas?.[fnName];
    if (isJsonObject(fnSchema)) {
      const callForSchema: JsonObject = { "@call": fnName };
      if (rawArgs !== undefined) {
        callForSchema["args"] = rawArgs;
      }
      const issues: readonly SchemaValidationIssue[] = validateJsonSchema(
        fnSchema,
        callForSchema,
        vSchema,
        {
          customRefValidator: (ref, val) => {
            if (ref === "#/$defs/FunctionCall") {
              return isJsonObject(val) && typeof val["@call"] === "string"
                ? true
                : undefined;
            }
            return undefined;
          },
        },
        path,
      );
      if (issues.length > 0) {
        const first = issues[0]!;
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `${first.message} in call to '${fnName}'`,
          first.path,
          { surfaceId },
        );
      }
    }
  }

  private validateCandidateTopology(
    batch: readonly ValidatedComponent[],
    batchIndices: ReadonlyMap<string, number>,
    ctx: ValidateBatchContext,
  ): void {
    const { surfaceId, existingComponents, topologyIndex, config } = ctx;

    // Fast O(|batch|) incremental path when a SurfaceTopologyIndex is available
    // and we do not need a full-surface orphan BFS or shrunk-depth full re-check.
    const needsFullOrphanCheck = !config.allowOrphanComponents;
    const needsFullDepthRecheck =
      topologyIndex !== undefined &&
      existingComponents.size > 0 &&
      config.maxRecursionDepth < topologyIndex.minValidatedMaxDepth;

    if (topologyIndex && !needsFullOrphanCheck && !needsFullDepthRecheck) {
      this.validateCandidateTopologyIncremental(
        batch,
        batchIndices,
        ctx,
        topologyIndex,
      );
      if (config.maxRecursionDepth < topologyIndex.minValidatedMaxDepth) {
        topologyIndex.minValidatedMaxDepth = config.maxRecursionDepth;
      }
      return;
    }

    // Build candidate map preserving existing surface order + new components.
    const candidateWire = new Map<string, Record<string, unknown>>();
    const candidateCatalog = new Map<string, Catalog>();
    for (const [id, existing] of existingComponents) {
      candidateWire.set(id, existing.normalizedWire);
      candidateCatalog.set(id, existing.catalog);
    }
    for (const comp of batch) {
      candidateWire.set(comp.id, comp.normalizedWire);
      candidateCatalog.set(comp.id, comp.catalog);
    }

    if (candidateWire.size === 0) {
      return;
    }

    // 1. Missing root check
    if (!config.allowMissingRoot && !candidateWire.has("root")) {
      throw new A2uiIntegrityError(
        "INTEGRITY_ERROR",
        `Missing root component 'root' on surface '${surfaceId}'`,
        surfaceId,
      );
    }

    // 2. Collect edges and check self-references & dangling references
    const adjacency = new Map<string, string[]>();
    for (const [parentId, parentWire] of candidateWire) {
      const cat = candidateCatalog.get(parentId);
      const childRefs = extractChildReferences(parentWire, cat);
      const children: string[] = [];
      for (const ref of childRefs) {
        if (ref.childId === parentId) {
          throw new A2uiRecursionError(
            "RECURSION_LIMIT_EXCEEDED",
            `Self-reference detected on component '${parentId}'`,
            surfaceId,
          );
        }
        if (!candidateWire.has(ref.childId)) {
          if (!config.allowDanglingReferences) {
            throw new A2uiIntegrityError(
              "INTEGRITY_ERROR",
              `Dangling reference: component '${parentId}' references non-existent component '${ref.childId}' in field '${ref.fieldName}'`,
              surfaceId,
            );
          }
          continue;
        }
        children.push(ref.childId);
      }
      adjacency.set(parentId, children);
    }

    // 3. Cycle detection & max depth check via DFS across all nodes
    const state = new Map<string, 0 | 1 | 2>(); // 0=unvisited, 1=visiting, 2=done
    const memoMaxDepth = new Map<string, number>();

    const dfs = (nodeId: string, depth: number, stack: string[]): number => {
      if (depth > config.maxRecursionDepth) {
        throw new A2uiRecursionError(
          "RECURSION_LIMIT_EXCEEDED",
          `Global recursion limit exceeded: component tree depth exceeds ${config.maxRecursionDepth}`,
          surfaceId,
        );
      }
      const st = state.get(nodeId) ?? 0;
      if (st === 1) {
        const cycleStart = stack.indexOf(nodeId);
        const cyclePath = [...stack.slice(cycleStart), nodeId].join(" -> ");
        throw new A2uiRecursionError(
          "RECURSION_LIMIT_EXCEEDED",
          `Circular component reference (Circular reference detected): ${cyclePath}`,
          surfaceId,
        );
      }
      if (st === 2) {
        const subDepth = memoMaxDepth.get(nodeId) ?? 0;
        if (depth + subDepth > config.maxRecursionDepth) {
          throw new A2uiRecursionError(
            "RECURSION_LIMIT_EXCEEDED",
            `Global recursion limit exceeded: component tree depth exceeds ${config.maxRecursionDepth}`,
            surfaceId,
          );
        }
        return subDepth;
      }

      state.set(nodeId, 1);
      stack.push(nodeId);
      let maxSub = 0;
      for (const childId of adjacency.get(nodeId) ?? []) {
        const childSub = dfs(childId, depth + 1, stack) + 1;
        if (childSub > maxSub) {
          maxSub = childSub;
        }
      }
      stack.pop();
      state.set(nodeId, 2);
      memoMaxDepth.set(nodeId, maxSub);
      return maxSub;
    };

    if (candidateWire.has("root")) {
      dfs("root", 0, []);
    }
    for (const id of candidateWire.keys()) {
      if ((state.get(id) ?? 0) === 0) {
        dfs(id, 0, []);
      }
    }

    if (topologyIndex && config.maxRecursionDepth < topologyIndex.minValidatedMaxDepth) {
      topologyIndex.minValidatedMaxDepth = config.maxRecursionDepth;
    }

    // 4. Orphan / reachability check from 'root'
    if (!config.allowOrphanComponents && candidateWire.has("root")) {
      const reachable = new Set<string>(["root"]);
      const queue: string[] = ["root"];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const childId of adjacency.get(cur) ?? []) {
          if (!reachable.has(childId)) {
            reachable.add(childId);
            queue.push(childId);
          }
        }
      }
      for (const id of candidateWire.keys()) {
        if (!reachable.has(id)) {
          throw new A2uiIntegrityError(
            "INTEGRITY_ERROR",
            `Component '${id}' is not reachable from 'root'`,
            surfaceId,
          );
        }
      }
    }

    // 5. Composition constraints (allowedParents / allowedChildren)
    validateCompositionConstraints({
      surfaceId,
      components: candidateWire,
      batchIndices,
      resolveCatalog: (comp) => {
        const id = typeof comp["id"] === "string" ? comp["id"] : "";
        return candidateCatalog.get(id);
      },
    });
  }

  /**
   * O(|batch|) incremental topology & composition validation using
   * `SurfaceTopologyIndex`. Checks only nodes and edges introduced or
   * affected by `batch`, never walking unrelated surface components.
   */
  private validateCandidateTopologyIncremental(
    batch: readonly ValidatedComponent[],
    batchIndices: ReadonlyMap<string, number>,
    ctx: ValidateBatchContext,
    index: SurfaceTopologyIndex,
  ): void {
    const { surfaceId, existingComponents, config } = ctx;
    if (batch.length === 0 && existingComponents.size === 0) {
      return;
    }

    const batchById = new Map<string, ValidatedComponent>();
    for (let i = 0; i < batch.length; i += 1) {
      const comp = batch[i]!;
      batchById.set(comp.id, comp);
    }

    const hasCandidate = (id: string): boolean =>
      batchById.has(id) || existingComponents.has(id);

    // 1. Missing root check
    if (!config.allowMissingRoot && !hasCandidate("root")) {
      throw new A2uiIntegrityError(
        "INTEGRITY_ERROR",
        `Missing root component 'root' on surface '${surfaceId}'`,
        surfaceId,
      );
    }

    // 2. Extract child refs for batch components and check self-refs & dangling refs
    const batchChildRefs = new Map<string, readonly ChildReference[]>();
    const batchIncoming = new Map<string, Array<{ parentId: string; ref: ChildReference }>>();

    for (let i = 0; i < batch.length; i += 1) {
      const comp = batch[i]!;
      const refs = extractChildReferences(comp.normalizedWire, comp.catalog);
      batchChildRefs.set(comp.id, refs);

      for (let j = 0; j < refs.length; j += 1) {
        const ref = refs[j]!;
        if (ref.childId === comp.id) {
          throw new A2uiRecursionError(
            "RECURSION_LIMIT_EXCEEDED",
            `Self-reference detected on component '${comp.id}'`,
            surfaceId,
          );
        }
        if (!hasCandidate(ref.childId)) {
          if (!config.allowDanglingReferences) {
            throw new A2uiIntegrityError(
              "INTEGRITY_ERROR",
              `Dangling reference: component '${comp.id}' references non-existent component '${ref.childId}' in field '${ref.fieldName}'`,
              surfaceId,
            );
          }
          continue;
        }
        let inc = batchIncoming.get(ref.childId);
        if (!inc) {
          inc = [];
          batchIncoming.set(ref.childId, inc);
        }
        inc.push({ parentId: comp.id, ref });
      }
    }

    // Check any previously dangling refs from prior permissive batches if now strict.
    if (!config.allowDanglingReferences && index.danglingRefs.size > 0) {
      for (const [missingId, parentSet] of index.danglingRefs) {
        if (batchById.has(missingId)) {
          continue;
        }
        for (const parentId of parentSet) {
          if (batchById.has(parentId)) {
            continue;
          }
          const parentRefs = index.childrenOf.get(parentId) ?? [];
          const badRef = parentRefs.find((r) => r.childId === missingId);
          throw new A2uiIntegrityError(
            "INTEGRITY_ERROR",
            `Dangling reference: component '${parentId}' references non-existent component '${missingId}' in field '${badRef?.fieldName ?? "child"}'`,
            surfaceId,
          );
        }
      }
    }

    // 3. Incremental cycle detection & max depth check rooted at batch nodes
    const getCandidateChildren = (nodeId: string): string[] => {
      const refs = batchChildRefs.get(nodeId) ?? index.childrenOf.get(nodeId);
      if (!refs || refs.length === 0) {
        return [];
      }
      const out: string[] = [];
      for (let i = 0; i < refs.length; i += 1) {
        const childId = refs[i]!.childId;
        if (hasCandidate(childId)) {
          out.push(childId);
        }
      }
      return out;
    };

    const getCandidateParents = (nodeId: string): string[] => {
      const out: string[] = [];
      const existingParents = index.parentsOf.get(nodeId);
      if (existingParents) {
        for (const parentId of existingParents.keys()) {
          if (!batchById.has(parentId) && existingComponents.has(parentId)) {
            out.push(parentId);
          }
        }
      }
      const inc = batchIncoming.get(nodeId);
      if (inc) {
        for (let i = 0; i < inc.length; i += 1) {
          out.push(inc[i]!.parentId);
        }
      }
      return out;
    };

    const fwdState = new Map<string, 0 | 1 | 2>();
    const memoOutDepth = new Map<string, number>();

    const dfsForward = (nodeId: string, depth: number, stack: string[]): number => {
      if (depth > config.maxRecursionDepth) {
        throw new A2uiRecursionError(
          "RECURSION_LIMIT_EXCEEDED",
          `Global recursion limit exceeded: component tree depth exceeds ${config.maxRecursionDepth}`,
          surfaceId,
        );
      }
      const st = fwdState.get(nodeId) ?? 0;
      if (st === 1) {
        const cycleStart = stack.indexOf(nodeId);
        const cyclePath = [...stack.slice(cycleStart), nodeId].join(" -> ");
        throw new A2uiRecursionError(
          "RECURSION_LIMIT_EXCEEDED",
          `Circular component reference (Circular reference detected): ${cyclePath}`,
          surfaceId,
        );
      }
      if (st === 2) {
        const subDepth = memoOutDepth.get(nodeId) ?? 0;
        if (depth + subDepth > config.maxRecursionDepth) {
          throw new A2uiRecursionError(
            "RECURSION_LIMIT_EXCEEDED",
            `Global recursion limit exceeded: component tree depth exceeds ${config.maxRecursionDepth}`,
            surfaceId,
          );
        }
        return subDepth;
      }

      fwdState.set(nodeId, 1);
      stack.push(nodeId);
      let maxSub = 0;
      const children = getCandidateChildren(nodeId);
      for (let i = 0; i < children.length; i += 1) {
        const childSub = dfsForward(children[i]!, depth + 1, stack) + 1;
        if (childSub > maxSub) {
          maxSub = childSub;
        }
      }
      stack.pop();
      fwdState.set(nodeId, 2);
      memoOutDepth.set(nodeId, maxSub);
      return maxSub;
    };

    const bwdState = new Map<string, 0 | 1 | 2>();
    const memoInDepth = new Map<string, number>();

    const dfsBackward = (nodeId: string, depth: number, stack: string[]): number => {
      if (depth > config.maxRecursionDepth) {
        throw new A2uiRecursionError(
          "RECURSION_LIMIT_EXCEEDED",
          `Global recursion limit exceeded: component tree depth exceeds ${config.maxRecursionDepth}`,
          surfaceId,
        );
      }
      const st = bwdState.get(nodeId) ?? 0;
      if (st === 1) {
        const cycleStart = stack.indexOf(nodeId);
        const cyclePath = [...stack.slice(cycleStart), nodeId].reverse().join(" -> ");
        throw new A2uiRecursionError(
          "RECURSION_LIMIT_EXCEEDED",
          `Circular component reference (Circular reference detected): ${cyclePath}`,
          surfaceId,
        );
      }
      if (st === 2) {
        return memoInDepth.get(nodeId) ?? 0;
      }

      bwdState.set(nodeId, 1);
      stack.push(nodeId);
      let maxAnc = 0;
      const parents = getCandidateParents(nodeId);
      for (let i = 0; i < parents.length; i += 1) {
        const ancDepth = dfsBackward(parents[i]!, depth + 1, stack) + 1;
        if (ancDepth > maxAnc) {
          maxAnc = ancDepth;
        }
      }
      stack.pop();
      bwdState.set(nodeId, 2);
      memoInDepth.set(nodeId, maxAnc);
      return maxAnc;
    };

    for (let i = 0; i < batch.length; i += 1) {
      const compId = batch[i]!.id;
      const outDepth = dfsForward(compId, 0, []);
      const inDepth = dfsBackward(compId, 0, []);
      if (inDepth + outDepth > config.maxRecursionDepth) {
        throw new A2uiRecursionError(
          "RECURSION_LIMIT_EXCEEDED",
          `Global recursion limit exceeded: component tree depth exceeds ${config.maxRecursionDepth}`,
          surfaceId,
        );
      }
    }

    // 4. Incremental composition constraints (allowedParents / allowedChildren)
    const indexOf = (id: string): number =>
      batchIndices.get(id) ?? index.surfaceOrder.get(id) ?? 0;

    const getComponentInfo = (
      id: string,
    ): { readonly type: string; readonly catalog: Catalog } | undefined => {
      const inBatch = batchById.get(id);
      if (inBatch) {
        return inBatch;
      }
      return existingComponents.get(id);
    };

    // 4a. Check root against implicit parent 'Surface' if root is in this batch.
    const batchRoot = batchById.get("root");
    if (batchRoot) {
      validateRootComposition(
        surfaceId,
        batchRoot.normalizedWire,
        batchRoot.catalog,
        indexOf("root"),
      );
    }

    // 4b. Check outgoing edges from each batch component, and incoming edges
    //     from existing parents targeting each batch component.
    for (let i = 0; i < batch.length; i += 1) {
      const comp = batch[i]!;
      const compIdx = indexOf(comp.id);

      // Outgoing edges from `comp`
      const refs = batchChildRefs.get(comp.id) ?? [];
      for (let j = 0; j < refs.length; j += 1) {
        const ref = refs[j]!;
        const childInfo = getComponentInfo(ref.childId);
        if (!childInfo) {
          continue;
        }
        validateCompositionEdge(
          surfaceId,
          comp.id,
          comp.type,
          comp.catalog,
          compIdx,
          ref,
          childInfo.type,
          childInfo.catalog,
          indexOf(ref.childId),
        );
      }

      // Incoming edges from existing parents (not in this batch) to `comp`
      const existingParents = index.parentsOf.get(comp.id);
      if (existingParents) {
        for (const [parentId, refList] of existingParents) {
          if (batchById.has(parentId)) {
            continue;
          }
          const parentInfo = existingComponents.get(parentId);
          if (!parentInfo) {
            continue;
          }
          const parentIdx = indexOf(parentId);
          for (let j = 0; j < refList.length; j += 1) {
            validateCompositionEdge(
              surfaceId,
              parentId,
              parentInfo.type,
              parentInfo.catalog,
              parentIdx,
              refList[j]!,
              comp.type,
              comp.catalog,
              compIdx,
            );
          }
        }
      }
    }
  }
}
