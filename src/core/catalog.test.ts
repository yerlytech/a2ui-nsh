import { describe, expect, test } from "nsh/test";
import {
  A2uiCatalogError,
  BASIC_CATALOG_V1_ID,
  Catalog,
  CatalogRegistry,
  buildV10AgentToRendererSchema,
  buildV10CommonTypesSchema,
  isSelfContainedSchema,
  validateCompositionConstraints,
  validateV10CommonType,
} from "./catalog";
import { A2uiValidationError } from "./expression";

describe("Catalog — Basic Catalog v1 & schema builders", () => {
  test("basicV1 exposes all 18 components and 14 functions", () => {
    const basic = Catalog.basicV1();
    expect(basic.catalogId).toBe(BASIC_CATALOG_V1_ID);
    expect(basic.protocolVersion).toBe("1.0");
    expect(basic.components.size).toBe(18);
    expect(basic.functions.size).toBe(14);
    expect(isSelfContainedSchema(basic.validationSchema)).toBe(true);
  });

  test("basicV1 round-trips via toJson and fromJson", () => {
    const basic = Catalog.basicV1();
    const doc = basic.toJson();
    const reloaded = Catalog.fromJson(doc);
    expect(reloaded.toJson()).toEqual(doc);
    expect(reloaded.validationSchema).toEqual(basic.validationSchema);
  });

  test("commonTypes and agentToRenderer schemas carry v1.0 IDs", () => {
    const ct = buildV10CommonTypesSchema();
    const a2r = buildV10AgentToRendererSchema();
    expect(ct["$id"]).toBe(
      "https://a2ui.org/specification/v1_0/common_types.json",
    );
    expect(a2r["$id"]).toBe(
      "https://a2ui.org/specification/v1_0/agent_to_renderer.json",
    );
  });
});

describe("Catalog — fromJson validation rules", () => {
  test("rejects missing catalogId", () => {
    expect(() => Catalog.fromJson({ components: { Text: { type: "object" } } })).toThrow(
      A2uiCatalogError,
    );
  });

  test("supports catalogId override", () => {
    const cat = Catalog.fromJson(
      {
        protocolVersion: "1.0",
        catalogId: "https://example.com/original",
        components: { Text: { type: "object" } },
      },
      { catalogId: "https://example.com/override" },
    );
    expect(cat.catalogId).toBe("https://example.com/override");
    expect(cat.toJson()["catalogId"]).toBe("https://example.com/override");
  });

  test("rejects requiresUserActivation with agentOnly or rendererOrAgent", () => {
    for (const caller of ["agentOnly", "rendererOrAgent"]) {
      expect(() =>
        Catalog.fromJson({
          protocolVersion: "1.0",
          catalogId: "https://example.com/cat",
          functions: {
            open: {
              returnType: "void",
              allowedCallers: caller,
              requiresUserActivation: true,
            },
          },
        }),
      ).toThrow(A2uiCatalogError);
    }
  });

  test("rejects unsupported external $ref but allows common_types.json", () => {
    expect(() =>
      Catalog.fromJson({
        protocolVersion: "1.0",
        catalogId: "https://example.com/cat",
        components: {
          Fancy: {
            type: "object",
            allOf: [{ $ref: "other_catalog.json#/components/Text" }],
          },
        },
      }),
    ).toThrow(A2uiCatalogError);

    const ok = Catalog.fromJson({
      protocolVersion: "1.0",
      catalogId: "https://example.com/cat",
      components: {
        Label: {
          type: "object",
          properties: {
            component: { const: "Label" },
            text: { $ref: "common_types.json#/$defs/DynamicString" },
          },
          required: ["component", "text"],
        },
      },
    });
    expect(ok.components.has("Label")).toBe(true);
    expect(isSelfContainedSchema(ok.validationSchema)).toBe(true);
  });

  test("rejects invalid UAX #31 component, property, function, and arg identifiers", () => {
    expect(() =>
      Catalog.fromJson({
        protocolVersion: "1.0",
        catalogId: "custom",
        components: { "Bad-Comp": { type: "object" } },
      }),
    ).toThrow(A2uiCatalogError);

    expect(() =>
      Catalog.fromJson({
        protocolVersion: "1.0",
        catalogId: "custom",
        functions: { "@index": { returnType: "number" } },
      }),
    ).toThrow(A2uiCatalogError);
  });

  test("rejects component metadata.extensions with non-UAX31 key as ValidationError", () => {
    expect(() =>
      Catalog.fromJson({
        protocolVersion: "1.0",
        catalogId: "custom",
        components: {
          Card: {
            type: "object",
            metadata: { extensions: { "bad.key": 1 } },
          },
        },
      }),
    ).toThrow(A2uiValidationError);
  });
});

