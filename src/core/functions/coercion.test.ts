import { describe, expect, test } from "nsh/test";
import {
  coerceDynamicBoolean,
  evaluateCheckRules,
  isValidationResult,
  normalizeCheckRuleResult,
} from "./coercion";

describe("coerceDynamicBoolean", () => {
  test("keeps booleans and reads validation results", () => {
    expect(coerceDynamicBoolean(true)).toBe(true);
    expect(coerceDynamicBoolean(false)).toBe(false);
    expect(coerceDynamicBoolean({ valid: true })).toBe(true);
    expect(coerceDynamicBoolean({ valid: false, message: "bad" })).toBe(false);
  });

  test("coerces strings case-insensitively", () => {
    expect(coerceDynamicBoolean("true")).toBe(true);
    expect(coerceDynamicBoolean("TRUE")).toBe(true);
    expect(coerceDynamicBoolean("True")).toBe(true);
    expect(coerceDynamicBoolean("false")).toBe(false);
    expect(coerceDynamicBoolean("False")).toBe(false);
    expect(coerceDynamicBoolean("")).toBe(false);
    expect(coerceDynamicBoolean("yes")).toBe(false);
    expect(coerceDynamicBoolean("1")).toBe(false);
  });

  test("treats zero and NaN as false and other numbers as true", () => {
    expect(coerceDynamicBoolean(0)).toBe(false);
    expect(coerceDynamicBoolean(-0)).toBe(false);
    expect(coerceDynamicBoolean(Number.NaN)).toBe(false);
    expect(coerceDynamicBoolean(1)).toBe(true);
    expect(coerceDynamicBoolean(-1)).toBe(true);
    expect(coerceDynamicBoolean(0.5)).toBe(true);
    expect(coerceDynamicBoolean(Number.POSITIVE_INFINITY)).toBe(true);
  });

  test("treats nullish, array, and non-validation objects as false", () => {
    expect(coerceDynamicBoolean(null)).toBe(false);
    expect(coerceDynamicBoolean(undefined)).toBe(false);
    expect(coerceDynamicBoolean({})).toBe(false);
    expect(coerceDynamicBoolean({ valid: "true" })).toBe(false);
    expect(coerceDynamicBoolean([])).toBe(false);
    expect(coerceDynamicBoolean([true])).toBe(false);
  });
});

describe("isValidationResult", () => {
  test("accepts plain objects with a boolean valid property", () => {
    expect(isValidationResult({ valid: true })).toBe(true);
    expect(isValidationResult({ valid: false })).toBe(true);
    expect(
      isValidationResult({
        valid: true,
        message: "ok",
        code: "E1",
        severity: "warning",
      }),
    ).toBe(true);
  });

  test("rejects missing, non-boolean, nullish, array, and primitive values", () => {
    expect(isValidationResult({})).toBe(false);
    expect(isValidationResult({ valid: 1 })).toBe(false);
    expect(isValidationResult({ valid: "true" })).toBe(false);
    expect(isValidationResult(null)).toBe(false);
    expect(isValidationResult(undefined)).toBe(false);
    expect(isValidationResult([])).toBe(false);
    expect(isValidationResult([{ valid: true }])).toBe(false);
    expect(isValidationResult("valid")).toBe(false);
    expect(isValidationResult(new Date())).toBe(false);
  });
});

describe("normalizeCheckRuleResult", () => {
  test("preserves a validation result code, message, and severity", () => {
    expect(
      normalizeCheckRuleResult({
        valid: false,
        message: "Missing",
        code: "required",
        severity: "warning",
      }),
    ).toEqual({
      valid: false,
      code: "required",
      message: "Missing",
      severity: "warning",
    });
  });

  test("lets the rule message override the validation result message", () => {
    expect(
      normalizeCheckRuleResult(
        {
          valid: false,
          message: "Missing",
          code: "required",
          severity: "warning",
        },
        "Override",
      ),
    ).toEqual({
      valid: false,
      code: "required",
      message: "Override",
      severity: "warning",
    });
    expect(normalizeCheckRuleResult({ valid: true, message: "ok" }, "ignored")).toEqual({
      valid: true,
      message: "ignored",
      severity: "error",
    });
  });

  test("falls back for absent messages and normalizes unknown severities", () => {
    expect(normalizeCheckRuleResult({ valid: false })).toEqual({
      valid: false,
      message: "Validation failed",
      severity: "error",
    });
    expect(normalizeCheckRuleResult({ valid: false, message: null })).toEqual({
      valid: false,
      message: "Validation failed",
      severity: "error",
    });
    expect(
      normalizeCheckRuleResult({ valid: false, message: "" }, undefined, "fallback"),
    ).toEqual({ valid: false, message: "", severity: "error" });
    expect(
      normalizeCheckRuleResult({ valid: false, severity: "info", message: "note" }),
    ).toEqual({ valid: false, message: "note", severity: "info" });
    expect(
      normalizeCheckRuleResult({ valid: false, severity: "fatal", message: "x" }),
    ).toEqual({ valid: false, message: "x", severity: "error" });
  });

  test("omits a non-string code", () => {
    expect(
      normalizeCheckRuleResult({ valid: false, code: 42, message: "x" }),
    ).toEqual({ valid: false, message: "x", severity: "error" });
    expect(
      normalizeCheckRuleResult({ valid: false, code: "E1", message: "x" }),
    ).toEqual({ valid: false, code: "E1", message: "x", severity: "error" });
  });

  test("coerces non-validation values with the rule or fallback message", () => {
    expect(normalizeCheckRuleResult(false)).toEqual({
      valid: false,
      message: "Validation failed",
      severity: "error",
    });
    expect(normalizeCheckRuleResult(true, "looks fine")).toEqual({
      valid: true,
      message: "looks fine",
      severity: "error",
    });
    expect(normalizeCheckRuleResult("true")).toEqual({
      valid: true,
      message: "Validation failed",
      severity: "error",
    });
    expect(normalizeCheckRuleResult("no", "must be yes", "default")).toEqual({
      valid: false,
      message: "must be yes",
      severity: "error",
    });
    expect(normalizeCheckRuleResult(0, undefined, "custom")).toEqual({
      valid: false,
      message: "custom",
      severity: "error",
    });
  });
});

