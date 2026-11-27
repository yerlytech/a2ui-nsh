import { describe, expect, test } from "nsh/test";
import {
  A2uiCatalogError,
  BASIC_CATALOG_V1_ID,
  Catalog,
  CatalogRegistry,
} from "../catalog";
import { DataContext, DataModel } from "../data_model";
import type { ComponentModel, SurfaceModel } from "../processor";
import {
  evaluateComponentChecks,
  evaluateDynamicValue,
  evaluateFunctionCall,
  evaluateSurfaceComponents,
} from "./evaluator";
import { FunctionRegistry } from "./registry";
import {
  A2uiFunctionError,
  DEFAULT_FUNCTION_EVAL_LIMITS,
  type FunctionExecutionContext,
  type FunctionImplementation,
} from "./types";

const CATALOG_A = "https://example.com/catalogs/a/v1/catalog.json";
const CATALOG_B = "https://example.com/catalogs/b/v1/catalog.json";

interface Recorded {
  readonly args: Readonly<Record<string, unknown>>;
  readonly context: FunctionExecutionContext;
}

/** An implementation that records each call and returns `tag`. */
function recorder(
  name: string,
  calls: Recorded[],
  tag: unknown = name,
): FunctionImplementation {
  return {
    name,
    returnType: "any",
    allowedCallers: "rendererOnly",
    requiresUserActivation: false,
    execute: (args, context) => {
      calls.push({ args, context });
      return tag;
    },
  };
}

/** A v1.0 function declaration whose `args` follow `argProps`. */
function fnDecl(
  argProps: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      args: { type: "object", properties: argProps },
    },
    ...extra,
  };
}

function catalog(
  catalogId: string,
  functions: Record<string, unknown>,
  protocolVersion = "v1.0",
): Catalog {
  return Catalog.fromJson({ catalogId, protocolVersion, components: {}, functions });
}

function catalogs(...entries: Catalog[]): CatalogRegistry {
  const registry = CatalogRegistry.withBasicV1();
  for (const entry of entries) {
    registry.register(entry);
  }
  return registry;
}

function ctx(
  data: unknown = {},
  overrides: Partial<FunctionExecutionContext> = {},
): FunctionExecutionContext {
  return {
    dataContext: new DataContext(new DataModel(data), "/"),
    functionRegistry: FunctionRegistry.withBasicV1(),
    ...overrides,
  };
}

/** Runs `fn` and returns what it threw (or `undefined`). */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

function functionErrorCode(fn: () => unknown): string | undefined {
  const error = thrown(fn);
  expect(error instanceof A2uiFunctionError).toBe(true);
  return (error as A2uiFunctionError).code;
}

function catalogErrorCode(fn: () => unknown): string | undefined {
  const error = thrown(fn);
  expect(error instanceof A2uiCatalogError).toBe(true);
  return (error as A2uiCatalogError).code;
}

/** `not(not(...(value)))`, `depth` calls deep. */
function nestedNot(depth: number, value: unknown): Record<string, unknown> {
  let call: unknown = value;
  for (let i = 0; i < depth; i += 1) {
    call = { "@call": "not", args: { value: call } };
  }
  return call as Record<string, unknown>;
}

