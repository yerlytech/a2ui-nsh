import { describe, expect, open, test } from "nsh/test";
import { HARNESS, harnessOptions, reportedErrors, surfaceMessages } from "./test_support";

// The shapes of xlarge's lab_samples/surfaces/figures.toml and of the rows
// lab_samples.figures answers.
const WORDS = {
  "lab_samples.metric.received_14_days": "Received",
  "lab_samples.title.by_state_14_days": "By state",
  "lab_samples.sample_state.received": "Received",
  "lab_samples.sample_state.completed": "Completed",
  "lab_samples.sample_state.rejected": "Rejected",
  "chart.nothing": "Nothing to show",
};

const BY_STATE = [
  { label: "received", value: 21 },
  { label: "completed", value: 1278 },
  { label: "rejected", value: 0 },
];

const BY_DAY = [
  { label: "2026-11-22", value: 4 },
  { label: "2026-11-23", value: "0" },
  { label: "2026-11-24", value: 1250 },
];

function donut(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "root",
    component: "Chart",
    kind: "donut",
    data: { "@path": "/byState" },
    label: "lab_samples.title.by_state_14_days",
    labelPrefix: "lab_samples.sample_state.",
    tones: { received: "info", completed: "success", rejected: "danger" },
    ...extra,
  };
}

function sparkline(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "root",
    component: "Chart",
    kind: "sparkline",
    data: { "@path": "/byDay" },
    label: "lab_samples.metric.received_14_days",
    labelFormat: "date",
    ...extra,
  };
}

describe("xlarge catalog Chart", () => {
  test("a donut lists its translated states with their numbers", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_chart", [donut()], { byState: BY_STATE }), WORDS),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_chart:root")).toBe(true);
    expect(app.texts()).toEqual(["By state", "Received", "21", "Completed", "1,278", "Rejected", "0"]);
    expect(app.shows("label:Received: 21, Completed: 1,278, Rejected: 0")).toBe(true);

    // The data model drives it.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_chart", path: "/byState/2/value", value: 3 },
    });
    expect(app.shows("label:Rejected: 3")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("a sparkline shows the last value, or with sum the exact total, and no legend", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        [
          ...surfaceMessages("s_last", [sparkline()], { byDay: BY_DAY }),
          ...surfaceMessages("s_sum", [sparkline({ sum: true })], { byDay: BY_DAY }),
        ],
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_last:root")).toBe(true);
    expect(app.shows("label:2026-11-22: 4, 2026-11-23: 0, 2026-11-24: 1,250")).toBe(true);
    expect(app.shows("id:s_last:root:legend")).toBe(false);
    expect(app.shows("id:s_last:root:headline")).toBe(true);
    expect(app.texts()).toEqual(["1,250", "Received", "1,254", "Received"]);
  });

  test("bars and a line draw too; money is shown from its caption; no points says so", async () => {
    const money = [
      { label: "2026-10", value: 99999999999999999, caption: "999999999999999.99" },
      { label: "2026-11", value: 125010, caption: "1250.10" },
    ];
    const app = await open(
      HARNESS,
      harnessOptions(
        [
          ...surfaceMessages("s_bars", [{ id: "root", component: "Chart", kind: "bars", format: "money", data: { "@path": "/money" } }], { money }),
          ...surfaceMessages("s_line", [donut({ kind: "line" })], { byState: BY_STATE }),
          ...surfaceMessages("s_none", [donut()], { byState: [{ label: "received", value: "n/a" }] }),
        ],
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_bars:root")).toBe(true);
    expect(app.shows("label:2026-10: 999,999,999,999,999.99")).toBe(true);
    expect(app.shows("label:2026-11: 1,250.10")).toBe(true);
    expect(app.shows("id:s_line:root")).toBe(true);
    expect(app.shows("id:s_none:root")).toBe(false);
    expect(app.shows("id:s_none:root:empty")).toBe(true);
    expect(app.texts()).toContain("Nothing to show");
  });

  test("in a terminal the points show as a table, with no drawing", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_tui", [donut()], { byState: BY_STATE }), WORDS, { terminal: true }),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_tui:root")).toBe(true);
    expect(app.shows("id:s_tui:root:legend")).toBe(false);
    expect(app.shows("label:Completed: 1,278")).toBe(true);
    expect(app.texts()).toEqual(["By state", "Received", "21", "Completed", "1,278", "Rejected", "0"]);
  });
});
