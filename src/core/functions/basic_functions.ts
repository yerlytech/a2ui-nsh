/**
 * All 14 A2UI v1.0 Basic Catalog functions plus the universal `@index` system
 * function, implemented in pure zero-dependency TypeScript.
 */

import { A2uiCatalogError } from "../catalog";
import {
  A2uiExpressionError,
  A2uiValidationError,
  evaluateExpressionTemplate,
} from "../expression";
import { coerceDynamicBoolean } from "./coercion";
import { formatTr35Date } from "./date_format";
import {
  formatLocalizedCurrency,
  formatLocalizedNumber,
  selectPluralCategory,
} from "./locale";
import {
  MAX_REGEX_VALUE_CODE_POINTS,
  compileSafeRegex,
  countCodePoints,
} from "./regex_dialect";
import {
  A2uiFunctionError,
  type FunctionExecutionContext,
  type FunctionImplementation,
  type ValidationResult,
} from "./types";

// ---------------------------------------------------------------------------
// Validation functions (returnType: "validationResult")
// ---------------------------------------------------------------------------

/** Checks that `value` is not null, undefined, empty string, or empty array. */
export function evaluateRequired(value: unknown): ValidationResult {
  const isValid =
    value !== null &&
    value !== undefined &&
    !(typeof value === "string" && value === "") &&
    !(Array.isArray(value) && value.length === 0);
  return isValid
    ? { valid: true }
    : { valid: false, message: "This field is required." };
}

/** Validates `value` against a pattern in the safe A2UI regex dialect. */
export function evaluateRegex(value: unknown, pattern: unknown): ValidationResult {
  if (typeof pattern !== "string") {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      "regex requires a string 'pattern' argument",
      "regex",
    );
  }
  const compiled = compileSafeRegex(pattern);
  const text = value === null || value === undefined ? "" : String(value);
  if (countCodePoints(text) > MAX_REGEX_VALUE_CODE_POINTS) {
    return {
      valid: false,
      message: "Value exceeds the maximum length for pattern matching.",
    };
  }
  const matched = compiled.test(text);
  return matched
    ? { valid: true }
    : { valid: false, message: "Value does not match required pattern." };
}

/** Validates string or array length against optional `min` and `max` bounds. */
export function evaluateLength(
  value: unknown,
  min?: unknown,
  max?: unknown,
): ValidationResult {
  const len =
    typeof value === "string" || Array.isArray(value) ? value.length : 0;
  const minNum = typeof min === "number" && Number.isFinite(min) ? min : undefined;
  const maxNum = typeof max === "number" && Number.isFinite(max) ? max : undefined;

  if (minNum !== undefined && len < minNum) {
    return { valid: false, message: `Minimum length is ${minNum}.` };
  }
  if (maxNum !== undefined && len > maxNum) {
    return { valid: false, message: `Maximum length is ${maxNum}.` };
  }
  return { valid: true };
}

function parseNumericOperand(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return Number.NaN;
    }
    return Number(trimmed);
  }
  return Number.NaN;
}

/** Validates that `value` is a finite number within optional `[min, max]` bounds. */
export function evaluateNumeric(
  value: unknown,
  min?: unknown,
  max?: unknown,
): ValidationResult {
  const num = parseNumericOperand(value);
  if (!Number.isFinite(num)) {
    return { valid: false, message: "Value must be a valid number." };
  }
  const minNum = typeof min === "number" && Number.isFinite(min) ? min : undefined;
  const maxNum = typeof max === "number" && Number.isFinite(max) ? max : undefined;

  if (minNum !== undefined && num < minNum) {
    return { valid: false, message: `Minimum value is ${minNum}.` };
  }
  if (maxNum !== undefined && num > maxNum) {
    return { valid: false, message: `Maximum value is ${maxNum}.` };
  }
  return { valid: true };
}

const BASIC_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Validates basic email syntax (requiring a 2+ letter TLD). */
export function evaluateEmail(value: unknown): ValidationResult {
  if (typeof value === "string" && BASIC_EMAIL_RE.test(value)) {
    return { valid: true };
  }
  return {
    valid: false,
    code: "INVALID_EMAIL",
    message: "Please enter a valid email address (e.g. user@example.com).",
    severity: "error",
  };
}

// ---------------------------------------------------------------------------
// Formatting functions (returnType: "string")
// ---------------------------------------------------------------------------

/** Selects a localized plural string with exact 0/1/2 overrides over CLDR. */
export function evaluatePluralize(
  args: Readonly<Record<string, unknown>>,
  locale?: string,
): string {
  const num = parseNumericOperand(args["value"]);
  if (num === 0 && args["zero"] !== undefined) {
    return String(args["zero"]);
  }
  if (num === 1 && args["one"] !== undefined) {
    return String(args["one"]);
  }
  if (num === 2 && args["two"] !== undefined) {
    return String(args["two"]);
  }
  const category = selectPluralCategory(num, locale);
  if (args[category] !== undefined) {
    return String(args[category]);
  }
  if (args["other"] !== undefined) {
    return String(args["other"]);
  }
  return "";
}

