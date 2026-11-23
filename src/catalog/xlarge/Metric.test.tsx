import { describe, expect, open, test } from "nsh/test";
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
  test("formats the value and its change from their text, coloured by `better`", async () => {
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
    expect(app.texts()).toEqual([
      "Revenue",
      "1,250,000.50",
      "▲ +12.50",
      "This month",
      "Complaints",
      "1,204",
      "▲ +4",
      "7",
      "0",
    ]);
    expect(app.shows("label:Revenue, 1,250,000.50, ▲ +12.50")).toBe(true);

    // The better way and the worse way are drawn in different colours, and a
    // flat change in neither.
    const good = app.spanStyle("id:s_metric:up_good >> text:▲ +12.50").color;
    const bad = app.spanStyle("id:s_metric:up_bad >> text:▲ +4").color;
    const flat = app.spanStyle("id:s_metric:flat >> text:0").color;
    expect(good === bad).toBe(false);
    expect(flat === good || flat === bad).toBe(false);
  });

  test("a down change is good when lower is better; no change, no line", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_metric_down",
          [
            { id: "root", component: "Card", plain: true, children: ["down", "none", "worse"] },
            { id: "down", component: "Metric", value: { "@path": "/v" }, change: { "@path": "/c" }, better: "down", format: "percent" },
            { id: "none", component: "Metric", value: { "@path": "/v" } },
            { id: "worse", component: "Metric", value: { "@path": "/v" }, change: { "@path": "/c" }, better: "up", format: "percent" },
          ],
          { v: "3.25", c: "-0.5" },
        ),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    // Without `format` the value shows as it came.
    expect(app.texts()).toEqual(["3.25%", "▼ -0.5%", "3.25", "3.25%", "▼ -0.5%"]);
    expect(app.shows("id:s_metric_down:none:change")).toBe(false);
    const good = app.spanStyle("id:s_metric_down:down >> text:▼ -0.5%").color;
    const bad = app.spanStyle("id:s_metric_down:worse >> text:▼ -0.5%").color;
    expect(good === bad).toBe(false);
  });
});
