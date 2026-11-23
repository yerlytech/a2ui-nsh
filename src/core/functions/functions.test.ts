import { describe, expect, test } from "nsh/test";
import { Catalog, CatalogRegistry } from "../catalog";
import { DataContext, DataModel } from "../data_model";
import { A2uiValidationError } from "../expression";
import {
  A2uiFunctionError,
  BASIC_V1_FUNCTIONS,
  FunctionRegistry,
  analyzeRegex,
  coerceDynamicBoolean,
  evaluateCheckRules,
  evaluateDynamicValue,
  evaluateFunctionCall,
  evaluateLength,
  evaluateNumeric,
  formatLocalizedCurrency,
  formatLocalizedNumber,
  formatTr35Date,
  selectPluralCategory,
} from "./index";

function makeContext(
  data: unknown = {},
  overrides: Partial<Parameters<typeof evaluateFunctionCall>[1]> = {},
) {
  const model = new DataModel(data);
  return {
    dataContext: new DataContext(model, "/"),
    functionRegistry: FunctionRegistry.withBasicV1(),
    ...overrides,
  };
}

describe("Basic Catalog v1.0 functions — locale formatting (en, tr, de)", () => {
  test("formats numbers in English, Turkish, and German deterministically", () => {
    expect(
      formatLocalizedNumber(1234567.895, {
        locale: "en-US",
        decimals: 2,
        grouping: true,
      }),
    ).toBe("1,234,567.90");
    expect(
      formatLocalizedNumber(1234567.895, {
        locale: "tr-TR",
        decimals: 2,
        grouping: true,
      }),
    ).toBe("1.234.567,90");
    expect(
      formatLocalizedNumber(1234567.895, {
        locale: "de-DE",
        decimals: 2,
        grouping: true,
      }),
    ).toBe("1.234.567,90");
    expect(
      formatLocalizedNumber(-1234.5, {
        locale: "tr-TR",
        decimals: 2,
        grouping: false,
      }),
    ).toBe("-1234,50");
    // Malformed or unknown locales fall back to en-US, never host ambient locale.
    expect(
      formatLocalizedNumber(1234.5, { locale: "en_US", decimals: 1 }),
    ).toBe("1,234.5");
    expect(
      formatLocalizedNumber(1234.5, { locale: "xx-YY", decimals: 1 }),
    ).toBe("1,234.5");
  });

  test("formats currencies in English, Turkish, and German", () => {
    expect(
      formatLocalizedCurrency(1234.5, "USD", { locale: "en-US", decimals: 2 }),
    ).toBe("$1,234.50");
    expect(
      formatLocalizedCurrency(1234.5, "TRY", { locale: "tr-TR", decimals: 2 }),
    ).toBe("₺1.234,50");
    expect(
      formatLocalizedCurrency(1234.5, "EUR", { locale: "de-DE", decimals: 2 }),
    ).toBe("1.234,50\u00A0€");
    expect(
      formatLocalizedCurrency(-99.9, "TRY", { locale: "tr-TR" }),
    ).toBe("-₺99,90");
    expect(
      formatLocalizedCurrency(5000, "JPY", { locale: "en-US" }),
    ).toBe("¥5,000");
  });

  test("formats Unicode TR35 dates in English, Turkish, and German", () => {
    const iso = "2026-01-16T14:30:05Z"; // Friday, January 16, 2026
    expect(formatTr35Date(iso, "EEEE, d MMMM yyyy HH:mm", "en-US")).toBe(
      "Friday, 16 January 2026 14:30",
    );
    expect(formatTr35Date(iso, "MMM dd, yy h:mm a", "en-US")).toBe(
      "Jan 16, 26 2:30 PM",
    );
    expect(formatTr35Date(iso, "EEEE, d MMMM yyyy HH:mm", "tr-TR")).toBe(
      "Cuma, 16 Ocak 2026 14:30",
    );
    expect(formatTr35Date(iso, "E, dd MMM yyyy h:mm a", "tr-TR")).toBe(
      "Cum, 16 Oca 2026 2:30 ÖS",
    );
    expect(formatTr35Date("2026-08-05T09:05:00Z", "EEEE, d. MMMM yyyy", "de-DE")).toBe(
      "Mittwoch, 5. August 2026",
    );
    expect(formatTr35Date("2026-03-01T08:00:00Z", "E, dd. MMM yyyy", "de-DE")).toBe(
      "So., 01. März 2026",
    );
    // Quoted TR35 literals and escaped apostrophe.
    expect(
      formatTr35Date("2026-09-04T12:00:00Z", "yyyy-MM-dd 'at' HH:mm ''ok''", "en-US"),
    ).toBe("2026-09-04 at 12:00 'ok'");
    // Preserves written offset for TR35 tokens and normalizes to UTC for ISO.
    expect(
      formatTr35Date("2026-09-04T23:30:00-05:00", "yyyy-MM-dd HH:mm", "en-US"),
    ).toBe("2026-09-04 23:30");
    expect(formatTr35Date("2026-09-04T23:30:00-05:00", "ISO")).toBe(
      "2026-09-05T04:30:00.000Z",
    );
    // Impossible calendar dates return "".
    expect(formatTr35Date("2026-02-29", "yyyy-MM-dd")).toBe("");
    expect(formatTr35Date("2024-02-29", "yyyy-MM-dd")).toBe("2024-02-29");
    expect(formatTr35Date("2026-02-30", "yyyy-MM-dd")).toBe("");
    expect(formatTr35Date("2026-13-01", "yyyy-MM-dd")).toBe("");
  });

  test("selects CLDR plural categories deterministically across locales", () => {
    expect(selectPluralCategory(1, "en-US")).toBe("one");
    expect(selectPluralCategory(0, "en-US")).toBe("other");
    expect(selectPluralCategory(1.5, "en-US")).toBe("other");
    expect(selectPluralCategory(1, "tr-TR")).toBe("one");
    expect(selectPluralCategory(2, "tr-TR")).toBe("other");
    expect(selectPluralCategory(1, "de-DE")).toBe("one");
    expect(selectPluralCategory(2, "de-DE")).toBe("other");
    expect(selectPluralCategory(2, "ru-RU")).toBe("few");
    expect(selectPluralCategory(5, "ru-RU")).toBe("many");
    expect(selectPluralCategory(21, "ru-RU")).toBe("one");
    expect(selectPluralCategory(0, "ar")).toBe("zero");
    expect(selectPluralCategory(2, "ar")).toBe("two");
    expect(selectPluralCategory(5, "ar")).toBe("few");
    expect(selectPluralCategory(15, "ar")).toBe("many");
    expect(selectPluralCategory(5, "ja")).toBe("other");
  });
});