describe("Catalog — derive & CatalogRegistry multi-catalog resolution", () => {
  test("derive selects, adds, replaces entries and drops source metadata", () => {
    const basic = Catalog.basicV1();
    const derived = basic.derive({
      catalogId: "https://example.com/erp",
      components: [
        "Text",
        {
          DataGrid: {
            type: "object",
            properties: {
              component: { const: "DataGrid" },
              rows: { type: "array" },
            },
            required: ["component", "rows"],
          },
        },
      ],
      functions: ["formatString"],
      instructions: "Use DataGrid for tabular ERP views.",
    });

    expect(derived.catalogId).toBe("https://example.com/erp");
    expect(Array.from(derived.components.keys())).toEqual(["Text", "DataGrid"]);
    expect(Array.from(derived.functions.keys())).toEqual(["formatString"]);
    const doc = derived.toJson();
    expect(doc["title"]).toBeUndefined();
    expect(doc["$id"]).toBeUndefined();
    expect(doc["instructions"]).toBe("Use DataGrid for tabular ERP views.");
  });

  test("CatalogRegistry enforces strict explicit -> surface default -> error resolution", () => {
    const registry = CatalogRegistry.withBasicV1();
    const xlarge = registry.registerInline({
      protocolVersion: "1.0",
      catalogId: "https://xlarge.example/catalog/v1",
      components: {
        ErpGrid: {
          type: "object",
          properties: { component: { const: "ErpGrid" } },
          required: ["component"],
        },
      },
    });

    const surface = {
      surfaceId: "customers",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
      supportedCatalogIds: [BASIC_CATALOG_V1_ID, xlarge.catalogId],
      protocolVersion: "1.0",
    };

    expect(
      registry.resolveComponentCatalog(surface, {
        id: "t1",
        component: "Text",
      }).catalogId,
    ).toBe(BASIC_CATALOG_V1_ID);

    expect(
      registry.resolveComponentCatalog(surface, {
        id: "g1",
        component: "ErpGrid",
        "@catalogId": xlarge.catalogId,
      }).catalogId,
    ).toBe(xlarge.catalogId);

    expect(() =>
      registry.resolveComponentCatalog(
        { surfaceId: "s_no_default", protocolVersion: "1.0" },
        { id: "t1", component: "Text" },
      ),
    ).toThrow(A2uiCatalogError);
  });
});

describe("Common types & composition constraints", () => {
  test("validateV10CommonType accepts valid and rejects invalid FunctionResponse", () => {
    expect(
      validateV10CommonType("FunctionResponse", {
        functionCallId: "c1",
        value: null,
      }),
    ).toEqual({ functionCallId: "c1", value: null });

    expect(() =>
      validateV10CommonType("FunctionResponse", { functionCallId: "c1" }),
    ).toThrow(A2uiValidationError);
  });

  test("validateCompositionConstraints enforces allowedParents and allowedChildren", () => {
    const cat = Catalog.fromJson({
      protocolVersion: "1.0",
      catalogId: "custom",
      components: {
        RestrictedBox: {
          type: "object",
          allowedChildren: ["Text"],
          properties: {
            component: { const: "RestrictedBox" },
            children: { $ref: "common_types.json#/$defs/ChildList" },
          },
        },
        ColumnHeader: {
          type: "object",
          allowedParents: ["Column"],
          properties: { component: { const: "ColumnHeader" } },
        },
        Text: {
          type: "object",
          properties: { component: { const: "Text" } },
        },
      },
    });

    // Disallowed root under Surface
    expect(() =>
      validateCompositionConstraints({
        surfaceId: "s1",
        components: new Map([
          ["root", { id: "root", component: "ColumnHeader" }],
        ]),
        resolveCatalog: () => cat,
      }),
    ).toThrow(/UNALLOWED_PARENT|cannot be placed under parent 'Surface'/);

    // Disallowed child in container
    expect(() =>
      validateCompositionConstraints({
        surfaceId: "s1",
        components: new Map([
          [
            "root",
            {
              id: "root",
              component: "RestrictedBox",
              children: ["h1"],
            },
          ],
          ["h1", { id: "h1", component: "ColumnHeader" }],
        ]),
        resolveCatalog: () => cat,
      }),
    ).toThrow(/cannot contain child 'h1'/);
  });
});
