/**
 * Pure TypeScript A2UI v1.0 catalog loader, serializer, validation schema
 * builder, derivation engine, multi-catalog registry, and composition
 * constraint checker.
 */

import {
  A2uiValidationError,
  COMPONENT_ENVELOPE_RESERVED_KEYS,
  isValidFunctionCallName,
  isValidUax31Identifier,
  type ValidationErrorDetail,
} from "./expression";
import {
  isJsonObject,
  resolveLocalRef,
  validateJsonSchema,
  type JsonObject,
  type JsonValue,
  type SchemaValidationIssue,
} from "./json_schema";
import {
  BASIC_CATALOG_V1_ID,
  JSON_SCHEMA_DRAFT_2020_12,
  buildV10AgentToRendererSchema,
  buildV10BasicCatalogDocument,
  buildV10CommonTypesSchema,
} from "./v1_0_schemas";

export {
  AGENT_TO_RENDERER_V1_ID,
  BASIC_CATALOG_V1_ID,
  COMMON_TYPES_V1_ID,
  JSON_SCHEMA_DRAFT_2020_12,
  buildV10AgentToRendererSchema,
  buildV10BasicCatalogDocument,
  buildV10CommonTypesSchema,
} from "./v1_0_schemas";

/** Typed catalog error (loading, resolution, derivation, version mismatch). */
export class A2uiCatalogError extends Error {
  readonly category = "CatalogError" as const;
  readonly code: string;
  readonly surfaceId?: string;

  constructor(code: string, message: string, surfaceId?: string) {
    super(message);
    this.name = "A2uiCatalogError";
    this.code = code;
    this.surfaceId = surfaceId;
  }
}

/** Typed integrity error (surface lifecycle, duplicate/missing IDs, orphans). */
export class A2uiIntegrityError extends A2uiValidationError {
  override readonly category = "IntegrityError" as unknown as "ValidationError";

  constructor(code: string, message: string, surfaceId?: string, path?: string) {
    super(code, message, path, { surfaceId });
    this.name = "A2uiIntegrityError";
  }
}

/** Typed recursion error (component/data depth exceeded, circular references). */
export class A2uiRecursionError extends A2uiValidationError {
  override readonly category = "RecursionError" as unknown as "ValidationError";

  constructor(code: string, message: string, surfaceId?: string, path?: string) {
    super(code, message, path, { surfaceId });
    this.name = "A2uiRecursionError";
  }
}

export type AllowedCallers = "rendererOnly" | "agentOnly" | "rendererOrAgent";

export type FunctionReturnType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "validationResult"
  | "any"
  | "void";

export interface ComponentMetadata {
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface ComponentDefinition {
  readonly name: string;
  readonly schema: JsonObject;
  readonly description?: string;
  readonly allowedParents?: readonly string[];
  readonly allowedChildren?: readonly string[];
  readonly metadata?: ComponentMetadata;
}

export interface FunctionDefinition {
  readonly name: string;
  readonly schema: JsonObject;
  readonly description?: string;
  readonly returnType?: string;
  readonly allowedCallers: AllowedCallers;
  readonly requiresUserActivation: boolean;
}

export interface CatalogFromJsonOptions {
  readonly catalogId?: string;
  readonly protocolVersion?: string;
}

export interface CatalogDeriveOptions {
  readonly catalogId: string;
  readonly components?: readonly (string | Readonly<Record<string, JsonObject>>)[];
  readonly functions?: readonly (string | Readonly<Record<string, JsonObject>>)[];
  readonly instructions?: string;
}

export interface SurfaceCatalogContext {
  readonly surfaceId: string;
  readonly defaultCatalogId?: string;
  readonly supportedCatalogIds?: readonly string[];
  readonly protocolVersion?: string;
}

export interface ChildReference {
  readonly childId: string;
  /** JSON Pointer suffix relative to the parent component (e.g. `/children/0`, `/child`). */
  readonly pathSuffix: string;
  /** Human-readable field path (e.g. `slots[1]`, `children[0]`, `child`). */
  readonly fieldName: string;
}

export interface ValidateComponentOptions {
  /** Reject undeclared extra properties on the component. Defaults to true. */
  readonly strict?: boolean;
  /** Surface ID for error reporting context. */
  readonly surfaceId?: string;
  /** Base JSON Pointer path for error reporting (e.g. `/components/0`). */
  readonly basePath?: string;
}

const VALID_ALLOWED_CALLERS = new Set<string>([
  "rendererOnly",
  "agentOnly",
  "rendererOrAgent",
]);

const COMPONENT_ENVELOPE_KEYS = new Set<string>([
  "id",
  "component",
  "catalogId",
  "@catalogId",
]);

const FLATTEN_MERGED_KEYS = new Set<string>([
  "type",
  "description",
  "allOf",
  "properties",
  "required",
  "unevaluatedProperties",
  "additionalProperties",
  "allowedParents",
  "allowedChildren",
]);

const SCHEMA_MAP_KEYS = new Set<string>([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
]);

const SCHEMA_LIST_KEYS = new Set<string>([
  "allOf",
  "anyOf",
  "oneOf",
  "prefixItems",
]);

const SCHEMA_ONE_KEYS = new Set<string>([
  "items",
  "additionalProperties",
  "unevaluatedProperties",
  "not",
  "if",
  "then",
  "else",
  "contains",
  "propertyNames",
]);

function deepCloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneJson(item)) as T;
  }
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = deepCloneJson(v);
  }
  return out as T;
}

/** True when `version` denotes A2UI protocol version 1.0 (`"1.0"` or `"v1.0"`). */
export function isV10ProtocolVersion(version: string): boolean {
  return version === "1.0" || version === "v1.0";
}

function getCommonTypeDefs(): JsonObject {
  const schema = buildV10CommonTypesSchema();
  return schema["$defs"] as JsonObject;
}

function extractCommonTypeDefName(ref: string): string | null {
  const match =
    /^(?:https?:\/\/[^#]+\/)?common_types\.json#\/\$defs\/([^/]+)$/.exec(ref);
  return match ? match[1]! : null;
}

function extractCatalogUnionRefName(ref: string): string | null {
  const match = /^catalog\.json#\/\$defs\/([^/]+)$/.exec(ref);
  return match ? match[1]! : null;
}

function extractWholeLocalDefName(ref: string): string | null {
  const match = /^#\/\$defs\/([^/]+)$/.exec(ref);
  return match ? match[1]! : null;
}

function localizeRef(ref: string): string {
  const commonName = extractCommonTypeDefName(ref);
  if (commonName !== null) {
    return `#/$defs/${commonName}`;
  }
  const catalogUnion = extractCatalogUnionRefName(ref);
  if (catalogUnion !== null) {
    return `#/$defs/${catalogUnion}`;
  }
  return ref;
}

function localizeSchemaTree(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => localizeSchemaTree(item));
  }
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "$ref" && typeof v === "string") {
      out[k] = localizeRef(v);
    } else {
      out[k] = localizeSchemaTree(v);
    }
  }
  return out;
}

function validateRefsInNode(
  node: JsonValue,
  commonDefs: JsonObject,
  isV10: boolean,
): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      validateRefsInNode(item, commonDefs, isV10);
    }
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "$ref" && typeof v === "string") {
      if (v.startsWith("#")) {
        continue;
      }
      const commonName = extractCommonTypeDefName(v);
      if (
        commonName !== null &&
        Object.prototype.hasOwnProperty.call(commonDefs, commonName)
      ) {
        continue;
      }
      if (extractCatalogUnionRefName(v) !== null) {
        continue;
      }
      if (isV10) {
        throw new A2uiCatalogError(
          "UNSUPPORTED_EXTERNAL_REF",
          `Unsupported external $ref: '${v}'`,
        );
      }
    } else {
      validateRefsInNode(v, commonDefs, isV10);
    }
  }
}

