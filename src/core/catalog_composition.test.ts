import { describe, expect, test } from "nsh/test";
import {
  A2uiCatalogError,
  A2uiIntegrityError,
  A2uiRecursionError,
  Catalog,
  extractChildReferences,
  isSelfContainedSchema,
  isV10ProtocolVersion,
  validateCompositionConstraints,
  validateCompositionEdge,
  validateRootComposition,
  validateV10CommonType,
  type ChildReference,
} from "./catalog";
import { A2uiValidationError } from "./expression";

function catchValidationError(fn: () => unknown): A2uiValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof A2uiValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an A2uiValidationError, but nothing was thrown");
}

function compositionCatalog(): Catalog {
  return Catalog.fromJson({
    protocolVersion: "1.0",
    catalogId: "https://example.com/composition",
    components: {
      AnyBox: { type: "object" },
      SurfaceChild: { type: "object", allowedParents: ["Surface"] },
      EmptyParents: { type: "object", allowedParents: [] },
      Panel: { type: "object", allowedChildren: ["Text", "Panel"] },
      RestrictedBox: { type: "object", allowedChildren: ["Text"] },
      Column: { type: "object", allowedChildren: ["ColumnHeader"] },
      ColumnHeader: { type: "object", allowedParents: ["Column"] },
      Text: { type: "object" },
      CycleA: {
        type: "object",
        allowedParents: ["Surface", "CycleB"],
        allowedChildren: ["CycleB"],
      },
      CycleB: {
        type: "object",
        allowedParents: ["CycleA"],
        allowedChildren: ["CycleA"],
      },
    },
  });
}

function ref(childId: string, pathSuffix: string, fieldName: string): ChildReference {
  return { childId, pathSuffix, fieldName };
}

function surface(
  entries: readonly (readonly [string, Record<string, unknown>])[],
): Map<string, Record<string, unknown>> {
  return new Map(entries);
}

describe("extractChildReferences — standard child slots", () => {
  test("extracts a single `child` string", () => {
    expect(
      extractChildReferences({ component: "Card", child: "body" }),
    ).toEqual([ref("body", "/child", "child")]);
  });

  test("extracts every entry of a `children` list", () => {
    expect(
      extractChildReferences({ component: "Column", children: ["a", "b"] }),
    ).toEqual([
      ref("a", "/children/0", "children[0]"),
      ref("b", "/children/1", "children[1]"),
    ]);
  });

  test("extracts the template `componentId` from a children object", () => {
    expect(
      extractChildReferences({
        component: "List",
        children: { componentId: "Row", path: "/items" },
      }),
    ).toEqual([ref("Row", "/children/componentId", "children.componentId")]);
  });

  test("returns no references for a component without child slots", () => {
    expect(
      extractChildReferences({ component: "Text", text: "hello" }),
    ).toEqual([]);
  });

  test("extracts the direct `child` of each tabs entry", () => {
    expect(
      extractChildReferences({
        component: "Tabs",
        tabs: [{ child: "tab1" }, { title: "no child" }, { child: "tab2" }],
      }),
    ).toEqual([
      ref("tab1", "/tabs/0/child", "tabs[0].child"),
      ref("tab2", "/tabs/2/child", "tabs[2].child"),
    ]);
  });

  test("does not recurse into arbitrary nested objects", () => {
    expect(
      extractChildReferences({
        component: "Tabs",
        child: { child: "nested" },
        tabs: [{ wrapper: { child: "nested-too" } }],
      }),
    ).toEqual([]);
  });

  test("keeps duplicate child ids instead of de-duplicating them", () => {
    expect(
      extractChildReferences({ component: "Column", children: ["a", "a"] }),
    ).toEqual([
      ref("a", "/children/0", "children[0]"),
      ref("a", "/children/1", "children[1]"),
    ]);
  });
});

