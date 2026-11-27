import { beforeAll, describe, expect, test } from "nsh/test";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  CatalogRegistry,
  buildV10BasicCatalogDocument,
} from "../../src/core/catalog";
import { A2uiValidationError } from "../../src/core/expression";
import {
  FunctionRegistry,
  formatStringFunction,
  type FunctionImplementation,
} from "../../src/core/functions";
import type { JsonObject } from "../../src/core/json_schema";
import { MessageProcessor } from "../../src/core/processor";
import {
  A2uiRpcError,
  ReactiveCheckEvaluation,
  ReactiveEvaluation,
  canonicalJson,
  type CallAgentFunctionPayload,
  type OutboundRpcMessage,
  type RendererFunctionResponseEnvelope,
} from "../../src/core/rpc";
import type { DispatchedActionEnvelope } from "../../src/core/actions";
import type { RendererErrorEnvelope } from "../../src/core/validator";
import {
  ConformanceClient,
  assertMatchesExpectedError,
  type ConformanceCase,
  type ConformanceExpectError,
} from "./harness";

/**
 * Documented skips for `core/actions.yaml`.
 * Spec 001 is v1.0-only ("Not doing: Protocol v0.8, v0.9, or v0.9.1 backward
 * compatibility"). These three legacy cases have no `protocolVersion` and rely
 * on v0.9 `{ path }` binding syntax or direct action-name shorthand.
 */
export const ACTIONS_SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map([
  [
    "test_action_event_with_data_binding",
    "Uses v0.9 { path } binding syntax; v0.9 out of scope (v1.0 only)",
  ],
  [
    "test_action_event_with_relative_scope",
    "Uses v0.9 { path } binding syntax; v0.9 out of scope (v1.0 only)",
  ],
  [
    "test_action_direct_name_shorthand",
    "Tests v0.9 direct action name shorthand; v0.9 out of scope (v1.0 only)",
  ],
]);

/** Skip list for `core/rpc_functions.yaml` (empty: 100% pass). */
export const RPC_FUNCTIONS_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map();

/**
 * Documented skips for `core/agent_function_routing.yaml`.
 * - `test_agent_routing_pre_v1_surface_is_not_routed` targets v0.9 (out of scope).
 * - `test_agent_routing_cancelled_call_is_sent_again_when_its_value_is_rewritten`
 *   is the documented mutually-exclusive alternative to
 *   `test_agent_routing_cancelled_call_is_sent_again_on_unrelated_change` for
 *   cores whose `DataModel` suppresses equal-value notifications (per
 *   `conformance/README.md`).
 */
export const AGENT_ROUTING_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map([
    [
      "test_agent_routing_pre_v1_surface_is_not_routed",
      "v0.9 surface out of scope (v1.0 only)",
    ],
    [
      "test_agent_routing_cancelled_call_is_sent_again_when_its_value_is_rewritten",
      "DataModel suppresses equal-value notifications; core runs test_agent_routing_cancelled_call_is_sent_again_on_unrelated_change instead",
    ],
  ]);

const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

async function flushMicrotasks(turns = 8): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

// ---------------------------------------------------------------------------
// 1. core/actions.yaml runner (`dispatch_action`)
// ---------------------------------------------------------------------------

function buildActionsTestFunctionRegistry(): FunctionRegistry {
  const fnReg = FunctionRegistry.withBasicV1();

  const incrementCounter: FunctionImplementation = {
    name: "incrementCounter",
    returnType: "void",
    allowedCallers: "rendererOnly",
    requiresUserActivation: false,
    execute: (args, ctx) => {
      const path = typeof args["path"] === "string" ? args["path"] : "/count";
      const step = typeof args["step"] === "number" ? args["step"] : 1;
      const prev = ctx.dataContext.get(path);
      const current = typeof prev === "number" ? prev : 0;
      ctx.dataContext.set(path, current + step);
      return null;
    },
  };

  const failingAction: FunctionImplementation = {
    name: "failingAction",
    returnType: "void",
    allowedCallers: "rendererOnly",
    requiresUserActivation: false,
    execute: () => {
      throw new Error("failingAction intentionally failed");
    },
  };

  fnReg.register(BASIC_CATALOG_V1_ID, incrementCounter);
  fnReg.register(BASIC_CATALOG_V1_ID, failingAction);
  return fnReg;
}

