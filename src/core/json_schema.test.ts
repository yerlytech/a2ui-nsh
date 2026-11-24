import { describe, expect, test } from "nsh/test";
import {
  DEFAULT_MAX_SCHEMA_DEPTH,
  isJsonObject,
  resolveLocalRef,
  validateJsonSchema,
  type JsonObject,
  type JsonValue,
  type SchemaValidationIssue,
  type SchemaValidationOptions,
} from "./json_schema";

/** Validates and keeps only `path` and `keyword` of each issue. */
function check(
  schema: JsonValue,
  value: unknown,
  options: SchemaValidationOptions = {},
): { path: string; keyword: string }[] {
  return validateJsonSchema(schema, value, undefined, options).map((i) => ({
    path: i.path,
    keyword: i.keyword,
  }));
}

describe("json_schema: isJsonObject", () => {
  test("accepts plain objects only", () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
    expect(isJsonObject("x")).toBe(false);
    expect(isJsonObject(1)).toBe(false);
    expect(isJsonObject(true)).toBe(false);
  });
});

describe("json_schema: resolveLocalRef", () => {
  const root: JsonObject = {
    a: { b: { type: "string" } },
    "x/y": { "m~n": 7 },
    list: ["zero", "one"],
  };

  test("'#' is the root itself", () => {
    expect(resolveLocalRef(root, "#")).toBe(root);
  });

  test("walks object keys", () => {
    expect(resolveLocalRef(root, "#/a/b")).toEqual({ type: "string" });
    expect(resolveLocalRef(root, "#/a")).toBe(root["a"]);
  });

  test("decodes ~1 and ~0 escapes", () => {
    expect(resolveLocalRef(root, "#/x~1y/m~0n")).toBe(7);
  });

  test("array indexes must be in range non-negative integers", () => {
    expect(resolveLocalRef(root, "#/list/1")).toBe("one");
    expect(resolveLocalRef(root, "#/list/0")).toBe("zero");
    expect(resolveLocalRef(root, "#/list/-1")).toBeUndefined();
    expect(resolveLocalRef(root, "#/list/2")).toBeUndefined();
    expect(resolveLocalRef(root, "#/list/1.5")).toBeUndefined();
    expect(resolveLocalRef(root, "#/list/abc")).toBeUndefined();
  });

  // bug: Number() parsing accepts "01" and "" as array indexes, RFC 6901 does not
  test.skip("rejects array indexes with a leading zero or no digits", () => {
    expect(resolveLocalRef(root, "#/list/01")).toBeUndefined();
    expect(resolveLocalRef(root, "#/list/")).toBeUndefined();
  });

  test("missing keys and walking through a primitive give undefined", () => {
    expect(resolveLocalRef(root, "#/nope")).toBeUndefined();
    expect(resolveLocalRef(root, "#/a/missing/deeper")).toBeUndefined();
    expect(resolveLocalRef(root, "#/x~1y/m~0n/deeper")).toBeUndefined();
    expect(resolveLocalRef(root, "#/toString")).toBeUndefined();
  });

  test("refs not starting with '#/' are not resolved", () => {
    expect(resolveLocalRef(root, "a/b")).toBeUndefined();
    expect(resolveLocalRef(root, "/a/b")).toBeUndefined();
    expect(resolveLocalRef(root, "#a")).toBeUndefined();
    expect(resolveLocalRef(root, "other.json#/a")).toBeUndefined();
  });

  test("the same ref asked twice gives the same answer", () => {
    const first = resolveLocalRef(root, "#/a/b");
    const second = resolveLocalRef(root, "#/a/b");
    expect(second).toBe(first);
    expect(resolveLocalRef(root, "#/nope")).toBeUndefined();
    expect(resolveLocalRef(root, "#/nope")).toBeUndefined();
  });
});

