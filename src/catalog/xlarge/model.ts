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
