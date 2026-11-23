import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog List", () => {
  test("renders static vertical items and applies @accessibility metadata", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_list",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "List",
                    direction: "vertical",
                    align: "start",
                    "@accessibility": {
                      label: "Customer Directory",
                      description: "Scrollable list of customers",
                    },
                    children: ["row_1", "row_2", "row_3"],
                  },
                  { id: "row_1", component: "Text", text: "Acme Corp" },
                  { id: "row_2", component: "Text", text: "Globex LLC" },
                  { id: "row_3", component: "Text", text: "Initech" },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("id:s_list:root")).toBe(true);
    expect(app.shows("label:Customer Directory")).toBe(true);
    expect(app.texts()).toEqual(["Acme Corp", "Globex LLC", "Initech"]);

    const snap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(
      (snap?.data as { snapshot?: Record<string, unknown> })?.snapshot,
    ).toEqual({
      label: "Customer Directory",
      description: "Scrollable list of customers",
      hidden: false,
      role: "list",
    });
  });

  test("renders template repeaters with @index() and preserves surviving view identity across insert, reorder, and delete", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_list_tpl",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  items: [{ name: "Alpha" }, { name: "Beta" }],
                },
                components: [
                  {
                    id: "root",
                    component: "List",
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

    // Insert Gamma between Alpha and Beta.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_list_tpl",
        path: "/items",
        value: [{ name: "Alpha" }, { name: "Gamma" }, { name: "Beta" }],
      },
    });
    expect(app.texts()).toEqual(["0: Alpha", "1: Gamma", "2: Beta"]);

    // Shrink to a single item.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_list_tpl",
        path: "/items",
        value: [{ name: "Beta" }],
      },
    });
    expect(app.texts()).toEqual(["0: Beta"]);

    // Neither the List root nor the surviving index-0 row remounted across
    // initial render, insertion, reordering, and deletion.
    const mountsBeforeEmpty = app.host
      .posts()
      .filter((p) => p.name === "a2ui.mount")
      .map(
        (p) =>
          p.data as {
            componentId?: string;
            instanceId?: string;
          },
      );
    expect(
      mountsBeforeEmpty.filter((m) => m.componentId === "root"),
    ).toHaveLength(1);
    expect(
      mountsBeforeEmpty.filter((m) => m.instanceId === "item_row-[/items/0]"),
    ).toHaveLength(1);

    // Shrink to empty, then repopulate cleanly without remounting List root.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_list_tpl",
        path: "/items",
        value: [],
      },
    });
    expect(app.texts()).toEqual([]);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_list_tpl",
        path: "/items",
        value: [{ name: "Delta" }],
      },
    });
    expect(app.texts()).toEqual(["0: Delta"]);

    const rootMountsAfterRepopulate = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(rootMountsAfterRepopulate).toHaveLength(1);
  });

  test("virtualizes large vertical lists and recycles cells when scrolling", async () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      name: `Row ${i}`,
    }));
    const app = await open(HARNESS, {
      width: 390,
      height: 400,
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_list_virt",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { items },
                components: [
                  {
                    id: "root",
                    component: "List",
                    children: { componentId: "row_card", path: "/items" },
                  },
                  {
                    id: "row_card",
                    component: "Card",
                    child: "row_text",
                  },
                  {
                    id: "row_text",
                    component: "Text",
                    text: { "@path": "name" },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null },
      },
    });

    // Only rows near the viewport are mounted initially (far fewer than 120).
    const initialRowMounts = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "row_text",
      );
    expect(app.shows("text:Row 0")).toBe(true);
    expect(initialRowMounts.length).toBeGreaterThan(0);
    expect(initialRowMounts.length).toBeLessThan(60);
    expect(app.shows("text:Row 119")).toBe(false);

    // Scrolling through the list binds later rows dynamically.
    await app.scroll("id:s_list_virt:root", 2400);
    const visibleAfterScroll = app.texts();
    const highestVisible = visibleAfterScroll
      .map((t) => Number(t.replace("Row ", "")))
      .filter((n) => Number.isFinite(n))
      .reduce((max, n) => Math.max(max, n), -1);
    expect(highestVisible).toBeGreaterThan(25);
  });

  test("supports horizontal direction, align, and dynamic direction switching", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_list_horiz",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  tags: [{ label: "Active" }, { label: "VIP" }, { label: "Net30" }],
                },
                components: [
                  {
                    id: "root",
                    component: "List",
                    direction: "horizontal",
                    align: "center",
                    children: { componentId: "tag_text", path: "/tags" },
                  },
                  {
                    id: "tag_text",
                    component: "Text",
                    text: { "@path": "label" },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(app.shows("id:s_list_horiz:root")).toBe(true);
    expect(app.texts()).toEqual(["Active", "VIP", "Net30"]);

    // Update data model in horizontal mode.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_list_horiz",
        path: "/tags",
        value: [{ label: "Enterprise" }, { label: "Net60" }],
      },
    });
    expect(app.texts()).toEqual(["Enterprise", "Net60"]);

    // Dynamically switch direction from horizontal to vertical via updateComponents.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateComponents: {
        surfaceId: "s_list_horiz",
        components: [
          {
            id: "root",
            component: "List",
            direction: "vertical",
            align: "end",
            children: { componentId: "tag_text", path: "/tags" },
          },
        ],
      },
    });
    expect(app.texts()).toEqual(["Enterprise", "Net60"]);
  });

  test("preserves keyboard Tab focus order across interactive items inside a virtualized List", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_list_kbd",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  rows: [
                    { title: "Open First", detail: "Detail One" },
                    { title: "Open Second", detail: "Detail Two" },
                  ],
                },
                components: [
                  {
                    id: "root",
                    component: "List",
                    children: { componentId: "row_modal", path: "/rows" },
                  },
                  {
                    id: "row_modal",
                    component: "Modal",
                    trigger: "row_trigger",
                    content: "row_detail",
                  },
                  {
                    id: "row_trigger",
                    component: "Text",
                    text: { "@path": "title" },
                  },
                  {
                    id: "row_detail",
                    component: "Text",
                    text: { "@path": "detail" },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(app.shows("text:Detail Two")).toBe(false);

    // Tab reaches row 0 trigger, then row 1 trigger; Enter activates row 1's Modal.
    await app.keyboard.press("tab");
    await app.keyboard.press("tab");
    await app.keyboard.press("enter");
    await app.waitFor("text:Detail Two");
    expect(app.shows("text:Detail Two")).toBe(true);

    // Escape closes the modal cleanly.
    await app.keyboard.press("escape");
    expect(app.shows("text:Detail Two")).toBe(false);
  });
});
