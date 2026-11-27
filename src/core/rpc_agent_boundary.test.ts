import { describe, expect, test } from "nsh/test";
import { Catalog, CatalogRegistry, type AllowedCallers } from "./catalog";
import {
  FunctionRegistry,
  formatStringFunction,
  type FunctionImplementation,
} from "./functions";
import { MessageProcessor } from "./processor";
import type { RendererFunctionResponseEnvelope } from "./rpc";

// A2UI 1.0 callRendererFunction: every function the agent's call reaches,
// whether nested as `@call` in `callFunction.args` or run by a `${...}`
// template, meets the same caller boundary as the requested function.

const CAT = "agent_cat";

interface Fixture {
  readonly processor: MessageProcessor;
  readonly ran: string[];
}

function fn(
  name: string,
  allowedCallers: AllowedCallers,
  ran: string[],
  options: {
    readonly requiresUserActivation?: boolean;
    readonly execute?: FunctionImplementation["execute"];
  } = {},
): FunctionImplementation {
  return {
    name,
    returnType: "any",
    allowedCallers,
    requiresUserActivation: options.requiresUserActivation ?? false,
    execute: (args, ctx) => {
      ran.push(name);
      return options.execute ? options.execute(args, ctx) : { ...args };
    },
  };
}

/** A processor whose `agent_cat` registers (but does not declare) the test functions. */
function fixture(rpcMaxCallDepth?: number): Fixture {
  const ran: string[] = [];
  const registry = CatalogRegistry.withBasicV1();
  registry.register(Catalog.fromJson({ catalogId: CAT, protocolVersion: "1.0" }));
  const functions = FunctionRegistry.withBasicV1();
  functions.register(CAT, fn("echoArgs", "rendererOrAgent", ran));
  functions.register(
    CAT,
    fn("renderTemplate", "rendererOrAgent", ran, {
      execute: (args, ctx) => formatStringFunction.execute(args, ctx),
    }),
  );
  functions.register(
    CAT,
    fn("tagValue", "rendererOrAgent", ran, {
      execute: (args) => `tagged:${String(args["value"])}`,
    }),
  );
  functions.register(CAT, fn("secret", "rendererOnly", ran));
  functions.register(
    CAT,
    fn("agentSecret", "agentOnly", ran, { execute: () => "AGENT_OK" }),
  );
  functions.register(
    CAT,
    fn("gesture", "rendererOrAgent", ran, {
      requiresUserActivation: true,
      execute: () => "GESTURE_OK",
    }),
  );
  const processor = new MessageProcessor({
    registry,
    functionRegistry: functions,
    strictMode: false,
    ...(rpcMaxCallDepth === undefined
      ? {}
      : { rpcLimits: { maxCallDepth: rpcMaxCallDepth } }),
  });
  processor.processMessages([
    {
      version: "1.0",
      createSurface: { surfaceId: "s1", catalogId: CAT, dataModel: { count: 2 } },
    },
  ]);
  return { processor, ran };
}

function call(
  f: Fixture,
  callFunction: Record<string, unknown>,
  userActivation = false,
): Promise<RendererFunctionResponseEnvelope> {
  return f.processor.rpc.handleCallRendererFunction(
    {
      functionCallId: "c1",
      surfaceId: "s1",
      callFunction: callFunction as {
        readonly "@call": string;
        readonly catalogId: string;
      },
    },
    { userActivation },
  );
}

function errorOf(
  response: RendererFunctionResponseEnvelope,
): { readonly code: string; readonly message: string } | undefined {
  return response.rendererFunctionResponse.error;
}

