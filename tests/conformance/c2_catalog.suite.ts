import { beforeAll, describe, expect, test } from "nsh/test";
import {
  A2uiIntegrityError,
  BASIC_CATALOG_V1_ID,
  Catalog,
  CatalogRegistry,
  buildV10AgentToRendererSchema,
  buildV10CommonTypesSchema,
  extractChildReferences,
  isSelfContainedSchema,
  validateCompositionConstraints,
  validateV10CommonType,
} from "../../src/core/catalog";
import { A2uiValidationError } from "../../src/core/expression";
import type { JsonObject, JsonValue } from "../../src/core/json_schema";
import {
  ConformanceClient,
  assertMatchesExpectedError,
  type ConformanceCase,
  type ConformanceExpectError,
} from "./harness";

/**
 * Documented skips for pre-v1.0 cases in C2 suites.
 * Spec 001 is v1.0-only ("Not doing: Protocol v0.8, v0.9, or v0.9.1 backward compatibility").
 * Every skip entry is verified against the YAML suite (stale skips fail CI).
 */
export const CATALOG_SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map([
  ["test_v08_basic_catalog_from_json", "v0.8 out of scope (v1.0 only)"],
  ["test_v09_basic_catalog_from_json", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_catalog_from_json_user_activation_agent_only_loads", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_catalog_from_json_allows_hyphen_identifiers", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_published_basic_catalog_validates_function_calls", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_published_basic_catalog_rejects_function_call_extra_key", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_published_minimal_catalog_is_self_contained", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_published_minimal_catalog_validates_function_calls", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_published_minimal_catalog_rejects_function_call_extra_key", "v0.9 out of scope (v1.0 only)"],
  ["test_v091_published_basic_catalog_is_self_contained", "v0.9.1 out of scope (v1.0 only)"],
  ["test_v091_published_basic_catalog_validates_function_calls", "v0.9.1 out of scope (v1.0 only)"],
  ["test_v091_published_basic_catalog_rejects_function_call_extra_key", "v0.9.1 out of scope (v1.0 only)"],
  ["test_v09_published_vegachart_catalog_is_self_contained", "v0.9 out of scope (v1.0 only)"],
  ["test_v08_basic_catalog_to_json", "v0.8 out of scope (v1.0 only)"],
  ["test_v09_basic_catalog_to_json", "v0.9 out of scope (v1.0 only)"],
  ["test_v08_basic_catalog_round_trip", "v0.8 out of scope (v1.0 only)"],
  ["test_v09_basic_catalog_round_trip", "v0.9 out of scope (v1.0 only)"],
  ["test_v091_basic_catalog_round_trip", "v0.9.1 out of scope (v1.0 only)"],
  ["test_v09_minimal_catalog_round_trip", "v0.9 out of scope (v1.0 only)"],
  ["test_mcp_catalog_round_trip", "v0.9 out of scope (v1.0 only)"],
  ["test_v08_basic_validation_schema", "v0.8 out of scope (v1.0 only)"],
  ["test_v09_basic_validation_schema", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_custom_validation_schema_flattening", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_catalog_derive_keeps_protocol_version", "v0.9 out of scope (v1.0 only)"],
]);

export const COMMON_TYPES_SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map([
  ["test_v09_common_types_schema_matches_specification", "v0.9 out of scope (v1.0 only)"],
  ["test_v091_common_types_schema_matches_specification", "v0.9.1 out of scope (v1.0 only)"],
  ["test_v09_function_call_rejects_unknown_keys", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_dynamic_value_branches_are_exclusive", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_child_list_is_ids_or_template", "v0.9 out of scope (v1.0 only)"],
  ["test_v09_action_is_event_or_function_call", "v0.9 out of scope (v1.0 only)"],
  ["test_v091_function_call_rejects_unknown_keys", "v0.9.1 out of scope (v1.0 only)"],
  ["test_v091_dynamic_value_branches_are_exclusive", "v0.9.1 out of scope (v1.0 only)"],
  ["test_v091_child_list_is_ids_or_template", "v0.9.1 out of scope (v1.0 only)"],
  ["test_v091_action_is_event_or_function_call", "v0.9.1 out of scope (v1.0 only)"],
]);

export const AGENT_TO_RENDERER_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map([
    ["test_v08_agent_to_renderer_schema_matches_specification", "v0.8 out of scope (v1.0 only)"],
    ["test_v09_agent_to_renderer_schema_matches_specification", "v0.9 out of scope (v1.0 only)"],
    ["test_v091_agent_to_renderer_schema_matches_specification", "v0.9.1 out of scope (v1.0 only)"],
  ]);

export const COMPOSITION_CONSTRAINTS_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map();

/**
 * Normalizes a JSON Schema object for structural conformance comparison:
 * sorts object keys recursively, and sorts `enum` and `required` arrays as sets
 * per `catalog.yaml` header rules.
 */
function normalizeSchemaForCompare(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSchemaForCompare(item));
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const val = obj[key];
    if (
      (key === "required" || key === "enum") &&
      Array.isArray(val) &&
      val.every((item) => typeof item === "string" || typeof item === "number")
    ) {
      out[key] = [...val].sort((a, b) => String(a).localeCompare(String(b)));
    } else {
      out[key] = normalizeSchemaForCompare(val);
    }
  }
  return out;
}

