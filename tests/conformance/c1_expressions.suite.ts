import { beforeAll, describe, expect, test } from "nsh/test";
import { DataContext, DataModel } from "../../src/core/data_model";
import {
  A2uiExpressionError,
  A2uiValidationError,
  isV1FunctionCall,
  joinExpressionLiterals,
  parseExpressionTemplate,
  unescapeDynamicValue,
  validateReservedKeysInComponent,
  type ExpressionPart,
} from "../../src/core/expression";
import {
  A2uiFunctionError,
  FunctionRegistry,
  evaluateDynamicValue,
} from "../../src/core/functions";
import {
  ConformanceClient,
  assertMatchesExpectedError,
  type ConformanceCase,
  type ConformanceExpectError,
} from "./harness";

/**
 * Transition skip list for `core/expressions.yaml` (empty: 100% pass).
 * Any entry not present in the YAML file fails the suite (no stale skips).
 */
export const EXPRESSIONS_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map();

/** Transition skip list for `core/reserved_keys.yaml` (empty: 100% pass). */
export const RESERVED_KEYS_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map();

interface SurfaceMessage {
  readonly version: string;
  readonly createSurface?: {
    readonly surfaceId: string;
    readonly catalogId?: string;
    readonly dataModel?: unknown;
    readonly components?: readonly Record<string, unknown>[];
  };
}

interface ValidateStep {
  readonly payload: readonly SurfaceMessage[];
  readonly expectError?: ConformanceExpectError;
  readonly expect_error?: ConformanceExpectError;
}

function runParseExpressionTemplateCase(tc: ConformanceCase): void {
  const input = tc["input"] as string;
  const expectErr = (tc["expect_error"] ?? tc["expectError"]) as
    | ConformanceExpectError
    | undefined;

  if (expectErr) {
    let caught: unknown;
    try {
      parseExpressionTemplate(input);
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      throw new Error(
        `${tc.name}: expected parse error (${expectErr.category ?? ""}) but succeeded`,
      );
    }
    assertMatchesExpectedError(caught, expectErr, tc.name);
    return;
  }

  const parsed = parseExpressionTemplate(input);
  const actual = joinExpressionLiterals(parsed);
  expect(actual).toEqual(tc["expect"] as ExpressionPart[]);
}

function evaluateFormatStringSurfaceMessages(
  surfaces: Map<
    string,
    { model: DataModel; components: Map<string, Record<string, unknown>> }
  >,
  messages: readonly SurfaceMessage[],
): void {
  for (const msg of messages) {
    const cs = msg.createSurface;
    if (!cs) {
      throw new Error(`Unsupported message in expressions validate case`);
    }
    const model = new DataModel(cs.dataModel ?? {});
    const ctx = new DataContext(model);
    const components = new Map<string, Record<string, unknown>>();
    for (const comp of cs.components ?? []) {
      validateReservedKeysInComponent(comp);
      const evaluated: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(comp)) {
        if (
          isV1FunctionCall(v) &&
          v["@call"] === "formatString" &&
          v.args &&
          typeof v.args["value"] === "string"
        ) {
          try {
            evaluated[k] = evaluateDynamicValue(v, {
              dataContext: ctx,
              functionRegistry: FunctionRegistry.withBasicV1(),
            });
          } catch (err) {
            if (
              err instanceof A2uiExpressionError ||
              err instanceof A2uiFunctionError
            ) {
              throw new A2uiValidationError("VALIDATION_FAILED", err.message);
            }
            throw err;
          }
        } else {
          evaluated[k] = v;
        }
      }
      components.set(String(comp["id"]), evaluated);
    }
    surfaces.set(cs.surfaceId, { model, components });
  }
}