describe("evaluateCheckRules", () => {
  test("returns a valid empty state for no rules", () => {
    const state = evaluateCheckRules([], () => true);
    expect(state.isValid).toBe(true);
    expect(state.validationErrors).toHaveLength(0);
    expect(state.validationResults).toHaveLength(0);
    expect(state.validationResult).toBeUndefined();
  });

  test("returns a valid state when every rule passes", () => {
    const seen: unknown[] = [];
    const state = evaluateCheckRules(
      [{ condition: true }, { condition: { valid: true } }, { condition: 1 }],
      (condition) => {
        seen.push(condition);
        return condition;
      },
    );
    expect(seen).toHaveLength(3);
    expect(state.isValid).toBe(true);
    expect(state.validationErrors).toHaveLength(0);
    expect(state.validationResults).toHaveLength(0);
    expect(state.validationResult).toBeUndefined();
  });

  test("returns the first failing rule message and validation result", () => {
    const state = evaluateCheckRules(
      [{ condition: true }, { condition: false, message: "only failure" }],
      (condition) => condition,
    );
    expect(state.isValid).toBe(false);
    expect(state.validationErrors).toEqual(["only failure"]);
    expect(state.validationResults).toHaveLength(1);
    expect(state.validationResult).toEqual({
      valid: false,
      message: "only failure",
      severity: "error",
    });
  });

  test("keeps declaration order across several failures", () => {
    const state = evaluateCheckRules(
      [
        { condition: false, message: "first failure" },
        { condition: true, message: "passes" },
        { condition: false, message: "second failure" },
      ],
      (condition) => condition,
    );
    expect(state.isValid).toBe(false);
    expect(state.validationErrors).toEqual(["first failure", "second failure"]);
    expect(state.validationResults).toHaveLength(2);
    expect(state.validationResult!.message).toBe("first failure");
    expect(state.validationResult!.valid).toBe(false);
    expect(state.validationResult!.severity).toBe("error");
  });

  test("treats a non-boolean condition result as its coerced boolean", () => {
    const state = evaluateCheckRules(
      [{ condition: "yes", message: "must be true" }],
      (condition) => condition,
    );
    expect(state.isValid).toBe(false);
    expect(state.validationErrors).toEqual(["must be true"]);
    expect(state.validationResult!.valid).toBe(false);

    const numeric = evaluateCheckRules(
      [{ condition: 0 }, { condition: "TRUE" }],
      (condition) => condition,
    );
    expect(numeric.isValid).toBe(false);
    expect(numeric.validationErrors).toEqual(["Validation failed"]);
    expect(numeric.validationResults).toHaveLength(1);
  });

  test("does not invalidate the component for warning or info failures", () => {
    const warning = evaluateCheckRules(
      [{ condition: { valid: false, severity: "warning", message: "check later" } }],
      (condition) => condition,
    );
    expect(warning.isValid).toBe(true);
    expect(warning.validationErrors).toHaveLength(0);
    expect(warning.validationResults).toHaveLength(1);
    expect(warning.validationResult!.severity).toBe("warning");
    expect(warning.validationResult!.message).toBe("check later");

    const info = evaluateCheckRules(
      [{ condition: { valid: false, severity: "info", message: "fyi" } }],
      (condition) => condition,
    );
    expect(info.isValid).toBe(true);
    expect(info.validationErrors).toHaveLength(0);
    expect(info.validationResult!.severity).toBe("info");
  });

  test("skips non-object rules and ignores non-string rule messages", () => {
    const state = evaluateCheckRules(
      [null, "rule", 42, { condition: false, message: "real" }],
      (condition) => condition,
    );
    expect(state.validationErrors).toEqual(["real"]);
    expect(state.validationResults).toHaveLength(1);

    const fromResult = evaluateCheckRules(
      [{ condition: { valid: false, message: "from result" }, message: 7 }],
      (condition) => condition,
    );
    expect(fromResult.validationResult!.message).toBe("from result");

    const overridden = evaluateCheckRules(
      [
        {
          condition: {
            valid: false,
            message: "from result",
            code: "E1",
            severity: "info",
          },
          message: "from rule",
        },
      ],
      (condition) => condition,
    );
    expect(overridden.validationResult).toEqual({
      valid: false,
      code: "E1",
      message: "from rule",
      severity: "info",
    });
    expect(overridden.isValid).toBe(true);
    expect(overridden.validationErrors).toHaveLength(0);
  });
});