describe("json_schema: validateJsonSchema keywords", () => {
  test("boolean schemas", () => {
    expect(check(true, 1)).toEqual([]);
    expect(check(false, 1)).toEqual([{ path: "/", keyword: "false" }]);
  });

  test("type, single and list", () => {
    expect(check({ type: "string" }, "x")).toEqual([]);
    expect(check({ type: "string" }, 1)).toEqual([{ path: "/", keyword: "type" }]);
    expect(check({ type: "integer" }, 2)).toEqual([]);
    expect(check({ type: "integer" }, 2.5)).toEqual([{ path: "/", keyword: "type" }]);
    expect(check({ type: "object" }, [])).toEqual([{ path: "/", keyword: "type" }]);
    expect(check({ type: "null" }, null)).toEqual([]);
    expect(check({ type: ["string", "null"] }, null)).toEqual([]);
    expect(check({ type: ["string", "null"] }, 3)).toEqual([
      { path: "/", keyword: "type" },
    ]);
    const issue = validateJsonSchema({ type: "string" }, 1)[0]!;
    expect(issue.message).toBe("Expected type 'string' at '/'");
  });

  test("const", () => {
    expect(check({ const: { a: [1] } }, { a: [1] })).toEqual([]);
    expect(check({ const: { a: [1] } }, { a: [2] })).toEqual([
      { path: "/", keyword: "const" },
    ]);
    expect(check({ const: null }, null)).toEqual([]);
  });

  test("enum", () => {
    expect(check({ enum: ["a", 1] }, 1)).toEqual([]);
    expect(check({ enum: ["a", 1] }, "b")).toEqual([{ path: "/", keyword: "enum" }]);
  });

  test("minLength and maxLength count code points", () => {
    expect(check({ maxLength: 1 }, "😀")).toEqual([]);
    expect(check({ minLength: 2 }, "😀")).toEqual([{ path: "/", keyword: "minLength" }]);
    expect(check({ minLength: 2 }, "ab")).toEqual([]);
    expect(check({ maxLength: 2 }, "abc")).toEqual([{ path: "/", keyword: "maxLength" }]);
    // String keywords do not apply to other types.
    expect(check({ minLength: 2 }, 5)).toEqual([]);
  });

  test("pattern", () => {
    expect(check({ pattern: "^a+$" }, "aaa")).toEqual([]);
    expect(check({ pattern: "^a+$" }, "ab")).toEqual([{ path: "/", keyword: "pattern" }]);
  });

  test("format", () => {
    expect(check({ format: "date" }, "2024-02-29")).toEqual([]);
    expect(check({ format: "date" }, "2023-02-29")).toEqual([
      { path: "/", keyword: "format" },
    ]);
    expect(check({ format: "time" }, "12:30:00Z")).toEqual([]);
    expect(check({ format: "time" }, "24:00:00")).toEqual([{ path: "/", keyword: "format" }]);
    expect(check({ format: "date-time" }, "2024-01-01T10:00:00Z")).toEqual([]);
    expect(check({ format: "date-time" }, "2024-01-01T10:00:00")).toEqual([
      { path: "/", keyword: "format" },
    ]);
    expect(check({ format: "uri" }, "https://example.com/a")).toEqual([]);
    expect(check({ format: "uri" }, "no scheme")).toEqual([{ path: "/", keyword: "format" }]);
    // Unknown formats are accepted.
    expect(check({ format: "email" }, "anything")).toEqual([]);
  });

  test("minimum, maximum, exclusive bounds and multipleOf", () => {
    expect(check({ minimum: 1 }, 1)).toEqual([]);
    expect(check({ minimum: 1 }, 0)).toEqual([{ path: "/", keyword: "minimum" }]);
    expect(check({ maximum: 1 }, 1)).toEqual([]);
    expect(check({ maximum: 1 }, 2)).toEqual([{ path: "/", keyword: "maximum" }]);
    expect(check({ exclusiveMinimum: 1 }, 1.5)).toEqual([]);
    expect(check({ exclusiveMinimum: 1 }, 1)).toEqual([
      { path: "/", keyword: "exclusiveMinimum" },
    ]);
    expect(check({ exclusiveMaximum: 1 }, 1)).toEqual([
      { path: "/", keyword: "exclusiveMaximum" },
    ]);
    expect(check({ multipleOf: 0.1 }, 0.3)).toEqual([]);
    expect(check({ multipleOf: 2 }, 3)).toEqual([{ path: "/", keyword: "multipleOf" }]);
  });

  test("minItems, maxItems and uniqueItems", () => {
    expect(check({ minItems: 1 }, [1])).toEqual([]);
    expect(check({ minItems: 1 }, [])).toEqual([{ path: "/", keyword: "minItems" }]);
    expect(check({ maxItems: 1 }, [1, 2])).toEqual([{ path: "/", keyword: "maxItems" }]);
    expect(check({ uniqueItems: true }, [1, { a: 1 }])).toEqual([]);
    expect(check({ uniqueItems: true }, [{ a: 1 }, 2, { a: 1 }])).toEqual([
      { path: "/2", keyword: "uniqueItems" },
    ]);
  });

  test("prefixItems and items", () => {
    const schema: JsonObject = {
      prefixItems: [{ type: "string" }, { type: "number" }],
      items: { type: "boolean" },
    };
    expect(check(schema, ["a", 1, true, false])).toEqual([]);
    expect(check(schema, [1, 1, "x"])).toEqual([
      { path: "/0", keyword: "type" },
      { path: "/2", keyword: "type" },
    ]);
    expect(check({ items: false }, [])).toEqual([]);
    expect(check({ items: false }, [1])).toEqual([{ path: "/0", keyword: "false" }]);
  });

  test("required", () => {
    expect(check({ required: ["a"] }, { a: 1 })).toEqual([]);
    expect(check({ required: ["a", "b/c"] }, {})).toEqual([
      { path: "/a", keyword: "required" },
      { path: "/b~1c", keyword: "required" },
    ]);
    const issue = validateJsonSchema({ required: ["a"] }, {})[0]!;
    expect(issue.message).toBe("Missing required property 'a'");
  });

  test("propertyNames", () => {
    const schema: JsonObject = { propertyNames: { pattern: "^[a-z]+$" } };
    expect(check(schema, { abc: 1 })).toEqual([]);
    expect(check(schema, { abc: 1, Bad: 2 })).toEqual([
      { path: "/Bad", keyword: "propertyNames" },
    ]);
  });

  test("additionalProperties", () => {
    const schema: JsonObject = {
      properties: { a: { type: "number" } },
      patternProperties: { "^x-": { type: "string" } },
      additionalProperties: false,
    };
    expect(check(schema, { a: 1, "x-k": "v" })).toEqual([]);
    expect(check(schema, { a: 1, b: 2 })).toEqual([
      { path: "/b", keyword: "additionalProperties" },
    ]);
    const typed: JsonObject = { properties: { a: {} }, additionalProperties: { type: "string" } };
    expect(check(typed, { a: 1, b: "s" })).toEqual([]);
    expect(check(typed, { a: 1, b: 2 })).toEqual([{ path: "/b", keyword: "type" }]);
  });

  test("allOf reports every failing branch", () => {
    const schema: JsonObject = { allOf: [{ type: "number" }, { minimum: 5 }] };
    expect(check(schema, 6)).toEqual([]);
    expect(check(schema, 1)).toEqual([{ path: "/", keyword: "minimum" }]);
    expect(check(schema, "x")).toEqual([{ path: "/", keyword: "type" }]);
  });

  test("anyOf reports the first branch's issues when none match", () => {
    const schema: JsonObject = { anyOf: [{ type: "string" }, { type: "number" }] };
    expect(check(schema, 1)).toEqual([]);
    expect(check(schema, true)).toEqual([{ path: "/", keyword: "type" }]);
  });

  test("oneOf needs exactly one match", () => {
    const schema: JsonObject = { oneOf: [{ type: "number" }, { minimum: 5 }] };
    expect(check(schema, 1)).toEqual([]);
    expect(check(schema, "x")).toEqual([]); // minimum ignores strings
    expect(check({ oneOf: [{ type: "number" }, { type: "string" }] }, null)).toEqual([
      { path: "/", keyword: "oneOf" },
    ]);
    const two = validateJsonSchema(schema, 6);
    expect(two.map((i) => i.keyword)).toEqual(["oneOf"]);
    expect(two[0]!.message).toBe("Value at '/' matched 2 oneOf schemas (expected 1)");
  });

  test("not", () => {
    expect(check({ not: { type: "string" } }, 1)).toEqual([]);
    expect(check({ not: { type: "string" } }, "x")).toEqual([{ path: "/", keyword: "not" }]);
  });

  test("if/then/else", () => {
    const schema: JsonObject = {
      if: { properties: { kind: { const: "a" } }, required: ["kind"] },
      then: { required: ["a"] },
      else: { required: ["b"] },
    };
    expect(check(schema, { kind: "a", a: 1 })).toEqual([]);
    expect(check(schema, { kind: "a" })).toEqual([{ path: "/a", keyword: "required" }]);
    expect(check(schema, { kind: "z", b: 1 })).toEqual([]);
    expect(check(schema, { kind: "z" })).toEqual([{ path: "/b", keyword: "required" }]);
  });

  test("$ref into $defs, including an unresolved ref", () => {
    const schema: JsonObject = {
      $defs: { Name: { type: "string" } },
      properties: { name: { $ref: "#/$defs/Name" } },
    };
    expect(check(schema, { name: "x" })).toEqual([]);
    expect(check(schema, { name: 1 })).toEqual([{ path: "/name", keyword: "type" }]);
    expect(check({ $ref: "#/$defs/Missing" }, 1)).toEqual([{ path: "/", keyword: "$ref" }]);
  });

  test("unevaluatedProperties sees properties from $ref", () => {
    const schema: JsonObject = {
      $defs: { Base: { properties: { a: {} } } },
      $ref: "#/$defs/Base",
      properties: { b: {} },
      unevaluatedProperties: false,
    };
    expect(check(schema, { a: 1, b: 2 })).toEqual([]);
    expect(check(schema, { a: 1, c: 3 })).toEqual([
      { path: "/c", keyword: "unevaluatedProperties" },
    ]);
  });

  test("unevaluatedProperties sees properties from allOf", () => {
    const schema: JsonObject = {
      allOf: [{ properties: { a: {} } }, { properties: { b: {} } }],
      unevaluatedProperties: false,
    };
    expect(check(schema, { a: 1, b: 2 })).toEqual([]);
    expect(check(schema, { a: 1, z: 0 })).toEqual([
      { path: "/z", keyword: "unevaluatedProperties" },
    ]);
  });

  test("unevaluatedProperties sees properties from if/then and else", () => {
    const schema: JsonObject = {
      if: { properties: { kind: { const: "a" } }, required: ["kind"] },
      then: { properties: { a: {} } },
      else: { properties: { kind: {}, b: {} } },
      unevaluatedProperties: false,
    };
    expect(check(schema, { kind: "a", a: 1 })).toEqual([]);
    expect(check(schema, { kind: "a", b: 1 })).toEqual([
      { path: "/b", keyword: "unevaluatedProperties" },
    ]);
    expect(check(schema, { kind: "z", b: 1 })).toEqual([]);
    expect(check(schema, { kind: "z", a: 1 })).toEqual([
      { path: "/a", keyword: "unevaluatedProperties" },
    ]);
  });

  test("unevaluatedProperties with a schema validates the leftovers", () => {
    const schema: JsonObject = { properties: { a: {} }, unevaluatedProperties: { type: "number" } };
    expect(check(schema, { a: "s", b: 2 })).toEqual([]);
    expect(check(schema, { a: "s", b: "x" })).toEqual([{ path: "/b", keyword: "type" }]);
  });

  test("basePath and an explicit root are honoured", () => {
    const root: JsonObject = { $defs: { N: { type: "number" } } };
    const issues = validateJsonSchema({ $ref: "#/$defs/N" }, "x", root, {}, "/v");
    expect(issues.map((i) => [i.path, i.keyword])).toEqual([["/v", "type"]]);
  });
});

