import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog Column", () => {
  test("renders static children vertically in declared order and applies @accessibility hidden subtree", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_col",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    justify: "start",
                    align: "stretch",
                    "@accessibility": {
                      label: "Hidden Group",
                      hidden: true,
                    },
                    children: ["line_1", "line_2"],
                  },
                  { id: "line_1", component: "Text", text: "First Line" },
                  { id: "line_2", component: "Text", text: "Second Line" },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.texts()).toEqual(["First Line", "Second Line"]);

    const colSnap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(
      (colSnap?.data as { snapshot?: Record<string, unknown> })?.snapshot,
    ).toEqual({
      label: "Hidden Group",
      hidden: true,
      role: "group",
    });
  });

  test("renders template ChildList with @index() and handles insert, reorder, and delete while preserving root identity", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_col_tpl",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  items: [{ name: "Alpha" }, { name: "Beta" }],
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: { componentId: "item_row", path: "/items" },
                  },
                  {
                    id: "item_row",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "${@index()}: ${name}" },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null },
      },
    });

    expect(app.texts()).toEqual(["0: Alpha", "1: Beta"]);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_col_tpl",
        path: "/items",
        value: [{ name: "Alpha" }, { name: "Gamma" }, { name: "Beta" }],
      },
    });
    expect(app.texts()).toEqual(["0: Alpha", "1: Gamma", "2: Beta"]);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_col_tpl",
        path: "/items",
        value: [{ name: "Beta" }],
      },
    });
    expect(app.texts()).toEqual(["0: Beta"]);

    // Parent Column (`root`) mounted exactly once across all repeater mutations.
    const rootMounts = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(rootMounts).toHaveLength(1);
  });
});
