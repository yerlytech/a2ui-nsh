/**
 * Pure TypeScript Draft 2020-12 JSON Schema subset evaluator for A2UI v1.0.
 *
 * Zero external dependencies; enforces explicit recursion depth caps and
 * tracks evaluated property sets for `unevaluatedProperties` across `$ref`,
 * `allOf`, `anyOf`, `oneOf`, and `if`/`then`/`else`.
 */

import { deepEqual } from "./data_model";
import { encodePointerSegment } from "./pointer";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export interface SchemaValidationIssue {
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
}

export interface SchemaValidationOptions {
  /** Maximum schema recursion / `$ref` expansion depth. Default: 64. */
  readonly maxDepth?: number;
  /** Optional custom resolver for external `$ref` URIs. */
  readonly resolveExternalRef?: (
    ref: string,
  ) => { readonly root: JsonObject; readonly schema: JsonValue } | undefined;
  /**
   * Optional hook invoked when a node matches a schema with `$ref` pointing to
   * `#/$defs/FunctionCall` or external `FunctionCall`. Returning `true`
   * short-circuits standard schema validation as valid; returning an issue
   * array short-circuits as invalid; returning `undefined` falls through to
   * normal JSON Schema evaluation.
   */
  readonly customRefValidator?: (
    ref: string,
    value: unknown,
    instancePath: string,
    root: JsonObject,
  ) => true | readonly SchemaValidationIssue[] | undefined;
}

/** Default Draft 2020-12 schema evaluation recursion cap. */
export const DEFAULT_MAX_SCHEMA_DEPTH = 64;

interface EvalResult {
  readonly valid: boolean;
  readonly issues: readonly SchemaValidationIssue[];
  readonly evaluatedProps: ReadonlySet<string>;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendPointer(base: string, segment: string | number): string {
  const encoded = encodePointerSegment(String(segment));
  return base === "" ? `/${encoded}` : `${base}/${encoded}`;
}

function decodeJsonPointerSegment(seg: string): string {
  return seg.replace(/~1/g, "/").replace(/~0/g, "~");
}

const localRefCache = new WeakMap<
  JsonObject,
  Map<string, JsonValue | undefined>
>();

/** Resolves a local JSON Pointer (`#` or `#/a/b`) within `root`. */
export function resolveLocalRef(
  root: JsonObject,
  ref: string,
): JsonValue | undefined {
  if (ref === "#") {
    return root;
  }
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  let byRef = localRefCache.get(root);
  if (byRef && byRef.has(ref)) {
    return byRef.get(ref);
  }
  const parts = ref.slice(2).split("/");
  let current: unknown = root;
  for (let i = 0; i < parts.length; i += 1) {
    if (!isJsonObject(current) && !Array.isArray(current)) {
      current = undefined;
      break;
    }
    const key = decodeJsonPointerSegment(parts[i]!);
    if (Array.isArray(current)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        current = undefined;
        break;
      }
      current = current[idx];
    } else if (Object.prototype.hasOwnProperty.call(current, key)) {
      current = current[key];
    } else {
      current = undefined;
      break;
    }
  }
  const result = current as JsonValue | undefined;
  if (!byRef) {
    byRef = new Map();
    localRefCache.set(root, byRef);
  }
  byRef.set(ref, result);
  return result;
}

function matchesJsonType(value: unknown, expected: string): boolean {
  switch (expected) {
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        Number.isInteger(value)
      );
    case "array":
      return Array.isArray(value);
    case "object":
      return isJsonObject(value);
    default:
      return false;
  }
}

const MAX_REGEX_CACHE_ENTRIES = 256;
const compiledRegexCache = new Map<string, RegExp | null>();

function compileRegex(pattern: string): RegExp | null {
  if (compiledRegexCache.has(pattern)) {
    return compiledRegexCache.get(pattern)!;
  }
  let compiled: RegExp | null = null;
  try {
    compiled = new RegExp(pattern, "u");
  } catch {
    try {
      compiled = new RegExp(pattern);
    } catch {
      compiled = null;
    }
  }
  if (compiledRegexCache.size >= MAX_REGEX_CACHE_ENTRIES) {
    const oldestKey = compiledRegexCache.keys().next().value;
    if (oldestKey !== undefined) {
      compiledRegexCache.delete(oldestKey);
    }
  }
  compiledRegexCache.set(pattern, compiled);
  return compiled;
}

