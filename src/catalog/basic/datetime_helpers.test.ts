import { describe, expect, test } from "nsh/test";
import {
  applyDateTimeEdit,
  clampTimeToBounds,
  extractIsoDatePart,
  extractIsoTimePart,
  getLocalIsoDate,
  resolveDateTimeFlags,
  resolveEffectiveTimeBounds,
} from "./datetime_helpers";

describe("resolveDateTimeFlags", () => {
  test("defaults to date-only mode when both flags are omitted", () => {
    expect(resolveDateTimeFlags(undefined, undefined)).toEqual({
      enableDate: true,
      enableTime: false,
      mode: "date",
    });
  });

  test("keeps date-only mode when only enableDate is true", () => {
    expect(resolveDateTimeFlags(true, undefined)).toEqual({
      enableDate: true,
      enableTime: false,
      mode: "date",
    });
  });

  test("enables datetime mode when both flags are true", () => {
    expect(resolveDateTimeFlags(true, true)).toEqual({
      enableDate: true,
      enableTime: true,
      mode: "datetime",
    });
  });

  test("enables time-only mode when only enableTime is true", () => {
    expect(resolveDateTimeFlags(undefined, true)).toEqual({
      enableDate: false,
      enableTime: true,
      mode: "time",
    });
  });

  test("enables time-only mode when enableDate is false and enableTime is true", () => {
    expect(resolveDateTimeFlags(false, true)).toEqual({
      enableDate: false,
      enableTime: true,
      mode: "time",
    });
  });

  test("falls back to date-only mode when both explicit flags are false", () => {
    expect(resolveDateTimeFlags(false, false)).toEqual({
      enableDate: true,
      enableTime: false,
      mode: "date",
    });
  });
});

describe("extractIsoDatePart", () => {
  test("returns the date from a plain date string", () => {
    expect(extractIsoDatePart("2024-05-06")).toBe("2024-05-06");
  });

  test("returns the date from a date-time with a T separator", () => {
    expect(extractIsoDatePart("2024-05-06T10:15:00Z")).toBe("2024-05-06");
  });

  test("returns the date from a date-time with a space separator", () => {
    expect(extractIsoDatePart("2024-05-06 10:15")).toBe("2024-05-06");
  });

  test("trims surrounding whitespace before parsing", () => {
    expect(extractIsoDatePart("  2024-05-06  ")).toBe("2024-05-06");
  });

  test("accepts February 29 in a leap year", () => {
    expect(extractIsoDatePart("2024-02-29")).toBe("2024-02-29");
  });

  test("returns null for undefined input", () => {
    expect(extractIsoDatePart(undefined)).toBe(null);
  });

  test("returns null for empty input", () => {
    expect(extractIsoDatePart("")).toBe(null);
  });

  test("returns null for whitespace-only input", () => {
    expect(extractIsoDatePart("   ")).toBe(null);
  });

  test("returns null for a time-only string", () => {
    expect(extractIsoDatePart("10:15")).toBe(null);
  });

  test("returns null for a malformed date string", () => {
    expect(extractIsoDatePart("not-a-date")).toBe(null);
  });

  test("returns null for a zero month", () => {
    expect(extractIsoDatePart("2024-00-10")).toBe(null);
  });

  test("returns null for a month above twelve", () => {
    expect(extractIsoDatePart("2024-13-10")).toBe(null);
  });

  test("returns null for a zero day", () => {
    expect(extractIsoDatePart("2024-05-00")).toBe(null);
  });

  test("returns null for a day beyond the month length", () => {
    expect(extractIsoDatePart("2024-04-31")).toBe(null);
  });

  test("returns null for February 29 in a non-leap year", () => {
    expect(extractIsoDatePart("2023-02-29")).toBe(null);
  });

  test("returns null when the date is followed by an unexpected character", () => {
    expect(extractIsoDatePart("2024-05-06x")).toBe(null);
  });
});

