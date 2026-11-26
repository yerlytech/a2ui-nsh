import { describe, expect, test } from "nsh/test";
import type { JsonObject } from "./json_schema";
import {
  A2uiRpcError,
  applySchemaDefaults,
  canonicalCallKey,
  canonicalJson,
  hasNonJsonNumber,
  parseAndValidateFunctionArgs,
} from "./rpc";

describe("rpc helpers — canonicalJson", () => {
  test("sorts object keys at every depth", () => {
    expect(
      canonicalJson({ z: { b: 1, a: 2 }, a: [{ d: 4, c: 3 }] }),
    ).toBe("{\"a\":[{\"c\":3,\"d\":4}],\"z\":{\"a\":2,\"b\":1}}");
  });

  test("keeps array element order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJson(["b", "a"])).toBe("[\"b\",\"a\"]");
  });

  test("escapes string content exactly as JSON.stringify does", () => {
    const value = "quote \" backslash \\ newline \n control \u0001 é 😀";
    expect(canonicalJson(value)).toBe(JSON.stringify(value));
  });

  test("serializes null, booleans, nested empty objects and empty arrays", () => {
    expect(
      canonicalJson({ a: null, b: true, c: false, d: {}, e: [], f: [{}, []] }),
    ).toBe("{\"a\":null,\"b\":true,\"c\":false,\"d\":{},\"e\":[],\"f\":[{},[]]}");
  });

  test("writes a top-level undefined value as null", () => {
    expect(canonicalJson(undefined)).toBe("null");
  });

  test("drops object fields whose value is undefined", () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 2 })).toBe("{\"a\":1,\"c\":2}");
  });

  test("writes NaN as null, as JSON.stringify does", () => {
    expect(canonicalJson(Number.NaN)).toBe("null");
    expect(canonicalJson({ n: Number.NaN })).toBe("{\"n\":null}");
  });

  test("writes Infinity as null, as JSON.stringify does", () => {
    expect(canonicalJson(Number.POSITIVE_INFINITY)).toBe("null");
    expect(canonicalJson({ n: Number.POSITIVE_INFINITY })).toBe("{\"n\":null}");
  });

  test("writes -Infinity as null, as JSON.stringify does", () => {
    expect(canonicalJson(Number.NEGATIVE_INFINITY)).toBe("null");
    expect(canonicalJson({ n: Number.NEGATIVE_INFINITY })).toBe("{\"n\":null}");
  });

  test("writes -0 as 0, as JSON.stringify does", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson({ n: -0 })).toBe("{\"n\":0}");
  });
});

describe("rpc helpers — canonicalCallKey", () => {
  test("gives the same key for the same name and arguments in a different key order", () => {
    expect(canonicalCallKey("cat", "fn", { quote: "USD", base: "EUR" })).toBe(
      canonicalCallKey("cat", "fn", { base: "EUR", quote: "USD" }),
    );
  });

  test("changes the key when the function name changes", () => {
    expect(canonicalCallKey("cat", "fn", { a: 1 })).not.toBe(
      canonicalCallKey("cat", "other", { a: 1 }),
    );
  });

  test("changes the key when an argument value changes", () => {
    expect(canonicalCallKey("cat", "fn", { a: 1 })).not.toBe(
      canonicalCallKey("cat", "fn", { a: 2 }),
    );
  });

  test("changes the key when the catalog/scope changes", () => {
    expect(canonicalCallKey("cat", "fn", { a: 1 })).not.toBe(
      canonicalCallKey("other_cat", "fn", { a: 1 }),
    );
  });
});

describe("rpc helpers — hasNonJsonNumber", () => {
  test("returns false for a plain JSON value", () => {
    expect(
      hasNonJsonNumber({ ok: 1, nested: [true, "s", null, { x: 1.5 }] }),
    ).toBe(false);
  });

  test("returns true for NaN at the top level", () => {
    expect(hasNonJsonNumber(Number.NaN)).toBe(true);
  });

  test("returns true for Infinity at the top level", () => {
    expect(hasNonJsonNumber(Number.POSITIVE_INFINITY)).toBe(true);
  });

  test("returns true for -Infinity at the top level", () => {
    expect(hasNonJsonNumber(Number.NEGATIVE_INFINITY)).toBe(true);
  });

  test("returns true for NaN inside an array", () => {
    expect(hasNonJsonNumber([1, Number.NaN])).toBe(true);
  });

  test("returns true for a non-JSON number deep inside an object and array", () => {
    expect(
      hasNonJsonNumber({ outer: { list: [{ value: Number.POSITIVE_INFINITY }] } }),
    ).toBe(true);
  });

  test("returns false for -0 and for very large finite numbers", () => {
    expect(hasNonJsonNumber(-0)).toBe(false);
    expect(hasNonJsonNumber({ n: -0 })).toBe(false);
    expect(hasNonJsonNumber(1e308)).toBe(false);
    expect(hasNonJsonNumber({ n: Number.MAX_VALUE })).toBe(false);
  });

  test("returns true for a finite-looking literal that overflows to Infinity", () => {
    expect(hasNonJsonNumber(1e309)).toBe(true);
  });
});

