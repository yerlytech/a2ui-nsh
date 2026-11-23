/**
 * Core types and errors for A2UI v1.0 function execution, validation results,
 * user-activation guards, and narrow host seams (URL opener).
 */

import type { AllowedCallers, CatalogRegistry, FunctionReturnType } from "../catalog";
import type { DataContext } from "../data_model";
import type { JsonObject } from "../json_schema";
import type { FunctionRegistry } from "./registry";

/** Severity level attached to a v1.0 `ValidationResult`. */
export type ValidationSeverity = "error" | "warning" | "info";

/**
 * Structured result returned by v1.0 validation functions (`required`, `regex`,
 * `length`, `numeric`, `email`, and custom catalog validators).
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly severity?: ValidationSeverity;
  readonly [extra: string]: unknown;
}

/** Normalized check-rule failure/pass entry stored in component validation state. */
export interface NormalizedValidationResult {
  readonly valid: boolean;
  readonly code?: string;
  readonly message: string;
  readonly severity: ValidationSeverity;
}

/** Aggregated validation state produced from evaluating a component's `@checks`. */
export interface ComponentValidationState {
  readonly isValid: boolean;
  readonly validationErrors: readonly string[];
  readonly validationResults: readonly NormalizedValidationResult[];
  readonly validationResult?: NormalizedValidationResult;
}

export type FunctionErrorCode =
  | "EXPRESSION_ERROR"
  | "EXECUTION_ERROR"
  | "INVALID_FUNCTION_CALL"
  | "USER_ACTIVATION_REQUIRED"
  | "UNKNOWN_FUNCTION";

/** Typed error raised during A2UI function evaluation. */
export class A2uiFunctionError extends Error {
  readonly category = "ExpressionError" as const;
  readonly code: FunctionErrorCode;
  readonly functionName?: string;

  constructor(
    code: FunctionErrorCode,
    message: string,
    functionName?: string,
  ) {
    super(message);
    this.name = "A2uiFunctionError";
    this.code = code;
    this.functionName = functionName;
  }
}

/** Narrow host seam injected into `openUrl` so `src/core/` performs zero I/O. */
export type UrlOpener = (url: string) => void;

/** Safety limits enforced during runtime function evaluation. */
export interface FunctionEvalLimits {
  /** Maximum nested function-call evaluation depth. */
  readonly maxCallDepth: number;
}

/** Default runtime function-evaluation safety limits. */
export const DEFAULT_FUNCTION_EVAL_LIMITS: Readonly<FunctionEvalLimits> =
  Object.freeze({
    maxCallDepth: 32,
  });

/** Caller identity used to enforce `allowedCallers` boundaries. */
export type FunctionCaller = "renderer" | "agent";

/** Context supplied when evaluating a dynamic value or function call. */
export interface FunctionExecutionContext {
  readonly dataContext: DataContext;
  /** Enclosing collection iteration indices (innermost last), for `@index`. */
  readonly collectionIndices?: readonly number[];
  /** Active BCP 47 locale tag (defaults to `"en-US"`). */
  readonly locale?: string;
  /**
   * Whether the call runs under active user activation (e.g. button press).
   * Functions with `requiresUserActivation: true` fail closed when `false`.
   */
  readonly userActivation?: boolean;
  /** Injected URL opener seam for `openUrl`. */
  readonly openUrl?: UrlOpener;
  /**
   * Catalog ID inherited by template calls inside `formatString` `${...}`.
   * Never inherited across explicit JSON `{"@call": ...}` nesting.
   */
  readonly inheritedCatalogId?: string;
  /** Surface default catalog ID (undefined on a defaultless v1.0 surface). */
  readonly surfaceDefaultCatalogId?: string;
  /** Optional surface ID for diagnostics. */
  readonly surfaceId?: string;
  /** Caller identity enforcing `allowedCallers`. Defaults to `"renderer"`. */
  readonly caller?: FunctionCaller;
  /** Catalog registry containing loaded v1.0 catalogs available to the surface. */
  readonly catalogRegistry?: CatalogRegistry;
  /** Function implementation registry. */
  readonly functionRegistry?: FunctionRegistry;
  /** Current recursion depth (managed internally). */
  readonly callDepth?: number;
  /** Optional safety limit overrides. */
  readonly limits?: Partial<FunctionEvalLimits>;
  /**
   * Optional error sink for `formatString` template interpolations (`${fn(...)}`).
   * When provided, a failing template call reports its error here and renders
   * `""` for that part instead of throwing out of `formatString`.
   */
  readonly onTemplatePartError?: (error: Error) => void;
}

/** Executable local implementation of a catalog or system function. */
export interface FunctionImplementation {
  readonly name: string;
  readonly returnType: FunctionReturnType;
  readonly allowedCallers: AllowedCallers;
  readonly requiresUserActivation: boolean;
  /** Optional JSON Schema for validating resolved `args` when not defined in a catalog document. */
  readonly parametersSchema?: JsonObject;
  execute(
    args: Readonly<Record<string, unknown>>,
    context: FunctionExecutionContext,
  ): unknown;
}
