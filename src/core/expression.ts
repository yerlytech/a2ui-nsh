/**
 * Pure TypeScript A2UI v1.0 expression template parser (`${...}`),
 * UAX #31 identifier checks, reserved single-`@` key validation,
 * and `@@` prefix-doubling unescaping.
 */

import type { DataContext } from "./data_model";

export type ExpressionErrorCode =
  | "UNCLOSED_INTERPOLATION"
  | "MAX_DEPTH_EXCEEDED"
  | "INVALID_NUMBER"
  | "UNTERMINATED_STRING"
  | "MISSING_ARG_COLON"
  | "MISSING_CLOSING_PAREN"
  | "UNEXPECTED_CHARACTERS"
  | "EXPRESSION_TOO_LONG";

/** Typed parse error raised by `parseExpressionTemplate`. */
export class A2uiExpressionError extends Error {
  readonly category = "ParseError" as const;
  readonly code: ExpressionErrorCode;

  constructor(code: ExpressionErrorCode, message: string) {
    super(message);
    this.name = "A2uiExpressionError";
    this.code = code;
  }
}

/** Structured detail item attached to an `A2uiValidationError`. */
export interface ValidationErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly surfaceId?: string;
}

/** Optional extra fields for `A2uiValidationError`. */
export interface ValidationErrorContext {
  readonly surfaceId?: string;
  readonly functionCallId?: string;
  readonly details?: readonly ValidationErrorDetail[];
}

/** Typed validation error raised for protocol schema / reserved-key violations. */
export class A2uiValidationError extends Error {
  readonly category = "ValidationError" as const;
  readonly code: string;
  readonly path?: string;
  readonly surfaceId?: string;
  readonly functionCallId?: string;
  readonly details?: readonly ValidationErrorDetail[];

  constructor(
    code: string,
    message: string,
    path?: string,
    context?: ValidationErrorContext,
  ) {
    super(message);
    this.name = "A2uiValidationError";
    this.code = code;
    this.path = path;
    this.surfaceId = context?.surfaceId;
    this.functionCallId = context?.functionCallId;
    this.details = context?.details;
  }
}

/** Safety limits enforced during expression template parsing. */
export interface ExpressionLimits {
  /** Maximum nesting depth across `${...}` interpolations and function-call arguments. */
  readonly maxDepth: number;
  /** Maximum length (UTF-16 code units) of a single template string. */
  readonly maxLength: number;
}

/**
 * Default safety limits for expression parsing.
 * `maxDepth: 100` matches the upstream A2UI conformance bound.
 * Override via `parseExpressionTemplate(..., limits)`.
 */
export const DEFAULT_EXPRESSION_LIMITS: Readonly<ExpressionLimits> =
  Object.freeze({
    maxDepth: 100,
    maxLength: 65_536,
  });

/** Data binding node produced by `${path}` inside an expression template. */
export interface PathExpression {
  readonly path: string;
}

/** Function call node produced by `${fn(arg: value)}` inside an expression template. */
export interface CallExpression {
  readonly call: string;
  readonly args: Readonly<Record<string, ExpressionPart>>;
  readonly returnType: "any";
}

/** AST node produced by `parseExpressionTemplate`. */
export type ExpressionPart =
  | string
  | number
  | boolean
  | PathExpression
  | CallExpression;

/** Injected function-call evaluator seam for `evaluateExpressionTemplate`. */
export type FunctionEvaluator = (
  name: string,
  args: Readonly<Record<string, unknown>>,
) => unknown;

/** Type guard for a parsed `PathExpression`. */
export function isPathExpression(part: ExpressionPart): part is PathExpression {
  return (
    typeof part === "object" &&
    part !== null &&
    "path" in part &&
    typeof part.path === "string"
  );
}

/** Type guard for a parsed `CallExpression`. */
export function isCallExpression(part: ExpressionPart): part is CallExpression {
  return (
    typeof part === "object" &&
    part !== null &&
    "call" in part &&
    typeof part.call === "string"
  );
}

