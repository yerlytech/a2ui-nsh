/**
 * Real-target 18-component Basic Catalog v1 test suite (Spec 002 T4).
 *
 * Uses zero `host.handlers` so the exact same suite runs headless, on
 * `--target tui`, and on `--target web`.
 */

import { describe, expect, open, test } from "nsh/test";

const APP_ENTRY = "./App.tsx";
const BASIC_CATALOG_ID =
  "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json";

function buildDisplayNavigationSurface() {
  return {
    version: "1.0",
    createSurface: {
      surfaceId: "catalog_display",
      catalogId: BASIC_CATALOG_ID,
      dataModel: {
        summary: {
          warehouse: "North Dock",
          count: 3,
        },
        items: [
          { id: "sku-1", title: "Pallet Jack" },
          { id: "sku-2", title: "Thermal Printer" },
          { id: "sku-3", title: "Barcode Scanner" },
        ],
        tags: [
          { id: "tag-1", label: "Priority" },
          { id: "tag-2", label: "Cold Chain" },
        ],
      },
      components: [
        {
          id: "root",
          component: "Column",
          align: "stretch",
          children: [
            "heading",
            "subtitle",
            "h_divider",
            "top_row",
            "inventory_list",
            "tag_list",
            "section_tabs",
          ],
        },
        {
          id: "heading",
          component: "Text",
          text: "**Basic Catalog Showcase**",
        },
        {
          id: "subtitle",
          component: "Text",
          variant: "caption",
          text: {
            "@call": "formatString",
            args: {
              value: "Warehouse ${/summary/warehouse}: ${/summary/count} items",
            },
          },
        },
        {
          id: "h_divider",
          component: "Divider",
          axis: "horizontal",
        },
        {
          id: "top_row",
          component: "Row",
          align: "center",
          children: ["left_card", "v_divider", "right_card"],
        },
        {
          id: "left_card",
          component: "Card",
          child: "left_card_col",
        },
        {
          id: "left_card_col",
          component: "Column",
          children: ["status_row", "preview_image"],
        },
        {
          id: "status_row",
          component: "Row",
          align: "center",
          children: ["ok_icon", "status_text"],
        },
        {
          id: "ok_icon",
          component: "Icon",
          name: "check",
          "@accessibility": {
            label: "Verified icon",
          },
        },
        {
          id: "status_text",
          component: "Text",
          text: "Catalog verified",
        },
        {
          id: "preview_image",
          component: "Image",
          url: "https://media.example.invalid/warehouse.png",
          description: "Warehouse preview",
          variant: "smallFeature",
          fit: "cover",
        },
        {
          id: "v_divider",
          component: "Divider",
          axis: "vertical",
        },
        {
          id: "right_card",
          component: "Card",
          child: "icon_btn",
        },
        {
          id: "icon_btn",
          component: "Button",
          child: "star_icon",
          "@accessibility": {
            label: "Favorite Item",
          },
          action: {
            event: {
              name: "favorite_item",
              context: {
                warehouse: { "@path": "/summary/warehouse" },
              },
            },
          },
        },
        {
          id: "star_icon",
          component: "Icon",
          name: "star",
        },
        {
          id: "inventory_list",
          component: "List",
          direction: "vertical",
          children: {
            componentId: "item_row",
            path: "/items",
          },
        },
        {
          id: "item_row",
          component: "Text",
          text: { "@path": "title" },
        },
        {
          id: "tag_list",
          component: "List",
          direction: "horizontal",
          children: {
            componentId: "tag_text",
            path: "/tags",
          },
        },
        {
          id: "tag_text",
          component: "Text",
          variant: "caption",
          text: { "@path": "label" },
        },
        {
          id: "section_tabs",
          component: "Tabs",
          tabs: [
            { title: "Overview", child: "tab_overview" },
            { title: "Specs", child: "tab_specs" },
          ],
        },
        {
          id: "tab_overview",
          component: "Text",
          text: "Overview panel active",
        },
        {
          id: "tab_specs",
          component: "Text",
          text: "Specs panel active",
        },
      ],
    },
  };
}

