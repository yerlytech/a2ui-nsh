import { describe, expect, test } from "nsh/test";
import {
  formatAmount,
  formatCell,
  formatKurus,
  formatMonthDay,
  guardShown,
  heldValues,
  isBlank,
  lastOfMonth,
  calendarPeriod,
  missingRequired,
  RECORD_EMOJI,
  stateTone,
  tableColumns,
  tableRows,
} from "./model";

const upper = (code: string): string => code.toUpperCase();

describe("xlarge model rules", () => {
  test("isBlank: only a missing, empty, or empty-list value is blank", () => {
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank("")).toBe(true);
    expect(isBlank([])).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank(false)).toBe(false);
    expect(isBlank(" ")).toBe(false);
    expect(isBlank({})).toBe(false);
    expect(isBlank([""])).toBe(false);
  });

  test("guardShown: when needs something, unless needs nothing", () => {
    expect(guardShown(undefined, undefined)).toBe(true);

    expect(guardShown({ value: false }, undefined)).toBe(false);
    expect(guardShown({ value: 0 }, undefined)).toBe(false);
    expect(guardShown({ value: null }, undefined)).toBe(false);
    expect(guardShown({ value: "" }, undefined)).toBe(false);
    expect(guardShown({ value: [] }, undefined)).toBe(false);
    expect(guardShown({ value: undefined }, undefined)).toBe(false);
    expect(guardShown({ value: "x" }, undefined)).toBe(true);
    expect(guardShown({ value: 1 }, undefined)).toBe(true);
    expect(guardShown({ value: true }, undefined)).toBe(true);
    expect(guardShown({ value: {} }, undefined)).toBe(true);

    expect(guardShown(undefined, { value: "x" })).toBe(false);
    expect(guardShown(undefined, { value: 1 })).toBe(false);
    expect(guardShown(undefined, { value: true })).toBe(false);
    expect(guardShown(undefined, { value: {} })).toBe(false);
    expect(guardShown(undefined, { value: false })).toBe(true);
    expect(guardShown(undefined, { value: 0 })).toBe(true);
    expect(guardShown(undefined, { value: null })).toBe(true);
    expect(guardShown(undefined, { value: "" })).toBe(true);
    expect(guardShown(undefined, { value: [] })).toBe(true);

    expect(guardShown({ value: "x" }, { value: false })).toBe(true);
    expect(guardShown({ value: {} }, { value: 0 })).toBe(true);
    expect(guardShown({ value: false }, { value: false })).toBe(false);
    expect(guardShown({ value: "x" }, { value: "x" })).toBe(false);
    expect(guardShown({ value: 1 }, { value: 1 })).toBe(false);
    expect(guardShown({ value: [] }, { value: undefined })).toBe(false);
  });

  test("heldValues: a default fills only a blank, and still-blank fields drop out", () => {
    const fields = [
      { name: "count", required: true, fallback: 9 },
      { name: "flag", required: false, fallback: true },
      { name: "title", required: true, fallback: undefined },
      { name: "note", required: false, fallback: "" },
      { name: "state", required: false, fallback: "active" },
    ];
    expect(
      heldValues(fields, { count: 0, flag: false, title: "", note: "" }),
    ).toEqual({ count: 0, flag: false, state: "active" });
    expect(heldValues(fields, { title: "Deal" })).toEqual({
      count: 9,
      flag: true,
      title: "Deal",
      state: "active",
    });
    expect(missingRequired(fields, { title: "" })).toEqual(["title"]);
    expect(
      missingRequired([{ name: "state", required: true, fallback: "active" }], {}),
    ).toEqual([]);
  });

  test("tableColumns: fields are required; label, grow, format and enumPrefix are read strictly", () => {
    expect(tableColumns(undefined)).toEqual([]);
    expect(tableColumns(null)).toEqual([]);
    expect(tableColumns("x")).toEqual([]);
    expect(tableColumns({ field: "x" })).toEqual([]);
    expect(
      tableColumns([
        { field: "amount", format: "money" },
        { field: "title", label: "Title", grow: true },
        { field: "code", grow: "true" },
        { field: "rank", grow: 1 },
        { field: "kind", format: 1, enumPrefix: 2 },
        { label: "no field" },
        "junk",
      ]),
    ).toEqual([
      { field: "amount", label: "amount", format: "money", enumPrefix: undefined, grow: false },
      { field: "title", label: "Title", format: undefined, enumPrefix: undefined, grow: true },
      { field: "code", label: "code", format: undefined, enumPrefix: undefined, grow: false },
      { field: "rank", label: "rank", format: undefined, enumPrefix: undefined, grow: false },
      { field: "kind", label: "kind", format: undefined, enumPrefix: undefined, grow: false },
    ]);
  });

  test("formatAmount: two decimals and grouped thousands, never rounded", () => {
    expect(formatAmount("25000.5")).toBe("25,000.50");
    expect(formatAmount("-1234")).toBe("-1,234.00");
    expect(formatAmount(" 12 ")).toBe("12.00");
    expect(formatAmount("abc")).toBe("abc");
    expect(formatAmount("1e3")).toBe("1e3");
    expect(formatAmount("+5")).toBe("+5");
    expect(formatAmount("1,000")).toBe("1,000");
    // Three fraction digits come back unchanged: the function pads, it never rounds.
    expect(formatAmount("1.234")).toBe("1.234");
  });

  test("formatKurus: whole minor units drawn as major units, from the text", () => {
    expect(formatKurus("1250")).toBe("12.50");
    expect(formatKurus("-5")).toBe("-0.05");
    expect(formatKurus("-0")).toBe("0.00");
    expect(formatKurus("007")).toBe("0.07");
    expect(formatKurus("+7")).toBe("0.07");
    expect(formatKurus("123456789")).toBe("1,234,567.89");
    expect(formatKurus("12.5")).toBe("12.5");
    expect(formatKurus("")).toBe("");
  });

  describe("formatMonthDay and formatCell", () => {
    test("blank values show nothing", () => {
      expect(formatMonthDay(null)).toBe("");
      expect(formatMonthDay(undefined)).toBe("");
      expect(formatCell(null, { format: "date" }, upper)).toBe("");
      expect(formatCell(undefined, { format: "money" }, upper)).toBe("");
    });

    test("date keeps the first ten characters", () => {
      expect(formatCell("2026-11-20T09:15:00Z", { format: "date" }, upper)).toBe("2026-11-20");
    });

    test("datetime keeps minutes and replaces the T", () => {
      expect(formatCell("2026-11-20T09:15:00Z", { format: "datetime" }, upper)).toBe(
        "2026-11-20 09:15",
      );
    });

    test("month_day shows the month and day, other text as it came", () => {
      expect(formatMonthDay("2026-11-20")).toBe("11-20");
      expect(formatCell("2026-11-20T09:15:00Z", { format: "month_day" }, upper)).toBe("11-20");
      expect(formatCell("soon", { format: "month_day" }, upper)).toBe("soon");
    });

    test("money and decimal use formatAmount", () => {
      expect(formatCell("9.5", { format: "money" }, upper)).toBe("9.50");
      expect(formatCell("25000.5", { format: "decimal" }, upper)).toBe("25,000.50");
    });

    test("kurus uses formatKurus", () => {
      expect(formatCell("1250", { format: "kurus" }, upper)).toBe("12.50");
    });

    test("number groups thousands", () => {
      expect(formatCell(1204, { format: "number" }, upper)).toBe("1,204");
      expect(formatCell("1234567.5", { format: "number" }, upper)).toBe("1,234,567.5");
    });

    test("flag is a check or a cross only for booleans", () => {
      expect(formatCell(true, { format: "flag" }, upper)).toBe("✓");
      expect(formatCell(false, { format: "flag" }, upper)).toBe("✗");
      expect(formatCell(1, { format: "flag" }, upper)).toBe("1");
      expect(formatCell("yes", { format: "flag" }, upper)).toBe("yes");
    });

    test("list joins entries with a comma and a space", () => {
      expect(formatCell(["a", "b"], { format: "list" }, upper)).toBe("a, b");
      expect(formatCell([1, "a", true], { format: "list" }, upper)).toBe("1, a, true");
    });

    test("enumPrefix translates a scalar once and a list entry by entry, over format", () => {
      const codes: string[] = [];
      const speak = (code: string): string => {
        codes.push(code);
        return `[${code}]`;
      };
      expect(formatCell("new", { enumPrefix: "crm.stage." }, speak)).toBe("[crm.stage.new]");
      expect(codes).toEqual(["crm.stage.new"]);
      codes.length = 0;
      expect(formatCell(["new", "won"], { enumPrefix: "crm.stage." }, speak)).toBe(
        "[crm.stage.new], [crm.stage.won]",
      );
      expect(codes).toEqual(["crm.stage.new", "crm.stage.won"]);
      codes.length = 0;
      expect(
        formatCell("2026-11-20", { format: "date", enumPrefix: "d." }, speak),
      ).toBe("[d.2026-11-20]");
      expect(codes).toEqual(["d.2026-11-20"]);
    });

    test("an unknown format shows the value as it came", () => {
      expect(formatCell(7, { format: "rating" }, upper)).toBe("7");
      expect(formatCell("plain", {}, upper)).toBe("plain");
    });
  });

  test("tableRows: only objects survive, in order", () => {
    expect(tableRows(undefined)).toEqual([]);
    expect(tableRows("x")).toEqual([]);
    expect(tableRows({ a: 1 })).toEqual([]);
    const first = { id: "a" };
    const second = { id: "b" };
    expect(tableRows([first, null, 3, "x", [second], second])).toEqual([first, second]);
    expect(tableRows([first, second])[0]).toBe(first);
  });

  test("stateTone: the five known words only, exactly as written", () => {
    expect(stateTone("neutral")).toBe("neutral");
    expect(stateTone("info")).toBe("info");
    expect(stateTone("success")).toBe("success");
    expect(stateTone("warning")).toBe("warning");
    expect(stateTone("danger")).toBe("danger");
    expect(stateTone("Danger")).toBe(undefined);
    expect(stateTone("")).toBe(undefined);
    expect(stateTone(undefined)).toBe(undefined);
    expect(stateTone(3)).toBe(undefined);
  });

  test("lastOfMonth and calendarPeriod: a month first and last day", () => {
    expect(lastOfMonth("2024-02")).toBe("2024-02-29");
    expect(lastOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastOfMonth("2026-12")).toBe("2026-12-31");
    expect(lastOfMonth("nope")).toBe("");
    expect(lastOfMonth("")).toBe("");
    expect(calendarPeriod("nope")).toBe(undefined);
    expect(calendarPeriod("")).toBe(undefined);
    expect(calendarPeriod("2026-11")).toEqual({
      period: "between",
      from: "2026-11-01",
      to: "2026-11-30",
    });
    // Pinned as it is today: an out-of-range month is not rejected.
    expect(lastOfMonth("2026-13")).toBe("2026-13-31");
  });

  test("RECORD_EMOJI: the three offered emojis, in order", () => {
    expect(RECORD_EMOJI).toEqual(["👍", "✅", "👀"]);
  });
});
