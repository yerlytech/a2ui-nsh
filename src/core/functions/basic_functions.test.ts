import { describe, expect, test } from "nsh/test";
import { DataContext, DataModel } from "../data_model";
import { A2uiValidationError } from "../expression";
import {
  BASIC_V1_FUNCTIONS,
  SYSTEM_V1_FUNCTIONS,
  andFunction,
  emailFunction,
  evaluateEmail,
  evaluateLength,
  evaluateNumeric,
  evaluatePluralize,
  evaluateRegex,
  evaluateRequired,
  formatCurrencyFunction,
  formatDateFunction,
  formatNumberFunction,
  formatStringFunction,
  indexFunction,
  lengthFunction,
  notFunction,
  numericFunction,
  openUrlFunction,
  orFunction,
  pluralizeFunction,
  regexFunction,
  requiredFunction,
  validateSafeUrl,
} from "./basic_functions";
import {
  A2uiFunctionError,
  type FunctionExecutionContext,
} from "./types";

function makeContext(
  overrides: Partial<FunctionExecutionContext> = {},
): FunctionExecutionContext {
  return {
    dataContext: new DataContext(new DataModel({}), "/"),
    ...overrides,
  };
}

describe("evaluateRequired", () => {
  test("rejects empty string, null, undefined, and empty array", () => {
    expect(evaluateRequired("")).toEqual({
      valid: false,
      message: "This field is required.",
    });
    expect(evaluateRequired(null).valid).toBe(false);
    expect(evaluateRequired(undefined).valid).toBe(false);
    expect(evaluateRequired([]).valid).toBe(false);
  });

  test("accepts whitespace, zero, false, and non-empty values", () => {
    expect(evaluateRequired(" ")).toEqual({ valid: true });
    expect(evaluateRequired("\t\n")).toEqual({ valid: true });
    expect(evaluateRequired(0)).toEqual({ valid: true });
    expect(evaluateRequired(false)).toEqual({ valid: true });
    expect(evaluateRequired("0")).toEqual({ valid: true });
    expect(evaluateRequired(["x"])).toEqual({ valid: true });
    expect(evaluateRequired({ any: "object" })).toEqual({ valid: true });
  });
});

describe("evaluateRegex", () => {
  test("matches strings and coerces non-string values to text", () => {
    expect(evaluateRegex("abc123", "^[a-z]+\\d+$")).toEqual({ valid: true });
    expect(evaluateRegex(12345, "^\\d+$")).toEqual({ valid: true });
    expect(evaluateRegex(null, "^$")).toEqual({ valid: true });
    expect(evaluateRegex(undefined, "^$")).toEqual({ valid: true });
    expect(evaluateRegex("abc", "^\\d+$")).toEqual({
      valid: false,
      message: "Value does not match required pattern.",
    });
  });

  test("rejects a non-string pattern", () => {
    expect(() => evaluateRegex("abc", 42)).toThrow(A2uiFunctionError);
    expect(() => evaluateRegex("abc", 42)).toThrow(
      "regex requires a string 'pattern' argument",
    );
  });

  test("refuses a pattern outside the portable dialect", () => {
    expect(() => evaluateRegex("a", "(?<=a)b")).toThrow(A2uiFunctionError);
    expect(() => evaluateRegex("a", "(?<=a)b")).toThrow(/UNSUPPORTED_SYNTAX/);
    expect(() => evaluateRegex("a", "\\p{L}")).toThrow(/UNSUPPORTED_SYNTAX/);
  });

  test("caps the matched value at 4096 code points", () => {
    expect(evaluateRegex("a".repeat(4096), "a")).toEqual({ valid: true });
    expect(evaluateRegex("a".repeat(4097), "a")).toEqual({
      valid: false,
      message: "Value exceeds the maximum length for pattern matching.",
    });
  });
});

