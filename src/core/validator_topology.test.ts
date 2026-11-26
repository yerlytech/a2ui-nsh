import { describe, expect, test } from "nsh/test";
import { A2uiRecursionError, Catalog } from "./catalog";
import type { JsonObject } from "./json_schema";
import {
  SurfaceTopologyIndex,
  componentSchemaDeclaresCustomBareProp,
  validateJsonNestingDepth,
} from "./validator";

const catalog = Catalog.basicV1();

const BARE_NAMES = [
  "catalogId",
  "metadata",
  "accessibility",
  "checks",
] as const;

function applyColumn(
  index: SurfaceTopologyIndex,
  id: string,
  children: readonly string[],
  existingIds: ReadonlyMap<string, unknown> = new Map(),
): void {
  index.applyComponent(
    id,
    { component: "Column", children },
    catalog,
    existingIds,
  );
}

function depthError(
  value: unknown,
  maxDepth: number,
  surfaceId?: string,
  path?: string,
): A2uiRecursionError {
  try {
    validateJsonNestingDepth(value, maxDepth, surfaceId, path);
  } catch (error) {
    expect(error instanceof A2uiRecursionError).toBe(true);
    return error as A2uiRecursionError;
  }
  throw new Error("expected validateJsonNestingDepth to refuse the value");
}

describe("SurfaceTopologyIndex", () => {
  test("applyComponent records outgoing children and incoming parents", () => {
    const index = new SurfaceTopologyIndex();
    const existing = new Map<string, unknown>([
      ["a", {}],
      ["b", {}],
    ]);

    applyColumn(index, "root", ["a", "b"], existing);

    expect(index.childrenOf.get("root")?.map((ref) => ref.childId)).toEqual([
      "a",
      "b",
    ]);
    expect(
      index.parentsOf.get("a")?.get("root")?.map((ref) => ref.childId),
    ).toEqual(["a"]);
    expect(
      index.parentsOf.get("b")?.get("root")?.map((ref) => ref.childId),
    ).toEqual(["b"]);
  });

  test("applyComponent keeps an unseen child dangling until the child is applied", () => {
    const index = new SurfaceTopologyIndex();

    applyColumn(index, "root", ["a"], new Map());
    expect(index.danglingRefs.get("a")?.has("root")).toBe(true);

    index.applyComponent(
      "a",
      { component: "Text", text: "a" },
      catalog,
      new Map([["a", {}]]),
    );

    expect(index.danglingRefs.has("a")).toBe(false);
  });

  test("replacing a component drops its previous outgoing edges", () => {
    const index = new SurfaceTopologyIndex();
    const existing = new Map<string, unknown>([
      ["a", {}],
      ["b", {}],
      ["c", {}],
    ]);

    applyColumn(index, "root", ["a", "b"], existing);
    applyColumn(index, "root", ["c"], existing);

    expect(index.childrenOf.get("root")?.map((ref) => ref.childId)).toEqual([
      "c",
    ]);
    expect(index.parentsOf.has("a")).toBe(false);
    expect(index.parentsOf.has("b")).toBe(false);
    expect(
      index.parentsOf.get("c")?.get("root")?.map((ref) => ref.childId),
    ).toEqual(["c"]);
  });

  test("removeComponent removes its outgoing edges and its parent entries", () => {
    const index = new SurfaceTopologyIndex();
    const existing = new Map<string, unknown>([
      ["a", {}],
      ["b", {}],
    ]);

    applyColumn(index, "root", ["a", "b"], existing);
    index.removeComponent("root");

    expect(index.childrenOf.has("root")).toBe(false);
    expect(index.parentsOf.has("a")).toBe(false);
    expect(index.parentsOf.has("b")).toBe(false);
    expect(index.danglingRefs.has("a")).toBe(false);
    expect(index.danglingRefs.has("b")).toBe(false);
  });

  test("clear empties every index map", () => {
    const index = new SurfaceTopologyIndex();

    applyColumn(index, "root", ["missing"], new Map());
    index.clear();

    expect(index.childrenOf.size).toBe(0);
    expect(index.parentsOf.size).toBe(0);
    expect(index.danglingRefs.size).toBe(0);
    expect(index.surfaceOrder.size).toBe(0);
  });

  test("surfaceOrder keeps first-insertion order across a replace", () => {
    const index = new SurfaceTopologyIndex();
    const existing = new Map<string, unknown>([["b", {}]]);

    applyColumn(index, "b", [], existing);
    applyColumn(index, "a", [], existing);
    applyColumn(index, "b", [], existing);

    expect(Array.from(index.surfaceOrder.entries())).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });
});

describe("validateJsonNestingDepth", () => {
  test("never refuses a scalar", () => {
    expect(() => validateJsonNestingDepth("text", 0)).not.toThrow();
    expect(() => validateJsonNestingDepth(42, 0)).not.toThrow();
    expect(() => validateJsonNestingDepth(null, 0)).not.toThrow();
    expect(() =>
      validateJsonNestingDepth({ a: { b: "deep scalar" } }, 1),
    ).not.toThrow();
  });

  test("accepts an object at exactly maxDepth", () => {
    expect(() => validateJsonNestingDepth({ a: { b: 1 } }, 1)).not.toThrow();
  });

  test("refuses an object one level deeper than maxDepth and reports its path and surface", () => {
    const error = depthError({ a: { b: {} } }, 1, "surface-1", "/payload");

    expect(error.code).toBe("RECURSION_LIMIT_EXCEEDED");
    expect(error.surfaceId).toBe("surface-1");
    expect(error.path).toBe("/payload");
  });

  test("counts array and object nesting the same", () => {
    expect(() => validateJsonNestingDepth({ a: { b: 1 } }, 1)).not.toThrow();
    expect(() => validateJsonNestingDepth([[1]], 1)).not.toThrow();

    expect(() => validateJsonNestingDepth({ a: { b: {} } }, 1)).toThrow(
      A2uiRecursionError,
    );
    expect(() => validateJsonNestingDepth([[[]]], 1)).toThrow(
      A2uiRecursionError,
    );
  });
});

describe("componentSchemaDeclaresCustomBareProp", () => {
  test("treats an undefined schema as declaring no custom bare property", () => {
    for (const bareName of BARE_NAMES) {
      expect(componentSchemaDeclaresCustomBareProp(undefined, bareName)).toBe(
        false,
      );
    }
  });

  test("detects each bare property declared as a custom property", () => {
    for (const bareName of BARE_NAMES) {
      const schema: JsonObject = {
        properties: { [bareName]: { type: "string" } },
      };

      expect(componentSchemaDeclaresCustomBareProp(schema, bareName)).toBe(
        true,
      );
    }
  });

  test("treats the v1.0 inline ComponentCommon shape as standard, not custom", () => {
    const schema: JsonObject = {
      properties: {
        id: { type: "string" },
        catalogId: { type: "string" },
        metadata: {
          type: "object",
          properties: { extensions: { type: "object" } },
        },
      },
    };

    expect(componentSchemaDeclaresCustomBareProp(schema, "catalogId")).toBe(
      false,
    );
    expect(componentSchemaDeclaresCustomBareProp(schema, "metadata")).toBe(
      false,
    );
  });

  test("finds a declaration nested under allOf and anyOf beside a $ref mixin", () => {
    const schema: JsonObject = {
      allOf: [
        { $ref: "#/$defs/ComponentCommon" },
        {
          anyOf: [
            { properties: { accessibility: { type: "object" } } },
          ],
        },
      ],
    };

    expect(componentSchemaDeclaresCustomBareProp(schema, "accessibility")).toBe(
      true,
    );
  });
});