describe("extractIsoTimePart", () => {
  test("returns the time from a plain HH:MM string", () => {
    expect(extractIsoTimePart("10:15")).toBe("10:15");
  });

  test("returns the time from an HH:MM:SS string", () => {
    expect(extractIsoTimePart("10:15:42")).toBe("10:15");
  });

  test("returns the time from a date-time string", () => {
    expect(extractIsoTimePart("2024-05-06T10:15:42")).toBe("10:15");
  });

  test("returns the time from a date-time with a space separator", () => {
    expect(extractIsoTimePart("2024-05-06 10:15")).toBe("10:15");
  });

  test("returns the time from a UTC date-time string", () => {
    expect(extractIsoTimePart("2024-05-06T10:15:42Z")).toBe("10:15");
  });

  test("returns the time from a time with a numeric offset", () => {
    expect(extractIsoTimePart("10:15+03:00")).toBe("10:15");
  });

  test("returns the time from an HH:MM:SS string with a numeric offset", () => {
    expect(extractIsoTimePart("10:15:42-05:00")).toBe("10:15");
  });

  test("accepts midnight", () => {
    expect(extractIsoTimePart("00:00")).toBe("00:00");
  });

  test("trims surrounding whitespace before parsing", () => {
    expect(extractIsoTimePart("  10:15  ")).toBe("10:15");
  });

  test("returns null for undefined input", () => {
    expect(extractIsoTimePart(undefined)).toBe(null);
  });

  test("returns null for empty input", () => {
    expect(extractIsoTimePart("")).toBe(null);
  });

  test("returns null for whitespace-only input", () => {
    expect(extractIsoTimePart("   ")).toBe(null);
  });

  test("returns null for a date-only string", () => {
    expect(extractIsoTimePart("2024-05-06")).toBe(null);
  });

  test("returns null for an hour above twenty-three", () => {
    expect(extractIsoTimePart("24:00")).toBe(null);
  });

  test("returns null for a minute above fifty-nine", () => {
    expect(extractIsoTimePart("10:60")).toBe(null);
  });

  test("returns null for a second above fifty-nine", () => {
    expect(extractIsoTimePart("10:15:60")).toBe(null);
  });

  test("returns null when the hour has only one digit", () => {
    expect(extractIsoTimePart("9:30")).toBe(null);
  });

  test("returns null for a malformed time string", () => {
    expect(extractIsoTimePart("not-a-time")).toBe(null);
  });
});

describe("getLocalIsoDate", () => {
  test("formats a fixed local date as YYYY-MM-DD", () => {
    expect(getLocalIsoDate(new Date(2024, 4, 6, 12, 0, 0))).toBe("2024-05-06");
  });

  test("pads a single-digit month and day", () => {
    expect(getLocalIsoDate(new Date(2024, 0, 5, 8, 30, 0))).toBe("2024-01-05");
  });

  test("keeps the local date at the end of the day", () => {
    expect(getLocalIsoDate(new Date(2024, 5, 30, 23, 59, 59))).toBe("2024-06-30");
  });

  test("keeps February 29 on a leap day", () => {
    expect(getLocalIsoDate(new Date(2024, 1, 29, 0, 0, 0))).toBe("2024-02-29");
  });
});

describe("clampTimeToBounds", () => {
  test("returns the time unchanged when no bounds are set", () => {
    expect(clampTimeToBounds("12:30", null, null)).toBe("12:30");
  });

  test("normalizes seconds away when the time is within bounds", () => {
    expect(clampTimeToBounds("12:30:45", null, null)).toBe("12:30");
  });

  test("clamps a time below the minimum to the minimum", () => {
    expect(clampTimeToBounds("08:15", "09:00", null)).toBe("09:00");
  });

  test("clamps a time above the maximum to the maximum", () => {
    expect(clampTimeToBounds("18:15", null, "17:00")).toBe("17:00");
  });

  test("keeps a time equal to the minimum", () => {
    expect(clampTimeToBounds("09:00", "09:00", "17:00")).toBe("09:00");
  });

  test("keeps a time equal to the maximum", () => {
    expect(clampTimeToBounds("17:00", "09:00", "17:00")).toBe("17:00");
  });

  test("keeps a time inside both bounds", () => {
    expect(clampTimeToBounds("12:30", "09:00", "17:00")).toBe("12:30");
  });

  test("returns malformed input unchanged", () => {
    expect(clampTimeToBounds("not-a-time", "09:00", "17:00")).toBe("not-a-time");
  });

  test("returns empty input unchanged", () => {
    expect(clampTimeToBounds("", "09:00", "17:00")).toBe("");
  });
});