describe("evaluateLength", () => {
  test("checks min and max at, below, and above the bounds", () => {
    expect(evaluateLength("abc", 3, 3)).toEqual({ valid: true });
    expect(evaluateLength("ab", 3)).toEqual({
      valid: false,
      message: "Minimum length is 3.",
    });
    expect(evaluateLength("abcd", undefined, 3)).toEqual({
      valid: false,
      message: "Maximum length is 3.",
    });
    expect(evaluateLength("abcd", 2, 4)).toEqual({ valid: true });
    expect(evaluateLength("a", 2, 4).valid).toBe(false);
    expect(evaluateLength("abcde", 2, 4).valid).toBe(false);
  });

  test("supports a single bound and array values", () => {
    expect(evaluateLength("abc", 3)).toEqual({ valid: true });
    expect(evaluateLength("abc", undefined, 3)).toEqual({ valid: true });
    expect(evaluateLength([1, 2], 2, 2)).toEqual({ valid: true });
    expect(evaluateLength([], 1).valid).toBe(false);
  });

  test("treats non-string, non-array values as length zero and ignores bad bounds", () => {
    expect(evaluateLength(null, 0, 0)).toEqual({ valid: true });
    expect(evaluateLength(42, undefined, 0)).toEqual({ valid: true });
    expect(evaluateLength(42, 1).valid).toBe(false);
    expect(evaluateLength("a", "2", 1)).toEqual({ valid: true });
    expect(evaluateLength("abc", undefined, Number.NaN)).toEqual({ valid: true });
  });

  // google/A2UI 36725ee `typescript/core/web_core/src/universal/basic_catalog/functions.ts` uses String#length (UTF-16 code units) for `length`.
  test("counts UTF-16 code units, so a non-BMP emoji is two long", () => {
    expect(evaluateLength("😀", 2, 2).valid).toBe(true);
    expect(evaluateLength("😀", 1, 1).valid).toBe(false);
    expect(evaluateLength("a😀", 3, 3).valid).toBe(true);
  });
});

describe("evaluateNumeric", () => {
  test("checks numeric min and max at, below, and above the bounds", () => {
    expect(evaluateNumeric(5, 5, 5)).toEqual({ valid: true });
    expect(evaluateNumeric(4, 5)).toEqual({
      valid: false,
      message: "Minimum value is 5.",
    });
    expect(evaluateNumeric(6, undefined, 5)).toEqual({
      valid: false,
      message: "Maximum value is 5.",
    });
    expect(evaluateNumeric(5, 1, 10)).toEqual({ valid: true });
    expect(evaluateNumeric(0, 1, 10).valid).toBe(false);
    expect(evaluateNumeric(11, 1, 10).valid).toBe(false);
  });

  test("supports a single bound", () => {
    expect(evaluateNumeric(5, 5)).toEqual({ valid: true });
    expect(evaluateNumeric(4.9, 5).valid).toBe(false);
    expect(evaluateNumeric(5, undefined, 5)).toEqual({ valid: true });
    expect(evaluateNumeric(5.1, undefined, 5).valid).toBe(false);
  });

  test("parses numeric strings and rejects non-numeric values", () => {
    expect(evaluateNumeric("42", 42, 42)).toEqual({ valid: true });
    expect(evaluateNumeric(" 3.5 ", 3.5, 3.5)).toEqual({ valid: true });
    expect(evaluateNumeric("1e3", 1000, 1000)).toEqual({ valid: true });
    expect(evaluateNumeric("", 0, 10)).toEqual({
      valid: false,
      message: "Value must be a valid number.",
    });
    expect(evaluateNumeric("abc").valid).toBe(false);
    expect(evaluateNumeric(null).valid).toBe(false);
    expect(evaluateNumeric(true).valid).toBe(false);
    expect(evaluateNumeric(Number.NaN).valid).toBe(false);
    expect(evaluateNumeric(Number.POSITIVE_INFINITY).valid).toBe(false);
  });

  test("ignores non-number bounds", () => {
    expect(evaluateNumeric(0, "1", 10)).toEqual({ valid: true });
    expect(evaluateNumeric(50, 1, Number.NaN)).toEqual({ valid: true });
  });
});

describe("evaluateEmail", () => {
  test("accepts addresses the basic pattern defines as valid", () => {
    expect(evaluateEmail("user@example.com")).toEqual({ valid: true });
    expect(evaluateEmail("a.b+c%_d-e@sub.example.co.uk")).toEqual({ valid: true });
    expect(evaluateEmail("USER@EXAMPLE.ORG")).toEqual({ valid: true });
    expect(evaluateEmail("user123@domain.io")).toEqual({ valid: true });
  });

  test("rejects invalid addresses with the INVALID_EMAIL result", () => {
    expect(evaluateEmail("user@example")).toEqual({
      valid: false,
      code: "INVALID_EMAIL",
      message: "Please enter a valid email address (e.g. user@example.com).",
      severity: "error",
    });
    expect(evaluateEmail("user@example.c").valid).toBe(false);
    expect(evaluateEmail("@example.com").valid).toBe(false);
    expect(evaluateEmail("user@.com").valid).toBe(false);
    expect(evaluateEmail("user name@example.com").valid).toBe(false);
    expect(evaluateEmail("user@exa_mple.com").valid).toBe(false);
    expect(evaluateEmail("user@example.com ").valid).toBe(false);
    expect(evaluateEmail(42).valid).toBe(false);
    expect(evaluateEmail(null).valid).toBe(false);
  });
});