// UAX #31 Unicode identifier patterns (a2ui_protocol.md §Catalog Entity Naming Rules).
const UAX31_IDENTIFIER_RE = /^[\p{XID_Start}_][\p{XID_Continue}]*$/u;
const XID_START_OR_UNDERSCORE_RE = /^[\p{XID_Start}_]$/u;
const XID_CONTINUE_RE = /^\p{XID_Continue}$/u;

/** Checks whether `name` conforms to UAX #31 (`^[\p{XID_Start}_][\p{XID_Continue}]*$`). */
export function isValidUax31Identifier(name: string): boolean {
  return name.length > 0 && UAX31_IDENTIFIER_RE.test(name);
}

/** Checks whether `name` is valid as a v1.0 `@call` function name (UAX #31 or `@index`). */
export function isValidFunctionCallName(name: string): boolean {
  return name === "@index" || isValidUax31Identifier(name);
}

/** Component-level envelope keys allowed with a single `@` prefix in v1.0. */
export const COMPONENT_ENVELOPE_RESERVED_KEYS: ReadonlySet<string> = new Set([
  "@catalogId",
  "@accessibility",
  "@metadata",
  "@checks",
]);

const SINGLE_AT_KEY_RE = /^@([^@]|$)/;

/** True when `key` starts with a single unescaped `@` (`^@([^@]|$)`). */
export function isDisallowedSingleAtKey(key: string): boolean {
  return SINGLE_AT_KEY_RE.test(key);
}

/** Unescapes a prefix-doubled literal key (`@@path` -> `@path`, `@@` -> `@`). */
export function unescapeAtKey(key: string): string {
  return key.startsWith("@@") ? key.slice(1) : key;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function defineOwn(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** True when `value` is a strict v1.0 DataBinding (`{ "@path": string }`). */
export function isV1DataBinding(
  value: unknown,
): value is { readonly "@path": string } {
  if (!isPlainObject(value) || !hasOwn(value, "@path")) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && typeof value["@path"] === "string";
}

/** True when `value` is a strict v1.0 FunctionCall (`{ "@call": string, args?, catalogId? }`). */
export function isV1FunctionCall(
  value: unknown,
): value is {
  readonly "@call": string;
  readonly args?: Record<string, unknown>;
  readonly catalogId?: string;
} {
  if (!isPlainObject(value) || !hasOwn(value, "@call")) {
    return false;
  }
  if (typeof value["@call"] !== "string") {
    return false;
  }
  for (const key of Object.keys(value)) {
    if (key !== "@call" && key !== "args" && key !== "catalogId") {
      return false;
    }
  }
  if (hasOwn(value, "args") && !isPlainObject(value["args"])) {
    return false;
  }
  if (hasOwn(value, "catalogId") && typeof value["catalogId"] !== "string") {
    return false;
  }
  return true;
}

/**
 * Validates v1.0 reserved single-`@` key rules recursively across any
 * `DynamicValue` (property value, action context, or function arguments).
 */
export function validateReservedKeysInDynamicValue(
  value: unknown,
  pointerPath: string = "",
): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      validateReservedKeysInDynamicValue(value[i], `${pointerPath}/${i}`);
    }
    return;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (hasOwn(obj, "@path")) {
    if (!isV1DataBinding(obj)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Invalid @path DataBinding object at "${pointerPath || "/"}"`,
        pointerPath || undefined,
      );
    }
    return;
  }

  if (hasOwn(obj, "@call")) {
    if (!isV1FunctionCall(obj)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Invalid @call FunctionCall object at "${pointerPath || "/"}"`,
        pointerPath || undefined,
      );
    }
    if (!isValidFunctionCallName(obj["@call"])) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Invalid function call name "${obj["@call"]}" at "${pointerPath || "/"}"`,
        pointerPath || undefined,
      );
    }
    if (obj.args) {
      for (const argKey of Object.keys(obj.args)) {
        if (!isValidUax31Identifier(argKey)) {
          throw new A2uiValidationError(
            "VALIDATION_FAILED",
            `Invalid argument key "${argKey}" in @call "${obj["@call"]}"`,
            `${pointerPath}/args/${argKey}`,
          );
        }
        validateReservedKeysInDynamicValue(
          obj.args[argKey],
          `${pointerPath}/args/${argKey}`,
        );
      }
    }
    return;
  }

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]!;
    const childPath = `${pointerPath}/${key}`;
    if (isDisallowedSingleAtKey(key)) {
      throw new A2uiValidationError(
        "VALIDATION_FAILED",
        `Disallowed reserved single-@ key "${key}" in dynamic object at "${childPath}"`,
        childPath,
      );
    }
    validateReservedKeysInDynamicValue(obj[key], childPath);
  }
}

/**
 * Validates v1.0 reserved `@` keys on a component object: allows only the four
 * component envelope mixin keys at top level and enforces strict dynamic-value
 * rules on all nested properties.
 */
export function validateReservedKeysInComponent(
  component: Record<string, unknown>,
): void {
  const keys = Object.keys(component);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]!;
    const val = component[key];
    if (isDisallowedSingleAtKey(key)) {
      if (!COMPONENT_ENVELOPE_RESERVED_KEYS.has(key)) {
        throw new A2uiValidationError(
          "VALIDATION_FAILED",
          `Disallowed component-level reserved key "${key}"`,
          `/${key}`,
        );
      }
      if (key === "@metadata" && isPlainObject(val)) {
        const ext = val["extensions"];
        if (ext !== undefined) {
          if (!isPlainObject(ext)) {
            throw new A2uiValidationError(
              "VALIDATION_FAILED",
              `@metadata.extensions must be an object`,
              `/@metadata/extensions`,
            );
          }
          for (const extKey of Object.keys(ext)) {
            if (!isValidUax31Identifier(extKey)) {
              throw new A2uiValidationError(
                "VALIDATION_FAILED",
                `Invalid extension key "${extKey}" (must be UAX #31 identifier)`,
                `/@metadata/extensions/${extKey}`,
              );
            }
          }
        }
      } else if (key === "@accessibility" && isPlainObject(val)) {
        for (const accKey of ["label", "description", "hidden"] as const) {
          if (hasOwn(val, accKey)) {
            validateReservedKeysInDynamicValue(
              val[accKey],
              `/@accessibility/${accKey}`,
            );
          }
        }
      } else if (key === "@checks" && Array.isArray(val)) {
        for (let c = 0; c < val.length; c += 1) {
          const rule = val[c];
          if (isPlainObject(rule) && hasOwn(rule, "condition")) {
            validateReservedKeysInDynamicValue(
              rule["condition"],
              `/@checks/${c}/condition`,
            );
          }
        }
      }
      continue;
    }

    if (key === "id" || key === "component") {
      continue;
    }

    validateReservedKeysInDynamicValue(val, `/${key}`);
  }
}