async function runDispatchActionCase(tc: ConformanceCase): Promise<void> {
  const registry = CatalogRegistry.withBasicV1();
  registry.registerAlias("basic", BASIC_CATALOG_V1_ID);
  registry.registerAlias(
    "https://a2ui.org/catalogs/basic/v1/catalog.json",
    BASIC_CATALOG_V1_ID,
  );

  const dispatched: DispatchedActionEnvelope[] = [];
  const emittedErrors: RendererErrorEnvelope[] = [];

  const processor = new MessageProcessor({
    registry,
    functionRegistry: buildActionsTestFunctionRegistry(),
    strictMode: false,
    openUrl: () => {},
    onAction: (env) => dispatched.push(env),
    onError: (env) => emittedErrors.push(env),
  });

  const surfaceId =
    typeof tc["surfaceId"] === "string" ? tc["surfaceId"] : "main_surface";
  const sourceComponentId =
    typeof tc["sourceComponentId"] === "string"
      ? tc["sourceComponentId"]
      : "action_component";

  processor.processMessages([
    {
      version: "1.0",
      createSurface: {
        surfaceId,
        catalogId: BASIC_CATALOG_V1_ID,
        dataModel: (tc["dataModel"] as Record<string, unknown>) ?? {},
      },
    },
  ]);

  const expectError = (tc["expectError"] ?? tc["expect_error"]) as
    | (ConformanceExpectError & {
        readonly code?: string;
        readonly surfaceId?: string;
      })
    | undefined;

  let thrownError: unknown;
  try {
    await processor.dispatchAction({
      surfaceId,
      sourceComponentId,
      actionPayload: tc["actionPayload"],
      scope: typeof tc["scope"] === "string" ? tc["scope"] : "/",
      metadata: tc["metadata"],
      userActivation:
        typeof tc["userActivation"] === "boolean"
          ? tc["userActivation"]
          : true,
    });
  } catch (err) {
    thrownError = err;
  }

  if (expectError?.category) {
    if (thrownError === undefined) {
      throw new Error(
        `${tc.name}: expected ${expectError.category} to be thrown, but dispatch succeeded`,
      );
    }
    assertMatchesExpectedError(thrownError, expectError, tc.name);
    expect(dispatched.length).toBe(0);
    return;
  }

  if (thrownError !== undefined) {
    throw thrownError;
  }

  if (expectError) {
    if (emittedErrors.length === 0) {
      throw new Error(
        `${tc.name}: expected surface error ${JSON.stringify(expectError)}, got none`,
      );
    }
    const errEnv = emittedErrors[0]!;
    if (expectError.code !== undefined) {
      expect(errEnv.error.code).toBe(expectError.code);
    }
    if (expectError.surfaceId !== undefined) {
      const actSid =
        "surfaceId" in errEnv.error ? errEnv.error.surfaceId : undefined;
      expect(actSid).toBe(expectError.surfaceId);
    }
    if (expectError.message !== undefined) {
      expect(
        errEnv.error.message
          .toLowerCase()
          .includes(expectError.message.toLowerCase()),
      ).toBe(true);
    }
  } else if (emittedErrors.length > 0) {
    throw new Error(
      `${tc.name}: unexpected error emitted: ${JSON.stringify(emittedErrors)}`,
    );
  }

  const expectDispatched = tc["expectDispatched"];
  if (expectDispatched === null) {
    expect(dispatched.length).toBe(0);
  } else if (expectDispatched && typeof expectDispatched === "object") {
    const exp = expectDispatched as Record<string, unknown>;
    expect(dispatched.length).toBe(1);
    const actual = dispatched[0]!;
    expect(actual.version).toBe("1.0");
    expect(actual.action.name).toBe(exp["name"]);
    if (exp["surfaceId"] !== undefined) {
      expect(actual.action.surfaceId).toBe(exp["surfaceId"]);
    }
    if (exp["sourceComponentId"] !== undefined) {
      expect(actual.action.sourceComponentId).toBe(exp["sourceComponentId"]);
    }
    if (exp["timestampIso8601"] === true) {
      expect(ISO_8601_RE.test(actual.action.timestamp)).toBe(true);
    }
    if (exp["context"] !== undefined) {
      expect(actual.action.context).toEqual(exp["context"]);
    }
    if (exp["userMessage"] !== undefined) {
      expect(actual.action.userMessage).toBe(exp["userMessage"]);
    }
    if (Object.prototype.hasOwnProperty.call(exp, "metadata")) {
      if (exp["metadata"] === null) {
        expect(actual.action.metadata).toBeUndefined();
      } else {
        expect(actual.action.metadata).toEqual(exp["metadata"]);
      }
    }
  }

  if (tc["expectDataModel"] !== undefined) {
    const surface = processor.getSurface(surfaceId);
    expect(surface?.dataModel.get("/")).toEqual(tc["expectDataModel"]);
  }
}

// ---------------------------------------------------------------------------
// 2. core/rpc_functions.yaml runner (`handle_rpc`)
// ---------------------------------------------------------------------------

function makeRpcCatalog(
  catalogId: string,
  protocolVersion: string,
  extraComponents?: JsonObject,
): Catalog {
  return Catalog.fromJson({
    catalogId,
    protocolVersion,
    ...(extraComponents ? { components: extraComponents } : {}),
  });
}

function buildRpcFunctionImpl(
  fnName: string,
  meta: Record<string, unknown>,
): FunctionImplementation {
  const allowedCallers =
    (meta["allowedCallers"] as
      | "rendererOnly"
      | "agentOnly"
      | "rendererOrAgent"
      | undefined) ?? "rendererOnly";
  const requiresUserActivation = meta["requiresUserActivation"] === true;
  const parametersSchema = meta["parameters"] as JsonObject | undefined;

  return {
    name: fnName,
    returnType: "any",
    allowedCallers,
    requiresUserActivation,
    parametersSchema,
    execute: (args, ctx) => {
      switch (fnName) {
        case "playMedia":
          return { playing: true, timestamp: 0 };
        case "openExternalUrl":
          return { opened: true };
        case "failingFunction":
          throw new Error("Simulated runtime failure");
        case "syncState":
          return undefined;
        case "echoArgs":
          return { ...args };
        case "calculateTax":
          return Number(args["amount"] ?? 0) * 0.1;
        // Test doubles named by core/rpc_functions.yaml; upstream's harnesses
        // give each the same behavior.
        case "renderTemplate":
          return formatStringFunction.execute(args, ctx);
        case "tagValue":
          if (!("value" in args)) {
            throw new Error("Missing required 'value' argument.");
          }
          return `tagged:${String(args["value"])}`;
        case "secretRendererOnly":
          return "SECRET";
        case "agentSecret":
          return "AGENT_OK";
        default:
          return { ...args };
      }
    },
  };
}