describe("A2UI regex dialect & static ReDoS safety analyzer", () => {
  test("accepts portable linear patterns and rejects unsafe or disallowed syntax", () => {
    expect(analyzeRegex("^[a-z]+@[a-z]+\\.com$").ok).toBe(true);
    expect(analyzeRegex("^(?=.*\\d).{8,}$").ok).toBe(true);
    expect(analyzeRegex("\\w+\\s+\\w+").ok).toBe(true);
    expect(analyzeRegex("(?:ab+)?c").ok).toBe(true);
    expect(analyzeRegex("(a|b)*c").ok).toBe(true);
    expect(analyzeRegex("^\\u{1F600}+$").ok).toBe(true);

    const checkReject = (pat: string, reason: string) => {
      const res = analyzeRegex(pat);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe(reason);
      }
    };

    checkReject("a".repeat(257), "PATTERN_TOO_LONG");
    checkReject("(a)\\1", "UNSUPPORTED_SYNTAX");
    checkReject("(?<=a)b", "UNSUPPORTED_SYNTAX");
    checkReject("(?<name>a)", "UNSUPPORTED_SYNTAX");
    checkReject("(?i)a", "UNSUPPORTED_SYNTAX");
    checkReject("\\p{L}", "UNSUPPORTED_SYNTAX");
    checkReject("\\01", "UNSUPPORTED_SYNTAX");
    checkReject("(a+)+$", "NESTED_QUANTIFIER");
    checkReject("(a*){2,5}", "NESTED_QUANTIFIER");
    checkReject("(a|ab)*c", "OVERLAPPING_ALTERNATION");
    checkReject("(\\d|[0-5])+", "OVERLAPPING_ALTERNATION");
    checkReject("\\d+\\d+", "ADJACENT_OVERLAP");
    checkReject("\\d+\\s*\\d+", "ADJACENT_OVERLAP");
  });
});

