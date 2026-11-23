import { beforeAll, describe, expect, test } from "nsh/test";
import {
  A2uiCatalogError,
  BASIC_CATALOG_V1_ID,
  Catalog,
  CatalogRegistry,
  isV10ProtocolVersion,
} from "../../src/core/catalog";
import { DataContext, DataModel } from "../../src/core/data_model";
import {
  A2uiExpressionError,
  A2uiValidationError,
} from "../../src/core/expression";
import {
  A2uiFunctionError,
  FunctionRegistry,
  evaluateFunctionCall,
  evaluateSurfaceComponents,
  isValidationResult,
  type EvaluatedComponentNode,
} from "../../src/core/functions";
import type { JsonObject } from "../../src/core/json_schema";
import { MessageProcessor } from "../../src/core/processor";
import {
  ConformanceClient,
  assertMatchesExpectedError,
  type ConformanceCase,
  type ConformanceExpectError,
} from "./harness";

/**
 * Documented skips for `core/functions.yaml`.
 * Per Spec 001 ("Not doing: Protocol v0.8, v0.9, or v0.9.1 backward
 * compatibility"), cases explicitly pinned to `protocolVersion: "v0.9"` are
 * skipped. Every v1.0 and version-neutral case runs and must pass.
 */
export const FUNCTIONS_SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map([
  [
    "test_evaluate_function_regex_v09_rejects_nested_quantifier",
    "v0.9 out of scope (v1.0 only)",
  ],
  [
    "test_evaluate_function_regex_v09_value_exceeding_4096_code_points_returns_false",
    "v0.9 out of scope (v1.0 only)",
  ],
  [
    "test_evaluate_function_length_null_value",
    "v0.9 out of scope (v1.0 only)",
  ],
  [
    "test_evaluate_function_length_null_value_too_short",
    "v0.9 out of scope (v1.0 only)",
  ],
  [
    "test_evaluate_function_not_validation_result_operand_v0_9",
    "v0.9 out of scope (v1.0 only)",
  ],
  [
    "test_evaluate_function_v09_ignores_call_catalog_id",
    "v0.9 out of scope (v1.0 only)",
  ],
]);

/** Skip list for `core/index_function.yaml` (empty: 100% pass). */
export const INDEX_FUNCTION_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map();

/** Skip list for `core/validation_result.yaml` (empty: 100% pass). */
export const VALIDATION_RESULT_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map();

interface ValidateStep {
  readonly payload: unknown;
  readonly expect?: Record<string, unknown>;
  readonly expectError?: ConformanceExpectError;
  readonly expect_error?: ConformanceExpectError;
}

function matchesFunctionErrorCategory(err: unknown, category: string): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  switch (category) {
    case "ExpressionError":
      return (
        err instanceof A2uiFunctionError || err instanceof A2uiExpressionError
      );
    case "CatalogError":
    case "A2uiCatalogError":
      return err instanceof A2uiCatalogError;
    case "ValidationError":
      return err instanceof A2uiValidationError;
    default:
      return true;
  }
}

function assertErrorMatches(
  err: unknown,
  expected: ConformanceExpectError,
  label: string,
): void {
  if (!(err instanceof Error)) {
    throw new Error(`${label}: expected Error, got ${String(err)}`);
  }
  if (expected.category && !matchesFunctionErrorCategory(err, expected.category)) {
    throw new Error(
      `${label}: expected category '${expected.category}', got ${err.name}: ${err.message}`,
    );
  }
  if (expected.message) {
    assertMatchesExpectedError(err, { message: expected.message }, label);
  }
}