function buildInteractiveFormsSurface() {
  return {
    version: "1.0",
    createSurface: {
      surfaceId: "catalog_forms",
      catalogId: BASIC_CATALOG_ID,
      dataModel: {
        form: {
          code: "",
          priority: false,
          tier: ["standard"],
          regions: ["north"],
          discount: 15,
          launch: "2026-01-10T09:30:00",
        },
      },
      components: [
        {
          id: "root",
          component: "Column",
          align: "stretch",
          children: [
            "form_summary",
            "code_field",
            "priority_checkbox",
            "tier_picker",
            "region_picker",
            "discount_slider",
            "launch_dt",
            "actions_row",
          ],
        },
        {
          id: "form_summary",
          component: "Text",
          variant: "caption",
          text: {
            "@call": "formatString",
            args: {
              value:
                "Summary: code=${/form/code} priority=${/form/priority} discount=${/form/discount}% launch=${/form/launch}",
            },
          },
        },
        {
          id: "code_field",
          component: "TextField",
          label: "Order Code",
          placeholder: "ACME-01",
          value: { "@path": "/form/code" },
          "@checks": [
            {
              condition: {
                "@call": "required",
                args: { value: { "@path": "/form/code" } },
              },
              message: "Order code is required.",
            },
            {
              condition: {
                "@call": "length",
                args: { value: { "@path": "/form/code" }, min: 4 },
              },
              message: "Order code must be at least 4 characters.",
            },
          ],
        },
        {
          id: "priority_checkbox",
          component: "CheckBox",
          label: "Priority Shipping",
          value: { "@path": "/form/priority" },
        },
        {
          id: "tier_picker",
          component: "ChoicePicker",
          label: "Billing Tier",
          variant: "mutuallyExclusive",
          displayStyle: "checkbox",
          value: { "@path": "/form/tier" },
          options: [
            { label: "Standard", value: "standard" },
            { label: "Enterprise", value: "enterprise" },
          ],
        },
        {
          id: "region_picker",
          component: "ChoicePicker",
          label: "Regions",
          variant: "multipleSelection",
          displayStyle: "chips",
          filterable: true,
          value: { "@path": "/form/regions" },
          options: [
            { label: "North", value: "north" },
            { label: "South", value: "south" },
            { label: "West", value: "west" },
          ],
        },
        {
          id: "discount_slider",
          component: "Slider",
          label: "Discount Limit",
          min: 0,
          max: 50,
          steps: 10,
          value: { "@path": "/form/discount" },
          "@checks": [
            {
              condition: {
                "@call": "numeric",
                args: {
                  value: { "@path": "/form/discount" },
                  min: 0,
                  max: 40,
                },
              },
              message: "Discounts above 40% require approval.",
            },
          ],
        },
        {
          id: "launch_dt",
          component: "DateTimeInput",
          label: "Launch Date",
          enableDate: true,
          enableTime: true,
          value: { "@path": "/form/launch" },
        },
        {
          id: "actions_row",
          component: "Row",
          children: ["submit_btn", "details_modal"],
        },
        {
          id: "submit_btn",
          component: "Button",
          variant: "primary",
          child: "submit_btn_text",
          "@checks": [
            {
              condition: {
                "@call": "and",
                args: {
                  values: [
                    {
                      "@call": "required",
                      args: { value: { "@path": "/form/code" } },
                    },
                    {
                      "@call": "length",
                      args: { value: { "@path": "/form/code" }, min: 4 },
                    },
                  ],
                },
              },
              message: "Enter a valid order code first.",
            },
          ],
          action: {
            event: {
              name: "submit_order",
              context: {
                code: { "@path": "/form/code" },
                priority: { "@path": "/form/priority" },
                tier: { "@path": "/form/tier" },
                regions: { "@path": "/form/regions" },
                discount: { "@path": "/form/discount" },
                launch: { "@path": "/form/launch" },
              },
            },
          },
        },
        {
          id: "submit_btn_text",
          component: "Text",
          text: "Submit Order",
        },
        {
          id: "details_modal",
          component: "Modal",
          "@accessibility": {
            label: "Order Details Modal",
          },
          trigger: "modal_trigger_btn",
          content: "modal_content_col",
        },
        {
          id: "modal_trigger_btn",
          component: "Button",
          child: "modal_trigger_text",
          action: {
            event: {
              name: "open_details",
            },
          },
        },
        {
          id: "modal_trigger_text",
          component: "Text",
          text: "Open Details",
        },
        {
          id: "modal_content_col",
          component: "Column",
          children: ["modal_body_text", "modal_confirm_btn"],
        },
        {
          id: "modal_body_text",
          component: "Text",
          text: "Modal body ready",
        },
        {
          id: "modal_confirm_btn",
          component: "Button",
          child: "modal_confirm_text",
          action: {
            event: {
              name: "confirm_modal",
            },
          },
        },
        {
          id: "modal_confirm_text",
          component: "Text",
          text: "Confirm Modal",
        },
      ],
    },
  };
}

