// Walks the fixtures of xlarge's Chart, Calendar, and Conversation (spec 003,
// round 2), each built from the xlarge screen that uses it: the samples'
// charts (`lab_samples/surfaces/figures.toml`), the month of dated things
// (`platform/surfaces/calendar.toml`), and a sample's conversation
// (`lab_samples/surfaces/sample.toml`), with data in the shapes their reads
// answer. Each validates strictly against xlarge's catalog through
// `MessageProcessor`, then all three draw together with no errors, and every
// action they send is checked by name and context against what xlarge's
// server reads.

import { describe, expect, open, test } from "nsh/test";
import calendar from "../../../tests/fixtures/xlarge/calendar-month.json";
import figures from "../../../tests/fixtures/xlarge/lab-samples-figures.json";
import talk from "../../../tests/fixtures/xlarge/lab-samples-sample-talk.json";
import { createBasicCatalogRegistry } from "../basic";
import { CatalogRegistry } from "../../core/catalog";
import { MessageProcessor } from "../../core/processor";
import { registerXlargeCatalogComponents } from "./index";
import { HARNESS, XLARGE_CATALOG, reportedErrors, sentActions } from "./test_support";

interface Fixture {
  readonly source: string;
  readonly messages: readonly unknown[];
}

const FIXTURES: Readonly<Record<string, { readonly fixture: Fixture; readonly toml: string }>> = {
  "lab_samples.figures_card": { fixture: figures, toml: "lab_samples/surfaces/figures.toml" },
  "calendar.month": { fixture: calendar, toml: "platform/surfaces/calendar.toml" },
  "lab_samples.sample": { fixture: talk, toml: "lab_samples/surfaces/sample.toml" },
};

const WORDS: Record<string, string> = {
  "lab_samples.metric.received_14_days": "Received, last 14 days",
  "lab_samples.title.by_state_14_days": "By state, last 14 days",
  "lab_samples.sample_state.received": "Received",
  "lab_samples.sample_state.completed": "Completed",
  "lab_samples.sample_state.disposed": "Disposed",
  "lab_samples.sample_state.rejected": "Rejected",
  "calendar.everything": "Everything",
  "calendar.field.showing": "Showing",
  "calendar.action.previous": "Previous month",
  "calendar.action.next": "Next month",
  "calendar.could_not_read": "{what} could not be read",
  "calendar.nothing": "Nothing this month",
  "work_orders.calendar.job": "Jobs",
  "events.calendar.event": "Events",
  "deadlines.calendar.deadline": "Deadlines",
  "calibration.calendar.due": "Calibrations",
  "talk.you": "You",
  "talk.former": "A former colleague",
  "talk.taken_back_line": "This message was taken back",
  "talk.take_back": "Take back",
  "talk.react": "{emoji} ({count})",
  "talk.write_here": "Write here",
  "talk.send": "Send",
  "talk.tell": "Tell",
  "talk.tell_hint": "Tell these colleagues",
};

