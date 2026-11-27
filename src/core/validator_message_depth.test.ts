import { describe, expect, test } from "nsh/test";
import {
  A2uiRecursionError,
  BASIC_CATALOG_V1_ID,
  Catalog,
  CatalogRegistry,
} from "./catalog";
import { FunctionRegistry } from "./functions";
import { MessageProcessor } from "./processor";
import type { RendererFunctionResponseEnvelope } from "./rpc";
import { PayloadValidator, STRICT_VALIDATION } from "./validator";

// A2UI 1.0 counts the global depth limit (50) from the message root for every
// value of a message, not only for components and data. Depths in a message:
//   createSurface.metadata:          message (0) → createSurface (1) → metadata (2)
//   callRendererFunction args:       message (0) → callRendererFunction (1)
//                                    → callFunction (2) → args (3)
//   agentFunctionResponse value:     message (0) → agentFunctionResponse (1) → value (2)
// The limit counts containers; a scalar is never refused.
const LIMIT = STRICT_VALIDATION.maxRecursionDepth;
const SCALARS: readonly unknown[] = ["text", 42, true, null];

/** Builds `count` nested objects around `leaf` (the outermost is the value). */
function objectChain(count: number, leaf?: unknown): Record<string, unknown> {
  let value: Record<string, unknown> = leaf === undefined ? {} : { leaf };
  for (let i = 1; i < count; i += 1) {
    value = { nested: value };
  }
  return value;
}

/** Builds `count` nested arrays around `leaf` (the outermost is the value). */
function arrayChain(count: number, leaf?: unknown): unknown[] {
  let value: unknown[] = leaf === undefined ? [] : [leaf];
  for (let i = 1; i < count; i += 1) {
    value = [value];
  }
  return value;
}

function validate(msg: unknown): string {
  const validator = new PayloadValidator(CatalogRegistry.withBasicV1());
  return validator.validateMessageEnvelope(msg, 0, STRICT_VALIDATION);
}

function recursionError(msg: unknown): A2uiRecursionError {
  try {
    validate(msg);
  } catch (error) {
    expect(error instanceof A2uiRecursionError).toBe(true);
    return error as A2uiRecursionError;
  }
  throw new Error("expected the message to be refused");
}

// --- createSurface metadata ------------------------------------------------

// metadata (2) → extensions (3) → an extension's value (4): the value may
// hold 47 nested containers before the deepest one reaches 50.
const EXTENSION_CONTAINERS_AT_LIMIT = LIMIT - 3;

function createSurfaceWithExtension(ext: unknown): Record<string, unknown> {
  return {
    version: "1.0",
    createSurface: {
      surfaceId: "s1",
      catalogId: BASIC_CATALOG_V1_ID,
      metadata: { extensions: { ext } },
    },
  };
}

describe("PayloadValidator — createSurface metadata depth counts from the message root", () => {
  test("accepts metadata whose deepest container sits at the limit", () => {
    for (const ext of [
      objectChain(EXTENSION_CONTAINERS_AT_LIMIT),
      arrayChain(EXTENSION_CONTAINERS_AT_LIMIT),
    ]) {
      expect(validate(createSurfaceWithExtension(ext))).toBe("createSurface");
    }
  });

  test("refuses metadata one level deeper with RECURSION_LIMIT_EXCEEDED at /metadata", () => {
    for (const ext of [
      objectChain(EXTENSION_CONTAINERS_AT_LIMIT + 1),
      arrayChain(EXTENSION_CONTAINERS_AT_LIMIT + 1),
    ]) {
      const error = recursionError(createSurfaceWithExtension(ext));

      expect(error.code).toBe("RECURSION_LIMIT_EXCEEDED");
      expect(error.path).toBe("/metadata");
      expect(error.surfaceId).toBe("s1");
    }
  });

  test("never refuses a scalar in metadata, whatever its depth", () => {
    for (const leaf of SCALARS) {
      // The scalar sits one level below the deepest allowed container.
      expect(
        validate(
          createSurfaceWithExtension(
            objectChain(EXTENSION_CONTAINERS_AT_LIMIT, leaf),
          ),
        ),
      ).toBe("createSurface");
    }
  });
});

