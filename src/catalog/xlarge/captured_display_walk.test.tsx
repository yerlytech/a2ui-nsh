// Walks four real xlarge screens, captured on 2026-11-24 from xlarge's test
// `one_real_screen_shows_each_component_of_the_catalog` (xlarge a0939a12,
// seeded test data): `lab_results.performance` (Card, Text, Table, Form,
// Field, Metric, Chart), `lab_samples.sample` (Detail, Columns,
// Conversation), `bank.cheque_book` (ChequeLeaf) and `calendar.month`
// (Calendar). Each fixture keeps the capture's `source` line and messages; the
// catalog is xlarge's, registered by the host. Every screen validates
// strictly, draws with no error and no unknown component, and shows the facts
// its data carries.

import { describe, expect, open, test } from "nsh/test";
import cheque from "../../../tests/fixtures/xlarge/bank-cheque-book-captured.json";
import calendar from "../../../tests/fixtures/xlarge/calendar-month-captured.json";
import performance from "../../../tests/fixtures/xlarge/lab-results-performance-captured.json";
import sample from "../../../tests/fixtures/xlarge/lab-samples-sample-captured.json";
import { createBasicCatalogRegistry } from "../basic";
import { CatalogRegistry } from "../../core/catalog";
import { MessageProcessor } from "../../core/processor";
import { registerXlargeCatalogComponents } from "./index";
import { HARNESS, XLARGE_CATALOG, reportedErrors, sentActions } from "./test_support";

interface Fixture {
  readonly source: string;
  readonly messages: readonly unknown[];
}

const SCREENS: Readonly<Record<string, { readonly fixture: Fixture; readonly uses: readonly string[] }>> = {
  "lab_results.performance": {
    fixture: performance,
    uses: ["Button", "Card", "Chart", "Field", "Form", "Metric", "Table", "Text"],
  },
  "lab_samples.sample": {
    fixture: sample,
    uses: ["Button", "Card", "Columns", "Conversation", "Detail", "Field", "Form", "Table"],
  },
  "bank.cheque_book": { fixture: cheque, uses: ["Card", "ChequeLeaf", "Field", "Form", "Table"] },
  "calendar.month": { fixture: calendar, uses: ["Calendar", "Card"] },
};

const WORDS: Record<string, string> = {
  "lab_results.title.performance": "Lab performance",
  "lab_results.text.performance_cut": "Only the first rows are counted",
  "lab_results.metric.reported": "Reported",
  "lab_results.metric.average_hours": "Average hours",
  "lab_results.metric.on_time_share": "On time",
  "lab_results.metric.on_time_share_hint": "Of results with a due day",
  "lab_results.metric.overdue_now": "Overdue now",
  "lab_results.title.turnaround_by_week": "Turnaround by week",
  "lab_results.title.analysts": "Analysts",
  "lab_results.field.analyst_name": "Analyst",
  "lab_results.title.methods": "Methods",
  "lab_results.field.average_hours": "Average hours",
  "lab_results.title.weeks": "Weeks",
  "lab_results.field.week": "Week",
  "lab_results.verdict.no_spec": "No spec",
  "lab_results.state.approved": "Approved",
  "period.field.period": "Period",
  "period.preset.this_month": "This month",
  "period.action.show": "Show",
  "lab_samples.title.details": "Details",
  "lab_samples.field.partner": "Customer",
  "lab_samples.field.request": "Request",
  "lab_samples.field.source": "Source",
  "lab_samples.source.customer": "Customer brought it",
  "lab_samples.field.portion": "Portion",
  "lab_samples.portion.primary": "Primary",
  "lab_samples.field.received_at": "Received",
  "lab_samples.field.stored_at": "Stored at",
  "lab_samples.field.priority": "Priority",
  "lab_samples.priority.normal": "Normal",
  "lab_samples.field.opinion": "Opinion",
  "lab_samples.custody.received": "Received",
  "audit.action.lab_results.approve": "Approved a result",
  "fields.title.own": "Own fields",
  "talk.title": "Conversation",
  "talk.you": "You",
  "bank.title.cheque_book": "Cheque book",
  "bank.cheque_leaf_state.void": "VOID",
  "calendar.title.month": "Calendar",
  "calendar.everything": "Everything",
  "company_events.calendar.event": "Events",
  "attendance.calendar.leave": "Leave",
  "attendance.calendar.shift": "Shifts",
  "project.calendar.deadline": "Deadlines",
  "project.calendar.task": "Tasks",
};

const ALL_MESSAGES: unknown[] = Object.values(SCREENS).flatMap(({ fixture }) => fixture.messages);

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