describe("rpc — callRendererFunction caller boundary on nested calls", () => {
  test("a nested @call to a rendererOnly function rejects the call before any argument runs", async () => {
    const f = fixture();
    const response = await call(f, {
      "@call": "echoArgs",
      catalogId: CAT,
      args: {
        first: { "@call": "tagValue", catalogId: CAT, args: { value: 1 } },
        leaked: { "@call": "secret", catalogId: CAT, args: {} },
      },
    });
    expect(errorOf(response)?.code).toBe("INVALID_FUNCTION_CALL");
    expect(errorOf(response)?.message).toBe(
      "Function 'secret' cannot be called by agent (allowedCallers is rendererOnly).",
    );
    expect(f.ran).toEqual([]);
  });

  test("a nested @call needing user activation rejects the call without it", async () => {
    const f = fixture();
    const response = await call(f, {
      "@call": "echoArgs",
      catalogId: CAT,
      args: { opened: { "@call": "gesture", catalogId: CAT, args: {} } },
    });
    expect(errorOf(response)?.code).toBe("INVALID_FUNCTION_CALL");
    expect(errorOf(response)?.message).toContain("requires user activation");
    expect(f.ran).toEqual([]);
  });

  test("a nested @call to an agentOnly function runs", async () => {
    const f = fixture();
    const response = await call(f, {
      "@call": "echoArgs",
      catalogId: CAT,
      args: { token: { "@call": "agentSecret", catalogId: CAT, args: {} } },
    });
    expect(errorOf(response)).toBeUndefined();
    expect(response.rendererFunctionResponse.value).toEqual({ token: "AGENT_OK" });
  });

  test("a ${...} template call to a rendererOnly function rejects the call", async () => {
    const f = fixture();
    const response = await call(f, {
      "@call": "renderTemplate",
      catalogId: CAT,
      args: { value: "Leak: ${secret()}" },
    });
    expect(errorOf(response)?.code).toBe("INVALID_FUNCTION_CALL");
    expect(errorOf(response)?.message).toBe(
      "Function 'secret' cannot be called by agent (allowedCallers is rendererOnly).",
    );
    expect(f.ran).not.toContain("secret");
  });

  test("a ${...} template call needing user activation rejects the call without it", async () => {
    const f = fixture();
    const response = await call(f, {
      "@call": "renderTemplate",
      catalogId: CAT,
      args: { value: "Activated: ${gesture()}" },
    });
    expect(errorOf(response)?.code).toBe("INVALID_FUNCTION_CALL");
    expect(errorOf(response)?.message).toContain("requires user activation");
  });

  test("a ${...} template call in a nested @call checks the boundary too", async () => {
    const f = fixture();
    const response = await call(f, {
      "@call": "echoArgs",
      catalogId: CAT,
      args: {
        text: {
          "@call": "renderTemplate",
          catalogId: CAT,
          args: { value: "Leak: ${secret()}" },
        },
      },
    });
    expect(errorOf(response)?.code).toBe("INVALID_FUNCTION_CALL");
  });

  test("a boundary error wins over an earlier error in the same template", async () => {
    const f = fixture();
    const response = await call(f, {
      "@call": "renderTemplate",
      catalogId: CAT,
      args: { value: "${noSuchFn()}${secret()}" },
    });
    expect(errorOf(response)?.code).toBe("INVALID_FUNCTION_CALL");
    expect(errorOf(response)?.message).toContain("'secret'");
  });

  test("a template call for the agent finds a function registered but not declared in its catalog", async () => {
    const f = fixture();
    const response = await call(f, {
      "@call": "renderTemplate",
      catalogId: CAT,
      args: { value: "Clips: ${tagValue(value: /count)}" },
    });
    expect(errorOf(response)).toBeUndefined();
    expect(response.rendererFunctionResponse.value).toBe("Clips: tagged:2");
  });

  test("argument nesting past maxCallDepth fails closed with EXECUTION_ERROR before any argument runs", async () => {
    const f = fixture(2);
    const response = await call(f, {
      "@call": "echoArgs",
      catalogId: CAT,
      args: {
        first: { "@call": "tagValue", catalogId: CAT, args: { value: 1 } },
        a: {
          "@call": "echoArgs",
          catalogId: CAT,
          args: {
            b: {
              "@call": "echoArgs",
              catalogId: CAT,
              args: { c: { "@call": "echoArgs", catalogId: CAT, args: {} } },
            },
          },
        },
      },
    });
    expect(errorOf(response)?.code).toBe("EXECUTION_ERROR");
    expect(errorOf(response)?.message).toContain("Maximum function call depth (2)");
    expect(f.ran).toEqual([]);
  });
});
