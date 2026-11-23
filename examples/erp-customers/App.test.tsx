import { describe, expect, open, test } from "nsh/test";
import type { ErpSandboxProbeResult } from "./sandbox_entry";

const APP_ENTRY = "./App.tsx";
const SANDBOX_ENTRY = "./sandbox_entry.tsx";

const ERP_HANDLERS = {
  "a2ui.action": null,
  "a2ui.error": null,
  "a2ui.data": null,
};

describe("ERP Customers example (pure A2UI v1.0 JSON on nsh 0.6.1)", () => {
  test("renders desktop master-detail customer list, formatted currency/dates, and tabbed edit form with zero A2UI errors", async () => {
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 1280,
      height: 800,
      host: { handlers: ERP_HANDLERS },
    });

    expect(app.shows("text:ERP Customers")).toBe(true);
    expect(app.shows("text:Showing 5 of 5 customers (desktop)")).toBe(true);

    // Invented customers render in the template-driven List with formatCurrency.
    expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
    expect(app.shows("text:Alder Creek Logistics")).toBe(true);
    expect(app.shows("text:Cobalt Harbor Supply")).toBe(true);
    expect(app.shows("text:Bramble Finch Textiles")).toBe(true);
    expect(app.shows("text:Redstone Foundry Works")).toBe(true);
    expect(app.shows("text:$184,500.00")).toBe(true);

    // Edit form reflects the initially selected customer and formatted contract date.
    expect(app.shows("text:Edit: Cedar Ridge Timber Works")).toBe(true);
    expect(app.shows("text:Mar 15, 2025")).toBe(true);
    expect(app.value("label:Name")).toBe("Cedar Ridge Timber Works");
    expect(app.value("label:Email")).toBe("billing@cedarridge.example");
    expect(app.value("label:Tax ID")).toBe("US-12-3456789");

    // Zero A2UI protocol/validation errors emitted during startup.
    const errors = app.host.posts().filter((p) => p.name === "a2ui.error");
    expect(errors).toEqual([]);
  });

  test("filters customer list live via search, renders empty search state, and recovers with Clear Search", async () => {
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 1280,
      height: 800,
      host: { handlers: ERP_HANDLERS },
    });

    // Filter to a single matching customer.
    await app.type("label:Search customers", "Alder");
    expect(app.shows("text:Showing 1 of 5 customers (desktop)")).toBe(true);
    expect(app.shows("label:Select Alder Creek Logistics")).toBe(true);
    expect(app.shows("label:Select Cedar Ridge Timber Works")).toBe(false);
    // Currently selected customer remains open in the edit form while filtering.
    expect(app.shows("text:Edit: Cedar Ridge Timber Works")).toBe(true);

    // Filter to zero matches -> empty search state.
    await app.clear("label:Search customers");
    await app.type("label:Search customers", "zzz-nonexistent");
    expect(app.shows('text:No customers match "zzz-nonexistent"')).toBe(true);
    expect(app.shows("text:Clear Search")).toBe(true);

    // Click Clear Search -> restores all 5 customers.
    await app.press("text:Clear Search");
    expect(app.shows("text:Showing 5 of 5 customers (desktop)")).toBe(true);
    expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
    expect(app.value("label:Search customers")).toBe("");
  });

  test("selects a customer, edits controls across Details and Billing tabs, validates @checks, and saves via updateDataModel", async () => {
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 1280,
      height: 800,
      clock: { time: new Date("2026-01-20T12:00:00Z") },
      host: { handlers: ERP_HANDLERS },
    });

    // Select Cobalt Harbor Supply -> emits select_customer outbound action envelope.
    await app.press("label:Select Cobalt Harbor Supply");
    expect(app.shows("text:Edit: Cobalt Harbor Supply")).toBe(true);
    expect(app.value("label:Email")).toBe("finance@cobaltharbor.example");

    const selectAction = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.action" &&
          (p.data as { action?: { name?: string } })?.action?.name ===
            "select_customer",
      );
    expect(selectAction?.data).toMatchObject({
      version: "1.0",
      action: {
        name: "select_customer",
        surfaceId: "erp_customers",
        context: { customerId: "cust-103" },
      },
    });

    // Trigger @checks validation errors on Email and Tax ID -> Save Customer disables.
    await app.clear("label:Email");
    await app.type("label:Email", "not-an-email");
    expect(app.shows("text:Enter a valid billing email address.")).toBe(true);
    expect(app.enabled("text:Save Customer")).toBe(false);

    await app.clear("label:Tax ID");
    await app.type("label:Tax ID", "BAD-TAX");
    expect(app.shows("text:Tax ID must match format XX-00-0000000.")).toBe(true);
    expect(app.enabled("text:Save Customer")).toBe(false);

    // Fix Email, Tax ID, Name, Segment chip, Active checkbox, and Notes.
    await app.clear("label:Name");
    await app.type("label:Name", "Cobalt Harbor Marine");
    await app.clear("label:Email");
    await app.type("label:Email", "ap@cobaltharbor.example");
    await app.clear("label:Tax ID");
    await app.type("label:Tax ID", "US-73-9998887");
    await app.press("label:Mid-Market");
    await app.press("label:Active");
    await app.clear("label:Notes");
    await app.type("label:Notes", "Updated dock billing terms.");

    expect(app.shows("text:Enter a valid billing email address.")).toBe(false);
    expect(app.shows("text:Tax ID must match format XX-00-0000000.")).toBe(false);
    expect(app.enabled("text:Save Customer")).toBe(true);

    // Switch to Billing tab and update Payment Terms, Contract Start, and Annual Value.
    await app.press("text:Billing");
    expect(app.shows("text:Annual Contract Value")).toBe(true);
    expect(app.shows("text:Payment Terms")).toBe(true);
    await app.press("label:Net 45");

    // Pick a new Contract Start date via DateTimeInput DatePicker popup.
    await app.press(
      "id:erp_customers:field_contract_start-[/ui/workspaceView/0]:date-trigger",
    );
    await app.waitFor("label:2026-01-18");
    await app.press("label:2026-01-18");
    expect(app.shows("text:Jan 18, 2026")).toBe(true);

    await app.clear("label:Annual Value (USD)");
    await app.type("label:Annual Value (USD)", "52000.00");
    expect(app.shows("text:$52,000.00")).toBe(true);

    // Save changes -> emits save_customer action, updates list, and shows confirmation banner.
    await app.press("text:Save Customer");
    expect(app.shows("text:Saved changes to Cobalt Harbor Marine.")).toBe(true);
    expect(app.shows("text:Cobalt Harbor Marine")).toBe(true);
    expect(app.shows("text:ap@cobaltharbor.example")).toBe(true);
    expect(app.shows("text:Mid-Market · Paused")).toBe(true);

    const saveAction = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.action" &&
          (p.data as { action?: { name?: string } })?.action?.name ===
            "save_customer",
      );
    expect(saveAction?.data).toMatchObject({
      version: "1.0",
      action: {
        name: "save_customer",
        surfaceId: "erp_customers",
        context: {
          id: "cust-103",
          name: "Cobalt Harbor Marine",
          email: "ap@cobaltharbor.example",
          taxId: "US-73-9998887",
          segment: ["midmarket"],
          paymentTerms: ["net45"],
          contractStart: "2026-01-18",
          annualValueText: "52000.00",
          active: false,
        },
      },
    });
  });

  test("creates a new customer record and adds it to the list via updateDataModel", async () => {
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 1280,
      height: 800,
      host: { handlers: ERP_HANDLERS },
    });

    await app.press("text:New Customer");
    expect(app.shows("text:Customer name is required.")).toBe(true);
    expect(app.enabled("text:Save Customer")).toBe(false);
    // Delete trigger is hidden on an unsaved new draft.
    expect(app.shows("text:Delete")).toBe(false);

    await app.type("label:Name", "Summit Valley Packaging");
    await app.type("label:Email", "billing@summitvalley.example");
    await app.type("label:Tax ID", "US-22-5544332");
    expect(app.enabled("text:Save Customer")).toBe(true);

    await app.press("text:Save Customer");
    expect(app.shows("text:Created customer Summit Valley Packaging.")).toBe(
      true,
    );
    expect(app.shows("text:Showing 6 of 6 customers (desktop)")).toBe(true);
    expect(app.shows("text:Summit Valley Packaging")).toBe(true);
    expect(app.shows("text:Delete")).toBe(true);
  });

  test("requires Modal confirmation to delete a customer, supports Cancel/Escape, and handles empty directory state", async () => {
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 1280,
      height: 800,
      host: { handlers: ERP_HANDLERS },
    });

    // Open delete confirmation modal.
    await app.press("text:Delete");
    await app.waitFor(
      "text:Delete Cedar Ridge Timber Works? This permanently removes the customer record and cannot be undone.",
    );

    // Cancel closes the modal without deleting.
    await app.press("text:Cancel");
    expect(app.shows("text:Confirm Delete")).toBe(false);
    expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
    expect(app.shows("text:Showing 5 of 5 customers (desktop)")).toBe(true);

    // Reopen and dismiss via Escape -> still not deleted.
    await app.press("text:Delete");
    await app.waitFor("text:Confirm Delete");
    await app.keyboard.press("escape");
    expect(app.shows("text:Confirm Delete")).toBe(false);
    expect(app.shows("text:Showing 5 of 5 customers (desktop)")).toBe(true);

    // Reopen and confirm deletion -> emits delete_customer, removes row, closes modal.
    await app.press("text:Delete");
    await app.waitFor("text:Confirm Delete");
    await app.press("text:Confirm Delete");

    expect(app.shows("text:Confirm Delete")).toBe(false);
    expect(
      app.shows("text:Deleted customer Cedar Ridge Timber Works."),
    ).toBe(true);
    expect(app.shows("text:Showing 4 of 4 customers (desktop)")).toBe(true);
    expect(app.shows("text:Cedar Ridge Timber Works")).toBe(false);

    const deleteAction = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.action" &&
          (p.data as { action?: { name?: string } })?.action?.name ===
            "delete_customer",
      );
    expect(deleteAction?.data).toMatchObject({
      version: "1.0",
      action: {
        name: "delete_customer",
        surfaceId: "erp_customers",
        context: { customerId: "cust-101" },
      },
    });

    // Delete remaining 4 customers to verify empty directory state.
    for (let i = 0; i < 4; i += 1) {
      await app.press("text:Delete");
      await app.waitFor("text:Confirm Delete");
      await app.press("text:Confirm Delete");
    }
    expect(app.shows("text:Showing 0 of 0 customers (desktop)")).toBe(true);
    expect(app.shows("text:No customers in directory")).toBe(true);
    expect(app.shows("text:Create First Customer")).toBe(true);
  });

  test("renders loading skeleton state, reload transition with manual clock, and server error banner with Retry recovery", async () => {
    // 1. Initial loading skeleton state.
    const loadingApp = await open(APP_ENTRY, {
      platform: "macos",
      width: 1280,
      height: 800,
      host: {
        params: { initialState: "loading" },
        handlers: ERP_HANDLERS,
      },
    });

    expect(loadingApp.shows("text:Loading customers...")).toBe(true);
    expect(loadingApp.shows("text:Fetching customer directory...")).toBe(true);
    expect(loadingApp.shows("text:Cedar Ridge Timber Works")).toBe(false);

    await loadingApp.host.send("a2ui.scenario", { kind: "completeLoading" });
    expect(loadingApp.shows("text:Loading customers...")).toBe(false);
    expect(loadingApp.shows("text:Cedar Ridge Timber Works")).toBe(true);

    // 2. Interactive Reload with manual clock and Simulate Error + Retry recovery.
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 1280,
      height: 800,
      clock: { time: new Date("2026-11-21T10:00:00Z") },
      host: {
        params: { reloadDelayMs: 500 },
        handlers: ERP_HANDLERS,
      },
    });

    await app.press("text:Reload");
    expect(app.shows("text:Refreshing customer directory...")).toBe(true);
    await app.clock!.runFor(600);
    expect(app.shows("text:Refreshing customer directory...")).toBe(false);
    expect(app.shows("text:Customer directory refreshed.")).toBe(true);

    // Simulate server error banner and recover via Retry.
    await app.press("text:Simulate Error");
    expect(app.shows("text:Sync error")).toBe(true);
    expect(app.shows("text:Retry")).toBe(true);
    await app.press("text:Retry");
    expect(app.shows("text:Sync error")).toBe(false);
    expect(
      app.shows("text:Connection restored and customer directory synced."),
    ).toBe(true);

    // Failed save preserves unsaved form edits and allows subsequent retry save.
    await app.clear("label:Name");
    await app.type("label:Name", "Cedar Ridge Holdings");
    await app.host.send("a2ui.scenario", {
      kind: "serverError",
      failNextSave: true,
    });
    await app.press("text:Save Customer");
    expect(app.shows("text:Sync error")).toBe(true);
    expect(app.value("label:Name")).toBe("Cedar Ridge Holdings");

    await app.press("text:Save Customer");
    expect(app.shows("text:Sync error")).toBe(false);
    expect(app.shows("text:Saved changes to Cedar Ridge Holdings.")).toBe(true);
  });

  test("adapts master-detail layout between phone width (390 px compact Column) and desktop width (1280 px Row)", async () => {
    const app = await open(APP_ENTRY, {
      platform: "macos",
      width: 390,
      height: 844,
      host: { handlers: ERP_HANDLERS },
    });

    expect(app.shows("text:Showing 5 of 5 customers (compact)")).toBe(true);
    expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
    expect(app.shows("text:Edit: Cedar Ridge Timber Works")).toBe(true);

    await app.setViewport(1280, 800);
    expect(app.shows("text:Showing 5 of 5 customers (desktop)")).toBe(true);

    await app.setViewport(390, 844);
    expect(app.shows("text:Showing 5 of 5 customers (compact)")).toBe(true);
  });

  test("enforces examples/erp-customers/nsh.json capability sandbox (host a2ui.* allowed; fetch, fs, openUrl, evil host denied with ERR_ACCESS_DENIED)", async () => {
    const app = await open(SANDBOX_ENTRY, {
      platform: "macos",
      width: 1280,
      height: 800,
      host: {
        handlers: {
          ...ERP_HANDLERS,
          "a2ui.probeResult": null,
        },
      },
    });

    // Real ERP Customers surface renders and dispatches a2ui.action under host-only capabilities.
    expect(app.shows("text:ERP Customers")).toBe(true);
    await app.press("label:Select Alder Creek Logistics");
    expect(
      app.host.posts().some((p) => p.name === "a2ui.action"),
    ).toBe(true);

    const probes: ReadonlyArray<{
      readonly id: number;
      readonly probe: ErpSandboxProbeResult["probe"];
      readonly expectedPermission: string;
    }> = [
      { id: 1, probe: "fetch", expectedPermission: "network" },
      { id: 2, probe: "fs", expectedPermission: "fs" },
      { id: 3, probe: "openUrl", expectedPermission: "openUrl" },
      { id: 4, probe: "host", expectedPermission: "host" },
    ];

    for (const item of probes) {
      await app.host.send("a2ui.probe", { id: item.id, probe: item.probe });
      await app.waitUntil(() =>
        app.host.posts().some(
          (p) =>
            p.name === "a2ui.probeResult" &&
            (p.data as { id?: number } | null)?.id === item.id,
        ),
      );
      const reply = app.host.posts().find(
        (p) =>
          p.name === "a2ui.probeResult" &&
          (p.data as { id?: number } | null)?.id === item.id,
      );
      const result = (
        reply?.data as { result?: ErpSandboxProbeResult } | null
      )?.result;
      expect(result).toBeDefined();
      expect(result!.denied).toBe(true);
      expect(result!.code).toBe("ERR_ACCESS_DENIED");
      expect(result!.permission).toBe(item.expectedPermission);
    }

    expect(app.requests()).toEqual([]);
    expect(app.openedUrls()).toEqual([]);
  });
});