function validateComponentPropertyNames(
  compName: string,
  schema: JsonObject,
): void {
  if (isJsonObject(schema["properties"])) {
    for (const propName of Object.keys(schema["properties"])) {
      if (COMPONENT_ENVELOPE_RESERVED_KEYS.has(propName)) {
        continue;
      }
      if (!isValidUax31Identifier(propName)) {
        throw new A2uiCatalogError(
          "INVALID_IDENTIFIER",
          `Invalid UAX #31 property identifier '${propName}' on component '${compName}'`,
        );
      }
    }
  }
  if (Array.isArray(schema["allOf"])) {
    for (const member of schema["allOf"]) {
      if (isJsonObject(member) && typeof member["$ref"] !== "string") {
        validateComponentPropertyNames(compName, member);
      }
    }
  }
}

function validateComponentMetadata(
  compName: string,
  rawMeta: JsonValue,
): ComponentMetadata {
  if (!isJsonObject(rawMeta)) {
    throw new A2uiValidationError(
      "VALIDATION_FAILED",
      `Component '${compName}' metadata must be an object`,
      `/components/${compName}/metadata`,
    );
  }
  for (const key of Object.keys(rawMeta)) {
    if (key !== "extensions") {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Component '${compName}' metadata contains unsupported key '${key}'`,
        `/components/${compName}/metadata/${key}`,
      );
    }
  }
  const rawExtensions = rawMeta["extensions"];
  if (rawExtensions === undefined) {
    return {};
  }
  if (!isJsonObject(rawExtensions)) {
    throw new A2uiValidationError(
      "VALIDATION_FAILED",
      `Component '${compName}' metadata.extensions must be an object`,
      `/components/${compName}/metadata/extensions`,
    );
  }
  for (const extKey of Object.keys(rawExtensions)) {
    if (!isValidUax31Identifier(extKey)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Component '${compName}' metadata.extensions key '${extKey}' is not a valid UAX #31 identifier`,
        `/components/${compName}/metadata/extensions/${extKey}`,
      );
    }
  }
  return { extensions: deepCloneJson(rawExtensions) };
}

function validateFunctionArgumentNames(
  fnName: string,
  fnSchema: JsonObject,
): void {
  if (isJsonObject(fnSchema["parameters"])) {
    for (const argName of Object.keys(fnSchema["parameters"])) {
      if (!isValidUax31Identifier(argName)) {
        throw new A2uiCatalogError(
          "INVALID_IDENTIFIER",
          `Invalid UAX #31 argument identifier '${argName}' on function '${fnName}'`,
        );
      }
    }
  }
  if (isJsonObject(fnSchema["properties"])) {
    const argsSchema = fnSchema["properties"]["args"];
    if (isJsonObject(argsSchema) && isJsonObject(argsSchema["properties"])) {
      for (const argName of Object.keys(argsSchema["properties"])) {
        if (!isValidUax31Identifier(argName)) {
          throw new A2uiCatalogError(
            "INVALID_IDENTIFIER",
            `Invalid UAX #31 argument identifier '${argName}' on function '${fnName}'`,
          );
        }
      }
    }
  }
}

function parseUnionMemberNames(
  unionSchema: JsonValue | undefined,
  prefix: "#/components/" | "#/functions/",
): readonly string[] | null {
  if (!isJsonObject(unionSchema)) {
    return null;
  }
  if (isJsonObject(unionSchema["not"]) && Object.keys(unionSchema["not"]).length === 0) {
    return [];
  }
  if (!Array.isArray(unionSchema["oneOf"])) {
    return null;
  }
  const names: string[] = [];
  for (const item of unionSchema["oneOf"]) {
    if (!isJsonObject(item) || typeof item["$ref"] !== "string") {
      return null;
    }
    const ref = item["$ref"];
    if (!ref.startsWith(prefix)) {
      return null;
    }
    const memberName = ref.slice(prefix.length);
    if (memberName.length === 0 || memberName.includes("/")) {
      return null;
    }
    names.push(memberName);
  }
  return names;
}

function parseStringArray(value: JsonValue | undefined): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      out.push(item);
    }
  }
  return out;
}

interface FlattenPiece {
  readonly kind: 0 | 1 | 2 | 3;
  readonly properties?: JsonObject;
  readonly required?: readonly JsonValue[];
  readonly description?: string;
}

interface FlattenCollected {
  pieces: FlattenPiece[];
  residual: JsonValue[];
  seen: Set<string>;
  merged: Set<string>;
}

function collectComponentPieces(
  schema: JsonObject,
  defs: JsonObject,
  commonDefs: JsonObject,
  isLocalMixin: boolean,
  isTop: boolean,
  out: FlattenCollected,
): void {
  if (Array.isArray(schema["allOf"])) {
    for (const member of schema["allOf"]) {
      if (!isJsonObject(member)) {
        out.residual.push(deepCloneJson(member));
        continue;
      }
      if (typeof member["$ref"] !== "string") {
        collectComponentPieces(member, defs, commonDefs, isLocalMixin, false, out);
        continue;
      }
      const refStr = member["$ref"];
      const keys = Object.keys(member);
      const defName = keys.length === 1 ? extractWholeLocalDefName(refStr) : null;
      if (defName === null || defName === "anyComponent" || defName === "anyFunction") {
        out.residual.push(deepCloneJson(member));
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(commonDefs, defName)) {
        const target = commonDefs[defName];
        if (isJsonObject(target) && isJsonObject(target["properties"])) {
          if (!out.seen.has(defName)) {
            out.seen.add(defName);
            out.pieces.push({
              kind: 0,
              properties: target["properties"],
              required: Array.isArray(target["required"])
                ? target["required"]
                : undefined,
            });
          }
        } else {
          out.residual.push(deepCloneJson(member));
        }
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(defs, defName)) {
        const target = defs[defName];
        if (isJsonObject(target)) {
          if (!out.seen.has(defName)) {
            out.seen.add(defName);
            out.merged.add(defName);
            collectComponentPieces(target, defs, commonDefs, true, false, out);
          }
        } else {
          out.residual.push(deepCloneJson(member));
        }
        continue;
      }
      out.residual.push(deepCloneJson(member));
    }
  }

  if (!isTop) {
    const rest: JsonObject = {};
    let hasRest = false;
    for (const [k, v] of Object.entries(schema)) {
      if (!FLATTEN_MERGED_KEYS.has(k)) {
        rest[k] = deepCloneJson(v);
        hasRest = true;
      }
    }
    if (hasRest) {
      out.residual.push(rest);
    }
  }

  if (
    schema["properties"] !== undefined ||
    schema["required"] !== undefined ||
    schema["description"] !== undefined
  ) {
    const props = isJsonObject(schema["properties"])
      ? schema["properties"]
      : undefined;
    const kind: 0 | 1 | 2 | 3 = isLocalMixin
      ? 1
      : props !== undefined &&
          Object.prototype.hasOwnProperty.call(props, "component")
        ? 3
        : 2;
    out.pieces.push({
      kind,
      properties: props,
      required: Array.isArray(schema["required"]) ? schema["required"] : undefined,
      description:
        typeof schema["description"] === "string"
          ? schema["description"]
          : undefined,
    });
  }
}

function flattenComponentSchema(
  name: string,
  localizedSchema: JsonObject,
  localizedDefs: JsonObject,
  commonDefs: JsonObject,
): { readonly schema: JsonObject; readonly merged: ReadonlySet<string> } {
  const collected: FlattenCollected = {
    pieces: [],
    residual: [],
    seen: new Set(),
    merged: new Set(),
  };
  collectComponentPieces(
    localizedSchema,
    localizedDefs,
    commonDefs,
    false,
    true,
    collected,
  );
  collected.pieces.sort((a, b) => a.kind - b.kind);

  const properties: JsonObject = {};
  const requiredSet = new Set<string>();
  let description: string | undefined;
  let componentConst: JsonValue = name;

  for (const piece of collected.pieces) {
    if (piece.properties) {
      for (const [k, v] of Object.entries(piece.properties)) {
        if (k === "component" && isJsonObject(v) && v["const"] !== undefined) {
          componentConst = deepCloneJson(v["const"]);
        }
        if (!COMPONENT_ENVELOPE_KEYS.has(k)) {
          properties[k] = deepCloneJson(v);
        }
      }
    }
    if (piece.required) {
      for (const req of piece.required) {
        if (typeof req === "string" && !COMPONENT_ENVELOPE_KEYS.has(req)) {
          requiredSet.add(req);
        }
      }
    }
    if (piece.description && piece.description.length > 0) {
      description = piece.description;
    }
  }

  properties["id"] = { $ref: "#/$defs/ComponentId" };
  properties["component"] = { const: componentConst };
  const required: string[] = ["id", ...Array.from(requiredSet), "component"];

  const out: JsonObject = { type: "object" };
  for (const [k, v] of Object.entries(localizedSchema)) {
    if (!FLATTEN_MERGED_KEYS.has(k)) {
      out[k] = deepCloneJson(v);
    }
  }
  if (description !== undefined) {
    out["description"] = description;
  }
  out["properties"] = properties;
  out["required"] = required;
  if (collected.residual.length > 0) {
    out["allOf"] = collected.residual;
  }
  const closed =
    localizedSchema["unevaluatedProperties"] ??
    localizedSchema["additionalProperties"];
  if (closed !== undefined) {
    out["unevaluatedProperties"] = deepCloneJson(closed);
  }
  for (const key of ["allowedParents", "allowedChildren"] as const) {
    const val = localizedSchema[key];
    if (Array.isArray(val) && val.length > 0) {
      out[key] = deepCloneJson(val);
    }
  }

  return { schema: out, merged: collected.merged };
}

