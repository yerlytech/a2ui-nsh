/**
 * Real TUI (`--target tui`, in-memory ratatui terminal) test & walk suite for
 * `examples/erp-customers/` (Spec 002 T5).
 *
 * Uses zero `host.handlers` so it runs directly against `nsh-tui-host`.
 * Exercises all 7 ERP walk steps plus the Step 8 media showcase (`Slider`,
 * `Video`, `AudioPlayer`) at both wide (`120x40` cells = `960x640` pt ->
 * `desktop` side-by-side) and compact (`80x24` cells = `640x384` pt ->
 * `compact` stacked) terminal grids, asserting `nsh-tui-cells` JSON snapshots
 * and saving them under `target/walk-tui/`.
 *
 * Run via: `just test-tui`
 * (or `nsh test examples/erp-customers/tui.test.tsx --target tui`).
 */

import { describe, expect, open, test, type App } from "nsh/test";
import mediaShowcaseSurfaceJson from "./a2ui/media_showcase_surface.json";

const APP_ENTRY = "./App.tsx";
const SCREENSHOT_DIR = "target/walk-tui";

/**
 * Measured on nsh 0.7.2 (0c29b5e), 2026-11-27: on `--target tui` every step
 * costs a few display frames of the terminal host, about 0.3-1 s a press or a
 * typed character with the machine loaded, so the typing-heavy steps (3-5)
 * took 20-34 s against the 30 s default. The steps and checks stay the same.
 */
const TUI_STEP_TIMEOUT_MS = 90_000;

/** Default `nsh` TUI cell scale: 8 x 16 points per terminal cell. */
const CELL_WIDTH_PT = 8;
const CELL_HEIGHT_PT = 16;

interface TuiCell {
  readonly symbol: string;
  readonly fg: string;
  readonly bg: string;
  readonly underline: string;
  readonly modifiers: readonly string[];
}

interface TuiCellsSnapshot {
  readonly format: string;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly (readonly TuiCell[])[];
}

interface CapturedGrid {
  readonly snapshot: TuiCellsSnapshot;
  readonly lines: readonly string[];
  readonly text: string;
}

interface TerminalProfile {
  readonly label: "wide" | "compact";
  readonly layoutMode: "desktop" | "compact";
  readonly cols: number;
  readonly rows: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly startIndex: number;
}

