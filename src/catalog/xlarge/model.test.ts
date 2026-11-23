import { describe, expect, test } from "nsh/test";
import {
  actionContext,
  bindingPath,
  arrangeContext,
  arrangeMoved,
  arrangeRows,
  arrangeText,
  askStep,
  buttonVariant,
  moveItem,
  newArrangeItem,
  patchArrangeItem,
  opensContext,
  stepName,
  stepsAnswer,
  wizardStep,
  calendarMonth,
  chartKind,
  chartPoints,
  conversationRows,
  pieShares,
  sumDecimals,
  draftLines,
  draftNames,
  previewBody,
  literalContext,
  changeDirection,
  changePercent,
  changeTone,
  chequeLeafRows,
  columnWeights,
  detailEntries,
  encodeQr,
  eventPayload,
  metricText,
  detailEditContext,
  sameValue,
  fieldControl,
  fieldOptions,
  fillParams,
  formatAmount,
  formatCell,
  formatKurus,
  heldValues,
  messageText,
  missingRequired,
  recordRowsPath,
  reedSolomonRemainder,
  screenAction,
  tableColumns,
  textTone,
  type QrMatrix,
} from "./model";

const upper = (code: string): string => code.toUpperCase();

/** The 15 format bits of the copy around the top-left finder. */
function formatBitsTopLeft(qr: QrMatrix): number {
  const cells: [number, number][] = [];
  for (let i = 0; i <= 5; i++) cells.push([8, i]);
  cells.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) cells.push([14 - i, 8]);
  return cells.reduce((bits, [x, y], i) => bits | ((qr.rows[y]![x]! ? 1 : 0) << i), 0);
}

/** The 15 format bits of the split copy (top-right row, bottom-left column). */
function formatBitsSplit(qr: QrMatrix): number {
  let bits = 0;
  for (let i = 0; i < 8; i++) bits |= (qr.rows[8]![qr.size - 1 - i]! ? 1 : 0) << i;
  for (let i = 8; i < 15; i++) bits |= (qr.rows[qr.size - 15 + i]![8]! ? 1 : 0) << i;
  return bits;
}

/** Reads a version-1 code back: unmask by its format bits, then walk the zigzag. */
function readVersion1(qr: QrMatrix): number[] {
  const size = qr.size;
  const mask = ((formatBitsTopLeft(qr) ^ 0x5412) >>> 10) & 0b111;
  const isFunction = (x: number, y: number): boolean =>
    (x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8) || x === 6 || y === 6;
  const masks = [
    (x: number, y: number) => (x + y) % 2 === 0,
    (_x: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0,
    (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!isFunction(x, y)) {
          bits.push((qr.rows[y]![x]! !== masks[mask]!(x, y)) ? 1 : 0);
        }
      }
    }
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(bits.slice(i, i + 8).reduce((b, bit) => (b << 1) | bit, 0));
  }
  return bytes;
}