// ---------------------------------------------------------------------------
// URL validation for `openUrl` (D30)
// ---------------------------------------------------------------------------

const ALLOWED_URL_SCHEMES = new Set(["https", "http", "mailto", "tel"]);
const URL_SCHEME_RE = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/;
const ASCII_CONTROL_RE = /[\u0000-\u001F\u007F]/;

/**
 * Validates that `url` is a syntactically valid URL with an allowed scheme
 * (`https:`, `http:`, `mailto:`, `tel:`), throwing `A2uiFunctionError` otherwise.
 */
export function validateSafeUrl(url: unknown): string {
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      "openUrl requires a non-empty string 'url'",
      "openUrl",
    );
  }
  const trimmed = url.trim();
  if (ASCII_CONTROL_RE.test(trimmed)) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Invalid URL specified: ${trimmed}`,
      "openUrl",
    );
  }
  const match = URL_SCHEME_RE.exec(trimmed);
  if (!match) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Invalid URL specified: ${trimmed}`,
      "openUrl",
    );
  }
  const scheme = match[1]!.toLowerCase();
  const rest = match[2]!;
  if (!ALLOWED_URL_SCHEMES.has(scheme)) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Unsupported URL scheme: ${scheme}:`,
      "openUrl",
    );
  }
  if ((scheme === "http" || scheme === "https") && !/^\/\/[^\s/?#]+/.test(rest)) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Invalid URL specified: ${trimmed}`,
      "openUrl",
    );
  }
  if ((scheme === "mailto" || scheme === "tel") && rest.length === 0) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Invalid URL specified: ${trimmed}`,
      "openUrl",
    );
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Function implementation descriptors (14 Basic Catalog + @index)
// ---------------------------------------------------------------------------

export const requiredFunction: FunctionImplementation = {
  name: "required",
  returnType: "validationResult",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args) => evaluateRequired(args["value"]),
};

export const regexFunction: FunctionImplementation = {
  name: "regex",
  returnType: "validationResult",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args) => evaluateRegex(args["value"], args["pattern"]),
};

export const lengthFunction: FunctionImplementation = {
  name: "length",
  returnType: "validationResult",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args) => evaluateLength(args["value"], args["min"], args["max"]),
};

export const numericFunction: FunctionImplementation = {
  name: "numeric",
  returnType: "validationResult",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args) => evaluateNumeric(args["value"], args["min"], args["max"]),
};

export const emailFunction: FunctionImplementation = {
  name: "email",
  returnType: "validationResult",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args) => evaluateEmail(args["value"]),
};

/**
 * Callback hook used by `formatString` to invoke nested `${fn(...)}` calls.
 * Wired by the evaluator so template calls inherit `formatString`'s catalog
 * while keeping `@index` catalogless.
 */
export type TemplateCallDispatcher = (
  name: string,
  args: Readonly<Record<string, unknown>>,
  context: FunctionExecutionContext,
) => unknown;

let registeredTemplateDispatcher: TemplateCallDispatcher | undefined;

/** Internal wiring called by `evaluator.ts` to avoid circular imports. */
export function setTemplateCallDispatcher(
  dispatcher: TemplateCallDispatcher,
): void {
  registeredTemplateDispatcher = dispatcher;
}

export const formatStringFunction: FunctionImplementation = {
  name: "formatString",
  returnType: "string",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args, context) => {
    const raw = args["value"];
    if (raw === null || raw === undefined) {
      return "";
    }
    const template = String(raw);
    try {
      return evaluateExpressionTemplate(
        template,
        context.dataContext,
        (name, resolvedArgs) => {
          if (!registeredTemplateDispatcher) {
            throw new A2uiFunctionError(
              "EXPRESSION_ERROR",
              `No function dispatcher registered to evaluate '${name}'`,
              name,
            );
          }
          try {
            return registeredTemplateDispatcher(name, resolvedArgs, context);
          } catch (err) {
            const wrapped =
              err instanceof A2uiCatalogError || err instanceof A2uiFunctionError
                ? err
                : new A2uiFunctionError(
                    "EXPRESSION_ERROR",
                    err instanceof Error ? err.message : String(err),
                    name,
                  );
            if (context.onTemplatePartError) {
              context.onTemplatePartError(wrapped);
              return "";
            }
            throw wrapped;
          }
        },
      );
    } catch (err) {
      if (
        err instanceof A2uiCatalogError ||
        err instanceof A2uiFunctionError ||
        err instanceof A2uiExpressionError
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new A2uiFunctionError("EXPRESSION_ERROR", msg, "formatString");
    }
  },
};

export const formatNumberFunction: FunctionImplementation = {
  name: "formatNumber",
  returnType: "string",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args, context) => {
    const num = parseNumericOperand(args["value"]);
    const rawDecimals = args["decimals"];
    const decimals =
      rawDecimals !== undefined && rawDecimals !== null
        ? parseNumericOperand(rawDecimals)
        : undefined;
    const grouping =
      args["grouping"] === undefined
        ? true
        : coerceDynamicBoolean(args["grouping"]);
    return formatLocalizedNumber(num, {
      locale: context.locale,
      decimals: decimals !== undefined && Number.isFinite(decimals) ? decimals : undefined,
      grouping,
    });
  },
};

export const formatCurrencyFunction: FunctionImplementation = {
  name: "formatCurrency",
  returnType: "string",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args, context) => {
    const num = parseNumericOperand(args["value"]);
    const currency =
      typeof args["currency"] === "string" ? args["currency"].trim() : "";
    if (currency.length === 0) {
      return "";
    }
    const rawDecimals = args["decimals"];
    const decimals =
      rawDecimals !== undefined && rawDecimals !== null
        ? parseNumericOperand(rawDecimals)
        : undefined;
    const grouping =
      args["grouping"] === undefined
        ? true
        : coerceDynamicBoolean(args["grouping"]);
    return formatLocalizedCurrency(num, currency, {
      locale: context.locale,
      decimals: decimals !== undefined && Number.isFinite(decimals) ? decimals : undefined,
      grouping,
    });
  },
};

export const formatDateFunction: FunctionImplementation = {
  name: "formatDate",
  returnType: "string",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args, context) => {
    const pattern =
      typeof args["format"] === "string" ? args["format"] : "yyyy-MM-dd";
    return formatTr35Date(args["value"], pattern, context.locale);
  },
};

export const pluralizeFunction: FunctionImplementation = {
  name: "pluralize",
  returnType: "string",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args, context) => evaluatePluralize(args, context.locale),
};

export const openUrlFunction: FunctionImplementation = {
  name: "openUrl",
  returnType: "void",
  allowedCallers: "rendererOnly",
  requiresUserActivation: true,
  execute: (args, context) => {
    if (context.userActivation === false) {
      throw new A2uiFunctionError(
        "USER_ACTIVATION_REQUIRED",
        "Function 'openUrl' requires user activation",
        "openUrl",
      );
    }
    const validUrl = validateSafeUrl(args["url"]);
    if (context.openUrl) {
      context.openUrl(validUrl);
    }
    return null;
  },
};

export const andFunction: FunctionImplementation = {
  name: "and",
  returnType: "boolean",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args) => {
    const values = args["values"];
    if (!Array.isArray(values) || values.length < 2) {
      throw new A2uiFunctionError(
        "EXPRESSION_ERROR",
        "Function 'and' requires a 'values' array with at least 2 items",
        "and",
      );
    }
    for (let i = 0; i < values.length; i += 1) {
      if (!coerceDynamicBoolean(values[i])) {
        return false;
      }
    }
    return true;
  },
};

export const orFunction: FunctionImplementation = {
  name: "or",
  returnType: "boolean",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args) => {
    const values = args["values"];
    if (!Array.isArray(values) || values.length < 2) {
      throw new A2uiFunctionError(
        "EXPRESSION_ERROR",
        "Function 'or' requires a 'values' array with at least 2 items",
        "or",
      );
    }
    for (let i = 0; i < values.length; i += 1) {
      if (coerceDynamicBoolean(values[i])) {
        return true;
      }
    }
    return false;
  },
};

export const notFunction: FunctionImplementation = {
  name: "not",
  returnType: "boolean",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args) => !coerceDynamicBoolean(args["value"]),
};

/**
 * Universal catalogless `@index` system function returning the 0-based
 * iteration index of the innermost enclosing collection template, plus an
 * optional numeric `offset` (default 0).
 */
export const indexFunction: FunctionImplementation = {
  name: "@index",
  returnType: "number",
  allowedCallers: "rendererOnly",
  requiresUserActivation: false,
  execute: (args, context) => {
    const indices = context.collectionIndices;
    if (!indices || indices.length === 0) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "@index function can only be evaluated inside a collection template iteration scope.",
      );
    }
    const current = indices[indices.length - 1];
    if (typeof current !== "number" || !Number.isFinite(current)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        "@index function can only be evaluated inside a collection template iteration scope.",
      );
    }
    const rawOffset = args["offset"];
    const offset =
      rawOffset === undefined || rawOffset === null
        ? 0
        : parseNumericOperand(rawOffset);
    return current + (Number.isFinite(offset) ? offset : 0);
  },
};

/** All 14 Basic Catalog v1.0 standard functions. */
export const BASIC_V1_FUNCTIONS: readonly FunctionImplementation[] =
  Object.freeze([
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
  ]);

/** Universal protocol system functions (catalogless). */
export const SYSTEM_V1_FUNCTIONS: readonly FunctionImplementation[] =
  Object.freeze([indexFunction]);