/**
 * Recursively unescapes prefix-doubled `@@` keys in plain objects inside a
 * dynamic value (`"@@path"` -> `"@path"`, `"@@metadata"` -> `"@metadata"`),
 * while leaving `@path` DataBindings and `@call` directives intact.
 */
export function unescapeDynamicValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(unescapeDynamicValue);
  }
  const obj = value as Record<string, unknown>;
  if (isV1DataBinding(obj)) {
    return { "@path": obj["@path"] };
  }
  if (isV1FunctionCall(obj)) {
    const out: Record<string, unknown> = { "@call": obj["@call"] };
    if (obj.catalogId !== undefined) {
      out["catalogId"] = obj.catalogId;
    }
    if (obj.args !== undefined) {
      const nextArgs: Record<string, unknown> = {};
      for (const k of Object.keys(obj.args)) {
        defineOwn(nextArgs, k, unescapeDynamicValue(obj.args[k]));
      }
      out["args"] = nextArgs;
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    defineOwn(out, unescapeAtKey(key), unescapeDynamicValue(obj[key]));
  }
  return out;
}

function isAsciiDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function isWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function readCodePointAt(
  source: string,
  pos: number,
): { readonly char: string; readonly width: number } | null {
  if (pos >= source.length) {
    return null;
  }
  const cp = source.codePointAt(pos)!;
  const width = cp > 0xffff ? 2 : 1;
  return { char: source.slice(pos, pos + width), width };
}

function isPathChar(ch: string): boolean {
  if (
    ch === "/" ||
    ch === "." ||
    ch === "-" ||
    ch === "_" ||
    ch === "~" ||
    ch === "@"
  ) {
    return true;
  }
  return XID_CONTINUE_RE.test(ch);
}

