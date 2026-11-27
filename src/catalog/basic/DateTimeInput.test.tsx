import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";
import {
  applyDateTimeEdit,
  clampTimeToBounds,
  extractIsoDatePart,
  extractIsoTimePart,
  resolveDateTimeFlags,
} from "./datetime_helpers";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog DateTimeInput", () => {
  test("pure ISO 8601 helpers normalize, validate, preserve parts, and clamp time bounds", () => {
    expect(resolveDateTimeFlags(undefined, undefined)).toEqual({
      enableDate: true,
      enableTime: false,
      mode: "date",
    });
    expect(resolveDateTimeFlags(undefined, true)).toEqual({
      enableDate: false,
      enableTime: true,
      mode: "time",
    });
    expect(resolveDateTimeFlags(true, true)).toEqual({
      enableDate: true,
      enableTime: true,
      mode: "datetime",
    });

    expect(extractIsoDatePart("2026-10-28T09:30:00Z")).toBe("2026-10-28");
    expect(extractIsoDatePart("2026-02-30")).toBeNull();
    expect(extractIsoDatePart("")).toBeNull();

    expect(extractIsoTimePart("2026-10-28T14:45:30+03:00")).toBe("14:45");
    expect(extractIsoTimePart("09:15")).toBe("09:15");
    expect(extractIsoTimePart("25:00")).toBeNull();

    expect(clampTimeToBounds("07:30", "09:00", "17:00")).toBe("09:00");
    expect(clampTimeToBounds("19:00", "09:00", "17:00")).toBe("17:00");
    expect(clampTimeToBounds("12:15", "09:00", "17:00")).toBe("12:15");

    expect(
      applyDateTimeEdit("datetime", "2026-10-15T10:30:00", {
        kind: "date",
        value: "2026-10-20",
      }),
    ).toBe("2026-10-20T10:30:00");

    expect(
      applyDateTimeEdit(
        "datetime",
        "",
        { kind: "time", value: "11:15" },
        { todayIso: () => "2026-10-28" },
      ),
    ).toBe("2026-10-28T11:15:00");
  });

  test("renders date-only mode with min/max bounds and writes ISO 8601 date two-way to @path", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      clock: { time: new Date("2026-10-28T12:00:00Z") },
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_dt_date",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { contractStart: "2026-10-15" },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["start_date", "preview"],
                  },
                  {
                    id: "start_date",
                    component: "DateTimeInput",
                    label: "Contract Start",
                    enableDate: true,
                    enableTime: false,
                    min: "2026-10-10",
                    max: "2026-10-20",
                    value: { "@path": "/contractStart" },
                  },
                  {
                    id: "preview",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "ISO: ${/contractStart}" },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.data": null },
      },
    });

    expect(app.shows("text:Contract Start")).toBe(true);
    expect(app.shows("text:ISO: 2026-10-15")).toBe(true);
    expect(app.shows("id:s_dt_date:start_date:time")).toBe(false);

    // Open calendar popup via trigger.
    await app.press("id:s_dt_date:start_date:date-trigger");
    await app.waitFor("label:2026-10-18");

    // Dates outside [min, max] are disabled by disabledMatcher.
    expect(app.enabled("label:2026-10-05")).toBe(false);
    expect(app.enabled("label:2026-10-25")).toBe(false);
    expect(app.enabled("label:2026-10-18")).toBe(true);

    // Pick 2026-10-18 and verify two-way @path update.
    await app.press("label:2026-10-18");
    expect(app.shows("text:ISO: 2026-10-18")).toBe(true);

    await app.host.send("a2ui.readData", {
      surfaceId: "s_dt_date",
      path: "/contractStart",
    });
    expect(
      (app.host.posts().filter((p) => p.name === "a2ui.data").pop()?.data as { value?: unknown })
        ?.value,
    ).toBe("2026-10-18");
  });

  test("renders time-only mode when enableTime=true and writes HH:MM with min/max clamping", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_dt_time",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { meetingTime: "09:30" },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["time_only", "preview"],
                  },
                  {
                    id: "time_only",
                    component: "DateTimeInput",
                    label: "Meeting Time",
                    enableTime: true,
                    min: "08:00:00Z",
                    max: "17:00:00Z",
                    value: { "@path": "/meetingTime" },
                  },
                  {
                    id: "preview",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "Time: ${/meetingTime}" },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.data": null },
      },
    });

    expect(app.shows("text:Meeting Time")).toBe(true);
    expect(app.shows("id:s_dt_time:time_only:date-trigger")).toBe(false);
    expect(app.shows("text:Time: 09:30")).toBe(true);

    // Select the hour segment ("09") and step up to "10".
    await app.press("id:s_dt_time:time_only:time:hour");
    await app.keyboard.press("up");
    expect(app.shows("text:Time: 10:30")).toBe(true);

    // Stepping down past min ("08:00") clamps to "08:00".
    await app.keyboard.press("down");
    await app.keyboard.press("down");
    await app.keyboard.press("down");
    expect(app.shows("text:Time: 08:00")).toBe(true);

    // TimeField receives min "08:00" natively: a minute step down from 08:00
    // stays on 08:00. Without the native bound it wraps to the in-range 08:59
    // (measured on nsh 0.7.1), which the write clamp alone would let through.
    await app.press("id:s_dt_time:time_only:time:minute");
    await app.keyboard.press("down");
    expect(app.shows("text:Time: 08:59")).toBe(false);
    expect(app.shows("text:Time: 08:00")).toBe(true);

    // Stepping the hour up past max ("17:00") lands on "17:00".
    await app.press("id:s_dt_time:time_only:time:hour");
    for (let i = 0; i < 12; i++) {
      await app.keyboard.press("up");
    }
    expect(app.shows("text:Time: 17:00")).toBe(true);

    await app.host.send("a2ui.readData", {
      surfaceId: "s_dt_time",
      path: "/meetingTime",
    });
    expect(
      (app.host.posts().filter((p) => p.name === "a2ui.data").pop()?.data as { value?: unknown })
        ?.value,
    ).toBe("17:00");
  });

  test("preserves complementary date and time parts in combined mode and handles @checks and @accessibility", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      clock: { time: new Date("2026-10-28T12:00:00Z") },
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_dt_both",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  appointment: "2026-10-15T10:30:00Z",
                  requiredVal: "",
                  warnCheck: {
                    valid: false,
                    message: "Outside standard business hours",
                    severity: "warning",
                  },
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["appt_input", "required_dt", "preview"],
                  },
                  {
                    id: "appt_input",
                    component: "DateTimeInput",
                    label: "Appointment",
                    enableDate: true,
                    enableTime: true,
                    value: { "@path": "/appointment" },
                    "@accessibility": {
                      label: "Schedule Appointment",
                      description: "Choose date and start time",
                    },
                    "@checks": [{ condition: { "@path": "/warnCheck" } }],
                  },
                  {
                    id: "required_dt",
                    component: "DateTimeInput",
                    label: "Deadline",
                    enableDate: true,
                    value: { "@path": "/requiredVal" },
                    "@checks": [
                      {
                        condition: {
                          "@call": "required",
                          args: { value: { "@path": "/requiredVal" } },
                        },
                        message: "Deadline is required.",
                      },
                    ],
                  },
                  {
                    id: "preview",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "Appt: ${/appointment}" },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null, "a2ui.data": null },
      },
    });

    // Timezone-suffixed initial value normalized cleanly without error.
    expect(app.shows("text:Outside standard business hours")).toBe(true);
    expect(app.shows("text:Deadline is required.")).toBe(true);

    // Edit time in combined mode -> preserves 2026-10-15 date.
    await app.press("id:s_dt_both:appt_input:time:hour");
    await app.keyboard.press("up");
    expect(app.shows("text:Appt: 2026-10-15T11:30:00")).toBe(true);

    // Edit date in combined mode -> preserves 11:30 time.
    await app.press("id:s_dt_both:appt_input:date-trigger");
    await app.waitFor("label:2026-10-20");
    await app.press("label:2026-10-20");
    expect(app.shows("text:Appt: 2026-10-20T11:30:00")).toBe(true);

    // Pick a date on the empty required field -> clears validation error.
    await app.press("id:s_dt_both:required_dt:date-trigger");
    await app.waitFor("label:2026-10-28");
    await app.press("label:2026-10-28");
    expect(app.shows("text:Deadline is required.")).toBe(false);

    // Verify @accessibility snapshot on combined group.
    const snap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "appt_input",
      );
    expect((snap?.data as { snapshot?: Record<string, unknown> })?.snapshot).toEqual({
      label: "Schedule Appointment",
      description: "Choose date and start time",
      hidden: false,
      role: "group",
    });
  });
});
