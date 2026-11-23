import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog Tabs", () => {
  test("renders first tab panel initially, switches on press, and applies @accessibility metadata", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_tabs",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Tabs",
                    "@accessibility": {
                      label: "Customer Sections",
                      description: "Switch between details and billing",
                    },
                    tabs: [
                      { title: "Details", child: "panel_details" },
                      { title: "Billing", child: "panel_billing" },
                    ],
                  },
                  {
                    id: "panel_details",
                    component: "Text",
                    text: "Account profile details",
                  },
                  {
                    id: "panel_billing",
                    component: "Text",
                    text: "Invoices and payment terms",
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("id:s_tabs:root")).toBe(true);
    expect(app.shows("label:Customer Sections")).toBe(true);
    expect(app.shows("text:Account profile details")).toBe(true);
    expect(app.shows("text:Invoices and payment terms")).toBe(false);

    // Switch to Billing tab.
    await app.press("id:s_tabs:root:tab:1");
    expect(app.shows("text:Account profile details")).toBe(false);
    expect(app.shows("text:Invoices and payment terms")).toBe(true);

    // Switch back to Details tab.
    await app.press("id:s_tabs:root:tab:0");
    expect(app.shows("text:Account profile details")).toBe(true);
    expect(app.shows("text:Invoices and payment terms")).toBe(false);

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
      label: "Customer Sections",
      description: "Switch between details and billing",
      hidden: false,
      role: "tablist",
    });
  });

  test("supports WAI-ARIA keyboard roving focus (Tab, Arrows, Home, End) on macOS", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_tabs_kbd",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["tabs_nav", "after_modal"],
                  },
                  {
                    id: "tabs_nav",
                    component: "Tabs",
                    tabs: [
                      { title: "One", child: "p1" },
                      { title: "Two", child: "p2" },
                      { title: "Three", child: "p3" },
                    ],
                  },
                  { id: "p1", component: "Text", text: "Panel 1" },
                  { id: "p2", component: "Text", text: "Panel 2" },
                  { id: "p3", component: "Text", text: "Panel 3" },
                  {
                    id: "after_modal",
                    component: "Modal",
                    trigger: "after_trig",
                    content: "after_body",
                  },
                  { id: "after_trig", component: "Text", text: "After Tabs" },
                  {
                    id: "after_body",
                    component: "Text",
                    text: "Reached After Tabs",
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(app.shows("text:Panel 1")).toBe(true);

    // Tab enters the tablist at the selected tab (One).
    await app.keyboard.press("tab");

    // ArrowRight moves focus and activates Two.
    await app.keyboard.press("right");
    expect(app.shows("text:Panel 2")).toBe(true);
    expect(app.shows("text:Panel 1")).toBe(false);

    // ArrowRight again activates Three.
    await app.keyboard.press("right");
    expect(app.shows("text:Panel 3")).toBe(true);

    // ArrowRight wraps around from last tab to first tab.
    await app.keyboard.press("right");
    expect(app.shows("text:Panel 1")).toBe(true);

    // ArrowLeft wraps backward to last tab.
    await app.keyboard.press("left");
    expect(app.shows("text:Panel 3")).toBe(true);

    // Home jumps to first tab; End jumps to last tab.
    await app.keyboard.press("home");
    expect(app.shows("text:Panel 1")).toBe(true);
    await app.keyboard.press("end");
    expect(app.shows("text:Panel 3")).toBe(true);

    // One Tab leaves the entire tablist to the next focusable control after it.
    await app.keyboard.press("tab");
    await app.keyboard.press("enter");
    await app.waitFor("text:Reached After Tabs");
    expect(app.shows("text:Reached After Tabs")).toBe(true);
  });

  test("updates dynamic tab titles and nested template content without remounting active panel or losing selection", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_tabs_dyn",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  tabTwoTitle: "Orders (2)",
                  orders: [{ id: "ORD-1" }, { id: "ORD-2" }],
                },
                components: [
                  {
                    id: "root",
                    component: "Tabs",
                    tabs: [
                      { title: "Summary", child: "summary_txt" },
                      {
                        title: { "@path": "/tabTwoTitle" },
                        child: "orders_list",
                      },
                    ],
                  },
                  { id: "summary_txt", component: "Text", text: "Overview" },
                  {
                    id: "orders_list",
                    component: "List",
                    children: { componentId: "order_item", path: "/orders" },
                  },
                  {
                    id: "order_item",
                    component: "Text",
                    text: { "@path": "id" },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null },
      },
    });

    await app.press("id:s_tabs_dyn:root:tab:1");
    expect(app.shows("text:Orders (2)")).toBe(true);
    expect(app.shows("text:ORD-1")).toBe(true);
    expect(app.shows("text:ORD-2")).toBe(true);

    // Mutate tab title and template items via updateDataModel.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_tabs_dyn",
        path: "/tabTwoTitle",
        value: "Orders (3)",
      },
    });
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_tabs_dyn",
        path: "/orders",
        value: [{ id: "ORD-1" }, { id: "ORD-2" }, { id: "ORD-3" }],
      },
    });

    // Selection stayed on tab 1, title updated, and new template row appeared.
    expect(app.shows("text:Orders (3)")).toBe(true);
    expect(app.shows("text:ORD-3")).toBe(true);

    const listMounts = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "orders_list",
      );
    expect(listMounts).toHaveLength(1);
  });

  test("clamps active tab index cleanly when tabs shrink via updateComponents", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_tabs_shrink",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Tabs",
                    tabs: [
                      { title: "General", child: "t_gen" },
                      { title: "Audit", child: "t_aud" },
                    ],
                  },
                  { id: "t_gen", component: "Text", text: "General Panel" },
                  { id: "t_aud", component: "Text", text: "Audit Panel" },
                ],
              },
            },
          ],
        },
      },
    });

    await app.press("id:s_tabs_shrink:root:tab:1");
    expect(app.shows("text:Audit Panel")).toBe(true);

    // Shrink to only one tab: selection clamps back to tab 0.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateComponents: {
        surfaceId: "s_tabs_shrink",
        components: [
          {
            id: "root",
            component: "Tabs",
            tabs: [{ title: "General", child: "t_gen" }],
          },
        ],
      },
    });

    expect(app.shows("text:General Panel")).toBe(true);
    expect(app.shows("text:Audit Panel")).toBe(false);
  });
});
