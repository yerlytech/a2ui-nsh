/**
 * Pure RFC 6901 JSON Pointer parsing, formatting, validation, and scoped path
 * resolution for the A2UI v1.0 data model.
 */

export type DataErrorCode =
  | "FORBIDDEN_SEGMENT"
  | "INVALID_ARRAY_INDEX"
  | "PRIMITIVE_TRAVERSAL"
  | "INDEX_LIMIT_EXCEEDED"
  | "DEPTH_LIMIT_EXCEEDED";

/** Typed error raised for invalid data-model pointer reads or writes. */
export class A2uiDataError extends Error {
  readonly category = "DataError" as const;
  readonly code: DataErrorCode;
  readonly path: string;

  constructor(code: DataErrorCode, message: string, path: string) {
    super(message);
    this.name = "A2uiDataError";
    this.code = code;
    this.path = path;
  }
}

/** Canonical RFC 6901 pointer string (root is "/", non-root has no trailing slash). */
export type CanonicalPointer = string;

/** Decoded, validated representation of a JSON Pointer. */
export interface ParsedPointer {
  readonly canonical: CanonicalPointer;
  readonly segments: readonly string[];
}

/** Safety limits enforced during pointer parsing and container auto-vivification. */
export interface PointerLimits {
  /** Maximum number of path segments permitted in one pointer. */
  readonly maxDepth: number;
  /** Maximum inclusive array index permitted when writing into or creating a list. */
  readonly maxListIndex: number;
}

/**
 * Default safety limits for JSON Pointer traversal and list allocation.
 * `maxListIndex` matches the upstream A2UI conformance bound (10000 inclusive).
 * Override via `DataModelOptions.limits` or `parsePointer(..., limits)`.
 */
export const DEFAULT_POINTER_LIMITS: Readonly<PointerLimits> = Object.freeze({
  maxDepth: 64,
  maxListIndex: 10_000,
});

const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const ARRAY_INDEX_PATTERN = /^(?:0|[1-9][0-9]*)$/;

/** Rejects segments that could traverse or pollute JavaScript object prototypes. */
export function assertSafeSegment(segment: string, path: string): void {
  if (FORBIDDEN_SEGMENTS.has(segment)) {
    throw new A2uiDataError(
      "FORBIDDEN_SEGMENT",
      `Forbidden path segment "${segment}" in path "${path}"`,
      path,
    );
  }
}

/**
 * Decodes a single RFC 6901 reference token (`~1` -> `/`, `~0` -> `~`)
 * in one pass so `~01` decodes to `~1` rather than `/`.
 */
export function decodePointerSegment(raw: string): string {
  if (!raw.includes("~")) {
    return raw;
  }
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "~" && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === "1") {
        out += "/";
        i += 1;
        continue;
      }
      if (next === "0") {
        out += "~";
        i += 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** Encodes a single segment into an RFC 6901 reference token (`~` -> `~0`, `/` -> `~1`). */
export function encodePointerSegment(segment: string): string {
  if (!segment.includes("~") && !segment.includes("/")) {
    return segment;
  }
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Formats decoded segments into a canonical JSON Pointer string. */
export function formatPointer(segments: readonly string[]): CanonicalPointer {
  if (segments.length === 0) {
    return "/";
  }
  return "/" + segments.map(encodePointerSegment).join("/");
}

/**
 * Parses and normalizes a JSON Pointer path into decoded segments and its
 * canonical string form.
 *
 * Empty segments from leading, trailing, or repeated slashes are collapsed
 * (`""`, `"/"`, `"///"` -> root `"/"`; `"//a///b//"` -> `"/a/b"`).
 */
export function parsePointer(
  path: string,
  limits: PointerLimits = DEFAULT_POINTER_LIMITS,
): ParsedPointer {
  const rawParts = path.split("/");
  const segments: string[] = [];

  for (let i = 0; i < rawParts.length; i += 1) {
    const raw = rawParts[i];
    if (raw === undefined || raw.length === 0) {
      continue;
    }
    if (segments.length >= limits.maxDepth) {
      throw new A2uiDataError(
        "DEPTH_LIMIT_EXCEEDED",
        `Pointer depth exceeds maximum of ${limits.maxDepth} in path "${path}"`,
        path,
      );
    }
    const decoded = decodePointerSegment(raw);
    assertSafeSegment(decoded, path);
    segments.push(decoded);
  }

  return {
    canonical: formatPointer(segments),
    segments,
  };
}

/**
 * Parses an RFC 6901 §4 non-negative array index token (`"0"` or `[1-9][0-9]*`).
 * Leading zeros such as `"01"`, negative numbers, and non-digits return `null`.
 */
export function parseArrayIndex(segment: string): number | null {
  if (!ARRAY_INDEX_PATTERN.test(segment)) {
    return null;
  }
  const value = Number(segment);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/** Returns canonical pointers for every ancestor from `"/"` down to `segments`. */
export function ancestorPointers(
  segments: readonly string[],
): CanonicalPointer[] {
  const result: CanonicalPointer[] = ["/"];
  let current = "";
  for (let i = 0; i < segments.length; i += 1) {
    current += "/" + encodePointerSegment(segments[i]!);
    result.push(current);
  }
  return result;
}

/** True when `prefix` is a segment-boundary prefix of `target`. */
export function isPrefixSegments(
  prefix: readonly string[],
  target: readonly string[],
): boolean {
  if (prefix.length > target.length) {
    return false;
  }
  for (let i = 0; i < prefix.length; i += 1) {
    if (prefix[i] !== target[i]) {
      return false;
    }
  }
  return true;
}

/** True when two pointer segment sequences are equal or one is an ancestor of the other. */
export function pathsOverlap(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return isPrefixSegments(a, b) || isPrefixSegments(b, a);
}

/** Normalizes slashes of a raw pointer path without re-encoding escape tokens. */
function normalizeRawPointer(rawPath: string): CanonicalPointer {
  const parts = rawPath.split("/").filter((part) => part.length > 0);
  return parts.length === 0 ? "/" : "/" + parts.join("/");
}

/**
 * Resolves a relative or absolute A2UI data path against a scoped `contextPath`.
 *
 * - Absolute paths (starting with `"/"`) ignore `contextPath`.
 * - `""` and `"."` resolve to the normalized `contextPath`.
 * - Relative paths join onto the normalized `contextPath` (default `"/"`).
 */
export function resolvePath(
  path: string,
  contextPath: string = "/",
): CanonicalPointer {
  if (path.startsWith("/")) {
    return normalizeRawPointer(path);
  }
  const base = normalizeRawPointer(contextPath || "/");
  if (path === "" || path === ".") {
    return base;
  }
  const joined = base === "/" ? `/${path}` : `${base}/${path}`;
  return normalizeRawPointer(joined);
}