const PROFILES: readonly TerminalProfile[] = [
  {
    label: "wide",
    layoutMode: "desktop",
    cols: 120,
    rows: 40,
    widthPt: 120 * CELL_WIDTH_PT,
    heightPt: 40 * CELL_HEIGHT_PT,
    startIndex: 1,
  },
  {
    label: "compact",
    layoutMode: "compact",
    cols: 80,
    rows: 24,
    widthPt: 80 * CELL_WIDTH_PT,
    heightPt: 24 * CELL_HEIGHT_PT,
    startIndex: 13,
  },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

async function captureCells(
  app: App,
  profile: TerminalProfile,
  index: number,
  slug: string,
): Promise<CapturedGrid> {
  const path = `${SCREENSHOT_DIR}/${pad2(index)}-${slug}.json`;
  const bytes = await app.screenshot(path);
  expect(bytes.length).toBeGreaterThan(2);

  const decoded = new TextDecoder().decode(bytes);
  const snapshot = JSON.parse(decoded) as TuiCellsSnapshot;

  expect(snapshot.format).toBe("nsh-tui-cells");
  expect(snapshot.version).toBe(1);
  expect(snapshot.width).toBe(profile.cols);
  expect(snapshot.height).toBe(profile.rows);
  expect(snapshot.rows.length).toBe(profile.rows);
  expect(snapshot.rows[0]?.length).toBe(profile.cols);

  const lines = snapshot.rows.map((row) =>
    row.map((cell) => cell.symbol).join(""),
  );
  return {
    snapshot,
    lines,
    text: lines.join("\n"),
  };
}

describe("TUI target walk for examples/erp-customers", () => {
  for (const profile of PROFILES) {
    const mode = profile.layoutMode;
    const tag = profile.label;
    const base = profile.startIndex;

    describe(`${tag} ${profile.cols}x${profile.rows} (${mode}, ${profile.widthPt}x${profile.heightPt} pt)`, () => {
      test("Step 1: master-detail cell grid & responsive layout across 120x40 (desktop) and 80x24 (compact)", async () => {
        const app = await open(APP_ENTRY, {
          width: profile.widthPt,
          height: profile.heightPt,
        });

        expect(app.shows("text:ERP Customers")).toBe(true);
        expect(app.shows(`text:Showing 5 of 5 customers (${mode})`)).toBe(true);
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
        expect(app.shows("text:Edit: Cedar Ridge Timber Works")).toBe(true);

        const grid = await captureCells(
          app,
          profile,
          base,
          `${tag}-01-master-detail`,
        );
        expect(grid.text).toContain("ERP Customers");
        expect(grid.text).toContain(`Showing 5 of 5 customers (${mode})`);
        expect(grid.text).toContain("Cedar Ridge Timber Works");

        // At wide 120x40 (desktop), both the Customer List and Edit Form appear side-by-side,
        // and narrow list e-mails ellipsize cleanly instead of breaking mid-word.
        if (profile.label === "wide") {
          expect(grid.text).toContain("Edit: Cedar Ridge Timber Works");
          expect(grid.text).toContain("billing@cedarridge.exam…");
          expect(grid.text).toContain("ledger@redstonefoundry.exam…");
          expect(grid.text).not.toContain("cedarridge.examp ");
          expect(grid.text).not.toContain("redstonefoundry.examp ");
          expect(grid.text).not.toContain("le · Enterprise");
          expect(grid.text).toContain("Enterprise · Active");
        }
      }, TUI_STEP_TIMEOUT_MS);

      test("Step 2: search filter, empty-search state, and Clear Search recovery", async () => {
        const app = await open(APP_ENTRY, {
          width: profile.widthPt,
          height: profile.heightPt,
        });

        await app.type("label:Search customers", "Alder");
        await app.waitFor(`text:Showing 1 of 5 customers (${mode})`);
        expect(app.shows("label:Select Alder Creek Logistics")).toBe(true);
        expect(app.shows("label:Select Cedar Ridge Timber Works")).toBe(false);
        const searchGrid = await captureCells(
          app,
          profile,
          base + 1,
          `${tag}-02-search-alder`,
        );
        expect(searchGrid.text).toContain("Alder Creek Logistics");

        await app.clear("label:Search customers");
        await app.type("label:Search customers", "zzz-no-match");
        await app.waitFor('text:No customers match "zzz-no-match"');
        expect(app.shows("text:Clear Search")).toBe(true);
        const emptyGrid = await captureCells(
          app,
          profile,
          base + 2,
          `${tag}-02-search-empty`,
        );
        expect(emptyGrid.text).toContain("Clear Search");

        await app.press("text:Clear Search");
        await app.waitFor(`text:Showing 5 of 5 customers (${mode})`);
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
        expect(app.value("label:Search customers")).toBe("");
      }, TUI_STEP_TIMEOUT_MS);

      test("Step 3: select Cobalt Harbor Supply, edit Details fields, and verify Billing tab", async () => {
        const app = await open(APP_ENTRY, {
          width: profile.widthPt,
          height: profile.heightPt,
          clock: { time: new Date("2026-01-20T12:00:00Z") },
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
        await captureCells(app, profile, base + 3, `${tag}-03-edit-details`);

        await app.press("text:Billing");
        await app.waitFor("text:Annual Contract Value");
        expect(app.shows("text:$34,800.00")).toBe(true);
        expect(app.shows("text:Jan 10, 2026")).toBe(true);
        expect(app.shows("text:Payment Terms")).toBe(true);
        await app.press("label:Net 45");

        await app.press(
          "id:erp_customers:field_contract_start-[/ui/workspaceView/0]:date-trigger",
        );
        await app.waitFor("label:2026-01-18");
        await app.press("label:2026-01-18");
        await app.waitFor("text:Jan 18, 2026");

        await app.clear("label:Annual Value (USD)");
        await app.type("label:Annual Value (USD)", "52000.00");
        await app.waitFor("text:$52,000.00");
        const billingGrid = await captureCells(
          app,
          profile,
          base + 4,
          `${tag}-03-edit-billing`,
        );
        expect(billingGrid.text).toContain("52000.00");
      }, TUI_STEP_TIMEOUT_MS);

      test("Step 4: live @checks validation disables Save Customer and re-enables on valid values", async () => {
        const app = await open(APP_ENTRY, {
          width: profile.widthPt,
          height: profile.heightPt,
        });

        await app.clear("label:Email");
        await app.type("label:Email", "not-an-email");
        await app.waitFor("text:Enter a valid billing email address.");
        expect(app.enabled("text:Save Customer")).toBe(false);

        await app.clear("label:Tax ID");
        await app.type("label:Tax ID", "BAD-ID");
        await app.waitFor("text:Tax ID must match format XX-00-0000000.");
        expect(app.enabled("text:Save Customer")).toBe(false);
        const errGrid = await captureCells(
          app,
          profile,
          base + 5,
          `${tag}-04-validation-errors`,
        );
        expect(errGrid.text).toContain("Tax ID");

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
      }, TUI_STEP_TIMEOUT_MS);

      test("Step 5: create and save a new customer with confirmation banner", async () => {
        const app = await open(APP_ENTRY, {
          width: profile.widthPt,
          height: profile.heightPt,
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
        await captureCells(app, profile, base + 6, `${tag}-05-create-save`);
      }, TUI_STEP_TIMEOUT_MS);

      test("Step 6: delete confirmation modal with Cancel, Escape, and Confirm Delete", async () => {
        const app = await open(APP_ENTRY, {
          width: profile.widthPt,
          height: profile.heightPt,
        });

        await app.press("text:Delete");
        await app.waitFor(
          "text:Delete Cedar Ridge Timber Works? This permanently removes the customer record and cannot be undone.",
        );
        const modalGrid = await captureCells(
          app,
          profile,
          base + 7,
          `${tag}-06-delete-modal`,
        );
        expect(modalGrid.text).toContain("Confirm Delete");

        await app.press("text:Cancel");
        await app.waitFor("text:Confirm Delete", { state: "gone" });
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
        expect(app.shows(`text:Showing 5 of 5 customers (${mode})`)).toBe(true);

        await app.press("text:Delete");
        await app.waitFor("text:Confirm Delete");
        await app.keyboard.press("escape");
        await app.waitFor("text:Confirm Delete", { state: "gone" });
        expect(app.shows(`text:Showing 5 of 5 customers (${mode})`)).toBe(true);

        await app.press("text:Delete");
        await app.waitFor("text:Confirm Delete");
        await app.press("text:Confirm Delete");
        await app.waitFor("text:Confirm Delete", { state: "gone" });
        await app.waitFor("text:Deleted customer Cedar Ridge Timber Works.");
        expect(app.shows(`text:Showing 4 of 4 customers (${mode})`)).toBe(true);
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(false);
        await captureCells(
          app,
          profile,
          base + 8,
          `${tag}-06-delete-confirmed`,
        );
      }, TUI_STEP_TIMEOUT_MS);

      test("Keyboard: Tab/Shift+Tab traverse controls and form fields, Enter activates buttons, and Escape dismisses the modal", async () => {
        const app = await open(APP_ENTRY, {
          width: profile.widthPt,
          height: profile.heightPt,
        });

        await app.keyboard.press("tab");
        await app.keyboard.press("shift+tab");
        await app.keyboard.press("enter");
        await app.waitFor("text:Saved changes to Cedar Ridge Timber Works.");

        await app.keyboard.press("shift+tab");
        await app.keyboard.press("enter");
        await app.waitFor("text:Confirm Delete");
        await app.keyboard.press("escape");
        await app.waitFor("text:Confirm Delete", { state: "gone" });
        expect(app.shows(`text:Showing 5 of 5 customers (${mode})`)).toBe(true);

        await app.type("label:Name", "x");
        expect(app.value("label:Name")).toBe("Cedar Ridge Timber Worksx");
        await app.keyboard.press("tab");
        await app.keyboard.press("x");
        expect(app.value("label:Email")).toBe(
          "billing@cedarridge.examplex",
        );
        await app.keyboard.press("tab");
        await app.keyboard.press("x");
        expect(app.value("label:Tax ID")).toBe("US-12-3456789x");
        await app.keyboard.press("shift+tab");
        await app.keyboard.press("y");
        expect(app.value("label:Email")).toBe(
          "billing@cedarridge.examplexy",
        );
      }, TUI_STEP_TIMEOUT_MS);

      test("Step 7: Reload loading skeleton and Simulate Error + Retry recovery", async () => {
        const app = await open(APP_ENTRY, {
          width: profile.widthPt,
          height: profile.heightPt,
          host: {
            params: { reloadDelayMs: 1200 },
          },
        });

        await app.press("text:Reload");
        await app.waitFor("text:Refreshing customer directory...");
        expect(app.shows("text:Fetching customer directory...")).toBe(true);
        const loadingGrid = await captureCells(
          app,
          profile,
          base + 9,
          `${tag}-07-loading-skeleton`,
        );
        expect(loadingGrid.text).toContain("Refreshing customer directory");

        await app.waitFor("text:Customer directory refreshed.", {
          timeout: 5000,
        });
        expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);

        await app.press("text:Simulate Error");
        await app.waitFor("text:Sync error");
        expect(app.shows("text:Retry")).toBe(true);
        const errorGrid = await captureCells(
          app,
          profile,
          base + 10,
          `${tag}-07-sync-error`,
        );
        expect(errorGrid.text).toContain("Sync error");

        await app.press("text:Retry");
        await app.waitFor("text:Sync error", { state: "gone" });
        await app.waitFor(
          "text:Connection restored and customer directory synced.",
        );
      }, TUI_STEP_TIMEOUT_MS);

      test("Step 8: A2UI JSON surface with Slider and terminal Video/AudioPlayer fallback cards", async () => {
        const app = await open(APP_ENTRY, {
          width: profile.widthPt,
          height: profile.heightPt,
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
          app.shows("text:Video playback is unavailable in terminal."),
        ).toBe(true);
        expect(app.shows("text:Quarterly ERP Audio Briefing")).toBe(true);
        expect(
          app.shows("text:Audio playback is unavailable in terminal."),
        ).toBe(true);

        await app.drag("label:Discount Cap (%)", { x: profile.widthPt });
        await app.waitFor("text:Selected discount cap: 50%");
        expect(
          app.shows("text:Discounts above 40% require finance approval."),
        ).toBe(true);

        const mediaGrid = await captureCells(
          app,
          profile,
          base + 11,
          `${tag}-08-slider-video-audio`,
        );
        expect(mediaGrid.text).toContain("Discount Cap (%)");
        expect(mediaGrid.text).toContain("Selected discount cap: 50%");
        if (profile.label === "wide") {
          expect(mediaGrid.text).toContain(
            "Video playback is unavailable in terminal.",
          );
          expect(mediaGrid.text).toContain(
            "Audio playback is unavailable in terminal.",
          );
        }
      }, TUI_STEP_TIMEOUT_MS);
    });
  }
});