/** Joins adjacent string parts and drops empty strings so AST comparisons stay canonical. */
export function joinExpressionLiterals(
  parts: readonly ExpressionPart[],
): ExpressionPart[] {
  const out: ExpressionPart[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (typeof part === "string") {
      if (part.length === 0) {
        continue;
      }
      const prev = out[out.length - 1];
      if (typeof prev === "string") {
        out[out.length - 1] = prev + part;
      } else {
        out.push(part);
      }
    } else {
      out.push(part);
    }
  }
  return out;
}

class TemplateExpressionParser {
  private readonly source: string;
  private readonly limits: ExpressionLimits;
  private pos = 0;

  constructor(source: string, limits: ExpressionLimits) {
    this.source = source;
    this.limits = limits;
  }

  parseTemplate(): ExpressionPart[] {
    if (this.source.length > this.limits.maxLength) {
      throw new A2uiExpressionError(
        "EXPRESSION_TOO_LONG",
        `Expression template length ${this.source.length} exceeds limit of ${this.limits.maxLength}`,
      );
    }

    const parts: ExpressionPart[] = [];
    let literalBuf = "";

    while (this.pos < this.source.length) {
      if (
        this.source[this.pos] === "\\" &&
        this.source.startsWith("${", this.pos + 1)
      ) {
        literalBuf += "${";
        this.pos += 3;
        continue;
      }

      if (this.source.startsWith("${", this.pos)) {
        if (literalBuf.length > 0) {
          parts.push(literalBuf);
          literalBuf = "";
        }
        this.pos += 2;
        const expr = this.parseInterpolationBody(1);
        parts.push(expr);
        continue;
      }

      literalBuf += this.source[this.pos]!;
      this.pos += 1;
    }

    if (literalBuf.length > 0) {
      parts.push(literalBuf);
    }

    return joinExpressionLiterals(parts);
  }

  private skipWs(): void {
    while (this.pos < this.source.length && isWhitespace(this.source[this.pos])) {
      this.pos += 1;
    }
  }

  private parseInterpolationBody(depth: number): ExpressionPart {
    if (depth > this.limits.maxDepth) {
      throw new A2uiExpressionError(
        "MAX_DEPTH_EXCEEDED",
        `Max recursion depth (${this.limits.maxDepth}) exceeded in expression`,
      );
    }
    this.skipWs();
    if (this.pos >= this.source.length) {
      throw new A2uiExpressionError(
        "UNCLOSED_INTERPOLATION",
        "Unclosed interpolation: expected '}'",
      );
    }
    if (this.source[this.pos] === "}") {
      this.pos += 1;
      return "";
    }
    const expr = this.parseExpression(depth);
    this.skipWs();
    if (this.pos >= this.source.length) {
      throw new A2uiExpressionError(
        "UNCLOSED_INTERPOLATION",
        "Unclosed interpolation: expected '}'",
      );
    }
    if (this.source[this.pos] !== "}") {
      throw new A2uiExpressionError(
        "UNEXPECTED_CHARACTERS",
        `Unexpected characters in expression near "${this.source.slice(this.pos, this.pos + 16)}"`,
      );
    }
    this.pos += 1;
    return expr;
  }

  private parseExpression(depth: number): ExpressionPart {
    if (depth > this.limits.maxDepth) {
      throw new A2uiExpressionError(
        "MAX_DEPTH_EXCEEDED",
        `Max recursion depth (${this.limits.maxDepth}) exceeded in expression`,
      );
    }
    this.skipWs();
    if (this.pos >= this.source.length) {
      throw new A2uiExpressionError(
        "UNCLOSED_INTERPOLATION",
        "Unclosed interpolation: unexpected end of input",
      );
    }

    if (this.source.startsWith("${", this.pos)) {
      this.pos += 2;
      return this.parseInterpolationBody(depth + 1);
    }

    const ch = this.source[this.pos]!;
    if (ch === "'" || ch === '"') {
      return this.parseStringLiteral(ch);
    }

    if (this.startsNumberLiteral()) {
      return this.parseNumberLiteral();
    }

    return this.parseIdentifierPathOrCall(depth);
  }

