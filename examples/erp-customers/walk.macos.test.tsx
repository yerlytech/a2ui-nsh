/**
 * Real macOS AppKit walk test for `examples/erp-customers/`.
 *
 * Automates all 7 manual walk steps from `examples/erp-customers/README.md`
 * plus an 8th A2UI JSON screen for `Slider`, `Video`, and `AudioPlayer`, at
 * both desktop (`1280 x 800`) and phone/compact (`390 x 640`) window sizes,
 * saving PNG screenshots under `target/walk-macos/`.
 *
 * Run via: `just walk-macos`
 * (or `nsh test examples/erp-customers/walk.macos.test.tsx --target macos`).
 */

import { describe, expect, open, test, type App } from "nsh/test";
import mediaShowcaseSurfaceJson from "./a2ui/media_showcase_surface.json";

const APP_ENTRY = "./App.tsx";
const SCREENSHOT_DIR = "target/walk-macos";

interface ViewportProfile {
  readonly label: "desktop" | "compact";
  readonly width: number;
  readonly height: number;
  readonly startIndex: number;
}

const PROFILES: readonly ViewportProfile[] = [
  { label: "desktop", width: 1280, height: 800, startIndex: 1 },
  { label: "compact", width: 390, height: 640, startIndex: 13 },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

async function capturePng(
  app: App,
  index: number,
  slug: string,
): Promise<void> {
  const path = `${SCREENSHOT_DIR}/${pad2(index)}-${slug}.png`;
  const bytes = await app.screenshot(path);
  expect(bytes.length).toBeGreaterThan(8);
  // Verify PNG signature (89 50 4E 47 0D 0A 1A 0A).
  expect(bytes[0]).toBe(0x89);
  expect(bytes[1]).toBe(0x50);
  expect(bytes[2]).toBe(0x4e);
  expect(bytes[3]).toBe(0x47);
}

describe("macOS AppKit walk for examples/erp-customers", () => {
  for (const profile of PROFILES) {
    const mode = profile.label;
    const base = profile.startIndex;

    describe(`${mode} (${profile.width}x${profile.height})`, () => {
      test("Step 1: master-detail & responsive layout resize between 1280x800 and 390x640", async () => {
        const app = await open(APP_ENTRY, {
          platform: "macos",
          width: profile.width,
          height: profile.height,
        });

        expect(app.shows("text:ERP Customers")).toBe(true);
        expect(app.shows(`text:Showing 5 of 5 customers (${mode})`)).toBe(true);
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
        expect(app.shows("text:Edit: Cedar Ridge Timber Works")).toBe(true);

        await capturePng(app, base, `${mode}-01-master-detail`);

        // Confirm live window resize switches between desktop (Row) and compact (Column).
        if (mode === "desktop") {
          await app.setViewport(390, 640);
          await app.waitFor("text:Showing 5 of 5 customers (compact)");
          await app.setViewport(1280, 800);
          await app.waitFor("text:Showing 5 of 5 customers (desktop)");
        } else {
          await app.setViewport(1280, 800);
          await app.waitFor("text:Showing 5 of 5 customers (desktop)");
          await app.setViewport(390, 640);
          await app.waitFor("text:Showing 5 of 5 customers (compact)");
        }
      });

      test("Step 2: search filter, empty-search state, and Clear Search recovery", async () => {
        const app = await open(APP_ENTRY, {
          platform: "macos",
          width: profile.width,
          height: profile.height,
        });

        await app.type("label:Search customers", "Alder");
        await app.waitFor(`text:Showing 1 of 5 customers (${mode})`);
        expect(app.shows("label:Select Alder Creek Logistics")).toBe(true);
        expect(app.shows("label:Select Cedar Ridge Timber Works")).toBe(false);
        await capturePng(app, base + 1, `${mode}-02-search-alder`);

        await app.clear("label:Search customers");
        await app.type("label:Search customers", "zzz-no-match");
        await app.waitFor('text:No customers match "zzz-no-match"');
        expect(app.shows("text:Clear Search")).toBe(true);
        await capturePng(app, base + 2, `${mode}-02-search-empty`);

        await app.press("text:Clear Search");
        await app.waitFor(`text:Showing 5 of 5 customers (${mode})`);
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
        expect(app.value("label:Search customers")).toBe("");
      });

      test("Step 3: select Cobalt Harbor Supply, edit Details fields, and verify Billing tab", async () => {
        const app = await open(APP_ENTRY, {
          platform: "macos",
          width: profile.width,
          height: profile.height,
        });

        await app.press("label:Select Cobalt Harbor Supply");
        await app.waitFor("text:Edit: Cobalt Harbor Supply");
        expect(app.value("label:Email")).toBe("finance@cobaltharbor.example");

        await app.clear("label:Name");
        await app.type("label:Name", "Cobalt Harbor Marine");
        await app.clear("label:Email");
        await app.type("label:Email", "ap@cobaltharbor.example");
        await app.clear("label:Tax ID");
        await app.type("label:Tax ID", "US-73-9998887");
        await app.press("label:Mid-Market");
        await app.press("label:Active");
        await app.clear("label:Notes");
        await app.type("label:Notes", "Updated marine billing terms.");
        await capturePng(app, base + 3, `${mode}-03-edit-details`);

        await app.press("text:Billing");
        await app.waitFor("text:Annual Contract Value");
        expect(app.shows("text:$34,800.00")).toBe(true);
        expect(app.shows("text:Jan 10, 2026")).toBe(true);
        expect(app.shows("text:Payment Terms")).toBe(true);
        await app.press("label:Net 45");

        // Open Contract Start DatePicker and pick Jan 18, 2026.
        await app.press(
          "id:erp_customers:field_contract_start-[/ui/workspaceView/0]:date-trigger",
        );
        await app.waitFor("label:2026-01-18");
        await app.press("label:2026-01-18");
        await app.waitFor("text:Jan 18, 2026");

        await app.clear("label:Annual Value (USD)");
        await app.type("label:Annual Value (USD)", "52000.00");
        await app.waitFor("text:$52,000.00");
        await capturePng(app, base + 4, `${mode}-03-edit-billing`);
      });

      test("Step 4: live @checks validation disables Save Customer and re-enables on valid values", async () => {
        const app = await open(APP_ENTRY, {
          platform: "macos",
          width: profile.width,
          height: profile.height,
        });

        await app.clear("label:Email");
        await app.type("label:Email", "not-an-email");
        await app.waitFor("text:Enter a valid billing email address.");
        expect(app.enabled("text:Save Customer")).toBe(false);

        await app.clear("label:Tax ID");
        await app.type("label:Tax ID", "BAD-ID");
        await app.waitFor("text:Tax ID must match format XX-00-0000000.");
        expect(app.enabled("text:Save Customer")).toBe(false);
        await capturePng(app, base + 5, `${mode}-04-validation-errors`);

        await app.clear("label:Email");
        await app.type("label:Email", "billing@cedarridge.example");
        await app.clear("label:Tax ID");
        await app.type("label:Tax ID", "US-12-3456789");
        await app.waitFor("text:Enter a valid billing email address.", {
          state: "gone",
        });
        await app.waitFor("text:Tax ID must match format XX-00-0000000.", {
          state: "gone",
        });
        expect(app.enabled("text:Save Customer")).toBe(true);
      });

      test("Step 5: create and save a new customer with confirmation banner", async () => {
        const app = await open(APP_ENTRY, {
          platform: "macos",
          width: profile.width,
          height: profile.height,
        });

        await app.press("text:New Customer");
        await app.waitFor("text:Customer name is required.");
        expect(app.enabled("text:Save Customer")).toBe(false);

        await app.type("label:Name", "Summit Valley Packaging");
        await app.type("label:Email", "billing@summitvalley.example");
        await app.type("label:Tax ID", "US-22-5544332");
        expect(app.enabled("text:Save Customer")).toBe(true);

        await app.press("text:Save Customer");
        await app.waitFor("text:Created customer Summit Valley Packaging.");
        expect(app.shows(`text:Showing 6 of 6 customers (${mode})`)).toBe(true);
        expect(app.shows("text:Summit Valley Packaging")).toBe(true);
        await capturePng(app, base + 6, `${mode}-05-create-save`);
      });

      test("Step 6: delete confirmation modal with Cancel, Escape, and Confirm Delete", async () => {
        const app = await open(APP_ENTRY, {
          platform: "macos",
          width: profile.width,
          height: profile.height,
        });

        await app.press("text:Delete");
        await app.waitFor(
          "text:Delete Cedar Ridge Timber Works? This permanently removes the customer record and cannot be undone.",
        );
        await capturePng(app, base + 7, `${mode}-06-delete-modal`);

        // Cancel dismisses modal without deleting.
        await app.press("text:Cancel");
        await app.waitFor("text:Confirm Delete", { state: "gone" });
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
        expect(app.shows(`text:Showing 5 of 5 customers (${mode})`)).toBe(true);

        // Escape dismisses modal without deleting.
        await app.press("text:Delete");
        await app.waitFor("text:Confirm Delete");
        await app.keyboard.press("escape");
        await app.waitFor("text:Confirm Delete", { state: "gone" });
        expect(app.shows(`text:Showing 5 of 5 customers (${mode})`)).toBe(true);

        // Confirm Delete removes customer and closes modal.
        await app.press("text:Delete");
        await app.waitFor("text:Confirm Delete");
        await app.press("text:Confirm Delete");
        await app.waitFor("text:Confirm Delete", { state: "gone" });
        await app.waitFor("text:Deleted customer Cedar Ridge Timber Works.");
        expect(app.shows(`text:Showing 4 of 4 customers (${mode})`)).toBe(true);
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(false);
        await capturePng(app, base + 8, `${mode}-06-delete-confirmed`);
      });

      test("Step 7: Reload loading skeleton and Simulate Error + Retry recovery", async () => {
        const app = await open(APP_ENTRY, {
          platform: "macos",
          width: profile.width,
          height: profile.height,
          host: {
            params: { reloadDelayMs: 1200 },
          },
        });

        await app.press("text:Reload");
        await app.waitFor("text:Refreshing customer directory...");
        expect(app.shows("text:Fetching customer directory...")).toBe(true);
        await capturePng(app, base + 9, `${mode}-07-loading-skeleton`);

        await app.waitFor("text:Customer directory refreshed.", {
          timeout: 5000,
        });
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);

        await app.press("text:Simulate Error");
        await app.waitFor("text:Sync error");
        expect(app.shows("text:Retry")).toBe(true);
        await capturePng(app, base + 10, `${mode}-07-sync-error`);

        await app.press("text:Retry");
        await app.waitFor("text:Sync error", { state: "gone" });
        await app.waitFor(
          "text:Connection restored and customer directory synced.",
        );
      });

      test("Step 8: A2UI JSON surface with Slider, Video, and AudioPlayer under default capabilities", async () => {
        const app = await open(APP_ENTRY, {
          platform: "macos",
          width: profile.width,
          height: profile.height,
        });

        await app.host.send("a2ui.message", [
          {
            version: "1.0",
            deleteSurface: { surfaceId: "erp_customers" },
          },
          mediaShowcaseSurfaceJson,
        ]);

        await app.waitFor("text:Basic Catalog Controls & Media");
        expect(app.shows("text:Discount Cap (%)")).toBe(true);
        expect(app.shows("text:Selected discount cap: 15%")).toBe(true);
        expect(app.shows("text:ERP Onboarding Video")).toBe(true);
        expect(
          app.shows("text:Video unavailable: network capability not granted."),
        ).toBe(true);
        expect(app.shows("text:Quarterly ERP Audio Briefing")).toBe(true);
        expect(
          app.shows("text:Audio unavailable: audio capability not granted."),
        ).toBe(true);

        // Drag the Slider to max on AppKit to verify live two-way binding and @checks.
        await app.drag("label:Discount Cap (%)", { x: profile.width });
        await app.waitFor("text:Selected discount cap: 50%");
        expect(
          app.shows("text:Discounts above 40% require finance approval."),
        ).toBe(true);

        await capturePng(app, base + 11, `${mode}-08-slider-video-audio`);
      });
    });
  }
});