describe("evaluatePluralize", () => {
  test("prefers exact zero, one, and two overrides", () => {
    expect(
      evaluatePluralize({ value: 0, zero: "none", one: "one", other: "many" }, "en-US"),
    ).toBe("none");
    expect(
      evaluatePluralize({ value: 1, zero: "none", one: "one", other: "many" }, "en-US"),
    ).toBe("one");
    expect(
      evaluatePluralize({ value: 2, two: "pair", other: "many" }, "en-US"),
    ).toBe("pair");
    expect(evaluatePluralize({ value: "0", zero: "none" }, "en-US")).toBe("none");
    expect(evaluatePluralize({ value: 0, zero: 0 }, "en-US")).toBe("0");
  });

  test("falls back to the CLDR category and then other", () => {
    expect(evaluatePluralize({ value: 2, other: "many" }, "en-US")).toBe("many");
    expect(evaluatePluralize({ value: 1.5, other: "many" }, "en-US")).toBe("many");
    expect(evaluatePluralize({ value: 0, other: "many" }, "en-US")).toBe("many");
    expect(evaluatePluralize({ value: 1, other: "many" }, "en-US")).toBe("many");
    expect(evaluatePluralize({ value: 1 })).toBe("");
    expect(evaluatePluralize({ value: "not a number", other: "many" })).toBe("many");
  });

  test("uses locale plural categories and falls back to English", () => {
    expect(
      evaluatePluralize({ value: 2, few: "few", many: "many", other: "other" }, "ru-RU"),
    ).toBe("few");
    expect(
      evaluatePluralize({ value: 5, few: "few", many: "many", other: "other" }, "ru-RU"),
    ).toBe("many");
    expect(
      evaluatePluralize({ value: 21, one: "one", many: "many", other: "other" }, "ru-RU"),
    ).toBe("one");
    expect(
      evaluatePluralize({ value: 5, few: "few", many: "many", other: "other" }, "ar"),
    ).toBe("few");
    expect(evaluatePluralize({ value: 0, one: "un", other: "autres" }, "fr")).toBe("un");
    expect(evaluatePluralize({ value: 2, other: "other" }, "ja")).toBe("other");
    expect(evaluatePluralize({ value: 2, other: "other" }, "xx-YY")).toBe("other");
  });
});