/** Exact JSON comparison sorting object keys only (preserving array order). */
function canonicalJsonExact(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJsonExact(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const entries = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJsonExact(obj[k])}`);
  return `{${entries.join(",")}}`;
}

async function readJsonFromRoot(
  client: ConformanceClient,
  relPath: string,
): Promise<JsonObject> {
  const root = client.resolveConformanceRoot();
  const content = await client.readTextFile(`${root}/${relPath}`);
  return JSON.parse(content) as JsonObject;
}

/** Preloads JSON files referenced by a suite so `runSuite` stays synchronous. */
async function preloadCaseFiles(
  client: ConformanceClient,
  cases: readonly ConformanceCase[],
  skips: ReadonlyMap<string, string>,
): Promise<Map<string, JsonObject>> {
  const cache = new Map<string, JsonObject>();
  for (const tc of cases) {
    if (skips.has(tc.name)) {
      continue;
    }
    for (const key of ["catalogPath", "expectFile"] as const) {
      const rel = tc[key];
      if (typeof rel === "string" && !cache.has(rel)) {
        cache.set(rel, await readJsonFromRoot(client, rel));
      }
    }
  }
  return cache;
}

function assertExpectedCatalogMatches(
  tcName: string,
  catalog: Catalog,
  exp: Record<string, unknown>,
): void {
  if (typeof exp["catalogId"] === "string") {
    expect(catalog.catalogId).toBe(exp["catalogId"]);
  }
  if (typeof exp["protocolVersion"] === "string") {
    expect(catalog.protocolVersion).toBe(exp["protocolVersion"]);
  }
  if (exp["selfContained"] === true) {
    expect(isSelfContainedSchema(catalog.validationSchema)).toBe(true);
  }
  if (exp["matchesBuiltinCatalog"] === true) {
    const builtin = Catalog.basicV1();
    expect(normalizeSchemaForCompare(catalog.toJson())).toEqual(
      normalizeSchemaForCompare(builtin.toJson()),
    );
    expect(normalizeSchemaForCompare(catalog.validationSchema)).toEqual(
      normalizeSchemaForCompare(builtin.validationSchema),
    );
  }
  if (exp["components"] !== undefined) {
    if (Array.isArray(exp["components"])) {
      expect(Array.from(catalog.components.keys()).sort()).toEqual(
        [...(exp["components"] as string[])].sort(),
      );
    } else if (typeof exp["components"] === "object" && exp["components"] !== null) {
      const expectedComps = exp["components"] as Record<string, Record<string, unknown>>;
      expect(Array.from(catalog.components.keys()).sort()).toEqual(
        Object.keys(expectedComps).sort(),
      );
      for (const [compName, expectedDef] of Object.entries(expectedComps)) {
        const actual = catalog.components.get(compName);
        if (!actual) {
          throw new Error(`${tcName}: missing component '${compName}'`);
        }
        for (const [k, v] of Object.entries(expectedDef)) {
          expect(normalizeSchemaForCompare(actual.schema[k])).toEqual(
            normalizeSchemaForCompare(v),
          );
        }
      }
    }
  }
  if (exp["functions"] !== undefined) {
    if (Array.isArray(exp["functions"])) {
      expect(Array.from(catalog.functions.keys()).sort()).toEqual(
        [...(exp["functions"] as string[])].sort(),
      );
    } else if (typeof exp["functions"] === "object" && exp["functions"] !== null) {
      const expectedFns = exp["functions"] as Record<string, Record<string, unknown>>;
      expect(Array.from(catalog.functions.keys()).sort()).toEqual(
        Object.keys(expectedFns).sort(),
      );
      for (const [fnName, expectedDef] of Object.entries(expectedFns)) {
        const actual = catalog.functions.get(fnName);
        if (!actual) {
          throw new Error(`${tcName}: missing function '${fnName}'`);
        }
        for (const [k, v] of Object.entries(expectedDef)) {
          expect(normalizeSchemaForCompare(actual.schema[k])).toEqual(
            normalizeSchemaForCompare(v),
          );
        }
      }
    }
  }
  if (exp["componentMetadata"] !== undefined) {
    const metaMap = exp["componentMetadata"] as Record<string, unknown>;
    for (const [compName, expectedMeta] of Object.entries(metaMap)) {
      const actual = catalog.components.get(compName);
      if (!actual) {
        throw new Error(`${tcName}: missing component '${compName}'`);
      }
      if (expectedMeta === null) {
        expect(actual.metadata).toBeUndefined();
      } else {
        expect(actual.metadata).toEqual(expectedMeta);
      }
    }
  }
  if (typeof exp["instructions"] === "string") {
    expect(catalog.instructions).toBe(exp["instructions"]);
  }
  if (exp["theme"] !== undefined) {
    expect(normalizeSchemaForCompare(catalog.theme)).toEqual(
      normalizeSchemaForCompare(exp["theme"]),
    );
  }
  if (Array.isArray(exp["absentKeys"])) {
    const json = catalog.toJson();
    for (const absent of exp["absentKeys"] as string[]) {
      expect(Object.prototype.hasOwnProperty.call(json, absent)).toBe(false);
    }
  }
  if (Array.isArray(exp["validComponents"])) {
    for (const comp of exp["validComponents"]) {
      catalog.validateComponent(comp);
    }
  }
  if (Array.isArray(exp["invalidComponents"])) {
    for (const comp of exp["invalidComponents"]) {
      let failed = false;
      try {
        catalog.validateComponent(comp);
      } catch {
        failed = true;
      }
      if (!failed) {
        throw new Error(
          `${tcName}: expected invalidComponent ${JSON.stringify(comp)} to fail validation`,
        );
      }
    }
  }
}

function runCatalogCase(
  tc: ConformanceCase,
  files: ReadonlyMap<string, JsonObject>,
): void {
  const expectErr = (tc["expectError"] ?? tc["expect_error"]) as
    | ConformanceExpectError
    | undefined;
  const catalogDoc =
    typeof tc["catalogPath"] === "string"
      ? files.get(tc["catalogPath"])
      : (tc["catalog"] as JsonObject | undefined);
  const catalogId =
    typeof tc["catalogId"] === "string" ? tc["catalogId"] : undefined;
  const protocolVersion =
    typeof tc["protocolVersion"] === "string" ? tc["protocolVersion"] : undefined;

  if (tc.action === "from_json") {
    if (expectErr) {
      let caught: unknown;
      try {
        Catalog.fromJson(catalogDoc, { catalogId, protocolVersion });
      } catch (err) {
        caught = err;
      }
      if (caught === undefined) {
        throw new Error(`${tc.name}: expected error but fromJson succeeded`);
      }
      assertMatchesExpectedError(caught, expectErr, tc.name);
      return;
    }
    const cat = Catalog.fromJson(catalogDoc, { catalogId, protocolVersion });
    const exp = tc["expect"] as Record<string, unknown> | undefined;
    if (exp) {
      assertExpectedCatalogMatches(tc.name, cat, exp);
    }
    return;
  }

  if (tc.action === "to_json") {
    const builtin = Catalog.basicV1();
    const expectedDoc = files.get(tc["expectFile"] as string);
    if (!expectedDoc) {
      throw new Error(`${tc.name}: missing preloaded expectFile`);
    }
    expect(normalizeSchemaForCompare(builtin.toJson())).toEqual(
      normalizeSchemaForCompare(expectedDoc),
    );
    return;
  }

  if (tc.action === "round_trip") {
    if (!catalogDoc) {
      throw new Error(`${tc.name}: missing catalog document`);
    }
    const first = Catalog.fromJson(catalogDoc, { catalogId, protocolVersion });
    const firstJson = first.toJson();
    expect(normalizeSchemaForCompare(firstJson)).toEqual(
      normalizeSchemaForCompare(catalogDoc),
    );
    const second = Catalog.fromJson(firstJson, { catalogId, protocolVersion });
    expect(normalizeSchemaForCompare(second.toJson())).toEqual(
      normalizeSchemaForCompare(firstJson),
    );
    return;
  }

  if (tc.action === "validation_schema") {
    if (!catalogDoc) {
      throw new Error(`${tc.name}: missing catalog document`);
    }
    const expectedDoc = files.get(tc["expectFile"] as string);
    if (!expectedDoc) {
      throw new Error(`${tc.name}: missing preloaded expectFile`);
    }
    const cat = Catalog.fromJson(catalogDoc, { catalogId, protocolVersion });
    expect(normalizeSchemaForCompare(cat.validationSchema)).toEqual(
      normalizeSchemaForCompare(expectedDoc),
    );
    return;
  }

  if (tc.action === "derive") {
    if (!catalogDoc) {
      throw new Error(`${tc.name}: missing source catalog document`);
    }
    const source = Catalog.fromJson(catalogDoc, { catalogId, protocolVersion });
    const args = tc["args"] as {
      catalogId: string;
      components?: (string | Record<string, JsonObject>)[];
      functions?: (string | Record<string, JsonObject>)[];
      instructions?: string;
    };
    if (expectErr) {
      let caught: unknown;
      try {
        source.derive(args);
      } catch (err) {
        caught = err;
      }
      if (caught === undefined) {
        throw new Error(`${tc.name}: expected error but derive succeeded`);
      }
      assertMatchesExpectedError(caught, expectErr, tc.name);
      return;
    }
    const derived = source.derive(args);
    const exp = tc["expect"] as Record<string, unknown> | undefined;
    if (exp) {
      assertExpectedCatalogMatches(tc.name, derived, exp);
    }
    return;
  }

  throw new Error(`Unsupported catalog.yaml action: ${String(tc.action)}`);
}

function runCommonTypesCase(
  tc: ConformanceCase,
  files: ReadonlyMap<string, JsonObject>,
): void {
  if (tc.action === "common_types_schema") {
    const expectedDoc = files.get(tc["expectFile"] as string);
    if (!expectedDoc) {
      throw new Error(`${tc.name}: missing preloaded expectFile`);
    }
    const actual = buildV10CommonTypesSchema();
    expect(canonicalJsonExact(actual)).toBe(canonicalJsonExact(expectedDoc));
    return;
  }

  if (tc.action === "validate_common_type") {
    const defName = tc["definition"] as string;
    const steps = tc["steps"] as readonly {
      value: unknown;
      expectError?: ConformanceExpectError;
    }[];
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i]!;
      if (step.expectError) {
        let caught: unknown;
        try {
          validateV10CommonType(defName, step.value);
        } catch (err) {
          caught = err;
        }
        if (caught === undefined) {
          throw new Error(
            `${tc.name} step ${i}: expected ValidationError for ${JSON.stringify(step.value)}`,
          );
        }
        assertMatchesExpectedError(caught, step.expectError, `${tc.name} step ${i}`);
      } else {
        const result = validateV10CommonType(defName, step.value);
        expect(canonicalJsonExact(result)).toBe(canonicalJsonExact(step.value));
      }
    }
    return;
  }

  throw new Error(`Unsupported common_types.yaml action: ${String(tc.action)}`);
}

function runAgentToRendererCase(
  tc: ConformanceCase,
  files: ReadonlyMap<string, JsonObject>,
): void {
  if (tc.action === "agent_to_renderer_schema") {
    const expectedDoc = files.get(tc["expectFile"] as string);
    if (!expectedDoc) {
      throw new Error(`${tc.name}: missing preloaded expectFile`);
    }
    const actual = buildV10AgentToRendererSchema();
    expect(canonicalJsonExact(actual)).toBe(canonicalJsonExact(expectedDoc));
    return;
  }
  throw new Error(
    `Unsupported agent_to_renderer.yaml action: ${String(tc.action)}`,
  );
}

interface CompositionStep {
  readonly payload: readonly Record<string, unknown>[];
  readonly expectError?: ConformanceExpectError & {
    readonly code?: string;
    readonly surfaceId?: string;
    readonly path?: string;
    readonly details?: readonly {
      readonly path?: string;
      readonly code?: string;
      readonly surfaceId?: string;
    }[];
    readonly rendererError?: {
      readonly version: string;
      readonly error: Record<string, unknown>;
    };
  };
}

function checkOrphansForComposition(
  surfaceId: string,
  components: ReadonlyMap<string, Record<string, unknown>>,
  resolveCatalog: (comp: Record<string, unknown>) => Catalog | undefined,
): void {
  if (!components.has("root")) {
    return;
  }
  const visited = new Set<string>(["root"]);
  const queue = ["root"];
  while (queue.length > 0) {
    const curId = queue.shift()!;
    const comp = components.get(curId);
    if (!comp) {
      continue;
    }
    const refs = extractChildReferences(comp, resolveCatalog(comp));
    for (const ref of refs) {
      if (components.has(ref.childId) && !visited.has(ref.childId)) {
        visited.add(ref.childId);
        queue.push(ref.childId);
      }
    }
  }
  for (const compId of components.keys()) {
    if (!visited.has(compId)) {
      throw new A2uiIntegrityError(
        "INTEGRITY_ERROR",
        `Component '${compId}' is not reachable from 'root'`,
        surfaceId,
      );
    }
  }
}

function assertCompositionErrorMatches(
  err: unknown,
  expected: NonNullable<CompositionStep["expectError"]>,
  label: string,
): void {
  assertMatchesExpectedError(err, expected, label);
  if (expected.code) {
    const actualCode = (err as { code?: string }).code;
    expect(actualCode).toBe(expected.code);
  }
  if (expected.surfaceId !== undefined) {
    const actualSurfaceId = (err as { surfaceId?: string }).surfaceId;
    expect(actualSurfaceId).toBe(expected.surfaceId);
  }
  if (expected.path !== undefined) {
    const actualPath = (err as { path?: string }).path;
    expect(actualPath).toBe(expected.path);
  }
  if (expected.details && err instanceof A2uiValidationError) {
    expect(err.details?.length).toBeGreaterThanOrEqual(expected.details.length);
    for (let i = 0; i < expected.details.length; i += 1) {
      const expDet = expected.details[i]!;
      const actDet = err.details![i]!;
      if (expDet.code !== undefined) expect(actDet.code).toBe(expDet.code);
      if (expDet.path !== undefined) expect(actDet.path).toBe(expDet.path);
      if (expDet.surfaceId !== undefined)
        expect(actDet.surfaceId).toBe(expDet.surfaceId);
    }
  }
  if (expected.rendererError && err instanceof A2uiValidationError) {
    const rendererErr = {
      version: "1.0",
      error: {
        code: err.code,
        surfaceId: err.surfaceId ?? "",
        path: err.path ?? "/",
        message: err.message,
      },
    };
    expect(rendererErr).toEqual(expected.rendererError);
  }
}

function runCompositionConstraintsCase(tc: ConformanceCase): void {
  const registry = CatalogRegistry.withBasicV1();
  registry.registerAlias("basic", BASIC_CATALOG_V1_ID);

  const rawCat = tc["catalog"] as Record<string, unknown> | undefined;
  if (rawCat) {
    const inner = (rawCat["catalogSchema"] ?? rawCat) as Record<string, unknown>;
    if (inner["components"] || inner["catalogId"]) {
      const version =
        typeof rawCat["protocolVersion"] === "string"
          ? rawCat["protocolVersion"]
          : "1.0";
      registry.registerInline(inner, { protocolVersion: version });
    }
  }

  const valCfg = (tc["validationConfig"] ?? {}) as {
    readonly allowOrphanComponents?: boolean;
    readonly allowDanglingReferences?: boolean;
  };
  const allowOrphans = valCfg.allowOrphanComponents === true;

  const surfaces = new Map<
    string,
    { defaultCatalogId?: string; components: Map<string, Record<string, unknown>> }
  >();

  const applyPayload = (payload: readonly Record<string, unknown>[]): void => {
    for (const msg of payload) {
      const cs = msg["createSurface"] as
        | {
            surfaceId: string;
            catalogId?: string;
            components?: readonly Record<string, unknown>[];
          }
        | undefined;
      if (cs) {
        const compMap = new Map<string, Record<string, unknown>>();
        const batchIndices = new Map<string, number>();
        const list = cs.components ?? [];
        for (let i = 0; i < list.length; i += 1) {
          const comp = list[i]!;
          const id = String(comp["id"]);
          compMap.set(id, comp);
          batchIndices.set(id, i);
        }
        const resolveCat = (comp: Record<string, unknown>): Catalog | undefined => {
          const cid =
            typeof comp["@catalogId"] === "string"
              ? comp["@catalogId"]
              : cs.catalogId;
          return cid ? registry.get(cid) : undefined;
        };
        if (!allowOrphans) {
          checkOrphansForComposition(cs.surfaceId, compMap, resolveCat);
        }
        validateCompositionConstraints({
          surfaceId: cs.surfaceId,
          components: compMap,
          batchIndices,
          resolveCatalog: resolveCat,
        });
        surfaces.set(cs.surfaceId, {
          defaultCatalogId: cs.catalogId,
          components: compMap,
        });
        continue;
      }

      const uc = msg["updateComponents"] as
        | {
            surfaceId: string;
            components: readonly Record<string, unknown>[];
          }
        | undefined;
      if (uc) {
        const surface = surfaces.get(uc.surfaceId);
        if (!surface) {
          throw new A2uiIntegrityError(
            "INTEGRITY_ERROR",
            `Surface '${uc.surfaceId}' does not exist`,
            uc.surfaceId,
          );
        }
        const candidate = new Map(surface.components);
        const batchIndices = new Map<string, number>();
        for (let i = 0; i < uc.components.length; i += 1) {
          const comp = uc.components[i]!;
          const id = String(comp["id"]);
          candidate.set(id, comp);
          batchIndices.set(id, i);
        }
        const resolveCat = (comp: Record<string, unknown>): Catalog | undefined => {
          const cid =
            typeof comp["@catalogId"] === "string"
              ? comp["@catalogId"]
              : surface.defaultCatalogId;
          return cid ? registry.get(cid) : undefined;
        };
        if (!allowOrphans) {
          checkOrphansForComposition(uc.surfaceId, candidate, resolveCat);
        }
        validateCompositionConstraints({
          surfaceId: uc.surfaceId,
          components: candidate,
          batchIndices,
          resolveCatalog: resolveCat,
        });
        surface.components = candidate;
      }
    }
  };

  const steps = (tc["steps"] as readonly CompositionStep[]) ?? [];
  const topExpectErr = tc["expectError"] as
    | CompositionStep["expectError"]
    | undefined;

  if (topExpectErr) {
    let caught: unknown;
    try {
      for (const step of steps) {
        applyPayload(step.payload);
      }
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      throw new Error(`${tc.name}: expected error but all steps succeeded`);
    }
    assertCompositionErrorMatches(caught, topExpectErr, tc.name);
    return;
  }

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    if (step.expectError) {
      let caught: unknown;
      try {
        applyPayload(step.payload);
      } catch (err) {
        caught = err;
      }
      if (caught === undefined) {
        throw new Error(`${tc.name} step ${i}: expected error but succeeded`);
      }
      assertCompositionErrorMatches(caught, step.expectError, `${tc.name} step ${i}`);
    } else {
      applyPayload(step.payload);
    }
  }

  const expected = tc["expect"] as
    | {
        surfaces?: Record<
          string,
          { components?: Record<string, Record<string, unknown>> }
        >;
      }
    | undefined;
  if (expected?.surfaces) {
    for (const [surfaceId, surfaceSpec] of Object.entries(expected.surfaces)) {
      const surface = surfaces.get(surfaceId);
      if (!surface) {
        throw new Error(`${tc.name}: expected surface '${surfaceId}' missing`);
      }
      if (surfaceSpec.components) {
        for (const [compId, expectedComp] of Object.entries(
          surfaceSpec.components,
        )) {
          const actual = surface.components.get(compId);
          if (!actual) {
            throw new Error(`${tc.name}: expected component '${compId}' missing`);
          }
          for (const [k, v] of Object.entries(expectedComp)) {
            expect(actual[k]).toEqual(v);
          }
        }
      }
    }
  }
}

describe("C2 conformance — catalogs, common types, agent_to_renderer & composition constraints", () => {
  let client: ConformanceClient;

  beforeAll(async () => {
    client = await ConformanceClient.create();
  });

  test("core/catalog.yaml passes all v1.0 cases", async () => {
    const cases = await client.loadConformanceSuite("core/catalog.yaml");
    const files = await preloadCaseFiles(client, cases, CATALOG_SKIP_TEST_NAMES);
    const records = await client.runSuite(
      "core/catalog.yaml",
      (tc) => runCatalogCase(tc, files),
      CATALOG_SKIP_TEST_NAMES,
    );
    const passed = records.filter((r) => r.status === "passed").length;
    const skipped = records.filter((r) => r.status === "skipped").length;
    expect(passed).toBe(records.length - CATALOG_SKIP_TEST_NAMES.size);
    expect(skipped).toBe(CATALOG_SKIP_TEST_NAMES.size);
  });

  test("core/common_types.yaml passes all v1.0 cases", async () => {
    const cases = await client.loadConformanceSuite("core/common_types.yaml");
    const files = await preloadCaseFiles(
      client,
      cases,
      COMMON_TYPES_SKIP_TEST_NAMES,
    );
    const records = await client.runSuite(
      "core/common_types.yaml",
      (tc) => runCommonTypesCase(tc, files),
      COMMON_TYPES_SKIP_TEST_NAMES,
    );
    expect(records.filter((r) => r.status === "passed").length).toBe(13);
    expect(records.filter((r) => r.status === "skipped").length).toBe(10);
  });

  test("core/agent_to_renderer.yaml passes all v1.0 cases", async () => {
    const cases = await client.loadConformanceSuite(
      "core/agent_to_renderer.yaml",
    );
    const files = await preloadCaseFiles(
      client,
      cases,
      AGENT_TO_RENDERER_SKIP_TEST_NAMES,
    );
    const records = await client.runSuite(
      "core/agent_to_renderer.yaml",
      (tc) => runAgentToRendererCase(tc, files),
      AGENT_TO_RENDERER_SKIP_TEST_NAMES,
    );
    expect(records.filter((r) => r.status === "passed").length).toBe(1);
    expect(records.filter((r) => r.status === "skipped").length).toBe(3);
  });

  test("core/composition_constraints.yaml passes all cases", async () => {
    const records = await client.runSuite(
      "core/composition_constraints.yaml",
      runCompositionConstraintsCase,
      COMPOSITION_CONSTRAINTS_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(10);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });
});