const ALL_MESSAGES: unknown[] = Object.values(FIXTURES).flatMap(({ fixture }) => fixture.messages);

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
  test("each fixture names its xlarge screen and validates strictly against xlarge's catalog", () => {
    const drawn = registerXlargeCatalogComponents(createBasicCatalogRegistry());
    for (const [surfaceId, { fixture, toml }] of Object.entries(FIXTURES)) {
      expect(fixture.source).toContain(toml);
      const registry = CatalogRegistry.withBasicV1();
      registry.registerInline(XLARGE_CATALOG);
      const run = new MessageProcessor({ registry, strictMode: true });
      run.processMessages(fixture.messages);
      const surface = run.getSurface(surfaceId);
      expect(surface?.defaultCatalogId).toBe("tech.yerly.xlarge/v1");
      for (const component of surface?.components.values() ?? []) {
        expect(drawn.has(component.catalogId, component.type)).toBe(true);
      }
    }
  });

  test("the samples' charts: a sparkline's exact total and a donut's states", async () => {
    const app = await open(HARNESS, walkOptions());
    expect(reportedErrors(app)).toEqual([]);
    // The sparkline's big figure is the sum of fourteen days, grouped.
    expect(app.shows("id:lab_samples.figures_card:received:headline")).toBe(true);
    for (const words of ["1,302", "Received, last 14 days", "By state, last 14 days"]) {
      expect(app.texts()).toContain(words);
    }
    expect(app.shows("label:Completed: 1,278")).toBe(true);
    expect(app.shows("label:Rejected: 0")).toBe(true);
    expect(app.shows("id:lab_samples.figures_card:by_state:legend")).toBe(true);
    // A sparkline has no legend of its points.
    expect(app.shows("id:lab_samples.figures_card:received:legend")).toBe(false);
  });

  test("the month: items open their screens, months are read again, the filter narrows", async () => {
    const app = await open(HARNESS, walkOptions());
    expect(reportedErrors(app)).toEqual([]);
    for (const words of ["November 2026", "Boiler service", "09:30", "Quality audit", "VAT return", "Calibrations could not be read", "Jobs (1)"]) {
      expect(app.texts()).toContain(words);
    }
    expect(app.shows("label:2026-11-24 09:30 Boiler service")).toBe(true);
    await app.press("id:calendar.month:month:item:01JWO1");
    await app.press("id:calendar.month:month:previous");
    await app.press("id:calendar.month:month:next");
    // The filter is the client's own: nothing is sent.
    await app.press("id:calendar.month:month:filter:events");
    expect(app.texts()).toContain("Quality audit");
    expect(app.texts()).not.toContain("Boiler service");
    await app.press("id:calendar.month:month:filter:all");
    expect(app.texts()).toContain("Boiler service");
    expect(sentActions(app).filter((sent) => sent.sourceComponentId === "month")).toEqual([
      { name: "screen:work_orders.order", sourceComponentId: "month", context: { id: "01JWO1" } },
      {
        name: "screen:calendar.month",
        sourceComponentId: "month",
        context: { period: "between", from: "2026-10-01", to: "2026-10-31" },
      },
      {
        name: "screen:calendar.month",
        sourceComponentId: "month",
        context: { period: "between", from: "2026-12-01", to: "2026-12-31" },
      },
    ]);
  });

  test("the sample's conversation: oldest first, seen, written, reacted on and taken back", async () => {
    const app = await open(HARNESS, walkOptions());
    expect(reportedErrors(app)).toEqual([]);
    const texts = app.texts();
    const order = [
      "Received at the front desk.",
      "Is S-0012 in the fridge?",
      "Yes, the pH run starts at noon.",
      "This message was taken back",
    ].map((words) => texts.indexOf(words));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const words of ["A former colleague · 2026-11-19 16:05", "Ece Yılmaz · 2026-11-20 09:15", "You · 2026-11-20 09:40"]) {
      expect(texts).toContain(words);
    }
    const id = "id:lab_samples.sample:talk";
    // Unread: marked read on its own, once.
    expect(sentActions(app)).toContainEqual({
      name: "talk.seen",
      sourceComponentId: "talk",
      context: { id: "r_sample_01JSAMPLE7" },
    });

    await app.press(`${id}:message:id:01JM1:react:✅`);
    await app.press(`${id}:message:id:01JM2:take_back`);
    await app.press(`${id}:message:id:01JM2:ask:yes`);
    await app.type(`${id}:text`, "Moved to fridge 2.");
    await app.press(`${id}:tell`);
    await app.press(`${id}:person:01JUSER3`);
    await app.press(`${id}:send`);

    const again = { name: "screen:lab_samples.sample", sourceComponentId: "talk", context: { id: "01JSAMPLE7" } };
    expect(sentActions(app).filter((sent) => sent.sourceComponentId === "talk")).toEqual([
      { name: "talk.seen", sourceComponentId: "talk", context: { id: "r_sample_01JSAMPLE7" } },
      {
        name: "talk.react_on",
        sourceComponentId: "talk",
        context: { kind: "sample", id: "01JSAMPLE7", message: "01JM1", emoji: "✅" },
      },
      again,
      { name: "talk.take_back", sourceComponentId: "talk", context: { id: "01JM2" } },
      again,
      {
        name: "talk.write",
        sourceComponentId: "talk",
        context: {
          kind: "sample",
          id: "01JSAMPLE7",
          screen: "lab_samples.sample",
          label: "S-0012",
          text: "Moved to fridge 2.",
          tell: ["01JUSER3"],
        },
      },
      again,
    ]);
    // Sent: the box is empty again.
    expect(app.texts()).not.toContain("Moved to fridge 2.");
    expect(reportedErrors(app)).toEqual([]);
  });

  test("narrow and in a terminal everything still draws; charts show as tables", async () => {
    const app = await open(HARNESS, walkOptions({ terminal: true }));
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:lab_samples.figures_card:by_state:legend")).toBe(false);
    expect(app.shows("label:Completed: 1,278")).toBe(true);
    expect(app.texts()).toContain("1,302");
    await app.setViewport(390, 844);
    expect(app.shows("id:calendar.month:month:day:2026-11-30")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });
});