function describeCommonRefs(node: JsonValue, commonDefs: JsonObject): void {
  if (!isJsonObject(node)) {
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (SCHEMA_MAP_KEYS.has(k)) {
      if (isJsonObject(v)) {
        for (const sub of Object.values(v)) {
          describeCommonRefs(sub, commonDefs);
        }
      }
    } else if (SCHEMA_LIST_KEYS.has(k)) {
      if (Array.isArray(v)) {
        for (const sub of v) {
          describeCommonRefs(sub, commonDefs);
        }
      }
    } else if (SCHEMA_ONE_KEYS.has(k)) {
      describeCommonRefs(v, commonDefs);
    }
  }
  if (typeof node["description"] === "string") {
    return;
  }
  if (typeof node["$ref"] === "string") {
    const defName = extractWholeLocalDefName(node["$ref"]);
    if (defName !== null && Object.prototype.hasOwnProperty.call(commonDefs, defName)) {
      const target = commonDefs[defName];
      if (isJsonObject(target) && typeof target["description"] === "string") {
        node["description"] = target["description"];
      }
    }
  }
}

function closeFunctionArgs(fnSchema: JsonObject): void {
  const props = fnSchema["properties"];
  if (!isJsonObject(props)) {
    return;
  }
  if (
    !Object.prototype.hasOwnProperty.call(props, "@call") &&
    !Object.prototype.hasOwnProperty.call(props, "call")
  ) {
    return;
  }
  const args = props["args"];
  if (
    !isJsonObject(args) ||
    args["type"] !== "object" ||
    typeof args["$ref"] === "string"
  ) {
    return;
  }
  const addProps = args["additionalProperties"];
  if (addProps !== undefined) {
    delete args["additionalProperties"];
  }
  if (args["unevaluatedProperties"] === undefined) {
    args["unevaluatedProperties"] = addProps !== undefined ? addProps : false;
  }
}

function collectReferencedDefNames(node: JsonValue, out: Set<string>): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectReferencedDefNames(item, out);
    }
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "$ref" && typeof v === "string") {
      const defName = extractWholeLocalDefName(v);
      if (defName !== null) {
        out.add(defName);
      }
    } else {
      collectReferencedDefNames(v, out);
    }
  }
}

/**
 * Checks that every `$ref` inside `schema` resolves to a valid schema object
 * or boolean within `schema` itself (no external or dangling refs).
 */
export function isSelfContainedSchema(schema: JsonObject): boolean {
  const stack: JsonValue[] = [schema];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === null || typeof cur !== "object") {
      continue;
    }
    if (Array.isArray(cur)) {
      for (const item of cur) {
        stack.push(item);
      }
      continue;
    }
    for (const [k, v] of Object.entries(cur)) {
      if (k === "$ref" && typeof v === "string") {
        if (!v.startsWith("#")) {
          return false;
        }
        const resolved = resolveLocalRef(schema, v);
        if (
          resolved === undefined ||
          (typeof resolved !== "boolean" && !isJsonObject(resolved))
        ) {
          return false;
        }
      } else {
        stack.push(v);
      }
    }
  }
  return true;
}

/** Represents an authored A2UI catalog (components, functions, schemas, metadata). */
export class Catalog {
  readonly catalogId: string;
  readonly protocolVersion: string;
  readonly title?: string;
  readonly description?: string;
  readonly instructions?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly theme?: JsonObject;
  readonly components: ReadonlyMap<string, ComponentDefinition>;
  readonly functions: ReadonlyMap<string, FunctionDefinition>;
  readonly defs: ReadonlyMap<string, JsonObject>;

  private readonly authoredDoc: JsonObject;
  private cachedValidationSchema: JsonObject | undefined;

  private constructor(params: {
    readonly catalogId: string;
    readonly protocolVersion: string;
    readonly title?: string;
    readonly description?: string;
    readonly instructions?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly theme?: JsonObject;
    readonly components: ReadonlyMap<string, ComponentDefinition>;
    readonly functions: ReadonlyMap<string, FunctionDefinition>;
    readonly defs: ReadonlyMap<string, JsonObject>;
    readonly authoredDoc: JsonObject;
  }) {
    this.catalogId = params.catalogId;
    this.protocolVersion = params.protocolVersion;
    this.title = params.title;
    this.description = params.description;
    this.instructions = params.instructions;
    this.metadata = params.metadata;
    this.theme = params.theme;
    this.components = params.components;
    this.functions = params.functions;
    this.defs = params.defs;
    this.authoredDoc = params.authoredDoc;
  }

  /** Returns the built-in A2UI Basic Catalog v1. */
  static basicV1(): Catalog {
    return Catalog.fromJson(buildV10BasicCatalogDocument());
  }