// --- callRendererFunction args ---------------------------------------------

// args sit at depth 3, so args itself holds 48 nested containers before the
// deepest one reaches 50.
const ARGS_CONTAINERS_AT_LIMIT = LIMIT - 2;
const CAT = "agent_cat";

function callRendererFunction(
  args: Record<string, unknown>,
  surfaceId?: string,
): Record<string, unknown> {
  return {
    version: "1.0",
    callRendererFunction: {
      functionCallId: "c1",
      ...(surfaceId === undefined ? {} : { surfaceId }),
      callFunction: { "@call": "echoArgs", catalogId: CAT, args },
    },
  };
}

/** `count` nested `echoArgs` calls inside `args`, each with an `args` object. */
function nestedCalls(count: number): Record<string, unknown> {
  let args: Record<string, unknown> = {};
  for (let i = 0; i < count; i += 1) {
    args = { inner: { "@call": "echoArgs", catalogId: CAT, args } };
  }
  return args;
}

describe("PayloadValidator — callRendererFunction args depth counts from the message root", () => {
  test("accepts args whose deepest container sits at the limit", () => {
    expect(
      validate(callRendererFunction(objectChain(ARGS_CONTAINERS_AT_LIMIT))),
    ).toBe("callRendererFunction");
    expect(
      validate(
        callRendererFunction({ list: arrayChain(ARGS_CONTAINERS_AT_LIMIT - 1) }),
      ),
    ).toBe("callRendererFunction");
  });

  test("refuses args one level deeper with RECURSION_LIMIT_EXCEEDED at /callFunction/args", () => {
    for (const args of [
      objectChain(ARGS_CONTAINERS_AT_LIMIT + 1),
      { list: arrayChain(ARGS_CONTAINERS_AT_LIMIT) },
    ]) {
      const error = recursionError(callRendererFunction(args, "s1"));

      expect(error.code).toBe("RECURSION_LIMIT_EXCEEDED");
      expect(error.path).toBe("/callFunction/args");
      expect(error.surfaceId).toBe("s1");
    }
  });

  test("a refused call without surfaceId carries no surfaceId", () => {
    const error = recursionError(
      callRendererFunction(objectChain(ARGS_CONTAINERS_AT_LIMIT + 1)),
    );

    expect(error.code).toBe("RECURSION_LIMIT_EXCEEDED");
    expect(error.surfaceId).toBe(undefined);
  });

  test("never refuses a scalar in args, whatever its depth", () => {
    for (const leaf of SCALARS) {
      expect(
        validate(
          callRendererFunction(objectChain(ARGS_CONTAINERS_AT_LIMIT, leaf)),
        ),
      ).toBe("callRendererFunction");
    }
  });

  test("nested calls count two levels each: 23 pass, 24 are refused before the RPC call depth (32)", () => {
    // Call k sits at depth 2k + 2 and its args at 2k + 3.
    expect(validate(callRendererFunction(nestedCalls(23)))).toBe(
      "callRendererFunction",
    );
    const error = recursionError(callRendererFunction(nestedCalls(24)));

    expect(error.code).toBe("RECURSION_LIMIT_EXCEEDED");
    expect(error.path).toBe("/callFunction/args");
  });
});

/** A processor whose `agent_cat` registers an agent-callable `echoArgs`. */
function rpcFixture(): {
  readonly processor: MessageProcessor;
  readonly ran: string[];
  readonly outbound: unknown[];
} {
  const ran: string[] = [];
  const outbound: unknown[] = [];
  const registry = CatalogRegistry.withBasicV1();
  registry.register(Catalog.fromJson({ catalogId: CAT, protocolVersion: "1.0" }));
  const functions = FunctionRegistry.withBasicV1();
  functions.register(CAT, {
    name: "echoArgs",
    returnType: "any",
    allowedCallers: "rendererOrAgent",
    requiresUserActivation: false,
    execute: (args) => {
      ran.push("echoArgs");
      return { ...args };
    },
  });
  const processor = new MessageProcessor({
    registry,
    functionRegistry: functions,
    strictMode: false,
    onOutbound: (envelope) => {
      outbound.push(envelope);
    },
  });
  return { processor, ran, outbound };
}