async function preloadCatalogFiles(
  client: ConformanceClient,
  cases: readonly ConformanceCase[],
  skips: ReadonlyMap<string, string>,
): Promise<Map<string, JsonObject>> {
  const cache = new Map<string, JsonObject>();
  const root = client.resolveConformanceRoot();
  for (const tc of cases) {
    if (skips.has(tc.name)) {
      continue;
    }
    const paths = tc["catalogPaths"] as readonly string[] | undefined;
    if (Array.isArray(paths)) {
      for (const rel of paths) {
        if (!cache.has(rel)) {
          const text = await client.readTextFile(`${root}/${rel}`);
          cache.set(rel, JSON.parse(text) as JsonObject);
        }
      }
    }
  }
  return cache;
}

function propertyMatches(actual: unknown, expected: unknown): boolean {
  if (
    (actual !== null && typeof actual === "object") ||
    (expected !== null && typeof expected === "object")
  ) {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }
  return String(actual) === String(expected);
}

function assertEvaluatedSurfaces(
  processor: MessageProcessor,
  expected: Record<string, unknown>,
  label: string,
): void {
  const surfacesSpec = expected["surfaces"] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!surfacesSpec) {
    return;
  }
  const fnRegistry = FunctionRegistry.withBasicV1();

  for (const [surfaceId, spec] of Object.entries(surfacesSpec)) {
    const surface = processor.getSurface(surfaceId);
    if (!surface) {
      throw new Error(`${label}: expected surface '${surfaceId}' to exist`);
    }
    const evaluated = evaluateSurfaceComponents(surface, {
      catalogRegistry: processor.registry,
      functionRegistry: fnRegistry,
    });

    if (spec["components"] && typeof spec["components"] === "object") {
      const expComps = spec["components"] as Record<
        string,
        Record<string, unknown>
      >;
      for (const [compId, expComp] of Object.entries(expComps)) {
        const node = evaluated.get(compId);
        if (!node) {
          throw new Error(
            `${label}: surface '${surfaceId}' missing evaluated component '${compId}'`,
          );
        }
        for (const [k, v] of Object.entries(expComp)) {
          if (k === "component") {
            expect(node.type).toBe(v);
          } else {
            const actualVal = node.properties[k];
            if (!propertyMatches(actualVal, v)) {
              throw new Error(
                `${label}: component '${compId}' property '${k}' mismatch: got ${JSON.stringify(actualVal)}, expected ${JSON.stringify(v)}`,
              );
            }
          }
        }
      }
    }

    const getNode = (id: string): EvaluatedComponentNode => {
      const node = evaluated.get(id);
      if (!node) {
        throw new Error(
          `${label}: surface '${surfaceId}' missing evaluated component '${id}'`,
        );
      }
      return node;
    };

    if (spec["isValid"] !== undefined) {
      if (typeof spec["isValid"] === "boolean") {
        expect(getNode("root").validation?.isValid).toBe(spec["isValid"]);
      } else if (typeof spec["isValid"] === "object" && spec["isValid"] !== null) {
        for (const [compId, expVal] of Object.entries(
          spec["isValid"] as Record<string, unknown>,
        )) {
          expect(getNode(compId).validation?.isValid).toBe(expVal);
        }
      }
    }

    if (spec["validationErrors"] !== undefined) {
      if (Array.isArray(spec["validationErrors"])) {
        expect(getNode("root").validation?.validationErrors).toEqual(
          spec["validationErrors"],
        );
      } else if (
        typeof spec["validationErrors"] === "object" &&
        spec["validationErrors"] !== null
      ) {
        for (const [compId, expVal] of Object.entries(
          spec["validationErrors"] as Record<string, unknown>,
        )) {
          expect(getNode(compId).validation?.validationErrors).toEqual(expVal);
        }
      }
    }

    if (spec["validationResults"] !== undefined) {
      if (Array.isArray(spec["validationResults"])) {
        expect(getNode("root").validation?.validationResults).toEqual(
          spec["validationResults"],
        );
      } else if (
        typeof spec["validationResults"] === "object" &&
        spec["validationResults"] !== null
      ) {
        for (const [compId, expVal] of Object.entries(
          spec["validationResults"] as Record<string, unknown>,
        )) {
          expect(getNode(compId).validation?.validationResults).toEqual(expVal);
        }
      }
    }

    if (spec["validationResult"] !== undefined) {
      const vr = spec["validationResult"] as Record<string, unknown>;
      for (const [compId, expVal] of Object.entries(vr)) {
        const actual = getNode(compId).validation?.validationResult as
          | Record<string, unknown>
          | undefined;
        if (!actual || typeof expVal !== "object" || expVal === null) {
          expect(actual).toEqual(expVal);
        } else {
          for (const [field, expectedFieldVal] of Object.entries(
            expVal as Record<string, unknown>,
          )) {
            expect(actual[field]).toEqual(expectedFieldVal);
          }
        }
      }
    }
  }
}

