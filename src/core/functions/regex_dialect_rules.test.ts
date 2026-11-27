import { describe, expect, test } from "nsh/test";
import type { RegexRejectReason } from "./regex_dialect";
import { analyzeRegex, compileSafeRegex } from "./regex_dialect";
import { A2uiFunctionError } from "./types";

function expectRejected(pattern: string, reason: RegexRejectReason): void {
  const result = analyzeRegex(pattern);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toBe(reason);
  }
  expect(() => compileSafeRegex(pattern)).toThrow(A2uiFunctionError);
}

function expectAccepted(pattern: string): void {
  const result = analyzeRegex(pattern);
  expect(result.ok).toBe(true);
  expect(() => compileSafeRegex(pattern)).not.toThrow();
  // A pattern the dialect accepts must also be valid for the Unicode engine.
  expect(engineAccepts(pattern)).toBe(true);
}

function engineAccepts(pattern: string): boolean {
  try {
    new RegExp(pattern, "u");
    return true;
  } catch {
    return false;
  }
}

describe("regex dialect rules: malformed quantifiers", () => {
  test("rejects a quantifier with no preceding atom", () => {
    expectRejected("*a", "UNSUPPORTED_SYNTAX");
    expectRejected("+", "UNSUPPORTED_SYNTAX");
    expectRejected("?", "UNSUPPORTED_SYNTAX");
  });

  test("rejects stacked quantifiers", () => {
    expectRejected("a**", "UNSUPPORTED_SYNTAX");
    expectRejected("a{2}{3}", "UNSUPPORTED_SYNTAX");
  });

  test("rejects incomplete and inverted bounded quantifiers", () => {
    expectRejected("a{", "UNSUPPORTED_SYNTAX");
    expectRejected("a{2,1}", "UNSUPPORTED_SYNTAX");
    expectRejected("a{,3}", "UNSUPPORTED_SYNTAX");
    expectRejected("{", "UNSUPPORTED_SYNTAX");
  });

  test("accepts lazy quantifiers and an explicit zero bound", () => {
    expectAccepted("a+?");
    expectAccepted("a*?");
    expectAccepted("a{2,5}?");
    expectAccepted("a{0}");
  });
});

describe("regex dialect rules: escapes", () => {
  test("rejects out-of-range and incomplete Unicode and hex escapes", () => {
    expectRejected("\\u{110000}", "UNSUPPORTED_SYNTAX");
    expectRejected("\\u12", "UNSUPPORTED_SYNTAX");
    expectRejected("\\x4", "UNSUPPORTED_SYNTAX");
  });

  test("rejects a named backreference and an unknown identity escape", () => {
    expectRejected("\\k<n>", "UNSUPPORTED_SYNTAX");
    expectRejected("\\q", "UNSUPPORTED_SYNTAX");
  });

  test("accepts the null escape but rejects octal and bare backreference escapes", () => {
    expectAccepted("\\0");
    expectRejected("\\00", "UNSUPPORTED_SYNTAX");
    expectRejected("\\1", "UNSUPPORTED_SYNTAX");
  });

  test("accepts standard character and punctuation escapes", () => {
    expectAccepted("\\u0041");
    expectAccepted("\\x41");
    expectAccepted("\\t");
    expectAccepted("\\n");
    expectAccepted("\\/");
    expectAccepted("\\.");
  });

  test("pins the hyphen as an identity escape only inside a character class", () => {
    // Outside a class the Unicode dialect rejects it; inside a class it is literal.
    expectRejected("\\-", "UNSUPPORTED_SYNTAX");
    expectAccepted("[\\-]");
  });
});

describe("regex dialect rules: character classes", () => {
  test("rejects a reversed range", () => {
    expectRejected("[z-a]", "UNSUPPORTED_SYNTAX");
  });

  test("rejects a range built from a shorthand class", () => {
    expectRejected("[\\d-z]", "UNSUPPORTED_SYNTAX");
  });

  test("rejects an unescaped closing bracket outside a class", () => {
    expectRejected("]", "UNSUPPORTED_SYNTAX");
  });

  test("pins empty and negated-empty classes", () => {
    expectAccepted("[]");
    expectAccepted("[^]");
  });

  test("accepts a leading, trailing, or escaped hyphen in a class", () => {
    expectAccepted("[-a]");
    expectAccepted("[a-]");
    expectAccepted("[\\]]");
  });
});

describe("regex dialect rules: groups and branches", () => {
  test("accepts empty patterns and empty alternation branches", () => {
    expectAccepted("");
    expectAccepted("a|");
    expectAccepted("|");
  });

  test("accepts an empty group but rejects an unmatched close or open group", () => {
    expectAccepted("()");
    expectRejected(")", "UNSUPPORTED_SYNTAX");
    expectRejected("(?:", "UNSUPPORTED_SYNTAX");
  });

  test("rejects a quantifier applied to a lookahead assertion", () => {
    expectRejected("(?=a)*", "UNSUPPORTED_SYNTAX");
  });
});

describe("regex dialect rules: ReDoS guards through structure", () => {
  test("rejects nested unbounded quantifiers through capture and non-capture groups", () => {
    expectRejected("((a+))+", "NESTED_QUANTIFIER");
    expectRejected("(?:(?:a)+)+", "NESTED_QUANTIFIER");
  });

  test("pins nullable inner atoms under an unbounded outer quantifier", () => {
    expectAccepted("(a?)+");
    expectAccepted("(a|)*");
  });

  test("rejects adjacent unbounded dot quantifiers", () => {
    expectRejected(".*.*", "ADJACENT_OVERLAP");
    expectRejected(".*a*", "ADJACENT_OVERLAP");
  });

  test("accepts isolated unbounded dots", () => {
    expectAccepted(".*");
    expectAccepted("a.*b");
  });

  test("rejects overlapping alternatives under unbounded repetition", () => {
    expectRejected("(a|b|ab)*", "OVERLAPPING_ALTERNATION");
    expectAccepted("(ab|cd)*");
  });

  test("detects a one-code-point overlap between adjacent class quantifiers", () => {
    expectRejected("[a-c]+[c-e]+", "ADJACENT_OVERLAP");
  });

  test("distinguishes disjoint and overlapping shorthand quantifiers", () => {
    expectAccepted("\\s*\\S*");
    expectRejected("\\w+\\d+", "ADJACENT_OVERLAP");
  });
});

describe("regex dialect rules: astral characters and surrogates", () => {
  test("rejects adjacent unbounded astral quantifiers", () => {
    expectRejected("\\u{1F600}+\\u{1F600}+", "ADJACENT_OVERLAP");
  });

  test("accepts an astral class next to a disjoint ASCII class", () => {
    expectAccepted("[\\u{1F600}]+[a]+");
  });

  test("pins a lone surrogate escape", () => {
    expectAccepted("\\uD83D");
  });
});
