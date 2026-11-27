import { describe, expect, test } from "nsh/test";
import { DataContext, DataModel } from "../data_model";
import { A2uiValidationError } from "../expression";
import {
  andFunction,
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
  notFunction,
  openUrlFunction,
  orFunction,
  validateSafeUrl,
} from "./basic_functions";
// Side effect: wires formatString's ${fn(...)} template dispatcher.
import "./evaluator";
import { A2uiFunctionError, type FunctionExecutionContext } from "./types";

// One rule per test for src/core/functions/basic_functions.ts. The broad
// scenarios live in basic_functions.test.ts and functions.test.ts; this file
// pins each rule on its own.

function makeContext(
  overrides: Partial<FunctionExecutionContext> = {},
  data: Record<string, unknown> = {},
): FunctionExecutionContext {
  return {
    dataContext: new DataContext(new DataModel(data), "/"),
    ...overrides,
  };
}

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe("evaluateRequired rules", () => {
  test("an array holding only null still counts as filled", () => {
    expect(evaluateRequired([null])).toEqual({ valid: true });
  });

  test("an empty object counts as filled", () => {
    expect(evaluateRequired({})).toEqual({ valid: true });
  });

  test("NaN counts as filled, because only null, undefined, empty string and empty array are empty", () => {
    expect(evaluateRequired(Number.NaN)).toEqual({ valid: true });
  });

  test("a refusal carries the fixed required message and no code", () => {
    expect(evaluateRequired(undefined)).toEqual({
      valid: false,
      message: "This field is required.",
    });
  });
});

describe("evaluateRegex rules", () => {
  test("refuses a null or undefined pattern with EXPRESSION_ERROR", () => {
    for (const pattern of [null, undefined]) {
      const err = thrownBy(() => evaluateRegex("abc", pattern));
      expect(err instanceof A2uiFunctionError).toBe(true);
      expect((err as A2uiFunctionError).code).toBe("EXPRESSION_ERROR");
      expect((err as A2uiFunctionError).functionName).toBe("regex");
    }
  });

  test("refuses a RegExp object as the pattern", () => {
    expect(() => evaluateRegex("abc", /abc/)).toThrow(
      "regex requires a string 'pattern' argument",
    );
  });

  test("an empty pattern matches every value", () => {
    expect(evaluateRegex("anything", "")).toEqual({ valid: true });
    expect(evaluateRegex("", "")).toEqual({ valid: true });
  });

  test("an unanchored pattern matches anywhere in the value", () => {
    expect(evaluateRegex("abc123", "\\d")).toEqual({ valid: true });
  });

  test("a boolean value is matched as its text", () => {
    expect(evaluateRegex(true, "^true$")).toEqual({ valid: true });
  });

  test("the 4096 cap counts code points, so 4096 astral characters still match", () => {
    expect(evaluateRegex("\u{1F600}".repeat(4096), "")).toEqual({ valid: true });
    expect(evaluateRegex("\u{1F600}".repeat(4097), "").valid).toBe(false);
  });
});

describe("evaluateLength rules", () => {
  test("min is inclusive", () => {
    expect(evaluateLength("abc", 3)).toEqual({ valid: true });
    expect(evaluateLength("ab", 3)).toEqual({ valid: false, message: "Minimum length is 3." });
  });

  test("max is inclusive", () => {
    expect(evaluateLength("abc", undefined, 3)).toEqual({ valid: true });
    expect(evaluateLength("abcd", undefined, 3)).toEqual({
      valid: false,
      message: "Maximum length is 3.",
    });
  });

  test("min is checked before max when min is above max", () => {
    expect(evaluateLength("ab", 5, 1)).toEqual({ valid: false, message: "Minimum length is 5." });
    expect(evaluateLength("abcdef", 5, 1)).toEqual({
      valid: false,
      message: "Maximum length is 1.",
    });
  });

  test("null and undefined have length zero", () => {
    expect(evaluateLength(null, 1).valid).toBe(false);
    expect(evaluateLength(undefined, 0)).toEqual({ valid: true });
  });

  test("whitespace counts toward the length", () => {
    expect(evaluateLength("   ", 3)).toEqual({ valid: true });
  });

  test("ignores NaN, infinite, and numeric-string bounds", () => {
    expect(evaluateLength("a", Number.NaN, Number.NaN)).toEqual({ valid: true });
    expect(evaluateLength("a", Number.POSITIVE_INFINITY)).toEqual({ valid: true });
    expect(evaluateLength("a", "5")).toEqual({ valid: true });
  });

  test("an array counts its items", () => {
    expect(evaluateLength([1, 2], 2, 2)).toEqual({ valid: true });
    expect(evaluateLength([], 1).valid).toBe(false);
  });

  // The Basic Catalog is silent on fractional bounds; they compare as numbers.
  test("a fractional bound compares as a number", () => {
    expect(evaluateLength("ab", 1.5)).toEqual({ valid: true });
    expect(evaluateLength("a", 1.5).valid).toBe(false);
  });
});

