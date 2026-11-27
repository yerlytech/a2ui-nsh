import { describe, expect, test } from "nsh/test";
import {
  A2uiCatalogError,
  BASIC_CATALOG_V1_ID,
  Catalog,
  CatalogRegistry,
} from "../catalog";
import { DataContext, DataModel } from "../data_model";
import type { ComponentModel, SurfaceModel } from "../processor";
import { formatStringFunction } from "./basic_functions";
import {
  evaluateComponentChecks,
  evaluateDynamicValue,
  evaluateFunctionCall,
  evaluateSurfaceComponents,
} from "./evaluator";
import { FunctionRegistry } from "./registry";
import {
  A2uiFunctionError,
  type FunctionExecutionContext,
  type FunctionImplementation,
} from "./types";

// One rule per test for src/core/functions/evaluator.ts. The broad scenarios
// live in evaluator.test.ts; this file pins each rule on its own by driving the
// private helpers through the four exported entry points and small registries.

const CATALOG_A = "https://example.com/catalogs/a/v1/catalog.json";
const CATALOG_B = "https://example.com/catalogs/b/v1/catalog.json";

interface Recorded {
  readonly args: Readonly<Record<string, unknown>>;
  readonly context: FunctionExecutionContext;
}

interface ImplOptions {
  readonly tag?: unknown;
  readonly allowedCallers?: FunctionImplementation["allowedCallers"];
  readonly requiresUserActivation?: boolean;
}

/** An implementation that records each call and returns tag (default name). */
function impl(
  name: string,
  calls: Recorded[],
  options: ImplOptions = {},
): FunctionImplementation {
  return {
    name,
    returnType: "any",
    allowedCallers: options.allowedCallers ?? "rendererOnly",
    requiresUserActivation: options.requiresUserActivation ?? false,
    execute: (args, context) => {
      calls.push({ args, context });
      return options.tag !== undefined ? options.tag : name;
    },
  };
}

/** A v1.0 function declaration whose args follow argProps. */
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

function nestedNot(depth: number, value: unknown): Record<string, unknown> {
  let call: unknown = value;
  for (let i = 0; i < depth; i += 1) {
    call = { "@call": "not", args: { value: call } };
  }
  return call as Record<string, unknown>;
}

/** Outer function the agent may call that renders ${...} via formatString. */
function templateWrapper(calls: Recorded[]): FunctionImplementation {
  return {
    name: "renderTemplate",
    returnType: "string",
    allowedCallers: "rendererOrAgent",
    requiresUserActivation: false,
    execute: (args, context) => {
      calls.push({ args, context });
      return formatStringFunction.execute(args, context);
    },
  };
}

describe("DynamicBoolean argument coercion", () => {
  function coercedCalls(
    argProps: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Recorded[] {
    const calls: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, impl("check", calls));
    evaluateFunctionCall(
      { "@call": "check", args },
      ctx({}, {
        catalogRegistry: catalogs(catalog(CATALOG_A, { check: fnDecl(argProps) })),
        surfaceDefaultCatalogId: CATALOG_A,
        functionRegistry,
      }),
    );
    return calls;
  }

  test("a direct DynamicBoolean ref is coerced", () => {
    const calls = coercedCalls(
      { flag: { $ref: "#/$defs/DynamicBoolean" } },
      { flag: "TRUE" },
    );
    expect(calls[0]?.args).toEqual({ flag: true });
  });

  test("a common_types.json DynamicBoolean ref is coerced", () => {
    const calls = coercedCalls(
      { flag: { $ref: "https://a2ui.org/common_types.json#/$defs/DynamicBoolean" } },
      { flag: { valid: true } },
    );
    expect(calls[0]?.args).toEqual({ flag: true });
  });

  test("an array of DynamicBoolean refs is coerced element by element", () => {
    const calls = coercedCalls(
      { flags: { type: "array", items: { $ref: "#/$defs/DynamicBoolean" } } },
      { flags: ["true", 0, 1, { valid: true }, null] },
    );
    expect(calls[0]?.args).toEqual({ flags: [true, false, true, true, false] });
  });

  test("an arg with another schema passes through untouched", () => {
    const calls = coercedCalls(
      { label: { type: "string" }, count: { $ref: "#/$defs/DynamicNumber" } },
      { label: "TRUE", count: 0 },
    );
    expect(calls[0]?.args).toEqual({ label: "TRUE", count: 0 });
  });

  test("an arg the schema does not name passes through untouched", () => {
    const calls = coercedCalls(
      { flag: { $ref: "#/$defs/DynamicBoolean" } },
      { flag: "true", extra: "TRUE" },
    );
    expect(calls[0]?.args).toEqual({ flag: true, extra: "TRUE" });
  });

  test("a function with no schema shape passes args through untouched", () => {
    const schemas = [{}, { properties: {} }, { properties: { args: {} } }];
    for (const schema of schemas) {
      const calls: Recorded[] = [];
      const functionRegistry = new FunctionRegistry();
      functionRegistry.register(CATALOG_A, impl("check", calls));
      evaluateFunctionCall(
        { "@call": "check", args: { flag: "TRUE" } },
        ctx({}, {
          catalogRegistry: catalogs(catalog(CATALOG_A, { check: schema })),
          surfaceDefaultCatalogId: CATALOG_A,
          functionRegistry,
        }),
      );
      expect(calls[0]?.args).toEqual({ flag: "TRUE" });
    }
  });
});