describe("MessageProcessor — the JSON depth limit wins over the RPC call depth for a deep non-call value", () => {
  test("a message whose args hold a deep plain value is refused before the function runs", () => {
    const f = rpcFixture();
    let caught: unknown;
    try {
      f.processor.processMessages([
        callRendererFunction(objectChain(ARGS_CONTAINERS_AT_LIMIT + 1)),
      ]);
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof A2uiRecursionError).toBe(true);
    expect((caught as A2uiRecursionError).code).toBe("RECURSION_LIMIT_EXCEEDED");
    expect(f.ran).toEqual([]);
    expect(f.outbound).toEqual([]);
  });

  test("the RPC call depth alone never counts a plain value: a direct call with the same args runs", async () => {
    const f = rpcFixture();
    const response: RendererFunctionResponseEnvelope =
      await f.processor.rpc.handleCallRendererFunction({
        functionCallId: "c1",
        callFunction: {
          "@call": "echoArgs",
          catalogId: CAT,
          args: objectChain(ARGS_CONTAINERS_AT_LIMIT + 1),
        },
      });

    expect(response.rendererFunctionResponse.error).toBe(undefined);
    expect(f.ran).toEqual(["echoArgs"]);
  });
});

// --- agentFunctionResponse value -------------------------------------------

// value sits at depth 2, so it holds 49 nested containers before the deepest
// one reaches 50.
const VALUE_CONTAINERS_AT_LIMIT = LIMIT - 1;

function agentFunctionResponse(value: unknown): Record<string, unknown> {
  return {
    version: "1.0",
    agentFunctionResponse: { functionCallId: "f1", value },
  };
}

describe("PayloadValidator — agentFunctionResponse value depth counts from the message root", () => {
  test("accepts a value whose deepest container sits at the limit", () => {
    for (const value of [
      objectChain(VALUE_CONTAINERS_AT_LIMIT),
      arrayChain(VALUE_CONTAINERS_AT_LIMIT),
    ]) {
      expect(validate(agentFunctionResponse(value))).toBe(
        "agentFunctionResponse",
      );
    }
  });

  test("refuses a value one level deeper with RECURSION_LIMIT_EXCEEDED at /value", () => {
    for (const value of [
      objectChain(VALUE_CONTAINERS_AT_LIMIT + 1),
      arrayChain(VALUE_CONTAINERS_AT_LIMIT + 1),
    ]) {
      const error = recursionError(agentFunctionResponse(value));

      expect(error.code).toBe("RECURSION_LIMIT_EXCEEDED");
      expect(error.path).toBe("/value");
      expect(error.surfaceId).toBe(undefined);
    }
  });

  test("never refuses a scalar value, whatever its depth", () => {
    for (const leaf of SCALARS) {
      expect(
        validate(
          agentFunctionResponse(objectChain(VALUE_CONTAINERS_AT_LIMIT, leaf)),
        ),
      ).toBe("agentFunctionResponse");
      expect(
        validate(
          agentFunctionResponse(arrayChain(VALUE_CONTAINERS_AT_LIMIT, leaf)),
        ),
      ).toBe("agentFunctionResponse");
      expect(validate(agentFunctionResponse(leaf))).toBe(
        "agentFunctionResponse",
      );
    }
  });

  test("an error response carries no value and is not depth-checked", () => {
    expect(
      validate({
        version: "1.0",
        agentFunctionResponse: {
          functionCallId: "f1",
          error: { code: "X", message: "failed" },
        },
      }),
    ).toBe("agentFunctionResponse");
  });
});