describe("evaluateNumeric rules", () => {
  test("min is inclusive", () => {
    expect(evaluateNumeric(5, 5)).toEqual({ valid: true });
    expect(evaluateNumeric(4.999, 5)).toEqual({ valid: false, message: "Minimum value is 5." });
  });

  test("max is inclusive", () => {
    expect(evaluateNumeric(5, undefined, 5)).toEqual({ valid: true });
    expect(evaluateNumeric(5.001, undefined, 5)).toEqual({
      valid: false,
      message: "Maximum value is 5.",
    });
  });

  test("a numeric string with surrounding whitespace is read as its number", () => {
    expect(evaluateNumeric(" 42 ", 42, 42)).toEqual({ valid: true });
  });

  test("an empty or whitespace string is not a number", () => {
    expect(evaluateNumeric("").valid).toBe(false);
    expect(evaluateNumeric("   ").valid).toBe(false);
  });

  test("Infinity, written or numeric, is not a valid number", () => {
    expect(evaluateNumeric("Infinity").valid).toBe(false);
    expect(evaluateNumeric(Number.POSITIVE_INFINITY).valid).toBe(false);
  });

  test("null, booleans, and arrays are not numbers", () => {
    expect(evaluateNumeric(null)).toEqual({ valid: false, message: "Value must be a valid number." });
    expect(evaluateNumeric(true).valid).toBe(false);
    expect(evaluateNumeric([1]).valid).toBe(false);
  });

  // Strings are read with Number(), so exponent and hex forms are numbers today.
  test("exponent and hex strings are read as numbers", () => {
    expect(evaluateNumeric("1e3", 1000, 1000)).toEqual({ valid: true });
    expect(evaluateNumeric("0x10", 16, 16)).toEqual({ valid: true });
  });

  test("negative zero meets a min of zero", () => {
    expect(evaluateNumeric(-0, 0)).toEqual({ valid: true });
  });
});

describe("evaluateEmail rules", () => {
  test("a non-string value is refused", () => {
    expect(evaluateEmail(42).valid).toBe(false);
    expect(evaluateEmail(null).valid).toBe(false);
    expect(evaluateEmail(["a@b.co"]).valid).toBe(false);
  });

  test("surrounding whitespace is refused, not trimmed", () => {
    expect(evaluateEmail(" user@example.com").valid).toBe(false);
    expect(evaluateEmail("user@example.com ").valid).toBe(false);
  });

  test("a one-letter top-level domain is refused", () => {
    expect(evaluateEmail("user@example.c").valid).toBe(false);
  });

  test("a second @ is refused", () => {
    expect(evaluateEmail("user@host@example.com").valid).toBe(false);
  });

  test("plus tags and subdomains are accepted", () => {
    expect(evaluateEmail("first.last+tag@mail.example.co.uk")).toEqual({ valid: true });
  });

  test("a refusal carries code, message, and error severity", () => {
    expect(evaluateEmail("")).toEqual({
      valid: false,
      code: "INVALID_EMAIL",
      message: "Please enter a valid email address (e.g. user@example.com).",
      severity: "error",
    });
  });
});

