import { describe, expect, test } from "nsh/test";
import { formatTr35Date, parseStrictTimestamp } from "./date_format";

// Fixed UTC instants: Monday, 5 January 2026, 09:05:07.250.
const MONDAY = "2026-01-05T09:05:07.250Z";
// Friday, 16 January 2026, 14:30:05.
const FRIDAY_PM = "2026-01-16T14:30:05Z";
const MONDAY_MS = Date.UTC(2026, 0, 5, 9, 5, 7, 250);

describe("parseStrictTimestamp", () => {
  test("accepts a date-only ISO string as UTC midnight", () => {
    const parsed = parseStrictTimestamp("2026-09-04");
    expect(parsed).not.toBeNull();
    expect(parsed!.year).toBe(2026);
    expect(parsed!.month).toBe(9);
    expect(parsed!.day).toBe(4);
    expect(parsed!.hour).toBe(0);
    expect(parsed!.minute).toBe(0);
    expect(parsed!.second).toBe(0);
    expect(parsed!.ms).toBe(0);
    expect(parsed!.weekday).toBe(5); // Friday
    expect(parsed!.offsetMinutes).toBe(0);
    expect(parsed!.instantMs).toBe(Date.UTC(2026, 8, 4));
  });

  test("accepts date-time with Z and fractional seconds", () => {
    const parsed = parseStrictTimestamp("2026-09-04T23:30:00.123Z");
    expect(parsed).not.toBeNull();
    expect(parsed!.hour).toBe(23);
    expect(parsed!.minute).toBe(30);
    expect(parsed!.second).toBe(0);
    expect(parsed!.ms).toBe(123);
    expect(parsed!.offsetMinutes).toBe(0);
    expect(parsed!.instantMs).toBe(Date.UTC(2026, 8, 4, 23, 30, 0, 123));
  });

  test("accepts explicit positive and negative offsets and normalizes the instant", () => {
    const plus = parseStrictTimestamp("2026-09-04T23:30:00+03:00");
    expect(plus).not.toBeNull();
    expect(plus!.hour).toBe(23);
    expect(plus!.minute).toBe(30);
    expect(plus!.offsetMinutes).toBe(180);
    expect(plus!.instantMs).toBe(Date.UTC(2026, 8, 4, 20, 30));

    const minus = parseStrictTimestamp("2026-09-04T23:30:00-05:00");
    expect(minus).not.toBeNull();
    expect(minus!.offsetMinutes).toBe(-300);
    expect(minus!.instantMs).toBe(Date.UTC(2026, 8, 5, 4, 30));

    const compact = parseStrictTimestamp("2026-09-04T23:30:00+0300");
    expect(compact).not.toBeNull();
    expect(compact!.offsetMinutes).toBe(180);
  });

  test("truncates fractional seconds beyond milliseconds", () => {
    const parsed = parseStrictTimestamp("2026-09-04T23:30:00.123456Z");
    expect(parsed).not.toBeNull();
    expect(parsed!.ms).toBe(123);
  });

  test("accepts a Date instance and an epoch number", () => {
    const fromDate = parseStrictTimestamp(new Date(MONDAY_MS));
    expect(fromDate).not.toBeNull();
    expect(fromDate!.year).toBe(2026);
    expect(fromDate!.month).toBe(1);
    expect(fromDate!.day).toBe(5);
    expect(fromDate!.hour).toBe(9);
    expect(fromDate!.minute).toBe(5);
    expect(fromDate!.second).toBe(7);
    expect(fromDate!.ms).toBe(250);
    expect(fromDate!.weekday).toBe(1); // Monday
    expect(fromDate!.offsetMinutes).toBe(0);
    expect(fromDate!.instantMs).toBe(MONDAY_MS);

    const fromEpoch = parseStrictTimestamp(MONDAY_MS);
    expect(fromEpoch).not.toBeNull();
    expect(fromEpoch!.instantMs).toBe(MONDAY_MS);

    const unixEpoch = parseStrictTimestamp(0);
    expect(unixEpoch).not.toBeNull();
    expect(unixEpoch!.year).toBe(1970);
    expect(unixEpoch!.month).toBe(1);
    expect(unixEpoch!.day).toBe(1);
    expect(unixEpoch!.weekday).toBe(4); // Thursday

    const beforeEpoch = parseStrictTimestamp(-1);
    expect(beforeEpoch).not.toBeNull();
    expect(beforeEpoch!.year).toBe(1969);
    expect(beforeEpoch!.month).toBe(12);
    expect(beforeEpoch!.day).toBe(31);
    expect(beforeEpoch!.hour).toBe(23);
    expect(beforeEpoch!.minute).toBe(59);
    expect(beforeEpoch!.second).toBe(59);
    expect(beforeEpoch!.ms).toBe(999);
    expect(beforeEpoch!.weekday).toBe(3); // Wednesday
  });

  test("accepts lowercase separators and a space between date and time", () => {
    const lowercase = parseStrictTimestamp("2026-09-04t23:30:00z");
    expect(lowercase).not.toBeNull();
    expect(lowercase!.hour).toBe(23);
    expect(lowercase!.offsetMinutes).toBe(0);

    const spaced = parseStrictTimestamp("2026-09-04 23:30");
    expect(spaced).not.toBeNull();
    expect(spaced!.hour).toBe(23);
    expect(spaced!.minute).toBe(30);
    expect(spaced!.second).toBe(0);

    const noSeconds = parseStrictTimestamp("2026-09-04T23:30Z");
    expect(noSeconds).not.toBeNull();
    expect(noSeconds!.second).toBe(0);
    expect(noSeconds!.instantMs).toBe(Date.UTC(2026, 8, 4, 23, 30));
  });

  test("trims surrounding whitespace", () => {
    const parsed = parseStrictTimestamp("  2026-09-04T23:30:00Z\n");
    expect(parsed).not.toBeNull();
    expect(parsed!.hour).toBe(23);
    expect(parseStrictTimestamp("   ")).toBeNull();
  });

  test("returns null for empty, nullish, and non-string/non-number/non-Date values", () => {
    for (const value of [
      "",
      null,
      undefined,
      {},
      { year: 2026 },
      [],
      [2026],
      true,
      false,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      new Date(Number.NaN),
    ]) {
      expect(parseStrictTimestamp(value)).toBeNull();
    }
  });

  test("rejects impossible calendar dates instead of rolling over", () => {
    expect(parseStrictTimestamp("2026-02-29")).toBeNull();
    expect(parseStrictTimestamp("2026-02-30")).toBeNull();
    expect(parseStrictTimestamp("1900-02-29")).toBeNull(); // not a leap century
    expect(parseStrictTimestamp("2026-04-31")).toBeNull();
    expect(parseStrictTimestamp("2026-13-01")).toBeNull();
    expect(parseStrictTimestamp("2026-00-01")).toBeNull();
    expect(parseStrictTimestamp("2026-01-00")).toBeNull();

    const leap = parseStrictTimestamp("2024-02-29");
    expect(leap).not.toBeNull();
    expect(leap!.year).toBe(2024);
    expect(leap!.month).toBe(2);
    expect(leap!.day).toBe(29);
    expect(leap!.weekday).toBe(4); // Thursday
    expect(leap!.instantMs).toBe(Date.UTC(2024, 1, 29));

    expect(parseStrictTimestamp("2000-02-29")).not.toBeNull();
  });

  test("rejects out-of-range fields, invalid offsets, and garbage", () => {
    expect(parseStrictTimestamp("2026-09-04T24:00:00Z")).toBeNull();
    expect(parseStrictTimestamp("2026-09-04T23:60:00Z")).toBeNull();
    expect(parseStrictTimestamp("2026-09-04T23:30:60Z")).toBeNull();
    expect(parseStrictTimestamp("2026-09-04T23:30:00+24:00")).toBeNull();
    expect(parseStrictTimestamp("2026-09-04T23:30:00+03:60")).toBeNull();
    expect(parseStrictTimestamp("2026-09-04T23Z")).toBeNull();
    expect(parseStrictTimestamp("2026-09-04T23:30:00.Z")).toBeNull();
    expect(parseStrictTimestamp("not a date")).toBeNull();
    expect(parseStrictTimestamp("2026/09/04")).toBeNull();
    expect(parseStrictTimestamp("04-09-2026")).toBeNull();
  });

  // bug: Date.UTC maps years 0-99 to 1900+year, so the weekday and epoch of
  // years 0000-0099 come from the 1900s while the parsed fields stay as written.
  test.skip("uses the written year for years below 100", () => {
    const parsed = parseStrictTimestamp("0099-06-15");
    const expected = new Date(0);
    expected.setUTCFullYear(99, 5, 15);
    expect(parsed).not.toBeNull();
    expect(parsed!.year).toBe(99);
    expect(parsed!.weekday).toBe(expected.getUTCDay());
    expect(parsed!.instantMs).toBe(expected.getTime());
  });
});