function runValidateCase(tc: ConformanceCase): void {
  const registry = new CatalogRegistry();
  const basic = Catalog.basicV1();
  registry.register(basic);
  registry.registerAlias("basic", basic.catalogId);
  registry.registerAlias(
    "https://a2ui.org/catalogs/basic/v1/catalog.json",
    basic.catalogId,
  );

  const processor = new MessageProcessor({ registry, strictMode: true });
  const steps = (tc["steps"] as readonly ValidateStep[] | undefined) ?? [];

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    const expectErr = step.expectError ?? step.expect_error;
    if (expectErr) {
      let caught: unknown;
      try {
        processor.processMessages(step.payload);
        // Trigger runtime evaluation so runtime errors (e.g. @index outside loop) fire.
        for (const surface of processor.surfaces.values()) {
          evaluateSurfaceComponents(surface, {
            catalogRegistry: processor.registry,
            functionRegistry: FunctionRegistry.withBasicV1(),
          });
        }
      } catch (err) {
        caught = err;
      }
      if (caught === undefined) {
        throw new Error(`${tc.name} step ${i}: expected error but succeeded`);
      }
      assertErrorMatches(caught, expectErr, `${tc.name} step ${i}`);
      continue;
    }

    processor.processMessages(step.payload);
    if (step.expect) {
      assertEvaluatedSurfaces(processor, step.expect, `${tc.name} step ${i}`);
    }
  }

  if (tc["expect"]) {
    assertEvaluatedSurfaces(
      processor,
      tc["expect"] as Record<string, unknown>,
      tc.name,
    );
  }
}

