import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

describe("xlarge catalog Calendar", () => {
  test("draws the month Monday first and a day press opens the screen with its date", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_cal",
          [{ id: "root", component: "Calendar", month: { "@path": "/month" }, screen: "crm.day" }],
          { month: { month: "2026-11", days: [{ date: "2026-11-24", count: 5 }] } },
        ),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    const texts = app.texts();
    expect(texts.slice(0, 8)).toEqual(["November 2026", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(texts[8]).toBe("1");
    expect(app.shows("id:s_cal:root:day:2026-11-30")).toBe(true);
    expect(app.shows("id:s_cal:root:day:2026-11-31")).toBe(false);
    expect(app.shows("id:s_cal:root:mark:2026-11-24")).toBe(true);
    expect(app.shows("label:2026-11-24, 5")).toBe(true);

    await app.press("id:s_cal:root:day:2026-11-24");
    await app.press("id:s_cal:root:day:2026-11-01");
    expect(sentActions(app)).toEqual([
      { name: "screen:crm.day", sourceComponentId: "root", context: { date: "2026-11-24" } },
      { name: "screen:crm.day", sourceComponentId: "root", context: { date: "2026-11-01" } },
    ]);

    // A new month from the data model redraws the grid.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_cal", path: "/month/month", value: "2027-02" },
    });
    expect(app.texts()[0]).toBe("February 2027");
    expect(app.shows("id:s_cal:root:day:2027-02-28")).toBe(true);
    expect(app.shows("id:s_cal:root:day:2026-11-24")).toBe(false);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("without screen the days are not buttons; an unreadable month draws no grid", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages("s_cal_view", [{ id: "root", component: "Calendar", month: { "@path": "/m" } }], {
          m: "2026-11",
        }),
        ...surfaceMessages("s_cal_bad", [{ id: "root", component: "Calendar", month: { "@path": "/none" } }]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_cal_view:root:day:2026-11-30")).toBe(true);
    expect(app.shows("id:s_cal_bad:root")).toBe(true);
    expect(app.shows("id:s_cal_bad:root:day:2026-11-30")).toBe(false);
    // Not a button: nothing there takes a press, and nothing is sent.
    await expect(app.press("id:s_cal_view:root:day:2026-11-30")).rejects.toMatchObject({
      code: "ERR_NSH_TEST_NOT_FOUND",
    });
    expect(sentActions(app)).toEqual([]);
  });
});