describe("extractChildReferences — schema-declared child slots", () => {
  test("finds custom Child, ChildList and ComponentId properties from the catalog", () => {
    const catalog = Catalog.fromJson({
      protocolVersion: "1.0",
      catalogId: "https://example.com/custom-slots",
      components: {
        CustomList: {
          type: "object",
          properties: {
            slots: {
              type: "array",
              items: { $ref: "common_types.json#/$defs/Child" },
            },
            selected: { $ref: "common_types.json#/$defs/ComponentId" },
            label: { type: "string" },
          },
        },
      },
    });

    expect(
      extractChildReferences(
        {
          component: "CustomList",
          slots: ["a", "b"],
          selected: "c",
          label: "not a child",
        },
        catalog,
      ),
    ).toEqual([
      ref("a", "/slots/0", "slots[0]"),
      ref("b", "/slots/1", "slots[1]"),
      ref("c", "/selected", "selected"),
    ]);
  });
});

describe("validateRootComposition", () => {
  test("accepts a root whose component declares no allowedParents", () => {
    expect(() =>
      validateRootComposition(
        "s1",
        { id: "root", component: "AnyBox" },
        compositionCatalog(),
        0,
      ),
    ).not.toThrow();
  });

  test("accepts a root that lists 'Surface' in allowedParents", () => {
    expect(() =>
      validateRootComposition(
        "s1",
        { id: "root", component: "SurfaceChild" },
        compositionCatalog(),
        0,
      ),
    ).not.toThrow();
  });

  test("refuses a root whose allowedParents excludes 'Surface'", () => {
    const error = catchValidationError(() =>
      validateRootComposition(
        "s1",
        { id: "root", component: "ColumnHeader" },
        compositionCatalog(),
        2,
      ),
    );

    expect(error.code).toBe("UNALLOWED_PARENT");
    expect(error.path).toBe("/components/2");
    expect(error.surfaceId).toBe("s1");
    expect(error.details?.[0]?.code).toBe("UNALLOWED_PARENT");
    expect(error.message).toBe(
      "Component 'root' (ColumnHeader) cannot be placed under parent 'Surface' (Surface). Allowed parents: ['Column'].",
    );
  });

  test("refuses a root with an explicit empty allowedParents list", () => {
    const error = catchValidationError(() =>
      validateRootComposition(
        "s1",
        { id: "root", component: "EmptyParents" },
        compositionCatalog(),
        0,
      ),
    );

    expect(error.code).toBe("UNALLOWED_PARENT");
    expect(error.message).toContain("Allowed parents: [].");
  });

  test("accepts a root when no catalog can resolve its definition", () => {
    expect(() =>
      validateRootComposition(
        "s1",
        { id: "root", component: "UnknownBox" },
        undefined,
        0,
      ),
    ).not.toThrow();
  });
});

