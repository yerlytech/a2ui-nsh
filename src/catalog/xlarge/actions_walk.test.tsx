// Walks the fixtures of xlarge's Button, Confirm, and Preview (spec 003,
// round 2). No real xlarge screen of these is captured yet, so the fixtures
// are synthetic (`tests/fixtures/xlarge/*-synthetic.json`, `source` says so).
// Each validates strictly against xlarge's catalog through `MessageProcessor`,
// then all three draw together with no errors, and every action they send is
// checked by name and context.

import { describe, expect, open, test } from "nsh/test";
import button from "../../../tests/fixtures/xlarge/button-synthetic.json";
import confirm from "../../../tests/fixtures/xlarge/confirm-synthetic.json";
import preview from "../../../tests/fixtures/xlarge/preview-synthetic.json";
import { createBasicCatalogRegistry } from "../basic";
import { CatalogRegistry } from "../../core/catalog";
import { MessageProcessor } from "../../core/processor";
import { registerXlargeCatalogComponents } from "./index";
import { HARNESS, XLARGE_CATALOG, reportedErrors, sentActions } from "./test_support";

interface Fixture {
  readonly source: string;
  readonly messages: readonly unknown[];
}

const FIXTURES: Readonly<Record<string, Fixture>> = { button, confirm, preview };
const SYNTHETIC = "synthetic, no real xlarge screen yet";

const WORDS: Record<string, string> = {
  "crm.title.deal": "Deal",
  "crm.action.win": "Win {title}",
  "crm.action.drop": "Drop",
  "crm.ask.close_deal": "Close this deal?",
  "crm.action.close": "Close it",
  "crm.preview.deal": "New deal",
  "crm.field.title": "Title",
  "crm.field.amount": "Amount",
  "crm.action.keep": "Keep",
};

const ALL_MESSAGES: unknown[] = Object.values(FIXTURES).flatMap((fixture) => fixture.messages);

describe("xlarge Button, Confirm and Preview fixtures", () => {
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

  test("all three draw together with no errors and send exactly their actions", async () => {
    const app = await open(HARNESS, {
      host: {
        params: { catalog: XLARGE_CATALOG, messages: ALL_MESSAGES, translations: WORDS, strictMode: true },
        handlers: { "a2ui.action": null, "a2ui.error": null, "a2ui.exception": null },
      },
    });
    expect(reportedErrors(app)).toEqual([]);
    for (const words of ["Deal", "Win Forklift fleet", "Drop", "crm.action.save", "Close this deal?", "Close it", "Cancel", "imports.ask.drop_job", "New deal", "Forklift fleet", "25,000.50", "Keep"]) {
      expect(app.texts()).toContain(words);
    }

    // Button: sends at once with its literal context.
    await app.press("id:synthetic.button:win");
    // Button with confirm: asks, cancel sends nothing, yes sends.
    await app.press("id:synthetic.button:drop");
    expect(app.shows("id:synthetic.button:drop:ask")).toBe(true);
    await app.press("id:synthetic.button:drop:ask:cancel");
    await app.press("id:synthetic.button:drop");
    await app.press("id:synthetic.button:drop:ask:yes");
    // Button with a bound context and version: reads the data model, then follows after.
    await app.press("id:synthetic.button:save");
    // Confirm: yes sends, follows after, and closes the question.
    await app.press("id:synthetic.confirm:close:yes");
    expect(app.shows("id:synthetic.confirm:close")).toBe(false);
    // Confirm: cancel is an action; it sends it and closes.
    await app.press("id:synthetic.confirm:drop_job:cancel");
    expect(app.shows("id:synthetic.confirm:drop_job")).toBe(false);
    // Preview with confirm: accept asks, yes sends.
    await app.press("id:synthetic.preview:root:accept");
    await app.press("id:synthetic.preview:root:ask:yes");

    expect(sentActions(app)).toEqual([
      { name: "crm.win_deal", sourceComponentId: "win", context: { id: "d1", amount: "25000.50" } },
      { name: "crm.drop_deal", sourceComponentId: "drop", context: { id: "d1" } },
      { name: "crm.deal.save", sourceComponentId: "save", context: { id: "d1", source: "web", version: 3 } },
      { name: "screen:crm.deals", sourceComponentId: "save", context: {} },
      { name: "crm.close_deal", sourceComponentId: "close", context: {} },
      { name: "screen:crm.deals", sourceComponentId: "close", context: {} },
      { name: "screen:imports.jobs", sourceComponentId: "drop_job", context: {} },
      { name: "crm.keep_deal", sourceComponentId: "root", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });
});