describe("catalog resolution", () => {
  test("an explicit catalogId wins over the surface default", () => {
    const callsA: Recorded[] = [];
    const callsB: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, impl("echo", callsA, { tag: "a" }));
    functionRegistry.register(CATALOG_B, impl("echo", callsB, { tag: "b" }));
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

  test("a template call uses the inherited catalog before the surface default", () => {
    const calls: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, impl("probe", calls, { tag: "from-a" }));
    functionRegistry.register(CATALOG_B, impl("probe", calls, { tag: "from-b" }));
    functionRegistry.register(CATALOG_A, formatStringFunction);
    const result = evaluateFunctionCall(
      { "@call": "formatString", catalogId: CATALOG_A, args: { value: "x=${probe()}" } },
      ctx({}, {
        catalogRegistry: catalogs(
          catalog(CATALOG_A, {
            formatString: fnDecl({ value: { type: "string" } }),
            probe: fnDecl(),
          }),
          catalog(CATALOG_B, { probe: fnDecl() }),
        ),
        surfaceDefaultCatalogId: CATALOG_B,
        functionRegistry,
      }),
    );
    expect(result).toBe("x=from-a");
    expect(calls[0]?.context.inheritedCatalogId).toBe(CATALOG_A);
  });

  test("no target catalog refuses CATALOG_NOT_FOUND naming the surface main", () => {
    const error = thrown(() =>
      evaluateFunctionCall(
        { "@call": "not" },
        ctx({}, { catalogRegistry: catalogs() }),
      ),
    );
    expect(error instanceof A2uiCatalogError).toBe(true);
    expect((error as A2uiCatalogError).code).toBe("CATALOG_NOT_FOUND");
    expect((error as A2uiCatalogError).surfaceId).toBe("main");
    expect((error as A2uiCatalogError).message).toContain("main");
  });

  test("an unknown catalog id refuses CATALOG_NOT_FOUND", () => {
    expect(
      catalogErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "not", catalogId: CATALOG_B },
          ctx({}, {
            catalogRegistry: catalogs(),
            surfaceDefaultCatalogId: BASIC_CATALOG_V1_ID,
          }),
        ),
      ),
    ).toBe("CATALOG_NOT_FOUND");
  });

  test("a catalog that is not v1.0 refuses CATALOG_NOT_FOUND", () => {
    expect(
      catalogErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "echo", catalogId: CATALOG_A },
          ctx({}, {
            catalogRegistry: catalogs(catalog(CATALOG_A, { echo: fnDecl() }, "v0.9")),
            surfaceDefaultCatalogId: BASIC_CATALOG_V1_ID,
          }),
        ),
      ),
    ).toBe("CATALOG_NOT_FOUND");
  });
});

