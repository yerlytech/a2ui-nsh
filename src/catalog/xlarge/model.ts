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

/** A `when`/`unless` guard as the renderer read it: unset, or bound to `value`. */
export type Guard = { readonly value: unknown } | undefined;

/**
 * Whether a component guarded by `when` and `unless` (data bindings) is drawn.
 * An unset guard does not guard. `when` draws only while its value holds
 * something (not `false`, `0`, or `isBlank`: a missing path, `null`, `""`,
 * `[]`); `unless` hides while its value holds something. xlarge binds them to
 * flags of the screen's data (`when = "/performance/cut"`).
 */
export function guardShown(when: Guard, unless: Guard): boolean {
  const holds = (value: unknown): boolean => value !== false && value !== 0 && !isBlank(value);
  return (when === undefined || holds(when.value)) && (unless === undefined || !holds(unless.value));
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

/**
 * Whole minor units as major units with two decimals and grouped thousands,
 * from the text (`"1250"` → `"12.50"`, `"-5"` → `"-0.05"`). A value that is
 * not a whole number is shown as it came.
 */
export function formatKurus(value: unknown): string {
  const text = scalarText(value).trim();
  const match = /^([+-]?)(\d+)$/.exec(text);
  if (!match) {
    return text;
  }
  const digits = (match[2] ?? "").replace(/^0+/, "").padStart(3, "0");
  const sign = match[1] === "-" && /[1-9]/.test(digits) ? "-" : "";
  return formatAmount(`${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`);
}

/** The month and day of a date (`"2026-11-20"` → `"11-20"`), or the value as it came. */
export function formatMonthDay(value: unknown): string {
  const text = scalarText(value).trim();
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(text);
  return match ? `${match[1]}-${match[2]}` : text;
}

/**
 * One table cell as text, by the column's `format` and `enumPrefix`: `date`,
 * `datetime`, `month_day`, `money`/`decimal` (`formatAmount`), `kurus`
 * (`formatKurus`), `number` (grouped thousands), `flag` and `list`; any other
 * format shows the value as it came.
 */
export function formatCell(
  value: unknown,
  column: Pick<TableColumn, "format" | "enumPrefix">,
  translate: Translate,
): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (column.enumPrefix !== undefined) {
    // A list of codes (xlarge's audit `changed`: `format = "list"`,
    // `enumPrefix = ""`) is translated entry by entry.
    return Array.isArray(value)
      ? value.map((entry) => translate(`${column.enumPrefix}${scalarText(entry)}`)).join(", ")
      : translate(`${column.enumPrefix}${scalarText(value)}`);
  }
  switch (column.format) {
    case "date":
      return scalarText(value).slice(0, 10);
    case "datetime":
      return scalarText(value).slice(0, 16).replace("T", " ");
    case "month_day":
      return formatMonthDay(value);
    case "money":
    case "decimal":
      return formatAmount(value);
    case "kurus":
      return formatKurus(value);
    case "number":
      return metricText(value, "number");
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
 * A `Metric.accent`: xlarge sends a colour name (`lab_results.performance`
 * marks its overdue count `accent = "rose"`); `rose` and `red` are the
 * destructive edge. A `Text.tone` word is read as `textTone`.
 */
export function metricAccent(accent: unknown): TextTone {
  return accent === "rose" || accent === "red" ? "danger" : textTone(accent);
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
 * The action a `back`, `after` or `screen` value sends. A value that already
 * holds a `:` is an action name (`screen:crm.deal`, `crm.deal:close`) and is
 * sent as it came; a bare screen name opens that screen with xlarge's
 * `screen:<name>` action. `"back"` means go back: the client steps back on its
 * own and sends nothing extra, so it gives `undefined`, as does a missing value.
 */
export function screenAction(back: unknown): string | undefined {
  if (typeof back !== "string" || back.length === 0 || back === "back") {
    return undefined;
  }
  return back.includes(":") ? back : `screen:${back}`;
}

/** How an xlarge `Button.variant` is drawn. */
export type ButtonVariant = "primary" | "secondary" | "danger";

/**
 * Maps xlarge's `Button.variant` onto one of the drawn variants, as xlarge's
 * web client does: only `"primary"` draws primary, `"danger"` and
 * `"destructive"` draw danger, and anything else (or none) draws the plain
 * button. xlarge marks its primary buttons on purpose.
 */
export function buttonVariant(variant: unknown): ButtonVariant {
  switch (variant) {
    case "primary":
      return "primary";
    case "danger":
    case "destructive":
      return "danger";
    default:
      return "secondary";
  }
}

/**
 * The data-model path a context value binds to, or `undefined` for a literal.
 * A binding is an object with one string key: xlarge's `{ "path": ... }` or
 * A2UI 1.0's `{ "@path": ... }`.
 */
export function bindingPath(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    return undefined;
  }
  const path = value["path"] ?? value["@path"];
  return typeof path === "string" ? path : undefined;
}

/**
 * The context a `Button` sends: each value of `context` that is a data
 * binding (`bindingPath`) is read with `read`; every other value stays the
 * literal it came as (one `@@` escape undone, as `literalContext`). With a
 * `version`, it is added as `version` (read the same way when it is a binding).
 */
export function actionContext(
  context: unknown,
  read: (path: string) => unknown,
  version?: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isRecord(context)) {
    for (const [key, value] of Object.entries(context)) {
      const path = bindingPath(value);
      out[key.startsWith("@@") ? key.slice(1) : key] =
        path !== undefined ? read(path) : unescapeLiteral(value);
    }
  }
  const versionPath = bindingPath(version);
  const resolvedVersion = versionPath !== undefined ? read(versionPath) : version;
  if (resolvedVersion !== undefined && resolvedVersion !== null) {
    out["version"] = resolvedVersion;
  }
  return out;
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
 * The one ask flow `Button` and `Confirm` share. A press with
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

/** The draft field names a `Preview.draft` lists (non-empty strings only). */
export function draftNames(draft: unknown): readonly string[] {
  return Array.isArray(draft)
    ? draft.filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];
}

/** What a `Preview` asks its host to draw: the named draft values and `about`. */
export interface PreviewBody {
  readonly draft: Readonly<Record<string, unknown>>;
  readonly about?: string;
}

/**
 * The body xlarge's `Preview` asks its export route with, or `undefined`
 * while a named draft field holds nothing yet (xlarge asks only once every
 * one is there). `about` names the draft field that holds the record the
 * draft is about; it goes along when that value is non-empty text.
 */
export function previewBody(
  names: readonly string[],
  aboutKey: unknown,
  values: Readonly<Record<string, unknown>>,
): PreviewBody | undefined {
  if (names.some((name) => values[name] === undefined)) {
    return undefined;
  }
  const draft: Record<string, unknown> = {};
  for (const name of names) {
    draft[name] = values[name];
  }
  const about = typeof aboutKey === "string" ? values[aboutKey] : undefined;
  return typeof about === "string" && about !== "" ? { draft, about } : { draft };
}

/** One named draft value a `Preview` lists when its host draws no preview. */
export interface DraftLine {
  readonly field: string;
  /** The value as typed (amounts as text, never through a float); `""` when empty. */
  readonly value: string;
}

/** The named draft values, in `names` order, as the text they were typed as. */
export function draftLines(
  names: readonly string[],
  values: Readonly<Record<string, unknown>>,
): readonly DraftLine[] {
  return names.map((field) => {
    const value = values[field];
    return {
      field,
      value: Array.isArray(value) ? value.map(scalarText).join(", ") : scalarText(value),
    };
  });
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
  /**
   * When the row is corrected in place (its entry has `edit` and the
   * `Detail` names `update`): what the action calls the value (`edit.field`,
   * else the row's `field`), and the kind of box (`edit.input`).
   */
  readonly edit?: { readonly field: string; readonly input: string };
}

/**
 * The labelled values of a `Detail`: `rows` lists them as `Table.columns`
 * entries (`field`, `label` code, `format`, `enumPrefix`, `edit`) or bare
 * field names; without `rows`, every plain value of `record` is shown under
 * its key. With `editable` (the `Detail` names `update`), an entry with an
 * `edit` object is corrected in place. With `skipEmpty`, values that hold
 * nothing are left out, except a correctable one: left out, there would be
 * nowhere to fill it in.
 */
export function detailEntries(
  rows: unknown,
  record: unknown,
  skipEmpty: boolean,
  translate: Translate,
  editable = false,
): readonly DetailEntry[] {
  const data = isRecord(record) ? record : {};
  const specs: { column: TableColumn; edit?: DetailEntry["edit"] }[] = [];
  if (Array.isArray(rows)) {
    for (const raw of rows) {
      if (typeof raw === "string" && raw.length > 0) {
        specs.push({ column: { field: raw, label: raw, grow: false } });
        continue;
      }
      const column = tableColumns([raw])[0];
      if (column === undefined) {
        continue;
      }
      const edit = isRecord(raw) ? raw["edit"] : undefined;
      specs.push(
        editable && isRecord(edit)
          ? {
              column,
              edit: {
                field: typeof edit["field"] === "string" && edit["field"].length > 0 ? edit["field"] : column.field,
                input: typeof edit["input"] === "string" ? edit["input"] : "text",
              },
            }
          : { column },
      );
    }
  } else {
    for (const [field, value] of Object.entries(data)) {
      if (value === null || typeof value !== "object") {
        specs.push({ column: { field, label: field, grow: false } });
      }
    }
  }
  const out: DetailEntry[] = [];
  for (const { column, edit } of specs) {
    const text = formatCell(data[column.field], column, translate);
    if (skipEmpty && edit === undefined && text.trim() === "") {
      continue;
    }
    const entry = { field: column.field, label: translate(column.label), text };
    out.push(edit !== undefined ? { ...entry, edit } : entry);
  }
  return out;
}

/**
 * The context a `Detail` row corrected in place sends through `update`, as
 * xlarge's client does (spec 009): the record's `id`, its `version` when it
 * has one, and the one value under the name the action calls it, an emptied
 * box sent as `null` (it clears the value).
 */
export function detailEditContext(
  record: unknown,
  field: string,
  typed: unknown,
): Record<string, unknown> {
  const data = isRecord(record) ? record : {};
  // xlarge sends `id` and `version` as the record holds them; one it lacks
  // drops out of the JSON body, so it is left out here too.
  const out: Record<string, unknown> = {};
  for (const key of ["id", "version"]) {
    if (data[key] !== undefined) {
      out[key] = data[key];
    }
  }
  out[field] = typed === "" || typed === undefined ? null : typed;
  return out;
}

/** Whether a corrected value is the one the record already holds (nothing to send). */
export function sameValue(one: unknown, other: unknown): boolean {
  return scalarText(one) === scalarText(other);
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

/** Adds one to a string of decimal digits (`"199"` → `"200"`). */
function incrementDigits(digits: string): string {
  const out = digits.split("");
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (out[i] !== "9") {
      out[i] = String(Number(out[i]) + 1);
      return out.join("");
    }
    out[i] = "0";
  }
  return `1${out.join("")}`;
}

/**
 * A `Metric.change` as xlarge draws it, whatever the metric's `format`: the
 * size of the change as a whole-number percent with grouped thousands,
 * rounded half away from zero on the text, never through a float
 * (`"12.5"` → `"13%"`, `"-2.4"` → `"2%"`, `"+1234"` → `"1,234%"`). The sign is
 * the arrow's (`changeDirection`). `undefined` when it is not a plain decimal.
 */
export function changePercent(change: unknown): string | undefined {
  const parts = splitDecimal(scalarText(change).trim().replace(/%$/, ""));
  if (parts === undefined) {
    return undefined;
  }
  const whole = parts.fraction !== "" && parts.fraction[0]! >= "5"
    ? incrementDigits(parts.whole)
    : parts.whole;
  return `${groupThousands(whole.replace(/^0+(?=\d)/, ""))}%`;
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

/** The fields a cheque leaf and its stub both carry, as text. */
export interface ChequeLeafStub {
  readonly number: string;
  readonly date: string;
  readonly payee: string;
  /** Formatted from its text by `formatAmount`, never through a float. */
  readonly amount: string;
  readonly memo: string;
}

/** One physical leaf of a prenumbered cheque book. */
export interface ChequeLeafRow extends ChequeLeafStub {
  readonly key: string;
  /** The leaf's state code as it came (`"printed"`, `"void"`, ...). */
  readonly state: string;
  /** The translated `statePrefix + state` when the leaf is void, else `""`. */
  readonly voidWord: string;
  readonly amountWords: string;
  /** The stub kept in the book, when the leaf has one. */
  readonly stub: ChequeLeafStub | undefined;
}

function leafStub(raw: Record<string, unknown>): ChequeLeafStub {
  const amount = scalarText(raw["amount"]).trim();
  return {
    number: scalarText(raw["number"]),
    date: scalarText(raw["date"]),
    payee: scalarText(raw["payee"]),
    amount: amount === "" ? "" : formatAmount(amount),
    memo: scalarText(raw["memo"]),
  };
}

/**
 * The leaves of a `ChequeLeaf`, one per row of `rows`: its `number`, `date`,
 * `payee`, `amount` (`formatAmount`), `memo` and `amountWords` as text, its
 * `state`, the translated `statePrefix + state` beside the number only when
 * the state is `void`, and its `stub` when it has one. The rows' `layout`
 * (millimetre positions on the printed leaf) is not read here.
 */
export function chequeLeafRows(
  rows: unknown,
  statePrefix: unknown,
  translate: Translate,
): readonly ChequeLeafRow[] {
  const prefix = typeof statePrefix === "string" ? statePrefix : "";
  return tableRows(rows).map((row, index) => {
    const id = row["id"];
    const number = row["number"];
    const state = scalarText(row["state"]);
    const stub = row["stub"];
    return {
      ...leafStub(row),
      key:
        typeof id === "string" || typeof id === "number"
          ? `id:${id}`
          : (typeof number === "string" || typeof number === "number") && String(number) !== ""
            ? `no:${number}`
            : `at:${index}`,
      state,
      voidWord: state === "void" ? translate(`${prefix}${state}`) : "",
      amountWords: scalarText(row["amountWords"]),
      stub: isRecord(stub) ? leafStub(stub) : undefined,
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

/** How one step of what an agent did ended (xlarge spec 033). */
export type StepOutcome = "done" | "refused" | "waiting";

/** One step of what an agent did, as xlarge's answer carries it. */
export interface AgentStep {
  /** The action the step ran (or waits to run). */
  readonly action: string;
  /** What it ran with; a waiting step sends this when taken. */
  readonly input: Readonly<Record<string, unknown>>;
  /** `undefined` for an outcome xlarge does not name. */
  readonly outcome: StepOutcome | undefined;
  /** Why a refused step was refused (a code). */
  readonly code?: string;
  /** The record a step made, and the screen that opens it. */
  readonly opens?: { readonly screen: string; readonly about: unknown };
}

/** What a `Steps` draws from the answer: last words, why it stopped, the steps. */
export interface StepsAnswer {
  readonly words?: string;
  readonly stopped?: string;
  readonly steps: readonly AgentStep[];
}

function stepOutcome(value: unknown): StepOutcome | undefined {
  return value === "done" || value === "refused" || value === "waiting" ? value : undefined;
}

/** How a `Chart` is drawn. */
export type ChartKind = "sparkline" | "line" | "bars" | "donut";

/**
 * The drawing a `Chart.kind` asks for, as xlarge's web client reads it:
 * `sparkline`, `line` and `bars` by name; anything else, or none, is a donut
 * (xlarge's screens send `sparkline`, `donut`, and `bars` on its dashboard).
 */
export function chartKind(kind: unknown): ChartKind {
  return kind === "sparkline" || kind === "line" || kind === "bars" ? kind : "donut";
}

/** A tone xlarge gives a state (`Card.tones`, `Chart.tones`). */
export type StateTone = "neutral" | "info" | "success" | "warning" | "danger";

/** xlarge's tone word, or `undefined` for one it does not know. */
export function stateTone(tone: unknown): StateTone | undefined {
  return tone === "neutral" || tone === "info" || tone === "success" || tone === "warning" || tone === "danger"
    ? tone
    : undefined;
}

/** One point of a `Chart`: its label and value as text, and its size to draw. */
export interface ChartPoint {
  readonly key: string;
  /** The label as shown (`labelPrefix`, else `labelFormat`). */
  readonly label: string;
  /** The value as it came: `caption` when given, else `value` (a plain decimal). */
  readonly raw: string;
  /** The value as shown (`format`, default `number`, as `metricText`). */
  readonly value: string;
  /**
   * The value's size for the drawing only (a bar's height, a slice's angle):
   * never shown and never summed.
   */
  readonly size: number;
  /** The tone `tones` gives this point's label, if any. */
  readonly tone?: StateTone;
}

/** What a `Chart` reads besides its `data`. */
export interface ChartFormat {
  readonly format?: unknown;
  readonly labelFormat?: unknown;
  readonly labelPrefix?: unknown;
  readonly tones?: unknown;
}

/**
 * What a `Steps` draws from the answer the last action got back (xlarge's
 * `answer()[answer ?? "steps"]`): `undefined` while there is no answer or it
 * holds no list under `key`, so nothing is drawn. A step needs a string
 * `action`; `input` is kept when it is an object; `opens` when it names a
 * `screen`. `words` and `stopped` are kept when they are non-empty text.
 */
export function stepsAnswer(answer: unknown, key: unknown): StepsAnswer | undefined {
  if (!isRecord(answer)) {
    return undefined;
  }
  const list = answer[typeof key === "string" && key.length > 0 ? key : "steps"];
  if (!Array.isArray(list)) {
    return undefined;
  }
  const steps: AgentStep[] = [];
  for (const raw of list) {
    if (!isRecord(raw) || typeof raw["action"] !== "string" || raw["action"].length === 0) {
      continue;
    }
    const opens = raw["opens"];
    steps.push({
      action: raw["action"],
      input: isRecord(raw["input"]) ? raw["input"] : {},
      outcome: stepOutcome(raw["outcome"]),
      ...(typeof raw["code"] === "string" && raw["code"].length > 0 ? { code: raw["code"] } : {}),
      ...(isRecord(opens) && typeof opens["screen"] === "string" && opens["screen"].length > 0
        ? { opens: { screen: opens["screen"], about: opens["about"] } }
        : {}),
    });
  }
  const words = answer["words"];
  const stopped = answer["stopped"];
  return {
    ...(typeof words === "string" && words.length > 0 ? { words } : {}),
    ...(typeof stopped === "string" && stopped.length > 0 ? { stopped } : {}),
    steps,
  };
}

/**
 * A step's name, as xlarge says it: the words of `audit.action.<action>` (a
 * write); else, for a read, "looked in" the module's list when its menu names
 * one (`<module>.nav.<module>` into `agents.step.looked_in`'s `{place}`), or
 * `agents.step.looked`. A code without words comes back as the code.
 */
export function stepName(action: string, translate: Translate): string {
  const code = `audit.action.${action}`;
  const said = translate(code);
  if (said !== code) {
    return said;
  }
  const module = action.split(".")[0] ?? action;
  const listCode = `${module}.nav.${module}`;
  const list = translate(listCode);
  return list === listCode
    ? translate("agents.step.looked")
    : fillParams(translate("agents.step.looked_in"), { place: list });
}

/**
 * The context a step's `opens` link sends: `about` itself when it is an
 * object, `{ id: about }` for an id (as a table row opens its record), else
 * nothing. A2UI 1.0 carries an event's context as an object.
 */
export function opensContext(about: unknown): Record<string, unknown> {
  if (isRecord(about)) {
    return { ...about };
  }
  return about === undefined || about === null ? {} : { id: about };
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

/** One row an `Arrange` draws for an item (`arrangeRows`). */
export interface ArrangeRow {
  /** The item's place in the list (0-based). */
  readonly index: number;
  /** `key`, else `kind` (`kind-<n>` for a removable item), unique in the list. */
  readonly key: string;
  /** The translated `label` (the key when the item has no label). */
  readonly text: string;
  /** Whether the item shows (`shown`; an item without it shows). */
  readonly shown: boolean;
  /** A kept item always shows: no shown toggle. */
  readonly kept: boolean;
  readonly removable: boolean;
  /** The item's `text`, when it has one (a text box is drawn). */
  readonly note: string | undefined;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The words an `Arrange` item shows: its `label` code translated, else its
 * key (`key`, else `kind`). An item that is not an object shows as it came.
 */
export function arrangeText(item: unknown, translate: Translate): string {
  if (!isRecord(item)) {
    return typeof item === "string" || typeof item === "number" ? scalarText(item) : "";
  }
  const label = nonEmpty(item["label"]);
  if (label !== undefined) {
    return translate(label);
  }
  return nonEmpty(item["key"]) ?? nonEmpty(item["kind"]) ?? "";
}

/**
 * The rows of an `Arrange`'s `items` (xlarge's lab-report layout blocks:
 * `{ key?, kind, label, shown, kept?, removable?, text?, fields? }`). A
 * missing `key` is `kind`, or `kind-<n>` when the item is removable (the
 * first `n` from 1 not taken by another item). `fields` is not read.
 */
export function arrangeRows(items: readonly unknown[], translate: Translate): ArrangeRow[] {
  const taken = new Set<string>();
  for (const item of items) {
    const key = isRecord(item) ? nonEmpty(item["key"]) : undefined;
    if (key !== undefined) {
      taken.add(key);
    }
  }
  return items.map((item, index) => {
    const record = isRecord(item) ? item : {};
    let key = nonEmpty(record["key"]);
    if (key === undefined) {
      const kind = nonEmpty(record["kind"]) ?? (isRecord(item) ? "item" : arrangeText(item, translate));
      if (record["removable"] === true) {
        let n = 1;
        while (taken.has(`${kind}-${n}`)) {
          n += 1;
        }
        key = `${kind}-${n}`;
      } else {
        key = kind;
      }
      taken.add(key);
    }
    return {
      index,
      key,
      text: arrangeText(item, translate),
      shown: record["shown"] !== false,
      kept: record["kept"] === true,
      removable: record["removable"] === true,
      note: typeof record["text"] === "string" ? record["text"] : undefined,
    };
  });
}

/** `items` with the object item at `index` given `patch`; other items as they came. */
export function patchArrangeItem(
  items: readonly unknown[],
  index: number,
  patch: Readonly<Record<string, unknown>>,
): unknown[] {
  return items.map((item, at) => (at === index && isRecord(item) ? { ...item, ...patch } : item));
}

/**
 * The item an `Arrange`'s add button adds: `{ kind, label, shown: true,
 * removable: true, text: "" }` with `kind` from `add` and `label` from
 * `addItem ?? addLabel`. Without `add` nothing is added (`undefined`).
 */
export function newArrangeItem(kind: unknown, label: unknown): Record<string, unknown> | undefined {
  const named = nonEmpty(kind);
  if (named === undefined) {
    return undefined;
  }
  return { kind: named, label: nonEmpty(label) ?? named, shown: true, removable: true, text: "" };
}

/**
 * The context an `Arrange` sends with `save`: the items in their new order
 * under `field` (xlarge's lab-report layout sends `blocks`; `items` when
 * `field` is missing) and `version` when it is set.
 */
export function arrangeContext(
  field: unknown,
  items: readonly unknown[],
  version: unknown,
): Record<string, unknown> {
  const key = nonEmpty(field) ?? "items";
  return version === undefined || version === null
    ? { [key]: [...items] }
    : { [key]: [...items], version };
}

/**
 * What an `Arrange` announces after a move or an add: `template` (the
 * host's `movedText`) with `{name}`, `{at}` (1-based) and `{count}` filled.
 */
export function arrangeMoved(template: string, name: string, at: number, count: number): string {
  return template
    .split("{name}")
    .join(name)
    .split("{at}")
    .join(String(at))
    .split("{count}")
    .join(String(count));
}

/**
 * The points of a `Chart`'s `data`, as xlarge's server sends them: a list of
 * `{ label, value, caption? }` rows (`lab_samples.figures` answers its days
 * and states this way). `caption`, when it is text, is what is shown (money
 * the server already wrote out); otherwise `value`. A row whose value is not
 * a plain decimal is left out, as xlarge leaves it out. Each label is
 * translated with `labelPrefix`, else shown by `labelFormat` (a `Table`
 * column format); each value by `format` (default `number`, as `metricText`)
 * from its text, never through a float. `tones` maps a label, as it came, to
 * xlarge's tone word.
 */
export function chartPoints(
  data: unknown,
  format: ChartFormat,
  translate: Translate,
): readonly ChartPoint[] {
  const tones = isRecord(format.tones) ? format.tones : {};
  const column = {
    format: typeof format.labelFormat === "string" ? format.labelFormat : undefined,
    enumPrefix: typeof format.labelPrefix === "string" ? format.labelPrefix : undefined,
  };
  const shownAs = typeof format.format === "string" ? format.format : "number";
  const points: ChartPoint[] = [];
  tableRows(data).forEach((row, index) => {
    const caption = row["caption"];
    const raw = (typeof caption === "string" ? caption : scalarText(row["value"])).trim();
    if (splitDecimal(raw) === undefined) {
      return;
    }
    const rawLabel = scalarText(row["label"]);
    const tone = stateTone(tones[rawLabel]);
    // Only the drawing's geometry reads a number; text and sums never do.
    const size = Number(raw);
    points.push({
      key: `at:${index}:${rawLabel}`,
      label: rawLabel === "" ? "" : formatCell(rawLabel, column, translate),
      raw,
      value: metricText(raw, shownAs),
      size: Number.isFinite(size) ? size : 0,
      ...(tone !== undefined ? { tone } : {}),
    });
  });
  return points;
}

/**
 * The big figure of a sparkline: with `sum` the exact total of every point,
 * else the last point's value, shown by `format` (default `number`); `""`
 * with no points.
 */
export function chartHeadline(points: readonly ChartPoint[], sum: unknown, format: unknown): string {
  if (points.length === 0) {
    return "";
  }
  const shownAs = typeof format === "string" ? format : "number";
  return sum === true
    ? metricText(sumDecimals(points.map((point) => point.raw)), shownAs)
    : (points[points.length - 1]?.value ?? "");
}

/**
 * The exact sum of decimal texts (`["0.1", "0.2"]` → `"0.3"`), added as
 * integers of the longest fraction, never through a float. Texts that are not
 * plain decimals are left out; with none, `"0"`.
 */
export function sumDecimals(values: readonly string[]): string {
  const parsed: { sign: string; whole: string; fraction: string }[] = [];
  for (const value of values) {
    const parts = splitDecimal(value.trim());
    if (parts !== undefined) {
      parsed.push(parts);
    }
  }
  const scale = parsed.reduce((max, parts) => Math.max(max, parts.fraction.length), 0);
  let total = 0n;
  for (const parts of parsed) {
    const units = BigInt(`${parts.whole}${parts.fraction.padEnd(scale, "0")}`);
    total += parts.sign === "-" ? -units : units;
  }
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale > 0 ? `.${digits.slice(digits.length - scale)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/**
 * Each point's share of a pie (from `0` to `1`); points that are not
 * positive take none. All zeros when nothing is positive.
 */
export function pieShares(points: readonly Pick<ChartPoint, "size">[]): readonly number[] {
  const total = points.reduce((sum, point) => sum + (point.size > 0 ? point.size : 0), 0);
  return points.map((point) => (total > 0 && point.size > 0 ? point.size / total : 0));
}

/** One dated item on a `Calendar` (xlarge's `calendar::Shown`). */
export interface CalendarItem {
  readonly key: string;
  readonly id: string;
  /** `YYYY-MM-DD`, where the workspace is. */
  readonly day: string;
  /** `HH:MM` it starts, or `""`. */
  readonly time: string;
  readonly title: string;
  /** The action it opens with `{ id }`: `screen:work_orders.order`. */
  readonly screen: string;
  readonly tone: StateTone;
  readonly module: string;
  /** What it is, a code. */
  readonly label: string;
}

/** One cell of a `Calendar` grid; outside the month, `date` is empty. */
export interface CalendarDay {
  readonly key: string;
  /** `YYYY-MM-DD`, or `""` for a blank cell before or after the month. */
  readonly date: string;
  /** The day of the month, `0` for a blank cell. */
  readonly day: number;
  readonly items: readonly CalendarItem[];
}

/** What put items on the month, for the filter (xlarge's `calendar::Source`). */
export interface CalendarSource {
  readonly module: string;
  readonly label: string;
  readonly count: string;
}

/** A module that could not be read for this month (`calendar::Missing`). */
export interface CalendarMissing {
  readonly module: string;
  readonly label: string;
}

/** A `Calendar`'s month as xlarge's `calendar.month` answers it, laid out. */
export interface CalendarMonth {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly year: number;
  /** 1 to 12. */
  readonly monthNumber: number;
  /** `YYYY-MM` before and after, or `""`. */
  readonly previous: string;
  readonly next: string;
  /** Monday first, the items filtered by module. */
  readonly weeks: readonly (readonly CalendarDay[])[];
  readonly sources: readonly CalendarSource[];
  readonly missing: readonly CalendarMissing[];
  /** How many items the filter left. */
  readonly shown: number;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

const MONTH = /^(\d{4})-(\d{2})$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The last day of a month, `"2026-02"` → `"2026-02-28"`; `""` for no month. */
export function lastOfMonth(month: unknown): string {
  const match = MONTH.exec(scalarText(month));
  if (!match) {
    return "";
  }
  const days = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return `${match[1]}-${match[2]}-${pad2(days)}`;
}

/**
 * The month a `Calendar.month` binding holds, as xlarge's `calendar.month`
 * answers it: `{ month, first, last, previous, next, items, sources,
 * missing }`, each item `{ id, day, time?, title, screen, tone?, module,
 * label }`. Laid out in weeks Monday first from `first` to `last`, each day
 * with its items, only those of module `only` when it is not `""`.
 * `undefined` when there is no month to show.
 */
export function calendarMonth(value: unknown, only = ""): CalendarMonth | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const month = MONTH.exec(scalarText(value["month"]));
  const first = DAY.exec(scalarText(value["first"]));
  const last = DAY.exec(scalarText(value["last"]));
  if (!month || !first || !last) {
    return undefined;
  }
  const year = Number(first[1]);
  const monthNumber = Number(first[2]);
  const items: CalendarItem[] = [];
  tableRows(value["items"]).forEach((row, index) => {
    const id = scalarText(row["id"]);
    const day = scalarText(row["day"]);
    const module = scalarText(row["module"]);
    if (only !== "" && module !== only) {
      return;
    }
    items.push({
      key: `${index}:${id}`,
      id,
      day,
      time: scalarText(row["time"]),
      title: scalarText(row["title"]),
      screen: scalarText(row["screen"]),
      tone: stateTone(row["tone"]) ?? "neutral",
      module,
      label: scalarText(row["label"]),
    });
  });
  const lead = (new Date(Date.UTC(year, monthNumber - 1, Number(first[3]))).getUTCDay() + 6) % 7;
  const cells: CalendarDay[] = [];
  for (let blank = 0; blank < lead; blank += 1) {
    cells.push({ key: `lead:${blank}`, date: "", day: 0, items: [] });
  }
  for (let day = 1; day <= Number(last[3]); day += 1) {
    const date = `${month[1]}-${month[2]}-${pad2(day)}`;
    cells.push({ key: date, date, day, items: items.filter((item) => item.day === date) });
  }
  for (let blank = 0; cells.length % 7 !== 0; blank += 1) {
    cells.push({ key: `trail:${blank}`, date: "", day: 0, items: [] });
  }
  const weeks: CalendarDay[][] = [];
  for (let start = 0; start < cells.length; start += 7) {
    weeks.push(cells.slice(start, start + 7));
  }
  const near = (key: string): string => (MONTH.test(scalarText(value[key])) ? scalarText(value[key]) : "");
  return {
    month: `${month[1]}-${month[2]}`,
    year,
    monthNumber,
    previous: near("previous"),
    next: near("next"),
    weeks,
    sources: tableRows(value["sources"]).map((row) => ({
      module: scalarText(row["module"]),
      label: scalarText(row["label"]),
      count: scalarText(row["count"]),
    })),
    missing: tableRows(value["missing"]).map((row) => ({
      module: scalarText(row["module"]),
      label: scalarText(row["label"]),
    })),
    shown: items.length,
  };
}

/**
 * The context a `Calendar` sends to read its screen again for the month `to`
 * (`YYYY-MM`), as xlarge's client does: `{ period: "between", from, to }`,
 * the month's first and last day. `undefined` for no month.
 */
export function calendarPeriod(to: unknown): Record<string, unknown> | undefined {
  const last = lastOfMonth(to);
  return last === "" ? undefined : { period: "between", from: `${scalarText(to)}-01`, to: last };
}

/** The emojis a person can always put under a record's message, each once. */
export const RECORD_EMOJI: readonly string[] = ["👍", "✅", "👀"];

/** One emoji under a message: how many put it, and whether this person did. */
export interface ConversationReaction {
  readonly emoji: string;
  readonly count: number;
  readonly mine: boolean;
}

/** One message of a record's `Conversation` (xlarge's `talk.on` row). */
export interface ConversationMessage {
  readonly key: string;
  readonly id: string;
  /** The writer's name, `""` when the account is gone (`mine` aside). */
  readonly by: string;
  readonly text: string;
  /** `YYYY-MM-DD HH:MM`. */
  readonly at: string;
  readonly mine: boolean;
  readonly takenBack: boolean;
  /** `RECORD_EMOJI` first, then any other emoji somebody put. */
  readonly reactions: readonly ConversationReaction[];
}

/**
 * The messages of a `Conversation.rows` binding, oldest first. xlarge's
 * `talk.on` answers them newest first, each `{ id, by: { id, name }?, text?,
 * takenBack, at, mine, reactions: [{ emoji, count }], myReaction: [emoji] }`.
 */
export function conversationMessages(rows: unknown): readonly ConversationMessage[] {
  return tableRows(rows)
    .slice()
    .reverse()
    .map((row, index) => {
      const id = scalarText(row["id"]);
      const by = isRecord(row["by"]) ? scalarText(row["by"]["name"]) : "";
      const counts = new Map<string, number>();
      for (const entry of tableRows(row["reactions"])) {
        const count = Number(entry["count"]);
        counts.set(scalarText(entry["emoji"]), Number.isFinite(count) ? count : 0);
      }
      const mine = new Set(Array.isArray(row["myReaction"]) ? row["myReaction"].map(scalarText) : []);
      const offered = [...RECORD_EMOJI, ...[...counts.keys()].filter((emoji) => emoji !== "" && !RECORD_EMOJI.includes(emoji))];
      return {
        key: id !== "" ? `id:${id}` : `at:${index}`,
        id,
        by,
        text: scalarText(row["text"]),
        at: formatCell(row["at"], { format: "datetime" }, SHOW_CODES),
        mine: row["mine"] === true,
        takenBack: row["takenBack"] === true,
        reactions: offered.map((emoji) => ({ emoji, count: counts.get(emoji) ?? 0, mine: mine.has(emoji) })),
      };
    });
}

/** Around a record's conversation, as xlarge's `talk.about` answers it. */
export interface ConversationAround {
  /** The conversation's id, `r_<kind>_<id>`, or `""`. */
  readonly talk: string;
  /** The record's id the conversation's id names, or `""`. */
  readonly record: string;
  /** The colleagues a writer may tell. */
  readonly people: readonly { readonly id: string; readonly name: string }[];
  readonly unread: boolean;
}

/**
 * What a `Conversation.around` binding holds: `{ talk, people, unread }`.
 * The record's id is read from the conversation's id (`r_<kind>_<id>`, the
 * id being letters and digits), which is how xlarge's server names it.
 */
export function conversationAround(value: unknown): ConversationAround {
  const held = isRecord(value) ? value : {};
  const talk = scalarText(held["talk"]);
  const match = /^r_[a-z_]+_([A-Za-z0-9]+)$/.exec(talk);
  return {
    talk,
    record: match?.[1] ?? "",
    people: tableRows(held["people"])
      .map((row) => ({ id: scalarText(row["id"]), name: scalarText(row["name"]) }))
      .filter((person) => person.id !== ""),
    unread: held["unread"] === true,
  };
}