describe("evaluatePluralize rules", () => {
  test("a numeric string value selects the same branch as the number", () => {
    expect(evaluatePluralize({ value: "1", one: "item", other: "items" }, "en")).toBe("item");
  });

  test("the exact two override applies even where CLDR has no two category", () => {
    expect(evaluatePluralize({ value: 2, two: "pair", other: "many" }, "en")).toBe("pair");
  });

  test("zero without a zero key falls through to the CLDR category", () => {
    expect(evaluatePluralize({ value: 0, one: "one", other: "other" }, "en")).toBe("other");
  });

  test("one without a one key falls back to other", () => {
    expect(evaluatePluralize({ value: 1, other: "items" }, "en")).toBe("items");
  });

  test("a non-numeric value selects other", () => {
    expect(evaluatePluralize({ value: "many", one: "one", other: "other" }, "en")).toBe("other");
  });

  test("with no matching key and no other, the result is empty", () => {
    expect(evaluatePluralize({ value: 5, one: "one" }, "en")).toBe("");
  });

  test("a non-string branch value is written as its text", () => {
    expect(evaluatePluralize({ value: 3, other: 7 }, "en")).toBe("7");
  });
});

describe("validateSafeUrl allowed schemes", () => {
  test("allows https with a host", () => {
    expect(validateSafeUrl("https://example.com")).toBe("https://example.com");
  });

  test("allows http with a host", () => {
    expect(validateSafeUrl("http://example.com:8080/a")).toBe("http://example.com:8080/a");
  });

  test("allows mailto with an address", () => {
    expect(validateSafeUrl("mailto:a@example.com?subject=Hi")).toBe(
      "mailto:a@example.com?subject=Hi",
    );
  });

  test("allows tel with a number", () => {
    expect(validateSafeUrl("tel:+90-212-555-0000")).toBe("tel:+90-212-555-0000");
  });

  test("reads the scheme case-insensitively and returns the URL as written", () => {
    expect(validateSafeUrl("HtTpS://Example.com")).toBe("HtTpS://Example.com");
    expect(validateSafeUrl("MAILTO:a@example.com")).toBe("MAILTO:a@example.com");
    expect(validateSafeUrl("Tel:123")).toBe("Tel:123");
  });

  test("returns the URL with surrounding whitespace trimmed", () => {
    expect(validateSafeUrl("\t https://example.com \n")).toBe("https://example.com");
  });
});

describe("validateSafeUrl refused schemes", () => {
  test("refuses javascript:", () => {
    expect(() => validateSafeUrl("javascript:alert(1)")).toThrow(
      "Unsupported URL scheme: javascript:",
    );
  });

  test("refuses javascript: in mixed case, reported in lowercase", () => {
    expect(() => validateSafeUrl("JaVaScRiPt:alert(1)")).toThrow(
      "Unsupported URL scheme: javascript:",
    );
  });

  test("refuses javascript: that looks like it has a host", () => {
    expect(() => validateSafeUrl("javascript://example.com/%0Aalert(1)")).toThrow(
      "Unsupported URL scheme: javascript:",
    );
  });

  test("refuses data:", () => {
    expect(() => validateSafeUrl("DATA:text/html;base64,PHNjcmlwdD4=")).toThrow(
      "Unsupported URL scheme: data:",
    );
  });

  test("refuses vbscript:", () => {
    expect(() => validateSafeUrl("vbscript:msgbox(1)")).toThrow(
      "Unsupported URL scheme: vbscript:",
    );
  });

  test("refuses file:", () => {
    expect(() => validateSafeUrl("FILE:///C:/Windows")).toThrow("Unsupported URL scheme: file:");
  });

  test("refuses other schemes such as ftp:, blob:, and about:", () => {
    expect(() => validateSafeUrl("ftp://example.com")).toThrow("Unsupported URL scheme: ftp:");
    expect(() => validateSafeUrl("blob:https://example.com/x")).toThrow(
      "Unsupported URL scheme: blob:",
    );
    expect(() => validateSafeUrl("about:blank")).toThrow("Unsupported URL scheme: about:");
  });

  test("leading whitespace before javascript: is trimmed, then the scheme is refused", () => {
    expect(() => validateSafeUrl("  \t\njavascript:alert(1)")).toThrow(
      "Unsupported URL scheme: javascript:",
    );
  });

  test("a leading control character before the scheme is refused as invalid", () => {
    expect(() => validateSafeUrl("\x01javascript:alert(1)")).toThrow(
      "Invalid URL specified",
    );
    expect(() => validateSafeUrl("\x00https://example.com")).toThrow(
      "Invalid URL specified",
    );
  });

  test("a control character inside the scheme is refused as invalid", () => {
    expect(() => validateSafeUrl("java\tscript:alert(1)")).toThrow("Invalid URL specified");
    expect(() => validateSafeUrl("java\x7Fscript:alert(1)")).toThrow(
      "Invalid URL specified",
    );
  });

  test("a zero-width character before the scheme is refused as invalid", () => {
    expect(() => validateSafeUrl("\u{200B}javascript:alert(1)")).toThrow(
      "Invalid URL specified",
    );
  });
});