  /** Parses and validates an authored catalog JSON document into a `Catalog`. */
  static fromJson(raw: unknown, options: CatalogFromJsonOptions = {}): Catalog {
    if (!isJsonObject(raw)) {
      throw new A2uiCatalogError(
        "CATALOG_INVALID",
        "Catalog document must be a JSON object",
      );
    }

    const docCatalogId =
      typeof raw["catalogId"] === "string" && raw["catalogId"].length > 0
        ? raw["catalogId"]
        : undefined;
    const effectiveCatalogId = options.catalogId ?? docCatalogId;
    if (!effectiveCatalogId) {
      throw new A2uiCatalogError(
        "CATALOG_INVALID",
        "catalog_id must be provided or exist in catalog schema",
      );
    }

    const docVersion =
      typeof raw["protocolVersion"] === "string" &&
      raw["protocolVersion"].length > 0
        ? raw["protocolVersion"]
        : undefined;
    const effectiveVersion = options.protocolVersion ?? docVersion ?? "v0.9";
    const isV10 = isV10ProtocolVersion(effectiveVersion);
    const commonDefs = getCommonTypeDefs();

    // Validate all $ref strings across the entire document.
    validateRefsInNode(raw, commonDefs, isV10);

    const rawComponents = isJsonObject(raw["components"])
      ? raw["components"]
      : {};
    const rawFunctions = isJsonObject(raw["functions"]) ? raw["functions"] : {};
    const rawDefs = isJsonObject(raw["$defs"]) ? raw["$defs"] : {};

    // Validate ALL declared components & functions (including entries omitted from $defs unions).
    const allComponents = new Map<string, ComponentDefinition>();
    for (const [compName, compVal] of Object.entries(rawComponents)) {
      if (!isJsonObject(compVal)) {
        throw new A2uiCatalogError(
          "CATALOG_INVALID",
          `Component '${compName}' definition must be an object`,
        );
      }
      if (isV10) {
        if (compName === "Surface") {
          throw new A2uiCatalogError(
            "RESERVED_COMPONENT_NAME",
            "Component name 'Surface' is reserved",
          );
        }
        if (!isValidUax31Identifier(compName)) {
          throw new A2uiCatalogError(
            "INVALID_IDENTIFIER",
            `Invalid UAX #31 component identifier: '${compName}'`,
          );
        }
        validateComponentPropertyNames(compName, compVal);
      }

      let parsedMetadata: ComponentMetadata | undefined;
      if (compVal["metadata"] !== undefined) {
        if (isV10) {
          parsedMetadata = validateComponentMetadata(compName, compVal["metadata"]);
        } else if (isJsonObject(compVal["metadata"])) {
          parsedMetadata = {
            extensions: isJsonObject(compVal["metadata"]["extensions"])
              ? deepCloneJson(compVal["metadata"]["extensions"])
              : undefined,
          };
        }
      }

      allComponents.set(compName, {
        name: compName,
        schema: deepCloneJson(compVal),
        description:
          typeof compVal["description"] === "string"
            ? compVal["description"]
            : undefined,
        allowedParents: parseStringArray(compVal["allowedParents"]),
        allowedChildren: parseStringArray(compVal["allowedChildren"]),
        metadata: parsedMetadata,
      });
    }

    const allFunctions = new Map<string, FunctionDefinition>();
    for (const [fnName, fnVal] of Object.entries(rawFunctions)) {
      if (!isJsonObject(fnVal)) {
        throw new A2uiCatalogError(
          "CATALOG_INVALID",
          `Function '${fnName}' definition must be an object`,
        );
      }
      if (isV10) {
        if (!isValidUax31Identifier(fnName)) {
          throw new A2uiCatalogError(
            "INVALID_IDENTIFIER",
            `Invalid UAX #31 function identifier: '${fnName}'`,
          );
        }
        validateFunctionArgumentNames(fnName, fnVal);
      }

      const rawAllowedCallers = fnVal["allowedCallers"];
      let allowedCallers: AllowedCallers = "rendererOnly";
      if (rawAllowedCallers !== undefined) {
        if (
          typeof rawAllowedCallers !== "string" ||
          !VALID_ALLOWED_CALLERS.has(rawAllowedCallers)
        ) {
          throw new A2uiCatalogError(
            "CATALOG_INVALID",
            `Function '${fnName}' has invalid allowedCallers '${String(rawAllowedCallers)}'`,
          );
        }
        allowedCallers = rawAllowedCallers as AllowedCallers;
      }

      const requiresUserActivation = fnVal["requiresUserActivation"] === true;
      if (isV10 && requiresUserActivation && allowedCallers !== "rendererOnly") {
        throw new A2uiCatalogError(
          "CATALOG_INVALID",
          `Function '${fnName}' sets requiresUserActivation: true, which is only allowed when allowedCallers is 'rendererOnly' (got '${allowedCallers}')`,
        );
      }

      allFunctions.set(fnName, {
        name: fnName,
        schema: deepCloneJson(fnVal),
        description:
          typeof fnVal["description"] === "string"
            ? fnVal["description"]
            : undefined,
        returnType:
          typeof fnVal["returnType"] === "string"
            ? fnVal["returnType"]
            : undefined,
        allowedCallers,
        requiresUserActivation,
      });
    }

    // Filter exposed entries when $defs.anyComponent / $defs.anyFunction list a subset.
    const exposedComponentNames = parseUnionMemberNames(
      rawDefs["anyComponent"],
      "#/components/",
    );
    const exposedFunctionNames = parseUnionMemberNames(
      rawDefs["anyFunction"],
      "#/functions/",
    );

    const components = new Map<string, ComponentDefinition>();
    if (exposedComponentNames !== null) {
      for (const name of exposedComponentNames) {
        const entry = allComponents.get(name);
        if (entry) {
          components.set(name, entry);
        }
      }
    } else {
      for (const [name, entry] of allComponents) {
        components.set(name, entry);
      }
    }

    const functions = new Map<string, FunctionDefinition>();
    if (exposedFunctionNames !== null) {
      for (const name of exposedFunctionNames) {
        const entry = allFunctions.get(name);
        if (entry) {
          functions.set(name, entry);
        }
      }
    } else {
      for (const [name, entry] of allFunctions) {
        functions.set(name, entry);
      }
    }

    const defs = new Map<string, JsonObject>();
    for (const [defName, defVal] of Object.entries(rawDefs)) {
      if (isJsonObject(defVal)) {
        defs.set(defName, deepCloneJson(defVal));
      }
    }

    const authoredDoc = deepCloneJson(raw);
    if (options.catalogId !== undefined) {
      authoredDoc["catalogId"] = options.catalogId;
    }

    return new Catalog({
      catalogId: effectiveCatalogId,
      protocolVersion: effectiveVersion,
      title: typeof raw["title"] === "string" ? raw["title"] : undefined,
      description:
        typeof raw["description"] === "string" ? raw["description"] : undefined,
      instructions:
        typeof raw["instructions"] === "string" ? raw["instructions"] : undefined,
      metadata: isJsonObject(raw["metadata"])
        ? deepCloneJson(raw["metadata"])
        : undefined,
      theme: isJsonObject(raw["theme"]) ? deepCloneJson(raw["theme"]) : undefined,
      components,
      functions,
      defs,
      authoredDoc,
    });
  }

  /** Emits the unbundled authored catalog JSON document. */
  toJson(): JsonObject {
    return deepCloneJson(this.authoredDoc);
  }

  /** Emits the self-contained, bundled Draft 2020-12 JSON Schema for validation. */
  get validationSchema(): JsonObject {
    return deepCloneJson(this.getValidationSchemaRef());
  }

  /**
   * Returns a read-only reference to the cached bundled validation schema
   * without deep-cloning (for internal hot-path validation and resolution).
   */
  getValidationSchemaRef(): JsonObject {
    if (!this.cachedValidationSchema) {
      this.cachedValidationSchema = this.buildValidationSchema();
    }
    return this.cachedValidationSchema;
  }