describe("xlarge's captured display screens (2026-11-24)", () => {
  test("each fixture is a real capture and validates strictly; every component has a renderer", () => {
    const drawn = registerXlargeCatalogComponents(createBasicCatalogRegistry());
    for (const [surfaceId, { fixture, uses }] of Object.entries(SCREENS)) {
      expect(fixture.source).toBe(
        `xlarge, one_real_screen_shows_each_component_of_the_catalog, screen:${surfaceId}, a0939a12, 2026-11-24`,
      );
      const registry = CatalogRegistry.withBasicV1();
      registry.registerInline(XLARGE_CATALOG);
      const run = new MessageProcessor({ registry, strictMode: true });
      run.processMessages(fixture.messages);
      const surface = run.getSurface(surfaceId);
      expect(surface?.defaultCatalogId).toBe("tech.yerly.xlarge/v1");
      const types = new Set<string>();
      for (const component of surface?.components.values() ?? []) {
        types.add(component.type);
        expect(drawn.has(component.catalogId, component.type)).toBe(true);
      }
      expect([...types].sort()).toEqual([...uses]);
    }
  });

  test("lab_results.performance: metrics, chart, tables and the period form as sent", async () => {
    const app = await open(HARNESS, walkOptions());
    expect(reportedErrors(app)).toEqual([]);
    const id = "id:lab_results.performance";
    expect(app.texts()).toContain("Lab performance");

    // Text: `when` is bound to `/performance/cut`, false here, so it is not drawn.
    expect(app.shows(`${id}:cut`)).toBe(false);
    expect(app.texts()).not.toContain("Only the first rows are counted");

    // Metric: values formatted from their text by `format`. The capture sends
    // no `change`, so no arrow and no "vs before" line is drawn.
    for (const words of ["Reported", "Average hours", "Overdue now", "On time", "Of results with a due day"]) {
      expect(app.texts()).toContain(words);
    }
    expect(app.texts()).toContain("2");
    expect(app.texts()).toContain("0.00");
    for (const metric of ["reported", "average", "median", "p90", "on_time", "overdue"]) {
      expect(app.shows(`${id}:${metric}`)).toBe(true);
      expect(app.shows(`${id}:${metric}:change`)).toBe(false);
    }
    // `onTimeShare` is null: an empty value, no error.
    expect(app.shows(`${id}:on_time:value`)).toBe(true);

    // Chart: a line of one listed point, its label shown as a date and its
    // value as a decimal.
    expect(app.texts()).toContain("Turnaround by week");
    expect(app.shows(`${id}:trend:legend`)).toBe(true);
    expect(app.shows("label:2026-11-23: 0.00")).toBe(true);

    // Tables: one analyst, no instrument, one method, one week.
    expect(app.shows(`${id}:analysts:row:at:0`)).toBe(true);
    expect(app.shows(`${id}:analysts:row:at:1`)).toBe(false);
    expect(app.shows(`${id}:instruments:empty`)).toBe(true);
    expect(app.shows(`${id}:methods:row:at:0`)).toBe(true);
    expect(app.shows(`${id}:weeks:row:at:0`)).toBe(true);
    for (const words of ["owner@example.com", "COND", "Conductivity", "2026-11-23"]) {
      expect(app.texts()).toContain(words);
    }

    // Form + Field: the period form sends its bound defaults as they came.
    await app.press(`${id}:when:submit`);
    expect(sentActions(app)).toEqual([
      {
        name: "screen:lab_results.performance",
        sourceComponentId: "when",
        context: { period: "this_month", from: "2026-11-01", to: "2026-11-24" },
      },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("lab_samples.sample: details beside notes, the record's conversation", async () => {
    const app = await open(HARNESS, walkOptions());
    expect(reportedErrors(app)).toEqual([]);
    const id = "id:lab_samples.sample";
    expect(app.texts()).toContain("S-000002");
    expect(app.texts()).toContain("Well water");

    // Columns: the details and the notes beside them on a wide window.
    expect(app.shows(`${id}:sides:side`)).toBe(true);
    expect(app.shows(`${id}:details`)).toBe(true);
    expect(app.shows(`${id}:notes_read`)).toBe(true);

    // Detail (`skipEmpty`): the filled rows, enums translated, the datetime cut
    // to minutes; the empty ones left out.
    for (const words of ["Customer", "Acme Kimya", "REQ-000002", "Customer brought it", "Primary", "2026-11-24 10:31", "Fridge 2", "Normal"]) {
      expect(app.texts()).toContain(words);
    }
    for (const field of ["partnerName", "requestCode", "source", "sampledBy", "portion", "receivedAt", "storedAt", "priority"]) {
      expect(app.shows(`${id}:details:row:${field}`)).toBe(true);
    }
    for (const field of ["matrix", "quantity", "dueOn", "lotCode", "rejectionReason"]) {
      expect(app.shows(`${id}:details:row:${field}`)).toBe(false);
    }
    // Detail without `skipEmpty`: every row, an empty one read as `—`.
    expect(app.shows(`${id}:notes_read:row:opinion`)).toBe(true);
    expect(app.shows("label:Opinion: ")).toBe(true);
    // A `Card` whose `when` (`/custom/any`) holds nothing is not drawn.
    expect(app.shows(`${id}:own_fields`)).toBe(false);

    // Tables: custody, history (codes translated through `enumPrefix: ""`),
    // and the results with the verdict's and state's words.
    expect(app.shows(`${id}:table:row:id:01M86HRWQY61YTDH6PBJGSWNH7`)).toBe(true);
    expect(app.texts()).toContain("Approved a result");
    expect(app.shows(`${id}:history:row:id:01M86HRWR7FAP2TETBHHFAC9S7`)).toBe(true);
    for (const words of ["Conductivity", "7.20", "No spec", "Approved"]) {
      expect(app.texts()).toContain(words);
    }

    // Conversation: two messages, oldest first, both mine; read already, so
    // nothing is marked seen.
    const texts = app.texts();
    const asked = texts.indexOf("Is the bottle sealed?");
    const answered = texts.indexOf("Sealed, in fridge 2.");
    expect(asked).toBeGreaterThanOrEqual(0);
    expect(answered).toBeGreaterThan(asked);
    expect(texts).toContain("You · 2026-11-24 10:31");
    expect(sentActions(app)).toEqual([]);

    await app.press(`${id}:talk:message:id:01M86HRZ62R2EKHC41KAW5AZB8:react:👍`);
    expect(sentActions(app)).toEqual([
      {
        name: "talk.react_on",
        sourceComponentId: "talk",
        context: { kind: "sample", id: "01M86HRWQY61YTDH6PBJGSWNH6", message: "01M86HRZ62R2EKHC41KAW5AZB8", emoji: "👍" },
      },
      { name: "screen:lab_samples.sample", sourceComponentId: "talk", context: { id: "01M86HRWQY61YTDH6PBJGSWNH6" } },
    ]);

    // Narrow, the columns stack.
    await app.setViewport(390, 844);
    expect(app.shows(`${id}:sides:stacked`)).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("bank.cheque_book: one printed leaf, its amount as the server wrote it", async () => {
    const app = await open(HARNESS, walkOptions());
    expect(reportedErrors(app)).toEqual([]);
    const id = "id:bank.cheque_book:leaves";
    for (const words of ["Cheque book", "Main", "Ziraat"]) {
      expect(app.texts()).toContain(words);
    }
    const leaf = "id:01M86HRZWDRNHR3R9W94DSX6GP";
    expect(app.shows(`${id}:leaf:${leaf}`)).toBe(true);
    expect(app.texts()).toContain("100");
    expect(app.texts()).toContain("2026-11-24");
    expect(app.texts()).toContain("100 TRY");
    expect(app.texts()).toContain("one hundred lira and zero kuruş");
    // Printed, not void; empty payee and memo, and no stub (`null`).
    expect(app.shows(`${id}:void:${leaf}`)).toBe(false);
    expect(app.shows(`${id}:payee:${leaf}`)).toBe(false);
    expect(app.shows(`${id}:memo:${leaf}`)).toBe(false);
    expect(app.shows(`${id}:stub:${leaf}`)).toBe(false);
    expect(app.shows(`${id}:leaf:at:1`)).toBe(false);
  });

  test("calendar.month: November 2026 in five weeks, an item opens its screen with { id }", async () => {
    const app = await open(HARNESS, walkOptions());
    expect(reportedErrors(app)).toEqual([]);
    const id = "id:calendar.month:month";
    expect(app.texts()).toContain("November 2026");
    for (const day of ["2026-11-01", "2026-11-24", "2026-11-30"]) {
      expect(app.shows(`${id}:day:${day}`)).toBe(true);
    }
    expect(app.shows(`${id}:day:2026-11-31`)).toBe(false);
    for (const words of ["Fire drill", "09:00", "Open day", "14:00", "Events (2)", "Leave (0)", "Shifts (0)"]) {
      expect(app.texts()).toContain(words);
    }
    expect(app.shows("label:2026-11-24 09:00 Fire drill")).toBe(true);

    await app.press(`${id}:item:01M86HRZZ6R4XN2VN2QZ3ST13P`);
    await app.press(`${id}:next`);
    expect(sentActions(app)).toEqual([
      { name: "screen:company_events.event", sourceComponentId: "month", context: { id: "01M86HRZZ6R4XN2VN2QZ3ST13P" } },
      {
        name: "screen:calendar.month",
        sourceComponentId: "month",
        context: { period: "between", from: "2026-12-01", to: "2026-12-31" },
      },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });
});
