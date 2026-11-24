import { describe, expect, open, test } from "nsh/test";
import { metricAccent } from "./model";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "crm.kpi.revenue": "Revenue",
  "crm.kpi.complaints": "Complaints",
  "crm.kpi.this_month": "This month",
};

describe("xlarge catalog Metric", () => {
  test("formats the value from its text; the change is a whole percent, coloured by `better`", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_metric",
          [
            { id: "root", component: "Card", plain: true, children: ["up_good", "up_bad", "flat"] },
            {
              id: "up_good",
              component: "Metric",
              label: "crm.kpi.revenue",
              value: { "@path": "/revenue" },
              format: "money",
              change: { "@path": "/revenueChange" },
              better: "up",
              accent: "accent",
              hint: "crm.kpi.this_month",
              icon: "money",
            },
            {
              id: "up_bad",
              component: "Metric",
              label: "crm.kpi.complaints",
              value: { "@path": "/complaints" },
              format: "count",
              change: { "@path": "/complaintsChange" },
              better: "down",
            },
            { id: "flat", component: "Metric", value: { "@path": "/flat" }, change: { "@path": "/flatChange" }, better: "up" },
          ],
          {
            revenue: "1250000.5",
            revenueChange: "12.5",
            complaints: "1204",
            complaintsChange: "+4",
            flat: "7",
            flatChange: "0",
          },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    // The change is a percent whatever `format` is: a money metric's change is
    // not drawn as money, and 12.5 rounds half away from zero to 13.
    expect(app.texts()).toEqual([
      "Revenue",
      "1,250,000.50",
      "▲ 13%",
      "vs before",
      "This month",
      "Complaints",
      "1,204",
      "▲ 4%",
      "vs before",
      "7",
      "0%",
      "vs before",
    ]);
    expect(app.shows("label:Revenue, 1,250,000.50, ▲ 13% vs before")).toBe(true);

    // The better way and the worse way are drawn in different colours, and a
    // flat change in neither.
    const good = app.spanStyle("id:s_metric:up_good >> text:▲ 13%").color;
    const bad = app.spanStyle("id:s_metric:up_bad >> text:▲ 4%").color;
    const flat = app.spanStyle("id:s_metric:flat >> text:0%").color;
    expect(good === bad).toBe(false);
    expect(flat === good || flat === bad).toBe(false);
  });

  test("a down change is good when lower is better; no number, no line", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_metric_down",
          [
            { id: "root", component: "Card", plain: true, children: ["down", "none", "worse", "word"] },
            { id: "down", component: "Metric", value: { "@path": "/v" }, change: { "@path": "/c" }, better: "down", format: "percent" },
            { id: "none", component: "Metric", value: { "@path": "/v" } },
            { id: "worse", component: "Metric", value: { "@path": "/v" }, change: { "@path": "/c" }, better: "up", format: "percent" },
            { id: "word", component: "Metric", value: { "@path": "/v" }, change: { "@path": "/w" } },
          ],
          { v: "3.25", c: "-2.5", w: "n/a" },
        ),
        {},
        { againstBeforeLabel: "önceki döneme göre" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    // Without `format` the value shows as it came; -2.5 rounds away from zero.
    expect(app.texts()).toEqual([
      "3.25%",
      "▼ 3%",
      "önceki döneme göre",
      "3.25",
      "3.25%",
      "▼ 3%",
      "önceki döneme göre",
      "3.25",
    ]);
    expect(app.shows("id:s_metric_down:none:change")).toBe(false);
    expect(app.shows("id:s_metric_down:word:change")).toBe(false);
    const good = app.spanStyle("id:s_metric_down:down >> text:▼ 3%").color;
    const bad = app.spanStyle("id:s_metric_down:worse >> text:▼ 3%").color;
    expect(good === bad).toBe(false);
  });

  test("xlarge's accent colour name `rose` draws the destructive edge", async () => {
    // As xlarge's `lab_results.performance` marks its overdue count.
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_metric_accent",
          [
            { id: "root", component: "Card", plain: true, children: ["rose", "danger", "none"] },
            { id: "rose", component: "Metric", value: { "@path": "/v" }, format: "number", accent: "rose" },
            { id: "danger", component: "Metric", value: { "@path": "/v" }, format: "number", accent: "danger" },
            { id: "none", component: "Metric", value: { "@path": "/v" }, format: "number" },
          ],
          { v: 0 },
        ),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_metric_accent:rose")).toBe(true);
    // The headless host reports no border colour, so the edge is checked
    // where the renderer picks it.
    expect(metricAccent("rose")).toBe("danger");
    expect(metricAccent("red")).toBe("danger");
    expect(metricAccent("danger")).toBe("danger");
    expect(metricAccent("accent")).toBe("accent");
    expect(metricAccent(undefined)).toBe("plain");
  });
});