describe("call policies", () => {
  function policyContext(
    decl: Record<string, unknown>,
    overrides: Partial<FunctionExecutionContext>,
    implOptions: ImplOptions = {},
  ): FunctionExecutionContext {
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, impl("act", [], implOptions));
    return ctx({}, {
      catalogRegistry: catalogs(catalog(CATALOG_A, { act: decl })),
      surfaceDefaultCatalogId: CATALOG_A,
      functionRegistry,
      ...overrides,
    });
  }

  test("the renderer cannot call an agentOnly function", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "act" },
          policyContext(fnDecl({}, { allowedCallers: "agentOnly" }), { caller: "renderer" }),
        ),
      ),
    ).toBe("EXPRESSION_ERROR");
  });

  test("the agent cannot call a rendererOnly function", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "act" },
          policyContext(fnDecl(), { caller: "agent" }),
        ),
      ),
    ).toBe("INVALID_FUNCTION_CALL");
  });

  test("the agent needs userActivation true for a function that requires it", () => {
    const calls: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, templateWrapper(calls));
    functionRegistry.register(
      CATALOG_A,
      impl("gesture", calls, {
        allowedCallers: "rendererOrAgent",
        requiresUserActivation: true,
      }),
    );
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "renderTemplate", catalogId: CATALOG_A, args: { value: "${gesture()}" } },
          ctx({}, {
            caller: "agent",
            catalogRegistry: catalogs(
              catalog(CATALOG_A, { renderTemplate: fnDecl({ value: { type: "string" } }, { allowedCallers: "rendererOrAgent" }) }),
            ),
            surfaceDefaultCatalogId: CATALOG_A,
            functionRegistry,
          }),
        ),
      ),
    ).toBe("INVALID_FUNCTION_CALL");
  });

  test("the renderer with userActivation false gets USER_ACTIVATION_REQUIRED", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "act" },
          policyContext(
            fnDecl({}, { requiresUserActivation: true }),
            { caller: "renderer", userActivation: false },
          ),
        ),
      ),
    ).toBe("USER_ACTIVATION_REQUIRED");
  });

  test("the renderer with userActivation undefined is allowed", () => {
    const calls: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, impl("act", calls, { tag: "ran" }));
    expect(
      evaluateFunctionCall(
        { "@call": "act" },
        ctx({}, {
          caller: "renderer",
          catalogRegistry: catalogs(
            catalog(CATALOG_A, { act: fnDecl({}, { requiresUserActivation: true }) }),
          ),
          surfaceDefaultCatalogId: CATALOG_A,
          functionRegistry,
        }),
      ),
    ).toBe("ran");
  });

  test("the caller defaults to renderer", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "act" },
          policyContext(fnDecl({}, { allowedCallers: "agentOnly" }), {}),
        ),
      ),
    ).toBe("EXPRESSION_ERROR");
    expect(
      evaluateFunctionCall(
        { "@call": "act" },
        policyContext(fnDecl(), {}),
      ),
    ).toBe("act");
  });
});

describe("lookup and dispatch", () => {
  test("depth over limits.maxCallDepth fails and exactly at the limit succeeds", () => {
    const limits = { maxCallDepth: 3 };
    expect(
      evaluateFunctionCall(nestedNot(3, true) as never, ctx({}, { limits })),
    ).toBe(false);
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(nestedNot(4, true) as never, ctx({}, { limits })),
      ),
    ).toBe("EXPRESSION_ERROR");
  });

  test("system functions are catalogless: unknown refuses and known runs", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "@nope" },
          ctx({}, { catalogRegistry: catalogs() }),
        ),
      ),
    ).toBe("UNKNOWN_FUNCTION");
    expect(
      evaluateFunctionCall({ "@call": "@index" }, ctx({}, { collectionIndices: [2] })),
    ).toBe(2);
  });

  test("an undeclared function is refused to the renderer but runs for the agent", () => {
    function run(caller: "renderer" | "agent"): unknown {
      const calls: Recorded[] = [];
      const functionRegistry = new FunctionRegistry();
      functionRegistry.register(CATALOG_A, templateWrapper(calls));
      functionRegistry.register(
        CATALOG_A,
        impl("ghost", calls, { allowedCallers: "rendererOrAgent", tag: "G" }),
      );
      return evaluateFunctionCall(
        { "@call": "renderTemplate", catalogId: CATALOG_A, args: { value: "x${ghost()}" } },
        ctx({}, {
          caller,
          catalogRegistry: catalogs(
            catalog(CATALOG_A, { renderTemplate: fnDecl({ value: { type: "string" } }, { allowedCallers: "rendererOrAgent" }) }),
          ),
          surfaceDefaultCatalogId: CATALOG_A,
          functionRegistry,
        }),
      );
    }
    expect(functionErrorCode(() => run("renderer"))).toBe("EXPRESSION_ERROR");
    expect(run("agent")).toBe("xG");
  });

  test("a declared function with no implementation is UNKNOWN_FUNCTION", () => {
    expect(
      functionErrorCode(() =>
        evaluateFunctionCall(
          { "@call": "echo" },
          ctx({}, {
            catalogRegistry: catalogs(catalog(CATALOG_A, { echo: fnDecl() })),
            surfaceDefaultCatalogId: CATALOG_A,
            functionRegistry: new FunctionRegistry(),
          }),
        ),
      ),
    ).toBe("UNKNOWN_FUNCTION");
  });

  test("Basic Catalog v1 falls back to the default implementation registry", () => {
    expect(
      evaluateFunctionCall(
        { "@call": "not", catalogId: BASIC_CATALOG_V1_ID, args: { value: false } },
        ctx({}, {
          catalogRegistry: catalogs(),
          surfaceDefaultCatalogId: CATALOG_A,
          functionRegistry: new FunctionRegistry(),
        }),
      ),
    ).toBe(true);
  });

  test("without a CatalogRegistry an unknown function refuses and a custom catalogId falls back to Basic v1", () => {
    expect(
      functionErrorCode(() => evaluateFunctionCall({ "@call": "nope" }, ctx())),
    ).toBe("UNKNOWN_FUNCTION");
    expect(
      evaluateFunctionCall(
        { "@call": "not", catalogId: CATALOG_B, args: { value: true } },
        ctx(),
      ),
    ).toBe(false);
  });

  test("the callee sees the inherited catalog and the incremented call depth", () => {
    const calls: Recorded[] = [];
    const functionRegistry = new FunctionRegistry();
    functionRegistry.register(CATALOG_A, impl("echo", calls));
    evaluateFunctionCall(
      { "@call": "echo" },
      ctx({}, {
        callDepth: 3,
        catalogRegistry: catalogs(catalog(CATALOG_A, { echo: fnDecl() })),
        surfaceDefaultCatalogId: CATALOG_A,
        functionRegistry,
      }),
    );
    expect(calls[0]?.context.inheritedCatalogId).toBe(CATALOG_A);
    expect(calls[0]?.context.callDepth).toBe(4);
  });
});