describe("validateCompositionEdge", () => {
  test("accepts a parent/child pair allowed by both sides", () => {
    expect(() =>
      validateCompositionEdge(
        "s1",
        "col",
        "Column",
        compositionCatalog(),
        0,
        ref("head", "/children/0", "children[0]"),
        "ColumnHeader",
        compositionCatalog(),
        1,
      ),
    ).not.toThrow();
  });

  test("refuses a child missing from the parent's allowedChildren", () => {
    const error = catchValidationError(() =>
      validateCompositionEdge(
        "s1",
        "box",
        "RestrictedBox",
        compositionCatalog(),
        0,
        ref("any", "/children/0", "children[0]"),
        "AnyBox",
        compositionCatalog(),
        1,
      ),
    );

    expect(error.code).toBe("UNALLOWED_CHILD");
    expect(error.path).toBe("/components/0/children/0");
    expect(error.surfaceId).toBe("s1");
    expect(error.details?.[0]?.code).toBe("UNALLOWED_CHILD");
    expect(error.message).toBe(
      "Container 'box' (RestrictedBox) cannot contain child 'any' (AnyBox). Allowed children: ['Text'].",
    );
  });

  test("refuses a parent missing from the child's allowedParents", () => {
    const error = catchValidationError(() =>
      validateCompositionEdge(
        "s1",
        "box",
        "AnyBox",
        compositionCatalog(),
        0,
        ref("head", "/children/0", "children[0]"),
        "ColumnHeader",
        compositionCatalog(),
        1,
      ),
    );

    expect(error.code).toBe("UNALLOWED_PARENT");
    expect(error.path).toBe("/components/1");
    expect(error.surfaceId).toBe("s1");
    expect(error.details?.[0]?.code).toBe("UNALLOWED_PARENT");
    expect(error.message).toBe(
      "Component 'head' (ColumnHeader) cannot be placed under parent 'box' (AnyBox). Allowed parents: ['Column'].",
    );
  });

  test("accepts any pair when neither side declares a list", () => {
    expect(() =>
      validateCompositionEdge(
        "s1",
        "parent",
        "AnyBox",
        compositionCatalog(),
        0,
        ref("child", "/child", "child"),
        "AnyBox",
        compositionCatalog(),
        1,
      ),
    ).not.toThrow();
  });

  test("reports the parent's allowedChildren violation before the child's allowedParents", () => {
    const error = catchValidationError(() =>
      validateCompositionEdge(
        "s1",
        "box",
        "RestrictedBox",
        compositionCatalog(),
        0,
        ref("head", "/children/0", "children[0]"),
        "ColumnHeader",
        compositionCatalog(),
        1,
      ),
    );

    expect(error.code).toBe("UNALLOWED_CHILD");
  });
});
describe("validateCompositionConstraints", () => {
  test("accepts a surface whose root and every edge are allowed", () => {
    const catalog = compositionCatalog();
    const components = surface([
      ["root", { id: "root", component: "AnyBox", children: ["col"] }],
      ["col", { id: "col", component: "Column", children: ["head"] }],
      ["head", { id: "head", component: "ColumnHeader" }],
    ]);

    expect(() =>
      validateCompositionConstraints({
        surfaceId: "s1",
        components,
        resolveCatalog: () => catalog,
      }),
    ).not.toThrow();
  });

  test("names the exact bad edge deep in the tree with its surface index path", () => {
    const catalog = compositionCatalog();
    const components = surface([
      ["root", { id: "root", component: "AnyBox", children: ["panel"] }],
      ["panel", { id: "panel", component: "RestrictedBox", children: ["bad"] }],
      ["bad", { id: "bad", component: "ColumnHeader" }],
    ]);

    const error = catchValidationError(() =>
      validateCompositionConstraints({
        surfaceId: "s-deep",
        components,
        resolveCatalog: () => catalog,
      }),
    );

    expect(error.code).toBe("UNALLOWED_CHILD");
    expect(error.path).toBe("/components/1/children/0");
    expect(error.surfaceId).toBe("s-deep");
    expect(error.details?.[0]?.surfaceId).toBe("s-deep");
    expect(error.message).toBe(
      "Container 'panel' (RestrictedBox) cannot contain child 'bad' (ColumnHeader). Allowed children: ['Text'].",
    );
  });

  test("refuses a root component that may only sit under another parent", () => {
    const catalog = compositionCatalog();
    const components = surface([
      ["root", { id: "root", component: "ColumnHeader" }],
    ]);

    const error = catchValidationError(() =>
      validateCompositionConstraints({
        surfaceId: "s-root",
        components,
        resolveCatalog: () => catalog,
      }),
    );

    expect(error.code).toBe("UNALLOWED_PARENT");
    expect(error.path).toBe("/components/0");
    expect(error.surfaceId).toBe("s-root");
    expect(error.message).toContain("cannot be placed under parent 'Surface'");
  });

  test("does not itself refuse a cycle; A2uiRecursionError belongs to the validator", () => {
    const catalog = compositionCatalog();
    const components = surface([
      ["root", { id: "root", component: "CycleA", children: ["b"] }],
      ["b", { id: "b", component: "CycleB", children: ["root"] }],
    ]);

    // Both edges satisfy allowedParents/allowedChildren, so this function only
    // checks composition. Circular references are refused by PayloadValidator
    // in validator.ts (RECURSION_LIMIT_EXCEEDED).
    expect(() =>
      validateCompositionConstraints({
        surfaceId: "s-cycle",
        components,
        resolveCatalog: () => catalog,
      }),
    ).not.toThrow();
  });
});