  private buildValidationSchema(): JsonObject {
    const commonDefs = getCommonTypeDefs();
    const localizedOwnDefs: JsonObject = {};
    for (const [defName, defVal] of this.defs) {
      if (
        defName === "anyComponent" ||
        defName === "anyFunction" ||
        Object.prototype.hasOwnProperty.call(commonDefs, defName)
      ) {
        continue;
      }
      const localized = localizeSchemaTree(deepCloneJson(defVal)) as JsonObject;
      describeCommonRefs(localized, commonDefs);
      localizedOwnDefs[defName] = localized;
    }

    const mergedMixins = new Set<string>();
    const componentsOut: JsonObject = {};
    for (const [compName, compDef] of this.components) {
      const localizedComp = localizeSchemaTree(
        deepCloneJson(compDef.schema),
      ) as JsonObject;
      const flat = flattenComponentSchema(
        compName,
        localizedComp,
        localizedOwnDefs,
        commonDefs,
      );
      for (const m of flat.merged) {
        mergedMixins.add(m);
      }
      describeCommonRefs(flat.schema, commonDefs);
      componentsOut[compName] = flat.schema;
    }

    const functionsOut: JsonObject = {};
    for (const [fnName, fnDef] of this.functions) {
      const localizedFn = localizeSchemaTree(
        deepCloneJson(fnDef.schema),
      ) as JsonObject;
      closeFunctionArgs(localizedFn);
      describeCommonRefs(localizedFn, commonDefs);
      functionsOut[fnName] = localizedFn;
    }

    const defsOut: JsonObject = {};
    for (const [defName, defVal] of Object.entries(localizedOwnDefs)) {
      defsOut[defName] = defVal;
    }

    if (this.theme) {
      const themeDef = localizeSchemaTree(deepCloneJson(this.theme)) as JsonObject;
      describeCommonRefs(themeDef, commonDefs);
      if (
        themeDef["additionalProperties"] === undefined &&
        themeDef["unevaluatedProperties"] === undefined
      ) {
        themeDef["additionalProperties"] = true;
      }
      defsOut["theme"] = themeDef;
    }

    const compNames = Array.from(this.components.keys());
    defsOut["anyComponent"] =
      compNames.length > 0
        ? {
            oneOf: compNames.map((n) => ({ $ref: `#/components/${n}` })),
            discriminator: { propertyName: "component" },
          }
        : { not: {} };

    const fnNames = Array.from(this.functions.keys());
    defsOut["anyFunction"] =
      fnNames.length > 0
        ? {
            oneOf: fnNames.map((n) => ({ $ref: `#/functions/${n}` })),
          }
        : { not: {} };

    // Prune merged own mixins that are no longer referenced anywhere.
    if (mergedMixins.size > 0) {
      const referenced = new Set<string>();
      collectReferencedDefNames(componentsOut, referenced);
      collectReferencedDefNames(functionsOut, referenced);
      for (const [defName, defVal] of Object.entries(defsOut)) {
        if (!mergedMixins.has(defName)) {
          collectReferencedDefNames(defVal, referenced);
        }
      }
      const worklist = Array.from(referenced);
      while (worklist.length > 0) {
        const cur = worklist.pop()!;
        const defVal = defsOut[cur];
        if (defVal !== undefined) {
          const nested = new Set<string>();
          collectReferencedDefNames(defVal, nested);
          for (const next of nested) {
            if (!referenced.has(next)) {
              referenced.add(next);
              worklist.push(next);
            }
          }
        }
      }
      for (const mixinName of mergedMixins) {
        if (!referenced.has(mixinName)) {
          delete defsOut[mixinName];
        }
      }
    }

    // Transitively inline referenced v1.0 common_types definitions.
    const neededCommon = new Set<string>();
    collectReferencedDefNames(componentsOut, neededCommon);
    collectReferencedDefNames(functionsOut, neededCommon);
    collectReferencedDefNames(defsOut, neededCommon);

    const queue = Array.from(neededCommon);
    const addedCommon = new Set<string>();
    while (queue.length > 0) {
      const defName = queue.pop()!;
      if (addedCommon.has(defName)) {
        continue;
      }
      if (
        !Object.prototype.hasOwnProperty.call(defsOut, defName) &&
        Object.prototype.hasOwnProperty.call(commonDefs, defName)
      ) {
        addedCommon.add(defName);
        const cloned = localizeSchemaTree(
          deepCloneJson(commonDefs[defName]!),
        ) as JsonObject;
        defsOut[defName] = cloned;
        const nested = new Set<string>();
        collectReferencedDefNames(cloned, nested);
        for (const next of nested) {
          if (!addedCommon.has(next)) {
            queue.push(next);
          }
        }
      }
    }

    const out: JsonObject = {
      $schema: JSON_SCHEMA_DRAFT_2020_12,
      catalogId: this.catalogId,
      protocolVersion: this.protocolVersion,
    };
    if (this.instructions && this.instructions.length > 0) {
      out["instructions"] = this.instructions;
    }
    out["components"] = componentsOut;
    if (fnNames.length > 0) {
      out["functions"] = functionsOut;
    }
    out["$defs"] = defsOut;
    return out;
  }

  /** Derives a new `Catalog` with a new ID from selected/replaced/added entries. */
  derive(options: CatalogDeriveOptions): Catalog {
    if (!options.catalogId || options.catalogId.trim().length === 0) {
      throw new A2uiCatalogError(
        "CATALOG_INVALID",
        "Derived catalog must specify a non-empty catalogId",
      );
    }

    const nextComponents: JsonObject = {};
    if (options.components === undefined) {
      for (const [name, def] of this.components) {
        nextComponents[name] = deepCloneJson(def.schema);
      }
    } else {
      for (const item of options.components) {
        if (typeof item === "string") {
          const existing = this.components.get(item);
          if (!existing) {
            throw new A2uiCatalogError(
              "UNKNOWN_COMPONENT",
              `Component '${item}' is not defined in source catalog '${this.catalogId}'`,
            );
          }
          nextComponents[item] = deepCloneJson(existing.schema);
        } else {
          const entries = Object.entries(item);
          if (entries.length !== 1) {
            throw new A2uiCatalogError(
              "CATALOG_INVALID",
              "Derived component map entry must contain exactly one component name",
            );
          }
          const [compName, compSchema] = entries[0]!;
          nextComponents[compName] = deepCloneJson(compSchema);
        }
      }
    }

    const nextFunctions: JsonObject = {};
    if (options.functions === undefined) {
      for (const [name, def] of this.functions) {
        nextFunctions[name] = deepCloneJson(def.schema);
      }
    } else {
      for (const item of options.functions) {
        if (typeof item === "string") {
          const existing = this.functions.get(item);
          if (!existing) {
            throw new A2uiCatalogError(
              "UNKNOWN_FUNCTION",
              `Function '${item}' is not defined in source catalog '${this.catalogId}'`,
            );
          }
          nextFunctions[item] = deepCloneJson(existing.schema);
        } else {
          const entries = Object.entries(item);
          if (entries.length !== 1) {
            throw new A2uiCatalogError(
              "CATALOG_INVALID",
              "Derived function map entry must contain exactly one function name",
            );
          }
          const [fnName, fnSchema] = entries[0]!;
          nextFunctions[fnName] = deepCloneJson(fnSchema);
        }
      }
    }

    const derivedDoc: JsonObject = {
      catalogId: options.catalogId,
      protocolVersion: this.protocolVersion,
    };
    if (options.instructions !== undefined) {
      derivedDoc["instructions"] = options.instructions;
    }
    if (Object.keys(nextComponents).length > 0) {
      derivedDoc["components"] = nextComponents;
    }
    if (Object.keys(nextFunctions).length > 0) {
      derivedDoc["functions"] = nextFunctions;
    }
    if (this.theme !== undefined) {
      derivedDoc["theme"] = deepCloneJson(this.theme);
    }

    // Preserve any non-union leaf $defs referenced by derived components/functions/theme.
    const referencedDefs = new Set<string>();
    collectReferencedDefNames(nextComponents, referencedDefs);
    collectReferencedDefNames(nextFunctions, referencedDefs);
    if (this.theme !== undefined) {
      collectReferencedDefNames(this.theme, referencedDefs);
    }
    const nextDefs: JsonObject = {};
    const queue = Array.from(referencedDefs);
    while (queue.length > 0) {
      const defName = queue.pop()!;
      if (
        defName === "anyComponent" ||
        defName === "anyFunction" ||
        Object.prototype.hasOwnProperty.call(nextDefs, defName)
      ) {
        continue;
      }
      const existing = this.defs.get(defName);
      if (existing) {
        nextDefs[defName] = deepCloneJson(existing);
        const nested = new Set<string>();
        collectReferencedDefNames(existing, nested);
        for (const n of nested) {
          if (!Object.prototype.hasOwnProperty.call(nextDefs, n)) {
            queue.push(n);
          }
        }
      }
    }
    if (Object.keys(nextDefs).length > 0) {
      derivedDoc["$defs"] = nextDefs;
    }

    return Catalog.fromJson(derivedDoc, {
      catalogId: options.catalogId,
      protocolVersion: this.protocolVersion,
    });
  }