async function runRpcUiBindingScenario(
  tc: ConformanceCase,
  scenario: Record<string, unknown>,
  exp: Record<string, unknown>,
): Promise<void> {
  const surfaceId = String(scenario["surfaceId"]);
  const catalogId = String(scenario["catalogId"]);
  const basicDoc = buildV10BasicCatalogDocument();
  const storeCatalog = Catalog.fromJson({
    ...basicDoc,
    catalogId,
  });

  const registry = new CatalogRegistry();
  registry.register(Catalog.basicV1());
  registry.register(storeCatalog);

  const outbound: OutboundRpcMessage[] = [];
  const errors: RendererErrorEnvelope[] = [];

  const processor = new MessageProcessor({
    registry,
    functionRegistry: FunctionRegistry.withBasicV1(),
    strictMode: false,
    onOutbound: (msg) => outbound.push(msg),
    onError: (env) => errors.push(env),
  });

  const components = Array.isArray(scenario["components"])
    ? (scenario["components"] as Record<string, unknown>[])
    : [scenario["component"] as Record<string, unknown>];

  processor.processMessages([
    {
      version: "1.0",
      createSurface: {
        surfaceId,
        catalogId,
        components,
      },
    },
  ]);

  const surface = processor.getSurface(surfaceId)!;
  const singleComp = scenario["component"] as Record<string, unknown> | undefined;
  const rawChecks = (singleComp?.["checks"] ??
    singleComp?.["@checks"]) as
    | readonly { condition: unknown; message?: string }[]
    | undefined;

  if (rawChecks && rawChecks.length > 0) {
    const rule = rawChecks[0]!;
    const checkEval = processor.evaluateCheckRule(
      surfaceId,
      rule.condition,
      rule.message,
    );
    await flushMicrotasks();

    expect(outbound.length).toBe(1);
    const sent = outbound[0]!;
    expect("callAgentFunction" in sent).toBe(true);
    if (!("callAgentFunction" in sent)) return;

    const expCall = exp["outboundCall"] as {
      version: string;
      callAgentFunction: {
        surfaceId: string;
        callFunction: Record<string, unknown>;
      };
    };
    expect(sent.version).toBe(expCall.version);
    expect(sent.callAgentFunction.surfaceId).toBe(
      expCall.callAgentFunction.surfaceId,
    );
    expect(sent.callAgentFunction.callFunction).toEqual(
      expCall.callAgentFunction.callFunction,
    );

    const callId = sent.callAgentFunction.functionCallId;
    const responsePayload =
      scenario["inboundResponseError"] !== undefined
        ? {
            version: "1.0",
            agentFunctionResponse: {
              functionCallId: callId,
              error: scenario["inboundResponseError"],
            },
          }
        : {
            version: "1.0",
            agentFunctionResponse: {
              functionCallId: callId,
              value: scenario["inboundResponseValue"],
            },
          };

    processor.processMessages([responsePayload]);
    await flushMicrotasks();

    if (exp["validationResult"]) {
      expect(checkEval.validationResult).toEqual(exp["validationResult"]);
    }
    if (exp["surfaceError"]) {
      const expErr = exp["surfaceError"] as {
        code: string;
        functionCallId?: string;
      };
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const actualErr = errors[0]!;
      expect(actualErr.error.code).toBe(expErr.code);
      if (expErr.functionCallId === "$outboundCallId") {
        expect(
          "functionCallId" in actualErr.error
            ? actualErr.error.functionCallId
            : undefined,
        ).toBe(callId);
      }
    }
    checkEval.dispose();
    return;
  }

  const observe = (scenario["observe"] as
    | { componentId: string; property: string }
    | undefined) ?? { componentId: "root", property: "text" };
  const targetComp = surface.components.get(observe.componentId)!;
  const binding = processor.evaluateBinding(
    surfaceId,
    targetComp.properties[observe.property],
  );
  await flushMicrotasks();

  if (Object.prototype.hasOwnProperty.call(exp, "initialValue")) {
    expect(binding.value).toEqual(exp["initialValue"]);
  }

  expect(outbound.length).toBe(1);
  const sent = outbound[0]!;
  expect("callAgentFunction" in sent).toBe(true);
  if (!("callAgentFunction" in sent)) return;

  const expCall = exp["outboundCall"] as {
    version: string;
    callAgentFunction: {
      surfaceId: string;
      callFunction: Record<string, unknown>;
    };
  };
  expect(sent.version).toBe(expCall.version);
  expect(sent.callAgentFunction.surfaceId).toBe(
    expCall.callAgentFunction.surfaceId,
  );
  expect(sent.callAgentFunction.callFunction).toEqual(
    expCall.callAgentFunction.callFunction,
  );

  const callId = sent.callAgentFunction.functionCallId;
  const responsePayload =
    scenario["inboundResponseError"] !== undefined
      ? {
          version: "1.0",
          agentFunctionResponse: {
            functionCallId: callId,
            error: scenario["inboundResponseError"],
          },
        }
      : {
          version: "1.0",
          agentFunctionResponse: {
            functionCallId: callId,
            value: scenario["inboundResponseValue"],
          },
        };

  processor.processMessages([responsePayload]);
  await flushMicrotasks();

  if (Object.prototype.hasOwnProperty.call(exp, "resolvedValue")) {
    expect(binding.value).toEqual(exp["resolvedValue"]);
  }

  if (exp["siblings"]) {
    const expSiblings = exp["siblings"] as Record<
      string,
      Record<string, unknown>
    >;
    for (const [sibId, expProps] of Object.entries(expSiblings)) {
      const sibComp = surface.components.get(sibId);
      if (!sibComp) {
        throw new Error(`${tc.name}: sibling component '${sibId}' missing`);
      }
      for (const [prop, expectedVal] of Object.entries(expProps)) {
        const sibBinding = processor.evaluateBinding(
          surfaceId,
          sibComp.properties[prop],
        );
        expect(sibBinding.value).toEqual(expectedVal);
        sibBinding.dispose();
      }
    }
  }

  if (exp["surfaceError"]) {
    const expErr = exp["surfaceError"] as {
      code: string;
      functionCallId?: string;
    };
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const actualErr = errors[0]!;
    expect(actualErr.error.code).toBe(expErr.code);
    if (expErr.functionCallId === "$outboundCallId") {
      expect(
        "functionCallId" in actualErr.error
          ? actualErr.error.functionCallId
          : undefined,
      ).toBe(callId);
    }
  }

  binding.dispose();
}