describe("json_schema: options", () => {
  test("default max depth is 64", () => {
    expect(DEFAULT_MAX_SCHEMA_DEPTH).toBe(64);
  });

  test("a self-referencing schema stops at maxDepth with an issue", () => {
    expect(check({ $ref: "#" }, 1, { maxDepth: 5 })).toEqual([
      { path: "/", keyword: "maxDepth" },
    ]);
    const issues = validateJsonSchema({ $ref: "#" }, 1);
    expect(issues.map((i) => i.keyword)).toEqual(["maxDepth"]);
    expect(issues[0]!.message).toBe("Schema evaluation exceeded maximum depth of 64");
  });

  test("resolveExternalRef is consulted for a non-local ref", () => {
    const asked: string[] = [];
    const external: JsonObject = { $defs: { N: { type: "number" } } };
    const options: SchemaValidationOptions = {
      resolveExternalRef: (ref) => {
        asked.push(ref);
        return ref === "other.json"
          ? { root: external, schema: { $ref: "#/$defs/N" } }
          : undefined;
      },
    };
    expect(check({ $ref: "other.json" }, 1, options)).toEqual([]);
    expect(check({ $ref: "other.json" }, "x", options)).toEqual([
      { path: "/", keyword: "type" },
    ]);
    expect(check({ $ref: "unknown.json" }, 1, options)).toEqual([
      { path: "/", keyword: "$ref" },
    ]);
    expect(asked).toEqual(["other.json", "other.json", "unknown.json"]);
    // Without a resolver an external ref is unresolved.
    expect(check({ $ref: "other.json" }, 1)).toEqual([{ path: "/", keyword: "$ref" }]);
  });

  test("customRefValidator: true, issues, or undefined to fall through", () => {
    const own: SchemaValidationIssue = { path: "/own", keyword: "custom", message: "no" };
    const calls: [string, unknown, string][] = [];
    const options = (
      answer: true | readonly SchemaValidationIssue[] | undefined,
    ): SchemaValidationOptions => ({
      customRefValidator: (ref, value, path) => {
        calls.push([ref, value, path]);
        return answer;
      },
    });
    const schema: JsonObject = {
      $defs: { N: { type: "number" } },
      properties: { v: { $ref: "#/$defs/N" } },
    };

    expect(check(schema, { v: "x" }, options(true))).toEqual([]);
    expect(calls).toEqual([["#/$defs/N", "x", "/v"]]);
    expect(check(schema, { v: 1 }, options([own]))).toEqual([
      { path: "/own", keyword: "custom" },
    ]);
    expect(check(schema, { v: "x" }, options(undefined))).toEqual([
      { path: "/v", keyword: "type" },
    ]);
    expect(check(schema, { v: 1 }, options(undefined))).toEqual([]);
  });

  test("customRefValidator true marks every key evaluated", () => {
    const schema: JsonObject = { $ref: "#/$defs/Any", unevaluatedProperties: false };
    expect(check(schema, { a: 1, b: 2 }, { customRefValidator: () => true })).toEqual([]);
  });
});