  /**
   * Validates a single component instance against this catalog's validation
   * schema, enforcing nested function-call validation and identifier checks.
   * Returns an array of `SchemaValidationIssue` (empty when valid).
   */
  validateComponentIssues(
    component: unknown,
    options: ValidateComponentOptions = {},
  ): readonly SchemaValidationIssue[] {
    const basePath = options.basePath ?? "";
    const strict = options.strict ?? true;

    if (!isJsonObject(component)) {
      return [
        {
          path: basePath || "/",
          keyword: "type",
          message: "Component must be a JSON object",
        },
      ];
    }

    const compType = component["component"];
    if (typeof compType !== "string" || compType.length === 0) {
      return [
        {
          path: `${basePath}/component`,
          keyword: "required",
          message: "Component is missing required 'component' type string",
        },
      ];
    }

    if (compType === "Surface") {
      return [
        {
          path: `${basePath}/component`,
          keyword: "const",
          message: "Component type 'Surface' is reserved and cannot be instantiated",
        },
      ];
    }

    const vSchema = this.validationSchema;
    const compSchemas = vSchema["components"] as JsonObject;
    const compSchema = compSchemas[compType];
    if (!isJsonObject(compSchema)) {
      return [
        {
          path: `${basePath}/component`,
          keyword: "unknownComponent",
          message: `Unknown component type '${compType}' in catalog '${this.catalogId}'`,
        },
      ];
    }

    const issues: SchemaValidationIssue[] = [];
    const commonSchema = buildV10CommonTypesSchema();
    const commonDefs = commonSchema["$defs"] as JsonObject;

    // Validate ComponentCommon envelope keys when present.
    if (Object.prototype.hasOwnProperty.call(component, "@catalogId")) {
      if (typeof component["@catalogId"] !== "string") {
        issues.push({
          path: `${basePath}/@catalogId`,
          keyword: "type",
          message: "Component '@catalogId' must be a string",
        });
      }
    }
    if (Object.prototype.hasOwnProperty.call(component, "@accessibility")) {
      const accIssues = validateJsonSchema(
        { $ref: "#/$defs/AccessibilityAttributes" },
        component["@accessibility"],
        vSchema["$defs"] &&
          Object.prototype.hasOwnProperty.call(
            vSchema["$defs"] as JsonObject,
            "AccessibilityAttributes",
          )
          ? vSchema
          : commonSchema,
        { customRefValidator: (ref, val, path, root) => this.validateNestedFunctionCallRef(ref, val, path, root) },
        `${basePath}/@accessibility`,
      );
      issues.push(...accIssues);
    }
    if (Object.prototype.hasOwnProperty.call(component, "@metadata")) {
      const metaSchema = (commonDefs["ComponentCommon"] as JsonObject)[
        "properties"
      ] as JsonObject;
      const metaIssues = validateJsonSchema(
        metaSchema["@metadata"]!,
        component["@metadata"],
        commonSchema,
        {},
        `${basePath}/@metadata`,
      );
      issues.push(...metaIssues);
    }

    // Build effective schema that allows ComponentCommon envelope keys when strict.
    const effectiveCompSchema = deepCloneJson(compSchema);
    const props = isJsonObject(effectiveCompSchema["properties"])
      ? effectiveCompSchema["properties"]
      : {};
    if (strict) {
      if (effectiveCompSchema["unevaluatedProperties"] === undefined &&
          effectiveCompSchema["additionalProperties"] === undefined) {
        effectiveCompSchema["unevaluatedProperties"] = false;
      }
    }
    // Ensure envelope properties are recognized so unevaluatedProperties doesn't reject valid envelope fields.
    if (!Object.prototype.hasOwnProperty.call(props, "@catalogId")) {
      props["@catalogId"] = { type: "string" };
    }
    if (!Object.prototype.hasOwnProperty.call(props, "@accessibility")) {
      props["@accessibility"] = {};
    }
    if (!Object.prototype.hasOwnProperty.call(props, "@metadata")) {
      props["@metadata"] = {};
    }
    effectiveCompSchema["properties"] = props;

    const schemaIssues = validateJsonSchema(
      effectiveCompSchema,
      component,
      vSchema,
      {
        customRefValidator: (ref, val, path, root) =>
          this.validateNestedFunctionCallRef(ref, val, path, root),
      },
      basePath,
    );
    issues.push(...schemaIssues);
    return issues;
  }

  /**
   * Validates a single component against this catalog, throwing
   * `A2uiValidationError` on the first violation.
   */
  validateComponent(
    component: unknown,
    options: ValidateComponentOptions = {},
  ): void {
    const issues = this.validateComponentIssues(component, options);
    if (issues.length > 0) {
      const first = issues[0]!;
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        first.message,
        first.path,
        {
          surfaceId: options.surfaceId,
          details: issues.map((i) => ({
            code: "VALIDATION_FAILED",
            message: i.message,
            path: i.path,
            surfaceId: options.surfaceId,
          })),
        },
      );
    }
  }

  /**
   * Custom `$ref` validator for `#/$defs/FunctionCall` inside a single catalog:
   * - Validates `@call` is `@index` or valid UAX #31 identifier
   * - Validates `args` keys are valid UAX #31 identifiers
   * - Rejects unknown keys on the FunctionCall envelope
   * - For calls naming another `catalogId`, accepts the outer call while
   *   recursively validating nested function calls inside `args`
   * - For calls naming this catalog or omitting `catalogId`, delegates to
   *   this catalog's `anyFunction` schema.
   */
  private validateNestedFunctionCallRef(
    ref: string,
    value: unknown,
    instancePath: string,
    root: JsonObject,
  ): true | readonly SchemaValidationIssue[] | undefined {
    if (ref !== "#/$defs/FunctionCall") {
      return undefined;
    }
    return this.validateFunctionCallObject(value, instancePath, root, false);
  }

  private validateFunctionCallObject(
    value: unknown,
    instancePath: string,
    root: JsonObject,
    runSchemaOnLocal: boolean,
  ): true | readonly SchemaValidationIssue[] | undefined {
    if (!isJsonObject(value)) {
      return [
        {
          path: instancePath || "/",
          keyword: "type",
          message: "FunctionCall must be an object",
        },
      ];
    }

    const callName = value["@call"];
    if (typeof callName !== "string") {
      return [
        {
          path: `${instancePath}/@call`,
          keyword: "required",
          message: "FunctionCall requires string '@call'",
        },
      ];
    }

    // Reject unknown keys on the FunctionCall object.
    for (const key of Object.keys(value)) {
      if (key !== "@call" && key !== "catalogId" && key !== "args") {
        return [
          {
            path: `${instancePath}/${key}`,
            keyword: "unevaluatedProperties",
            message: `Unexpected property '${key}' on FunctionCall`,
          },
        ];
      }
    }

    if (!isValidFunctionCallName(callName)) {
      return [
        {
          path: `${instancePath}/@call`,
          keyword: "identifier",
          message: `Invalid function call identifier '${callName}'`,
        },
      ];
    }

    const catalogId = value["catalogId"];
    if (catalogId !== undefined && typeof catalogId !== "string") {
      return [
        {
          path: `${instancePath}/catalogId`,
          keyword: "type",
          message: "FunctionCall 'catalogId' must be a string",
        },
      ];
    }

    const args = value["args"];
    if (args !== undefined) {
      if (!isJsonObject(args)) {
        return [
          {
            path: `${instancePath}/args`,
            keyword: "type",
            message: "FunctionCall 'args' must be an object",
          },
        ];
      }
      for (const argKey of Object.keys(args)) {
        if (!isValidUax31Identifier(argKey)) {
          return [
            {
              path: `${instancePath}/args/${argKey}`,
              keyword: "identifier",
              message: `Invalid function argument identifier '${argKey}'`,
            },
          ];
        }
      }
    }

    // Calls targeting another catalog cannot be checked against this catalog's
    // signature, but any nested calls inside `args` still must be validated.
    if (
      callName !== "@index" &&
      catalogId !== undefined &&
      catalogId !== this.catalogId
    ) {
      const nestedIssues: SchemaValidationIssue[] = [];
      if (isJsonObject(args)) {
        this.walkNestedCallsInArgs(
          args,
          `${instancePath}/args`,
          root,
          nestedIssues,
        );
      }
      return nestedIssues.length > 0 ? nestedIssues : true;
    }

    if (!runSchemaOnLocal) {
      // Let standard JSON Schema evaluate FunctionCall against this catalog's anyFunction / IndexSystemFunction.
      return undefined;
    }

    const fnCallSchema = resolveLocalRef(root, "#/$defs/FunctionCall");
    if (!fnCallSchema) {
      return [
        {
          path: instancePath || "/",
          keyword: "$ref",
          message: "Missing FunctionCall schema definition",
        },
      ];
    }
    const issues = validateJsonSchema(
      fnCallSchema,
      value,
      root,
      {
        customRefValidator: (r, v, p, rt) => {
          // Avoid infinite recursion on the top-level FunctionCall itself.
          if (r === "#/$defs/FunctionCall" && p === instancePath) {
            return undefined;
          }
          return this.validateNestedFunctionCallRef(r, v, p, rt);
        },
      },
      instancePath,
    );
    return issues.length > 0 ? issues : true;
  }

  private walkNestedCallsInArgs(
    node: JsonValue,
    instancePath: string,
    root: JsonObject,
    issues: SchemaValidationIssue[],
  ): void {
    if (node === null || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        this.walkNestedCallsInArgs(
          node[i]!,
          `${instancePath}/${i}`,
          root,
          issues,
        );
      }
      return;
    }
    if (Object.prototype.hasOwnProperty.call(node, "@call")) {
      const res = this.validateFunctionCallObject(node, instancePath, root, true);
      if (Array.isArray(res)) {
        issues.push(...res);
      }
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      this.walkNestedCallsInArgs(v, `${instancePath}/${k}`, root, issues);
    }
  }
}

