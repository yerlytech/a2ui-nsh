import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../core/catalog";
import { ComponentRegistry } from "./registry";
import { MOCK_XLARGE_CATALOG_ID } from "./test_harness";

const HARNESS = "./test_harness.tsx";

describe("ComponentRegistry", () => {
  test("isolates component renderers strictly by catalogId with zero implicit fallback", () => {
    const registry = new ComponentRegistry();
    const basicText = () => null;
    const xlargeText = () => null;

    registry.register(BASIC_CATALOG_V1_ID, "Text", basicText);
    registry.register(MOCK_XLARGE_CATALOG_ID, "Text", xlargeText);

    expect(registry.resolve(BASIC_CATALOG_V1_ID, "Text")).toBe(basicText);
    expect(registry.resolve(MOCK_XLARGE_CATALOG_ID, "Text")).toBe(xlargeText);
    expect(registry.resolve(undefined, "Text")).toBeUndefined();
    expect(registry.resolve("https://unknown.example/v1", "Text")).toBeUndefined();
    expect(registry.has(BASIC_CATALOG_V1_ID, "StatusBadge")).toBe(false);
    expect(registry.catalogIds()).toEqual([
      BASIC_CATALOG_V1_ID,
      MOCK_XLARGE_CATALOG_ID,
    ]);

    const cloned = registry.clone();
    expect(cloned.resolve(MOCK_XLARGE_CATALOG_ID, "Text")).toBe(xlargeText);
  });
});

describe("A2uiSurface & multi-catalog resolution", () => {
  test("upgrades pending placeholder in place without remounting parent and unmounts on deleteSurface", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_prog",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  { id: "root", component: "Card", child: "deferred_text" },
                ],
              },
            },
          ],
        },
        handlers: {
          "a2ui.mount": null,
          "a2ui.error": null,
        },
      },
    });

    expect(app.shows("id:surface:s_prog")).toBe(true);
    expect(app.shows("id:s_prog:root")).toBe(true);
    // Pending placeholder occupies 0x0 space until its component arrives.
    expect(app.texts()).toEqual([]);

    const mountsBefore = app.host
      .posts()
      .filter((p) => p.name === "a2ui.mount");
    expect(mountsBefore).toHaveLength(1);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateComponents: {
        surfaceId: "s_prog",
        components: [
          { id: "deferred_text", component: "Text", text: "Arrived Safely" },
        ],
      },
    });

    expect(app.shows("id:s_prog:deferred_text")).toBe(true);
    expect(app.texts()).toContain("Arrived Safely");

    // Parent Card (`root`) must have mounted only once (0 parent remounts).
    const rootMounts = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(rootMounts).toHaveLength(1);

    await app.host.send("a2ui.message", {
      version: "1.0",
      deleteSurface: { surfaceId: "s_prog" },
    });

    expect(app.shows("id:surface:s_prog")).toBe(false);
    expect(app.texts()).not.toContain("Arrived Safely");
  });

  test("renders non-crashing placeholders and emits diagnostics for cyclic and unknown component types", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          strictMode: false,
          skipValidation: true,
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_diag",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["ok_text", "unknown_comp", "loop_a"],
                  },
                  { id: "ok_text", component: "Text", text: "Still Healthy" },
                  { id: "unknown_comp", component: "NotACatalogWidget" },
                  { id: "loop_a", component: "Card", child: "loop_b" },
                  { id: "loop_b", component: "Card", child: "loop_a" },
                ],
              },
            },
          ],
        },
        handlers: {
          "a2ui.error": null,
        },
      },
    });

    expect(app.texts()).toContain("Still Healthy");
    const codes = app.host
      .posts()
      .filter((p) => p.name === "a2ui.error")
      .map((p) => (p.data as { error?: { code?: string } }).error?.code);
    expect(codes).toContain("UNKNOWN_COMPONENT_TYPE");
    expect(codes).toContain("CYCLIC_REFERENCE");
  });

  test("mounts mixed-catalog surface (basic + xlarge) with component @catalogId and function catalogId overrides, and errors when no catalog is named", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          strictMode: true,
          enableXlargeCatalog: true,
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "mixed",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  itemCode: "erp-42",
                  status: "Operational",
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["basic_text", "sku_text", "xlarge_badge", "xlarge_text"],
                  },
                  {
                    id: "basic_text",
                    component: "Text",
                    text: "System Status",
                  },
                  {
                    id: "sku_text",
                    component: "Text",
                    text: {
                      "@call": "formatSku",
                      catalogId: MOCK_XLARGE_CATALOG_ID,
                      args: { code: { "@path": "/itemCode" } },
                    },
                  },
                  {
                    id: "xlarge_badge",
                    component: "StatusBadge",
                    "@catalogId": MOCK_XLARGE_CATALOG_ID,
                    badgeText: { "@path": "/status" },
                  },
                  {
                    // Same component type name ("Text"), overridden via @catalogId to xlarge.
                    id: "xlarge_text",
                    component: "Text",
                    "@catalogId": MOCK_XLARGE_CATALOG_ID,
                    text: "ERP Override",
                  },
                ],
              },
            },
          ],
        },
        handlers: {
          "a2ui.error": null,
          "a2ui.exception": null,
        },
      },
    });

    const texts = app.texts();
    expect(texts).toContain("System Status");
    expect(texts).toContain("SKU:ERP-42");
    expect(texts).toContain("Operational");
    expect(texts).toContain("[xlarge] ERP Override");

    // Reactive update across both Basic and xlarge catalog components and functions.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "mixed",
        path: "/itemCode",
        value: "erp-99",
      },
    });
    expect(app.texts()).toContain("SKU:ERP-99");

    // Strict v1.0 resolution: defaultless surface + component without @catalogId must error.
    await app.host.send("a2ui.message", {
      version: "1.0",
      createSurface: {
        surfaceId: "no_catalog",
        components: [
          {
            id: "root",
            component: "Text",
            text: "Should Fail",
          },
        ],
      },
    });

    expect(app.shows("id:surface:no_catalog")).toBe(false);
    expect(app.texts()).not.toContain("Should Fail");
    const errorPosts = app.host
      .posts()
      .filter((p) => p.name === "a2ui.error" || p.name === "a2ui.exception");
    expect(errorPosts.length).toBeGreaterThan(0);
  });
});
