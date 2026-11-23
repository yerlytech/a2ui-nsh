/**
 * Barrel exports for A2UI v1.0 Basic Catalog functions, `@index`, safe regex
 * dialect analyzer, deterministic locale/CLDR formatters, coercion, and runtime
 * evaluation.
 */

export {
  A2uiFunctionError,
  DEFAULT_FUNCTION_EVAL_LIMITS,
  type ComponentValidationState,
  type FunctionCaller,
  type FunctionErrorCode,
  type FunctionEvalLimits,
  type FunctionExecutionContext,
  type FunctionImplementation,
  type NormalizedValidationResult,
  type UrlOpener,
  type ValidationResult,
  type ValidationSeverity,
} from "./types";

export {
  coerceDynamicBoolean,
  evaluateCheckRules,
  isValidationResult,
  normalizeCheckRuleResult,
} from "./coercion";

export {
  MAX_REGEX_PATTERN_CODE_POINTS,
  MAX_REGEX_VALUE_CODE_POINTS,
  analyzeRegex,
  compileSafeRegex,
  countCodePoints,
  type RegexAnalysisResult,
  type RegexRejectReason,
} from "./regex_dialect";

export {
  DEFAULT_LOCALE,
  formatLocalizedCurrency,
  formatLocalizedNumber,
  getCurrencyDefaultDecimals,
  getCurrencySymbol,
  getLocaleDateNames,
  getLocaleNumberProfile,
  resolveLocaleTag,
  selectPluralCategory,
  type LocaleDateNames,
  type LocaleNumberProfile,
  type NumberFormatOptions,
  type PluralCategory,
} from "./locale";

export {
  formatTr35Date,
  parseStrictTimestamp,
  type ParsedTimestamp,
} from "./date_format";

export {
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

export { FunctionRegistry } from "./registry";

export {
  evaluateComponentChecks,
  evaluateDynamicValue,
  evaluateFunctionCall,
  evaluateSurfaceComponents,
  type EvaluateSurfaceOptions,
  type EvaluatedComponentNode,
} from "./evaluator";
