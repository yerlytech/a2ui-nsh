// Walks the fixtures of xlarge's Columns, Detail, Metric, and ChequeLeaf
// (spec 003, round 2). No real xlarge screen of these is captured yet, so the
// fixtures are synthetic (`tests/fixtures/xlarge/*-synthetic.json`, `source`
// says so). Each validates strictly against xlarge's catalog through
// `MessageProcessor`, then all four draw together with no errors, and every
// action they send is checked by name and context.

import { describe, expect, open, test } from "nsh/test";
import chequeleaf from "../../../tests/fixtures/xlarge/chequeleaf-synthetic.json";
import columns from "../../../tests/fixtures/xlarge/columns-synthetic.json";
import detail from "../../../tests/fixtures/xlarge/detail-synthetic.json";
import metric from "../../../tests/fixtures/xlarge/metric-synthetic.json";
import { createBasicCatalogRegistry } from "../basic";
import { CatalogRegistry } from "../../core/catalog";
import { MessageProcessor } from "../../core/processor";
import { registerXlargeCatalogComponents } from "./index";
import { HARNESS, XLARGE_CATALOG, reportedErrors, sentActions } from "./test_support";

interface Fixture {
  readonly source: string;
  readonly messages: readonly unknown[];
}

const FIXTURES: Readonly<Record<string, Fixture>> = { columns, detail, metric, chequeleaf };
const SYNTHETIC = "synthetic, no real xlarge screen yet";

const WORDS: Record<string, string> = {
  "crm.title.deal": "Deal",
  "crm.title.partner": "Partner",
  "crm.field.title": "Title",
  "crm.field.amount": "Amount",
  "crm.field.stage": "Stage",
  "crm.field.closes": "Closes",
  "crm.field.note": "Note",
  "crm.stage.won": "Won",
  "crm.kpi.revenue": "Revenue",
  "crm.kpi.complaints": "Complaints",
  "crm.kpi.this_month": "This month",
  "fin.title.cheque": "Cheque",
  "fin.cheque.state.portfolio": "In portfolio",
  "fin.cheque.state.endorsed": "Endorsed",
  "fin.cheque.state.collected": "Collected",
};

const ALL_MESSAGES: unknown[] = Object.values(FIXTURES).flatMap((fixture) => fixture.messages);

describe("xlarge Columns, Detail, Metric and ChequeLeaf fixtures", () => {
  test("each fixture is synthetic and validates strictly against xlarge's catalog", () => {
    const drawn = registerXlargeCatalogComponents(createBasicCatalogRegistry());
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      expect(fixture.source).toBe(SYNTHETIC);
      const registry = CatalogRegistry.withBasicV1();
      registry.registerInline(XLARGE_CATALOG);
      const run = new MessageProcessor({ registry, strictMode: true });
      run.processMessages(fixture.messages);
      const surface = run.getSurface(`synthetic.${name}`);
      expect(surface?.defaultCatalogId).toBe("tech.yerly.xlarge/v1");
      for (const component of surface?.components.values() ?? []) {
        expect(drawn.has(component.catalogId, component.type)).toBe(true);
      }
    }
  });

  test("all four draw together with no errors and send only the detail's edit", async () => {
    const app = await open(HARNESS, {
      host: {
        params: { catalog: XLARGE_CATALOG, messages: ALL_MESSAGES, translations: WORDS, strictMode: true },
        handlers: { "a2ui.action": null, "a2ui.error": null, "a2ui.exception": null },
      },
      platform: "macos",
      width: 1280,
      height: 900,
    });
    expect(reportedErrors(app)).toEqual([]);

    // Columns: side by side on a wide window, two-to-one.
    expect(app.shows("id:synthetic.columns:root:side")).toBe(true);
    for (const words of ["Forklift fleet for the new depot", "Acme Logistics"]) {
      expect(app.texts()).toContain(words);
    }
    // Detail: labelled, formatted, the empty note skipped.
    for (const words of ["Title", "Forklift fleet", "25,000.50", "Won", "2026-12-15"]) {
      expect(app.texts()).toContain(words);
    }
    expect(app.shows("id:synthetic.detail:deal:row:note")).toBe(false);
    // Metric: formatted from text, changes with their arrows.
    for (const words of ["Revenue", "1,250,000.50", "▲ +12.50", "This month", "Complaints", "1,204", "▲ +4"]) {
      expect(app.texts()).toContain(words);
    }
    // ChequeLeaf: states through translate.
    for (const words of ["In portfolio", "Endorsed", "Collected", "15,000.00", "to supplier"]) {
      expect(app.texts()).toContain(words);
    }

    await app.press("id:synthetic.detail:deal:update");
    expect(sentActions(app)).toEqual([
      { name: "crm.deal.update", sourceComponentId: "deal", context: { id: "deal-7" } },
    ]);

    // Narrow, the columns stack and everything still draws.
    await app.setViewport(390, 844);
    expect(app.shows("id:synthetic.columns:root:stacked")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });
});