interface CommonTypeCase {
  readonly name: string;
  readonly valid: unknown;
  readonly invalid: unknown;
}

const COMMON_TYPE_CASES: readonly CommonTypeCase[] = [
  { name: "ComponentId", valid: "root", invalid: 42 },
  { name: "CallId", valid: "call-1", invalid: 42 },
  {
    name: "AccessibilityAttributes",
    valid: { label: "Save", live: "polite", hidden: true },
    invalid: { live: "shout" },
  },
  {
    name: "Extensions",
    valid: { a2ui_theme: { mode: "dark" } },
    invalid: { "not-a-key": 1 },
  },
  { name: "ComponentCommon", valid: { id: "root" }, invalid: { id: 42 } },
  { name: "Child", valid: "child-1", invalid: 42 },
  { name: "ChildList", valid: ["a", "b"], invalid: ["a", 42] },
  {
    name: "DataBinding",
    valid: { "@path": "/customer/name" },
    invalid: { "@path": 42 },
  },
  {
    name: "DynamicValue",
    valid: { sku: "A-1", qty: 2 },
    invalid: { "@bogus": true },
  },
  { name: "DynamicString", valid: "Ada", invalid: 42 },
  { name: "DynamicNumber", valid: 3.5, invalid: "three" },
  { name: "DynamicBoolean", valid: false, invalid: 1 },
  { name: "DynamicStringList", valid: ["a", "b"], invalid: ["a", 2] },
  { name: "FunctionCommon", valid: { "@call": "formatString" }, invalid: { "@call": 42 } },
  {
    name: "IndexSystemFunction",
    valid: { "@call": "@index", args: { offset: 1 } },
    invalid: { "@call": "formatString" },
  },
  {
    name: "FunctionCall",
    valid: { "@call": "formatString", args: { value: "x" } },
    invalid: { "@call": "@index", args: { offset: "one" } },
  },
  {
    name: "CheckRule",
    valid: { condition: { "@path": "/email" } },
    invalid: { condition: 42 },
  },
  {
    name: "Checkable",
    valid: { "@checks": [{ condition: { "@path": "/email" } }] },
    invalid: { "@checks": [{}] },
  },
  { name: "Action", valid: { event: { name: "save" } }, invalid: { event: {} } },
  {
    name: "Surface",
    valid: { component: "Surface", child: "root" },
    invalid: { component: "Text", child: "root" },
  },
  {
    name: "FunctionResponse",
    valid: { functionCallId: "call-1", value: null },
    invalid: { functionCallId: "call-1" },
  },
];

describe("validateV10CommonType — each named common type", () => {
  for (const testCase of COMMON_TYPE_CASES) {
    test(`${testCase.name} accepts a valid value`, () => {
      expect(
        validateV10CommonType(testCase.name, testCase.valid),
      ).toEqual(testCase.valid);
    });

    test(`${testCase.name} refuses an invalid value`, () => {
      const error = catchValidationError(() =>
        validateV10CommonType(testCase.name, testCase.invalid),
      );

      expect(error.code).toBe("VALIDATION_FAILED");
    });
  }

  test("refuses an unknown common type name", () => {
    const error = catchValidationError(() =>
      validateV10CommonType("NotACommonType", {}),
    );

    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.message).toBe(
      "Unknown common_types definition 'NotACommonType'",
    );
    expect(error.path).toBe("/");
  });
});
describe("isV10ProtocolVersion", () => {
  test("accepts '1.0' and 'v1.0'", () => {
    expect(isV10ProtocolVersion("1.0")).toBe(true);
    expect(isV10ProtocolVersion("v1.0")).toBe(true);
  });

  test("refuses near-miss version strings", () => {
    for (const version of ["1.0.0", "v1.0.0", "1", "V1.0", "", " 1.0", "1.0 "]) {
      expect(isV10ProtocolVersion(version)).toBe(false);
    }
  });

  test("refuses undefined", () => {
    expect(isV10ProtocolVersion(undefined as unknown as string)).toBe(false);
  });
});