describe("dynamic values, checks and surfaces", () => {
  test("a literal passes through evaluateDynamicValue", () => {
    const context = ctx();
    expect(evaluateDynamicValue("text", context)).toBe("text");
    expect(evaluateDynamicValue(42, context)).toBe(42);
    expect(evaluateDynamicValue(false, context)).toBe(false);
    expect(evaluateDynamicValue(null, context)).toBe(null);
    expect(evaluateDynamicValue(undefined, context)).toBe(undefined);
  });

  test("a binding and a nested @call are resolved", () => {
    expect(
      evaluateDynamicValue(
        {
          name: { "@path": "/name" },
          flag: { "@call": "not", args: { value: false } },
        },
        ctx({ name: "Ada" }),
      ),
    ).toEqual({ name: "Ada", flag: true });
  });

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

  function surface(data: unknown, components: ComponentModel[]): SurfaceModel {
    return {
      id: "main",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
      dataModel: new DataModel(data),
      components: new Map(components.map((c) => [c.id, c])),
    } as unknown as SurfaceModel;
  }

  test("template children expand once per list item", () => {
    const result = evaluateSurfaceComponents(
      surface({ items: [{ name: "Ada" }, { name: "Bo" }] }, [
        component("root", "List", {
          children: { path: "/items", componentId: "row" },
        }),
        component("row", "Card", { child: "label" }),
        component("label", "Text", { text: { "@path": "name" } }),
      ]),
    );
    expect(result.get("root")?.properties["children"]).toEqual(["row_0", "row_1"]);
    expect(result.get("label_0")?.properties["text"]).toBe("Ada");
    expect(result.get("label_1")?.properties["text"]).toBe("Bo");
  });

  test("direct child ids come from child, children, trigger, content and tabs", () => {
    const result = evaluateSurfaceComponents(
      surface({}, [
        component("root", "Card", {
          child: "a",
          children: ["b", 7, "c"],
          trigger: "d",
          content: "e",
          tabs: [{ child: "f" }, { child: 8 }, "ignored"],
        }),
        component("a", "Text", { text: "a" }),
        component("b", "Text", { text: "b" }),
        component("c", "Text", { text: "c" }),
        component("d", "Text", { text: "d" }),
        component("e", "Text", { text: "e" }),
        component("f", "Text", { text: "f" }),
      ]),
    );
    for (const id of ["root", "a", "b", "c", "d", "e", "f"]) {
      expect(result.has(id)).toBe(true);
    }
    expect(result.size).toBe(7);
  });

  test("a failing check gives its message", () => {
    const state = evaluateComponentChecks(
      [{ condition: false, message: "Name is required" }],
      ctx(),
    );
    expect(state.isValid).toBe(false);
    expect(state.validationErrors).toEqual(["Name is required"]);
    expect(state.validationResult).toEqual({
      valid: false,
      message: "Name is required",
      severity: "error",
    });
  });
});
