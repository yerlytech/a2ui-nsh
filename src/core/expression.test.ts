import { describe, expect, test } from "nsh/test";
import { DataContext, DataModel } from "./data_model";
import {
  A2uiExpressionError,
  A2uiValidationError,
  evaluateExpressionTemplate,
  isDisallowedSingleAtKey,
  isValidFunctionCallName,
  isValidUax31Identifier,
  parseExpressionTemplate,
  stringifyInterpolatedValue,
  unescapeAtKey,
  unescapeDynamicValue,
  validateReservedKeysInComponent,
  validateReservedKeysInDynamicValue,
} from "./expression";

describe("expression parser & reserved keys", () => {
  test("parses literals, bindings, nested calls, and escaped markers", () => {
    expect(parseExpressionTemplate("Hello ${/user/name}!")).toEqual([
      "Hello ",
      { path: "/user/name" },
      "!",
    ]);
    expect(parseExpressionTemplate("\\${literal} ${real}")).toEqual([
      "${literal} ",
      { path: "real" },
    ]);
    expect(
      parseExpressionTemplate(
        "Total: ${formatCurrency(value: /price, currency: 'USD')}",
      ),
    ).toEqual([
      "Total: ",
      {
        call: "formatCurrency",
        args: { value: { path: "/price" }, currency: "USD" },
        returnType: "any",
      },
    ]);
  });

  test("evaluates templates against DataContext and injected function seam", () => {
    const model = new DataModel({
      user: { name: "Alice" },
      price: 49.99,
      active: true,
    });
    const ctx = new DataContext(model);

    expect(
      evaluateExpressionTemplate(
        "Hi ${/user/name}, active=${/active}, missing=${/none}",
        ctx,
      ),
    ).toBe("Hi Alice, active=true, missing=");

    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rendered = evaluateExpressionTemplate(
      "Total: ${formatCurrency(value: /price, currency: 'USD')}",
      ctx,
      (name, args) => {
        calls.push({ name, args: { ...args } });
        return `$${String(args["value"])}`;
      },
    );
    expect(rendered).toBe("Total: $49.99");
    expect(calls).toEqual([
      { name: "formatCurrency", args: { value: 49.99, currency: "USD" } },
    ]);
  });

  test("coerces interpolated values per A2UI v1.0 type conversion rules", () => {
    expect(stringifyInterpolatedValue("abc")).toBe("abc");
    expect(stringifyInterpolatedValue(42)).toBe("42");
    expect(stringifyInterpolatedValue(false)).toBe("false");
    expect(stringifyInterpolatedValue(null)).toBe("");
    expect(stringifyInterpolatedValue(undefined)).toBe("");
    expect(stringifyInterpolatedValue({ a: 1 })).toBe('{"a":1}');
    expect(stringifyInterpolatedValue([1, 2])).toBe("[1,2]");
  });

  test("enforces custom maxDepth and maxLength limits", () => {
    expect(() =>
      parseExpressionTemplate("${${${x}}}", { maxDepth: 2 }),
    ).toThrow(A2uiExpressionError);
    expect(() =>
      parseExpressionTemplate("123456", { maxLength: 5 }),
    ).toThrow(A2uiExpressionError);
  });

  test("validates UAX #31 identifiers including non-ASCII and supplementary code points", () => {
    expect(isValidUax31Identifier("UserProfileCard")).toBe(true);
    expect(isValidUax31Identifier("_internal_1")).toBe(true);
    expect(isValidUax31Identifier("größe")).toBe(true);
    expect(isValidUax31Identifier("値")).toBe(true);
    expect(isValidUax31Identifier("𠮷a")).toBe(true);

    expect(isValidUax31Identifier("")).toBe(false);
    expect(isValidUax31Identifier("1stItem")).toBe(false);
    expect(isValidUax31Identifier("User Card")).toBe(false);
    expect(isValidUax31Identifier("submit-form")).toBe(false);
    expect(isValidUax31Identifier("a½")).toBe(false);
    expect(isValidUax31Identifier("a🚀")).toBe(false);

    expect(isValidFunctionCallName("@index")).toBe(true);
    expect(isValidFunctionCallName("@other")).toBe(false);
    expect(isValidFunctionCallName("formatString")).toBe(true);
  });

  test("enforces single-@ reserved keys and unescapes @@ prefix doubling", () => {
    expect(isDisallowedSingleAtKey("@")).toBe(true);
    expect(isDisallowedSingleAtKey("@if")).toBe(true);
    expect(isDisallowedSingleAtKey("@metadata")).toBe(true);
    expect(isDisallowedSingleAtKey("@@path")).toBe(false);
    expect(isDisallowedSingleAtKey("@@")).toBe(false);
    expect(isDisallowedSingleAtKey("path")).toBe(false);

    expect(unescapeAtKey("@@path")).toBe("@path");
    expect(unescapeAtKey("@@")).toBe("@");
    expect(unescapeAtKey("@@@x")).toBe("@@x");
    expect(unescapeAtKey("plain")).toBe("plain");

    expect(() =>
      validateReservedKeysInDynamicValue({ "@if": true }),
    ).toThrow(A2uiValidationError);
    expect(() =>
      validateReservedKeysInDynamicValue({ "@": "x" }),
    ).toThrow(A2uiValidationError);
    expect(() =>
      validateReservedKeysInComponent({
        id: "c1",
        component: "Custom",
        "@unknown": 1,
      }),
    ).toThrow(A2uiValidationError);

    validateReservedKeysInComponent({
      id: "c1",
      component: "Custom",
      "@catalogId": "basic",
      "@metadata": { extensions: { custom_ext: 1 } },
      details: { "@@path": "/static", nested: { "@@metadata": "ok" } },
    });

    expect(
      unescapeDynamicValue({
        "@@path": "/static",
        nested: [{ "@@metadata": "ok" }],
        binding: { "@path": "/keep" },
      }),
    ).toEqual({
      "@path": "/static",
      nested: [{ "@metadata": "ok" }],
      binding: { "@path": "/keep" },
    });
  });
});
