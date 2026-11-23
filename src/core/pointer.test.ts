import { describe, expect, test } from "nsh/test";
import {
  A2uiDataError,
  DEFAULT_POINTER_LIMITS,
  ancestorPointers,
  decodePointerSegment,
  encodePointerSegment,
  formatPointer,
  isPrefixSegments,
  parseArrayIndex,
  parsePointer,
  pathsOverlap,
  resolvePath,
} from "./pointer";

describe("pointer", () => {
  test("decodes and encodes RFC 6901 escape sequences in exact order", () => {
    expect(decodePointerSegment("detailed~1info")).toBe("detailed/info");
    expect(decodePointerSegment("profile~0name")).toBe("profile~name");
    expect(decodePointerSegment("a~01b")).toBe("a~1b");
    expect(decodePointerSegment("m~00")).toBe("m~0");
    expect(decodePointerSegment("m~10")).toBe("m/0");
    expect(decodePointerSegment("m~11")).toBe("m/1");

    expect(encodePointerSegment("a~1b")).toBe("a~01b");
    expect(encodePointerSegment("a/b~c")).toBe("a~1b~0c");
    expect(formatPointer(["a/b", "c~d"])).toBe("/a~1b/c~0d");
    expect(formatPointer([])).toBe("/");
  });

  test("normalizes root, trailing slashes, and repeated slashes", () => {
    expect(parsePointer("")).toEqual({ canonical: "/", segments: [] });
    expect(parsePointer("/")).toEqual({ canonical: "/", segments: [] });
    expect(parsePointer("///")).toEqual({ canonical: "/", segments: [] });
    expect(parsePointer("/foo/")).toEqual({ canonical: "/foo", segments: ["foo"] });
    expect(parsePointer("//a///b//")).toEqual({
      canonical: "/a/b",
      segments: ["a", "b"],
    });
  });

  test("rejects prototype-polluting segments and enforces depth limits", () => {
    for (const bad of ["/__proto__/x", "/constructor/y", "/a/prototype/z"]) {
      expect(() => parsePointer(bad)).toThrow(A2uiDataError);
      expect(() => parsePointer(bad)).toThrow("Forbidden path segment");
    }

    const customLimits = { ...DEFAULT_POINTER_LIMITS, maxDepth: 3 };
    expect(parsePointer("/a/b/c", customLimits).segments).toEqual(["a", "b", "c"]);
    expect(() => parsePointer("/a/b/c/d", customLimits)).toThrow("Pointer depth");
  });

  test("validates RFC 6901 section 4 array index grammar", () => {
    expect(parseArrayIndex("0")).toBe(0);
    expect(parseArrayIndex("1")).toBe(1);
    expect(parseArrayIndex("10000")).toBe(10000);
    expect(parseArrayIndex("01")).toBeNull();
    expect(parseArrayIndex("-1")).toBeNull();
    expect(parseArrayIndex("+1")).toBeNull();
    expect(parseArrayIndex("1.5")).toBeNull();
    expect(parseArrayIndex("abc")).toBeNull();
    expect(parseArrayIndex("")).toBeNull();
  });

  test("computes ancestors, prefixes, overlaps, and scoped relative paths", () => {
    expect(ancestorPointers([])).toEqual(["/"]);
    expect(ancestorPointers(["a", "b/c"])).toEqual(["/", "/a", "/a/b~1c"]);

    expect(isPrefixSegments(["foo"], ["foo", "bar"])).toBe(true);
    expect(isPrefixSegments(["foo"], ["foobar"])).toBe(false);
    expect(pathsOverlap(["foo"], ["foobar"])).toBe(false);
    expect(pathsOverlap(["user"], ["user", "name"])).toBe(true);

    expect(resolvePath("name", "/user")).toBe("/user/name");
    expect(resolvePath("/abs/0", "/user")).toBe("/abs/0");
    expect(resolvePath("", "/user/")).toBe("/user");
    expect(resolvePath(".", "/")).toBe("/");
    expect(resolvePath("foo")).toBe("/foo");
  });
});
