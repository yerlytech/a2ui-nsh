// Walks the fixtures of xlarge's Chart, Calendar, and Conversation (spec 003,
// round 2). No real xlarge screen of these is captured yet, so the fixtures
// are synthetic (`tests/fixtures/xlarge/*-synthetic.json`, `source` says so).
// Each validates strictly against xlarge's catalog through `MessageProcessor`,
// then all three draw together with no errors, and every action they send is
// checked by name and context.

import { describe, expect, open, test } from "nsh/test";
import calendar from "../../../tests/fixtures/xlarge/calendar-synthetic.json";
import chart from "../../../tests/fixtures/xlarge/chart-synthetic.json";
import conversation from "../../../tests/fixtures/xlarge/conversation-synthetic.json";
import { createBasicCatalogRegistry } from "../basic";
import { CatalogRegistry } from "../../core/catalog";
import { MessageProcessor } from "../../core/processor";
import { registerXlargeCatalogComponents } from "./index";
import { HARNESS, XLARGE_CATALOG, reportedErrors, sentActions } from "./test_support";

interface Fixture {
  readonly source: string;
  readonly messages: readonly unknown[];
}

const FIXTURES: Readonly<Record<string, Fixture>> = { chart, calendar, conversation };
const SYNTHETIC = "synthetic, no real xlarge screen yet";

const WORDS: Record<string, string> = {
  "crm.title.pipeline": "Pipeline",
  "crm.chart.by_stage": "By stage",
  "crm.chart.by_month": "Deals by month",
  "crm.stage.won": "Won",
  "crm.stage.open": "Open",
  "crm.stage.lost": "Lost",
  "crm.channel.whatsapp": "WhatsApp",
};

const ALL_MESSAGES: unknown[] = Object.values(FIXTURES).flatMap((fixture) => fixture.messages);

function walkOptions(extra: Record<string, unknown> = {}) {
  return {
    host: {
      params: { catalog: XLARGE_CATALOG, messages: ALL_MESSAGES, translations: WORDS, strictMode: true, ...extra },
      handlers: { "a2ui.action": null, "a2ui.error": null, "a2ui.exception": null },
    },
    platform: "macos" as const,
    width: 1280,
    height: 900,
  };
}

describe("xlarge Chart, Calendar and Conversation fixtures", () => {
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

  test("all three draw together with no errors; a day and a message open their screens", async () => {
    const app = await open(HARNESS, walkOptions());
    expect(reportedErrors(app)).toEqual([]);

    // Chart: the pie's stages and exact total, the bars' months.
    expect(app.shows("id:synthetic.chart:by_stage")).toBe(true);
    expect(app.shows("id:synthetic.chart:by_month")).toBe(true);
    for (const words of ["By stage", "Won", "125,000.10", "Lost", "9,000.00", "Total", "174,000.30"]) {
      expect(app.texts()).toContain(words);
    }
    for (const words of ["Deals by month", "2026-10-01", "1,250"]) {
      expect(app.texts()).toContain(words);
    }
    // Calendar: November 2026, marked days.
    expect(app.texts()).toContain("November 2026");
    expect(app.shows("label:2026-11-24, 5")).toBe(true);
    // Conversation: heading, the other side by name, our side by author.
    for (const words of ["WhatsApp · Acme Logistics", "Is the forklift quote ready?", "Deniz", "2026-11-20 09:40"]) {
      expect(app.texts()).toContain(words);
    }

    await app.press("id:synthetic.calendar:root:day:2026-11-24");
    await app.press("id:synthetic.conversation:root:row:id:m2");
    expect(sentActions(app)).toEqual([
      { name: "screen:crm.day", sourceComponentId: "root", context: { date: "2026-11-24" } },
      { name: "screen:crm.message", sourceComponentId: "root", context: { id: "m2" } },
    ]);

    // Narrow, everything still draws.
    await app.setViewport(390, 844);
    expect(app.shows("id:synthetic.calendar:root:day:2026-11-30")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("in a terminal the charts show as tables and nothing else changes", async () => {
    const app = await open(HARNESS, walkOptions({ terminal: true }));
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:synthetic.chart:by_stage:legend")).toBe(false);
    expect(app.shows("label:Won: 125,000.10")).toBe(true);
    expect(app.shows("label:2026-09-01: 12")).toBe(true);
    expect(app.texts()).toContain("174,000.30");
  });
});