describe("evaluateFunctionCall catalog routing", () => {
  test("routes a call without catalogId to the surface's default catalog", () => {
    const calls: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, recorder("echo", calls, "a"));
    const result = evaluateFunctionCall(
      { "@call": "echo" },
      ctx({}, {
        catalogRegistry: catalogs(catalog(CATALOG_A, { echo: fnDecl() })),
        surfaceDefaultCatalogId: CATALOG_A,
        functionRegistry,
      }),
    );
    expect(result).toBe("a");
    expect(calls.length).toBe(1);
    expect(calls[0]?.context.inheritedCatalogId).toBe(CATALOG_A);
  });

  test("an explicit catalogId wins over the surface default", () => {
    const callsA: Recorded[] = [];
    const callsB: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, recorder("echo", callsA, "a"));
    functionRegistry.register(CATALOG_B, recorder("echo", callsB, "b"));
    const result = evaluateFunctionCall(
      { "@call": "echo", catalogId: CATALOG_B },
      ctx({}, {
        catalogRegistry: catalogs(
          catalog(CATALOG_A, { echo: fnDecl() }),
          catalog(CATALOG_B, { echo: fnDecl() }),
        ),
        surfaceDefaultCatalogId: CATALOG_A,
        functionRegistry,
      }),
    );
    expect(result).toBe("b");
    expect(callsA.length).toBe(0);
    expect(callsB[0]?.context.inheritedCatalogId).toBe(CATALOG_B);
  });

  test("the basic catalog uses the built-in implementations when the registry lacks them", () => {
    const result = evaluateFunctionCall(
      { "@call": "not", catalogId: BASIC_CATALOG_V1_ID, args: { value: false } },
      ctx({}, {
        catalogRegistry: catalogs(catalog(CATALOG_A, { echo: fnDecl() })),
        surfaceDefaultCatalogId: CATALOG_A,
        functionRegistry: new FunctionRegistry(),
      }),
    );
    expect(result).toBe(true);
  });

  test("without a catalog registry a call resolves in the basic catalog", () => {
    const calls: Recorded[] = [];
    const result = evaluateFunctionCall(
      { "@call": "not", args: { value: true } },
      ctx({}, { functionRegistry: new FunctionRegistry() }),
    );
    expect(result).toBe(false);

    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, recorder("echo", calls, "a"));
    expect(
      evaluateFunctionCall(
        { "@call": "echo", catalogId: CATALOG_A },
        ctx({}, { functionRegistry }),
      ),
    ).toBe("a");
    expect(calls[0]?.context.inheritedCatalogId).toBe(CATALOG_A);
  });

  test("without a catalog registry an unknown catalogId falls back to the basic catalog", () => {
    expect(
      evaluateFunctionCall(
        { "@call": "not", catalogId: CATALOG_B, args: { value: true } },
        ctx(),
      ),
    ).toBe(false);
  });

  test("without a catalog registry an unknown function is UNKNOWN_FUNCTION", () => {
    expect(
      functionErrorCode(() => evaluateFunctionCall({ "@call": "nope" }, ctx())),
    ).toBe("UNKNOWN_FUNCTION");
  });

  test("a function the named catalog does not declare is refused", () => {
    const functionRegistry = FunctionRegistry.withBasicV1();
    functionRegistry.register(BASIC_CATALOG_V1_ID, recorder("echo", []));
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "echo" },
          ctx({}, {
            catalogRegistry: catalogs(),
            surfaceDefaultCatalogId: BASIC_CATALOG_V1_ID,
            functionRegistry,
          }),
        ),
      ),
    ).toBe("EXPRESSION_ERROR");
  });

  test("an undeclared function is refused before its arguments run", () => {
    const calls: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, recorder("echo", calls));
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "missing", args: { value: { "@call": "echo" } } },
          ctx({}, {
            catalogRegistry: catalogs(catalog(CATALOG_A, { echo: fnDecl() })),
            surfaceDefaultCatalogId: CATALOG_A,
            functionRegistry,
          }),
        ),
      ),
    ).toBe("EXPRESSION_ERROR");
    expect(calls.length).toBe(0);
  });

  test("a declared function with no implementation is UNKNOWN_FUNCTION", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "echo" },
          ctx({}, {
            catalogRegistry: catalogs(catalog(CATALOG_A, { echo: fnDecl() })),
            surfaceDefaultCatalogId: CATALOG_A,
          }),
        ),
      ),
    ).toBe("UNKNOWN_FUNCTION");
  });

  test("an unregistered catalogId is CATALOG_NOT_FOUND", () => {
    expect(
      catalogErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "not", catalogId: CATALOG_B, args: { value: true } },
          ctx({}, {
            catalogRegistry: catalogs(),
            surfaceDefaultCatalogId: BASIC_CATALOG_V1_ID,
          }),
        ),
      ),
    ).toBe("CATALOG_NOT_FOUND");
  });

  test("a surface with no default catalog and no catalogId is CATALOG_NOT_FOUND", () => {
    const error = thrown(() =>
      evaluateFunctionCall(
        { "@call": "not", args: { value: true } },
        ctx({}, { catalogRegistry: catalogs(), surfaceId: "orders" }),
      ),
    );
    expect(error instanceof A2uiCatalogError).toBe(true);
    expect((error as A2uiCatalogError).code).toBe("CATALOG_NOT_FOUND");
    expect((error as A2uiCatalogError).surfaceId).toBe("orders");
  });

  test("a registered catalog that is not v1.0 is CATALOG_NOT_FOUND", () => {
    expect(
      catalogErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "echo", catalogId: CATALOG_A },
          ctx({}, {
            catalogRegistry: catalogs(
              catalog(CATALOG_A, { echo: fnDecl() }, "v0.9"),
            ),
            surfaceDefaultCatalogId: BASIC_CATALOG_V1_ID,
          }),
        ),
      ),
    ).toBe("CATALOG_NOT_FOUND");
  });

  test("an unknown system function is UNKNOWN_FUNCTION", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "@nope" },
          ctx({}, { catalogRegistry: catalogs(), surfaceDefaultCatalogId: BASIC_CATALOG_V1_ID }),
        ),
      ),
    ).toBe("UNKNOWN_FUNCTION");
  });
});

