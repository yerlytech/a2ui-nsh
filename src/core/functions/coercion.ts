/**
 * A2UI v1.0 `DynamicBoolean` coercion and `@checks` (`CheckRule`) evaluation
 * rules per `a2ui_protocol.md` §DynamicBoolean and CheckRule Coercion.
 */

import type {
  ComponentValidationState,
  NormalizedValidationResult,
  ValidationResult,
  ValidationSeverity,
} from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when `value` is a v1.0 `ValidationResult` object (plain object with a
 * boolean `valid` property).
 */
export function isValidationResult(value: unknown): value is ValidationResult {
  return isPlainObject(value) && typeof value["valid"] === "boolean";
}

/**
 * Coerces any resolved runtime value to `boolean` per A2UI v1.0 `DynamicBoolean`
 * coercion rules:
 * - `boolean` -> unchanged
 * - `ValidationResult` (object with boolean `valid`) -> `result.valid`
 * - `string` `"true"` (case-insensitive) -> `true`; all other strings -> `false`
 * - `number` `0` or `NaN` -> `false`; any other number -> `true`
 * - `null`, `undefined`, other objects, arrays -> `false`
 */
export function coerceDynamicBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (isValidationResult(value)) {
    return value.valid;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  if (typeof value === "number") {
    return value !== 0 && !Number.isNaN(value);
  }
  return false;
}

function normalizeSeverity(raw: unknown): ValidationSeverity {
  if (raw === "warning" || raw === "info") {
    return raw;
  }
  return "error";
}

/**
 * Normalizes a `CheckRule.condition` evaluation result (`ValidationResult` or
 * boolean/coercible value) into a `NormalizedValidationResult`.
 *
 * When the rule provides an explicit `ruleMessage`, it overrides any default
 * message on the `ValidationResult` while preserving `code` and `severity`.
 */
export function normalizeCheckRuleResult(
  conditionValue: unknown,
  ruleMessage?: string,
  fallbackMessage = "Validation failed",
): NormalizedValidationResult {
  if (isValidationResult(conditionValue)) {
    const severity = normalizeSeverity(conditionValue.severity);
    const code =
      typeof conditionValue.code === "string" ? conditionValue.code : undefined;
    const message =
      ruleMessage !== undefined
        ? ruleMessage
        : conditionValue.message !== undefined && conditionValue.message !== null
          ? String(conditionValue.message)
          : fallbackMessage;
    return code !== undefined
      ? { valid: conditionValue.valid, code, message, severity }
      : { valid: conditionValue.valid, message, severity };
  }

  return {
    valid: coerceDynamicBoolean(conditionValue),
    message: ruleMessage ?? fallbackMessage,
    severity: "error",
  };
}

/**
 * Evaluates a component's `@checks` list in declaration order and computes
 * `isValid`, `validationErrors`, `validationResults`, and `validationResult`.
 *
 * Warning and info failures appear in `validationResults` without marking
 * `isValid` false or populating `validationErrors`.
 */
export function evaluateCheckRules(
  checks: readonly unknown[],
  evaluateCondition: (condition: unknown) => unknown,
): ComponentValidationState {
  const failedResults: NormalizedValidationResult[] = [];
  const validationErrors: string[] = [];

  for (let i = 0; i < checks.length; i += 1) {
    const rawRule = checks[i];
    if (!isPlainObject(rawRule)) {
      continue;
    }
    const conditionVal = evaluateCondition(rawRule["condition"]);
    const explicitMessage =
      typeof rawRule["message"] === "string" ? rawRule["message"] : undefined;
    const normalized = normalizeCheckRuleResult(conditionVal, explicitMessage);
    if (!normalized.valid) {
      failedResults.push(normalized);
      if (normalized.severity === "error") {
        validationErrors.push(normalized.message);
      }
    }
  }

  const firstFailure = failedResults[0];
  return firstFailure !== undefined
    ? {
        isValid: validationErrors.length === 0,
        validationErrors,
        validationResults: failedResults,
        validationResult: firstFailure,
      }
    : {
        isValid: validationErrors.length === 0,
        validationErrors,
        validationResults: failedResults,
      };
}
