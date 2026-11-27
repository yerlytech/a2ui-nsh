import { describe, expect, test } from "nsh/test";
import { formatTr35Date, parseStrictTimestamp } from "./date_format";

// One rule per test for src/core/functions/date_format.ts. The broad scenarios
// live in date_format.test.ts; this file pins each rule on its own.

/** Proleptic Gregorian UTC epoch ms, safe for years 0-99 (Date.UTC maps those to 19xx). */
function utcMs(year: number, month: number, day: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getTime();
}

// Saturday, 7 March 2026, 15:04:09.042 UTC.
const SAT_PM = "2026-03-07T15:04:09.042Z";

describe("parseStrictTimestamp leap years", () => {
  test("keeps 29 February in a year divisible by 4", () => {
    const parsed = parseStrictTimestamp("2024-02-29");
    expect(parsed).not.toBeNull();
    expect(parsed!.day).toBe(29);
    expect(parsed!.weekday).toBe(4); // Thursday
  });

  test("refuses 29 February in a common year", () => {
    expect(parseStrictTimestamp("2023-02-29")).toBeNull();
  });

  test("refuses 29 February in a century year not divisible by 400", () => {
    expect(parseStrictTimestamp("1900-02-29")).toBeNull();
  });

  test("keeps 29 February in a century year divisible by 400", () => {
    const parsed = parseStrictTimestamp("2000-02-29");
    expect(parsed).not.toBeNull();
    expect(parsed!.weekday).toBe(2); // Tuesday
  });

  test("refuses 30 February even in a leap year", () => {
    expect(parseStrictTimestamp("2024-02-30")).toBeNull();
  });
});

describe("parseStrictTimestamp calendar bounds", () => {
  const LAST_DAYS: ReadonlyArray<readonly [number, number]> = [
    [1, 31], [2, 28], [3, 31], [4, 30], [5, 31], [6, 30],
    [7, 31], [8, 31], [9, 30], [10, 31], [11, 30], [12, 31],
  ];

  test("keeps the last day of every month", () => {
    for (const [month, last] of LAST_DAYS) {
      const mm = String(month).padStart(2, "0");
      const parsed = parseStrictTimestamp(`2026-${mm}-${last}`);
      expect(parsed).not.toBeNull();
      expect(parsed!.instantMs).toBe(Date.UTC(2026, month - 1, last));
    }
  });

  test("refuses the day after the last day of every month", () => {
    for (const [month, last] of LAST_DAYS) {
      const mm = String(month).padStart(2, "0");
      expect(parseStrictTimestamp(`2026-${mm}-${last + 1}`)).toBeNull();
    }
  });

  test("refuses month 00 and month 13", () => {
    expect(parseStrictTimestamp("2026-00-10")).toBeNull();
    expect(parseStrictTimestamp("2026-13-10")).toBeNull();
  });

  test("refuses day 00", () => {
    expect(parseStrictTimestamp("2026-01-00")).toBeNull();
  });

  test("refuses a year written with other than four digits", () => {
    expect(parseStrictTimestamp("226-01-01")).toBeNull();
    expect(parseStrictTimestamp("20260-01-01")).toBeNull();
    expect(parseStrictTimestamp("-2026-01-01")).toBeNull();
  });

  test("keeps years below 100 as written instead of mapping them to 19xx", () => {
    const parsed = parseStrictTimestamp("0099-03-01T00:00:00Z");
    expect(parsed).not.toBeNull();
    expect(parsed!.year).toBe(99);
    expect(parsed!.instantMs).toBe(utcMs(99, 3, 1));
    expect(parsed!.weekday).toBe(new Date(utcMs(99, 3, 1)).getUTCDay());
  });

  test("keeps year 0000, a leap year in the proleptic Gregorian calendar", () => {
    const parsed = parseStrictTimestamp("0000-02-29");
    expect(parsed).not.toBeNull();
    expect(parsed!.instantMs).toBe(utcMs(0, 2, 29));
  });
});