function finderAt(qr: QrMatrix, left: number, top: number): boolean {
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      if (qr.rows[top + dy]![left + dx] !== (ring !== 2)) return false;
    }
  }
  return true;
}

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
    expect(formatCell("2026-11-20", { format: "month_day" }, upper)).toBe("11-20");
    expect(formatCell("1987-02-03T00:00:00Z", { format: "month_day" }, upper)).toBe("02-03");
    expect(formatCell("soon", { format: "month_day" }, upper)).toBe("soon");
    expect(formatCell("1234567.5", { format: "number" }, upper)).toBe("1,234,567.5");
    expect(formatCell(1204, { format: "number" }, upper)).toBe("1,204");
    expect(formatCell("1250", { format: "kurus" }, upper)).toBe("12.50");
    expect(formatCell(7, { format: "rating" }, upper)).toBe("7");
  });

  test("kurus are whole minor units drawn as major units, from the text", () => {
    expect(formatKurus("1250")).toBe("12.50");
    expect(formatKurus("-5")).toBe("-0.05");
    expect(formatKurus("0")).toBe("0.00");
    expect(formatKurus("-0")).toBe("0.00");
    expect(formatKurus("7")).toBe("0.07");
    expect(formatKurus("100")).toBe("1.00");
    expect(formatKurus("123456789")).toBe("1,234,567.89");
    expect(formatKurus("00042")).toBe("0.42");
    expect(formatKurus("12345678901234567890123")).toBe("123,456,789,012,345,678,901.23");
    expect(formatKurus(1250)).toBe("12.50");
    expect(formatKurus("12.5")).toBe("12.5");
    expect(formatKurus("n/a")).toBe("n/a");
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

  test("button variants: only primary is primary, unknown or missing ones plain", () => {
    expect(buttonVariant("primary")).toBe("primary");
    expect(buttonVariant("danger")).toBe("danger");
    expect(buttonVariant("destructive")).toBe("danger");
    expect(buttonVariant("secondary")).toBe("secondary");
    expect(buttonVariant("ghost")).toBe("secondary");
    expect(buttonVariant("bad")).toBe("secondary");
    expect(buttonVariant("sparkly")).toBe("secondary");
    expect(buttonVariant(undefined)).toBe("secondary");
  });

  test("a literal context is copied as given; anything else is empty", () => {
    const given = { id: "d1", amount: "25000.50" };
    const copy = literalContext(given);
    expect(copy).toEqual(given);
    expect(copy === given).toBe(false);
    expect(literalContext({ "@@note": "x", nested: [{ "@@path": "/y" }] })).toEqual({
      "@note": "x",
      nested: [{ "@path": "/y" }],
    });
    expect(eventPayload("save", literalContext({ "@@note": "x" }))).toEqual({
      event: { name: "save", context: { "@@note": "x" } },
    });
    expect(literalContext(undefined)).toEqual({});
    expect(literalContext(["a"])).toEqual({});
    expect(literalContext("x")).toEqual({});
  });

  test("the ask flow: confirm asks first, only yes sends, cancel sends nothing", () => {
    expect(askStep("press", false)).toEqual({ asking: false, send: true });
    expect(askStep("press", true)).toEqual({ asking: true, send: false });
    expect(askStep("yes", true)).toEqual({ asking: false, send: true });
    expect(askStep("cancel", true)).toEqual({ asking: false, send: false });
  });

  test("Preview: draft names, the body once every named field holds a value, lines as typed", () => {
    const names = draftNames(["title", "amount", 3, "", null, { field: "x" }]);
    expect(names).toEqual(["title", "amount"]);
    expect(draftNames(undefined)).toEqual([]);

    // Not every named field holds a value yet: nothing is asked.
    expect(previewBody(names, "partner", { title: "Fleet" })).toBeUndefined();
    expect(previewBody(names, "partner", { title: "Fleet", amount: "25000.5", partner: "p1", other: 1 })).toEqual({
      draft: { title: "Fleet", amount: "25000.5" },
      about: "p1",
    });
    // `about` goes along only as non-empty text.
    expect(previewBody(names, "partner", { title: "", amount: "1", partner: "" })).toEqual({
      draft: { title: "", amount: "1" },
    });
    expect(previewBody([], undefined, {})).toEqual({ draft: {} });

    expect(draftLines(["amount", "tags", "missing"], { amount: "25000.50", tags: ["a", "b"] })).toEqual([
      { field: "amount", value: "25000.50" },
      { field: "tags", value: "a, b" },
      { field: "missing", value: "" },
    ]);
  });

  test("text tones map onto drawn tones, unknown tones to plain", () => {
    expect(textTone("muted")).toBe("muted");
    expect(textTone("hint")).toBe("muted");
    expect(textTone("strong")).toBe("strong");
    expect(textTone("success")).toBe("accent");
    expect(textTone("danger")).toBe("danger");
    expect(textTone("warning")).toBe("danger");
    expect(textTone("sparkly")).toBe("plain");
    expect(textTone(undefined)).toBe("plain");
  });

  test("params fill placeholders as typed text and leave unknown ones", () => {
    expect(fillParams("{n} deals worth {total}", { n: 3, total: "25000.50" })).toBe("3 deals worth 25000.50");
    expect(fillParams("Hello {who}", {})).toBe("Hello {who}");
    expect(fillParams("Hello {who}", undefined)).toBe("Hello {who}");
    expect(fillParams("{a}{a}", { a: null })).toBe("");
    const words = (code: string) => (code === "crm.saved" ? "Saved {title}" : code);
    expect(messageText("crm.saved", { title: "Forklift" }, words)).toBe("Saved Forklift");
    expect(messageText("crm.other", "junk", words)).toBe("crm.other");
  });

  test("back/after: an action name as it came, a bare screen prefixed, back sends nothing", () => {
    expect(screenAction("crm.deals")).toBe("screen:crm.deals");
    expect(screenAction("screen:crm.deal")).toBe("screen:crm.deal");
    expect(screenAction("crm.deal:close")).toBe("crm.deal:close");
    expect(screenAction("back")).toBe(undefined);
    expect(screenAction("")).toBe(undefined);
    expect(screenAction(undefined)).toBe(undefined);
  });

  test("binding paths: xlarge's path and A2UI's @path, one key only", () => {
    expect(bindingPath({ path: "/deal/id" })).toBe("/deal/id");
    expect(bindingPath({ "@path": "/deal/id" })).toBe("/deal/id");
    expect(bindingPath({ path: "/a", other: 1 })).toBe(undefined);
    expect(bindingPath({ path: 3 })).toBe(undefined);
    expect(bindingPath("/deal/id")).toBe(undefined);
    expect(bindingPath(undefined)).toBe(undefined);
  });

  test("action context reads bindings, keeps literals, and adds version", () => {
    const data: Record<string, unknown> = { "/deal/id": "d7", "/deal/version": 4 };
    const read = (path: string): unknown => data[path];
    expect(
      actionContext(
        { id: { path: "/deal/id" }, amount: "25000.50", "@@note": "x", nested: { a: 1, b: 2 } },
        read,
        { "@path": "/deal/version" },
      ),
    ).toEqual({ id: "d7", amount: "25000.50", "@note": "x", nested: { a: 1, b: 2 }, version: 4 });
    expect(actionContext(undefined, read, 9)).toEqual({ version: 9 });
    expect(actionContext({ id: "d1" }, read, { path: "/missing" })).toEqual({ id: "d1" });
    expect(actionContext(["a"], read)).toEqual({});
  });

  test("Reed–Solomon matches the published HELLO WORLD 1-M codewords", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomonRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  test("a QR code picks the smallest version and draws its fixed patterns", () => {
    const qr = encodeQr("https://xlarge.test/pay/42")!;
    expect(qr.version).toBe(2);
    expect(qr.size).toBe(25);
    expect(qr.rows).toHaveLength(25);
    expect(finderAt(qr, 0, 0)).toBe(true);
    expect(finderAt(qr, qr.size - 7, 0)).toBe(true);
    expect(finderAt(qr, 0, qr.size - 7)).toBe(true);
    for (let i = 8; i < qr.size - 8; i++) {
      expect(qr.rows[6]![i]).toBe(i % 2 === 0);
      expect(qr.rows[i]![6]).toBe(i % 2 === 0);
    }
    // The dark module, and the alignment pattern centred at (18, 18).
    expect(qr.rows[qr.size - 8]![8]).toBe(true);
    expect(qr.rows[18]![18]).toBe(true);
    expect(qr.rows[17]![18]).toBe(false);
    expect(qr.rows[16]![18]).toBe(true);
    // Both format copies agree and name error correction level M.
    const format = formatBitsTopLeft(qr);
    expect(formatBitsSplit(qr)).toBe(format);
    expect(((format ^ 0x5412) >>> 13) & 0b11).toBe(0);
  });

  test("a version 1 code reads back as its bytes and error correction", () => {
    const qr = encodeQr("Hi xlarge")!;
    expect(qr.version).toBe(1);
    const codewords = readVersion1(qr);
    expect(codewords).toHaveLength(26);
    const data = codewords.slice(0, 16);
    expect(reedSolomonRemainder(data, 10)).toEqual(codewords.slice(16));
    // Byte mode (0100), length 9, then the UTF-8 bytes.
    const bits = data.map((b) => b.toString(2).padStart(8, "0")).join("");
    expect(bits.slice(0, 4)).toBe("0100");
    expect(parseInt(bits.slice(4, 12), 2)).toBe(9);
    const text = Array.from({ length: 9 }, (_, i) =>
      String.fromCharCode(parseInt(bits.slice(12 + i * 8, 20 + i * 8), 2)),
    ).join("");
    expect(text).toBe("Hi xlarge");
  });

  test("version 7 and up carry version information; too much text does not fit", () => {
    const qr = encodeQr("x".repeat(110))!;
    expect(qr.version).toBe(7);
    expect(qr.size).toBe(45);
    let bits = 0;
    for (let i = 0; i < 18; i++) {
      const a = qr.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      expect(qr.rows[a]![b]).toBe(qr.rows[b]![a]);
      bits |= (qr.rows[b]![a]! ? 1 : 0) << i;
    }
    expect(bits).toBe(0x07c94);
    expect(encodeQr("é".repeat(1165))!.version).toBe(40);
    expect(encodeQr("x".repeat(2332))).toBe(undefined);
  });
});

describe("xlarge Columns, Detail, Metric and ChequeLeaf helpers", () => {
  test("columnWeights reads numbers and their text; the rest share evenly", () => {
    expect(columnWeights([2, 1], 2)).toEqual([2, 1]);
    expect(columnWeights(["2fr", "40%", " 1.5 "], 3)).toEqual([2, 40, 1.5]);
    expect(columnWeights([0, -1, "wide", null], 4)).toEqual([1, 1, 1, 1]);
    expect(columnWeights([3], 3)).toEqual([3, 1, 1]);
    expect(columnWeights(undefined, 2)).toEqual([1, 1]);
    expect(columnWeights([1, 2, 3], 1)).toEqual([1]);
  });

  test("detailEntries labels, formats and skips empty values", () => {
    const record = { id: "d1", title: "Fleet", amount: "25000.5", stage: "won", note: "", nested: { a: 1 } };
    const rows = [
      { field: "title", label: "crm.field.title" },
      { field: "amount", label: "crm.field.amount", format: "money" },
      { field: "stage", label: "crm.field.stage", enumPrefix: "crm.stage." },
      "note",
      { label: "no field" },
    ];
    expect(detailEntries(rows, record, false, upper)).toEqual([
      { field: "title", label: "CRM.FIELD.TITLE", text: "Fleet" },
      { field: "amount", label: "CRM.FIELD.AMOUNT", text: "25,000.50" },
      { field: "stage", label: "CRM.FIELD.STAGE", text: "CRM.STAGE.WON" },
      { field: "note", label: "NOTE", text: "" },
    ]);
    expect(detailEntries(rows, record, true, upper).map((e) => e.field)).toEqual(["title", "amount", "stage"]);
    // Without rows: every plain value under its key, nested objects left out.
    expect(detailEntries(undefined, record, true, (c) => c).map((e) => e.field)).toEqual([
      "id",
      "title",
      "amount",
      "stage",
    ]);
    expect(detailEntries(rows, null, true, upper)).toEqual([]);
  });

  test("detailEntries: with update, an edit row is correctable and survives skipEmpty", () => {
    const record = { id: "d1", note: "", dept: "Sales", dept_code: "S1" };
    const rows = [
      { field: "note", label: "n", edit: { input: "note" } },
      { field: "dept", label: "d", edit: { input: "record", field: "dept_code" } },
      { field: "title", label: "t" },
    ];
    expect(detailEntries(rows, record, true, upper, true)).toEqual([
      { field: "note", label: "N", text: "", edit: { field: "note", input: "note" } },
      { field: "dept", label: "D", text: "Sales", edit: { field: "dept_code", input: "record" } },
    ]);
    // Without update nothing is correctable, and the empty note is skipped.
    expect(detailEntries(rows, record, true, upper, false)).toEqual([
      { field: "dept", label: "D", text: "Sales" },
    ]);
  });

  test("detailEditContext sends id, version and the one value; empty is null", () => {
    expect(detailEditContext({ id: "d1", version: 4, note: "a" }, "note", "b")).toEqual({
      id: "d1",
      version: 4,
      note: "b",
    });
    expect(detailEditContext({ id: "d1" }, "note", "")).toEqual({ id: "d1", note: null });
    expect(detailEditContext(undefined, "note", "x")).toEqual({ note: "x" });
    expect(sameValue("12", 12)).toBe(true);
    expect(sameValue("", null)).toBe(true);
    expect(sameValue("a", "b")).toBe(false);
  });

  test("metricText formats from the text, never through a float", () => {
    expect(metricText("1250000.5", "money")).toBe("1,250,000.50");
    expect(metricText("0.1", "decimal")).toBe("0.10");
    expect(metricText("12345678901234567890.123", "amount")).toBe("12,345,678,901,234,567,890.123");
    expect(metricText("12.5", "percent")).toBe("12.5%");
    expect(metricText("12.5%", "percent")).toBe("12.5%");
    expect(metricText("1204", "count")).toBe("1,204");
    expect(metricText("-98765.4321", "number")).toBe("-98,765.4321");
    expect(metricText(42, "integer")).toBe("42");
    expect(metricText("n/a", "count")).toBe("n/a");
    expect(metricText("1204", undefined)).toBe("1204");
    expect(metricText(null, "money")).toBe("");
  });

  test("changeDirection, changePercent and changeTone follow `better`", () => {
    expect(changeDirection("12.5")).toBe("up");
    expect(changeDirection("+4")).toBe("up");
    expect(changeDirection("-3")).toBe("down");
    expect(changeDirection("-0.00")).toBe("flat");
    expect(changeDirection("4%")).toBe("up");
    expect(changeDirection("soon")).toBe(undefined);

    // A whole-number percent, rounded half away from zero on the text.
    expect(changePercent("12.5")).toBe("13%");
    expect(changePercent("12.49")).toBe("12%");
    expect(changePercent("-12.5")).toBe("13%");
    expect(changePercent("-2.4")).toBe("2%");
    expect(changePercent("+4")).toBe("4%");
    expect(changePercent("99.5%")).toBe("100%");
    expect(changePercent("0.4")).toBe("0%");
    expect(changePercent("0")).toBe("0%");
    expect(changePercent("001234.7")).toBe("1,235%");
    expect(changePercent("99999999999999999999.5")).toBe("100,000,000,000,000,000,000%");
    expect(changePercent(7)).toBe("7%");
    expect(changePercent("soon")).toBe(undefined);
    expect(changePercent(null)).toBe(undefined);
    expect(changePercent("")).toBe(undefined);

    expect(changeTone("up", "up")).toBe("good");
    expect(changeTone("down", "up")).toBe("bad");
    expect(changeTone("up", "lower")).toBe("bad");
    expect(changeTone("down", "less")).toBe("good");
    expect(changeTone("flat", "up")).toBe("neutral");
    expect(changeTone("up", undefined)).toBe("neutral");
    expect(changeTone(undefined, "up")).toBe("neutral");
  });

  test("chequeLeafRows reads one leaf per row, the state word only when void", () => {
    const rows = [
      {
        id: "leaf-1",
        number: "CHK-2026-0001",
        state: "printed",
        date: "2026-11-20",
        payee: "Acme Logistics",
        amount: "15000",
        amountWords: "Fifteen thousand",
        memo: "Invoice 42",
        layout: { date: { top: 12, left: 160 }, amount: { top: 30, left: 160 } },
        stub: { number: "CHK-2026-0001", date: "2026-11-20", payee: "Acme Logistics", amount: "15000.5", memo: "Invoice 42" },
      },
      { number: "CHK-2026-0002", state: "void", stub: null },
      "not a row",
      { state: "blank" },
    ];
    expect(chequeLeafRows(rows, "bank.cheque_leaf_state.", upper)).toEqual([
      {
        key: "id:leaf-1",
        number: "CHK-2026-0001",
        state: "printed",
        voidWord: "",
        date: "2026-11-20",
        payee: "Acme Logistics",
        amount: "15,000.00",
        amountWords: "Fifteen thousand",
        memo: "Invoice 42",
        stub: { number: "CHK-2026-0001", date: "2026-11-20", payee: "Acme Logistics", amount: "15,000.50", memo: "Invoice 42" },
      },
      {
        key: "no:CHK-2026-0002",
        number: "CHK-2026-0002",
        state: "void",
        voidWord: "BANK.CHEQUE_LEAF_STATE.VOID",
        date: "",
        payee: "",
        amount: "",
        amountWords: "",
        memo: "",
        stub: undefined,
      },
      {
        key: "at:2",
        number: "",
        state: "blank",
        voidWord: "",
        date: "",
        payee: "",
        amount: "",
        amountWords: "",
        memo: "",
        stub: undefined,
      },
    ]);
    // An amount that is not a plain decimal is shown as it came.
    expect(chequeLeafRows([{ amount: "1.250,00" }], undefined, upper)[0]!.amount).toBe("1.250,00");
    expect(chequeLeafRows([{ state: "void" }], undefined, upper)[0]!.voidWord).toBe("VOID");
    expect(chequeLeafRows(undefined, "x.", upper)).toEqual([]);
  });

  test("chartKind reads bar, line and pie with their synonyms", () => {
    expect(chartKind("line")).toBe("line");
    expect(chartKind("area")).toBe("line");
    expect(chartKind("pie")).toBe("pie");
    expect(chartKind("donut")).toBe("pie");
    expect(chartKind("bar")).toBe("bar");
    expect(chartKind("radar")).toBe("bar");
    expect(chartKind(undefined)).toBe("bar");
  });

  test("chartPoints formats labels and values from text and reads tones", () => {
    const rows = [
      { id: 1, label: "won", value: "125000.1" },
      { name: "open", amount: 40000 },
      { key: "lost", count: "n/a" },
      "not a row",
    ];
    expect(
      chartPoints(rows, { format: "money", labelPrefix: "crm.stage.", tones: { won: "good", open: "nope" } }, upper),
    ).toEqual([
      { key: "id:1", label: "CRM.STAGE.WON", raw: "125000.1", value: "125,000.10", size: 125000.1, tone: "accent" },
      { key: "at:1:open", label: "CRM.STAGE.OPEN", raw: "40000", value: "40,000.00", size: 40000 },
      { key: "at:2:lost", label: "CRM.STAGE.LOST", raw: "n/a", value: "n/a", size: 0 },
    ]);
    expect(chartPoints({ "2026-10-01T00:00:00Z": "3" }, { labelFormat: "date" }, upper)).toEqual([
      { key: "at:0:2026-10-01T00:00:00Z", label: "2026-10-01", raw: "3", value: "3", size: 3 },
    ]);
    expect(chartPoints(undefined, {}, upper)).toEqual([]);
  });

  test("sumDecimals adds exactly, never through a float", () => {
    expect(sumDecimals(["0.1", "0.2"])).toBe("0.3");
    expect(sumDecimals(["125000.10", "40000.20", "9000"])).toBe("174000.30");
    expect(sumDecimals(["-5.5", "2"])).toBe("-3.5");
    expect(sumDecimals(["99999999999999999.99", "0.01"])).toBe("100000000000000000.00");
    expect(sumDecimals(["n/a", "+4"])).toBe("4");
    expect(sumDecimals([])).toBe("0");
  });

  test("pieShares gives positive points their share", () => {
    expect(pieShares([{ size: 3 }, { size: 1 }, { size: -2 }])).toEqual([0.75, 0.25, 0]);
    expect(pieShares([{ size: 0 }])).toEqual([0]);
  });

  test("calendarMonth lays out a month Monday first with its marks", () => {
    const month = calendarMonth({ month: "2026-11", days: [{ date: "2026-11-24", count: 5 }, { date: "", count: 1 }] });
    expect(month?.year).toBe(2026);
    expect(month?.month).toBe(11);
    // 1 November 2026 is a Sunday: six blanks lead, five weeks after.
    expect(month?.weeks.length).toBe(6);
    expect(month?.weeks[0]!.map((day) => day.day)).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(month?.weeks[5]!.map((day) => day.day)).toEqual([30, 0, 0, 0, 0, 0, 0]);
    const marked = month?.weeks.flat().find((day) => day.date === "2026-11-24");
    expect(marked).toEqual({ key: "2026-11-24", date: "2026-11-24", day: 24, mark: "5" });

    // February 2027 starts on a Monday: four full weeks, no blanks.
    const february = calendarMonth("2027-02-14");
    expect(february?.weeks.length).toBe(4);
    expect(february?.weeks[0]![0]!.date).toBe("2027-02-01");
    expect(calendarMonth({ start: "2028-02", days: { "2028-02-29": "Stock count" } })?.weeks.flat().find((day) => day.day === 29)?.mark).toBe("Stock count");
    expect(calendarMonth("2026-13")).toBe(undefined);
    expect(calendarMonth(undefined)).toBe(undefined);
  });

  test("conversationRows reads messages, their side, and the other party", () => {
    const rows = [
      { id: "m1", text: "Hello", at: "2026-11-20T09:15:00Z" },
      { id: "m2", body: "Hi", from: "Deniz", direction: "out" },
      { message: "Ok", mine: true },
      { text: "Bye", author: "Ece", date: "2026-11-21" },
    ];
    expect(conversationRows(rows, "Acme")).toEqual([
      { key: "id:m1", id: "m1", author: "Acme", text: "Hello", at: "2026-11-20 09:15", mine: false },
      { key: "id:m2", id: "m2", author: "Deniz", text: "Hi", at: "", mine: true },
      { key: "at:2", id: undefined, author: "", text: "Ok", at: "", mine: true },
      { key: "at:3", id: undefined, author: "Ece", text: "Bye", at: "2026-11-21", mine: false },
    ]);
    expect(conversationRows(undefined, "Acme")).toEqual([]);
  });
});

describe("wizardStep", () => {
  test("next moves on from a complete page and stays on an incomplete one", () => {
    expect(wizardStep("next", 0, 3, true)).toEqual({ page: 1, submit: false });
    expect(wizardStep("next", 1, 3, false)).toEqual({ page: 1, submit: false });
  });

  test("next on the last page submits; back stops at the first page", () => {
    expect(wizardStep("next", 2, 3, true)).toEqual({ page: 2, submit: true });
    expect(wizardStep("next", 0, 1, true)).toEqual({ page: 0, submit: true });
    expect(wizardStep("back", 2, 3, false)).toEqual({ page: 1, submit: false });
    expect(wizardStep("back", 0, 3, true)).toEqual({ page: 0, submit: false });
  });

  test("a page out of range is clamped first", () => {
    expect(wizardStep("next", 9, 3, true)).toEqual({ page: 2, submit: true });
    expect(wizardStep("back", -4, 3, true)).toEqual({ page: 0, submit: false });
    expect(wizardStep("next", 0, 0, true)).toEqual({ page: 0, submit: true });
  });
});

describe("Steps helpers", () => {
  test("stepsAnswer reads the steps, last words and stop code from the answer", () => {
    const answer = {
      words: "Made the deal.",
      stopped: "agents.stopped.budget",
      steps: [
        { action: "crm.create_deal", input: { title: "Fleet" }, outcome: "done", opens: { screen: "screen:crm.deal", about: "d1" } },
        { action: "crm.delete_deal", input: { id: "d0" }, outcome: "refused", code: "auth.forbidden" },
        { action: "crm.win_deal", input: { id: "d1" }, outcome: "waiting" },
        { action: "crm.deals", outcome: "looked" },
        { input: {} },
        "crm.deals",
      ],
    };
    expect(stepsAnswer(answer, undefined)).toEqual({
      words: "Made the deal.",
      stopped: "agents.stopped.budget",
      steps: [
        {
          action: "crm.create_deal",
          input: { title: "Fleet" },
          outcome: "done",
          opens: { screen: "screen:crm.deal", about: "d1" },
        },
        { action: "crm.delete_deal", input: { id: "d0" }, outcome: "refused", code: "auth.forbidden" },
        { action: "crm.win_deal", input: { id: "d1" }, outcome: "waiting" },
        { action: "crm.deals", input: {}, outcome: undefined },
      ],
    });
    // `answer` names the key; an empty list still draws (as "no steps").
    expect(stepsAnswer({ flow: [] }, "flow")).toEqual({ steps: [] });
  });

  test("stepsAnswer is undefined without an answer or without a list under the key", () => {
    expect(stepsAnswer(null, "steps")).toBeUndefined();
    expect(stepsAnswer(undefined, undefined)).toBeUndefined();
    expect(stepsAnswer({ steps: "x" }, undefined)).toBeUndefined();
    expect(stepsAnswer({ steps: [] }, "flow")).toBeUndefined();
    expect(stepsAnswer([{ action: "a" }], undefined)).toBeUndefined();
  });

  test("stepName: the audit words of a write, else a look into the module's list", () => {
    const words: Record<string, string> = {
      "audit.action.crm.create_deal": "Created a deal",
      "crm.nav.crm": "Deals",
      "agents.step.looked_in": "Looked in {place}",
      "agents.step.looked": "Looked",
    };
    const translate = (code: string): string => words[code] ?? code;
    expect(stepName("crm.create_deal", translate)).toBe("Created a deal");
    expect(stepName("crm.deals", translate)).toBe("Looked in Deals");
    expect(stepName("bank.accounts", translate)).toBe("Looked");
    expect(stepName("bank.accounts", (code) => code)).toBe("agents.step.looked");
  });

  test("opensContext: an object as it is, an id as { id }, nothing as {}", () => {
    expect(opensContext({ id: "d1", tab: "notes" })).toEqual({ id: "d1", tab: "notes" });
    expect(opensContext("d1")).toEqual({ id: "d1" });
    expect(opensContext(7)).toEqual({ id: 7 });
    expect(opensContext(undefined)).toEqual({});
    expect(opensContext(null)).toEqual({});
  });
});

describe("Arrange helpers", () => {
  test("moveItem moves one entry and ignores moves out of range", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 2)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 0.5, 1)).toEqual(["a", "b"]);
    const items = ["a", "b"];
    expect(moveItem(items, 0, 1)).not.toBe(items);
    expect(items).toEqual(["a", "b"]);
  });

  const WORDS: Record<string, string> = { "lab.block.header": "Header", "lab.block.note": "Note" };
  const say = (code: string): string => WORDS[code] ?? code;

  test("arrangeText shows the translated label, else the key or kind", () => {
    expect(arrangeText({ kind: "header", label: "lab.block.header" }, say)).toBe("Header");
    expect(arrangeText({ kind: "x", label: "lab.missing" }, say)).toBe("lab.missing");
    expect(arrangeText({ key: "note-2", kind: "note" }, say)).toBe("note-2");
    expect(arrangeText({ kind: "note" }, say)).toBe("note");
    expect(arrangeText({}, say)).toBe("");
    expect(arrangeText("Won", say)).toBe("Won");
    expect(arrangeText(null, say)).toBe("");
  });

  test("arrangeRows keys each item: key, else kind, else kind-<n> when removable", () => {
    const rows = arrangeRows(
      [
        { kind: "header", label: "lab.block.header", shown: true, kept: true },
        { key: "note-1", kind: "note", label: "lab.block.note", shown: false, removable: true, text: "a" },
        { kind: "note", label: "lab.block.note", shown: true, removable: true, text: "" },
        { kind: "note", label: "lab.block.note", removable: true, fields: ["x"] },
        { kind: "results", label: "lab.block.results" },
      ],
      say,
    );
    expect(rows.map((row) => row.key)).toEqual(["header", "note-1", "note-2", "note-3", "results"]);
    expect(rows.map((row) => row.text)).toEqual(["Header", "Note", "Note", "Note", "lab.block.results"]);
    expect(rows.map((row) => row.shown)).toEqual([true, false, true, true, true]);
    expect(rows.map((row) => row.kept)).toEqual([true, false, false, false, false]);
    expect(rows.map((row) => row.removable)).toEqual([false, true, true, true, false]);
    expect(rows.map((row) => row.note)).toEqual([undefined, "a", "", undefined, undefined]);
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2, 3, 4]);
  });

  test("patchArrangeItem changes one object item and leaves the list as it came", () => {
    const items = [{ kind: "a", shown: true }, { kind: "b", shown: true }];
    expect(patchArrangeItem(items, 1, { shown: false })).toEqual([
      { kind: "a", shown: true },
      { kind: "b", shown: false },
    ]);
    expect(items[1]).toEqual({ kind: "b", shown: true });
    expect(patchArrangeItem(["plain"], 0, { shown: false })).toEqual(["plain"]);
  });

  test("newArrangeItem is a removable, shown item of kind add with a label code", () => {
    expect(newArrangeItem("note", "lab.block.note")).toEqual({
      kind: "note",
      label: "lab.block.note",
      shown: true,
      removable: true,
      text: "",
    });
    expect(newArrangeItem("note", undefined)).toEqual({
      kind: "note",
      label: "note",
      shown: true,
      removable: true,
      text: "",
    });
    expect(newArrangeItem(undefined, "lab.block.note")).toBe(undefined);
    expect(newArrangeItem("", "lab.block.note")).toBe(undefined);
  });

  test("arrangeContext sends the items under field, with version when set", () => {
    expect(arrangeContext("blocks", [{ kind: "b" }, { kind: "a" }], 7)).toEqual({
      blocks: [{ kind: "b" }, { kind: "a" }],
      version: 7,
    });
    expect(arrangeContext("blocks", [], undefined)).toEqual({ blocks: [] });
    expect(arrangeContext(undefined, ["a"], null)).toEqual({ items: ["a"] });
    expect(arrangeContext("", ["a"], "v")).toEqual({ items: ["a"], version: "v" });
  });

  test("arrangeMoved fills name, place and count", () => {
    expect(arrangeMoved("{name} moved to {at} of {count}", "Note", 2, 5)).toBe("Note moved to 2 of 5");
    expect(arrangeMoved("{at}/{count}: {name} {name}", "X", 1, 1)).toBe("1/1: X X");
  });
});