async function runRpcUiActionFallbackScenario(
  _tc: ConformanceCase,
  scenario: Record<string, unknown>,
  exp: Record<string, unknown>,
): Promise<void> {
  const surfaceId = String(scenario["surfaceId"]);
  const catalogId = String(scenario["catalogId"]);
  const registry = new CatalogRegistry();
  registry.register(Catalog.basicV1());
  registry.register(makeRpcCatalog(catalogId, "1.0"));

  const fnRegistry = FunctionRegistry.withBasicV1();
  const localFns = scenario["localFunctions"] as
    | Record<
        string,
        {
          returnType?: string;
          effect?: { setData?: { path: string; value: unknown } };
        }
      >
    | undefined;
  if (localFns) {
    for (const [fnName, spec] of Object.entries(localFns)) {
      fnRegistry.register(catalogId, {
        name: fnName,
        returnType:
          (spec.returnType as FunctionImplementation["returnType"]) ?? "any",
        allowedCallers: "rendererOnly",
        requiresUserActivation: false,
        execute: (_args, ctx) => {
          if (spec.effect?.setData) {
            ctx.dataContext.set(
              spec.effect.setData.path,
              spec.effect.setData.value,
            );
          }
          return true;
        },
      });
    }
  }

  const outbound: OutboundRpcMessage[] = [];
  const errors: RendererErrorEnvelope[] = [];

  const processor = new MessageProcessor({
    registry,
    functionRegistry: fnRegistry,
    strictMode: false,
    onOutbound: (msg) => outbound.push(msg),
    onError: (env) => errors.push(env),
  });

  processor.processMessages([
    {
      version: "1.0",
      createSurface: {
        surfaceId,
        catalogId,
      },
    },
  ]);

  const actionPromise = processor.dispatchAction({
    surfaceId,
    sourceComponentId: "action_btn",
    actionPayload: scenario["actionPayload"],
    userActivation: true,
  });

  await flushMicrotasks();

  expect(outbound.length).toBe(1);
  const sent = outbound[0]!;
  expect("callAgentFunction" in sent).toBe(true);
  if (!("callAgentFunction" in sent)) return;

  const expCall = exp["outboundCall"] as {
    version: string;
    callAgentFunction: {
      surfaceId: string;
      callFunction: Record<string, unknown>;
    };
  };
  expect(sent.version).toBe(expCall.version);
  expect(sent.callAgentFunction.surfaceId).toBe(
    expCall.callAgentFunction.surfaceId,
  );
  expect(sent.callAgentFunction.callFunction).toEqual(
    expCall.callAgentFunction.callFunction,
  );

  const callId = sent.callAgentFunction.functionCallId;
  const responseMsg =
    scenario["inboundResponseError"] !== undefined
      ? {
          version: "1.0",
          agentFunctionResponse: {
            functionCallId: callId,
            error: scenario["inboundResponseError"],
          },
        }
      : {
          version: "1.0",
          agentFunctionResponse: {
            functionCallId: callId,
            value: scenario["inboundResponseValue"],
          },
        };

  processor.processMessages([responseMsg]);
  const dispatchResult = await actionPromise;

  if (exp["result"] !== undefined) {
    expect(dispatchResult.kind).toBe("functionCall");
    if (dispatchResult.kind === "functionCall") {
      expect(dispatchResult.value).toEqual(exp["result"]);
    }
  }

  if (exp["dataModel"] !== undefined) {
    expect(processor.getSurface(surfaceId)?.dataModel.get("/")).toEqual(
      exp["dataModel"],
    );
  }

  if (exp["surfaceError"]) {
    const expErr = exp["surfaceError"] as {
      code: string;
      functionCallId?: string;
    };
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const actualErr = errors[0]!;
    expect(actualErr.error.code).toBe(expErr.code);
    if (expErr.functionCallId === "$outboundCallId") {
      expect(
        "functionCallId" in actualErr.error
          ? actualErr.error.functionCallId
          : undefined,
      ).toBe(callId);
    }
  }
}