describe("parseStrictTimestamp time of day", () => {
  test("keeps 23:59:59 as the last second of the day", () => {
    const parsed = parseStrictTimestamp("2026-01-01T23:59:59Z");
    expect(parsed!.hour).toBe(23);
    expect(parsed!.minute).toBe(59);
    expect(parsed!.second).toBe(59);
  });

  // ISO 8601 allows 24:00 as end of day; the parser refuses it today.
  test("refuses hour 24", () => {
    expect(parseStrictTimestamp("2026-01-01T24:00:00Z")).toBeNull();
    expect(parseStrictTimestamp("2026-01-01T24:00Z")).toBeNull();
  });

  test("refuses minute 60", () => {
    expect(parseStrictTimestamp("2026-01-01T10:60:00Z")).toBeNull();
  });

  // Leap seconds are not representable in an epoch instant; refused.
  test("refuses second 60", () => {
    expect(parseStrictTimestamp("2026-12-31T23:59:60Z")).toBeNull();
  });

  test("accepts hours and minutes without seconds", () => {
    const parsed = parseStrictTimestamp("2026-01-01T10:30");
    expect(parsed!.hour).toBe(10);
    expect(parsed!.minute).toBe(30);
    expect(parsed!.second).toBe(0);
  });

  test("refuses an hour without minutes", () => {
    expect(parseStrictTimestamp("2026-01-01T10")).toBeNull();
  });

  test("refuses single-digit time fields", () => {
    expect(parseStrictTimestamp("2026-01-01T9:30")).toBeNull();
    expect(parseStrictTimestamp("2026-01-01T09:3")).toBeNull();
  });
});

describe("parseStrictTimestamp fractional seconds", () => {
  test("scales one fraction digit to hundreds of milliseconds", () => {
    expect(parseStrictTimestamp("2026-01-01T00:00:00.5Z")!.ms).toBe(500);
  });

  test("scales two fraction digits to tens of milliseconds", () => {
    expect(parseStrictTimestamp("2026-01-01T00:00:00.05Z")!.ms).toBe(50);
  });

  test("truncates, never rounds, digits past the millisecond", () => {
    expect(parseStrictTimestamp("2026-01-01T00:00:00.9999Z")!.ms).toBe(999);
  });

  test("refuses a decimal point with no digits", () => {
    expect(parseStrictTimestamp("2026-01-01T00:00:00.Z")).toBeNull();
  });

  test("refuses a fraction on minutes without seconds", () => {
    expect(parseStrictTimestamp("2026-01-01T00:00.5Z")).toBeNull();
  });
});

describe("parseStrictTimestamp offsets", () => {
  test("reads Z as offset zero", () => {
    const parsed = parseStrictTimestamp("2026-01-01T12:00:00Z");
    expect(parsed!.offsetMinutes).toBe(0);
    expect(parsed!.instantMs).toBe(Date.UTC(2026, 0, 1, 12));
  });

  test("reads lowercase z as offset zero", () => {
    expect(parseStrictTimestamp("2026-01-01T12:00:00z")!.offsetMinutes).toBe(0);
  });

  test("reads a missing offset as UTC", () => {
    const parsed = parseStrictTimestamp("2026-01-01T12:00:00");
    expect(parsed!.offsetMinutes).toBe(0);
    expect(parsed!.instantMs).toBe(Date.UTC(2026, 0, 1, 12));
  });

  test("reads +HH:MM east of UTC and moves the instant back", () => {
    const parsed = parseStrictTimestamp("2026-01-01T12:00:00+05:30");
    expect(parsed!.offsetMinutes).toBe(330);
    expect(parsed!.hour).toBe(12);
    expect(parsed!.instantMs).toBe(Date.UTC(2026, 0, 1, 6, 30));
  });

  test("reads -HH:MM west of UTC and moves the instant forward", () => {
    const parsed = parseStrictTimestamp("2026-01-01T12:00:00-03:45");
    expect(parsed!.offsetMinutes).toBe(-225);
    expect(parsed!.instantMs).toBe(Date.UTC(2026, 0, 1, 15, 45));
  });

  test("reads the basic +HHMM form without a colon", () => {
    expect(parseStrictTimestamp("2026-01-01T12:00:00+0530")!.offsetMinutes).toBe(330);
  });

  // ISO 8601 offsets stop at 23:59 in this parser; real zones stay within +-14:00.
  test("keeps the largest offset +23:59", () => {
    expect(parseStrictTimestamp("2026-01-01T12:00:00+23:59")!.offsetMinutes).toBe(1439);
  });

  test("refuses an offset hour of 24", () => {
    expect(parseStrictTimestamp("2026-01-01T12:00:00+24:00")).toBeNull();
  });

  test("refuses an offset minute of 60", () => {
    expect(parseStrictTimestamp("2026-01-01T12:00:00-05:60")).toBeNull();
  });

  test("refuses an hours-only or single-digit offset", () => {
    expect(parseStrictTimestamp("2026-01-01T12:00:00+05")).toBeNull();
    expect(parseStrictTimestamp("2026-01-01T12:00:00+5:30")).toBeNull();
  });

  test("refuses an offset on a date-only string", () => {
    expect(parseStrictTimestamp("2026-01-01Z")).toBeNull();
    expect(parseStrictTimestamp("2026-01-01+03:00")).toBeNull();
  });

  test("keeps the written wall-clock date across an offset that crosses midnight", () => {
    const parsed = parseStrictTimestamp("2026-01-01T01:00:00+03:00");
    expect(parsed!.day).toBe(1);
    expect(parsed!.weekday).toBe(4); // Thursday, the written date
    expect(parsed!.instantMs).toBe(Date.UTC(2025, 11, 31, 22));
  });
});