// ISO 8601 / RFC 3339 format helpers used by Basic Catalog & common types.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME_RE =
  /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const URI_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:.+$/;

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function isValidTimeParts(hour: number, minute: number, second: number): boolean {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 60;
}

function matchesFormat(value: string, format: string): boolean {
  switch (format) {
    case "uri":
      return URI_RE.test(value) && !/\s/.test(value);
    case "date": {
      if (!ISO_DATE_RE.test(value)) {
        return false;
      }
      const [y, m, d] = value.split("-").map(Number);
      return isValidDateParts(y!, m!, d!);
    }
    case "time": {
      if (!ISO_TIME_RE.test(value)) {
        return false;
      }
      const [h, m, s] = value.slice(0, 8).split(":").map(Number);
      return isValidTimeParts(h!, m!, s!);
    }
    case "date-time": {
      if (!ISO_DATETIME_RE.test(value)) {
        return false;
      }
      const datePart = value.slice(0, 10);
      const timePart = value.slice(11, 19);
      const [y, mo, d] = datePart.split("-").map(Number);
      const [h, mi, s] = timePart.split(":").map(Number);
      return isValidDateParts(y!, mo!, d!) && isValidTimeParts(h!, mi!, s!);
    }
    default:
      return true;
  }
}

function unionSets(
  target: Set<string>,
  source: ReadonlySet<string>,
): void {
  for (const k of source) {
    target.add(k);
  }
}

