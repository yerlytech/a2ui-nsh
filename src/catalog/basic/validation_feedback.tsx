/**
 * Shared Checkable validation presentation and batched `@path` write helper
 * for A2UI Basic Catalog v1 interactive controls (`Button`, `TextField`,
 * `CheckBox`, `ChoicePicker`, `DateTimeInput`).
 */

import { Text, View, batch, type JSX, type ViewRef } from "nsh";
import type {
  NormalizedValidationResult,
  ValidationSeverity,
} from "../../core/functions";
import { isWritable, ResolvedBinding } from "../../core/resolver";

/** Aggregated Checkable validation state extracted from a `ComponentNode`. */
export interface CheckableState {
  /** True unless at least one `"error"` severity check fails. */
  readonly isValid: boolean;
  /** True when `isValid === false` (error-level failure only). */
  readonly isInvalid: boolean;
  /** All failed check results in declaration order (error, warning, info). */
  readonly results: readonly NormalizedValidationResult[];
  /** Failed `"error"` severity results. */
  readonly errors: readonly NormalizedValidationResult[];
  /** Failed `"warning"` severity results. */
  readonly warnings: readonly NormalizedValidationResult[];
  /** Failed `"info"` severity results. */
  readonly infos: readonly NormalizedValidationResult[];
}

function isNormalizedResult(value: unknown): value is NormalizedValidationResult {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const rec = value as Record<string, unknown>;
  return (
    typeof rec["message"] === "string" &&
    (rec["severity"] === "error" ||
      rec["severity"] === "warning" ||
      rec["severity"] === "info")
  );
}

/**
 * Extracts normalized checkable validation state from a `ComponentNode`'s
 * `isValid`, `validationErrors`, and `validationResults` properties.
 *
 * Per A2UI v1.0, `"warning"` and `"info"` failures present feedback without
 * setting `isValid` to `false` or disabling controls.
 */
export function extractCheckableState(
  isValidProp: unknown,
  validationErrorsProp: unknown,
  validationResultsProp: unknown,
): CheckableState {
  const results: NormalizedValidationResult[] = [];
  if (Array.isArray(validationResultsProp)) {
    for (let i = 0; i < validationResultsProp.length; i += 1) {
      const entry = validationResultsProp[i];
      if (isNormalizedResult(entry) && entry.valid === false) {
        results.push(entry);
      }
    }
  } else if (Array.isArray(validationErrorsProp)) {
    for (let i = 0; i < validationErrorsProp.length; i += 1) {
      const msg = validationErrorsProp[i];
      if (typeof msg === "string" && msg.length > 0) {
        results.push({ valid: false, message: msg, severity: "error" });
      }
    }
  }

  const errors: NormalizedValidationResult[] = [];
  const warnings: NormalizedValidationResult[] = [];
  const infos: NormalizedValidationResult[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i]!;
    if (item.severity === "error") {
      errors.push(item);
    } else if (item.severity === "warning") {
      warnings.push(item);
    } else {
      infos.push(item);
    }
  }

  const isInvalid = isValidProp === false;
  return {
    isValid: !isInvalid,
    isInvalid,
    results,
    errors,
    warnings,
    infos,
  };
}

/**
 * Writes `nextValue` through a T8 `WritableBinding` inside an `nsh` reactive
 * `batch()` so dependent bindings and `@checks` flush atomically.
 *
 * Returns `true` when the binding was writable and updated, `false` for
 * read-only literals or `@call` bindings.
 */
export function writeBinding<T>(binding: unknown, nextValue: T): boolean {
  if (binding instanceof ResolvedBinding && isWritable(binding)) {
    batch(() => {
      binding.set(nextValue);
    });
    return true;
  }
  return false;
}

function severityTextClass(severity: ValidationSeverity): string {
  if (severity === "error") {
    return "text-xs text-destructive";
  }
  if (severity === "warning") {
    return "text-xs text-amber-600 dark:text-amber-400";
  }
  return "text-xs text-muted-foreground";
}

export interface ValidationFeedbackProps {
  /** Base `testID` for the feedback container (`<nodeTestId>:checks`). */
  readonly testId: string;
  /** Failed validation results to render in declaration order. */
  readonly results: readonly NormalizedValidationResult[];
  /** Optional ref callback for wiring `accessibilityDescribedBy`. */
  readonly ref?: (el: ViewRef) => void;
}

/**
 * Renders `@checks` error, warning, and info messages beneath a Checkable
 * component, omitting the container entirely when no checks have failed.
 */
export function ValidationFeedback(props: ValidationFeedbackProps): JSX.Element {
  return (
    <If when={props.results.length > 0}>
      <View ref={props.ref} testID={props.testId} class="gap-1 pt-1">
        <Each of={props.results} key="index">
          {(item, index) => (
            <Text
              testID={`${props.testId}:${index()}`}
              role={item().severity === "error" ? "alert" : undefined}
              class={severityTextClass(item().severity)}
            >
              {item().message}
            </Text>
          )}
        </Each>
      </View>
    </If>
  );
}