describe("evaluateFunctionCall call policies from the catalog", () => {
  function policyContext(
    decl: Record<string, unknown>,
    overrides: Partial<FunctionExecutionContext>,
  ): FunctionExecutionContext {
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, recorder("act", []));
    return ctx({}, {
      catalogRegistry: catalogs(catalog(CATALOG_A, { act: decl })),
      surfaceDefaultCatalogId: CATALOG_A,
      functionRegistry,
      ...overrides,
    });
  }

  test("an agentOnly function is refused to the renderer", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "act" },
          policyContext(fnDecl({}, { allowedCallers: "agentOnly" }), {}),
        ),
      ),
    ).toBe("EXPRESSION_ERROR");
  });

  test("a rendererOnly function is refused to the agent with INVALID_FUNCTION_CALL", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "act" },
          policyContext(fnDecl(), { caller: "agent" }),
        ),
      ),
    ).toBe("INVALID_FUNCTION_CALL");
  });

  test("a requiresUserActivation function fails without user activation", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "act" },
          policyContext(fnDecl({}, { requiresUserActivation: true }), {
            userActivation: false,
          }),
        ),
      ),
    ).toBe("USER_ACTIVATION_REQUIRED");
  });
});

describe("evaluateFunctionCall argument resolution", () => {
  function echoContext(
    calls: Recorded[],
    data: unknown = {},
    overrides: Partial<FunctionExecutionContext> = {},
  ): FunctionExecutionContext {
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, recorder("echo", calls));
    return ctx(data, {
      catalogRegistry: catalogs(catalog(CATALOG_A, { echo: fnDecl() })),
      surfaceDefaultCatalogId: CATALOG_A,
      functionRegistry,
      ...overrides,
    });
  }

  test("a data-binding argument is read from the data model", () => {
    const calls: Recorded[] = [];
    evaluateFunctionCall(
      { "@call": "echo", args: { name: { "@path": "/customer/name" } } },
      echoContext(calls, { customer: { name: "Ada" } }),
    );
    expect(calls[0]?.args).toEqual({ name: "Ada" });
  });

  test("a relative binding resolves against the data context's base path", () => {
    const calls: Recorded[] = [];
    const base = echoContext(calls, { rows: [{ name: "Ada" }, { name: "Bo" }] });
    evaluateFunctionCall(
      { "@call": "echo", args: { name: { "@path": "name" } } },
      { ...base, dataContext: new DataContext(base.dataContext.model, "/rows/1") },
    );
    expect(calls[0]?.args).toEqual({ name: "Bo" });
  });

  test("a nested function call argument is evaluated before the outer call", () => {
    const calls: Recorded[] = [];
    evaluateFunctionCall(
      {
        "@call": "echo",
        args: {
          flag: { "@call": "not", catalogId: BASIC_CATALOG_V1_ID, args: { value: true } },
        },
      },
      echoContext(calls),
    );
    expect(calls[0]?.args).toEqual({ flag: false });
  });

  test("a nested call does not inherit the outer call's catalogId", () => {
    const callsA: Recorded[] = [];
    const callsB: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, recorder("echo", callsA, "from-a"));
    functionRegistry.register(CATALOG_B, recorder("echo", callsB, "from-b"));
    evaluateFunctionCall(
      { "@call": "echo", catalogId: CATALOG_B, args: { inner: { "@call": "echo" } } },
      ctx({}, {
        catalogRegistry: catalogs(
          catalog(CATALOG_A, { echo: fnDecl() }),
          catalog(CATALOG_B, { echo: fnDecl() }),
        ),
        surfaceDefaultCatalogId: CATALOG_A,
        functionRegistry,
      }),
    );
    expect(callsA.length).toBe(1);
    expect(callsB[0]?.args).toEqual({ inner: "from-a" });
  });

  test("an @@-escaped key inside an argument is unescaped once and not evaluated", () => {
    const calls: Recorded[] = [];
    evaluateFunctionCall(
      {
        "@call": "echo",
        args: { options: { "@@path": "/literal", "@@@call": "kept" } },
      },
      echoContext(calls, { literal: "resolved" }),
    );
    expect(calls[0]?.args).toEqual({
      options: { "@path": "/literal", "@@call": "kept" },
    });
  });
});