describe("resolveEffectiveTimeBounds", () => {
  test("applies date-less time bounds in time mode", () => {
    expect(resolveEffectiveTimeBounds("time", null, "09:00", "17:00")).toEqual({
      minTime: "09:00",
      maxTime: "17:00",
    });
  });

  test("takes the time part of full date-times in time mode", () => {
    expect(
      resolveEffectiveTimeBounds(
        "time",
        null,
        "2024-05-06T09:00",
        "2024-05-07T17:00",
      ),
    ).toEqual({ minTime: "09:00", maxTime: "17:00" });
  });

  test("returns null bounds when both inputs are undefined", () => {
    expect(resolveEffectiveTimeBounds("time", null, undefined, undefined)).toEqual({
      minTime: null,
      maxTime: null,
    });
  });

  test("applies a time-only minimum on every day in datetime mode", () => {
    expect(
      resolveEffectiveTimeBounds("datetime", "2024-05-06", "09:00", undefined),
    ).toEqual({ minTime: "09:00", maxTime: null });
  });

  test("applies a time-only maximum on every day in datetime mode", () => {
    expect(
      resolveEffectiveTimeBounds("datetime", "2024-05-06", undefined, "17:00"),
    ).toEqual({ minTime: null, maxTime: "17:00" });
  });

  test("applies a dated minimum on its own day in datetime mode", () => {
    expect(
      resolveEffectiveTimeBounds(
        "datetime",
        "2024-05-06",
        "2024-05-06T09:00",
        undefined,
      ),
    ).toEqual({ minTime: "09:00", maxTime: null });
  });

  test("drops a dated minimum on another day in datetime mode", () => {
    expect(
      resolveEffectiveTimeBounds(
        "datetime",
        "2024-05-07",
        "2024-05-06T09:00",
        undefined,
      ),
    ).toEqual({ minTime: null, maxTime: null });
  });

  test("applies a dated maximum on its own day in datetime mode", () => {
    expect(
      resolveEffectiveTimeBounds(
        "datetime",
        "2024-05-06",
        undefined,
        "2024-05-06T17:00",
      ),
    ).toEqual({ minTime: null, maxTime: "17:00" });
  });

  test("drops a dated maximum on another day in datetime mode", () => {
    expect(
      resolveEffectiveTimeBounds(
        "datetime",
        "2024-05-07",
        undefined,
        "2024-05-06T17:00",
      ),
    ).toEqual({ minTime: null, maxTime: null });
  });

  test("drops dated bounds when no date is selected", () => {
    expect(
      resolveEffectiveTimeBounds(
        "datetime",
        null,
        "2024-05-06T09:00",
        "2024-05-06T17:00",
      ),
    ).toEqual({ minTime: null, maxTime: null });
  });

  test("ignores a date-only bound because it has no time part", () => {
    expect(
      resolveEffectiveTimeBounds("datetime", "2024-05-06", "2024-05-06", undefined),
    ).toEqual({ minTime: null, maxTime: null });
  });

  test("keeps the bound whose time part parsed and drops the other", () => {
    expect(
      resolveEffectiveTimeBounds(
        "datetime",
        "2024-05-06",
        undefined,
        "2024-05-06T17:00",
      ),
    ).toEqual({ minTime: null, maxTime: "17:00" });
  });

  test("applies dated bounds in date mode like datetime mode", () => {
    expect(
      resolveEffectiveTimeBounds(
        "date",
        "2024-05-06",
        "2024-05-06T09:00",
        "2024-05-06T17:00",
      ),
    ).toEqual({ minTime: "09:00", maxTime: "17:00" });
  });
});