describe("validateSafeUrl refused shapes", () => {
  test("refuses a relative URL", () => {
    expect(() => validateSafeUrl("./page")).toThrow("Invalid URL specified: ./page");
    expect(() => validateSafeUrl("?q=1")).toThrow("Invalid URL specified: ?q=1");
    expect(() => validateSafeUrl("#top")).toThrow("Invalid URL specified: #top");
  });

  test("refuses http without //", () => {
    expect(() => validateSafeUrl("http:example.com")).toThrow(
      "Invalid URL specified: http:example.com",
    );
  });

  test("refuses https with backslashes instead of //", () => {
    expect(() => validateSafeUrl("https:\\\\evil.example")).toThrow("Invalid URL specified");
  });

  test("throws an A2uiFunctionError with EXPRESSION_ERROR naming openUrl", () => {
    const err = thrownBy(() => validateSafeUrl("javascript:alert(1)"));
    expect(err instanceof A2uiFunctionError).toBe(true);
    expect((err as A2uiFunctionError).code).toBe("EXPRESSION_ERROR");
    expect((err as A2uiFunctionError).functionName).toBe("openUrl");
  });

  test("refuses undefined, objects, and arrays as non-string URLs", () => {
    for (const url of [undefined, {}, ["https://example.com"]]) {
      expect(() => validateSafeUrl(url)).toThrow("openUrl requires a non-empty string 'url'");
    }
  });
});

describe("openUrl rules", () => {
  test("refuses with USER_ACTIVATION_REQUIRED when activation is false, before checking the URL", () => {
    const opened: string[] = [];
    const err = thrownBy(() =>
      openUrlFunction.execute(
        { url: "javascript:alert(1)" },
        makeContext({ userActivation: false, openUrl: (u) => opened.push(u) }),
      ),
    );
    expect((err as A2uiFunctionError).code).toBe("USER_ACTIVATION_REQUIRED");
    expect(opened).toEqual([]);
  });

  test("never calls the opener for an unsafe URL", () => {
    const opened: string[] = [];
    expect(() =>
      openUrlFunction.execute(
        { url: "data:text/html,x" },
        makeContext({ userActivation: true, openUrl: (u) => opened.push(u) }),
      ),
    ).toThrow("Unsupported URL scheme: data:");
    expect(opened).toEqual([]);
  });

  test("passes the trimmed URL to the opener and returns null", () => {
    const opened: string[] = [];
    const result = openUrlFunction.execute(
      { url: "  https://example.com  " },
      makeContext({ userActivation: true, openUrl: (u) => opened.push(u) }),
    );
    expect(result).toBeNull();
    expect(opened).toEqual(["https://example.com"]);
  });

  // The activation check is left to the caller when userActivation is not set.
  test("an unset userActivation does not refuse", () => {
    expect(openUrlFunction.execute({ url: "https://example.com" }, makeContext())).toBeNull();
  });
});

