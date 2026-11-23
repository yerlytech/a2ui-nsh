// Walks the fixtures of xlarge's Text, Toast, Refusal, Image, and QrCode
// (spec 003, round 2). No real xlarge screen of these is captured yet, so the
// fixtures are synthetic (`tests/fixtures/xlarge/*-synthetic.json`, `source`
// says so). Each validates strictly against xlarge's catalog through
// `MessageProcessor`, then all five draw together with no errors, and every
// action they send is checked by name and context.

import { describe, expect, open, test } from "nsh/test";
import image from "../../../tests/fixtures/xlarge/image-synthetic.json";
import qrcode from "../../../tests/fixtures/xlarge/qrcode-synthetic.json";
import refusal from "../../../tests/fixtures/xlarge/refusal-synthetic.json";
import text from "../../../tests/fixtures/xlarge/text-synthetic.json";
import toast from "../../../tests/fixtures/xlarge/toast-synthetic.json";
import { createBasicCatalogRegistry } from "../basic";
import { CatalogRegistry } from "../../core/catalog";
import { MessageProcessor } from "../../core/processor";
import { registerXlargeCatalogComponents } from "./index";
import { HARNESS, XLARGE_CATALOG, reportedErrors, sentActions } from "./test_support";

interface Fixture {
  readonly source: string;
  readonly messages: readonly unknown[];
}

const FIXTURES: Readonly<Record<string, Fixture>> = { text, toast, refusal, image, qrcode };
const SYNTHETIC = "synthetic, no real xlarge screen yet";

const WORDS: Record<string, string> = {
  "crm.title.deal": "Deal",
  "crm.deal.summary": "{partner} owes {amount}",
  "crm.deal.overdue": "Overdue",
  "crm.deal.won": "Won",
  "crm.deal.saved": "Saved {title}",
  "crm.refused.closed_deal": "This deal is closed",
  "crm.refused.reopen_first": "Reopen it first",
  "crm.action.back_to_deals": "Back to deals",
  "crm.title.partner": "Partner",
  "crm.partner.logo": "Partner logo",
  "crm.title.pay": "Pay",
  "crm.pay.scan": "Scan to pay",
  "crm.pay.receipt": "Receipt",
};

const ALL_MESSAGES: unknown[] = Object.values(FIXTURES).flatMap((fixture) => fixture.messages);

describe("xlarge Text, Toast, Refusal, Image and QrCode fixtures", () => {
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

  test("all five draw together with no errors and send only the refusal's way back", async () => {
    const app = await open(HARNESS, {
      host: {
        params: { catalog: XLARGE_CATALOG, messages: ALL_MESSAGES, translations: WORDS, strictMode: true, toastMs: 0 },
        handlers: { "a2ui.action": null, "a2ui.error": null, "a2ui.exception": null },
      },
    });
    expect(reportedErrors(app)).toEqual([]);

    // Text: a filled code, a bound text, a danger tone, and code winning over text.
    for (const words of ["Deal", "acme owes 25000.50", "Call on Monday", "Overdue", "Won"]) {
      expect(app.texts()).toContain(words);
    }
    expect(app.texts().filter((words) => words === "Call on Monday")).toEqual(["Call on Monday"]);
    // Toast: shown once.
    expect(app.texts()).toContain("Saved Forklift fleet");
    await app.press("id:synthetic.toast:saved:dismiss");
    expect(app.shows("id:synthetic.toast:saved")).toBe(false);
    // Image and QrCode: named by their labels; the receipt's src wins.
    expect(app.shows("label:Partner logo")).toBe(true);
    expect(app.shows("label:Scan to pay")).toBe(true);
    expect(app.shows("label:Receipt")).toBe(true);
    expect(app.count("id:synthetic.qrcode:receipt")).toBe(1);
    // Refusal: explains, then goes back.
    expect(app.texts()).toContain("This deal is closed");
    expect(app.texts()).toContain("Reopen it first");
    await app.press("id:synthetic.refusal:root:back");

    expect(sentActions(app)).toEqual([
      { name: "screen:crm.deals", sourceComponentId: "root", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });
});
