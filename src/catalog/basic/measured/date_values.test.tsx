/**
 * Measured on `nsh 0.7.2` (2026-11-27), headless: `DatePicker` and
 * `TimeField` drop an empty string or a value with a timezone suffix, with a
 * `warn DatePicker.value: expected an ISO date …` / `warn TimeField.value:
 * expected a time of day …` line, so `datetime_helpers.ts` normalizes A2UI
 * ISO 8601 strings first. It fails the day `nsh` accepts them.
 */

import { describe, expect, open, test } from "nsh/test";

async function openProbe(kind: "date" | "time", value: string) {
  return open("./DateProbe.tsx", { platform: "macos", host: { params: { kind, value } } });
}

async function dateSelected(value: string): Promise<boolean> {
  const app = await openProbe("date", value);
  await app.press("id:trigger");
  return app.accessibility("label:2026-10-28")?.selected === true;
}

async function timeShown(value: string): Promise<string> {
  const app = await openProbe("time", value);
  return app.texts().join("");
}

describe("nsh 0.7.2 measurement: DatePicker and TimeField values", () => {
  test("DatePicker selects a plain ISO date and drops \"\" and timezone suffixes", async () => {
    expect(await dateSelected("2026-10-28")).toBe(true);
    expect(await dateSelected("2026-10-28T09:30")).toBe(true);
    expect(await dateSelected("")).toBe(false);
    expect(await dateSelected("2026-10-28T09:30:00Z")).toBe(false);
    expect(await dateSelected("2026-10-28T09:30:00+03:00")).toBe(false);
  });

  test("TimeField shows HH:MM and falls back to 00:00 for \"\" and timezone suffixes", async () => {
    expect(await timeShown("10:30")).toBe("10:30");
    expect(await timeShown("10:30:15")).toBe("10:30");
    expect(await timeShown("")).toBe("00:00");
    expect(await timeShown("10:30:00Z")).toBe("00:00");
    expect(await timeShown("10:30+03:00")).toBe("00:00");
  });
});