describe("formatString rules", () => {
  test("null and undefined values format as an empty string", () => {
    expect(formatStringFunction.execute({ value: null }, makeContext())).toBe("");
    expect(formatStringFunction.execute({}, makeContext())).toBe("");
  });

  test("a non-string value is formatted as its text", () => {
    expect(formatStringFunction.execute({ value: 42 }, makeContext())).toBe("42");
  });

  test("a path interpolation reads the data model", () => {
    const ctx = makeContext({}, { user: { name: "Ada" } });
    expect(formatStringFunction.execute({ value: "Hi ${/user/name}" }, ctx)).toBe("Hi Ada");
  });

  test("an escaped interpolation stays literal", () => {
    expect(formatStringFunction.execute({ value: "\\${x}" }, makeContext())).toBe("${x}");
  });

  test("a template call is dispatched to the named function", () => {
    const ctx = makeContext({ locale: "en-US" });
    expect(
      formatStringFunction.execute({ value: "n=${formatNumber(value: 1234.5)}" }, ctx),
    ).toBe("n=1,234.5");
  });

  test("a failing template call throws an A2uiFunctionError", () => {
    const err = thrownBy(() =>
      formatStringFunction.execute({ value: "x${noSuchFunction(value: 1)}" }, makeContext()),
    );
    expect(err instanceof A2uiFunctionError).toBe(true);
  });

  test("with an error sink, a failing template call renders empty and is reported", () => {
    const errors: Error[] = [];
    const ctx = makeContext({ onTemplatePartError: (e) => errors.push(e) });
    expect(
      formatStringFunction.execute({ value: "a${noSuchFunction(value: 1)}b" }, ctx),
    ).toBe("ab");
    expect(errors.length).toBe(1);
    expect(errors[0] instanceof A2uiFunctionError).toBe(true);
  });
});

describe("formatNumber rules", () => {
  const ctx = makeContext({ locale: "en-US" });

  test("a non-numeric value formats as an empty string", () => {
    expect(formatNumberFunction.execute({ value: "abc" }, ctx)).toBe("");
    expect(formatNumberFunction.execute({ value: null }, ctx)).toBe("");
    expect(formatNumberFunction.execute({ value: true }, ctx)).toBe("");
  });

  test("a numeric string value is formatted as its number", () => {
    expect(formatNumberFunction.execute({ value: "1234" }, ctx)).toBe("1,234");
  });

  test("non-numeric or null decimals fall back to the default style", () => {
    expect(formatNumberFunction.execute({ value: 1.23456, decimals: "x" }, ctx)).toBe("1.235");
    expect(formatNumberFunction.execute({ value: 1.23456, decimals: null }, ctx)).toBe("1.235");
  });

  test("a numeric-string decimals is read as its number", () => {
    expect(formatNumberFunction.execute({ value: 1.5, decimals: "2" }, ctx)).toBe("1.50");
  });

  test("grouping is coerced as a DynamicBoolean", () => {
    expect(formatNumberFunction.execute({ value: 1234, grouping: "false" }, ctx)).toBe("1234");
    expect(formatNumberFunction.execute({ value: 1234, grouping: 0 }, ctx)).toBe("1234");
    expect(formatNumberFunction.execute({ value: 1234, grouping: "TRUE" }, ctx)).toBe("1,234");
  });
});

describe("formatCurrency rules", () => {
  const ctx = makeContext({ locale: "en-US" });

  test("a missing, empty, or whitespace currency formats as an empty string", () => {
    expect(formatCurrencyFunction.execute({ value: 5 }, ctx)).toBe("");
    expect(formatCurrencyFunction.execute({ value: 5, currency: "" }, ctx)).toBe("");
    expect(formatCurrencyFunction.execute({ value: 5, currency: "  " }, ctx)).toBe("");
  });

  test("a non-string currency formats as an empty string", () => {
    expect(formatCurrencyFunction.execute({ value: 5, currency: 840 }, ctx)).toBe("");
  });

  test("a non-numeric value formats as an empty string", () => {
    expect(formatCurrencyFunction.execute({ value: "abc", currency: "USD" }, ctx)).toBe("");
  });

  test("the currency code is trimmed before use", () => {
    expect(formatCurrencyFunction.execute({ value: 5, currency: " USD " }, ctx)).toBe(
      formatCurrencyFunction.execute({ value: 5, currency: "USD" }, ctx),
    );
  });
});

