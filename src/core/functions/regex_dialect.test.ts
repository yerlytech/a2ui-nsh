import { describe, expect, test } from "nsh/test";
import type { RegexRejectReason } from "./regex_dialect";
import {
  MAX_REGEX_PATTERN_CODE_POINTS,
  MAX_REGEX_VALUE_CODE_POINTS,
  analyzeRegex,
  compileSafeRegex,
  countCodePoints,
} from "./regex_dialect";
import { A2uiFunctionError } from "./types";

function expectRejected(pattern: string, reason: RegexRejectReason): void {
  const result = analyzeRegex(pattern);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toBe(reason);
  }
}

describe("regex dialect: countCodePoints", () => {
  test("counts code points, not UTF-16 code units", () => {
    expect(countCodePoints("")).toBe(0);
    expect(countCodePoints("abc")).toBe(3);
    expect(countCodePoints("a b")).toBe(3);
    expect(countCodePoints("\u{1F600}")).toBe(1);
    expect(countCodePoints("e\u0301")).toBe(2);
  });
});

describe("regex dialect: PATTERN_TOO_LONG", () => {
  test("accepts exactly 256 code points and rejects 257", () => {
    expect(MAX_REGEX_PATTERN_CODE_POINTS).toBe(256);
    expect(analyzeRegex("a".repeat(256)).ok).toBe(true);
    expectRejected("a".repeat(257), "PATTERN_TOO_LONG");
  });

  test("measures code points rather than UTF-16 units for astral patterns", () => {
    const emoji = "\u{1F600}";
    expect(countCodePoints(emoji.repeat(200))).toBe(200);
    expect(emoji.repeat(200).length).toBe(400);
    expect(analyzeRegex(emoji.repeat(200)).ok).toBe(true);
    expectRejected(emoji.repeat(257), "PATTERN_TOO_LONG");
  });

  test("exposes the matched-value limit", () => {
    expect(MAX_REGEX_VALUE_CODE_POINTS).toBe(4096);
  });
});

describe("regex dialect: UNSUPPORTED_SYNTAX", () => {
  test("rejects backreferences", () => {
    expectRejected("(a)\\1", "UNSUPPORTED_SYNTAX");
    expectRejected("(a)(b)\\2", "UNSUPPORTED_SYNTAX");
  });

  test("rejects lookbehind assertions", () => {
    expectRejected("(?<=a)b", "UNSUPPORTED_SYNTAX");
    expectRejected("(?<!a)b", "UNSUPPORTED_SYNTAX");
  });

  test("rejects named groups", () => {
    expectRejected("(?<name>a)", "UNSUPPORTED_SYNTAX");
  });

  test("rejects Unicode property escapes", () => {
    expectRejected("\\p{L}", "UNSUPPORTED_SYNTAX");
    expectRejected("\\P{L}", "UNSUPPORTED_SYNTAX");
  });

  test("rejects control, octal, and inline-flag escapes", () => {
    expectRejected("\\cJ", "UNSUPPORTED_SYNTAX");
    expectRejected("\\07", "UNSUPPORTED_SYNTAX");
    expectRejected("(?i)a", "UNSUPPORTED_SYNTAX");
  });

  test("rejects unbalanced groups and character classes", () => {
    expectRejected("(a", "UNSUPPORTED_SYNTAX");
    expectRejected("[a", "UNSUPPORTED_SYNTAX");
  });
});

describe("regex dialect: accepted portable syntax", () => {
  test("accepts classes, ranges, shorthands, and anchors", () => {
    expect(analyzeRegex("[a-z0-9_]+").ok).toBe(true);
    expect(analyzeRegex("[^\\s]+").ok).toBe(true);
    expect(analyzeRegex("\\d\\w\\s").ok).toBe(true);
    expect(analyzeRegex("^abc$").ok).toBe(true);
    expect(analyzeRegex("\\bword\\b").ok).toBe(true);
  });

  test("accepts lookahead and non-capturing groups", () => {
    expect(analyzeRegex("(?=abc)abc").ok).toBe(true);
    expect(analyzeRegex("(?!abc)xyz").ok).toBe(true);
    expect(analyzeRegex("(?:ab)+").ok).toBe(true);
    expect(analyzeRegex("(a)(?:b)").ok).toBe(true);
  });

  test("accepts bounded quantifiers and astral character classes", () => {
    expect(analyzeRegex("a{2,5}").ok).toBe(true);
    expect(analyzeRegex("a{3}").ok).toBe(true);
    expect(analyzeRegex("[\\u{1F600}-\\u{1F64F}]+").ok).toBe(true);
    expect(analyzeRegex("[\u{1F600}-\u{1F64F}]+").ok).toBe(true);
  });

  test("accepts typical email, phone, and TR-IBAN patterns", () => {
    expect(analyzeRegex("^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$").ok).toBe(
      true,
    );
    expect(analyzeRegex("^\\+?[0-9 ()-]{7,15}$").ok).toBe(true);
    expect(analyzeRegex("^TR\\d{2}\\s?(?:\\d{4}\\s?){5}\\d{2}$").ok).toBe(true);
  });
});

