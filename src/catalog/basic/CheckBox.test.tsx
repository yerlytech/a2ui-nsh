import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog CheckBox", () => {
  test("renders label and initial state, writes two-way boolean @path on press, and updates dependents without remounting", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_cb",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { active: false },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["active_cb", "status_text"],
                  },
                  {
                    id: "active_cb",
                    component: "CheckBox",
                    label: "Active Customer",
                    value: { "@path": "/active" },
                  },
                  {
                    id: "status_text",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "Active: ${/active}" },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null, "a2ui.data": null },
      },
    });

    expect(app.shows("text:Active Customer")).toBe(true);
    expect(app.shows("text:Active: false")).toBe(true);

    // Toggle false -> true
    await app.press("id:s_cb:active_cb");
    expect(app.shows("text:Active: true")).toBe(true);

    await app.host.send("a2ui.readData", {
      surfaceId: "s_cb",
      path: "/active",
    });
    expect(
      (app.host.posts().filter((p) => p.name === "a2ui.data").pop()?.data as { value?: unknown })
        ?.value,
    ).toBe(true);

    // Toggle true -> false
    await app.press("id:s_cb:active_cb");
    expect(app.shows("text:Active: false")).toBe(true);

    const mounts = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "active_cb",
      );
    expect(mounts).toHaveLength(1);
  });

  test("toggles via keyboard Tab + Space", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_cb_kbd",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { newsletter: false },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["cb", "state_txt"],
                  },
                  {
                    id: "cb",
                    component: "CheckBox",
                    label: "Subscribe to updates",
                    value: { "@path": "/newsletter" },
                  },
                  {
                    id: "state_txt",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "Subscribed: ${/newsletter}" },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(app.shows("text:Subscribed: false")).toBe(true);
    await app.keyboard.press("tab");
    await app.keyboard.press("space");
    expect(app.shows("text:Subscribed: true")).toBe(true);
  });

  test("renders @checks error, warning, and info messages and clears errors when checked", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_cb_checks",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  agreed: false,
                  warnNote: {
                    valid: false,
                    message: "Marketing opt-in is recommended",
                    severity: "warning",
                  },
                  infoNote: {
                    valid: false,
                    message: "You can unsubscribe anytime",
                    severity: "info",
                  },
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["terms_cb", "mkt_cb"],
                  },
                  {
                    id: "terms_cb",
                    component: "CheckBox",
                    label: "I agree to the terms",
                    value: { "@path": "/agreed" },
                    "@checks": [
                      {
                        condition: { "@path": "/agreed" },
                        message: "You must accept the terms to continue.",
                      },
                    ],
                  },
                  {
                    id: "mkt_cb",
                    component: "CheckBox",
                    label: "Receive product news",
                    value: false,
                    "@checks": [
                      { condition: { "@path": "/warnNote" } },
                      { condition: { "@path": "/infoNote" } },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(app.shows("text:You must accept the terms to continue.")).toBe(true);
    expect(app.shows("text:Marketing opt-in is recommended")).toBe(true);
    expect(app.shows("text:You can unsubscribe anytime")).toBe(true);

    await app.press("id:s_cb_checks:terms_cb");
    expect(app.shows("text:You must accept the terms to continue.")).toBe(false);
  });

  test("applies @accessibility label override, description, role, and hidden metadata", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_cb_a11y",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "CheckBox",
                    label: "I agree to terms",
                    value: true,
                    "@accessibility": {
                      label: "Accept Terms and Conditions",
                      description: "Required before submitting",
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("label:Accept Terms and Conditions")).toBe(true);

    const snap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect((snap?.data as { snapshot?: Record<string, unknown> })?.snapshot).toEqual({
      label: "Accept Terms and Conditions",
      description: "Required before submitting",
      hidden: false,
      role: "checkbox",
      checked: true,
    });
  });
});
