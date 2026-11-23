import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog ChoicePicker", () => {
  test("supports mutuallyExclusive checkbox (RadioGroup) selection with two-way @path writes and keyboard arrows", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_cp_radio",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { segment: ["smb"] },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["seg_picker", "seg_preview"],
                  },
                  {
                    id: "seg_picker",
                    component: "ChoicePicker",
                    label: "Customer Segment",
                    variant: "mutuallyExclusive",
                    value: { "@path": "/segment" },
                    options: [
                      { label: "SMB", value: "smb" },
                      { label: "Mid-Market", value: "mid" },
                      { label: "Enterprise", value: "ent" },
                    ],
                  },
                  {
                    id: "seg_preview",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "Selected: ${/segment/0}" },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.data": null, "a2ui.a11y": null },
      },
    });

    expect(app.shows("text:Customer Segment")).toBe(true);
    expect(app.shows("text:Selected: smb")).toBe(true);

    await app.press("id:s_cp_radio:seg_picker:option:ent");
    expect(app.shows("text:Selected: ent")).toBe(true);

    // Tab enters RadioGroup at the checked radio ("ent"); Up arrow selects Mid-Market ("mid").
    await app.keyboard.press("tab");
    await app.keyboard.press("up");
    expect(app.shows("text:Selected: mid")).toBe(true);

    await app.host.send("a2ui.readData", {
      surfaceId: "s_cp_radio",
      path: "/segment",
    });
    expect(
      (app.host.posts().filter((p) => p.name === "a2ui.data").pop()?.data as { value?: unknown })
        ?.value,
    ).toEqual(["mid"]);

    // Verify radiogroup accessibility role.
    const snap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "seg_picker",
      );
    expect((snap?.data as { snapshot?: Record<string, unknown> })?.snapshot).toEqual({
      label: "Customer Segment",
      hidden: false,
      role: "radiogroup",
    });
  });

  test("supports multipleSelection checkbox list toggling multiple values in @path string[]", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_cp_multi",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { tags: ["vip"] },
                components: [
                  {
                    id: "root",
                    component: "ChoicePicker",
                    label: "Customer Tags",
                    variant: "multipleSelection",
                    displayStyle: "checkbox",
                    value: { "@path": "/tags" },
                    options: [
                      { label: "VIP", value: "vip" },
                      { label: "Tax Exempt", value: "tax_exempt" },
                      { label: "Net 60", value: "net60" },
                    ],
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.data": null },
      },
    });

    await app.press("id:s_cp_multi:root:option:tax_exempt");
    await app.host.send("a2ui.readData", {
      surfaceId: "s_cp_multi",
      path: "/tags",
    });
    expect(
      (app.host.posts().filter((p) => p.name === "a2ui.data").pop()?.data as { value?: unknown })
        ?.value,
    ).toEqual(["vip", "tax_exempt"]);

    // Uncheck VIP
    await app.press("id:s_cp_multi:root:option:vip");
    await app.host.send("a2ui.readData", {
      surfaceId: "s_cp_multi",
      path: "/tags",
    });
    expect(
      (app.host.posts().filter((p) => p.name === "a2ui.data").pop()?.data as { value?: unknown })
        ?.value,
    ).toEqual(["tax_exempt"]);
  });

  test("supports displayStyle='chips' for both mutuallyExclusive and multipleSelection", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_cp_chips",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  terms: [],
                  regions: ["eu"],
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["terms_chips", "region_chips"],
                  },
                  {
                    id: "terms_chips",
                    component: "ChoicePicker",
                    label: "Payment Terms",
                    variant: "mutuallyExclusive",
                    displayStyle: "chips",
                    value: { "@path": "/terms" },
                    options: [
                      { label: "Net 15", value: "net15" },
                      { label: "Net 30", value: "net30" },
                    ],
                  },
                  {
                    id: "region_chips",
                    component: "ChoicePicker",
                    label: "Regions",
                    variant: "multipleSelection",
                    displayStyle: "chips",
                    value: { "@path": "/regions" },
                    options: [
                      { label: "EU", value: "eu" },
                      { label: "US", value: "us" },
                      { label: "APAC", value: "apac" },
                    ],
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.data": null },
      },
    });

    await app.press("id:s_cp_chips:terms_chips:option:net15");
    await app.press("id:s_cp_chips:terms_chips:option:net30");
    await app.host.send("a2ui.readData", {
      surfaceId: "s_cp_chips",
      path: "/terms",
    });
    expect(
      (app.host.posts().filter((p) => p.name === "a2ui.data").pop()?.data as { value?: unknown })
        ?.value,
    ).toEqual(["net30"]);

    await app.press("id:s_cp_chips:region_chips:option:us");
    await app.host.send("a2ui.readData", {
      surfaceId: "s_cp_chips",
      path: "/regions",
    });
    expect(
      (app.host.posts().filter((p) => p.name === "a2ui.data").pop()?.data as { value?: unknown })
        ?.value,
    ).toEqual(["eu", "us"]);
  });

  test("filters options case-insensitively when filterable=true and displays empty state", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_cp_filter",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { currency: [] },
                components: [
                  {
                    id: "root",
                    component: "ChoicePicker",
                    label: "Currency",
                    filterable: true,
                    value: { "@path": "/currency" },
                    options: [
                      { label: "US Dollar", value: "USD" },
                      { label: "Euro", value: "EUR" },
                      { label: "Turkish Lira", value: "TRY" },
                    ],
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.data": null },
      },
    });

    expect(app.shows("text:US Dollar")).toBe(true);
    expect(app.shows("text:Euro")).toBe(true);
    expect(app.shows("text:Turkish Lira")).toBe(true);

    await app.type("id:s_cp_filter:root:filter", "lira");
    expect(app.shows("text:Turkish Lira")).toBe(true);
    expect(app.shows("text:US Dollar")).toBe(false);
    expect(app.shows("text:Euro")).toBe(false);

    // Selecting filtered option writes to bound @path.
    await app.press("id:s_cp_filter:root:option:TRY");
    await app.host.send("a2ui.readData", {
      surfaceId: "s_cp_filter",
      path: "/currency",
    });
    expect(
      (app.host.posts().filter((p) => p.name === "a2ui.data").pop()?.data as { value?: unknown })
        ?.value,
    ).toEqual(["TRY"]);

    // Non-matching query displays empty state.
    await app.clear("id:s_cp_filter:root:filter");
    await app.type("id:s_cp_filter:root:filter", "zzz");
    expect(app.shows("text:No matching options")).toBe(true);
  });

  test("renders @checks error/warning/info feedback and honors @accessibility overrides", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_cp_checks",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  choices: [],
                  hintCheck: {
                    valid: false,
                    message: "At least one choice unlocks volume pricing",
                    severity: "info",
                  },
                },
                components: [
                  {
                    id: "root",
                    component: "ChoicePicker",
                    label: "Plan",
                    variant: "multipleSelection",
                    value: { "@path": "/choices" },
                    options: [{ label: "Pro", value: "pro" }],
                    "@accessibility": {
                      label: "Select subscription plan",
                      description: "Pick one or more tiers",
                    },
                    "@checks": [
                      {
                        condition: {
                          "@call": "required",
                          args: { value: { "@path": "/choices" } },
                        },
                        message: "Please select at least one plan.",
                      },
                      { condition: { "@path": "/hintCheck" } },
                    ],
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("text:Please select at least one plan.")).toBe(true);
    expect(app.shows("text:At least one choice unlocks volume pricing")).toBe(true);

    await app.press("id:s_cp_checks:root:option:pro");
    expect(app.shows("text:Please select at least one plan.")).toBe(false);
    expect(app.shows("text:At least one choice unlocks volume pricing")).toBe(true);

    const snap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect((snap?.data as { snapshot?: Record<string, unknown> })?.snapshot).toEqual({
      label: "Select subscription plan",
      description: "Pick one or more tiers",
      hidden: false,
      role: "group",
    });
  });
});
