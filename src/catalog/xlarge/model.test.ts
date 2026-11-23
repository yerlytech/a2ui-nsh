import { describe, expect, test } from "nsh/test";
import {
  eventPayload,
  fieldControl,
  fieldOptions,
  formatAmount,
  formatCell,
  heldValues,
  missingRequired,
  recordRowsPath,
  tableColumns,
} from "./model";

const upper = (code: string): string => code.toUpperCase();

describe("xlarge catalog model", () => {
  test("maps every input kind to a control, unknown kinds to text", () => {
    expect(fieldControl("text")).toBe("text");
    expect(fieldControl("note")).toBe("multiline");
    expect(fieldControl("email")).toBe("email");
    expect(fieldControl("password")).toBe("password");
    expect(fieldControl("money")).toBe("number");
    expect(fieldControl("kurus")).toBe("number");
    expect(fieldControl("number")).toBe("number");
    expect(fieldControl("decimal")).toBe("number");
    expect(fieldControl("date")).toBe("date");
    expect(fieldControl("datetime")).toBe("datetime");
    expect(fieldControl("choice")).toBe("select");
    expect(fieldControl("record")).toBe("select");
    expect(fieldControl("barcode")).toBe("text");
    expect(fieldControl(undefined)).toBe("text");
  });

  test("choice options translate through optionPrefix", () => {
    expect(
      fieldOptions({ input: "choice", options: ["active", "won"], optionPrefix: "crm.state." }, undefined, upper),
    ).toEqual([
      { value: "active", title: "CRM.STATE.ACTIVE" },
      { value: "won", title: "CRM.STATE.WON" },
    ]);
    expect(fieldOptions({ input: "choice", options: ["a"] }, undefined, upper)).toEqual([
      { value: "a", title: "a" },
    ]);
  });

  test("record options read value/show keys from rows, skipping rows without a value", () => {
    const rows = [{ id: "p1", name: "acme" }, { name: "no id" }, "junk", { id: 7, name: "beta" }];
    expect(fieldOptions({ input: "record", value: "id", show: "name" }, rows, upper)).toEqual([
      { value: "p1", title: "acme" },
      { value: "7", title: "beta" },
    ]);
    // An empty optionPrefix still marks the shown value as a code.
    expect(
      fieldOptions({ input: "record", value: "id", show: "name", optionPrefix: "" }, [{ id: "x", name: "crm.pipeline.sales" }], upper),
    ).toEqual([{ value: "x", title: "CRM.PIPELINE.SALES" }]);
    expect(fieldOptions({ input: "record" }, undefined, upper)).toEqual([]);
  });

  test("record rows path escapes the key as one pointer segment", () => {
    expect(recordRowsPath("partners.list")).toBe("/partners.list");
    expect(recordRowsPath("a/b~c")).toBe("/a~1b~0c");
    expect(recordRowsPath("")).toBe(undefined);
    expect(recordRowsPath(3)).toBe(undefined);
  });

  test("held values use defaults for blanks and drop what is still blank", () => {
    const fields = [
      { name: "title", required: true, fallback: undefined },
      { name: "state", required: false, fallback: "active" },
      { name: "note", required: false, fallback: undefined },
    ];
    expect(heldValues(fields, { title: "Deal", note: "" })).toEqual({ title: "Deal", state: "active" });
    expect(heldValues(fields, { state: "won" })).toEqual({ state: "won" });
    expect(missingRequired(fields, { title: "" })).toEqual(["title"]);
    expect(missingRequired(fields, { title: "x" })).toEqual([]);
    expect(missingRequired([{ name: "k", required: true, fallback: "d" }], {})).toEqual([]);
  });

  test("amounts keep their digits and never pass through a float", () => {
    expect(formatAmount("25000")).toBe("25,000.00");
    expect(formatAmount("1234567.5")).toBe("1,234,567.50");
    expect(formatAmount("-0.125")).toBe("-0.125");
    expect(formatAmount("12345678901234567890.01")).toBe("12,345,678,901,234,567,890.01");
    expect(formatAmount(42)).toBe("42.00");
    expect(formatAmount("n/a")).toBe("n/a");
  });

  test("cells follow format and enumPrefix", () => {
    expect(formatCell("2026-11-20T09:15:00Z", { format: "date" }, upper)).toBe("2026-11-20");
    expect(formatCell("2026-11-20T09:15:00Z", { format: "datetime" }, upper)).toBe("2026-11-20 09:15");
    expect(formatCell("9.5", { format: "money" }, upper)).toBe("9.50");
    expect(formatCell(true, { format: "flag" }, upper)).toBe("✓");
    expect(formatCell(false, { format: "flag" }, upper)).toBe("✗");
    expect(formatCell(["a", "b"], { format: "list" }, upper)).toBe("a, b");
    expect(formatCell("crm.stage.new", { enumPrefix: "" }, upper)).toBe("CRM.STAGE.NEW");
    expect(formatCell(null, { format: "date" }, upper)).toBe("");
    expect(formatCell(3, {}, upper)).toBe("3");
  });

  test("columns drop entries without a field", () => {
    expect(
      tableColumns([{ field: "title", label: "l", grow: true }, { label: "no field" }, "x", { field: "amount", format: "money" }]),
    ).toEqual([
      { field: "title", label: "l", format: undefined, enumPrefix: undefined, grow: true },
      { field: "amount", label: "amount", format: "money", enumPrefix: undefined, grow: false },
    ]);
    expect(tableColumns(undefined)).toEqual([]);
  });

  test("event payload escapes @ keys so literals are never read as bindings", () => {
    expect(eventPayload("save", { a: 1, nested: { "@path": "/x" } })).toEqual({
      event: { name: "save", context: { a: 1, nested: { "@@path": "/x" } } },
    });
  });
});
