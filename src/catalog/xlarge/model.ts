/**
 * Pure helpers for the xlarge catalog renderers (`tech.yerly.xlarge/v1`).
 *
 * xlarge publishes its own A2UI 1.0 catalog definition (its
 * `src/catalog/catalog.json`, carried in `tests/fixtures/xlarge/crm-deals.json`).
 * These helpers read the properties that definition declares; nothing here is
 * part of the A2UI Basic Catalog. No `nsh`, DOM, or I/O imports.
 */

/** The catalog ID xlarge names in `createSurface.catalogId`. */
export const XLARGE_CATALOG_V1_ID = "tech.yerly.xlarge/v1" as const;

/**
 * Turns one of xlarge's i18n codes (`crm.field.title`) into the words a person
 * reads. xlarge sends codes, not words; the host owns the dictionary.
 */
export type Translate = (code: string) => string;

/** The identity translation: shows the code itself. */
export const SHOW_CODES: Translate = (code) => code;

/** The native control an xlarge `Field.input` is drawn with. */
export type FieldControl =
  | "text"
  | "multiline"
  | "email"
  | "password"
  | "number"
  | "date"
  | "datetime"
  | "select";

/**
 * Maps xlarge's `Field.input` onto a control. Anything this renderer does not
 * know is plain text, so a screen that asks for an unknown input still draws
 * (xlarge's web client follows the same rule).
 */
export function fieldControl(input: unknown): FieldControl {
  switch (input) {
    case "note":
      return "multiline";
    case "email":
      return "email";
    case "password":
      return "password";
    case "number":
    case "decimal":
    case "money":
    case "kurus":
      return "number";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "choice":
    case "record":
      return "select";
    default:
      return "text";
  }
}

/** One choice a select field offers. */
export interface FieldOption {
  readonly value: string;
  readonly title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalarText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

/**
 * The options of a `choice` or `record` field.
 *
 * - `choice`: `options` lists the values; with `optionPrefix` each title is the
 *   translation of `optionPrefix + value`, otherwise the value itself.
 * - `record`: the rows sit in the data model under the key `from` names
 *   (`/partners.list`); `value` names the row key sent, `show` the key shown.
 *   With `optionPrefix` (even `""`) the shown value is a code to translate.
 */
export function fieldOptions(
  props: Readonly<Record<string, unknown>>,
  rows: unknown,
  translate: Translate,
): readonly FieldOption[] {
  const prefix =
    typeof props["optionPrefix"] === "string" ? props["optionPrefix"] : undefined;
  const title = (raw: string): string =>
    prefix !== undefined ? translate(`${prefix}${raw}`) : raw;

  if (props["input"] === "choice") {
    const options = Array.isArray(props["options"]) ? props["options"] : [];
    return options.map((option) => {
      const value = scalarText(option);
      return { value, title: title(value) };
    });
  }

  if (!Array.isArray(rows)) {
    return [];
  }
  const valueKey = typeof props["value"] === "string" ? props["value"] : "id";
  const showKey = typeof props["show"] === "string" ? props["show"] : valueKey;
  const out: FieldOption[] = [];
  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }
    const value = scalarText(row[valueKey]);
    if (value === "") {
      continue;
    }
    out.push({ value, title: title(scalarText(row[showKey])) });
  }
  return out;
}