describe("isSelfContainedSchema", () => {
  test("accepts a schema without any $ref", () => {
    expect(
      isSelfContainedSchema({
        type: "object",
        properties: { name: { type: "string" } },
      }),
    ).toBe(true);
  });

  test("accepts a schema whose local $ref resolves inside itself", () => {
    expect(
      isSelfContainedSchema({
        $defs: { Name: { type: "string" } },
        type: "object",
        properties: { name: { $ref: "#/$defs/Name" } },
      }),
    ).toBe(true);
  });

  test("refuses a dangling local $ref", () => {
    expect(
      isSelfContainedSchema({
        type: "object",
        properties: { name: { $ref: "#/$defs/Missing" } },
      }),
    ).toBe(false);
  });

  test("refuses the common_types.json $ref", () => {
    expect(
      isSelfContainedSchema({
        type: "object",
        properties: {
          name: { $ref: "common_types.json#/$defs/DynamicString" },
        },
      }),
    ).toBe(false);
  });

  test("refuses an external $ref", () => {
    expect(
      isSelfContainedSchema({
        type: "object",
        properties: {
          name: { $ref: "https://example.com/other.json#/$defs/Name" },
        },
      }),
    ).toBe(false);
  });
});

describe("catalog error classes", () => {
  test("A2uiCatalogError carries code, message and surfaceId", () => {
    const error = new A2uiCatalogError(
      "CATALOG_INVALID",
      "bad catalog",
      "s1",
    );

    expect(error instanceof Error).toBe(true);
    expect(error.name).toBe("A2uiCatalogError");
    expect(error.category).toBe("CatalogError");
    expect(error.code).toBe("CATALOG_INVALID");
    expect(error.message).toBe("bad catalog");
    expect(error.surfaceId).toBe("s1");
  });

  test("A2uiIntegrityError carries code, message, path and surfaceId", () => {
    const error = new A2uiIntegrityError(
      "INTEGRITY_ERROR",
      "orphan component",
      "s2",
      "/components/1",
    );

    expect(error instanceof Error).toBe(true);
    expect(error instanceof A2uiValidationError).toBe(true);
    expect(error.name).toBe("A2uiIntegrityError");
    expect(error.category).toBe("IntegrityError");
    expect(error.code).toBe("INTEGRITY_ERROR");
    expect(error.message).toBe("orphan component");
    expect(error.path).toBe("/components/1");
    expect(error.surfaceId).toBe("s2");
  });

  test("A2uiRecursionError carries code, message, path and surfaceId", () => {
    const error = new A2uiRecursionError(
      "RECURSION_LIMIT_EXCEEDED",
      "component tree too deep",
      "s3",
      "/components/2",
    );

    expect(error instanceof Error).toBe(true);
    expect(error instanceof A2uiValidationError).toBe(true);
    expect(error.name).toBe("A2uiRecursionError");
    expect(error.category).toBe("RecursionError");
    expect(error.code).toBe("RECURSION_LIMIT_EXCEEDED");
    expect(error.message).toBe("component tree too deep");
    expect(error.path).toBe("/components/2");
    expect(error.surfaceId).toBe("s3");
  });
});