/**
 * Registry of A2UI catalogs supporting multi-catalog lookup, inline catalog
 * registration, explicit aliases, and strict v1.0 catalog resolution.
 */
export class CatalogRegistry {
  private readonly catalogs = new Map<string, Catalog>();
  private readonly aliases = new Map<string, string>();

  /** Creates a `CatalogRegistry` pre-populated with the A2UI Basic Catalog v1. */
  static withBasicV1(): CatalogRegistry {
    const registry = new CatalogRegistry();
    registry.register(Catalog.basicV1());
    return registry;
  }

  /** Registers a `Catalog` instance under its `catalogId` (and optional aliases). */
  register(catalog: Catalog, aliases: readonly string[] = []): void {
    this.catalogs.set(catalog.catalogId, catalog);
    for (const alias of aliases) {
      this.aliases.set(alias, catalog.catalogId);
    }
  }

  /** Registers an alias pointing to an already-registered `catalogId`. */
  registerAlias(alias: string, targetCatalogId: string): void {
    if (!this.catalogs.has(targetCatalogId)) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Cannot alias '${alias}' to unregistered catalog '${targetCatalogId}'`,
      );
    }
    this.aliases.set(alias, targetCatalogId);
  }

  /** Parses and registers an inline catalog JSON document. */
  registerInline(
    raw: unknown,
    options?: CatalogFromJsonOptions,
    aliases: readonly string[] = [],
  ): Catalog {
    const catalog = Catalog.fromJson(raw, options);
    this.register(catalog, aliases);
    return catalog;
  }

  /** Looks up a catalog by ID or registered alias. */
  get(catalogId: string): Catalog | undefined {
    const direct = this.catalogs.get(catalogId);
    if (direct) {
      return direct;
    }
    const target = this.aliases.get(catalogId);
    return target !== undefined ? this.catalogs.get(target) : undefined;
  }

  has(catalogId: string): boolean {
    return this.get(catalogId) !== undefined;
  }

  delete(catalogId: string): boolean {
    const existed = this.catalogs.delete(catalogId);
    for (const [alias, target] of this.aliases) {
      if (target === catalogId) {
        this.aliases.delete(alias);
      }
    }
    return existed;
  }

  list(): readonly Catalog[] {
    return Array.from(this.catalogs.values());
  }

  /**
   * Validates that all `supportedCatalogIds` on a surface are compatible with
   * the surface's protocol version.
   */
  validateSurfaceCatalogVersions(
    surfaceId: string,
    surfaceProtocolVersion: string,
    supportedCatalogIds: readonly string[],
    versionOverrides?: ReadonlyMap<string, string>,
  ): void {
    for (const catId of supportedCatalogIds) {
      const catVersion =
        versionOverrides?.get(catId) ?? this.get(catId)?.protocolVersion;
      if (catVersion !== undefined && catVersion !== surfaceProtocolVersion) {
        throw new A2uiCatalogError(
          "CATALOG_VERSION_MISMATCH",
          `Protocol version mismatch: cannot mix catalog '${catId}' (${catVersion}) with surface version ${surfaceProtocolVersion}.`,
          surfaceId,
        );
      }
    }
  }

  /**
   * Resolves the effective catalog ID for a component or function call using
   * strict v1.0 precedence: explicit override -> surface default -> error.
   */
  resolveCatalogId(
    surface: SurfaceCatalogContext,
    explicitCatalogId?: string,
  ): string {
    const chosen = explicitCatalogId ?? surface.defaultCatalogId;
    if (!chosen) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `No catalogId specified and surface '${surface.surfaceId}' has no default catalogId.`,
        surface.surfaceId,
      );
    }
    if (
      surface.supportedCatalogIds &&
      !surface.supportedCatalogIds.includes(chosen)
    ) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Catalog '${chosen}' is not supported by surface '${surface.surfaceId}'.`,
        surface.surfaceId,
      );
    }
    return chosen;
  }

  /** Resolves a `Catalog` for a component (`@catalogId` -> surface default -> error). */
  resolveComponentCatalog(
    surface: SurfaceCatalogContext,
    component: Readonly<Record<string, unknown>>,
  ): Catalog {
    const explicit =
      typeof component["@catalogId"] === "string"
        ? component["@catalogId"]
        : typeof component["catalogId"] === "string"
          ? component["catalogId"]
          : undefined;
    const catId = this.resolveCatalogId(surface, explicit);
    const catalog = this.get(catId);
    if (!catalog) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Catalog '${catId}' not found for surface '${surface.surfaceId}'.`,
        surface.surfaceId,
      );
    }
    if (
      surface.protocolVersion &&
      catalog.protocolVersion !== surface.protocolVersion
    ) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Catalog '${catId}' (version ${catalog.protocolVersion}) is incompatible with surface '${surface.surfaceId}' (version ${surface.protocolVersion}).`,
        surface.surfaceId,
      );
    }
    return catalog;
  }

  /** Resolves a `Catalog` for a function call (`catalogId` -> surface default -> error). */
  resolveFunctionCatalog(
    surface: SurfaceCatalogContext,
    functionCall: Readonly<Record<string, unknown>>,
  ): Catalog {
    const explicit =
      typeof functionCall["catalogId"] === "string"
        ? functionCall["catalogId"]
        : undefined;
    const catId = this.resolveCatalogId(surface, explicit);
    const catalog = this.get(catId);
    if (!catalog) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Catalog '${catId}' not found for surface '${surface.surfaceId}'.`,
        surface.surfaceId,
      );
    }
    if (
      surface.protocolVersion &&
      catalog.protocolVersion !== surface.protocolVersion
    ) {
      throw new A2uiCatalogError(
        "CATALOG_NOT_FOUND",
        `Catalog '${catId}' (version ${catalog.protocolVersion}) is incompatible with surface '${surface.surfaceId}' (version ${surface.protocolVersion}).`,
        surface.surfaceId,
      );
    }
    return catalog;
  }
}

/**
 * Validates a value against a named definition in the A2UI v1.0
 * `common_types.json` `$defs`, returning the value unchanged when valid or
 * throwing `A2uiValidationError`.
 */
export function validateV10CommonType(
  definitionName: string,
  value: unknown,
): unknown {
  const schema = buildV10CommonTypesSchema();
  const defs = schema["$defs"] as JsonObject;
  if (!Object.prototype.hasOwnProperty.call(defs, definitionName)) {
    throw new A2uiValidationError(
      "VALIDATION_FAILED",
      `Unknown common_types definition '${definitionName}'`,
      "/",
    );
  }

  // Standalone FunctionCall validation treats catalog.json#/$defs/anyFunction
  // as an open catalog function call (`@call` + optional `args`, no extra keys).
  const standaloneAnyFunction: JsonObject = {
    type: "object",
    properties: {
      "@call": {
        type: "string",
        not: { const: "@index" },
      },
      args: { type: "object" },
    },
    required: ["@call"],
  };

  const issues = validateJsonSchema(
    { $ref: `#/$defs/${definitionName}` },
    value,
    schema,
    {
      resolveExternalRef: (ref) => {
        if (ref === "catalog.json#/$defs/anyFunction") {
          return { root: schema, schema: standaloneAnyFunction };
        }
        return undefined;
      },
    },
  );

  if (issues.length > 0) {
    const first = issues[0]!;
    throw new A2uiValidationError("VALIDATION_FAILED", first.message, first.path);
  }
  return value;
}

/**
 * Extracts child component ID references and their JSON Pointer suffixes from
 * a component instance, combining standard A2UI v1.0 child slots (`child`,
 * `children`, `trigger`, `content`, `tabs[*].child`) with schema-declared
 * `Child` / `ChildList` / `ComponentId` properties.
 */