describe("evaluateFunctionCall DynamicBoolean argument coercion", () => {
  function coerced(
    argProps: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Readonly<Record<string, unknown>> | undefined {
    const calls: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, recorder("check", calls));
    evaluateFunctionCall(
      { "@call": "check", args },
      ctx({}, {
        catalogRegistry: catalogs(catalog(CATALOG_A, { check: fnDecl(argProps) })),
        surfaceDefaultCatalogId: CATALOG_A,
        functionRegistry,
      }),
    );
    return calls[0]?.args;
  }

  test("a #/$defs/DynamicBoolean argument is coerced to a boolean", () => {
    const props = { flag: { $ref: "#/$defs/DynamicBoolean" } };
    expect(coerced(props, { flag: "TRUE" })).toEqual({ flag: true });
    expect(coerced(props, { flag: { valid: false, message: "no" } })).toEqual({
      flag: false,
    });
    expect(coerced(props, { flag: 0 })).toEqual({ flag: false });
  });

  test("a common_types.json DynamicBoolean argument is coerced to a boolean", () => {
    const props = { flag: { $ref: "common_types.json#/$defs/DynamicBoolean" } };
    expect(coerced(props, { flag: "true" })).toEqual({ flag: true });
    expect(coerced(props, { flag: null })).toEqual({ flag: false });
  });

  test("an array of DynamicBoolean is coerced element by element", () => {
    const props = {
      flags: { type: "array", items: { $ref: "#/$defs/DynamicBoolean" } },
    };
    expect(coerced(props, { flags: ["true", 0, 1, { valid: true }] })).toEqual({
      flags: [true, false, true, true],
    });
  });

  test("an array-of-DynamicBoolean argument that is not an array is passed through", () => {
    const props = {
      flags: { type: "array", items: { $ref: "#/$defs/DynamicBoolean" } },
    };
    expect(coerced(props, { flags: "true" })).toEqual({ flags: "true" });
  });

  test("an argument with another schema is passed through untouched", () => {
    const props = {
      label: { type: "string" },
      count: { $ref: "#/$defs/DynamicNumber" },
    };
    expect(coerced(props, { label: "TRUE", count: 0 })).toEqual({
      label: "TRUE",
      count: 0,
    });
  });

  test("an argument the schema does not name is passed through untouched", () => {
    const props = { flag: { $ref: "#/$defs/DynamicBoolean" } };
    expect(coerced(props, { flag: "true", extra: "true" })).toEqual({
      flag: true,
      extra: "true",
    });
  });

  test("without a catalog registry no schema coercion happens", () => {
    const calls: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, recorder("check", calls));
    evaluateFunctionCall(
      { "@call": "check", catalogId: CATALOG_A, args: { flag: "TRUE" } },
      ctx({}, { functionRegistry }),
    );
    expect(calls[0]?.args).toEqual({ flag: "TRUE" });
  });
});

