import { describe, expect, test } from "nsh/test";
import {
  A2uiValidationError,
  COMPONENT_ENVELOPE_RESERVED_KEYS,
  isV1DataBinding,
  isV1FunctionCall,
  joinExpressionLiterals,
  stringifyInterpolatedValue,
  unescapeDynamicValue,
  validateReservedKeysInComponent,
  validateReservedKeysInDynamicValue,
} from "./expression";

function validationError(run: () => void): A2uiValidationError {
  try {
    run();
  } catch (error) {
    if (error instanceof A2uiValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an A2uiValidationError");
}

describe("validateReservedKeysInDynamicValue", () => {
  test("refuses each component envelope reserved key with its path", () => {
    for (const key of COMPONENT_ENVELOPE_RESERVED_KEYS) {
      const error = validationError(() =>
        validateReservedKeysInDynamicValue({ [key]: true }),
      );
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.path).toBe("/" + key);
    }
  });

  test("refuses a bare @ and other single-@ keys with their path", () => {
    for (const key of ["@", "@if", "@unknown"]) {
      const error = validationError(() =>
        validateReservedKeysInDynamicValue({ [key]: 1 }),
      );
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.path).toBe("/" + key);
    }
  });

  test("allows @@-escaped keys at any depth", () => {
    expect(() =>
      validateReservedKeysInDynamicValue({
        "@@path": "/static",
        "@@": "",
        nested: [{ "@@metadata": { note: "ok" } }],
      }),
    ).not.toThrow();
  });

  test("walks nested objects and arrays and reports the deep path", () => {
    const error = validationError(() =>
      validateReservedKeysInDynamicValue({
        outer: [{ inner: { "@if": true } }],
      }),
    );
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/outer/0/inner/@if");
  });
});

describe("validateReservedKeysInComponent", () => {
  test("allows the four component envelope reserved keys at top level", () => {
    expect(() =>
      validateReservedKeysInComponent({
        id: "c1",
        component: "Custom",
        "@catalogId": "basic",
        "@accessibility": { label: "Save" },
        "@metadata": { extensions: { custom_ext: true } },
        "@checks": [{ condition: true }],
      }),
    ).not.toThrow();
  });

  test("refuses a disallowed top-level single-@ key with its path", () => {
    for (const key of ["@", "@if", "@unknown"]) {
      const error = validationError(() =>
        validateReservedKeysInComponent({
          id: "c1",
          component: "Custom",
          [key]: 1,
        }),
      );
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.path).toBe("/" + key);
    }
  });

  test("allows @@-escaped keys at component top level", () => {
    expect(() =>
      validateReservedKeysInComponent({
        id: "c1",
        component: "Custom",
        "@@unknown": 1,
        "@@metadata": "kept",
      }),
    ).not.toThrow();
  });

  test("walks nested arrays and objects below a component property", () => {
    const error = validationError(() =>
      validateReservedKeysInComponent({
        id: "c1",
        component: "List",
        children: [{ cells: [{ "@if": true }] }],
      }),
    );
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/children/0/cells/0/@if");
  });

  test("refuses envelope reserved keys nested inside a component property", () => {
    const error = validationError(() =>
      validateReservedKeysInComponent({
        id: "c1",
        component: "Custom",
        details: { "@catalogId": "basic" },
      }),
    );
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/details/@catalogId");
  });

  test("rejects @metadata extension keys that are not UAX #31 identifiers", () => {
    const error = validationError(() =>
      validateReservedKeysInComponent({
        id: "c1",
        component: "Custom",
        "@metadata": { extensions: { "bad-key": true } },
      }),
    );
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/@metadata/extensions/bad-key");
  });

  test("walks dynamic values inside @accessibility and @checks", () => {
    const accessibility = validationError(() =>
      validateReservedKeysInComponent({
        id: "c1",
        component: "Custom",
        "@accessibility": { label: { "@if": true } },
      }),
    );
    expect(accessibility.code).toBe("VALIDATION_FAILED");
    expect(accessibility.path).toBe("/@accessibility/label/@if");

    const checks = validationError(() =>
      validateReservedKeysInComponent({
        id: "c1",
        component: "Custom",
        "@checks": [{ condition: { "@if": true } }],
      }),
    );
    expect(checks.code).toBe("VALIDATION_FAILED");
    expect(checks.path).toBe("/@checks/0/condition/@if");
  });
});

describe("unescapeDynamicValue", () => {
  test("turns @@ keys into @ keys at every object depth", () => {
    expect(
      unescapeDynamicValue({
        "@@path": "/top",
        "@@": "",
        nested: { "@@metadata": "ok", deeper: [{ "@@checks": 1 }] },
      }),
    ).toEqual({
      "@path": "/top",
      "@": "",
      nested: { "@metadata": "ok", deeper: [{ "@checks": 1 }] },
    });
  });

  test("leaves other keys and values untouched", () => {
    expect(
      unescapeDynamicValue({
        plain: "value",
        "@@path": "/static",
        binding: { "@path": "/keep" },
        values: ["@@literal", 1, true, null],
      }),
    ).toEqual({
      plain: "value",
      "@path": "/static",
      binding: { "@path": "/keep" },
      values: ["@@literal", 1, true, null],
    });
  });

  test("unescapes @@ keys in @call arguments and keeps the call shape", () => {
    expect(
      unescapeDynamicValue({
        "@call": "formatCurrency",
        catalogId: "basic",
        args: { value: { "@@path": "/price" } },
      }),
    ).toEqual({
      "@call": "formatCurrency",
      catalogId: "basic",
      args: { value: { "@path": "/price" } },
    });
  });

  test("does not mutate its input", () => {
    const input = {
      "@@path": "/static",
      nested: [{ "@@metadata": "ok" }],
      binding: { "@path": "/keep" },
    };
    const before = {
      "@@path": "/static",
      nested: [{ "@@metadata": "ok" }],
      binding: { "@path": "/keep" },
    };
    const output = unescapeDynamicValue(input) as Record<string, unknown>;
    expect(input).toEqual(before);
    expect(output).not.toBe(input);
    expect(output["nested"]).not.toBe(input.nested);
  });
});