function evaluateSchema(
  schema: JsonValue,
  value: unknown,
  root: JsonObject,
  instancePath: string,
  depth: number,
  options: SchemaValidationOptions,
): EvalResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_SCHEMA_DEPTH;
  if (depth > maxDepth) {
    return {
      valid: false,
      issues: [
        {
          path: instancePath || "/",
          keyword: "maxDepth",
          message: `Schema evaluation exceeded maximum depth of ${maxDepth}`,
        },
      ],
      evaluatedProps: EMPTY_SET,
    };
  }

  if (typeof schema === "boolean") {
    if (schema) {
      return { valid: true, issues: [], evaluatedProps: EMPTY_SET };
    }
    return {
      valid: false,
      issues: [
        {
          path: instancePath || "/",
          keyword: "false",
          message: `Value at '${instancePath || "/"}' is disallowed by false schema`,
        },
      ],
      evaluatedProps: EMPTY_SET,
    };
  }

  if (!isJsonObject(schema)) {
    return { valid: true, issues: [], evaluatedProps: EMPTY_SET };
  }

  const issues: SchemaValidationIssue[] = [];
  const evaluated = new Set<string>();

  // $ref
  if (typeof schema["$ref"] === "string") {
    const ref = schema["$ref"];
    if (options.customRefValidator) {
      const custom = options.customRefValidator(ref, value, instancePath, root);
      if (custom === true) {
        if (isJsonObject(value)) {
          for (const k of Object.keys(value)) {
            evaluated.add(k);
          }
        }
      } else if (custom !== undefined) {
        issues.push(...custom);
      } else {
        evaluateRef(ref, value, root, instancePath, depth, options, issues, evaluated);
      }
    } else {
      evaluateRef(ref, value, root, instancePath, depth, options, issues, evaluated);
    }
  }

  // type
  if (schema["type"] !== undefined) {
    const typeSpec = schema["type"];
    if (typeof typeSpec === "string") {
      if (!matchesJsonType(value, typeSpec)) {
        issues.push({
          path: instancePath || "/",
          keyword: "type",
          message: `Expected type '${typeSpec}' at '${instancePath || "/"}'`,
        });
      }
    } else if (Array.isArray(typeSpec)) {
      const ok = typeSpec.some(
        (t) => typeof t === "string" && matchesJsonType(value, t),
      );
      if (!ok) {
        issues.push({
          path: instancePath || "/",
          keyword: "type",
          message: `Expected one of types [${typeSpec.join(", ")}] at '${instancePath || "/"}'`,
        });
      }
    }
  }

  // const
  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    if (!deepEqual(value, schema["const"])) {
      issues.push({
        path: instancePath || "/",
        keyword: "const",
        message: `Expected constant value ${JSON.stringify(schema["const"])} at '${instancePath || "/"}'`,
      });
    }
  }

  // enum
  if (Array.isArray(schema["enum"])) {
    const allowed = schema["enum"];
    if (!allowed.some((item) => deepEqual(value, item))) {
      issues.push({
        path: instancePath || "/",
        keyword: "enum",
        message: `Value at '${instancePath || "/"}' must be one of ${JSON.stringify(allowed)}`,
      });
    }
  }

  // String keywords
  if (typeof value === "string") {
    if (typeof schema["minLength"] === "number") {
      const cpLen = Array.from(value).length;
      if (cpLen < schema["minLength"]) {
        issues.push({
          path: instancePath || "/",
          keyword: "minLength",
          message: `String at '${instancePath || "/"}' is shorter than minLength ${schema["minLength"]}`,
        });
      }
    }
    if (typeof schema["maxLength"] === "number") {
      const cpLen = Array.from(value).length;
      if (cpLen > schema["maxLength"]) {
        issues.push({
          path: instancePath || "/",
          keyword: "maxLength",
          message: `String at '${instancePath || "/"}' exceeds maxLength ${schema["maxLength"]}`,
        });
      }
    }
    if (typeof schema["pattern"] === "string") {
      const re = compileRegex(schema["pattern"]);
      if (re && !re.test(value)) {
        issues.push({
          path: instancePath || "/",
          keyword: "pattern",
          message: `String at '${instancePath || "/"}' does not match pattern '${schema["pattern"]}'`,
        });
      }
    }
    if (typeof schema["format"] === "string") {
      if (!matchesFormat(value, schema["format"])) {
        issues.push({
          path: instancePath || "/",
          keyword: "format",
          message: `String at '${instancePath || "/"}' does not match format '${schema["format"]}'`,
        });
      }
    }
  }

  // Numeric keywords
  if (typeof value === "number" && Number.isFinite(value)) {
    if (typeof schema["minimum"] === "number" && value < schema["minimum"]) {
      issues.push({
        path: instancePath || "/",
        keyword: "minimum",
        message: `Number ${value} at '${instancePath || "/"}' is less than minimum ${schema["minimum"]}`,
      });
    }
    if (typeof schema["maximum"] === "number" && value > schema["maximum"]) {
      issues.push({
        path: instancePath || "/",
        keyword: "maximum",
        message: `Number ${value} at '${instancePath || "/"}' exceeds maximum ${schema["maximum"]}`,
      });
    }
    if (
      typeof schema["exclusiveMinimum"] === "number" &&
      value <= schema["exclusiveMinimum"]
    ) {
      issues.push({
        path: instancePath || "/",
        keyword: "exclusiveMinimum",
        message: `Number ${value} at '${instancePath || "/"}' must be > ${schema["exclusiveMinimum"]}`,
      });
    }
    if (
      typeof schema["exclusiveMaximum"] === "number" &&
      value >= schema["exclusiveMaximum"]
    ) {
      issues.push({
        path: instancePath || "/",
        keyword: "exclusiveMaximum",
        message: `Number ${value} at '${instancePath || "/"}' must be < ${schema["exclusiveMaximum"]}`,
      });
    }
    if (typeof schema["multipleOf"] === "number" && schema["multipleOf"] > 0) {
      const ratio = value / schema["multipleOf"];
      if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
        issues.push({
          path: instancePath || "/",
          keyword: "multipleOf",
          message: `Number ${value} at '${instancePath || "/"}' is not a multiple of ${schema["multipleOf"]}`,
        });
      }
    }
  }

  // Array keywords
  if (Array.isArray(value)) {
    if (typeof schema["minItems"] === "number" && value.length < schema["minItems"]) {
      issues.push({
        path: instancePath || "/",
        keyword: "minItems",
        message: `Array at '${instancePath || "/"}' must have at least ${schema["minItems"]} item(s)`,
      });
    }
    if (typeof schema["maxItems"] === "number" && value.length > schema["maxItems"]) {
      issues.push({
        path: instancePath || "/",
        keyword: "maxItems",
        message: `Array at '${instancePath || "/"}' must have at most ${schema["maxItems"]} item(s)`,
      });
    }
    if (schema["uniqueItems"] === true) {
      for (let i = 0; i < value.length; i += 1) {
        for (let j = i + 1; j < value.length; j += 1) {
          if (deepEqual(value[i], value[j])) {
            issues.push({
              path: appendPointer(instancePath, j),
              keyword: "uniqueItems",
              message: `Duplicate item in array at '${instancePath || "/"}'`,
            });
            break;
          }
        }
      }
    }
    let prefixCount = 0;
    if (Array.isArray(schema["prefixItems"])) {
      const prefixSchemas = schema["prefixItems"];
      prefixCount = prefixSchemas.length;
      for (let i = 0; i < Math.min(value.length, prefixCount); i += 1) {
        const res = evaluateSchema(
          prefixSchemas[i]!,
          value[i],
          root,
          appendPointer(instancePath, i),
          depth + 1,
          options,
        );
        if (!res.valid) {
          issues.push(...res.issues);
        }
      }
    }
    if (schema["items"] !== undefined) {
      const itemSchema = schema["items"];
      for (let i = prefixCount; i < value.length; i += 1) {
        const res = evaluateSchema(
          itemSchema,
          value[i],
          root,
          appendPointer(instancePath, i),
          depth + 1,
          options,
        );
        if (!res.valid) {
          issues.push(...res.issues);
        }
      }
    }
    if (schema["contains"] !== undefined) {
      const containsSchema = schema["contains"];
      let matched = 0;
      for (let i = 0; i < value.length; i += 1) {
        const res = evaluateSchema(
          containsSchema,
          value[i],
          root,
          appendPointer(instancePath, i),
          depth + 1,
          options,
        );
        if (res.valid) {
          matched += 1;
        }
      }
      if (matched === 0) {
        issues.push({
          path: instancePath || "/",
          keyword: "contains",
          message: `Array at '${instancePath || "/"}' contains no matching item`,
        });
      }
    }
  }

  // Object keywords
  if (isJsonObject(value)) {
    const keys = Object.keys(value);
    if (
      typeof schema["minProperties"] === "number" &&
      keys.length < schema["minProperties"]
    ) {
      issues.push({
        path: instancePath || "/",
        keyword: "minProperties",
        message: `Object at '${instancePath || "/"}' must have at least ${schema["minProperties"]} properties`,
      });
    }
    if (
      typeof schema["maxProperties"] === "number" &&
      keys.length > schema["maxProperties"]
    ) {
      issues.push({
        path: instancePath || "/",
        keyword: "maxProperties",
        message: `Object at '${instancePath || "/"}' must have at most ${schema["maxProperties"]} properties`,
      });
    }

    if (Array.isArray(schema["required"])) {
      for (const reqKey of schema["required"]) {
        if (
          typeof reqKey === "string" &&
          !Object.prototype.hasOwnProperty.call(value, reqKey)
        ) {
          issues.push({
            path: appendPointer(instancePath, reqKey),
            keyword: "required",
            message: `Missing required property '${reqKey}'`,
          });
        }
      }
    }

    if (schema["propertyNames"] !== undefined) {
      const propNameSchema = schema["propertyNames"];
      for (const key of keys) {
        const res = evaluateSchema(
          propNameSchema,
          key,
          root,
          appendPointer(instancePath, key),
          depth + 1,
          options,
        );
        if (!res.valid) {
          issues.push({
            path: appendPointer(instancePath, key),
            keyword: "propertyNames",
            message: `Invalid property name '${key}'`,
          });
        }
      }
    }

    const localMatched = new Set<string>();

    if (isJsonObject(schema["properties"])) {
      const props = schema["properties"];
      for (const [propName, propSchema] of Object.entries(props)) {
        if (Object.prototype.hasOwnProperty.call(value, propName)) {
          localMatched.add(propName);
          evaluated.add(propName);
          const res = evaluateSchema(
            propSchema,
            value[propName],
            root,
            appendPointer(instancePath, propName),
            depth + 1,
            options,
          );
          if (!res.valid) {
            issues.push(...res.issues);
          }
        }
      }
    }

    if (isJsonObject(schema["patternProperties"])) {
      const patternProps = schema["patternProperties"];
      for (const [pattern, propSchema] of Object.entries(patternProps)) {
        const re = compileRegex(pattern);
        if (!re) {
          continue;
        }
        for (const key of keys) {
          if (re.test(key)) {
            localMatched.add(key);
            evaluated.add(key);
            const res = evaluateSchema(
              propSchema,
              value[key],
              root,
              appendPointer(instancePath, key),
              depth + 1,
              options,
            );
            if (!res.valid) {
              issues.push(...res.issues);
            }
          }
        }
      }
    }

    if (schema["additionalProperties"] !== undefined) {
      const addSchema = schema["additionalProperties"];
      for (const key of keys) {
        if (!localMatched.has(key)) {
          if (addSchema === false) {
            issues.push({
              path: appendPointer(instancePath, key),
              keyword: "additionalProperties",
              message: `Unexpected property '${key}'`,
            });
          } else if (addSchema === true) {
            evaluated.add(key);
          } else {
            evaluated.add(key);
            const res = evaluateSchema(
              addSchema,
              value[key],
              root,
              appendPointer(instancePath, key),
              depth + 1,
              options,
            );
            if (!res.valid) {
              issues.push(...res.issues);
            }
          }
        }
      }
    }
  }

  // Combinators: allOf, anyOf, oneOf, not, if/then/else
  if (Array.isArray(schema["allOf"])) {
    for (const sub of schema["allOf"]) {
      const res = evaluateSchema(
        sub,
        value,
        root,
        instancePath,
        depth + 1,
        options,
      );
      if (res.valid) {
        unionSets(evaluated, res.evaluatedProps);
      } else {
        issues.push(...res.issues);
      }
    }
  }

  if (Array.isArray(schema["anyOf"])) {
    const subs = schema["anyOf"];
    let anyValid = false;
    const branchIssues: SchemaValidationIssue[] = [];
    for (const sub of subs) {
      const res = evaluateSchema(
        sub,
        value,
        root,
        instancePath,
        depth + 1,
        options,
      );
      if (res.valid) {
        anyValid = true;
        unionSets(evaluated, res.evaluatedProps);
      } else if (branchIssues.length === 0) {
        branchIssues.push(...res.issues);
      }
    }
    if (!anyValid) {
      issues.push(
        ...(branchIssues.length > 0
          ? branchIssues
          : [
              {
                path: instancePath || "/",
                keyword: "anyOf",
                message: `Value at '${instancePath || "/"}' did not match anyOf branches`,
              },
            ]),
      );
    }
  }

  if (Array.isArray(schema["oneOf"])) {
    const subs = schema["oneOf"];
    let matchCount = 0;
    let matchedProps: ReadonlySet<string> = EMPTY_SET;
    let bestIssues: readonly SchemaValidationIssue[] = [];
    for (const sub of subs) {
      const res = evaluateSchema(
        sub,
        value,
        root,
        instancePath,
        depth + 1,
        options,
      );
      if (res.valid) {
        matchCount += 1;
        matchedProps = res.evaluatedProps;
      } else if (
        bestIssues.length === 0 ||
        (res.issues.length > 0 && res.issues.length < bestIssues.length)
      ) {
        bestIssues = res.issues;
      }
    }
    if (matchCount === 1) {
      unionSets(evaluated, matchedProps);
    } else if (matchCount === 0) {
      issues.push({
        path: instancePath || "/",
        keyword: "oneOf",
        message:
          bestIssues[0]?.message ??
          `Value at '${instancePath || "/"}' matched none of the oneOf schemas`,
      });
    } else {
      issues.push({
        path: instancePath || "/",
        keyword: "oneOf",
        message: `Value at '${instancePath || "/"}' matched ${matchCount} oneOf schemas (expected 1)`,
      });
    }
  }

  if (schema["not"] !== undefined) {
    const res = evaluateSchema(
      schema["not"],
      value,
      root,
      instancePath,
      depth + 1,
      options,
    );
    if (res.valid) {
      issues.push({
        path: instancePath || "/",
        keyword: "not",
        message: `Value at '${instancePath || "/"}' matched forbidden 'not' schema`,
      });
    }
  }

  if (schema["if"] !== undefined) {
    const ifRes = evaluateSchema(
      schema["if"],
      value,
      root,
      instancePath,
      depth + 1,
      options,
    );
    if (ifRes.valid) {
      unionSets(evaluated, ifRes.evaluatedProps);
      if (schema["then"] !== undefined) {
        const thenRes = evaluateSchema(
          schema["then"],
          value,
          root,
          instancePath,
          depth + 1,
          options,
        );
        if (thenRes.valid) {
          unionSets(evaluated, thenRes.evaluatedProps);
        } else {
          issues.push(...thenRes.issues);
        }
      }
    } else if (schema["else"] !== undefined) {
      const elseRes = evaluateSchema(
        schema["else"],
        value,
        root,
        instancePath,
        depth + 1,
        options,
      );
      if (elseRes.valid) {
        unionSets(evaluated, elseRes.evaluatedProps);
      } else {
        issues.push(...elseRes.issues);
      }
    }
  }

  // unevaluatedProperties (evaluated AFTER combinators & $ref)
  if (isJsonObject(value) && schema["unevaluatedProperties"] !== undefined) {
    const unevalSchema = schema["unevaluatedProperties"];
    for (const key of Object.keys(value)) {
      if (!evaluated.has(key)) {
        if (unevalSchema === false) {
          issues.push({
            path: appendPointer(instancePath, key),
            keyword: "unevaluatedProperties",
            message: `Unexpected property '${key}'`,
          });
        } else if (unevalSchema === true) {
          evaluated.add(key);
        } else {
          evaluated.add(key);
          const res = evaluateSchema(
            unevalSchema,
            value[key],
            root,
            appendPointer(instancePath, key),
            depth + 1,
            options,
          );
          if (!res.valid) {
            issues.push(...res.issues);
          }
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    evaluatedProps: evaluated,
  };
}

function evaluateRef(
  ref: string,
  value: unknown,
  root: JsonObject,
  instancePath: string,
  depth: number,
  options: SchemaValidationOptions,
  issues: SchemaValidationIssue[],
  evaluated: Set<string>,
): void {
  if (ref.startsWith("#")) {
    const target = resolveLocalRef(root, ref);
    if (target === undefined) {
      issues.push({
        path: instancePath || "/",
        keyword: "$ref",
        message: `Unresolved local $ref '${ref}'`,
      });
      return;
    }
    const res = evaluateSchema(
      target,
      value,
      root,
      instancePath,
      depth + 1,
      options,
    );
    if (res.valid) {
      unionSets(evaluated, res.evaluatedProps);
    } else {
      issues.push(...res.issues);
    }
    return;
  }

  if (options.resolveExternalRef) {
    const resolved = options.resolveExternalRef(ref);
    if (resolved !== undefined) {
      const res = evaluateSchema(
        resolved.schema,
        value,
        resolved.root,
        instancePath,
        depth + 1,
        options,
      );
      if (res.valid) {
        unionSets(evaluated, res.evaluatedProps);
      } else {
        issues.push(...res.issues);
      }
      return;
    }
  }

  issues.push({
    path: instancePath || "/",
    keyword: "$ref",
    message: `Unresolved external $ref '${ref}'`,
  });
}

/**
 * Validates `value` against a Draft 2020-12 JSON Schema (`schema`) rooted at `root`.
 * Returns an empty array when valid, or one or more `SchemaValidationIssue` items.
 */
export function validateJsonSchema(
  schema: JsonValue,
  value: unknown,
  root?: JsonObject,
  options: SchemaValidationOptions = {},
  basePath = "",
): readonly SchemaValidationIssue[] {
  const effectiveRoot = root ?? (isJsonObject(schema) ? schema : {});
  return evaluateSchema(schema, value, effectiveRoot, basePath, 0, options)
    .issues;
}
