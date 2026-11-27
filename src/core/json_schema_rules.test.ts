import { describe, expect, test } from "nsh/test";
import {
  validateJsonSchema,
  type JsonObject,
  type JsonValue,
  type SchemaValidationOptions,
} from "./json_schema";

// One rule per test for src/core/json_schema.ts (validateJsonSchema and its
// keyword/format helpers). The broad scenarios live in json_schema.test.ts;
// this file pins the rules that file does not name on its own.

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

const typeIssue = { path: "/", keyword: "type" };

describe("json_schema rules: type", () => {
  test("number refuses NaN and Infinity", () => {
    expect(check({ type: "number" }, Number.NaN)).toEqual([typeIssue]);
    expect(check({ type: "number" }, Number.POSITIVE_INFINITY)).toEqual([typeIssue]);
    expect(check({ type: "number" }, Number.NEGATIVE_INFINITY)).toEqual([typeIssue]);
    expect(check({ type: "number" }, 1.5)).toEqual([]);
  });

  test("integer accepts 1.0 and -0 and refuses 1.5", () => {
    expect(check({ type: "integer" }, 1.0)).toEqual([]);
    expect(check({ type: "integer" }, -0)).toEqual([]);
    expect(check({ type: "integer" }, 1.5)).toEqual([typeIssue]);
  });

  test("an unknown type name refuses every value", () => {
    for (const value of [null, true, 0, "x", [], {}]) {
      expect(check({ type: "float" }, value)).toEqual([typeIssue]);
    }
  });

  test("a type list accepts null as one of string or null and refuses 0", () => {
    expect(check({ type: ["string", "null"] }, null)).toEqual([]);
    expect(check({ type: ["string", "null"] }, 0)).toEqual([typeIssue]);
  });

  test("object refuses an array and null", () => {
    expect(check({ type: "object" }, {})).toEqual([]);
    expect(check({ type: "object" }, [])).toEqual([typeIssue]);
    expect(check({ type: "object" }, null)).toEqual([typeIssue]);
  });
});

describe("json_schema rules: contains", () => {
  test("an empty array gives one contains issue at the root", () => {
    expect(check({ contains: { type: "number" } }, [])).toEqual([
      { path: "/", keyword: "contains" },
    ]);
  });

  test("one matching item passes and non-matching items add no issues", () => {
    expect(check({ contains: { type: "number" } }, ["a", 1, true])).toEqual([]);
  });

  test("a nested array reports its own path", () => {
    const schema: JsonObject = {
      properties: { list: { contains: { type: "string" } } },
    };
    expect(check(schema, { list: [1, 2] })).toEqual([
      { path: "/list", keyword: "contains" },
    ]);
  });

  test("a non-array value ignores contains", () => {
    expect(check({ contains: { type: "number" } }, "abc")).toEqual([]);
    expect(check({ contains: { type: "number" } }, { a: 1 })).toEqual([]);
    expect(check({ contains: { type: "number" } }, null)).toEqual([]);
  });

  test("minContains and maxContains are not read today", () => {
    // differs from Draft 2020-12: minContains and maxContains set the minimum
    // and maximum number of matching items, but this evaluator only checks
    // that at least one item matches.
    expect(check({ contains: { type: "number" }, minContains: 2 }, [1])).toEqual([]);
    expect(
      check({ contains: { type: "number" }, maxContains: 1 }, [1, 2]),
    ).toEqual([]);
  });
});

describe("json_schema rules: minProperties and maxProperties", () => {
  test("exactly the bounds passes", () => {
    const schema: JsonObject = { minProperties: 2, maxProperties: 2 };
    expect(check(schema, { a: 1, b: 2 })).toEqual([]);
  });

  test("one under the minimum fails at the object path", () => {
    const schema: JsonObject = {
      properties: { obj: { minProperties: 2 } },
    };
    expect(check(schema, { obj: { a: 1 } })).toEqual([
      { path: "/obj", keyword: "minProperties" },
    ]);
  });

  test("one over the maximum fails at the object path", () => {
    const schema: JsonObject = {
      properties: { obj: { maxProperties: 1 } },
    };
    expect(check(schema, { obj: { a: 1, b: 2 } })).toEqual([
      { path: "/obj", keyword: "maxProperties" },
    ]);
  });

  test("an array or string value ignores both keywords", () => {
    const schema: JsonObject = { minProperties: 2, maxProperties: 2 };
    expect(check(schema, [])).toEqual([]);
    expect(check(schema, "ab")).toEqual([]);
  });
});

describe("json_schema rules: patternProperties on its own", () => {
  test("a matching key is checked against its schema at its own path", () => {
    const schema: JsonObject = {
      patternProperties: { "^x-": { type: "number" } },
    };
    expect(check(schema, { "x-a": "s", other: "s" })).toEqual([
      { path: "/x-a", keyword: "type" },
    ]);
  });

  test("a key matching two patterns is checked by both", () => {
    const schema: JsonObject = {
      patternProperties: {
        "^a": { type: "number" },
        "b$": { minLength: 5 },
      },
    };
    expect(check(schema, { ab: "x" })).toEqual([
      { path: "/ab", keyword: "type" },
      { path: "/ab", keyword: "minLength" },
    ]);
  });

  test("an invalid pattern is skipped without throwing", () => {
    const schema: JsonObject = {
      patternProperties: { "(": { type: "number" } },
    };
    expect(check(schema, { a: "x" })).toEqual([]);
  });

  test("matched keys are accepted by additionalProperties: false", () => {
    const schema: JsonObject = {
      patternProperties: { "^x-": {} },
      additionalProperties: false,
    };
    expect(check(schema, { "x-a": 1 })).toEqual([]);
    expect(check(schema, { "x-a": 1, b: 2 })).toEqual([
      { path: "/b", keyword: "additionalProperties" },
    ]);
  });

  test("matched keys are accepted by unevaluatedProperties: false", () => {
    const schema: JsonObject = {
      patternProperties: { "^x-": {} },
      unevaluatedProperties: false,
    };
    expect(check(schema, { "x-a": 1 })).toEqual([]);
    expect(check(schema, { "x-a": 1, b: 2 })).toEqual([
      { path: "/b", keyword: "unevaluatedProperties" },
    ]);
  });
});