describe("evaluateFunctionCall evaluation limits", () => {
  test("the default call depth limit is 32 and frozen", () => {
    expect(DEFAULT_FUNCTION_EVAL_LIMITS.maxCallDepth).toBe(32);
    expect(Object.isFrozen(DEFAULT_FUNCTION_EVAL_LIMITS)).toBe(true);
  });

  test("nesting up to the default depth evaluates", () => {
    const call = nestedNot(DEFAULT_FUNCTION_EVAL_LIMITS.maxCallDepth, true);
    expect(evaluateFunctionCall(call as never, ctx())).toBe(true);
  });

  test("nesting one past the default depth is an EXPRESSION_ERROR", () => {
    const call = nestedNot(DEFAULT_FUNCTION_EVAL_LIMITS.maxCallDepth + 1, true);
    expect(
      functionErrorCode(() => evaluateFunctionCall(call as never, ctx())),
    ).toBe("EXPRESSION_ERROR");
  });

  test("a lower maxCallDepth limit stops nesting sooner", () => {
    const limits = { maxCallDepth: 2 };
    expect(
      evaluateFunctionCall(nestedNot(2, true) as never, ctx({}, { limits })),
    ).toBe(true);
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(nestedNot(3, true) as never, ctx({}, { limits })),
      ),
    ).toBe("EXPRESSION_ERROR");
  });

  test("a context already at the depth limit refuses the next call", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "not", args: { value: true } },
          ctx({}, { callDepth: DEFAULT_FUNCTION_EVAL_LIMITS.maxCallDepth }),
        ),
      ),
    ).toBe("EXPRESSION_ERROR");
  });
});

describe("evaluateDynamicValue", () => {
  test("returns literals unchanged", () => {
    const context = ctx();
    expect(evaluateDynamicValue("text", context)).toBe("text");
    expect(evaluateDynamicValue(42, context)).toBe(42);
    expect(evaluateDynamicValue(false, context)).toBe(false);
    expect(evaluateDynamicValue(null, context)).toBe(null);
    expect(evaluateDynamicValue(undefined, context)).toBe(undefined);
  });

  test("reads a data binding", () => {
    expect(
      evaluateDynamicValue({ "@path": "/order/total" }, ctx({ order: { total: 12 } })),
    ).toBe(12);
  });

  test("runs a function call", () => {
    expect(
      evaluateDynamicValue({ "@call": "not", args: { value: false } }, ctx()),
    ).toBe(true);
  });

  test("a binding to a missing path is undefined", () => {
    expect(evaluateDynamicValue({ "@path": "/missing/deep" }, ctx({}))).toBe(
      undefined,
    );
  });

  test("evaluates every element of an array and every value of an object", () => {
    expect(
      evaluateDynamicValue(
        { name: { "@path": "/name" }, list: [1, { "@path": "/name" }] },
        ctx({ name: "Ada" }),
      ),
    ).toEqual({ name: "Ada", list: [1, "Ada"] });
  });
});

describe("evaluateComponentChecks", () => {
  test("all passing checks give a valid state with no results", () => {
    const state = evaluateComponentChecks(
      [
        { condition: true },
        { condition: { "@call": "not", args: { value: { "@path": "/empty" } } } },
      ],
      ctx({ empty: false }),
    );
    expect(state).toEqual({
      isValid: true,
      validationErrors: [],
      validationResults: [],
    });
    expect("validationResult" in state).toBe(false);
  });

  test("a failing check reports its message, results and first failure", () => {
    const state = evaluateComponentChecks(
      [
        { condition: { "@path": "/accepted" }, message: "Accept the terms" },
        { condition: true },
      ],
      ctx({ accepted: false }),
    );
    const failure = { valid: false, message: "Accept the terms", severity: "error" };
    expect(state).toEqual({
      isValid: false,
      validationErrors: ["Accept the terms"],
      validationResults: [failure],
      validationResult: failure,
    });
  });

  test("a validation result from a function keeps its code and severity", () => {
    const state = evaluateComponentChecks(
      [{ condition: { "@path": "/warn" } }],
      ctx({ warn: { valid: false, code: "LOW", message: "Low stock", severity: "warning" } }),
    );
    expect(state.isValid).toBe(true);
    expect(state.validationErrors).toEqual([]);
    expect(state.validationResult).toEqual({
      valid: false,
      code: "LOW",
      message: "Low stock",
      severity: "warning",
    });
  });
});