  private startsNumberLiteral(): boolean {
    const ch = this.source[this.pos];
    if (isAsciiDigit(ch)) {
      return true;
    }
    if (ch === "." && isAsciiDigit(this.source[this.pos + 1])) {
      return true;
    }
    if (ch === "+" || ch === "-") {
      const next = this.source[this.pos + 1];
      if (isAsciiDigit(next)) {
        return true;
      }
      if (next === "." && isAsciiDigit(this.source[this.pos + 2])) {
        return true;
      }
    }
    return false;
  }

  private parseNumberLiteral(): number {
    const start = this.pos;
    if (this.source[this.pos] === "+" || this.source[this.pos] === "-") {
      this.pos += 1;
    }

    while (isAsciiDigit(this.source[this.pos])) {
      this.pos += 1;
    }

    if (this.source[this.pos] === ".") {
      this.pos += 1;
      while (isAsciiDigit(this.source[this.pos])) {
        this.pos += 1;
      }
      if (this.source[this.pos] === ".") {
        throw new A2uiExpressionError(
          "INVALID_NUMBER",
          `Invalid number literal near "${this.source.slice(start, this.pos + 4)}"`,
        );
      }
    }

    if (this.source[this.pos] === "e" || this.source[this.pos] === "E") {
      this.pos += 1;
      if (this.source[this.pos] === "+" || this.source[this.pos] === "-") {
        this.pos += 1;
      }
      const expDigitsStart = this.pos;
      while (isAsciiDigit(this.source[this.pos])) {
        this.pos += 1;
      }
      if (this.pos === expDigitsStart) {
        throw new A2uiExpressionError(
          "INVALID_NUMBER",
          `Invalid number literal: exponent has no digits in "${this.source.slice(start, this.pos)}"`,
        );
      }
      if (this.source[this.pos] === ".") {
        throw new A2uiExpressionError(
          "INVALID_NUMBER",
          `Invalid number literal near "${this.source.slice(start, this.pos + 4)}"`,
        );
      }
    }

    const raw = this.source.slice(start, this.pos);
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      throw new A2uiExpressionError(
        "INVALID_NUMBER",
        `Number literal "${raw}" is out of range`,
      );
    }
    return Object.is(num, -0) ? 0 : num;
  }

  private parseStringLiteral(quote: "'" | '"'): string {
    this.pos += 1; // skip opening quote
    let out = "";
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos]!;
      if (ch === quote) {
        this.pos += 1;
        return out;
      }
      if (ch === "\\") {
        this.pos += 1;
        if (this.pos >= this.source.length) {
          throw new A2uiExpressionError(
            "UNTERMINATED_STRING",
            "Unterminated escape in string literal",
          );
        }
        const esc = this.source[this.pos]!;
        switch (esc) {
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "\\":
            out += "\\";
            break;
          case "'":
            out += "'";
            break;
          case '"':
            out += '"';
            break;
          default:
            out += esc;
            break;
        }
        this.pos += 1;
        continue;
      }
      out += ch;
      this.pos += 1;
    }
    throw new A2uiExpressionError(
      "UNTERMINATED_STRING",
      "Unterminated string literal",
    );
  }

  private parseIdentifierPathOrCall(depth: number): ExpressionPart {
    const start = this.pos;
    while (this.pos < this.source.length) {
      const cp = readCodePointAt(this.source, this.pos);
      if (cp === null || !isPathChar(cp.char)) {
        break;
      }
      this.pos += cp.width;
    }
    const token = this.source.slice(start, this.pos);
    if (token.length === 0) {
      throw new A2uiExpressionError(
        "UNEXPECTED_CHARACTERS",
        `Unexpected characters near "${this.source.slice(this.pos, this.pos + 16)}"`,
      );
    }

    if (this.source[this.pos] === "(") {
      return this.parseFunctionCall(token, depth);
    }

    if (token === "true") {
      return true;
    }
    if (token === "false") {
      return false;
    }
    if (token === "null") {
      return "";
    }
    return { path: token };
  }

  private parseFunctionCall(name: string, depth: number): CallExpression {
    this.pos += 1; // skip '('
    const callDepth = depth + 1;
    if (callDepth > this.limits.maxDepth) {
      throw new A2uiExpressionError(
        "MAX_DEPTH_EXCEEDED",
        `Max recursion depth (${this.limits.maxDepth}) exceeded in function call "${name}"`,
      );
    }

    const args: Record<string, ExpressionPart> = {};
    this.skipWs();

    if (this.source[this.pos] === ")") {
      this.pos += 1;
      return { call: name, args, returnType: "any" };
    }

    while (true) {
      this.skipWs();
      if (this.pos >= this.source.length) {
        throw new A2uiExpressionError(
          "MISSING_CLOSING_PAREN",
          "Expected ')' after function arguments",
        );
      }
      if (this.source[this.pos] === ")") {
        this.pos += 1;
        break;
      }

      const argName = this.readArgumentName();
      this.skipWs();
      if (argName.length === 0 || this.source[this.pos] !== ":") {
        throw new A2uiExpressionError(
          "MISSING_ARG_COLON",
          `Expected ':' after argument name in call to "${name}"`,
        );
      }
      this.pos += 1; // skip ':'

      const argValue = this.parseExpression(callDepth);
      defineOwn(args, argName, argValue);

      this.skipWs();
      if (this.source[this.pos] === ",") {
        this.pos += 1;
        continue;
      }
      if (this.source[this.pos] === ")") {
        this.pos += 1;
        break;
      }
      throw new A2uiExpressionError(
        "MISSING_CLOSING_PAREN",
        `Expected ',' or ')' after function arguments in call to "${name}"`,
      );
    }

    return { call: name, args, returnType: "any" };
  }

  private readArgumentName(): string {
    const start = this.pos;
    const first = readCodePointAt(this.source, this.pos);
    if (first === null || !XID_START_OR_UNDERSCORE_RE.test(first.char)) {
      return "";
    }
    this.pos += first.width;
    while (this.pos < this.source.length) {
      const cp = readCodePointAt(this.source, this.pos);
      if (cp === null || !XID_CONTINUE_RE.test(cp.char)) {
        break;
      }
      this.pos += cp.width;
    }
    return this.source.slice(start, this.pos);
  }
}

