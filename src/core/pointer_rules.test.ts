import { describe, expect, test } from "nsh/test";
import {
  A2uiDataError,
  DEFAULT_POINTER_LIMITS,
  ancestorPointers,
  assertSafeSegment,
  decodePointerSegment,
  encodePointerSegment,
  formatPointer,
  isPrefixSegments,
  parseArrayIndex,
  parsePointer,
  pathsOverlap,
  resolvePath,
} from "./pointer";

// One rule per test for src/core/pointer.ts. The broad scenarios live in
// pointer.test.ts; this file pins each rule on its own.

function dataError(run: () => unknown): A2uiDataError {
  let caught: unknown;
  try {
    run();
  } catch (err) {
    caught = err;
  }
  expect(caught instanceof A2uiDataError).toBe(true);
  return caught as A2uiDataError;
}

describe("pointer rules", () => {
  test("decodePointerSegment decodes escapes once and leaves unknown escapes alone", () => {
    expect(decodePointerSegment("plain")).toBe("plain");
    expect(decodePointerSegment("~1")).toBe("/");
    expect(decodePointerSegment("~0")).toBe("~");
    expect(decodePointerSegment("~01")).toBe("~1");
    expect(decodePointerSegment("tail~")).toBe("tail~");
    expect(decodePointerSegment("~2")).toBe("~2");
  });

  test("encodePointerSegment and formatPointer escape tilde before slash", () => {
    expect(encodePointerSegment("~")).toBe("~0");
    expect(encodePointerSegment("/")).toBe("~1");
    expect(encodePointerSegment("a/b~c")).toBe("a~1b~0c");
    expect(encodePointerSegment("plain")).toBe("plain");
    expect(formatPointer([])).toBe("/");
    expect(decodePointerSegment(encodePointerSegment("a/b~c~1"))).toBe(
      "a/b~c~1",
    );
  });

  test("parsePointer collapses slashes and decodes segments for canonical form", () => {
    expect(parsePointer("")).toEqual({ canonical: "/", segments: [] });
    expect(parsePointer("/")).toEqual({ canonical: "/", segments: [] });
    expect(parsePointer("///")).toEqual({ canonical: "/", segments: [] });
    expect(parsePointer("//a///b//")).toEqual({
      canonical: "/a/b",
      segments: ["a", "b"],
    });
    expect(parsePointer("/a~1b/c~0d")).toEqual({
      canonical: "/a~1b/c~0d",
      segments: ["a/b", "c~d"],
    });
  });

  test("parsePointer enforces depth limits and ignores empty segments", () => {
    const atLimit = "/" + Array.from({ length: 64 }, (_, i) => `s${i}`).join("/");
    expect(parsePointer(atLimit).segments).toHaveLength(64);

    const overLimit = atLimit + "/s64";
    const error = dataError(() => parsePointer(overLimit));
    expect(error.code).toBe("DEPTH_LIMIT_EXCEEDED");
    expect(error.category).toBe("DataError");
    expect(error.name).toBe("A2uiDataError");
    expect(error.path).toBe(overLimit);

    const customLimits = { maxDepth: 2, maxListIndex: 10 };
    expect(parsePointer("/a/b", customLimits).segments).toEqual(["a", "b"]);
    expect(dataError(() => parsePointer("/a/b/c", customLimits)).code).toBe(
      "DEPTH_LIMIT_EXCEEDED",
    );
    expect(parsePointer("//a///b//", customLimits).segments).toEqual(["a", "b"]);

    expect(Object.isFrozen(DEFAULT_POINTER_LIMITS)).toBe(true);
    expect(DEFAULT_POINTER_LIMITS.maxDepth).toBe(64);
    expect(DEFAULT_POINTER_LIMITS.maxListIndex).toBe(10000);
  });

  test("forbidden prototype segments are rejected everywhere, near-misses pass", () => {
    for (const segment of ["__proto__", "constructor", "prototype"]) {
      const direct = dataError(() => assertSafeSegment(segment, `/${segment}`));
      expect(direct.code).toBe("FORBIDDEN_SEGMENT");

      const parsed = dataError(() => parsePointer(`/${segment}`));
      expect(parsed.code).toBe("FORBIDDEN_SEGMENT");

      const deepPath = `/a/b/${segment}/c`;
      const deep = dataError(() => parsePointer(deepPath));
      expect(deep.code).toBe("FORBIDDEN_SEGMENT");
      expect(deep.path).toBe(deepPath);
    }

    for (const segment of ["proto", "Constructor", "__proto"]) {
      expect(() => assertSafeSegment(segment, `/${segment}`)).not.toThrow();
      expect(parsePointer(`/${segment}`).segments).toEqual([segment]);
    }
  });

  test("parseArrayIndex accepts the RFC 6901 grammar and pins huge indexes", () => {
    expect(parseArrayIndex("0")).toBe(0);
    expect(parseArrayIndex("10")).toBe(10);
    for (const invalid of ["01", "-1", "1.5", "1e3", " 1", ""]) {
      expect(parseArrayIndex(invalid)).toBeNull();
    }
    expect(parseArrayIndex("1" + "0".repeat(399))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  test("ancestors and prefix overlap respect segment boundaries", () => {
    expect(ancestorPointers([])).toEqual(["/"]);
    expect(ancestorPointers(["a/b", "c~d"])).toEqual([
      "/",
      "/a~1b",
      "/a~1b/c~0d",
    ]);

    expect(isPrefixSegments([], [])).toBe(true);
    expect(isPrefixSegments([], ["a"])).toBe(true);
    expect(isPrefixSegments(["a", "b"], ["a"])).toBe(false);
    expect(isPrefixSegments(["a"], ["ab"])).toBe(false);
    expect(isPrefixSegments(["ab"], ["a"])).toBe(false);

    expect(pathsOverlap(["user"], ["user", "name"])).toBe(true);
    expect(pathsOverlap(["user", "name"], ["user"])).toBe(true);
    expect(pathsOverlap(["a"], ["ab"])).toBe(false);
    expect(pathsOverlap(["ab"], ["a"])).toBe(false);
    expect(pathsOverlap(["user", "a"], ["user", "b"])).toBe(false);
    expect(pathsOverlap(["user", "b"], ["user", "a"])).toBe(false);
  });

  test("resolvePath scopes relative paths and does not resolve dot segments", () => {
    expect(resolvePath("/abs/0", "/user")).toBe("/abs/0");
    expect(resolvePath("/x~1y//z", "/ctx")).toBe("/x~1y/z");

    expect(resolvePath("", "/user/")).toBe("/user");
    expect(resolvePath(".", "/user/")).toBe("/user");
    expect(resolvePath(".", "///")).toBe("/");

    expect(resolvePath("a/b")).toBe("/a/b");
    expect(resolvePath("a", "/user/")).toBe("/user/a");
    expect(resolvePath("a", "")).toBe("/a");

    // resolvePath normalises slashes only; it does not resolve dot segments.
    expect(resolvePath("./a")).toBe("/./a");
    expect(resolvePath("../a")).toBe("/../a");
    expect(resolvePath("./a", "/user")).toBe("/user/./a");
    expect(resolvePath("../a", "/user")).toBe("/user/../a");
  });
});
