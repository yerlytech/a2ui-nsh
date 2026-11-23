import { describe, expect, open, test } from "nsh/test";
import { HARNESS, harnessOptions, reportedErrors, surfaceMessages } from "./test_support";

const WORDS = {
  "crm.chart.by_stage": "By stage",
  "crm.stage.won": "Won",
  "crm.stage.open": "Open",
  "crm.stage.lost": "Lost",
};

const BY_STAGE = [
  { label: "won", value: "125000.10" },
  { label: "open", value: "40000.20" },
  { label: "lost", value: "9000" },
];

function chart(kind: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "root",
    component: "Chart",
    kind,
    data: { "@path": "/byStage" },
    format: "money",
    label: "crm.chart.by_stage",
    labelPrefix: "crm.stage.",
    ...extra,
  };
}

describe("xlarge catalog Chart", () => {
  test("draws a pie with a legend of formatted values and an exact total", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_chart", [chart("pie", { sum: true, tones: { won: "good" } })], { byStage: BY_STAGE }),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_chart:root")).toBe(true);
    expect(app.texts()).toEqual([
      "By stage",
      "Won",
      "125,000.10",
      "Open",
      "40,000.20",
      "Lost",
      "9,000.00",
      "Total",
      "174,000.30",
    ]);
    expect(app.shows("label:By stage, Won: 125,000.10, Open: 40,000.20, Lost: 9,000.00, Total: 174,000.30")).toBe(true);
    expect(app.shows("label:Won: 125,000.10")).toBe(true);

    // The data model drives it: a new value redraws, and the total follows exactly.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_chart", path: "/byStage/2/value", value: "0.1" },
    });
    expect(app.texts()).toContain("0.10");
    expect(app.texts()).toContain("165,000.40");
    expect(reportedErrors(app)).toEqual([]);
  });

  test("bar and line draw too; no sum shows no total; empty data says so", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        [
          ...surfaceMessages("s_bar", [chart("bar")], { byStage: BY_STAGE }),
          ...surfaceMessages("s_line", [chart("line")], { byStage: BY_STAGE }),
          ...surfaceMessages("s_none", [chart("bar")], { byStage: [] }),
        ],
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_bar:root")).toBe(true);
    expect(app.shows("id:s_line:root")).toBe(true);
    expect(app.shows("id:s_bar:root:total")).toBe(false);
    expect(app.shows("id:s_none:root")).toBe(false);
    expect(app.shows("id:s_none:root:empty")).toBe(true);
    expect(app.texts()).toContain("No rows");
  });

  test("in a terminal the points show as a table, with no drawing", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_tui", [chart("pie", { sum: true })], { byStage: BY_STAGE }),
        WORDS,
        { terminal: true },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_tui:root")).toBe(true);
    expect(app.shows("id:s_tui:root:legend")).toBe(false);
    expect(app.shows("label:Lost: 9,000.00")).toBe(true);
    expect(app.texts()).toEqual([
      "By stage",
      "Won",
      "125,000.10",
      "Open",
      "40,000.20",
      "Lost",
      "9,000.00",
      "Total",
      "174,000.30",
    ]);
  });
});