describe("openUrl requiresUserActivation seam, @index, coercion & checks", () => {
  test("exposes all 14 Basic Catalog functions", () => {
    expect(BASIC_V1_FUNCTIONS.length).toBe(14);
  });

  test("openUrl enforces requiresUserActivation seam and scheme allowlist", () => {
    const opened: string[] = [];

    // Fails closed when userActivation is false.
    expect(() =>
      evaluateFunctionCall(
        { "@call": "openUrl", args: { url: "https://example.com" } },
        makeContext({}, { userActivation: false, openUrl: (u) => opened.push(u) }),
      ),
    ).toThrow(A2uiFunctionError);
    expect(opened).toEqual([]);

    // Succeeds and invokes injected seam when userActivation is true.
    const res = evaluateFunctionCall(
      { "@call": "openUrl", args: { url: "https://example.com/docs" } },
      makeContext({}, { userActivation: true, openUrl: (u) => opened.push(u) }),
    );
    expect(res).toBe(null);
    expect(opened).toEqual(["https://example.com/docs"]);

    // Rejects dangerous schemes even with userActivation.
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd"]) {
      expect(() =>
        evaluateFunctionCall(
          { "@call": "openUrl", args: { url: bad } },
          makeContext({}, { userActivation: true, openUrl: (u) => opened.push(u) }),
        ),
      ).toThrow(A2uiFunctionError);
    }
    expect(opened).toEqual(["https://example.com/docs"]);
  });

  test("@index reads innermost collection scope with offset and errors outside loops", () => {
    expect(
      evaluateFunctionCall(
        { "@call": "@index", args: {} },
        makeContext({}, { collectionIndices: [0, 3] }),
      ),
    ).toBe(3);

    expect(
      evaluateFunctionCall(
        { "@call": "@index", args: { offset: 1 } },
        makeContext({}, { collectionIndices: [2] }),
      ),
    ).toBe(3);

    expect(() =>
      evaluateFunctionCall({ "@call": "@index", args: {} }, makeContext({})),
    ).toThrow(A2uiValidationError);
  });

  test("DynamicBoolean coercion, length(null), numeric('') and @checks evaluation", () => {
    expect(coerceDynamicBoolean(true)).toBe(true);
    expect(coerceDynamicBoolean(false)).toBe(false);
    expect(coerceDynamicBoolean({ valid: true })).toBe(true);
    expect(coerceDynamicBoolean({ valid: false, message: "bad" })).toBe(false);
    expect(coerceDynamicBoolean("TRUE")).toBe(true);
    expect(coerceDynamicBoolean("yes")).toBe(false);
    expect(coerceDynamicBoolean(0)).toBe(false);
    expect(coerceDynamicBoolean(42)).toBe(true);
    expect(coerceDynamicBoolean(null)).toBe(false);
    expect(coerceDynamicBoolean({})).toBe(false);

    expect(evaluateLength(null, undefined, 10).valid).toBe(true);
    expect(evaluateLength(null, 1).valid).toBe(false);
    expect(evaluateNumeric("").valid).toBe(false);

    const catalogRegistry = new CatalogRegistry();
    catalogRegistry.register(Catalog.basicV1());
    const ctx = makeContext(
      { email: "bad", warn: { valid: false, code: "W", message: "Heads up", severity: "warning" } },
      {
        catalogRegistry,
        surfaceDefaultCatalogId: Catalog.basicV1().catalogId,
      },
    );
    const state = evaluateCheckRules(
      [
        { condition: { "@path": "/warn" } },
        {
          condition: { "@call": "email", args: { value: { "@path": "/email" } } },
        },
      ],
      (cond) => evaluateDynamicValue(cond, ctx),
    );
    expect(state.isValid).toBe(false);
    expect(state.validationErrors).toEqual([
      "Please enter a valid email address (e.g. user@example.com).",
    ]);
    expect(state.validationResults.length).toBe(2);
    expect(state.validationResults[0]?.severity).toBe("warning");
    expect(state.validationResults[1]?.code).toBe("INVALID_EMAIL");
  });
});