/** The data-model path a `record` field reads its rows from (`/<from>`). */
export function recordRowsPath(from: unknown): string | undefined {
  if (typeof from !== "string" || from.length === 0) {
    return undefined;
  }
  // `from` is one data-model key that may hold `.` but never `/` or `~`;
  // escape it as one JSON Pointer segment anyway.
  return `/${from.replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

/** What the form needs to know about one of its fields at submit time. */
export interface FieldSpec {
  /** The key the value is sent under (`Field.field`). */
  readonly name: string;
  /** `Field.checks` includes `"required"`. */
  readonly required: boolean;
  /** The resolved `Field.default`, if any. */
  readonly fallback: unknown;
}

/** True for a value a person has not given: `undefined`, `null`, `""`, or `[]`. */
export function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * What a form sends: each field's typed value, or its default when nothing was
 * typed. Blank values are left out, as xlarge's own client leaves them out.
 */
export function heldValues(
  fields: readonly FieldSpec[],
  draft: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const held: Record<string, unknown> = {};
  for (const field of fields) {
    const typed = draft[field.name];
    const value = isBlank(typed) ? field.fallback : typed;
    if (!isBlank(value)) {
      held[field.name] = value;
    }
  }
  return held;
}

/** The names of required fields that hold nothing (typed or default). */
export function missingRequired(
  fields: readonly FieldSpec[],
  draft: Readonly<Record<string, unknown>>,
): readonly string[] {
  const held = heldValues(fields, draft);
  return fields
    .filter((field) => field.required && isBlank(held[field.name]))
    .map((field) => field.name);
}

/** One column of an xlarge `Table` (`columns[]` entries). */
export interface TableColumn {
  readonly field: string;
  readonly label: string;
  readonly format?: string;
  readonly enumPrefix?: string;
  readonly grow: boolean;
}

/** Reads `Table.columns`, dropping entries without a `field`. */
export function tableColumns(value: unknown): readonly TableColumn[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: TableColumn[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw["field"] !== "string") {
      continue;
    }
    out.push({
      field: raw["field"],
      label: typeof raw["label"] === "string" ? raw["label"] : raw["field"],
      format: typeof raw["format"] === "string" ? raw["format"] : undefined,
      enumPrefix:
        typeof raw["enumPrefix"] === "string" ? raw["enumPrefix"] : undefined,
      grow: raw["grow"] === true,
    });
  }
  return out;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * An amount as text with two decimals and grouped thousands, without ever
 * passing a decimal string through a float (`"25000.5"` → `"25,000.50"`).
 * A value that is not a plain decimal is shown as it came.
 */
export function formatAmount(value: unknown): string {
  const text = scalarText(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    return text;
  }
  const sign = match[1] ?? "";
  const whole = match[2] ?? "0";
  const fraction = (match[3] ?? "").padEnd(2, "0");
  return `${sign}${groupThousands(whole)}.${fraction}`;
}

/** One table cell as text, by the column's `format` and `enumPrefix`. */
export function formatCell(
  value: unknown,
  column: Pick<TableColumn, "format" | "enumPrefix">,
  translate: Translate,
): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (column.enumPrefix !== undefined) {
    return translate(`${column.enumPrefix}${scalarText(value)}`);
  }
  switch (column.format) {
    case "date":
      return scalarText(value).slice(0, 10);
    case "datetime":
      return scalarText(value).slice(0, 16).replace("T", " ");
    case "money":
    case "decimal":
      return formatAmount(value);
    case "flag":
      return typeof value === "boolean" ? (value ? "✓" : "✗") : scalarText(value);
    case "list":
      return Array.isArray(value) ? value.map(scalarText).join(", ") : scalarText(value);
    default:
      return scalarText(value);
  }
}

/** A table row's object, or `undefined` for entries that are not objects. */
export function tableRows(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

/** The `{ event }` action payload for a named xlarge action and its context. */
export function eventPayload(
  name: string,
  context: Readonly<Record<string, unknown>>,
): { readonly event: { readonly name: string; readonly context: Record<string, unknown> } } {
  // Context values go out as literals; an object key starting with `@` would
  // be read as a binding or call, so escape it as A2UI's `@@` reserved-key rule says.
  return { event: { name, context: escapeLiteral(context) as Record<string, unknown> } };
}

function escapeLiteral(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(escapeLiteral);
  }
  if (!isRecord(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key.startsWith("@") ? `@${key}` : key] = escapeLiteral(inner);
  }
  return out;
}

/** How an xlarge `Text.tone` is drawn. Unknown tones draw plain. */
export type TextTone = "plain" | "muted" | "strong" | "accent" | "danger";

/** Maps xlarge's `Text.tone` onto one of the tones the renderer draws. */
export function textTone(tone: unknown): TextTone {
  switch (tone) {
    case "muted":
    case "quiet":
    case "hint":
      return "muted";
    case "strong":
    case "bold":
      return "strong";
    case "accent":
    case "primary":
    case "good":
    case "success":
      return "accent";
    case "danger":
    case "error":
    case "bad":
    case "warning":
      return "danger";
    default:
      return "plain";
  }
}

/**
 * Fills `{name}` placeholders in a translated message from `params`. A
 * placeholder without a matching param stays as written; values are shown as
 * the text they came as (amounts are never passed through a float).
 */
export function fillParams(
  template: string,
  params: Readonly<Record<string, unknown>> | undefined,
): string {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? scalarText(params[key]) : whole,
  );
}

/** The message an xlarge `code` + `params` pair shows: translated, then filled. */
export function messageText(
  code: string,
  params: unknown,
  translate: Translate,
): string {
  return fillParams(translate(code), isRecord(params) ? params : undefined);
}

/**
 * The action that opens the screen `back` names. xlarge opens screens with a
 * `screen:<name>` action (a `Table` row sends `screen:crm.deal`); a `back`
 * already written that way is sent as it came.
 */
export function screenAction(back: unknown): string | undefined {
  if (typeof back !== "string" || back.length === 0) {
    return undefined;
  }
  return back.startsWith("screen:") ? back : `screen:${back}`;
}

/** How an xlarge `Button.variant` is drawn. Unknown variants draw primary. */
export type ButtonVariant = "primary" | "secondary" | "danger";

/** Maps xlarge's `Button.variant` onto one of the drawn variants. */
export function buttonVariant(variant: unknown): ButtonVariant {
  switch (variant) {
    case "secondary":
    case "quiet":
    case "ghost":
    case "plain":
    case "outline":
      return "secondary";
    case "danger":
    case "destructive":
    case "bad":
      return "danger";
    default:
      return "primary";
  }
}

/**
 * The literal a `context` object stands for, or `{}` for anything else. On the
 * wire a literal key starting with `@` arrives escaped as `@@` (A2UI's
 * reserved-key rule) and the component prop holds it as it came, so one level
 * is undone here; `eventPayload` escapes it again exactly once.
 */
export function literalContext(value: unknown): Record<string, unknown> {
  return isRecord(value) ? (unescapeLiteral(value) as Record<string, unknown>) : {};
}

function unescapeLiteral(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(unescapeLiteral);
  }
  if (!isRecord(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key.startsWith("@@") ? key.slice(1) : key] = unescapeLiteral(inner);
  }
  return out;
}

/** Where an ask stands after one step, and whether the action goes out now. */
export interface AskStep {
  /** The question with its yes and cancel buttons is showing. */
  readonly asking: boolean;
  /** The action is sent on this step. */
  readonly send: boolean;
}

/**
 * The one ask flow `Button`, `Confirm` and `Preview` share. A press with
 * `confirm` asks first and sends nothing; a press without it sends at once;
 * `yes` sends and closes the question; `cancel` closes it and sends nothing.
 */
export function askStep(step: "press" | "yes" | "cancel", confirm: boolean): AskStep {
  switch (step) {
    case "press":
      return confirm ? { asking: true, send: false } : { asking: false, send: true };
    case "yes":
      return { asking: false, send: true };
    default:
      return { asking: false, send: false };
  }
}

/** One line of a `Preview.draft`. */
export interface DraftLine {
  /** What the line is (translated), when the entry names it. */
  readonly label?: string;
  /** The value as text; amounts as typed, never through a float. */
  readonly value: string;
}

/**
 * The lines a `Preview` shows for its `draft`. A string or number entry is one
 * line as it came. An object entry with `value` is one line, labelled by its
 * `label` (a code) or `field`, its value formatted by `format`/`enumPrefix` as
 * a table cell is. Any other object shows each of its keys as one line.
 */
export function draftLines(draft: unknown, translate: Translate): readonly DraftLine[] {
  if (!Array.isArray(draft)) {
    return [];
  }
  const out: DraftLine[] = [];
  for (const entry of draft) {
    if (!isRecord(entry)) {
      if (entry !== null && entry !== undefined) {
        out.push({ value: scalarText(entry) });
      }
      continue;
    }
    if ("value" in entry) {
      const label =
        typeof entry["label"] === "string"
          ? translate(entry["label"])
          : typeof entry["field"] === "string"
            ? entry["field"]
            : undefined;
      const value = formatCell(
        entry["value"],
        {
          format: typeof entry["format"] === "string" ? entry["format"] : undefined,
          enumPrefix: typeof entry["enumPrefix"] === "string" ? entry["enumPrefix"] : undefined,
        },
        translate,
      );
      out.push(label !== undefined ? { label, value } : { value });
      continue;
    }
    for (const [key, value] of Object.entries(entry)) {
      out.push({ label: key, value: Array.isArray(value) ? value.map(scalarText).join(", ") : scalarText(value) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// QR code (ISO/IEC 18004): byte mode, error correction level M, versions 1–40.
// A pure encoder, because Native Shell 0.6.1 has no QR primitive. Its
// structure follows Project Nayuki's reference QR encoder (MIT).
// ---------------------------------------------------------------------------

/** A QR code's modules: `rows[y][x]` is true for a dark module. */
export interface QrMatrix {
  readonly version: number;
  readonly size: number;
  readonly rows: readonly (readonly boolean[])[];
}

// Error-correction codewords per block and block count, level M, by version.
const QR_ECC_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const QR_BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18,
  20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];
// Level M's two format bits.
const QR_FORMAT_BITS_M = 0;

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}

function qrRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) {
      result -= 36;
    }
  }
  return result;
}

function qrDataCodewords(version: number): number {
  return (
    Math.floor(qrRawDataModules(version) / 8) -
    QR_ECC_PER_BLOCK_M[version]! * QR_BLOCKS_M[version]!
  );
}

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < result.length) {
        result[j]! ^= result[j + 1]!;
      }
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The `degree` Reed–Solomon error-correction codewords of `data` (GF(256), 0x11D). */
export function reedSolomonRemainder(data: readonly number[], degree: number): number[] {
  const divisor = reedSolomonDivisor(degree);
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i]! ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

function qrInterleave(data: readonly number[], version: number): number[] {
  const numBlocks = QR_BLOCKS_M[version]!;
  const eccLen = QR_ECC_PER_BLOCK_M[version]!;
  const rawCodewords = Math.floor(qrRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - eccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = reedSolomonRemainder(dat, eccLen);
    if (i < numShortBlocks) {
      dat.push(0);
    }
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - eccLen || j >= numShortBlocks) {
        result.push(block[i]!);
      }
    });
  }
  return result;
}

function qrAlignmentPositions(version: number, size: number): number[] {
  if (version === 1) {
    return [];
  }
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function qrMaskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

class QrBuilder {
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(
    readonly version: number,
    readonly size: number,
  ) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  set(x: number, y: number, dark: boolean): void {
    this.modules[y]![x] = dark;
    this.isFunction[y]![x] = true;
  }

  drawFunctionPatterns(): void {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(size - 4, 3);
    this.drawFinder(3, size - 4);
    const align = qrAlignmentPositions(this.version, size);
    const n = align.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const corner =
          (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
        if (!corner) {
          this.drawAlignment(align[i]!, align[j]!);
        }
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  }

  drawFinder(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.set(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  drawAlignment(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFormatBits(mask: number): void {
    const data = (QR_FORMAT_BITS_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;
    const { size } = this;
    for (let i = 0; i <= 5; i++) {
      this.set(8, i, bit(i));
    }
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) {
      this.set(14 - i, 8, bit(i));
    }
    for (let i = 0; i < 8; i++) {
      this.set(size - 1 - i, 8, bit(i));
    }
    for (let i = 8; i < 15; i++) {
      this.set(8, size - 15 + i, bit(i));
    }
    this.set(8, size - 8, true);
  }

  drawVersion(): void {
    if (this.version < 7) {
      return;
    }
    let rem = this.version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, dark);
      this.set(b, a, dark);
    }
  }

  drawCodewords(data: readonly number[]): void {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) {
        right = 5;
      }
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y]![x] && i < data.length * 8) {
            this.modules[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y]![x] && qrMaskBit(mask, x, y)) {
          this.modules[y]![x] = !this.modules[y]![x];
        }
      }
    }
  }

  penalty(): number {
    const { size, modules } = this;
    const at = (x: number, y: number, vertical: boolean): boolean =>
      vertical ? modules[x]![y]! : modules[y]![x]!;
    const finderA = [true, false, true, true, true, false, true, false, false, false, false];
    const finderB = [false, false, false, false, true, false, true, true, true, false, true];
    let score = 0;
    for (const vertical of [false, true]) {
      for (let y = 0; y < size; y++) {
        // Rule 1: runs of five or more modules of one colour.
        let run = 1;
        for (let x = 1; x <= size; x++) {
          if (x < size && at(x, y, vertical) === at(x - 1, y, vertical)) {
            run++;
          } else {
            if (run >= 5) {
              score += 3 + (run - 5);
            }
            run = 1;
          }
        }
        // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules beside.
        for (let x = 0; x + 11 <= size; x++) {
          let matchA = true;
          let matchB = true;
          for (let k = 0; k < 11; k++) {
            const dark = at(x + k, y, vertical);
            matchA &&= dark === finderA[k];
            matchB &&= dark === finderB[k];
          }
          score += (matchA ? 40 : 0) + (matchB ? 40 : 0);
        }
      }
    }
    // Rule 2: 2×2 blocks of one colour; rule 4 counts the dark modules.
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = modules[y]![x]!;
        if (c) {
          dark++;
        }
        if (
          x + 1 < size &&
          y + 1 < size &&
          c === modules[y]![x + 1] &&
          c === modules[y + 1]![x] &&
          c === modules[y + 1]![x + 1]
        ) {
          score += 3;
        }
      }
    }
    // Rule 4: how far the dark share is from half.
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return score + Math.max(0, k) * 10;
  }
}

/**
 * Encodes `text` (as UTF-8 bytes) as a QR code at error correction level M,
 * in the smallest version that holds it. `undefined` when it does not fit
 * version 40 (more than 2331 bytes).
 */
export function encodeQr(text: string): QrMatrix | undefined {
  const bytes = utf8Bytes(text);
  let version = 1;
  for (; version <= 40; version++) {
    const countBits = version <= 9 ? 8 : 16;
    const needed = 4 + countBits + bytes.length * 8;
    if (bytes.length < 1 << countBits && needed <= qrDataCodewords(version) * 8) {
      break;
    }
  }
  if (version > 40) {
    return undefined;
  }

  const bits: number[] = [];
  const append = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };
  append(0b0100, 4);
  append(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) {
    append(byte, 8);
  }
  const capacity = qrDataCodewords(version) * 8;
  append(0, Math.min(4, capacity - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) {
    append(pad, 8);
  }
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j]!;
    }
    data.push(byte);
  }

  const size = version * 4 + 17;
  const qr = new QrBuilder(version, size);
  qr.drawFunctionPatterns();
  qr.drawCodewords(qrInterleave(data, version));

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    qr.applyMask(mask);
    qr.drawFormatBits(mask);
    const penalty = qr.penalty();
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    qr.applyMask(mask);
  }
  qr.applyMask(bestMask);
  qr.drawFormatBits(bestMask);
  return { version, size, rows: qr.modules };
}

// ---------------------------------------------------------------------------
// Columns, Detail, Metric, ChequeLeaf (spec 003, round 2).
// ---------------------------------------------------------------------------

/**
 * The share of the row each of `count` columns takes, from `Columns.widths`.
 * An entry is a positive number or its text (`2`, `"2fr"`, `"40%"`); a missing
 * or unreadable entry counts as `1`, so columns without widths share evenly.
 * These are layout weights, never amounts.
 */
export function columnWeights(widths: unknown, count: number): readonly number[] {
  const list = Array.isArray(widths) ? widths : [];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(columnWeight(list[i]));
  }
  return out;
}

function columnWeight(raw: unknown): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  }
  if (typeof raw === "string") {
    const match = /^\s*(\d+(?:\.\d+)?)\s*(?:fr|%)?\s*$/.exec(raw);
    const weight = match ? Number(match[1]) : 0;
    return weight > 0 ? weight : 1;
  }
  return 1;
}

/** One labelled value a `Detail` shows. */
export interface DetailEntry {
  readonly field: string;
  /** The translated label. */
  readonly label: string;
  /** The value as text (`formatCell`), `""` when it holds nothing. */
  readonly text: string;
}

/**
 * The labelled values of a `Detail`: `rows` lists them as `Table.columns`
 * entries (`field`, `label` code, `format`, `enumPrefix`) or bare field names;
 * without `rows`, every plain value of `record` is shown under its key. With
 * `skipEmpty`, values that hold nothing are left out.
 */
export function detailEntries(
  rows: unknown,
  record: unknown,
  skipEmpty: boolean,
  translate: Translate,
): readonly DetailEntry[] {
  const data = isRecord(record) ? record : {};
  const specs: TableColumn[] = [];
  if (Array.isArray(rows)) {
    for (const raw of rows) {
      if (typeof raw === "string" && raw.length > 0) {
        specs.push({ field: raw, label: raw, grow: false });
      } else {
        specs.push(...tableColumns([raw]));
      }
    }
  } else {
    for (const [field, value] of Object.entries(data)) {
      if (value === null || typeof value !== "object") {
        specs.push({ field, label: field, grow: false });
      }
    }
  }
  const out: DetailEntry[] = [];
  for (const spec of specs) {
    const text = formatCell(data[spec.field], spec, translate);
    if (skipEmpty && text.trim() === "") {
      continue;
    }
    out.push({ field: spec.field, label: translate(spec.label), text });
  }
  return out;
}

/** The `id` of a `Detail` record, as the context of its `update` action. */
export function recordContext(record: unknown): Record<string, unknown> {
  if (isRecord(record) && record["id"] !== undefined && record["id"] !== null) {
    return { id: record["id"] };
  }
  return {};
}

/** A plain decimal as text: sign, whole digits, fraction digits (or `undefined`). */
function splitDecimal(
  text: string,
): { readonly sign: string; readonly whole: string; readonly fraction: string } | undefined {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    return undefined;
  }
  return { sign: match[1] ?? "", whole: match[2] ?? "0", fraction: match[3] ?? "" };
}

/**
 * A `Metric` value as text by its `format`, never through a float:
 * `money`/`decimal`/`amount` as `formatAmount`; `percent` with a `%`;
 * `number`/`integer`/`count` with grouped thousands and the fraction kept as
 * typed; anything else as it came.
 */
export function metricText(value: unknown, format: unknown): string {
  const text = scalarText(value).trim();
  if (text === "") {
    return "";
  }
  switch (format) {
    case "money":
    case "decimal":
    case "amount":
      return formatAmount(text);
    case "percent":
      return text.endsWith("%") ? text : `${text}%`;
    case "number":
    case "integer":
    case "count": {
      const parts = splitDecimal(text);
      if (parts === undefined) {
        return text;
      }
      const grouped = groupThousands(parts.whole);
      return `${parts.sign === "-" ? "-" : ""}${grouped}${parts.fraction ? `.${parts.fraction}` : ""}`;
    }
    default:
      return text;
  }
}

/** Which way a `Metric.change` went. */
export type ChangeDirection = "up" | "down" | "flat";

/**
 * The direction of a change read from its text (`"12.5"`, `"-3"`, `"+0.0"`,
 * `"4%"`): a leading `-` is down, all zeros flat, anything else up.
 * `undefined` when it is not a plain decimal.
 */
export function changeDirection(change: unknown): ChangeDirection | undefined {
  const text = scalarText(change).trim().replace(/%$/, "");
  const parts = splitDecimal(text);
  if (parts === undefined) {
    return undefined;
  }
  if (/^0*$/.test(parts.whole) && /^0*$/.test(parts.fraction)) {
    return "flat";
  }
  return parts.sign === "-" ? "down" : "up";
}

/** A change as signed text, formatted as its metric's value (`"+12.5%"`). */
export function changeText(change: unknown, format: unknown): string {
  const text = scalarText(change).trim();
  const direction = changeDirection(text);
  if (direction === undefined || direction === "flat") {
    return metricText(text, format);
  }
  const magnitude = text.replace(/^[+-]/, "");
  return `${direction === "down" ? "-" : "+"}${metricText(magnitude, format)}`;
}

/** How a change is coloured: good, bad, or neither. */
export type ChangeTone = "good" | "bad" | "neutral";

/**
 * The tone of a change by `Metric.better` (`"up"` or `"down"`, with the
 * synonyms `higher`/`more` and `lower`/`less`): the better way is good, the
 * other bad; a flat change, or a metric without `better`, is neutral.
 */
export function changeTone(direction: ChangeDirection | undefined, better: unknown): ChangeTone {
  const wanted =
    better === "up" || better === "higher" || better === "more"
      ? "up"
      : better === "down" || better === "lower" || better === "less"
        ? "down"
        : undefined;
  if (wanted === undefined || direction === undefined || direction === "flat") {
    return "neutral";
  }
  return direction === wanted ? "good" : "bad";
}

/** One state row of a cheque or promissory note's leaf. */
export interface ChequeLeafRow {
  readonly key: string;
  /** The translated state word (`statePrefix + state`). */
  readonly state: string;
  readonly date: string;
  readonly amount: string;
  readonly party: string;
  readonly note: string;
}

/**
 * The rows of a `ChequeLeaf`: each row's `state` translated as
 * `statePrefix + state`, its `date` (or `at`) as a date, its `amount` as
 * `formatAmount`, and its `party` (or `partner`) and `note` as they came.
 */
export function chequeLeafRows(
  rows: unknown,
  statePrefix: unknown,
  translate: Translate,
): readonly ChequeLeafRow[] {
  const prefix = typeof statePrefix === "string" ? statePrefix : "";
  return tableRows(rows).map((row, index) => {
    const id = row["id"];
    const state = scalarText(row["state"]);
    const amount = scalarText(row["amount"]);
    return {
      key: typeof id === "string" || typeof id === "number" ? `id:${id}` : `at:${index}`,
      state: state === "" ? "" : translate(`${prefix}${state}`),
      date: scalarText(row["date"] ?? row["at"]).slice(0, 10),
      amount: amount === "" ? "" : formatAmount(amount),
      party: scalarText(row["party"] ?? row["partner"]),
      note: scalarText(row["note"]),
    };
  });
}

/** Where a `Wizard` goes on one press of its back or next button. */
export interface WizardStep {
  /** The page shown after the press (0-based). */
  readonly page: number;
  /** The whole draft is sent now (next on the last page, with it complete). */
  readonly submit: boolean;
}

/**
 * The page flow of a `Wizard` with `count` pages. `next` stays on a page whose
 * required fields are not all held (`complete` false); on the last page it
 * submits instead of moving. `back` never goes before the first page.
 */
export function wizardStep(
  step: "next" | "back",
  page: number,
  count: number,
  complete: boolean,
): WizardStep {
  const last = Math.max(0, count - 1);
  const here = Math.min(Math.max(0, Math.trunc(page)), last);
  if (step === "back") {
    return { page: Math.max(0, here - 1), submit: false };
  }
  if (!complete) {
    return { page: here, submit: false };
  }
  return here < last ? { page: here + 1, submit: false } : { page: here, submit: true };
}

/** Where one step of a `Steps` list stands. */
export type StepState = "done" | "current" | "todo";

/** One named step a `Steps` list shows. */
export interface StepItem {
  /** The translated step name. */
  readonly label: string;
  readonly state: StepState;
}

const STEP_DONE = new Set(["done", "complete", "completed", "finished", "ok", "passed"]);
const STEP_CURRENT = new Set(["current", "active", "doing", "now", "open", "in_progress"]);

function explicitStepState(entry: Record<string, unknown>): StepState | undefined {
  const said = entry["state"] ?? entry["status"];
  if (typeof said === "string") {
    const word = said.toLowerCase();
    if (STEP_DONE.has(word)) {
      return "done";
    }
    if (STEP_CURRENT.has(word)) {
      return "current";
    }
    return "todo";
  }
  if (entry["done"] === true) {
    return "done";
  }
  if (entry["current"] === true) {
    return "current";
  }
  return undefined;
}

/**
 * The steps a `Steps` list shows for the answer data it reads. The answer is
 * either a list of steps or `{ steps, current }`. A step is a name (a code) or
 * `{ name, label?, state?|status?|done?|current? }`; `label` (a code) wins
 * over `name`. A step's own state wins; otherwise `current` (an index or a
 * step name) marks the steps before it done and the ones after it to do.
 * Steps without a name are left out.
 */
export function stepsList(answer: unknown, translate: Translate): readonly StepItem[] {
  let entries: readonly unknown[];
  let current: unknown;
  if (Array.isArray(answer)) {
    entries = answer;
  } else if (isRecord(answer) && Array.isArray(answer["steps"])) {
    entries = answer["steps"];
    current = answer["current"];
  } else {
    return [];
  }

  const named: { name: string; label: string; state: StepState | undefined }[] = [];
  for (const entry of entries) {
    if (typeof entry === "string" || typeof entry === "number") {
      const name = scalarText(entry);
      if (name.length > 0) {
        named.push({ name, label: translate(name), state: undefined });
      }
    } else if (isRecord(entry)) {
      const name = scalarText(entry["name"] ?? entry["id"]);
      const label = entry["label"];
      const code = typeof label === "string" && label.length > 0 ? label : name;
      if (code.length > 0) {
        named.push({ name, label: translate(code), state: explicitStepState(entry) });
      }
    }
  }

  let at = -1;
  if (typeof current === "number" && Number.isInteger(current)) {
    at = current;
  } else if (typeof current === "string" && current.length > 0) {
    at = named.findIndex((step) => step.name === current);
  }
  return named.map((step, index) => ({
    label: step.label,
    state:
      step.state ??
      (at < 0 ? "todo" : index < at ? "done" : index === at ? "current" : "todo"),
  }));
}

/** `items` with the entry at `from` moved to `to`; out-of-range moves change nothing. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= out.length ||
    to >= out.length ||
    from === to
  ) {
    return out;
  }
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved as T);
  return out;
}

/**
 * The words an `Arrange` item shows: a plain item as it came, an object item's
 * `field` key (numbers and amounts as the text they came as).
 */
export function arrangeText(item: unknown, field: unknown): string {
  if (isRecord(item)) {
    return typeof field === "string" && field.length > 0 ? scalarText(item[field]) : "";
  }
  return typeof item === "string" || typeof item === "number" ? scalarText(item) : "";
}

/**
 * The item an `Arrange` adds for the text a person typed: `{ [key]: text }`
 * when items carry a key (`addItem`, else `field`), the text itself otherwise.
 * Blank text adds nothing (`undefined`).
 */
export function newArrangeItem(text: string, key: unknown): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return typeof key === "string" && key.length > 0 ? { [key]: trimmed } : trimmed;
}

/** The context an `Arrange` sends with `save`: the items in their new order and `version`. */
export function arrangeContext(
  items: readonly unknown[],
  version: unknown,
): Record<string, unknown> {
  return version === undefined || version === null
    ? { items: [...items] }
    : { items: [...items], version };
}