describe("parseStrictTimestamp input types", () => {
  test("reads a date-only string as UTC midnight of that date", () => {
    const parsed = parseStrictTimestamp("2026-03-07");
    expect(parsed!.hour).toBe(0);
    expect(parsed!.instantMs).toBe(Date.UTC(2026, 2, 7));
    expect(parsed!.weekday).toBe(6); // Saturday
  });

  test("reads epoch 0 as 1970-01-01T00:00:00Z", () => {
    const parsed = parseStrictTimestamp(0);
    expect(parsed!.year).toBe(1970);
    expect(parsed!.month).toBe(1);
    expect(parsed!.day).toBe(1);
    expect(parsed!.weekday).toBe(4); // Thursday
  });

  test("reads a negative epoch number as a time before 1970", () => {
    const parsed = parseStrictTimestamp(-1);
    expect(parsed!.year).toBe(1969);
    expect(parsed!.ms).toBe(999);
  });

  test("reads an epoch number with offset zero", () => {
    expect(parseStrictTimestamp(Date.UTC(2026, 2, 7, 15))!.offsetMinutes).toBe(0);
  });

  test("refuses NaN and infinite numbers", () => {
    expect(parseStrictTimestamp(Number.NaN)).toBeNull();
    expect(parseStrictTimestamp(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseStrictTimestamp(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  test("refuses a finite number past the Date range", () => {
    expect(parseStrictTimestamp(8.64e15)).not.toBeNull();
    expect(parseStrictTimestamp(8.64e15 + 1)).toBeNull();
  });

  test("refuses an invalid Date instance", () => {
    expect(parseStrictTimestamp(new Date(Number.NaN))).toBeNull();
  });

  test("refuses booleans, objects, and arrays", () => {
    expect(parseStrictTimestamp(true)).toBeNull();
    expect(parseStrictTimestamp({ value: "2026-01-01" })).toBeNull();
    expect(parseStrictTimestamp(["2026-01-01"])).toBeNull();
  });

  test("refuses a numeric string, which is not an ISO date", () => {
    expect(parseStrictTimestamp("1767225600000")).toBeNull();
  });

  test("refuses a whitespace-only string", () => {
    expect(parseStrictTimestamp("   ")).toBeNull();
  });

  test("refuses a separator other than T or a space", () => {
    expect(parseStrictTimestamp("2026-01-01_10:00")).toBeNull();
    expect(parseStrictTimestamp("2026/01/01")).toBeNull();
  });
});

describe("formatTr35Date year", () => {
  test("y writes the year unpadded", () => {
    expect(formatTr35Date(SAT_PM, "y", "en-US")).toBe("2026");
    expect(formatTr35Date("0005-01-01", "y", "en-US")).toBe("5");
  });

  test("yy writes the last two digits", () => {
    expect(formatTr35Date(SAT_PM, "yy", "en-US")).toBe("26");
    expect(formatTr35Date("0005-01-01", "yy", "en-US")).toBe("05");
  });

  test("yyy and longer pad the year to the letter count", () => {
    expect(formatTr35Date(SAT_PM, "yyy", "en-US")).toBe("2026");
    expect(formatTr35Date(SAT_PM, "yyyyy", "en-US")).toBe("02026");
    expect(formatTr35Date("0005-01-01", "yyyy", "en-US")).toBe("0005");
  });
});

describe("formatTr35Date month", () => {
  test("M writes the month number unpadded", () => {
    expect(formatTr35Date(SAT_PM, "M", "en-US")).toBe("3");
  });

  test("MM pads the month number to two digits", () => {
    expect(formatTr35Date(SAT_PM, "MM", "en-US")).toBe("03");
  });

  test("MMM writes the short month name", () => {
    expect(formatTr35Date(SAT_PM, "MMM", "en-US")).toBe("Mar");
  });

  test("MMMM writes the wide month name", () => {
    expect(formatTr35Date(SAT_PM, "MMMM", "en-US")).toBe("March");
  });

  // TR35 MMMMM is the narrow name; no narrow table exists, so it stays wide.
  test("MMMMM writes the wide month name", () => {
    expect(formatTr35Date(SAT_PM, "MMMMM", "en-US")).toBe("March");
  });

  test("L stand-alone month follows the same widths as M", () => {
    expect(formatTr35Date(SAT_PM, "L LL LLL LLLL", "en-US")).toBe("3 03 Mar March");
  });

  test("month names follow the locale", () => {
    expect(formatTr35Date(SAT_PM, "MMMM", "tr")).toBe("Mart");
  });
});

describe("formatTr35Date day and weekday", () => {
  test("d writes the day unpadded", () => {
    expect(formatTr35Date(SAT_PM, "d", "en-US")).toBe("7");
  });

  test("dd and longer pad the day to two digits", () => {
    expect(formatTr35Date(SAT_PM, "dd", "en-US")).toBe("07");
    expect(formatTr35Date(SAT_PM, "ddd", "en-US")).toBe("07");
  });

  test("E to EEE write the short weekday name", () => {
    expect(formatTr35Date(SAT_PM, "E", "en-US")).toBe("Sat");
    expect(formatTr35Date(SAT_PM, "EEE", "en-US")).toBe("Sat");
  });

  test("EEEE writes the wide weekday name", () => {
    expect(formatTr35Date(SAT_PM, "EEEE", "en-US")).toBe("Saturday");
  });
});

describe("formatTr35Date hour, minute, second", () => {
  test("H writes the 24-hour clock unpadded", () => {
    expect(formatTr35Date(SAT_PM, "H", "en-US")).toBe("15");
    expect(formatTr35Date("2026-03-07T03:00:00Z", "H", "en-US")).toBe("3");
  });

  test("HH pads the 24-hour clock to two digits", () => {
    expect(formatTr35Date("2026-03-07T03:00:00Z", "HH", "en-US")).toBe("03");
    expect(formatTr35Date("2026-03-07T00:00:00Z", "HH", "en-US")).toBe("00");
  });

  test("h writes the 12-hour clock unpadded", () => {
    expect(formatTr35Date(SAT_PM, "h", "en-US")).toBe("3");
  });

  test("hh pads the 12-hour clock to two digits", () => {
    expect(formatTr35Date(SAT_PM, "hh", "en-US")).toBe("03");
  });

  test("h writes midnight and noon as 12", () => {
    expect(formatTr35Date("2026-03-07T00:00:00Z", "h", "en-US")).toBe("12");
    expect(formatTr35Date("2026-03-07T12:00:00Z", "h", "en-US")).toBe("12");
  });

  test("m and mm write minutes unpadded and padded", () => {
    expect(formatTr35Date(SAT_PM, "m", "en-US")).toBe("4");
    expect(formatTr35Date(SAT_PM, "mm", "en-US")).toBe("04");
  });

  test("s and ss write seconds unpadded and padded", () => {
    expect(formatTr35Date(SAT_PM, "s", "en-US")).toBe("9");
    expect(formatTr35Date(SAT_PM, "ss", "en-US")).toBe("09");
  });

  test("S to SSS write the leading fraction digits", () => {
    expect(formatTr35Date(SAT_PM, "S", "en-US")).toBe("0");
    expect(formatTr35Date(SAT_PM, "SS", "en-US")).toBe("04");
    expect(formatTr35Date(SAT_PM, "SSS", "en-US")).toBe("042");
  });

  test("SSSS and longer pad the fraction with trailing zeros", () => {
    expect(formatTr35Date(SAT_PM, "SSSSS", "en-US")).toBe("04200");
  });
});

describe("formatTr35Date day period", () => {
  test("a writes AM from midnight to 11:59", () => {
    expect(formatTr35Date("2026-03-07T00:00:00Z", "a", "en-US")).toBe("AM");
    expect(formatTr35Date("2026-03-07T11:59:00Z", "a", "en-US")).toBe("AM");
  });

  test("a writes PM from noon", () => {
    expect(formatTr35Date("2026-03-07T12:00:00Z", "a", "en-US")).toBe("PM");
  });

  test("a follows the locale day-period names", () => {
    expect(formatTr35Date(SAT_PM, "a", "tr")).toBe("ÖS");
  });
});

describe("formatTr35Date unsupported letters", () => {
  // Era (G), quarter (Q), and k/K hours are not implemented; the letters stay as written.
  test("writes an unsupported pattern letter run as written", () => {
    expect(formatTr35Date(SAT_PM, "G", "en-US")).toBe("G");
    expect(formatTr35Date(SAT_PM, "QQQ", "en-US")).toBe("QQQ");
    expect(formatTr35Date(SAT_PM, "kk", "en-US")).toBe("kk");
  });

  test("writes a non-ASCII letter as a literal", () => {
    expect(formatTr35Date(SAT_PM, "d ç", "en-US")).toBe("7 ç");
  });

  test("writes punctuation and spaces as literals", () => {
    expect(formatTr35Date(SAT_PM, "yyyy/MM/dd, HH:mm", "en-US")).toBe("2026/03/07, 15:04");
  });
});

describe("formatTr35Date quoting", () => {
  test("writes quoted letters as literal text", () => {
    expect(formatTr35Date(SAT_PM, "'yyyy' yyyy", "en-US")).toBe("yyyy 2026");
  });

  test("writes a doubled quote outside a literal as one quote", () => {
    expect(formatTr35Date(SAT_PM, "HH''mm", "en-US")).toBe("15'04");
  });

  test("writes a doubled quote inside a literal as one quote", () => {
    expect(formatTr35Date(SAT_PM, "h 'o''clock'", "en-US")).toBe("3 o'clock");
  });

  test("runs an unterminated literal to the end of the pattern", () => {
    expect(formatTr35Date(SAT_PM, "d 'of MMMM", "en-US")).toBe("7 of MMMM");
  });
});

describe("formatTr35Date offsets", () => {
  const PLUS = "2026-03-07T15:04:09+05:30";
  const MINUS = "2026-03-07T15:04:09-05:00";

  test("Z to ZZZZ write +HHMM, with +0000 for UTC", () => {
    expect(formatTr35Date(PLUS, "Z", "en-US")).toBe("+0530");
    expect(formatTr35Date(MINUS, "ZZZZ", "en-US")).toBe("-0500");
    expect(formatTr35Date(SAT_PM, "Z", "en-US")).toBe("+0000");
  });

  test("ZZZZZ writes +HH:MM, with Z for UTC", () => {
    expect(formatTr35Date(PLUS, "ZZZZZ", "en-US")).toBe("+05:30");
    expect(formatTr35Date(MINUS, "ZZZZZ", "en-US")).toBe("-05:00");
    expect(formatTr35Date(SAT_PM, "ZZZZZ", "en-US")).toBe("Z");
  });

  test("X writes +HH, adding minutes only when they are non-zero", () => {
    expect(formatTr35Date(MINUS, "X", "en-US")).toBe("-05");
    expect(formatTr35Date(PLUS, "X", "en-US")).toBe("+0530");
  });

  test("X writes Z for UTC", () => {
    expect(formatTr35Date(SAT_PM, "X", "en-US")).toBe("Z");
  });

  test("XX writes +HHMM", () => {
    expect(formatTr35Date(MINUS, "XX", "en-US")).toBe("-0500");
    expect(formatTr35Date(PLUS, "XX", "en-US")).toBe("+0530");
  });

  test("XXX and longer write +HH:MM, with Z for UTC", () => {
    expect(formatTr35Date(MINUS, "XXX", "en-US")).toBe("-05:00");
    expect(formatTr35Date(SAT_PM, "XXXX", "en-US")).toBe("Z");
  });

  test("an epoch number formats with offset zero", () => {
    expect(formatTr35Date(Date.UTC(2026, 2, 7), "ZZZZZ", "en-US")).toBe("Z");
  });
});

describe("formatTr35Date pattern selection", () => {
  test("ISO writes the normalized UTC instant", () => {
    expect(formatTr35Date("2026-03-07T15:04:09+05:30", "ISO")).toBe(
      "2026-03-07T09:34:09.000Z",
    );
  });

  test("an empty pattern falls back to yyyy-MM-dd", () => {
    expect(formatTr35Date(SAT_PM, "", "en-US")).toBe("2026-03-07");
  });

  test("an omitted pattern defaults to yyyy-MM-dd", () => {
    expect(formatTr35Date(SAT_PM)).toBe("2026-03-07");
  });

  test("an unparseable value formats as an empty string", () => {
    expect(formatTr35Date("2023-02-29", "yyyy")).toBe("");
    expect(formatTr35Date("not a date", "ISO")).toBe("");
  });
});