describe("validateSafeUrl", () => {
  test("accepts http, https, mailto, and tel URLs and trims whitespace", () => {
    expect(validateSafeUrl("https://example.com/path?q=1#top")).toBe(
      "https://example.com/path?q=1#top",
    );
    expect(validateSafeUrl("http://example.com")).toBe("http://example.com");
    expect(validateSafeUrl("  https://example.com  ")).toBe("https://example.com");
    expect(validateSafeUrl("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
    expect(validateSafeUrl("mailto:user@example.com")).toBe("mailto:user@example.com");
    expect(validateSafeUrl("tel:+15551234567")).toBe("tel:+15551234567");
  });

  test("refuses dangerous, relative, and malformed URLs", () => {
    expect(() => validateSafeUrl("javascript:alert(1)")).toThrow(
      "Unsupported URL scheme: javascript:",
    );
    expect(() => validateSafeUrl("data:text/html,hi")).toThrow(
      "Unsupported URL scheme: data:",
    );
    expect(() => validateSafeUrl("file:///etc/passwd")).toThrow(
      "Unsupported URL scheme: file:",
    );
    expect(() => validateSafeUrl("example.com")).toThrow(
      "Invalid URL specified: example.com",
    );
    expect(() => validateSafeUrl("/relative/path")).toThrow(
      "Invalid URL specified: /relative/path",
    );
    expect(() => validateSafeUrl("//example.com/path")).toThrow(
      "Invalid URL specified: //example.com/path",
    );
    expect(() => validateSafeUrl("https://")).toThrow(
      "Invalid URL specified: https://",
    );
    expect(() => validateSafeUrl("https:///path")).toThrow(
      "Invalid URL specified: https:///path",
    );
    expect(() => validateSafeUrl("https:// example.com")).toThrow(
      "Invalid URL specified: https:// example.com",
    );
    expect(() => validateSafeUrl("mailto:")).toThrow("Invalid URL specified: mailto:");
    expect(() => validateSafeUrl("tel:")).toThrow("Invalid URL specified: tel:");
    expect(() => validateSafeUrl("https://exa\nmple.com")).toThrow(
      /Invalid URL specified/,
    );
  });

  test("refuses empty and non-string URLs", () => {
    expect(() => validateSafeUrl("")).toThrow(
      "openUrl requires a non-empty string 'url'",
    );
    expect(() => validateSafeUrl("   ")).toThrow(
      "openUrl requires a non-empty string 'url'",
    );
    expect(() => validateSafeUrl(42)).toThrow(
      "openUrl requires a non-empty string 'url'",
    );
    expect(() => validateSafeUrl(null)).toThrow(
      "openUrl requires a non-empty string 'url'",
    );
  });
});

describe("boolean functions", () => {
  test("and returns true only when every value coerces to true", () => {
    expect(andFunction.execute({ values: [true, true] }, makeContext())).toBe(true);
    expect(andFunction.execute({ values: [true, false] }, makeContext())).toBe(false);
    expect(andFunction.execute({ values: [false, false] }, makeContext())).toBe(false);
    expect(andFunction.execute({ values: [true, true, true] }, makeContext())).toBe(true);
    expect(andFunction.execute({ values: [true, { valid: true }] }, makeContext())).toBe(
      true,
    );
    expect(andFunction.execute({ values: [true, 1] }, makeContext())).toBe(true);
    expect(andFunction.execute({ values: [true, 0] }, makeContext())).toBe(false);
    expect(andFunction.execute({ values: [true, "true"] }, makeContext())).toBe(true);
    expect(andFunction.execute({ values: [true, "yes"] }, makeContext())).toBe(false);
    expect(andFunction.execute({ values: [true, null] }, makeContext())).toBe(false);
  });

  test("and rejects a missing or too-short values array", () => {
    expect(() => andFunction.execute({}, makeContext())).toThrow(A2uiFunctionError);
    expect(() => andFunction.execute({ values: [] }, makeContext())).toThrow(
      "Function 'and' requires a 'values' array with at least 2 items",
    );
    expect(() => andFunction.execute({ values: [true] }, makeContext())).toThrow(
      A2uiFunctionError,
    );
    expect(() => andFunction.execute({ values: "true,false" }, makeContext())).toThrow(
      A2uiFunctionError,
    );
  });

  test("or returns true when any value coerces to true", () => {
    expect(orFunction.execute({ values: [false, false] }, makeContext())).toBe(false);
    expect(orFunction.execute({ values: [false, true] }, makeContext())).toBe(true);
    expect(orFunction.execute({ values: [true, true] }, makeContext())).toBe(true);
    expect(orFunction.execute({ values: [false, { valid: true }] }, makeContext())).toBe(
      true,
    );
    expect(orFunction.execute({ values: [false, 1] }, makeContext())).toBe(true);
    expect(orFunction.execute({ values: [false, 0] }, makeContext())).toBe(false);
    expect(orFunction.execute({ values: [false, "TRUE"] }, makeContext())).toBe(true);
    expect(orFunction.execute({ values: [false, "yes"] }, makeContext())).toBe(false);
    expect(orFunction.execute({ values: [false, null] }, makeContext())).toBe(false);
  });

  test("or rejects a missing or too-short values array", () => {
    expect(() => orFunction.execute({}, makeContext())).toThrow(A2uiFunctionError);
    expect(() => orFunction.execute({ values: [false] }, makeContext())).toThrow(
      "Function 'or' requires a 'values' array with at least 2 items",
    );
    expect(() => orFunction.execute({ values: 1 }, makeContext())).toThrow(
      A2uiFunctionError,
    );
  });

  test("not negates the coerced value", () => {
    expect(notFunction.execute({ value: true }, makeContext())).toBe(false);
    expect(notFunction.execute({ value: false }, makeContext())).toBe(true);
    expect(notFunction.execute({ value: 0 }, makeContext())).toBe(true);
    expect(notFunction.execute({ value: 1 }, makeContext())).toBe(false);
    expect(notFunction.execute({ value: { valid: false } }, makeContext())).toBe(true);
    expect(notFunction.execute({ value: { valid: true } }, makeContext())).toBe(false);
    expect(notFunction.execute({ value: "TRUE" }, makeContext())).toBe(false);
    expect(notFunction.execute({ value: "yes" }, makeContext())).toBe(true);
    expect(notFunction.execute({ value: null }, makeContext())).toBe(true);
    expect(notFunction.execute({}, makeContext())).toBe(true);
  });
});

describe("indexFunction", () => {
  test("reads the innermost collection index and applies offsets", () => {
    expect(indexFunction.execute({}, makeContext({ collectionIndices: [7] }))).toBe(7);
    expect(indexFunction.execute({}, makeContext({ collectionIndices: [0, 3] }))).toBe(3);
    expect(
      indexFunction.execute({ offset: 1 }, makeContext({ collectionIndices: [0, 3] })),
    ).toBe(4);
    expect(
      indexFunction.execute({ offset: "2" }, makeContext({ collectionIndices: [3] })),
    ).toBe(5);
    expect(
      indexFunction.execute({ offset: null }, makeContext({ collectionIndices: [3] })),
    ).toBe(3);
    expect(
      indexFunction.execute({ offset: "abc" }, makeContext({ collectionIndices: [3] })),
    ).toBe(3);
  });

  test("passes through negative and out-of-range indices without clamping", () => {
    expect(indexFunction.execute({}, makeContext({ collectionIndices: [-1] }))).toBe(-1);
    expect(indexFunction.execute({}, makeContext({ collectionIndices: [99] }))).toBe(99);
    expect(
      indexFunction.execute({ offset: -2 }, makeContext({ collectionIndices: [3] })),
    ).toBe(1);
  });

  test("requires a number in a real collection index array", () => {
    const message =
      "@index function can only be evaluated inside a collection template iteration scope.";
    expect(() => indexFunction.execute({}, makeContext())).toThrow(A2uiValidationError);
    expect(() => indexFunction.execute({}, makeContext())).toThrow(message);
    expect(() =>
      indexFunction.execute({}, makeContext({ collectionIndices: [] })),
    ).toThrow(A2uiValidationError);
    expect(() =>
      indexFunction.execute(
        {},
        makeContext({ collectionIndices: "2" as unknown as readonly number[] }),
      ),
    ).toThrow(message);
    expect(() =>
      indexFunction.execute(
        {},
        makeContext({ collectionIndices: [1, "3" as unknown as number] }),
      ),
    ).toThrow(message);
  });
});

describe("function catalogs", () => {
  test("BASIC_V1_FUNCTIONS lists 14 unique exported implementations", () => {
    expect(BASIC_V1_FUNCTIONS).toHaveLength(14);
    expect(new Set(BASIC_V1_FUNCTIONS.map((fn) => fn.name)).size).toBe(14);
    expect(BASIC_V1_FUNCTIONS.map((fn) => fn.name)).toEqual([
      "required",
      "regex",
      "length",
      "numeric",
      "email",
      "formatString",
      "formatNumber",
      "formatCurrency",
      "formatDate",
      "pluralize",
      "openUrl",
      "and",
      "or",
      "not",
    ]);

    const exported = [
      requiredFunction,
      regexFunction,
      lengthFunction,
      numericFunction,
      emailFunction,
      formatStringFunction,
      formatNumberFunction,
      formatCurrencyFunction,
      formatDateFunction,
      pluralizeFunction,
      openUrlFunction,
      andFunction,
      orFunction,
      notFunction,
    ];
    for (const fn of BASIC_V1_FUNCTIONS) {
      expect(exported).toContain(fn);
    }
  });

  test("SYSTEM_V1_FUNCTIONS lists only the exported @index implementation", () => {
    expect(SYSTEM_V1_FUNCTIONS).toHaveLength(1);
    expect(SYSTEM_V1_FUNCTIONS[0]).toBe(indexFunction);
    expect(new Set(SYSTEM_V1_FUNCTIONS.map((fn) => fn.name)).size).toBe(1);
    expect(SYSTEM_V1_FUNCTIONS.map((fn) => fn.name)).toEqual(["@index"]);
  });
});