describe("rpc helpers — applySchemaDefaults", () => {
  const commonSchema: JsonObject = {
    type: "object",
    properties: {
      symbol: { type: "string" },
      currency: { type: "string", default: "USD" },
      options: {
        type: "object",
        properties: {
          extended: { type: "boolean", default: false },
        },
      },
    },
  };

  test("fills a missing property from its schema default", () => {
    expect(
      applySchemaDefaults({ symbol: "ACME" }, commonSchema, commonSchema),
    ).toEqual({ symbol: "ACME", currency: "USD" });
  });

  test("leaves a present property unchanged even when it has a default", () => {
    expect(
      applySchemaDefaults(
        { symbol: "ACME", currency: "EUR" },
        commonSchema,
        commonSchema,
      ),
    ).toEqual({ symbol: "ACME", currency: "EUR" });
  });

  test("leaves a present-but-null property as null and does not apply its default", () => {
    expect(
      applySchemaDefaults(
        { symbol: "ACME", currency: null },
        commonSchema,
        commonSchema,
      ),
    ).toEqual({ symbol: "ACME", currency: null });
  });

  test("fills defaults in a nested object", () => {
    expect(
      applySchemaDefaults(
        { symbol: "ACME", options: {} },
        commonSchema,
        commonSchema,
      ),
    ).toEqual({
      symbol: "ACME",
      currency: "USD",
      options: { extended: false },
    });
  });

  test("does not mutate the input value", () => {
    const input = { symbol: "ACME", options: {} };
    applySchemaDefaults(input, commonSchema, commonSchema);
    expect(input).toEqual({ symbol: "ACME", options: {} });
  });

  test("follows $ref and fills defaults from the referenced schema", () => {
    const schema: JsonObject = {
      $defs: {
        Item: {
          type: "object",
          properties: { size: { type: "number", default: 7 } },
        },
      },
      type: "object",
      properties: {
        item: { $ref: "#/$defs/Item" },
      },
    };
    expect(applySchemaDefaults({ item: {} }, schema, schema)).toEqual({
      item: { size: 7 },
    });
  });

  test("fills defaults for items of an array", () => {
    const schema: JsonObject = {
      type: "array",
      items: {
        type: "object",
        properties: { x: { type: "number", default: 1 } },
      },
    };
    expect(applySchemaDefaults([{}], schema, schema)).toEqual([{ x: 1 }]);
  });

  test("ignores defaults under oneOf branches", () => {
    const schema: JsonObject = {
      oneOf: [
        {
          type: "object",
          properties: { x: { type: "number", default: 1 } },
        },
      ],
    };
    expect(applySchemaDefaults({}, schema, schema)).toEqual({});
  });

  test("ignores defaults under anyOf branches", () => {
    const schema: JsonObject = {
      anyOf: [
        {
          type: "object",
          properties: { x: { type: "number", default: 1 } },
        },
      ],
    };
    expect(applySchemaDefaults({}, schema, schema)).toEqual({});
  });
});

describe("rpc helpers — parseAndValidateFunctionArgs", () => {
  const schema: JsonObject = {
    type: "object",
    properties: {
      symbol: { type: "string" },
      currency: { type: "string", default: "USD" },
      lots: { type: "number" },
    },
    required: ["symbol"],
    additionalProperties: false,
  };

  function parse(args: Readonly<Record<string, unknown>>) {
    return parseAndValidateFunctionArgs(
      "quote",
      args,
      undefined,
      undefined,
      schema,
    );
  }

  test("returns the parsed args with defaults applied for a valid call", () => {
    expect(parse({ symbol: "ACME" })).toEqual({
      ok: true,
      args: { symbol: "ACME", currency: "USD" },
    });
  });

  test("refuses a call missing a required argument and names the path", () => {
    const result = parse({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Missing required property \u0027symbol\u0027");
  });

  test("refuses a call with an argument of the wrong type and names the path", () => {
    const result = parse({ symbol: 42 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Expected type \u0027string\u0027 at \u0027/symbol\u0027");
  });

  test("refuses an unknown argument when the schema is closed", () => {
    const result = parse({ symbol: "ACME", extra: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Unexpected property \u0027extra\u0027");
  });

  test("refuses NaN for a number argument and names the property path", () => {
    const result = parse({ symbol: "ACME", lots: Number.NaN });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Expected type \u0027number\u0027 at \u0027/lots\u0027");
  });

  test("prefixes every refusal with the function name", () => {
    const result = parse({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.message.startsWith("Validation failed for function \u0027quote\u0027: "),
    ).toBe(true);
  });
});

describe("rpc helpers — A2uiRpcError", () => {
  test("carries code, message, functionCallId, surfaceId and name", () => {
    const err = new A2uiRpcError("TIMEOUT", "timed out", "call-1", "surface-1");
    expect(err instanceof Error).toBe(true);
    expect(err instanceof A2uiRpcError).toBe(true);
    expect(err.name).toBe("A2uiRpcError");
    expect(err.category).toBe("RpcError");
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toBe("timed out");
    expect(err.functionCallId).toBe("call-1");
    expect(err.surfaceId).toBe("surface-1");
  });

  test("leaves optional functionCallId and surfaceId undefined when omitted", () => {
    const err = new A2uiRpcError("CANCELLED", "cancelled");
    expect(err.functionCallId).toBeUndefined();
    expect(err.surfaceId).toBeUndefined();
  });

  test("keeps a non-enumerated custom code string as given", () => {
    expect(new A2uiRpcError("CUSTOM_CODE", "custom").code).toBe("CUSTOM_CODE");
  });
});

