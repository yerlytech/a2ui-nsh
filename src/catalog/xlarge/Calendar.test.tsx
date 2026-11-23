import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

// xlarge's platform/surfaces/calendar.toml and what calendar.month answers.
const CALENDAR = {
  id: "root",
  component: "Calendar",
  month: { "@path": "/calendar" },
  screen: "calendar.month",
};

const FEBRUARY = {
  month: "2027-02",
  first: "2027-02-01",
  last: "2027-02-28",
  previous: "2027-01",
  next: "2027-03",
  items: [
    { id: "j1", day: "2027-02-03", time: "08:00", title: "Pump repair", screen: "screen:work_orders.order", tone: "warning", module: "work_orders", label: "work_orders.calendar.job" },
    { id: "@e1", day: "2027-02-28", time: null, title: "Stock count", screen: "screen:events.event", tone: null, module: "events", label: "events.calendar.event" },
  ],
  sources: [
    { module: "work_orders", label: "work_orders.calendar.job", count: 1 },
    { module: "events", label: "events.calendar.event", count: 1 },
  ],
  missing: [],
  incomplete: false,
};

const WORDS = {
  "calendar.everything": "Everything",
  "work_orders.calendar.job": "Jobs",
  "events.calendar.event": "Events",
  "calendar.nothing": "Nothing this month",
};

describe("xlarge catalog Calendar", () => {
  test("draws the month with its items; an item opens its screen with its id", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_cal", [CALENDAR], { calendar: FEBRUARY }), WORDS),
    );
    expect(reportedErrors(app)).toEqual([]);
    for (const words of ["February 2027", "Mon", "Sun", "Everything", "Jobs (1)", "Events (1)", "08:00", "Pump repair", "Stock count"]) {
      expect(app.texts()).toContain(words);
    }
    // February 2027 starts on a Monday and has four weeks.
    expect(app.shows("id:s_cal:root:day:2027-02-01")).toBe(true);
    expect(app.shows("id:s_cal:root:day:2027-02-29")).toBe(false);
    expect(app.shows("label:2027-02-03 08:00 Pump repair")).toBe(true);

    await app.press("id:s_cal:root:item:j1");
    await app.press("id:s_cal:root:item:@e1");
    await app.press("id:s_cal:root:next");
    expect(sentActions(app)).toEqual([
      { name: "screen:work_orders.order", sourceComponentId: "root", context: { id: "j1" } },
      { name: "screen:events.event", sourceComponentId: "root", context: { id: "@e1" } },
      {
        name: "screen:calendar.month",
        sourceComponentId: "root",
        context: { period: "between", from: "2027-03-01", to: "2027-03-31" },
      },
    ]);
  });

  test("the filter keeps one module's items; an empty month says so", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        [
          ...surfaceMessages("s_cal_f", [CALENDAR], { calendar: FEBRUARY }),
          ...surfaceMessages("s_cal_none", [CALENDAR], { calendar: { ...FEBRUARY, items: [], sources: [] } }),
          ...surfaceMessages("s_cal_bad", [CALENDAR], { calendar: "2027-02" }),
        ],
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    await app.press("id:s_cal_f:root:filter:events");
    expect(app.shows("id:s_cal_f:root:item:@e1")).toBe(true);
    expect(app.shows("id:s_cal_f:root:item:j1")).toBe(false);
    expect(app.shows("id:s_cal_none:root:nothing")).toBe(true);
    // A bare month string is not what calendar.month answers: nothing is drawn.
    expect(app.shows("id:s_cal_bad:root:month")).toBe(false);
    expect(sentActions(app)).toEqual([]);
  });
});