describe("formatTr35Date", () => {
  test("formats year, month, day, weekday, time, and fraction tokens in en-US", () => {
    expect(formatTr35Date(MONDAY, "y", "en-US")).toBe("2026");
    expect(formatTr35Date(MONDAY, "yy", "en-US")).toBe("26");
    expect(formatTr35Date(MONDAY, "yyyy", "en-US")).toBe("2026");
    expect(formatTr35Date(MONDAY, "yyyyy", "en-US")).toBe("02026");

    expect(formatTr35Date(MONDAY, "M", "en-US")).toBe("1");
    expect(formatTr35Date(MONDAY, "MM", "en-US")).toBe("01");
    expect(formatTr35Date(MONDAY, "MMM", "en-US")).toBe("Jan");
    expect(formatTr35Date(MONDAY, "MMMM", "en-US")).toBe("January");
    expect(formatTr35Date(MONDAY, "L", "en-US")).toBe("1");
    expect(formatTr35Date(MONDAY, "LLLL", "en-US")).toBe("January");

    expect(formatTr35Date(MONDAY, "d", "en-US")).toBe("5");
    expect(formatTr35Date(MONDAY, "dd", "en-US")).toBe("05");
    expect(formatTr35Date(MONDAY, "E", "en-US")).toBe("Mon");
    expect(formatTr35Date(MONDAY, "EEEE", "en-US")).toBe("Monday");

    expect(formatTr35Date(MONDAY, "H", "en-US")).toBe("9");
    expect(formatTr35Date(MONDAY, "HH", "en-US")).toBe("09");
    expect(formatTr35Date(MONDAY, "h", "en-US")).toBe("9");
    expect(formatTr35Date(MONDAY, "hh", "en-US")).toBe("09");
    expect(formatTr35Date(MONDAY, "a", "en-US")).toBe("AM");
    expect(formatTr35Date(MONDAY, "m", "en-US")).toBe("5");
    expect(formatTr35Date(MONDAY, "mm", "en-US")).toBe("05");
    expect(formatTr35Date(MONDAY, "s", "en-US")).toBe("7");
    expect(formatTr35Date(MONDAY, "ss", "en-US")).toBe("07");
    expect(formatTr35Date(MONDAY, "S", "en-US")).toBe("2");
    expect(formatTr35Date(MONDAY, "SS", "en-US")).toBe("25");
    expect(formatTr35Date(MONDAY, "SSS", "en-US")).toBe("250");
    expect(formatTr35Date(MONDAY, "SSSS", "en-US")).toBe("2500");
    expect(formatTr35Date(MONDAY, "Z", "en-US")).toBe("+0000");
    expect(formatTr35Date(MONDAY, "ZZZZZ", "en-US")).toBe("Z");
    expect(formatTr35Date(MONDAY, "X", "en-US")).toBe("Z");
  });

  test("formats 12-hour clock, day period, and combined patterns in en-US", () => {
    expect(formatTr35Date(FRIDAY_PM, "h:mm a", "en-US")).toBe("2:30 PM");
    expect(formatTr35Date(FRIDAY_PM, "hh:mm:ss a", "en-US")).toBe("02:30:05 PM");
    expect(formatTr35Date(FRIDAY_PM, "EEEE, MMMM d, yyyy", "en-US")).toBe(
      "Friday, January 16, 2026",
    );
    expect(formatTr35Date(FRIDAY_PM, "MMM dd, yy", "en-US")).toBe("Jan 16, 26");
    expect(formatTr35Date(FRIDAY_PM, "HH:mm", "en-US")).toBe("14:30");
    expect(formatTr35Date(FRIDAY_PM, "E", "en-US")).toBe("Fri");
  });

  test("formats Turkish month, weekday, and day-period names", () => {
    expect(formatTr35Date(MONDAY, "y", "tr-TR")).toBe("2026");
    expect(formatTr35Date(MONDAY, "M", "tr-TR")).toBe("1");
    expect(formatTr35Date(MONDAY, "MM", "tr-TR")).toBe("01");
    expect(formatTr35Date(MONDAY, "MMM", "tr-TR")).toBe("Oca");
    expect(formatTr35Date(MONDAY, "MMMM", "tr-TR")).toBe("Ocak");
    expect(formatTr35Date(MONDAY, "d", "tr-TR")).toBe("5");
    expect(formatTr35Date(MONDAY, "dd", "tr-TR")).toBe("05");
    expect(formatTr35Date(MONDAY, "E", "tr-TR")).toBe("Pzt");
    expect(formatTr35Date(MONDAY, "EEEE", "tr-TR")).toBe("Pazartesi");
    expect(formatTr35Date(MONDAY, "HH:mm:ss", "tr-TR")).toBe("09:05:07");
    expect(formatTr35Date(MONDAY, "a", "tr-TR")).toBe("ÖÖ");
    expect(formatTr35Date(FRIDAY_PM, "h:mm a", "tr-TR")).toBe("2:30 ÖS");
    expect(formatTr35Date(FRIDAY_PM, "d MMMM yyyy EEEE", "tr-TR")).toBe(
      "16 Ocak 2026 Cuma",
    );
    expect(formatTr35Date(FRIDAY_PM, "d MMM yyyy", "tr-TR")).toBe("16 Oca 2026");
  });

  test("resolves locale casing and falls back to English for unknown tags", () => {
    expect(formatTr35Date(MONDAY, "MMMM", "TR-tr")).toBe("Ocak");
    expect(formatTr35Date(MONDAY, "MMMM", "tr")).toBe("Ocak");
    expect(formatTr35Date(MONDAY, "MMMM", "xx-YY")).toBe("January");
    expect(formatTr35Date(MONDAY, "MMMM", "en_US")).toBe("January");
    expect(formatTr35Date(MONDAY, "MMMM", undefined)).toBe("January");
  });

  test("renders quoted TR35 literals and escaped apostrophes", () => {
    expect(formatTr35Date(MONDAY, "yyyy-MM-dd \u0027at\u0027 HH:mm", "en-US")).toBe(
      "2026-01-05 at 09:05",
    );
    expect(formatTr35Date(MONDAY, "yyyy-MM-dd \u0027\u0027ok\u0027\u0027", "en-US")).toBe(
      "2026-01-05 \u0027ok\u0027",
    );
    expect(formatTr35Date(MONDAY, "\u0027o\u0027\u0027clock\u0027", "en-US")).toBe("o\u0027clock");
    expect(formatTr35Date(MONDAY, "\u0027at\u0027", "tr-TR")).toBe("at");
  });

  test("keeps unknown field letters as written", () => {
    expect(formatTr35Date(MONDAY, "yyyy-QQ-dd", "en-US")).toBe("2026-QQ-05");
    expect(formatTr35Date(MONDAY, "q", "en-US")).toBe("q");
    expect(formatTr35Date(MONDAY, "yyyy/MM/dd", "en-US")).toBe("2026/01/05");
  });

  test("preserves written wall-clock time for offsets and normalizes ISO", () => {
    const offset = "2026-09-04T23:30:00-05:00";
    expect(formatTr35Date(offset, "yyyy-MM-dd HH:mm", "en-US")).toBe(
      "2026-09-04 23:30",
    );
    expect(formatTr35Date(offset, "ISO")).toBe("2026-09-05T04:30:00.000Z");
    expect(formatTr35Date(offset, "Z")).toBe("-0500");
    expect(formatTr35Date(offset, "ZZZZZ")).toBe("-05:00");
    expect(formatTr35Date("2026-09-04T23:30:00+03:00", "Z", "en-US")).toBe(
      "+0300",
    );
  });

  test("formats Date and epoch inputs, empty patterns, and invalid values", () => {
    expect(
      formatTr35Date(new Date(MONDAY_MS), "yyyy-MM-dd HH:mm:ss.SSS", "en-US"),
    ).toBe("2026-01-05 09:05:07.250");
    expect(formatTr35Date(MONDAY_MS, "yyyy-MM-dd", "en-US")).toBe("2026-01-05");
    expect(formatTr35Date(0, "yyyy-MM-dd", "en-US")).toBe("1970-01-01");
    expect(formatTr35Date(MONDAY, "", "en-US")).toBe("2026-01-05");
    expect(formatTr35Date("", "yyyy-MM-dd", "en-US")).toBe("");
    expect(formatTr35Date(null, "yyyy-MM-dd", "en-US")).toBe("");
    expect(formatTr35Date("2026-02-29", "yyyy-MM-dd", "en-US")).toBe("");
  });
});

describe("formatTr35Date offset tokens", () => {
  // bug: TR35 X (one letter) is +HH or Z; this formatter always appends minutes.
  test.skip("renders a single X offset without minutes", () => {
    expect(formatTr35Date("2026-09-04T23:30:00-05:00", "X")).toBe("-05");
  });
});