/**
 * Parses an A2UI `formatString` template into canonical AST parts
 * (adjacent literal strings joined, empty strings removed).
 */
export function parseExpressionTemplate(
  template: string,
  limits?: Partial<ExpressionLimits>,
): ExpressionPart[] {
  const effective: ExpressionLimits = {
    maxDepth: limits?.maxDepth ?? DEFAULT_EXPRESSION_LIMITS.maxDepth,
    maxLength: limits?.maxLength ?? DEFAULT_EXPRESSION_LIMITS.maxLength,
  };
  return new TemplateExpressionParser(template, effective).parseTemplate();
}

/** Converts an interpolated value to string per A2UI v1.0 `formatString` rules. */
export function stringifyInterpolatedValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function evaluatePart(
  part: ExpressionPart,
  context: DataContext,
  callFunction?: FunctionEvaluator,
): unknown {
  if (typeof part !== "object" || part === null) {
    return part;
  }
  if (isPathExpression(part)) {
    return context.get(part.path);
  }
  if (isCallExpression(part)) {
    if (!callFunction) {
      throw new A2uiExpressionError(
        "UNEXPECTED_CHARACTERS",
        `No function evaluator registered to call "${part.call}"`,
      );
    }
    const resolvedArgs: Record<string, unknown> = {};
    for (const key of Object.keys(part.args)) {
      defineOwn(
        resolvedArgs,
        key,
        evaluatePart(part.args[key]!, context, callFunction),
      );
    }
    return callFunction(part.call, resolvedArgs);
  }
  return "";
}

/**
 * Parses and evaluates an A2UI expression template against `context` and an
 * optional `callFunction` evaluator seam.
 */
export function evaluateExpressionTemplate(
  template: string,
  context: DataContext,
  callFunction?: FunctionEvaluator,
  limits?: Partial<ExpressionLimits>,
): string {
  const parts = parseExpressionTemplate(template, limits);
  let out = "";
  for (let i = 0; i < parts.length; i += 1) {
    out += stringifyInterpolatedValue(
      evaluatePart(parts[i]!, context, callFunction),
    );
  }
  return out;
}