function runEvaluateFunctionCase(
  tc: ConformanceCase,
  files: ReadonlyMap<string, JsonObject>,
): void {
  const fnName = String(tc["function"]);
  const args = (tc["args"] ?? {}) as Record<string, unknown>;
  const expectErr = (tc["expectError"] ?? tc["expect_error"]) as
    | ConformanceExpectError
    | undefined;
  const surfaceSpec = tc["surface"] as { catalogId?: string } | undefined;
  const fnRegistry = FunctionRegistry.withBasicV1();

  if (surfaceSpec !== undefined) {
    const registry = new CatalogRegistry();
    const catalogPaths = (tc["catalogPaths"] as readonly string[] | undefined) ?? [];
    for (const rel of catalogPaths) {
      const doc = files.get(rel);
      if (!doc) {
        throw new Error(`${tc.name}: missing preloaded catalog '${rel}'`);
      }
      const ver =
        typeof doc["protocolVersion"] === "string"
          ? doc["protocolVersion"]
          : "1.0";
      if (!isV10ProtocolVersion(ver)) {
        // Non-v1.0 catalogs are never available on a v1.0 surface.
        continue;
      }
      const cat = Catalog.fromJson(doc);
      registry.register(cat);
    }

    const model = new DataModel(tc["dataModel"] ?? {});
    const ctx = new DataContext(model, "/");
    const callObj: {
      readonly "@call": string;
      readonly args: Record<string, unknown>;
      readonly catalogId?: string;
    } =
      typeof tc["catalogId"] === "string"
        ? { "@call": fnName, args, catalogId: tc["catalogId"] }
        : { "@call": fnName, args };

    const execute = (): unknown =>
      evaluateFunctionCall(callObj, {
        dataContext: ctx,
        surfaceId: "main",
        surfaceDefaultCatalogId: surfaceSpec.catalogId,
        catalogRegistry: registry,
        functionRegistry: fnRegistry,
        userActivation: true,
        openUrl: () => {},
      });

    if (expectErr) {
      let caught: unknown;
      try {
        execute();
      } catch (err) {
        caught = err;
      }
      if (caught === undefined) {
        throw new Error(`${tc.name}: expected error but succeeded`);
      }
      assertErrorMatches(caught, expectErr, tc.name);
      return;
    }

    const result = execute();
    const actualJson =
      result === undefined ? null : JSON.parse(JSON.stringify(result));
    expect(actualJson).toEqual(tc["expect"]);
    return;
  }

  // Direct standalone evaluation (without a surface block).
  const model = new DataModel(tc["dataModel"] ?? {});
  const ctx = new DataContext(model, "/");
  const execute = (): unknown =>
    evaluateFunctionCall(
      { "@call": fnName, args },
      {
        dataContext: ctx,
        functionRegistry: fnRegistry,
        userActivation: true,
        openUrl: () => {},
      },
    );

  if (expectErr) {
    let caught: unknown;
    try {
      execute();
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      throw new Error(`${tc.name}: expected error but succeeded`);
    }
    assertErrorMatches(caught, expectErr, tc.name);
    return;
  }

  const result = execute();
  const actualJson =
    result === undefined ? null : JSON.parse(JSON.stringify(result));
  const expected = tc["expect"];

  if (expected !== undefined) {
    if (
      expected !== null &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      Object.keys(expected).length === 1 &&
      "valid" in expected &&
      isValidationResult(actualJson)
    ) {
      expect(actualJson.valid).toBe((expected as { valid: boolean }).valid);
    } else if (
      typeof expected === "boolean" &&
      tc["protocolVersion"] === undefined &&
      isValidationResult(actualJson)
    ) {
      // Version-neutral validator cases in upstream functions.yaml expect a
      // boolean; v1.0 validators return ValidationResult({ valid, ... }).
      expect(actualJson.valid).toBe(expected);
    } else {
      expect(actualJson).toEqual(expected);
    }
  }
}

describe("C4 conformance — standard functions, @index & ValidationResult", () => {
  let client: ConformanceClient;

  beforeAll(async () => {
    client = await ConformanceClient.create();
  });

  test("core/functions.yaml passes all v1.0 & version-neutral cases", async () => {
    const cases = await client.loadConformanceSuite("core/functions.yaml");
    const files = await preloadCatalogFiles(
      client,
      cases,
      FUNCTIONS_SKIP_TEST_NAMES,
    );
    const records = await client.runSuite(
      "core/functions.yaml",
      (tc) => {
        if (tc.action === "evaluate_function") {
          runEvaluateFunctionCase(tc, files);
        } else if (tc.action === "validate") {
          runValidateCase(tc);
        } else {
          throw new Error(`Unexpected action in functions.yaml: ${String(tc.action)}`);
        }
      },
      FUNCTIONS_SKIP_TEST_NAMES,
    );
    const passed = records.filter((r) => r.status === "passed").length;
    const skipped = records.filter((r) => r.status === "skipped").length;
    expect(skipped).toBe(FUNCTIONS_SKIP_TEST_NAMES.size);
    expect(passed).toBe(records.length - FUNCTIONS_SKIP_TEST_NAMES.size);
  });

  test("core/index_function.yaml passes all cases", async () => {
    const records = await client.runSuite(
      "core/index_function.yaml",
      runValidateCase,
      INDEX_FUNCTION_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(4);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("core/validation_result.yaml passes all cases", async () => {
    const records = await client.runSuite(
      "core/validation_result.yaml",
      runValidateCase,
      VALIDATION_RESULT_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(6);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });
});