describe("evaluateSurfaceComponents", () => {
  const basic = Catalog.basicV1();

  function component(
    id: string,
    type: string,
    properties: Record<string, unknown>,
    checks?: readonly unknown[],
  ): ComponentModel {
    return {
      id,
      type,
      catalogId: BASIC_CATALOG_V1_ID,
      catalog: basic,
      properties,
      checks,
      normalizedWire: {},
    };
  }

  /** Only the fields `evaluateSurfaceComponents` reads are real. */
  function surface(data: unknown, components: ComponentModel[]): SurfaceModel {
    return {
      id: "main",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
      dataModel: new DataModel(data),
      components: new Map(components.map((c) => [c.id, c])),
    } as unknown as SurfaceModel;
  }

  test("a template expands once per list item with the item's data context", () => {
    const result = evaluateSurfaceComponents(
      surface({ items: [{ name: "Ada" }, { name: "Bo" }] }, [
        component("root", "List", {
          children: { path: "/items", componentId: "row" },
        }),
        component("row", "Card", { child: "label" }),
        component("label", "Text", {
          text: { "@path": "name" },
          index: { "@call": "@index" },
        }),
      ]),
    );
    expect(result.get("root")?.properties["children"]).toEqual(["row_0", "row_1"]);
    expect(result.get("label_0")?.properties).toEqual({ text: "Ada", index: 0 });
    expect(result.get("label_1")?.properties).toEqual({ text: "Bo", index: 1 });
    expect(result.get("row_1")?.type).toBe("Card");
    expect(result.has("row")).toBe(false);
    expect(result.has("label")).toBe(false);
  });

  test("an empty list expands to nothing", () => {
    const result = evaluateSurfaceComponents(
      surface({ items: [] }, [
        component("root", "List", {
          children: { path: "/items", componentId: "row" },
        }),
        component("row", "Text", { text: { "@path": "name" } }),
      ]),
    );
    expect(result.get("root")?.properties["children"]).toEqual([]);
    expect(Array.from(result.keys())).toEqual(["root"]);
  });

  test("a template over a missing list expands to nothing", () => {
    const result = evaluateSurfaceComponents(
      surface({}, [
        component("root", "List", {
          children: { path: "/items", componentId: "row" },
        }),
        component("row", "Text", { text: "x" }),
      ]),
    );
    expect(result.get("root")?.properties["children"]).toEqual([]);
    expect(result.size).toBe(1);
  });

  test("a missing child is skipped silently and still named by its parent", () => {
    const result = evaluateSurfaceComponents(
      surface({}, [
        component("root", "Column", { children: ["title", "ghost"] }),
        component("title", "Text", { text: "Hello" }),
      ]),
    );
    expect(result.get("root")?.properties["children"]).toEqual(["title", "ghost"]);
    expect(result.has("title")).toBe(true);
    expect(result.has("ghost")).toBe(false);
    expect(result.size).toBe(2);
  });

  test("a component with checks carries its validation state", () => {
    const result = evaluateSurfaceComponents(
      surface({ name: "" }, [
        component(
          "root",
          "TextField",
          { value: { "@path": "/name" } },
          [{ condition: { "@path": "/name" }, message: "Name is required" }],
        ),
      ]),
    );
    expect(result.get("root")?.validation?.isValid).toBe(false);
    expect(result.get("root")?.validation?.validationErrors).toEqual([
      "Name is required",
    ]);
  });

  test("a component without checks has no validation state", () => {
    const result = evaluateSurfaceComponents(
      surface({}, [component("root", "Text", { text: "Hi" })]),
    );
    expect(result.get("root")?.validation).toBe(undefined);
  });

  test("without a root every component is evaluated at the top level", () => {
    const result = evaluateSurfaceComponents(
      surface({ greeting: "Hi" }, [
        component("a", "Text", { text: { "@path": "/greeting" } }),
        component("b", "Text", { text: "static" }),
      ]),
    );
    expect(result.get("a")?.properties["text"]).toBe("Hi");
    expect(result.get("b")?.properties["text"]).toBe("static");
  });
});