async function runHandleRpcCase(tc: ConformanceCase): Promise<void> {
  const args = (tc["args"] ?? {}) as Record<string, unknown>;
  const exp = (tc["expect"] ?? {}) as Record<string, unknown>;
  const expectErr = tc["expectError"] as
    | (ConformanceExpectError & {
        readonly code?: string;
        readonly functionCallId?: string;
        readonly rendererError?: {
          readonly version: string;
          readonly error: {
            readonly code?: string;
            readonly functionCallId?: string;
            readonly message?: string;
          };
        };
      })
    | undefined;

  if (args["uiBindingScenario"]) {
    await runRpcUiBindingScenario(
      tc,
      args["uiBindingScenario"] as Record<string, unknown>,
      exp,
    );
    return;
  }

  if (args["uiActionFallbackScenario"]) {
    await runRpcUiActionFallbackScenario(
      tc,
      args["uiActionFallbackScenario"] as Record<string, unknown>,
      exp,
    );
    return;
  }

  // Outbound callAgentFunction lifecycle cases.
  if (args["outboundCall"]) {
    const outbound: OutboundRpcMessage[] = [];
    const hasListener = args["outboundListener"] !== false;

    const processor = new MessageProcessor({
      registry: CatalogRegistry.withBasicV1(),
      strictMode: false,
      onOutbound: hasListener ? (msg) => outbound.push(msg) : undefined,
    });

    const firstReq = args["outboundCall"] as {
      surfaceId: string;
      functionCallId: string;
      timeoutMs?: number;
      callFunction: {
        "@call": string;
        catalogId: string;
        args?: Record<string, unknown>;
      };
    };

    const firstPromise = processor.rpc.callAgentFunction(firstReq);
    let firstError: unknown;
    let firstResult: unknown;
    const firstSettled = firstPromise.then(
      (v) => {
        firstResult = v;
      },
      (err) => {
        firstError = err;
      },
    );

    if (args["secondOutboundCall"]) {
      const secondReq = args["secondOutboundCall"] as typeof firstReq;
      let dupErr: unknown;
      try {
        await processor.rpc.callAgentFunction(secondReq);
      } catch (err) {
        dupErr = err;
      }
      expect(dupErr instanceof A2uiRpcError).toBe(true);
      expect((dupErr as A2uiRpcError).code).toBe(expectErr?.code);
      processor.dispose();
      await firstSettled;
      return;
    }

    if (args["inboundResponse"]) {
      processor.processMessages([args["inboundResponse"]]);
      await firstSettled;
      expect(firstError).toBeUndefined();
      if (exp["correlatedCallId"] !== undefined) {
        expect(outbound.length).toBe(1);
        const sent = outbound[0]!;
        if ("callAgentFunction" in sent) {
          expect(sent.callAgentFunction.functionCallId).toBe(
            exp["correlatedCallId"],
          );
        }
      }
      expect(firstResult).toEqual(exp["result"]);
      return;
    }

    if (args["afterCall"] === "cancel") {
      processor.cancelSurfaceCalls(firstReq.surfaceId);
      await firstSettled;
      expect(firstError instanceof A2uiRpcError).toBe(true);
      expect((firstError as A2uiRpcError).code).toBe(expectErr?.code);
      return;
    }

    if (args["afterCall"] === "dispose") {
      processor.dispose();
      await firstSettled;
      const inFlightExp = exp["inFlightError"] as { code: string } | undefined;
      if (inFlightExp) {
        expect(firstError instanceof A2uiRpcError).toBe(true);
        expect((firstError as A2uiRpcError).code).toBe(inFlightExp.code);
      }

      if (args["lateInboundResponse"]) {
        const lateHandled = processor.rpc.handleAgentFunctionResponse(
          (args["lateInboundResponse"] as { agentFunctionResponse: { functionCallId: string; value?: unknown } })
            .agentFunctionResponse,
        );
        if (exp["lateResponseIgnored"] === true) {
          expect(lateHandled).toBe(false);
        }
      }

      let afterDisposeErr: unknown;
      try {
        await processor.rpc.callAgentFunction({
          ...firstReq,
          functionCallId: `${firstReq.functionCallId}-after`,
        });
      } catch (err) {
        afterDisposeErr = err;
      }
      expect(afterDisposeErr instanceof A2uiRpcError).toBe(true);
      expect((afterDisposeErr as A2uiRpcError).code).toBe(expectErr?.code);
      return;
    }

    if (firstReq.timeoutMs !== undefined) {
      await sleepMs(firstReq.timeoutMs + 25);
      await firstSettled;
      expect(firstError instanceof A2uiRpcError).toBe(true);
      expect((firstError as A2uiRpcError).code).toBe(expectErr?.code);

      if (args["lateInboundResponse"]) {
        const lateHandled = processor.rpc.handleAgentFunctionResponse(
          (args["lateInboundResponse"] as { agentFunctionResponse: { functionCallId: string; value?: unknown } })
            .agentFunctionResponse,
        );
        if (exp["lateResponseIgnored"] === true) {
          expect(lateHandled).toBe(false);
        }
      }
      return;
    }

    // No listener case.
    await firstSettled;
    expect(firstError instanceof A2uiRpcError).toBe(true);
    expect((firstError as A2uiRpcError).code).toBe(expectErr?.code);
    return;
  }

  // Inbound callRendererFunction or standalone agentFunctionResponse cases.
  const registry = CatalogRegistry.withBasicV1();
  registry.registerAlias("basic", BASIC_CATALOG_V1_ID);
  registry.register(makeRpcCatalog("media_catalog", "1.0"));
  registry.register(makeRpcCatalog("system_catalog", "1.0"));
  registry.register(makeRpcCatalog("store_catalog", "1.0"));

  if (
    typeof args["catalogId"] === "string" &&
    typeof args["catalogVersion"] === "string"
  ) {
    registry.register(
      makeRpcCatalog(args["catalogId"], args["catalogVersion"]),
    );
  }

  const fnRegistry = FunctionRegistry.withBasicV1();
  const fnMetaMap = (args["functionMetadata"] ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const msgObj = args["message"] as Record<string, unknown>;
  const callRendererMsg = msgObj["callRendererFunction"] as
    | {
        callFunction?: { catalogId?: string };
      }
    | undefined;
  const targetCatalogId = callRendererMsg?.callFunction?.catalogId;

  for (const [fnName, meta] of Object.entries(fnMetaMap)) {
    const impl = buildRpcFunctionImpl(fnName, meta);
    // A function's own `catalogId` places it in that catalog, created here
    // when the case names one the registry lacks.
    const ownCatalogId = meta["catalogId"];
    if (typeof ownCatalogId === "string") {
      if (!registry.has(ownCatalogId)) {
        registry.register(makeRpcCatalog(ownCatalogId, "1.0"));
      }
      fnRegistry.register(registry.get(ownCatalogId)!.catalogId, impl);
      continue;
    }
    if (targetCatalogId && registry.has(targetCatalogId)) {
      const resolvedCat = registry.get(targetCatalogId)!;
      fnRegistry.register(resolvedCat.catalogId, impl);
    } else {
      fnRegistry.register(BASIC_CATALOG_V1_ID, impl);
    }
  }

  const outbound: OutboundRpcMessage[] = [];
  const emittedErrors: RendererErrorEnvelope[] = [];

  const processor = new MessageProcessor({
    registry,
    functionRegistry: fnRegistry,
    strictMode: false,
    callRendererUserActivation: args["userActivationPresent"] === true,
    onOutbound: (m) => outbound.push(m),
    onError: (e) => emittedErrors.push(e),
  });

  if (typeof args["surfaceId"] === "string") {
    processor.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: args["surfaceId"],
          catalogId: BASIC_CATALOG_V1_ID,
          dataModel: (args["dataModel"] as Record<string, unknown>) ?? {},
        },
      },
    ]);
  }

  const expectsValidationError =
    expectErr !== undefined || exp["error"] !== undefined;

  if (expectsValidationError) {
    let caught: unknown;
    try {
      processor.processMessages([msgObj]);
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      throw new Error(`${tc.name}: expected validation error but succeeded`);
    }
    if (expectErr?.category === "ValidationError") {
      expect(caught instanceof A2uiValidationError).toBe(true);
    }
    const errEnv = emittedErrors[0];
    if (exp["error"]) {
      const expE = exp["error"] as {
        code?: string;
        functionCallId?: string;
        message?: string;
      };
      if (expE.code !== undefined) {
        expect(errEnv?.error.code).toBe(expE.code);
      }
      if (expE.functionCallId !== undefined) {
        expect(
          errEnv && "functionCallId" in errEnv.error
            ? errEnv.error.functionCallId
            : undefined,
        ).toBe(expE.functionCallId);
      }
      if (expE.message !== undefined) {
        const msgText =
          errEnv?.error.message ??
          (caught instanceof Error ? caught.message : String(caught));
        expect(
          msgText.toLowerCase().includes(expE.message.toLowerCase()),
        ).toBe(true);
      }
    }
    if (expectErr?.rendererError) {
      const re = expectErr.rendererError;
      expect(errEnv?.version).toBe(re.version);
      if (re.error.code !== undefined) {
        expect(errEnv?.error.code).toBe(re.error.code);
      }
      if (re.error.functionCallId !== undefined) {
        expect(
          errEnv && "functionCallId" in errEnv.error
            ? errEnv.error.functionCallId
            : undefined,
        ).toBe(re.error.functionCallId);
      }
      if (re.error.message !== undefined) {
        expect(
          errEnv?.error.message
            .toLowerCase()
            .includes(re.error.message.toLowerCase()),
        ).toBe(true);
      }
    }
    return;
  }

  processor.processMessages([msgObj]);
  await flushMicrotasks();

  if (exp["response"] === null) {
    expect(outbound.length).toBe(0);
    expect(emittedErrors.length).toBe(0);
    expect(processor.rpc.pendingCount).toBe(0);
    return;
  }

  expect(outbound.length).toBe(1);
  const actual = outbound[0] as RendererFunctionResponseEnvelope;
  const expectedResp = exp["response"] as {
    version: string;
    rendererFunctionResponse: {
      functionCallId: string;
      value?: unknown;
      error?: { code: string; message: string };
    };
  };
  expect(actual.version).toBe(expectedResp.version);
  expect(actual.rendererFunctionResponse.functionCallId).toBe(
    expectedResp.rendererFunctionResponse.functionCallId,
  );
  if (expectedResp.rendererFunctionResponse.error) {
    const expRpcErr = expectedResp.rendererFunctionResponse.error;
    const actRpcErr = actual.rendererFunctionResponse.error;
    if (!actRpcErr) {
      throw new Error(
        `${tc.name}: expected error response ${JSON.stringify(expRpcErr)}, got value ${JSON.stringify(actual.rendererFunctionResponse.value)}`,
      );
    }
    expect(actRpcErr.code).toBe(expRpcErr.code);
    expect(
      actRpcErr.message
        .toLowerCase()
        .includes(expRpcErr.message.toLowerCase()),
    ).toBe(true);
  } else {
    expect(actual.rendererFunctionResponse.error).toBeUndefined();
    expect(actual.rendererFunctionResponse.value).toEqual(
      expectedResp.rendererFunctionResponse.value,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. core/agent_function_routing.yaml runner (`route_agent_function`)
// ---------------------------------------------------------------------------

interface RoutingCatalogSpec {
  readonly catalogId: string;
  readonly localFunctions?: readonly string[];
  readonly agentFunctions?: Readonly<
    Record<
      string,
      {
        readonly returnType?: string;
        readonly args?: JsonObject;
        readonly requiresUserActivation?: boolean;
        readonly allowedCallers?: string;
      }
    >
  >;
}

interface RoutingStep {
  readonly evaluate?: unknown;
  readonly as?: "binding" | "check" | "action" | "event";
  readonly respond?: {
    readonly call: number;
    readonly value?: unknown;
    readonly error?: { readonly code: string; readonly message: string };
  };
  readonly updateData?: { readonly path: string; readonly value: unknown };
  readonly cancelSurfaceCalls?: boolean;
  readonly deleteSurface?: boolean;
  readonly outboundInAnyOrder?: boolean;
  readonly expectOutbound?: readonly Record<string, unknown>[];
  readonly expectErrors?: readonly {
    readonly code: string;
    readonly message?: string;
  }[];
  readonly expectValues?: readonly unknown[];
  readonly expectActions?: readonly {
    readonly name: string;
    readonly context: Record<string, unknown>;
    readonly userMessage?: string;
  }[];
}

async function runAgentFunctionRoutingCase(tc: ConformanceCase): Promise<void> {
  const basicDoc = buildV10BasicCatalogDocument();
  const basicFnSchemas = (basicDoc["functions"] ?? {}) as JsonObject;
  const basicFnReg = FunctionRegistry.withBasicV1();

  const registry = new CatalogRegistry();
  const fnRegistry = new FunctionRegistry();
  for (const sysName of ["@index"]) {
    const sysImpl = basicFnReg.getSystem(sysName);
    if (sysImpl) {
      fnRegistry.registerSystem(sysImpl);
    }
  }

  const catalogSpecs = (tc["catalogs"] ?? []) as readonly RoutingCatalogSpec[];
  for (const spec of catalogSpecs) {
    const functionsDoc: JsonObject = {};
    if (spec.localFunctions) {
      for (const fnName of spec.localFunctions) {
        const schemaDef = basicFnSchemas[fnName];
        if (schemaDef !== undefined) {
          functionsDoc[fnName] = schemaDef;
        }
        const impl = basicFnReg.get(BASIC_CATALOG_V1_ID, fnName);
        if (impl) {
          fnRegistry.register(spec.catalogId, impl);
        }
      }
    }
    if (spec.agentFunctions) {
      for (const [fnName, fnSpec] of Object.entries(spec.agentFunctions)) {
        const fnDoc: JsonObject = {
          type: "object",
          properties: {
            "@call": { const: fnName },
            args: fnSpec.args ?? { type: "object" },
          },
          required: ["@call", "args"],
        };
        if (fnSpec.returnType !== undefined) {
          fnDoc["returnType"] = fnSpec.returnType;
        }
        if (fnSpec.requiresUserActivation !== undefined) {
          fnDoc["requiresUserActivation"] = fnSpec.requiresUserActivation;
        }
        if (fnSpec.allowedCallers !== undefined) {
          fnDoc["allowedCallers"] = fnSpec.allowedCallers;
        }
        functionsDoc[fnName] = fnDoc;
      }
    }

    const cat = Catalog.fromJson({
      catalogId: spec.catalogId,
      protocolVersion: "1.0",
      ...(Object.keys(functionsDoc).length > 0 ? { functions: functionsDoc } : {}),
    });
    registry.register(cat);
  }

  const surfaceSpec = (tc["surface"] ?? {}) as {
    readonly catalogId?: string;
    readonly outboundListener?: boolean;
  };
  const hasListener = surfaceSpec.outboundListener !== false;

  const allOutboundCalls: CallAgentFunctionPayload[] = [];
  let stepOutbound: CallAgentFunctionPayload[] = [];
  let stepErrors: RendererErrorEnvelope[] = [];
  let stepActions: DispatchedActionEnvelope[] = [];

  const processor = new MessageProcessor({
    registry,
    functionRegistry: fnRegistry,
    strictMode: false,
    onOutbound: hasListener
      ? (msg) => {
          if ("callAgentFunction" in msg) {
            allOutboundCalls.push(msg.callAgentFunction);
            stepOutbound.push(msg.callAgentFunction);
          }
        }
      : undefined,
    onError: (env) => stepErrors.push(env),
    onAction: (env) => stepActions.push(env),
  });

  const createBody: Record<string, unknown> = { surfaceId: "main" };
  if (surfaceSpec.catalogId !== undefined) {
    createBody["catalogId"] = surfaceSpec.catalogId;
  }
  if (tc["dataModel"] !== undefined) {
    createBody["dataModel"] = tc["dataModel"];
  }
  processor.processMessages([{ version: "1.0", createSurface: createBody }]);

  const tracked: Array<
    | { readonly kind: "binding"; readonly ref: ReactiveEvaluation }
    | { readonly kind: "check"; readonly ref: ReactiveCheckEvaluation }
  > = [];

  const steps = (tc["steps"] ?? []) as readonly RoutingStep[];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    stepOutbound = [];
    stepErrors = [];
    stepActions = [];

    if (step.evaluate !== undefined) {
      const mode = step.as ?? "binding";
      if (mode === "binding") {
        const ref = processor.evaluateBinding("main", step.evaluate);
        tracked.push({ kind: "binding", ref });
      } else if (mode === "check") {
        const ref = processor.evaluateCheckRule("main", step.evaluate);
        tracked.push({ kind: "check", ref });
      } else if (mode === "action") {
        void processor.dispatchAction({
          surfaceId: "main",
          sourceComponentId: "action_btn",
          actionPayload: { functionCall: step.evaluate },
          userActivation: true,
        });
      } else if (mode === "event") {
        void processor.dispatchAction({
          surfaceId: "main",
          sourceComponentId: "event_btn",
          actionPayload: { event: step.evaluate },
          userActivation: true,
        });
      }
    } else if (step.respond !== undefined) {
      const target = allOutboundCalls[step.respond.call];
      if (!target) {
        throw new Error(
          `${tc.name} step ${i}: respond.call=${step.respond.call} out of range (sent ${allOutboundCalls.length})`,
        );
      }
      const respBody =
        step.respond.error !== undefined
          ? {
              functionCallId: target.functionCallId,
              error: step.respond.error,
            }
          : {
              functionCallId: target.functionCallId,
              value: step.respond.value,
            };
      processor.processMessages([
        { version: "1.0", agentFunctionResponse: respBody },
      ]);
    } else if (step.updateData !== undefined) {
      processor.processMessages([
        {
          version: "1.0",
          updateDataModel: {
            surfaceId: "main",
            path: step.updateData.path,
            value: step.updateData.value,
          },
        },
      ]);
    } else if (step.cancelSurfaceCalls === true) {
      processor.cancelSurfaceCalls("main");
    } else if (step.deleteSurface === true) {
      processor.processMessages([
        { version: "1.0", deleteSurface: { surfaceId: "main" } },
      ]);
    }

    await flushMicrotasks();

    // Verify outbound calls.
    const expectedOutbound = step.expectOutbound ?? [];
    for (const call of stepOutbound) {
      expect(call.surfaceId).toBe("main");
    }
    const actualCallFns = stepOutbound.map((c) => c.callFunction);
    if (step.outboundInAnyOrder === true) {
      const sortedActual = actualCallFns.map(canonicalJson).sort();
      const sortedExpected = expectedOutbound.map(canonicalJson).sort();
      expect(sortedActual).toEqual(sortedExpected);
    } else {
      expect(actualCallFns).toEqual(expectedOutbound);
    }

    // Verify errors.
    const expectedErrors = step.expectErrors ?? [];
    if (stepErrors.length !== expectedErrors.length) {
      throw new Error(
        `${tc.name} step ${i}: expected ${expectedErrors.length} error(s), got ${stepErrors.length}: ${JSON.stringify(stepErrors)}`,
      );
    }
    for (let e = 0; e < expectedErrors.length; e += 1) {
      const expErr = expectedErrors[e]!;
      const actErr = stepErrors[e]!;
      expect(actErr.error.code).toBe(expErr.code);
      if (expErr.message !== undefined) {
        expect(
          actErr.error.message
            .toLowerCase()
            .includes(expErr.message.toLowerCase()),
        ).toBe(true);
      }
    }

    // Verify actions.
    const expectedActions = step.expectActions ?? [];
    if (stepActions.length !== expectedActions.length) {
      throw new Error(
        `${tc.name} step ${i}: expected ${expectedActions.length} action(s), got ${stepActions.length}: ${JSON.stringify(stepActions)}`,
      );
    }
    for (let a = 0; a < expectedActions.length; a += 1) {
      const expAct = expectedActions[a]!;
      const actAct = stepActions[a]!.action;
      expect(actAct.name).toBe(expAct.name);
      expect(actAct.context).toEqual(expAct.context);
      if (expAct.userMessage !== undefined) {
        expect(actAct.userMessage).toBe(expAct.userMessage);
      } else {
        expect(actAct.userMessage).toBeUndefined();
      }
    }

    // Verify tracked reactive values.
    if (step.expectValues !== undefined) {
      const actualValues = tracked.map((item) =>
        item.kind === "binding" ? item.ref.value : item.ref.passed,
      );
      expect(actualValues).toEqual(step.expectValues);
    }
  }

  for (const item of tracked) {
    item.ref.dispose();
  }
  processor.dispose();
}

describe("C4 conformance — actions, RPC & agent function routing", () => {
  let client: ConformanceClient;

  beforeAll(async () => {
    client = await ConformanceClient.create();
  });

  test("core/actions.yaml passes all v1.0 & version-neutral cases", async () => {
    const records = await client.runSuite(
      "core/actions.yaml",
      runDispatchActionCase,
      ACTIONS_SKIP_TEST_NAMES,
    );
    const passed = records.filter((r) => r.status === "passed").length;
    const skipped = records.filter((r) => r.status === "skipped").length;
    expect(skipped).toBe(ACTIONS_SKIP_TEST_NAMES.size);
    expect(passed).toBe(records.length - ACTIONS_SKIP_TEST_NAMES.size);
  });

  test("core/rpc_functions.yaml passes all 40 cases", async () => {
    const records = await client.runSuite(
      "core/rpc_functions.yaml",
      runHandleRpcCase,
      RPC_FUNCTIONS_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(40);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("core/agent_function_routing.yaml passes all v1.0 cases", async () => {
    const records = await client.runSuite(
      "core/agent_function_routing.yaml",
      runAgentFunctionRoutingCase,
      AGENT_ROUTING_SKIP_TEST_NAMES,
    );
    const passed = records.filter((r) => r.status === "passed").length;
    const skipped = records.filter((r) => r.status === "skipped").length;
    expect(skipped).toBe(AGENT_ROUTING_SKIP_TEST_NAMES.size);
    expect(passed).toBe(records.length - AGENT_ROUTING_SKIP_TEST_NAMES.size);
  });
});