function runExpressionsCase(tc: ConformanceCase): void {
  if (tc.action === "parse_expression_template") {
    runParseExpressionTemplateCase(tc);
    return;
  }
  if (tc.action === "validate") {
    const surfaces = new Map<
      string,
      { model: DataModel; components: Map<string, Record<string, unknown>> }
    >();
    const steps = (tc["steps"] as readonly ValidateStep[] | undefined) ?? [];
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i]!;
      const expectErr = step.expectError ?? step.expect_error;
      if (expectErr) {
        let caught: unknown;
        try {
          evaluateFormatStringSurfaceMessages(surfaces, step.payload);
        } catch (err) {
          caught = err;
        }
        if (caught === undefined) {
          throw new Error(
            `${tc.name} step ${i}: expected error (${expectErr.category ?? ""}) but succeeded`,
          );
        }
        assertMatchesExpectedError(caught, expectErr, `${tc.name} step ${i}`);
        continue;
      }
      evaluateFormatStringSurfaceMessages(surfaces, step.payload);
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
          throw new Error(`${tc.name}: surface "${surfaceId}" missing`);
        }
        if (surfaceSpec.components) {
          for (const [compId, expectedComp] of Object.entries(
            surfaceSpec.components,
          )) {
            const actualComp = surface.components.get(compId);
            if (!actualComp) {
              throw new Error(`${tc.name}: component "${compId}" missing`);
            }
            for (const [prop, expectedVal] of Object.entries(expectedComp)) {
              expect(actualComp[prop]).toEqual(expectedVal);
            }
          }
        }
      }
    }
    return;
  }
  throw new Error(`Unexpected action in expressions.yaml: ${String(tc.action)}`);
}

function validateAndUnescapeComponents(
  messages: readonly SurfaceMessage[],
): Map<string, Record<string, unknown>[]> {
  const surfaces = new Map<string, Record<string, unknown>[]>();
  for (const msg of messages) {
    const cs = msg.createSurface;
    if (!cs) {
      throw new Error("Unsupported message in reserved_keys case");
    }
    const out: Record<string, unknown>[] = [];
    for (const comp of cs.components ?? []) {
      validateReservedKeysInComponent(comp);
      const nextComp: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(comp)) {
        if (
          k === "id" ||
          k === "component" ||
          k.startsWith("@")
        ) {
          nextComp[k] = v;
        } else {
          nextComp[k] = unescapeDynamicValue(v);
        }
      }
      out.push(nextComp);
    }
    surfaces.set(cs.surfaceId, out);
  }
  return surfaces;
}

function runReservedKeysCase(tc: ConformanceCase): void {
  const expectErr = (tc["expectError"] ?? tc["expect_error"]) as
    | ConformanceExpectError
    | undefined;
  const messages = (tc["payload"] ?? tc["messages"]) as
    | readonly SurfaceMessage[]
    | undefined;
  if (!messages) {
    throw new Error(`${tc.name}: missing payload/messages`);
  }

  if (expectErr) {
    let caught: unknown;
    try {
      validateAndUnescapeComponents(messages);
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      throw new Error(
        `${tc.name}: expected error (${expectErr.category ?? ""}) but succeeded`,
      );
    }
    assertMatchesExpectedError(caught, expectErr, tc.name);
    return;
  }

  const surfaces = validateAndUnescapeComponents(messages);
  const expected = tc["expect"] as
    | {
        surfaces?: Record<
          string,
          { components?: readonly Record<string, unknown>[] }
        >;
      }
    | undefined;
  if (expected?.surfaces) {
    for (const [surfaceId, surfaceSpec] of Object.entries(expected.surfaces)) {
      const actualComps = surfaces.get(surfaceId);
      if (!actualComps) {
        throw new Error(`${tc.name}: expected surface "${surfaceId}" missing`);
      }
      if (surfaceSpec.components) {
        expect(actualComps).toEqual(surfaceSpec.components);
      }
    }
  }
}

describe("C1 conformance — expressions & reserved keys", () => {
  let client: ConformanceClient;

  beforeAll(async () => {
    client = await ConformanceClient.create();
  });

  test("core/expressions.yaml passes all cases", async () => {
    const records = await client.runSuite(
      "core/expressions.yaml",
      runExpressionsCase,
      EXPRESSIONS_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(98);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("core/reserved_keys.yaml passes all cases", async () => {
    const records = await client.runSuite(
      "core/reserved_keys.yaml",
      runReservedKeysCase,
      RESERVED_KEYS_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(10);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });
});
