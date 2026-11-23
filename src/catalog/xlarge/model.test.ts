import { describe, expect, test } from "nsh/test";
import {
  arrangeContext,
  arrangeText,
  askStep,
  buttonVariant,
  moveItem,
  newArrangeItem,
  stepsList,
  wizardStep,
  draftLines,
  literalContext,
  changeDirection,
  changeText,
  changeTone,
  chequeLeafRows,
  columnWeights,
  detailEntries,
  encodeQr,
  eventPayload,
  metricText,
  recordContext,
  fieldControl,
  fieldOptions,
  fillParams,
  formatAmount,
  formatCell,
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

  test("button variants map onto drawn variants, unknown ones to primary", () => {
    expect(buttonVariant("secondary")).toBe("secondary");
    expect(buttonVariant("ghost")).toBe("secondary");
    expect(buttonVariant("danger")).toBe("danger");
    expect(buttonVariant("destructive")).toBe("danger");
    expect(buttonVariant("primary")).toBe("primary");
    expect(buttonVariant("sparkly")).toBe("primary");
    expect(buttonVariant(undefined)).toBe("primary");
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

  test("draft lines: labelled values, formatted amounts as text, plain entries", () => {
    const words: Record<string, string> = { "f.title": "Title", "f.amount": "Amount", "s.open": "Open" };
    const translate = (code: string): string => words[code] ?? code;
    expect(
      draftLines(
        [
          { label: "f.title", value: "Forklift fleet" },
          { label: "f.amount", value: "25000.5", format: "money" },
          { field: "state", value: "open", enumPrefix: "s." },
          { value: 3 },
          "a plain line",
          7,
          null,
          { partner: "acme", tags: ["a", "b"] },
        ],
        translate,
      ),
    ).toEqual([
      { label: "Title", value: "Forklift fleet" },
      { label: "Amount", value: "25,000.50" },
      { label: "state", value: "Open" },
      { value: "3" },
      { value: "a plain line" },
      { value: "7" },
      { label: "partner", value: "acme" },
      { label: "tags", value: "a, b" },
    ]);
    expect(draftLines(undefined, translate)).toEqual([]);
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

  test("back names a screen action", () => {
    expect(screenAction("crm.deals")).toBe("screen:crm.deals");
    expect(screenAction("screen:crm.deal")).toBe("screen:crm.deal");
    expect(screenAction("")).toBe(undefined);
    expect(screenAction(undefined)).toBe(undefined);
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

  test("recordContext carries the record's id only", () => {
    expect(recordContext({ id: 7, title: "x" })).toEqual({ id: 7 });
    expect(recordContext({ title: "x" })).toEqual({});
    expect(recordContext(undefined)).toEqual({});
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

  test("changeDirection, changeText and changeTone follow `better`", () => {
    expect(changeDirection("12.5")).toBe("up");
    expect(changeDirection("+4")).toBe("up");
    expect(changeDirection("-3")).toBe("down");
    expect(changeDirection("-0.00")).toBe("flat");
    expect(changeDirection("4%")).toBe("up");
    expect(changeDirection("soon")).toBe(undefined);

    expect(changeText("12.5", "percent")).toBe("+12.5%");
    expect(changeText("-2500.5", "money")).toBe("-2,500.50");
    expect(changeText("+4", "count")).toBe("+4");
    expect(changeText("0", undefined)).toBe("0");

    expect(changeTone("up", "up")).toBe("good");
    expect(changeTone("down", "up")).toBe("bad");
    expect(changeTone("up", "lower")).toBe("bad");
    expect(changeTone("down", "less")).toBe("good");
    expect(changeTone("flat", "up")).toBe("neutral");
    expect(changeTone("up", undefined)).toBe("neutral");
    expect(changeTone(undefined, "up")).toBe("neutral");
  });

  test("chequeLeafRows translates states and formats dates and amounts", () => {
    const rows = [
      { id: 1, state: "portfolio", date: "2026-10-01T09:00:00Z", amount: "15000", party: "Acme" },
      { state: "endorsed", at: "2026-10-15", partner: "Bolt", note: "to supplier" },
      "not a row",
      { id: "c", state: "" },
    ];
    expect(chequeLeafRows(rows, "fin.cheque.state.", upper)).toEqual([
      { key: "id:1", state: "FIN.CHEQUE.STATE.PORTFOLIO", date: "2026-10-01", amount: "15,000.00", party: "Acme", note: "" },
      { key: "at:1", state: "FIN.CHEQUE.STATE.ENDORSED", date: "2026-10-15", amount: "", party: "Bolt", note: "to supplier" },
      { key: "id:c", state: "", date: "", amount: "", party: "", note: "" },
    ]);
    expect(chequeLeafRows([{ state: "bounced" }], undefined, upper)[0]!.state).toBe("BOUNCED");
    expect(chequeLeafRows(undefined, "x.", upper)).toEqual([]);
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

describe("stepsList", () => {
  test("names and labels are translated; label wins over name", () => {
    expect(stepsList(["a.one", { name: "two", label: "a.two" }, { id: 3 }], upper)).toEqual([
      { label: "A.ONE", state: "todo" },
      { label: "A.TWO", state: "todo" },
      { label: "3", state: "todo" },
    ]);
  });

  test("current, by index or by name, marks the steps around it", () => {
    const byIndex = stepsList({ steps: ["a", "b", "c"], current: 1 }, upper);
    expect(byIndex.map((step) => step.state)).toEqual(["done", "current", "todo"]);
    const byName = stepsList({ steps: [{ name: "a" }, { name: "b" }], current: "b" }, upper);
    expect(byName.map((step) => step.state)).toEqual(["done", "current"]);
    const unknown = stepsList({ steps: ["a", "b"], current: "z" }, upper);
    expect(unknown.map((step) => step.state)).toEqual(["todo", "todo"]);
  });

  test("a step's own state wins over current", () => {
    const steps = stepsList(
      {
        steps: [
          { name: "a", status: "Completed" },
          { name: "b", state: "active" },
          { name: "c", done: true },
          { name: "d", current: true },
          { name: "e", state: "waiting" },
        ],
        current: 0,
      },
      upper,
    );
    expect(steps.map((step) => step.state)).toEqual(["done", "current", "done", "current", "todo"]);
  });

  test("anything else, and steps without a name, show nothing", () => {
    expect(stepsList(undefined, upper)).toEqual([]);
    expect(stepsList("a", upper)).toEqual([]);
    expect(stepsList({ current: 1 }, upper)).toEqual([]);
    expect(stepsList(["", null, {}, { label: "" }], upper)).toEqual([]);
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

  test("arrangeText shows an object's field and a plain item as it came", () => {
    expect(arrangeText({ title: "Lead", n: 1 }, "title")).toBe("Lead");
    expect(arrangeText({ amount: "25000.50" }, "amount")).toBe("25000.50");
    expect(arrangeText({ title: "Lead" }, undefined)).toBe("");
    expect(arrangeText("Won", "title")).toBe("Won");
    expect(arrangeText(7, undefined)).toBe("7");
    expect(arrangeText(null, "title")).toBe("");
  });

  test("newArrangeItem keys the trimmed text, or keeps it plain; blank adds nothing", () => {
    expect(newArrangeItem("  Lost ", "title")).toEqual({ title: "Lost" });
    expect(newArrangeItem("Lost", undefined)).toBe("Lost");
    expect(newArrangeItem("Lost", "")).toBe("Lost");
    expect(newArrangeItem("   ", "title")).toBe(undefined);
  });

  test("arrangeContext sends the items in order and version as it came", () => {
    expect(arrangeContext(["b", "a"], "7")).toEqual({ items: ["b", "a"], version: "7" });
    expect(arrangeContext([{ id: 1 }], 3)).toEqual({ items: [{ id: 1 }], version: 3 });
    expect(arrangeContext([], undefined)).toEqual({ items: [] });
    expect(arrangeContext(["a"], null)).toEqual({ items: ["a"] });
  });
});