export function extractChildReferences(
  component: Readonly<Record<string, unknown>>,
  catalog?: Catalog,
): readonly ChildReference[] {
  const refs: ChildReference[] = [];
  const visitedProps = new Set<string>();

  const recordChildValue = (propName: string, value: unknown): void => {
    if (typeof value === "string") {
      refs.push({
        childId: value,
        pathSuffix: `/${propName}`,
        fieldName: propName,
      });
      return;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (typeof item === "string") {
          refs.push({
            childId: item,
            pathSuffix: `/${propName}/${i}`,
            fieldName: `${propName}[${i}]`,
          });
        } else if (isJsonObject(item) && typeof item["child"] === "string") {
          refs.push({
            childId: item["child"],
            pathSuffix: `/${propName}/${i}/child`,
            fieldName: `${propName}[${i}].child`,
          });
        }
      }
      return;
    }
    if (isJsonObject(value) && typeof value["componentId"] === "string") {
      refs.push({
        childId: value["componentId"],
        pathSuffix: `/${propName}/componentId`,
        fieldName: `${propName}.componentId`,
      });
    }
  };

  // Standard child-carrying properties in A2UI v1.0 Basic Catalog.
  for (const propName of [
    "child",
    "children",
    "trigger",
    "content",
    "tabs",
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(component, propName)) {
      visitedProps.add(propName);
      recordChildValue(propName, component[propName]);
    }
  }

  // Schema-driven discovery for custom catalogs defining custom child slots.
  const compType = component["component"];
  if (catalog && typeof compType === "string") {
    const vSchema = catalog.getValidationSchemaRef();
    const compSchemas = vSchema["components"] as JsonObject;
    const compSchema = compSchemas[compType];
    if (isJsonObject(compSchema) && isJsonObject(compSchema["properties"])) {
      for (const [propName, propSchema] of Object.entries(
        compSchema["properties"],
      )) {
        if (
          visitedProps.has(propName) ||
          propName === "id" ||
          propName === "component" ||
          !Object.prototype.hasOwnProperty.call(component, propName)
        ) {
          continue;
        }
        if (isChildRefSchema(propSchema)) {
          visitedProps.add(propName);
          recordChildValue(propName, component[propName]);
        }
      }
    }
  }

  return refs;
}

function isChildRefSchema(schema: JsonValue): boolean {
  if (!isJsonObject(schema)) {
    return false;
  }
  const ref = schema["$ref"];
  if (
    ref === "#/$defs/Child" ||
    ref === "#/$defs/ChildList" ||
    ref === "#/$defs/ComponentId"
  ) {
    return true;
  }
  if (schema["type"] === "array" && schema["items"] !== undefined) {
    const items = schema["items"];
    if (isChildRefSchema(items)) {
      return true;
    }
    if (
      isJsonObject(items) &&
      isJsonObject(items["properties"]) &&
      items["properties"]["child"] !== undefined &&
      isChildRefSchema(items["properties"]["child"])
    ) {
      return true;
    }
  }
  return false;
}

function formatPythonStringList(items: readonly string[]): string {
  return `[${items.map((s) => `'${s}'`).join(", ")}]`;
}

export interface CompositionCheckOptions {
  readonly surfaceId: string;
  /** All components currently on the surface, in surface insertion order. */
  readonly components: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  /** Optional map from component ID to its index in the current message's `components` array. */
  readonly batchIndices?: ReadonlyMap<string, number>;
  /** Resolver returning the `Catalog` owning a given component. */
  readonly resolveCatalog: (
    component: Readonly<Record<string, unknown>>,
  ) => Catalog | undefined;
}

/**
 * Checks whether `rootComp` is allowed under the implicit `"Surface"` parent.
 */
export function validateRootComposition(
  surfaceId: string,
  rootComp: Readonly<Record<string, unknown>>,
  rootCatalog: Catalog | undefined,
  rootIdx: number,
): void {
  const rootType = String(rootComp["component"] ?? "");
  const rootDef = rootCatalog?.components.get(rootType);
  if (
    rootDef?.allowedParents !== undefined &&
    !rootDef.allowedParents.includes("Surface")
  ) {
    const path = `/components/${rootIdx}`;
    const message = `Component 'root' (${rootType}) cannot be placed under parent 'Surface' (Surface). Allowed parents: ${formatPythonStringList(rootDef.allowedParents)}.`;
    const detail: ValidationErrorDetail = {
      code: "UNALLOWED_PARENT",
      message,
      path,
      surfaceId,
    };
    throw new A2uiValidationError("UNALLOWED_PARENT", message, path, {
      surfaceId,
      details: [detail],
    });
  }
}

/**
 * Checks one parent -> child composition edge against the parent's
 * `allowedChildren` and the child's `allowedParents`.
 */
export function validateCompositionEdge(
  surfaceId: string,
  parentId: string,
  parentType: string,
  parentCatalog: Catalog | undefined,
  parentIdx: number,
  ref: ChildReference,
  childType: string,
  childCatalog: Catalog | undefined,
  childIdx: number,
): void {
  const parentDef = parentCatalog?.components.get(parentType);
  const childDef = childCatalog?.components.get(childType);

  if (
    parentDef?.allowedChildren !== undefined &&
    !parentDef.allowedChildren.includes(childType)
  ) {
    const path = `/components/${parentIdx}${ref.pathSuffix}`;
    const message = `Container '${parentId}' (${parentType}) cannot contain child '${ref.childId}' (${childType}). Allowed children: ${formatPythonStringList(parentDef.allowedChildren)}.`;
    const detail: ValidationErrorDetail = {
      code: "UNALLOWED_CHILD",
      message,
      path,
      surfaceId,
    };
    throw new A2uiValidationError("UNALLOWED_CHILD", message, path, {
      surfaceId,
      details: [detail],
    });
  }

  if (
    childDef?.allowedParents !== undefined &&
    !childDef.allowedParents.includes(parentType)
  ) {
    const path = `/components/${childIdx}`;
    const message = `Component '${ref.childId}' (${childType}) cannot be placed under parent '${parentId}' (${parentType}). Allowed parents: ${formatPythonStringList(childDef.allowedParents)}.`;
    const detail: ValidationErrorDetail = {
      code: "UNALLOWED_PARENT",
      message,
      path,
      surfaceId,
    };
    throw new A2uiValidationError("UNALLOWED_PARENT", message, path, {
      surfaceId,
      details: [detail],
    });
  }
}

/**
 * Validates `allowedParents` and `allowedChildren` composition constraints across
 * a surface's component graph:
 * - Only `id === "root"` is checked against the canonical `"Surface"` parent.
 * - Every parent -> child edge checks both the parent's `allowedChildren` and
 *   the child's `allowedParents`.
 * - Throws `A2uiValidationError` with code `UNALLOWED_PARENT` or `UNALLOWED_CHILD`.
 */
export function validateCompositionConstraints(
  options: CompositionCheckOptions,
): void {
  const { surfaceId, components, batchIndices, resolveCatalog } = options;

  // Fallback surface index when a component was not in the latest batch.
  const surfaceIndexMap = new Map<string, number>();
  let surfaceIdx = 0;
  for (const id of components.keys()) {
    surfaceIndexMap.set(id, surfaceIdx);
    surfaceIdx += 1;
  }

  const indexOf = (id: string): number =>
    batchIndices?.get(id) ?? surfaceIndexMap.get(id) ?? 0;

  // 1. Check root component against canonical implicit parent 'Surface'.
  const rootComp = components.get("root");
  if (rootComp) {
    validateRootComposition(
      surfaceId,
      rootComp,
      resolveCatalog(rootComp),
      indexOf("root"),
    );
  }

  // 2. Check every parent -> child edge in surface order.
  for (const [parentId, parentComp] of components) {
    const parentType = String(parentComp["component"] ?? "");
    const parentCatalog = resolveCatalog(parentComp);
    const childRefs = extractChildReferences(parentComp, parentCatalog);

    for (const ref of childRefs) {
      const childComp = components.get(ref.childId);
      if (!childComp) {
        continue;
      }
      const childType = String(childComp["component"] ?? "");
      const childCatalog = resolveCatalog(childComp);
      validateCompositionEdge(
        surfaceId,
        parentId,
        parentType,
        parentCatalog,
        indexOf(parentId),
        ref,
        childType,
        childCatalog,
        indexOf(ref.childId),
      );
    }
  }
}