function buildMediaSurface() {
  return {
    version: "1.0",
    createSurface: {
      surfaceId: "catalog_media",
      catalogId: BASIC_CATALOG_ID,
      components: [
        {
          id: "root",
          component: "Column",
          align: "stretch",
          children: ["media_title", "valid_video", "invalid_video", "audio_bar"],
        },
        {
          id: "media_title",
          component: "Text",
          text: "**Media Fallback Showcase**",
        },
        {
          id: "valid_video",
          component: "Video",
          url: "https://media.example.invalid/walkthrough.mp4",
          "@accessibility": {
            label: "Product Walkthrough Video",
          },
        },
        {
          id: "invalid_video",
          component: "Video",
          url: "javascript:alert(1)",
          "@accessibility": {
            label: "Blocked Video",
          },
        },
        {
          id: "audio_bar",
          component: "AudioPlayer",
          url: "https://media.example.invalid/briefing.mp3",
          description: "Release Briefing Audio",
          "@accessibility": {
            label: "Release Briefing Audio",
          },
        },
      ],
    },
  };
}

describe("Real-target 18-component Basic Catalog v1 suite", () => {
  test("renders Column, Row, Card, Divider, Text, Image, Icon, List (vertical+horizontal), Button, and interactive Tabs with zero errors", async () => {
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 960,
      height: 640,
      host: {
        params: {
          messages: [buildDisplayNavigationSurface()],
        },
      },
    });

    expect(app.shows("text:Basic Catalog Showcase")).toBe(true);
    expect(app.shows("text:Warehouse North Dock: 3 items")).toBe(true);
    expect(app.shows("text:Catalog verified")).toBe(true);

    // Image keeps its layout box across all targets; 1 pt Dividers stay mounted
    // on graphical/headless targets while TUI grid layout collapses sub-cell rules.
    const isTerminal = app.shows("text:idiom=terminal");
    expect(app.shows("id:catalog_display:preview_image")).toBe(true);
    if (!isTerminal) {
      expect(app.shows("id:catalog_display:h_divider")).toBe(true);
      expect(app.shows("id:catalog_display:v_divider")).toBe(true);
    }

    // Vertical template-driven List and horizontal List render their items.
    expect(app.shows("text:Pallet Jack")).toBe(true);
    expect(app.shows("text:Thermal Printer")).toBe(true);
    expect(app.shows("text:Barcode Scanner")).toBe(true);
    expect(app.shows("text:Priority")).toBe(true);
    expect(app.shows("text:Cold Chain")).toBe(true);

    // Icon-only Button activates via accessibilityLabel on every target (including TUI).
    await app.press("label:Favorite Item");
    await app.waitFor("text:actions=1 last=favorite_item");
    expect(
      app.texts().some((t) => t.includes('"warehouse":"North Dock"')),
    ).toBe(true);

    // Tabs switch active panel cleanly.
    expect(app.shows("text:Overview panel active")).toBe(true);
    expect(app.shows("text:Specs panel active")).toBe(false);
    await app.press("text:Specs");
    await app.waitFor("text:Specs panel active");
    expect(app.shows("text:Overview panel active")).toBe(false);

    expect(app.shows("text:errors=0")).toBe(true);
  });

  test("exercises TextField, CheckBox, ChoicePicker (radio+filterable chips), Slider, DateTimeInput, check-gated Button, and Modal", async () => {
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 960,
      height: 640,
      clock: { time: new Date("2026-01-20T12:00:00Z") },
      host: {
        params: {
          messages: [buildInteractiveFormsSurface()],
        },
      },
    });

    // TextField @checks initially fail -> Submit Order is disabled.
    expect(app.shows("text:Order code is required.")).toBe(true);
    expect(app.enabled("text:Submit Order")).toBe(false);

    // Type valid Order Code -> validation clears and Submit Order enables.
    await app.type("label:Order Code", "ACME-01");
    await app.waitFor("text:Order code is required.", { state: "gone" });
    expect(app.enabled("text:Submit Order")).toBe(true);

    // Toggle CheckBox.
    await app.press("label:Priority Shipping");
    await app.waitUntil(() =>
      app.texts().some((t) => t.includes("priority=true")),
    );

    // Mutually exclusive radio ChoicePicker.
    await app.press("label:Enterprise");

    // Filterable multi-select chips ChoicePicker.
    await app.type("label:Filter options", "Wes");
    await app.waitFor("label:West");
    expect(app.shows("label:North")).toBe(false);
    await app.press("label:West");

    // Slider drag updates bound value above 40% and triggers @checks warning.
    await app.drag("label:Discount Limit", { x: 960 });
    await app.waitFor("text:Discounts above 40% require approval.");
    expect(
      app.texts().some((t) => /discount=(45|50)%/.test(t)),
    ).toBe(true);

    // DateTimeInput DatePicker popup updates ISO date while TimeField stays mounted.
    expect(app.shows("id:catalog_forms:launch_dt:time")).toBe(true);
    await app.press("id:catalog_forms:launch_dt:date-trigger");
    await app.waitFor("label:2026-01-18");
    await app.press("label:2026-01-18");
    await app.waitUntil(() =>
      app.texts().some((t) => t.includes("launch=2026-01-18T09:30:00")),
    );

    // Submit Order dispatches full bound context without host.handlers.
    await app.press("text:Submit Order");
    await app.waitFor("text:actions=1 last=submit_order");
    const submitCtx = app.texts().find((t) => t.startsWith("{")) ?? "";
    expect(submitCtx).toContain('"code":"ACME-01"');
    expect(submitCtx).toContain('"priority":true');
    expect(submitCtx).toContain('"tier":["enterprise"]');
    expect(submitCtx).toMatch(/"discount":(45|50)/);
    expect(submitCtx).toContain('"launch":"2026-01-18T09:30:00"');

    // Modal opens via trigger Button, renders content, and dismisses via Escape.
    expect(app.shows("text:Modal body ready")).toBe(false);
    await app.press("text:Open Details");
    await app.waitFor("text:Modal body ready");
    await app.press("text:Confirm Modal");
    await app.waitFor("text:actions=3 last=confirm_modal");
    await app.keyboard.press("escape");
    await app.waitFor("text:Modal body ready", { state: "gone" });

    expect(app.shows("text:errors=0")).toBe(true);
  });

  test("renders Video and AudioPlayer with safe degraded fallbacks under default host-only capabilities", async () => {
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 960,
      height: 640,
      host: {
        params: {
          messages: [buildMediaSurface()],
        },
      },
    });

    expect(app.shows("text:Media Fallback Showcase")).toBe(true);
    expect(app.shows("text:Release Briefing Audio")).toBe(true);

    const isTerminal = app.shows("text:idiom=terminal");
    if (isTerminal) {
      expect(app.shows("text:Product Walkthrough Video")).toBe(true);
      expect(app.shows("text:Blocked Video")).toBe(true);
      expect(app.shows("text:Video playback is unavailable in terminal.")).toBe(
        true,
      );
      expect(app.shows("text:Audio playback is unavailable in terminal.")).toBe(
        true,
      );
    } else {
      expect(app.shows("id:catalog_media:valid_video")).toBe(true);
      expect(app.shows("text:Blocked Video")).toBe(true);
      expect(
        app.shows("text:Video unavailable: invalid or unsupported URL."),
      ).toBe(true);
      const audioDegraded =
        app.shows("text:Audio unavailable: audio capability not granted.") ||
        app.shows("text:Audio playback is unavailable on this platform.");
      expect(audioDegraded).toBe(true);
    }

    expect(app.shows("text:errors=0")).toBe(true);
  });
});