describe("regex dialect: ReDoS guards", () => {
  test("rejects nested quantifiers with outer bound above one", () => {
    expectRejected("(a+)+", "NESTED_QUANTIFIER");
    expectRejected("(a*)*", "NESTED_QUANTIFIER");
    expectRejected("(a+){2,}", "NESTED_QUANTIFIER");
    expectRejected("(a+){2,5}", "NESTED_QUANTIFIER");
  });

  test("allows nested shapes whose outer bound is at most one", () => {
    expect(analyzeRegex("(a+)?").ok).toBe(true);
    expect(analyzeRegex("(a+){1}").ok).toBe(true);
    expect(analyzeRegex("(a+){0,1}").ok).toBe(true);
  });

  test("rejects unbounded repetition over overlapping alternation", () => {
    expectRejected("(a|a)*", "OVERLAPPING_ALTERNATION");
    expectRejected("(a|ab)+", "OVERLAPPING_ALTERNATION");
    expectRejected("(?:a|ab)*", "OVERLAPPING_ALTERNATION");
  });

  test("allows unbounded repetition over disjoint alternation", () => {
    expect(analyzeRegex("(a|b)*").ok).toBe(true);
    expect(analyzeRegex("(?:cat|dog)+").ok).toBe(true);
  });

  test("rejects adjacent unbounded quantifiers with overlapping sets", () => {
    expectRejected("a*a*", "ADJACENT_OVERLAP");
    expectRejected("\\d+\\w+", "ADJACENT_OVERLAP");
    expectRejected("a*(b?)a*", "ADJACENT_OVERLAP");
  });

  test("allows adjacent unbounded quantifiers with disjoint sets", () => {
    expect(analyzeRegex("a*b*").ok).toBe(true);
    expect(analyzeRegex("\\d+-\\d+").ok).toBe(true);
    expect(analyzeRegex("a+\\s*b+").ok).toBe(true);
  });
});

describe("regex dialect: compileSafeRegex", () => {
  test("compiles safe patterns in Unicode mode", () => {
    const compiled = compileSafeRegex("^[a-z]+$");
    expect(compiled.flags.includes("u")).toBe(true);
    expect(compiled.test("abc")).toBe(true);
    expect(compiled.test("abc1")).toBe(false);
  });

  test("throws a typed EXPRESSION_ERROR that names the rejection reason", () => {
    let caught: unknown;
    try {
      compileSafeRegex("(a+)+");
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof A2uiFunctionError).toBe(true);
    const error = caught as A2uiFunctionError;
    expect(error.category).toBe("ExpressionError");
    expect(error.code).toBe("EXPRESSION_ERROR");
    expect(error.functionName).toBe("regex");
    expect(error.message).toContain("NESTED_QUANTIFIER");

    expect(() => compileSafeRegex("(a|ab)+")).toThrow(A2uiFunctionError);
    expect(() => compileSafeRegex("a*a*")).toThrow(A2uiFunctionError);
    expect(() => compileSafeRegex("(?<=a)b")).toThrow(A2uiFunctionError);
    expect(() => compileSafeRegex("a".repeat(257))).toThrow(A2uiFunctionError);
  });

  test("returns the cached instance for the same pattern", () => {
    const first = compileSafeRegex("^cache-probe$");
    const second = compileSafeRegex("^cache-probe$");
    expect(second).toBe(first);
  });

  test("evicts the oldest entry beyond 256 cached patterns", () => {
    const original = compileSafeRegex("^cache-bound-probe$");
    for (let i = 1; i <= 256; i += 1) {
      compileSafeRegex("r".repeat(i));
    }
    const recompiled = compileSafeRegex("^cache-bound-probe$");
    expect(recompiled).not.toBe(original);
    expect(recompiled.test("cache-bound-probe")).toBe(true);
  });
});

