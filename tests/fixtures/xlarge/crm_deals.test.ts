// xlarge's `crm.deals` screen, exactly as its server sent it, validated by
// this library's strict A2UI 1.0 validator against the catalog xlarge
// publishes (`tech.yerly.xlarge/v1`). Validation needs only the catalog
// definition, which travels in the fixture beside the messages; drawing it
// needs the xlarge renderers in `src/catalog/xlarge/` (walked in
// `src/catalog/xlarge/crm_deals.test.tsx`).

import { describe, expect, test } from "nsh/test";
import { createBasicCatalogRegistry } from "../../../src/catalog/basic/index";
import { registerXlargeCatalogComponents } from "../../../src/catalog/xlarge/index";
import { BASIC_CATALOG_V1_ID, CatalogRegistry } from "../../../src/core/catalog";
import { MessageProcessor } from "../../../src/core/processor";
import fixture from "./crm-deals.json";

const XLARGE_CATALOG_ID = "tech.yerly.xlarge/v1";

/** The components the deals screen uses. */
const USED = ["Card", "Field", "Form", "Table"];

/** Of those, the names the Basic Catalog does not have at all. `Card` it has,
 *  with other properties (`child`, not xlarge's `title` code). */
const MISSING_FROM_BASIC = ["Field", "Form", "Table"];

function processor(): MessageProcessor {
  const registry = CatalogRegistry.withBasicV1();
  registry.registerInline(fixture.catalog);
  return new MessageProcessor({ registry, strictMode: true });
}

describe("xlarge crm.deals fixture", () => {
  test("the catalog is an A2UI 1.0 catalog definition", () => {
    const registry = CatalogRegistry.withBasicV1();
    const catalog = registry.registerInline(fixture.catalog);
    expect(catalog.catalogId).toBe(XLARGE_CATALOG_ID);
    expect(catalog.components.size).toBe(22);
  });

  test("every message validates strictly", () => {
    const run = processor();
    run.processMessages(fixture.messages);
    const surface = run.getSurface("crm.deals");
    expect(surface?.defaultCatalogId).toBe(XLARGE_CATALOG_ID);
    expect(surface?.components.get("root")?.type).toBe("Card");
    expect(surface?.components.get("table")?.properties["rows"]).toEqual({
      "@path": "/deals",
    });
  });

  test("every component it uses has a renderer once the xlarge catalog is registered", () => {
    const run = processor();
    run.processMessages(fixture.messages);
    const basicOnly = createBasicCatalogRegistry();
    const withXlarge = registerXlargeCatalogComponents(createBasicCatalogRegistry());
    const basic = CatalogRegistry.withBasicV1().get(BASIC_CATALOG_V1_ID);
    const used = [...(run.getSurface("crm.deals")?.components.values() ?? [])];
    const types = new Set<string>();
    const undrawnByBasic = new Set<string>();
    const undrawn = new Set<string>();
    const missing = new Set<string>();
    for (const component of used) {
      types.add(component.type);
      if (!basicOnly.has(component.catalogId, component.type)) undrawnByBasic.add(component.type);
      if (!withXlarge.has(component.catalogId, component.type)) undrawn.add(component.type);
      if (!basic?.components.has(component.type)) missing.add(component.type);
    }
    expect([...types].sort()).toEqual(USED);
    // Renderers are keyed by catalog id: Basic Catalog renderers draw none of it.
    expect([...undrawnByBasic].sort()).toEqual(USED);
    expect([...undrawn]).toEqual([]);
    expect([...missing].sort()).toEqual(MISSING_FROM_BASIC);
  });
});