describe("formatDate rules", () => {
  test("a non-string format falls back to yyyy-MM-dd", () => {
    expect(formatDateFunction.execute({ value: "2026-03-07T10:00:00Z", format: 5 }, makeContext())).toBe(
      "2026-03-07",
    );
  });

  test("an impossible date formats as an empty string", () => {
    expect(formatDateFunction.execute({ value: "2026-02-30", format: "yyyy" }, makeContext())).toBe("");
  });

  test("names follow the context locale", () => {
    expect(
      formatDateFunction.execute({ value: "2026-03-07", format: "MMMM" }, makeContext({ locale: "de" })),
    ).toBe("März");
  });
});

describe("and, or, not with non-boolean inputs", () => {
  const ctx = makeContext();

  test("and coerces strings: only case-insensitive true is true", () => {
    expect(andFunction.execute({ values: ["TRUE", "true"] }, ctx)).toBe(true);
    expect(andFunction.execute({ values: ["true", "yes"] }, ctx)).toBe(false);
  });

  test("and coerces numbers: zero and NaN are false", () => {
    expect(andFunction.execute({ values: [1, -2] }, ctx)).toBe(true);
    expect(andFunction.execute({ values: [1, 0] }, ctx)).toBe(false);
    expect(andFunction.execute({ values: [1, Number.NaN] }, ctx)).toBe(false);
  });

  test("or treats null, objects, and arrays as false", () => {
    expect(orFunction.execute({ values: [null, {}, [true]] }, ctx)).toBe(false);
  });

  test("or reads a validation result by its valid flag", () => {
    expect(orFunction.execute({ values: [false, { valid: true }] }, ctx)).toBe(true);
  });

  test("or refuses a values argument that is not an array", () => {
    expect(() => orFunction.execute({ values: "true,true" }, ctx)).toThrow(A2uiFunctionError);
  });

  test("and refuses a one-item values array", () => {
    expect(() => andFunction.execute({ values: [true] }, ctx)).toThrow(
      "Function 'and' requires a 'values' array with at least 2 items",
    );
  });

  test("not of a non-boolean negates its coerced value", () => {
    expect(notFunction.execute({ value: "false" }, ctx)).toBe(true);
    expect(notFunction.execute({ value: "TRUE" }, ctx)).toBe(false);
    expect(notFunction.execute({ value: 0 }, ctx)).toBe(true);
    expect(notFunction.execute({ value: null }, ctx)).toBe(true);
    expect(notFunction.execute({}, ctx)).toBe(true);
  });
});

describe("@index rules", () => {
  test("outside any collection it throws A2uiValidationError", () => {
    expect(() => indexFunction.execute({}, makeContext())).toThrow(A2uiValidationError);
    expect(() => indexFunction.execute({}, makeContext({ collectionIndices: [] }))).toThrow(
      A2uiValidationError,
    );
  });

  test("a non-finite innermost index throws A2uiValidationError", () => {
    expect(() =>
      indexFunction.execute({}, makeContext({ collectionIndices: [0, Number.NaN] })),
    ).toThrow(A2uiValidationError);
  });

  test("a numeric-string offset is read as its number", () => {
    expect(indexFunction.execute({ offset: "2" }, makeContext({ collectionIndices: [3] }))).toBe(5);
  });

  test("a non-numeric offset is ignored", () => {
    expect(indexFunction.execute({ offset: "x" }, makeContext({ collectionIndices: [3] }))).toBe(3);
    expect(indexFunction.execute({ offset: null }, makeContext({ collectionIndices: [3] }))).toBe(3);
  });
});