describe("json_schema rules: pattern", () => {
  test("a pattern that needs the u flag matches Turkish letters", () => {
    expect(check({ pattern: "^\\p{L}+$" }, "ğüş")).toEqual([]);
    expect(check({ pattern: "^\\p{L}+$" }, "abc123")).toEqual([
      { path: "/", keyword: "pattern" },
    ]);
  });

  test("a pattern invalid under u but valid without it still matches", () => {
    expect(check({ pattern: "^a\\-b$" }, "a-b")).toEqual([]);
    expect(check({ pattern: "^a\\-b$" }, "axb")).toEqual([
      { path: "/", keyword: "pattern" },
    ]);
  });

  test("an invalid pattern adds no issue", () => {
    // Pinned: a pattern that does not compile is skipped instead of failing.
    expect(check({ pattern: "(" }, "anything")).toEqual([]);
  });

  test("a non-string value ignores pattern", () => {
    expect(check({ pattern: "^a+$" }, 123)).toEqual([]);
    expect(check({ pattern: "^a+$" }, null)).toEqual([]);
    expect(check({ pattern: "^a+$" }, ["a"])).toEqual([]);
  });
});

describe("json_schema rules: format date", () => {
  test("a real leap day passes and impossible dates fail", () => {
    const schema: JsonObject = { format: "date" };
    expect(check(schema, "2024-02-29")).toEqual([]);
    for (const value of [
      "2023-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-00-10",
      "2026-4-1",
    ]) {
      expect(check(schema, value)).toEqual([{ path: "/", keyword: "format" }]);
    }
  });
});

describe("json_schema rules: format time", () => {
  test("a leap second and both offset forms pass, bad times fail", () => {
    const schema: JsonObject = { format: "time" };
    for (const value of ["23:59:60", "12:00:00.123+03:00", "12:00:00Z"]) {
      expect(check(schema, value)).toEqual([]);
    }
    for (const value of ["24:00:00", "12:60:00", "12:00", "12:00:00+3:00"]) {
      expect(check(schema, value)).toEqual([{ path: "/", keyword: "format" }]);
    }
  });
});

describe("json_schema rules: format date-time", () => {
  test("case and space variants pass and invalid parts fail", () => {
    const schema: JsonObject = { format: "date-time" };
    for (const value of [
      "2026-11-27T10:00:00Z",
      "2026-11-27t10:00:00z",
      "2026-11-27 10:00:00+03:00",
    ]) {
      expect(check(schema, value)).toEqual([]);
    }
    for (const value of [
      "2026-11-27T10:00:00",
      "2026-02-30T10:00:00Z",
      "2026-11-27T25:00:00Z",
    ]) {
      expect(check(schema, value)).toEqual([{ path: "/", keyword: "format" }]);
    }
  });
});

describe("json_schema rules: format uri", () => {
  test("absolute URIs pass and non-URIs fail", () => {
    const schema: JsonObject = { format: "uri" };
    expect(check(schema, "mailto:a@b")).toEqual([]);
    expect(check(schema, "urn:x")).toEqual([]);
    for (const value of ["//host/path", "1http://x", "https://x y", "http:"]) {
      expect(check(schema, value)).toEqual([{ path: "/", keyword: "format" }]);
    }
  });

  test("an unknown format accepts anything", () => {
    // Pinned: Draft 2020-12 leaves unknown formats as annotations.
    expect(check({ format: "email" }, "anything")).toEqual([]);
    expect(check({ format: "email" }, "not an email")).toEqual([]);
  });

  test("a non-string value ignores format", () => {
    expect(check({ format: "date" }, 5)).toEqual([]);
    expect(check({ format: "date" }, null)).toEqual([]);
    expect(check({ format: "date" }, {})).toEqual([]);
  });
});

describe("json_schema rules: issue paths", () => {
  test("property names escape slash and tilde", () => {
    expect(check({ required: ["a/b", "c~d"] }, {})).toEqual([
      { path: "/a~1b", keyword: "required" },
      { path: "/c~0d", keyword: "required" },
    ]);
  });

  test("a root-level issue uses a single slash", () => {
    expect(check({ type: "string" }, 1)).toEqual([
      { path: "/", keyword: "type" },
    ]);
  });

  test("basePath prefixes every path", () => {
    const rootIssue = validateJsonSchema({ type: "string" }, 1, undefined, {}, "/v");
    expect(rootIssue.map((i) => [i.path, i.keyword])).toEqual([["/v", "type"]]);

    const nested = validateJsonSchema(
      { properties: { "a/b": { type: "string" } } },
      { "a/b": 1 },
      undefined,
      {},
      "/v",
    );
    expect(nested.map((i) => [i.path, i.keyword])).toEqual([
      ["/v/a~1b", "type"],
    ]);
  });
});