describe("joinExpressionLiterals", () => {
  test("merges adjacent literals", () => {
    expect(joinExpressionLiterals(["a", "b", "c"])).toEqual(["abc"]);
  });

  test("drops empty literals and merges across them", () => {
    expect(joinExpressionLiterals(["", "a", "", "b", ""])).toEqual(["ab"]);
  });

  test("keeps literals apart around a path or call", () => {
    expect(
      joinExpressionLiterals([
        "before ",
        { path: "/name" },
        " after ",
        { call: "now", args: {}, returnType: "any" },
        "!",
      ]),
    ).toEqual([
      "before ",
      { path: "/name" },
      " after ",
      { call: "now", args: {}, returnType: "any" },
      "!",
    ]);
  });

  test("returns an empty list unchanged", () => {
    expect(joinExpressionLiterals([])).toEqual([]);
  });

  test("returns a single literal or path unchanged", () => {
    expect(joinExpressionLiterals(["solo"])).toEqual(["solo"]);
    expect(joinExpressionLiterals([{ path: "/x" }])).toEqual([{ path: "/x" }]);
  });
});

describe("isV1DataBinding", () => {
  test("accepts exactly one @path string member", () => {
    expect(isV1DataBinding({ "@path": "/user/name" })).toBe(true);
    expect(isV1DataBinding({ "@path": "" })).toBe(true);
  });

  test("rejects extra keys, non-string paths, arrays and null", () => {
    expect(isV1DataBinding({ "@path": "/x", extra: 1 })).toBe(false);
    expect(isV1DataBinding({ "@path": 1 })).toBe(false);
    expect(isV1DataBinding({ "@path": null })).toBe(false);
    expect(isV1DataBinding({})).toBe(false);
    expect(isV1DataBinding([{ "@path": "/x" }])).toBe(false);
    expect(isV1DataBinding(null)).toBe(false);
  });
});

describe("isV1FunctionCall", () => {
  test("accepts @call with optional args object and catalogId string", () => {
    expect(isV1FunctionCall({ "@call": "submit" })).toBe(true);
    expect(isV1FunctionCall({ "@call": "@index" })).toBe(true);
    expect(isV1FunctionCall({ "@call": "fn", args: {} })).toBe(true);
    expect(isV1FunctionCall({ "@call": "fn", args: { a: 1 } })).toBe(true);
    expect(isV1FunctionCall({ "@call": "fn", catalogId: "basic" })).toBe(true);
    expect(
      isV1FunctionCall({ "@call": "fn", args: { a: 1 }, catalogId: "basic" }),
    ).toBe(true);
  });

  test("rejects extra keys and wrong member types", () => {
    expect(isV1FunctionCall({ "@call": "fn", extra: 1 })).toBe(false);
    expect(isV1FunctionCall({ "@call": 1 })).toBe(false);
    expect(isV1FunctionCall({ "@call": null })).toBe(false);
    expect(isV1FunctionCall({ "@call": "fn", args: [] })).toBe(false);
    expect(isV1FunctionCall({ "@call": "fn", args: null })).toBe(false);
    expect(isV1FunctionCall({ "@call": "fn", args: "x" })).toBe(false);
    expect(isV1FunctionCall({ "@call": "fn", catalogId: 1 })).toBe(false);
  });

  test("rejects values without @call, arrays and null", () => {
    expect(isV1FunctionCall({})).toBe(false);
    expect(isV1FunctionCall({ args: {} })).toBe(false);
    expect(isV1FunctionCall([{ "@call": "fn" }])).toBe(false);
    expect(isV1FunctionCall(null)).toBe(false);
  });
});

describe("stringifyInterpolatedValue", () => {
  test("returns strings unchanged", () => {
    expect(stringifyInterpolatedValue("abc")).toBe("abc");
    expect(stringifyInterpolatedValue("")).toBe("");
  });

  test("formats numbers the way String does", () => {
    expect(stringifyInterpolatedValue(42)).toBe("42");
    expect(stringifyInterpolatedValue(-3.5)).toBe("-3.5");
  });

  test("formats -0, NaN and infinities the way String does", () => {
    expect(stringifyInterpolatedValue(-0)).toBe("0");
    expect(stringifyInterpolatedValue(NaN)).toBe("NaN");
    expect(stringifyInterpolatedValue(Infinity)).toBe("Infinity");
    expect(stringifyInterpolatedValue(-Infinity)).toBe("-Infinity");
  });

  test("formats booleans as true and false", () => {
    expect(stringifyInterpolatedValue(true)).toBe("true");
    expect(stringifyInterpolatedValue(false)).toBe("false");
  });

  test("renders null and undefined as the empty string", () => {
    expect(stringifyInterpolatedValue(null)).toBe("");
    expect(stringifyInterpolatedValue(undefined)).toBe("");
  });

  test("renders arrays and objects as JSON", () => {
    expect(stringifyInterpolatedValue([1, "two", null])).toBe(
      JSON.stringify([1, "two", null]),
    );
    expect(stringifyInterpolatedValue({ a: 1, b: [2] })).toBe(
      JSON.stringify({ a: 1, b: [2] }),
    );
  });
});
