import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

function parseHexRgba(hex: string): [number, number, number] {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length !== 6 && clean.length !== 8) {
    throw new Error(`Expected #rrggbb or #rrggbbaa color, got: ${hex}`);
  }
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexRgba(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function wcagContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("Basic Catalog Button", () => {
  test("renders default, primary, and borderless variants and dispatches action.event with dispatch-time context", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_btn",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  itemId: "sku-42",
                  qty: 3,
                },
                components: [
                  {
                    id: "root",
                    component: "Row",
                    children: ["btn_default", "btn_primary", "btn_borderless"],
                  },
                  {
                    id: "btn_default",
                    component: "Button",
                    variant: "default",
                    child: "lbl_default",
                    action: {
                      event: {
                        name: "buy_item",
                        context: {
                          sku: { "@path": "/itemId" },
                          quantity: { "@path": "/qty" },
                        },
                      },
                    },
                  },
                  { id: "lbl_default", component: "Text", text: "Buy Default" },
                  {
                    id: "btn_primary",
                    component: "Button",
                    variant: "primary",
                    child: "lbl_primary",
                    action: {
                      event: {
                        name: "confirm_order",
                        userMessage: "Order placed",
                      },
                    },
                  },
                  { id: "lbl_primary", component: "Text", text: "Confirm" },
                  {
                    id: "btn_borderless",
                    component: "Button",
                    variant: "borderless",
                    child: "lbl_borderless",
                    action: {
                      event: { name: "cancel_order" },
                    },
                  },
                  { id: "lbl_borderless", component: "Text", text: "Cancel" },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.action": null, "a2ui.error": null },
      },
    });

    expect(app.shows("text:Buy Default")).toBe(true);
    expect(app.shows("text:Confirm")).toBe(true);
    expect(app.shows("text:Cancel")).toBe(true);
    expect(app.enabled("id:s_btn:btn_default")).toBe(true);

    // Mutate data model before pressing to verify dispatch-time evaluation.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_btn",
        path: "/itemId",
        value: "sku-99",
      },
    });

    await app.press("id:s_btn:btn_default");
    await app.press("id:s_btn:btn_primary");
    await app.press("id:s_btn:btn_borderless");

    const actions = app.host
      .posts()
      .filter((p) => p.name === "a2ui.action")
      .map((p) => p.data as Record<string, unknown>);

    expect(actions).toHaveLength(3);
    expect(actions[0]).toMatchObject({
      version: "1.0",
      action: {
        name: "buy_item",
        surfaceId: "s_btn",
        sourceComponentId: "btn_default",
        context: { sku: "sku-99", quantity: 3 },
      },
    });
    expect(actions[1]).toMatchObject({
      version: "1.0",
      action: {
        name: "confirm_order",
        surfaceId: "s_btn",
        sourceComponentId: "btn_primary",
        userMessage: "Order placed",
      },
    });
    expect(actions[2]).toMatchObject({
      version: "1.0",
      action: {
        name: "cancel_order",
        surfaceId: "s_btn",
        sourceComponentId: "btn_borderless",
      },
    });
  });

  test("executes local action.functionCall (openUrl with userActivation and mutating function) without emitting action event", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          enableTestFunctions: true,
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_btn_fn",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { counter: 10 },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["count_txt", "inc_btn", "link_btn"],
                  },
                  {
                    id: "count_txt",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "Count: ${/counter}" },
                    },
                  },
                  {
                    id: "inc_btn",
                    component: "Button",
                    child: "inc_lbl",
                    action: {
                      functionCall: {
                        "@call": "incrementCounter",
                        args: { path: "/counter", step: 5 },
                      },
                    },
                  },
                  { id: "inc_lbl", component: "Text", text: "Add 5" },
                  {
                    id: "link_btn",
                    component: "Button",
                    child: "link_lbl",
                    action: {
                      functionCall: {
                        "@call": "openUrl",
                        args: { url: "https://example.com/docs" },
                      },
                    },
                  },
                  { id: "link_lbl", component: "Text", text: "Open Docs" },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.action": null, "a2ui.openUrl": null, "a2ui.error": null },
      },
    });

    expect(app.shows("text:Count: 10")).toBe(true);

    await app.press("id:s_btn_fn:inc_btn");
    await app.waitFor("text:Count: 15");

    await app.press("id:s_btn_fn:link_btn");

    const opened = app.host
      .posts()
      .filter((p) => p.name === "a2ui.openUrl")
      .map((p) => (p.data as { url?: string }).url);
    expect(opened).toEqual(["https://example.com/docs"]);

    const actions = app.host.posts().filter((p) => p.name === "a2ui.action");
    expect(actions).toHaveLength(0);
    const errors = app.host.posts().filter((p) => p.name === "a2ui.error");
    expect(errors).toHaveLength(0);
  });

  test("enforces disabled-on-error semantics while keeping warning and info checks clickable", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_btn_checks",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  customerName: "",
                  warnCheck: {
                    valid: false,
                    code: "UNSAVED_DRAFT",
                    message: "Draft has optional empty fields",
                    severity: "warning",
                  },
                  infoCheck: {
                    valid: false,
                    code: "AUDIT_NOTE",
                    message: "Action will be logged",
                    severity: "info",
                  },
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["save_btn", "warn_btn"],
                  },
                  {
                    id: "save_btn",
                    component: "Button",
                    variant: "primary",
                    child: "save_lbl",
                    action: { event: { name: "save_customer" } },
                    "@checks": [
                      {
                        condition: {
                          "@call": "required",
                          args: { value: { "@path": "/customerName" } },
                        },
                        message: "Customer name is required before saving",
                      },
                    ],
                  },
                  { id: "save_lbl", component: "Text", text: "Save Customer" },
                  {
                    id: "warn_btn",
                    component: "Button",
                    child: "warn_lbl",
                    action: { event: { name: "publish_draft" } },
                    "@checks": [
                      { condition: { "@path": "/warnCheck" } },
                      { condition: { "@path": "/infoCheck" } },
                    ],
                  },
                  { id: "warn_lbl", component: "Text", text: "Publish Draft" },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.action": null },
      },
    });

    // Error check disables Save Customer and renders the error message.
    expect(app.enabled("id:s_btn_checks:save_btn")).toBe(false);
    expect(app.shows("text:Customer name is required before saving")).toBe(true);
    await expect(app.press("id:s_btn_checks:save_btn")).rejects.toMatchObject({
      code: "ERR_NSH_TEST_DISABLED",
    });

    // Warning and info checks display their feedback while keeping the button enabled.
    expect(app.enabled("id:s_btn_checks:warn_btn")).toBe(true);
    expect(app.shows("text:Draft has optional empty fields")).toBe(true);
    expect(app.shows("text:Action will be logged")).toBe(true);
    await app.press("id:s_btn_checks:warn_btn");

    // Filling the required value re-enables Save Customer and clears the error message.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_btn_checks",
        path: "/customerName",
        value: "Acme Corp",
      },
    });

    expect(app.enabled("id:s_btn_checks:save_btn")).toBe(true);
    expect(app.shows("text:Customer name is required before saving")).toBe(false);
    await app.press("id:s_btn_checks:save_btn");

    const dispatched = app.host
      .posts()
      .filter((p) => p.name === "a2ui.action")
      .map((p) => (p.data as { action?: { name?: string } }).action?.name);
    expect(dispatched).toEqual(["publish_draft", "save_customer"]);
  });

  test("integrates with ModalTriggerContext as a pressable Modal.trigger and respects disabled state", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_btn_modal",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { canDelete: false },
                components: [
                  {
                    id: "root",
                    component: "Modal",
                    trigger: "del_btn",
                    content: "confirm_body",
                  },
                  {
                    id: "del_btn",
                    component: "Button",
                    child: "del_lbl",
                    action: { event: { name: "open_delete_modal" } },
                    "@checks": [
                      {
                        condition: { "@path": "/canDelete" },
                        message: "Select a record first",
                      },
                    ],
                  },
                  { id: "del_lbl", component: "Text", text: "Delete" },
                  {
                    id: "confirm_body",
                    component: "Text",
                    text: "Confirm deletion of record",
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.action": null },
      },
    });

    // Disabled trigger button cannot open the modal.
    expect(app.enabled("id:s_btn_modal:del_btn")).toBe(false);
    await expect(app.press("id:s_btn_modal:del_btn")).rejects.toMatchObject({
      code: "ERR_NSH_TEST_DISABLED",
    });
    expect(app.shows("text:Confirm deletion of record")).toBe(false);

    // Enable trigger button via data model; pressing dispatches action and opens Modal.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_btn_modal",
        path: "/canDelete",
        value: true,
      },
    });

    await app.press("id:s_btn_modal:del_btn");
    await app.waitFor("text:Confirm deletion of record");

    const actions = app.host
      .posts()
      .filter((p) => p.name === "a2ui.action")
      .map((p) => (p.data as { action?: { name?: string } }).action?.name);
    expect(actions).toEqual(["open_delete_modal"]);
  });

  test("infers implicit label from child Text and allows explicit @accessibility overrides", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_btn_a11y",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Row",
                    children: ["implicit_btn", "explicit_btn"],
                  },
                  {
                    id: "implicit_btn",
                    component: "Button",
                    child: "implicit_lbl",
                    action: { event: { name: "save" } },
                  },
                  { id: "implicit_lbl", component: "Text", text: "Save Changes" },
                  {
                    id: "explicit_btn",
                    component: "Button",
                    child: "explicit_lbl",
                    action: { event: { name: "close" } },
                    "@accessibility": {
                      label: "Close Dialog",
                      description: "Discards unsaved edits",
                    },
                  },
                  { id: "explicit_lbl", component: "Text", text: "X" },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("label:Save Changes")).toBe(true);
    expect(app.shows("label:Close Dialog")).toBe(true);

    const posts = app.host
      .posts()
      .filter((p) => p.name === "a2ui.a11y")
      .map((p) => p.data as { componentId?: string; snapshot?: Record<string, unknown> });

    const implicitSnap = posts.find((p) => p.componentId === "implicit_btn")?.snapshot;
    const explicitSnap = posts.find((p) => p.componentId === "explicit_btn")?.snapshot;

    expect(implicitSnap).toEqual({
      label: "Save Changes",
      hidden: false,
      role: "button",
    });
    expect(explicitSnap).toEqual({
      label: "Close Dialog",
      description: "Discards unsaved edits",
      hidden: false,
      role: "button",
    });
  });

  test("primary button label maintains at least WCAG AA (4.5:1) contrast against its fill in light and dark appearance", async () => {
    for (const scheme of ["light", "dark"] as const) {
      const app = await open(HARNESS, {
        platform: "macos",
        colorScheme: scheme,
        host: {
          params: {
            messages: [
              {
                version: "1.0",
                createSurface: {
                  surfaceId: "s_btn_contrast",
                  catalogId: BASIC_CATALOG_V1_ID,
                  components: [
                    {
                      id: "root",
                      component: "Row",
                      children: ["btn_primary", "btn_default"],
                    },
                    {
                      id: "btn_primary",
                      component: "Button",
                      variant: "primary",
                      child: "lbl_primary",
                      action: { event: { name: "confirm_delete" } },
                    },
                    { id: "lbl_primary", component: "Text", text: "Confirm Delete" },
                    {
                      id: "btn_default",
                      component: "Button",
                      variant: "default",
                      child: "lbl_default",
                      action: { event: { name: "cancel_delete" } },
                    },
                    { id: "lbl_default", component: "Text", text: "Cancel" },
                  ],
                },
              },
            ],
          },
          handlers: { "a2ui.action": null },
        },
      });

      const primaryBg = app.viewStyle("id:s_btn_contrast:btn_primary")?.backgroundColor;
      const primaryFg = app.spanStyle("text:Confirm Delete").color;
      expect(primaryBg).toBeDefined();
      expect(primaryFg).toBeDefined();
      expect(wcagContrastRatio(primaryFg, primaryBg!)).toBeGreaterThanOrEqual(4.5);

      const defaultBg = app.viewStyle("id:s_btn_contrast:btn_default")?.backgroundColor;
      const defaultFg = app.spanStyle("text:Cancel").color;
      expect(defaultBg).toBeDefined();
      expect(defaultFg).toBeDefined();
      expect(wcagContrastRatio(defaultFg, defaultBg!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
