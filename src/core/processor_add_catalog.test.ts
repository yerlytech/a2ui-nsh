import { describe, expect, test } from "nsh/test";
import { A2uiCatalogError, Catalog, CatalogRegistry } from "./catalog";
import { MessageProcessor } from "./processor";

// MessageProcessor.addCatalog (google/A2UI #3304, conformance/core/add_catalog.yaml).

const BASE_ID = "test/base";
const LATE_ID = "test/late";

function baseCatalog(): Catalog {
  return Catalog.fromJson({
    catalogId: BASE_ID,
    protocolVersion: "1.0",
    components: {
      Label: {
        type: "object",
        properties: {
          component: { const: "Label" },
          text: { type: "string" },
        },
        required: ["component", "text"],
      },
    },
  });
}

function lateCatalog(): Catalog {
  return Catalog.fromJson({
    catalogId: LATE_ID,
    protocolVersion: "1.0",
    components: {
      Gauge: {
        type: "object",
        properties: {
          component: { const: "Gauge" },
          value: { type: "number" },
        },
        required: ["component", "value"],
      },
    },
  });
}

function catchError(run: () => void): unknown {
  try {
    run();
  } catch (err) {
    return err;
  }
  throw new Error("expected an error, got none");
}

function gaugeOn(surfaceId: string) {
  return {
    version: "1.0",
    updateComponents: {
      surfaceId,
      components: [
        { id: "root", component: "Gauge", "@catalogId": LATE_ID, value: 42 },
      ],
    },
  };
}

describe("MessageProcessor.addCatalog", () => {
  test("a later createSurface finds the added catalog", () => {
    const processor = new MessageProcessor({ catalogs: [baseCatalog()] });
    const create = {
      version: "1.0",
      createSurface: { surfaceId: "s_late", catalogId: LATE_ID },
    };
    const before = catchError(() => processor.processMessages([create]));
    expect(before instanceof A2uiCatalogError).toBe(true);

    processor.addCatalog(lateCatalog());
    processor.processMessages([create]);

    expect(processor.getSurface("s_late")?.defaultCatalogId).toBe(LATE_ID);
  });

  test("a surface created before the call does not see the added catalog", () => {
    const processor = new MessageProcessor({ catalogs: [baseCatalog()] });
    processor.processMessages([
      { version: "1.0", createSurface: { surfaceId: "s_early", catalogId: BASE_ID } },
    ]);
    processor.addCatalog(lateCatalog());

    const err = catchError(() => processor.processMessages([gaugeOn("s_early")]));

    expect(err instanceof A2uiCatalogError).toBe(true);
    expect((err as A2uiCatalogError).code).toBe("CATALOG_NOT_FOUND");
    expect(processor.getSurface("s_early")!.components.size).toBe(0);
  });

  test("a surface created before the call does not see it with validation skipped", () => {
    const processor = new MessageProcessor({
      catalogs: [baseCatalog()],
      skipValidation: true,
    });
    processor.processMessages([
      { version: "1.0", createSurface: { surfaceId: "s_early", catalogId: BASE_ID } },
    ]);
    processor.addCatalog(lateCatalog());

    const err = catchError(() => processor.processMessages([gaugeOn("s_early")]));

    expect(err instanceof A2uiCatalogError).toBe(true);
  });

  test("a surface created after the call can use the added catalog's components", () => {
    const processor = new MessageProcessor({ catalogs: [baseCatalog()] });
    processor.addCatalog(lateCatalog());
    processor.processMessages([
      { version: "1.0", createSurface: { surfaceId: "s_after", catalogId: BASE_ID } },
      gaugeOn("s_after"),
    ]);

    const root = processor.getSurface("s_after")!.components.get("root");
    expect(root?.catalogId).toBe(LATE_ID);
    expect(root?.type).toBe("Gauge");
  });

  test("a catalog whose id the processor already holds is refused with CatalogError", () => {
    const held = baseCatalog();
    const processor = new MessageProcessor({ catalogs: [held] });

    const err = catchError(() => processor.addCatalog(baseCatalog()));

    expect(err instanceof A2uiCatalogError).toBe(true);
    expect((err as A2uiCatalogError).code).toBe("CATALOG_ERROR");
    expect((err as Error).message).toBe(`Catalog already registered: ${BASE_ID}`);
    expect(processor.registry.get(BASE_ID)).toBe(held);
  });

  test("a catalog added once cannot be added again", () => {
    const processor = new MessageProcessor({ catalogs: [baseCatalog()] });
    processor.addCatalog(lateCatalog());

    const err = catchError(() => processor.addCatalog(lateCatalog()));
    expect(err instanceof A2uiCatalogError).toBe(true);
  });

  test("a malformed catalog document is refused with CatalogError and nothing is added", () => {
    const processor = new MessageProcessor({ catalogs: [baseCatalog()] });

    const err = catchError(() =>
      processor.addCatalog(Catalog.fromJson({ protocolVersion: "1.0", components: {} })),
    );

    expect(err instanceof A2uiCatalogError).toBe(true);
    expect((err as A2uiCatalogError).code).toBe("CATALOG_INVALID");
    expect(processor.registry.list().map((c) => c.catalogId)).toEqual([BASE_ID]);
  });

  test("getRendererCapabilities lists the added catalog after the held ones", () => {
    const processor = new MessageProcessor({ catalogs: [baseCatalog()] });
    processor.addCatalog(lateCatalog());

    expect(processor.getRendererCapabilities()).toEqual({
      "1.0": { supportedCatalogIds: [BASE_ID, LATE_ID] },
    });
  });

  test("a catalog registered on the registry directly stays visible to every surface", () => {
    const registry = new CatalogRegistry();
    registry.register(baseCatalog());
    const processor = new MessageProcessor({ registry });
    processor.processMessages([
      { version: "1.0", createSurface: { surfaceId: "s_early", catalogId: BASE_ID } },
    ]);
    registry.register(lateCatalog());

    processor.processMessages([gaugeOn("s_early")]);

    expect(processor.getSurface("s_early")!.components.get("root")?.type).toBe("Gauge");
  });
});
