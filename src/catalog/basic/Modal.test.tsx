import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog Modal", () => {
  test("mounts only trigger initially, opens content on press, and closes via Close button, Escape, and back navigation", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_modal",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Modal",
                    trigger: "open_trigger",
                    content: "modal_body",
                    "@accessibility": {
                      label: "Confirm Deletion",
                      description: "This action cannot be undone",
                    },
                  },
                  {
                    id: "open_trigger",
                    component: "Text",
                    text: "Delete Customer",
                  },
                  {
                    id: "modal_body",
                    component: "Text",
                    text: "Are you sure you want to delete this record?",
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null, "a2ui.mount": null },
      },
    });

    // Initially only trigger is mounted; modal content and backdrop are absent.
    expect(app.shows("text:Delete Customer")).toBe(true);
    expect(
      app.shows("text:Are you sure you want to delete this record?"),
    ).toBe(false);
    expect(app.shows("id:s_modal:root:backdrop")).toBe(false);

    // 1. Open via trigger press; verify backdrop is mounted behind centered dialog,
    //    then close via accessible Close button.
    await app.press("id:s_modal:root:trigger");
    await app.waitFor("text:Are you sure you want to delete this record?");
    expect(app.shows("label:Confirm Deletion")).toBe(true);
    expect(app.shows("label:Close")).toBe(true);
    expect(app.shows("id:s_modal:root:backdrop")).toBe(true);
    // The backdrop's center is under the dialog; nsh 0.7.0 `press` takes a
    // `position`, so a press on its corner reaches the backdrop and closes.
    await expect(app.press("id:s_modal:root:backdrop")).rejects.toMatchObject({
      code: "ERR_NSH_TEST_COVERED",
    });
    await app.press("id:s_modal:root:backdrop", { position: { x: 4, y: 4 } });
    expect(
      app.shows("text:Are you sure you want to delete this record?"),
    ).toBe(false);
    await app.press("id:s_modal:root:trigger");
    await app.waitFor("text:Are you sure you want to delete this record?");

    await app.press("label:Close");
    expect(
      app.shows("text:Are you sure you want to delete this record?"),
    ).toBe(false);

    // 2. Re-open via trigger press, close via Escape key.
    await app.press("text:Delete Customer");
    await app.waitFor("text:Are you sure you want to delete this record?");
    await app.keyboard.press("escape");
    expect(
      app.shows("text:Are you sure you want to delete this record?"),
    ).toBe(false);

    // 3. Re-open again, close via native modal back dismissal.
    await app.press("text:Delete Customer");
    await app.waitFor("text:Are you sure you want to delete this record?");
    await app.back();
    expect(
      app.shows("text:Are you sure you want to delete this record?"),
    ).toBe(false);

    // Verify @accessibility snapshot recorded dialog metadata.
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
      label: "Confirm Deletion",
      description: "This action cannot be undone",
      hidden: false,
      role: "dialog",
    });
  });

  test("opens from keyboard Tab + Enter, traps Tab focus inside the open dialog, and closes on Enter on Close button", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_modal_kbd",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["first_modal", "second_modal"],
                  },
                  {
                    id: "first_modal",
                    component: "Modal",
                    trigger: "first_trig",
                    content: "first_body",
                    "@accessibility": {
                      label: "First Dialog",
                    },
                  },
                  { id: "first_trig", component: "Text", text: "Open First" },
                  {
                    id: "first_body",
                    component: "Text",
                    text: "Inside First Dialog",
                  },
                  {
                    id: "second_modal",
                    component: "Modal",
                    trigger: "second_trig",
                    content: "second_body",
                  },
                  { id: "second_trig", component: "Text", text: "Open Second" },
                  {
                    id: "second_body",
                    component: "Text",
                    text: "Inside Second Dialog",
                  },
                ],
              },
            },
          ],
        },
      },
    });

    // Tab focuses the first modal trigger; Enter opens First Dialog.
    await app.keyboard.press("tab");
    await app.keyboard.press("enter");
    await app.waitFor("text:Inside First Dialog");

    // While First Dialog is open, Tab stays scoped inside the dialog (focusing its
    // Close button) instead of moving to Second Modal behind it.
    await app.keyboard.press("tab");
    await app.keyboard.press("enter");
    expect(app.shows("text:Inside First Dialog")).toBe(false);
    expect(app.shows("text:Inside Second Dialog")).toBe(false);
  });

  test("updates dynamic data bindings and template children live while modal stays open", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_modal_dyn",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  title: "Pending items",
                  entries: [{ label: "Invoice #101" }],
                },
                components: [
                  {
                    id: "root",
                    component: "Modal",
                    trigger: "trig",
                    content: "body_col",
                    "@accessibility": {
                      label: { "@path": "/title" },
                      live: "assertive",
                    },
                  },
                  { id: "trig", component: "Text", text: "Inspect Queue" },
                  {
                    id: "body_col",
                    component: "Column",
                    children: ["heading", "entry_list"],
                  },
                  {
                    id: "heading",
                    component: "Text",
                    text: { "@path": "/title" },
                  },
                  {
                    id: "entry_list",
                    component: "List",
                    children: { componentId: "entry_row", path: "/entries" },
                  },
                  {
                    id: "entry_row",
                    component: "Text",
                    text: { "@path": "label" },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null },
      },
    });

    await app.press("text:Inspect Queue");
    await app.waitFor("text:Invoice #101");
    expect(app.shows("text:Pending items")).toBe(true);

    // Mutate data model while modal is open.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_modal_dyn",
        path: "/title",
        value: "Updated queue",
      },
    });
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_modal_dyn",
        path: "/entries",
        value: [{ label: "Invoice #101" }, { label: "Invoice #102" }],
      },
    });

    expect(app.shows("text:Updated queue")).toBe(true);
    expect(app.shows("text:Invoice #101")).toBe(true);
    expect(app.shows("text:Invoice #102")).toBe(true);

    // Modal root mounted exactly once across live updates.
    const modalMounts = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(modalMounts).toHaveLength(1);
  });

  test("supports nested modals where Escape dismisses only the innermost dialog first", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_modal_nested",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Modal",
                    trigger: "outer_trig",
                    content: "outer_body",
                    "@accessibility": { label: "Outer Dialog" },
                  },
                  { id: "outer_trig", component: "Text", text: "Open Outer" },
                  {
                    id: "outer_body",
                    component: "Column",
                    children: ["outer_msg", "inner_modal"],
                  },
                  {
                    id: "outer_msg",
                    component: "Text",
                    text: "Outer content visible",
                  },
                  {
                    id: "inner_modal",
                    component: "Modal",
                    trigger: "inner_trig",
                    content: "inner_body",
                    "@accessibility": { label: "Inner Dialog" },
                  },
                  { id: "inner_trig", component: "Text", text: "Open Inner" },
                  {
                    id: "inner_body",
                    component: "Text",
                    text: "Inner content visible",
                  },
                ],
              },
            },
          ],
        },
      },
    });

    await app.press("text:Open Outer");
    await app.waitFor("text:Outer content visible");
    expect(app.shows("text:Inner content visible")).toBe(false);

    await app.press("text:Open Inner");
    await app.waitFor("text:Inner content visible");

    // First Escape closes only the innermost dialog; outer dialog stays open.
    await app.keyboard.press("escape");
    expect(app.shows("text:Inner content visible")).toBe(false);
    expect(app.shows("text:Outer content visible")).toBe(true);

    // Second Escape closes the outer dialog.
    await app.keyboard.press("escape");
    expect(app.shows("text:Outer content visible")).toBe(false);
  });
});