describe("applyDateTimeEdit", () => {
  test("returns the date of an accepted date edit in date mode", () => {
    expect(
      applyDateTimeEdit("date", "", { kind: "date", value: "2024-05-06" }),
    ).toBe("2024-05-06");
  });

  test("returns only the date part of a date-time edit in date mode", () => {
    expect(
      applyDateTimeEdit("date", "", { kind: "date", value: "2024-05-06T10:15:00" }),
    ).toBe("2024-05-06");
  });

  test("clears the value when a date edit is null in date mode", () => {
    expect(
      applyDateTimeEdit("date", "2024-05-06", { kind: "date", value: null }),
    ).toBe("");
  });

  test("clears the value when a date edit is invalid in date mode", () => {
    expect(
      applyDateTimeEdit("date", "2024-05-06", { kind: "date", value: "2024-02-30" }),
    ).toBe("");
  });

  test("returns an empty value for a time edit in date mode", () => {
    expect(
      applyDateTimeEdit("date", "2024-05-06", { kind: "time", value: "10:15" }),
    ).toBe("");
  });

  test("returns an accepted time edit in time mode", () => {
    expect(applyDateTimeEdit("time", "", { kind: "time", value: "10:15" })).toBe("10:15");
  });

  test("normalizes seconds in a time edit in time mode", () => {
    expect(applyDateTimeEdit("time", "", { kind: "time", value: "10:15:42" })).toBe("10:15");
  });

  test("clamps a time edit to the minimum in time mode", () => {
    expect(
      applyDateTimeEdit("time", "", { kind: "time", value: "08:15" }, { rawMin: "09:00" }),
    ).toBe("09:00");
  });

  test("clamps a time edit to the maximum in time mode", () => {
    expect(
      applyDateTimeEdit("time", "", { kind: "time", value: "18:15" }, { rawMax: "17:00" }),
    ).toBe("17:00");
  });

  test("uses dated bounds as time bounds in time mode", () => {
    expect(
      applyDateTimeEdit("time", "", { kind: "time", value: "08:15" }, {
        rawMin: "2024-05-06T09:00",
        rawMax: "2024-05-07T17:00",
      }),
    ).toBe("09:00");
  });

  test("keeps the current value for a date edit in time mode", () => {
    expect(
      applyDateTimeEdit("time", "10:15", { kind: "date", value: "2024-05-06" }),
    ).toBe("10:15");
  });

  test("changes only the date and keeps the existing time in datetime mode", () => {
    expect(
      applyDateTimeEdit("datetime", "2024-01-01T10:15:00", {
        kind: "date",
        value: "2024-02-02",
      }),
    ).toBe("2024-02-02T10:15:00");
  });

  test("defaults the kept time to midnight when the current value has no time", () => {
    expect(
      applyDateTimeEdit("datetime", "2024-01-01", { kind: "date", value: "2024-02-02" }),
    ).toBe("2024-02-02T00:00:00");
  });

  test("clears a datetime when a date edit is null", () => {
    expect(
      applyDateTimeEdit("datetime", "2024-01-01T10:15:00", {
        kind: "date",
        value: null,
      }),
    ).toBe("");
  });

  test("clears a datetime when a date edit is invalid", () => {
    expect(
      applyDateTimeEdit("datetime", "2024-01-01T10:15:00", {
        kind: "date",
        value: "2024-02-30",
      }),
    ).toBe("");
  });

  test("clamps the kept time against a maximum on the newly selected day", () => {
    expect(
      applyDateTimeEdit(
        "datetime",
        "2024-01-01T23:00:00",
        { kind: "date", value: "2024-02-02" },
        { rawMax: "2024-02-02T18:00" },
      ),
    ).toBe("2024-02-02T18:00:00");
  });

  test("does not clamp the kept time against a maximum on another day", () => {
    expect(
      applyDateTimeEdit(
        "datetime",
        "2024-01-01T23:00:00",
        { kind: "date", value: "2024-02-02" },
        { rawMax: "2024-02-03T18:00" },
      ),
    ).toBe("2024-02-02T23:00:00");
  });

  test("clamps the kept time against a minimum on the newly selected day", () => {
    expect(
      applyDateTimeEdit(
        "datetime",
        "2024-01-01T06:00:00",
        { kind: "date", value: "2024-02-02" },
        { rawMin: "2024-02-02T09:00" },
      ),
    ).toBe("2024-02-02T09:00:00");
  });

  test("changes only the time and keeps the current date in datetime mode", () => {
    expect(
      applyDateTimeEdit("datetime", "2024-01-01T10:15:00", {
        kind: "time",
        value: "11:45",
      }),
    ).toBe("2024-01-01T11:45:00");
  });

  test("normalizes seconds in a datetime time edit", () => {
    expect(
      applyDateTimeEdit("datetime", "2024-01-01T10:15:00", {
        kind: "time",
        value: "11:45:30",
      }),
    ).toBe("2024-01-01T11:45:00");
  });

  test("keeps the date of a date-only current value when editing time", () => {
    expect(
      applyDateTimeEdit("datetime", "2024-03-04", { kind: "time", value: "11:45" }),
    ).toBe("2024-03-04T11:45:00");
  });

  test("uses the injected today when the current value has no date", () => {
    expect(
      applyDateTimeEdit("datetime", "", { kind: "time", value: "11:45" }, {
        todayIso: () => "2024-06-01",
      }),
    ).toBe("2024-06-01T11:45:00");
  });

  test("clamps an edited time on the minimum day", () => {
    expect(
      applyDateTimeEdit(
        "datetime",
        "2024-01-05T10:00:00",
        { kind: "time", value: "08:00" },
        { rawMin: "2024-01-05T09:00" },
      ),
    ).toBe("2024-01-05T09:00:00");
  });

  test("does not clamp an edited time when the minimum belongs to another day", () => {
    expect(
      applyDateTimeEdit(
        "datetime",
        "2024-01-06T10:00:00",
        { kind: "time", value: "08:00" },
        { rawMin: "2024-01-05T09:00" },
      ),
    ).toBe("2024-01-06T08:00:00");
  });

  test("clamps an edited time on the maximum day", () => {
    expect(
      applyDateTimeEdit(
        "datetime",
        "2024-01-09T10:00:00",
        { kind: "time", value: "19:00" },
        { rawMax: "2024-01-09T17:00" },
      ),
    ).toBe("2024-01-09T17:00:00");
  });

  test("does not clamp an edited time when the maximum belongs to another day", () => {
    expect(
      applyDateTimeEdit(
        "datetime",
        "2024-01-08T10:00:00",
        { kind: "time", value: "19:00" },
        { rawMax: "2024-01-09T17:00" },
      ),
    ).toBe("2024-01-08T19:00:00");
  });

  test("applies a time-only minimum on every day in datetime mode", () => {
    expect(
      applyDateTimeEdit(
        "datetime",
        "2024-01-08T10:00:00",
        { kind: "time", value: "08:00" },
        { rawMin: "09:00" },
      ),
    ).toBe("2024-01-08T09:00:00");
  });
});
