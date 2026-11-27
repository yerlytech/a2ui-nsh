/**
 * Pure ISO 8601 parsing, normalization, clamping, and formatting helpers for
 * A2UI Basic Catalog v1 `DateTimeInput`.
 *
 * Bridges A2UI v1.0 ISO 8601 strings (which may be `""`, `"YYYY-MM-DD"`,
 * `"HH:MM"`, `"HH:MM:SS"`, or `"YYYY-MM-DDTHH:MM:SSZ"` / offsets) onto
 * `nsh 0.7.2` `DatePicker` (`DatePickerValue`: a single `"YYYY-MM-DD"` | `null`)
 * and `TimeField` (`string`: `"HH:MM"` | `"HH:MM:SS"`). Measured on `nsh 0.7.2`
 * (2026-11-27): both still reject empty strings and timezone suffixes; headless,
 * `""`, `"…Z"` and `"…+03:00"` log `warn DatePicker.value: expected an ISO date`
 * / `warn TimeField.value: expected a time of day` and are dropped (no day
 * selected; `00:00` shown), while `DatePicker` now also takes `"YYYY-MM-DDTHH:MM"`
 * (`measured/date_values.test.tsx`).
 */

const ISO_DATE_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;
const ISO_TIME_ONLY_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?/;
const ISO_DATE_TIME_SPLIT_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  return day <= daysInMonth(year, month);
}

function isValidClockTime(hour: number, minute: number, second: number): boolean {
  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}

/** Active display/editing mode derived from `enableDate` and `enableTime`. */
export type DateTimeMode = "date" | "time" | "datetime";

/**
 * Resolves effective `(enableDate, enableTime)` flags following A2UI Basic
 * Catalog semantics: when `enableDate` is omitted it defaults to `!enableTime`,
 * so omitting both enables date-only mode while setting only `enableTime: true`
 * enables time-only mode.
 */
export function resolveDateTimeFlags(
  rawEnableDate: boolean | undefined,
  rawEnableTime: boolean | undefined,
): { readonly enableDate: boolean; readonly enableTime: boolean; readonly mode: DateTimeMode } {
  const enableTime = rawEnableTime ?? false;
  const enableDate = rawEnableDate ?? !enableTime;
  if (enableDate && enableTime) {
    return { enableDate: true, enableTime: true, mode: "datetime" };
  }
  if (enableTime) {
    return { enableDate: false, enableTime: true, mode: "time" };
  }
  return { enableDate: true, enableTime: false, mode: "date" };
}

/**
 * Extracts a validated `"YYYY-MM-DD"` date string from an ISO 8601 value,
 * returning `null` for empty, time-only, or impossible calendar dates.
 */
export function extractIsoDatePart(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  const match = ISO_DATE_PREFIX_RE.exec(trimmed);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Extracts a validated `"HH:MM"` 24-hour wall-clock time from an ISO 8601
 * time or date-time string without shifting timezones, returning `null` when
 * absent or invalid.
 */
export function extractIsoTimePart(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  const splitMatch = ISO_DATE_TIME_SPLIT_RE.exec(trimmed);
  const timeCandidate = splitMatch ? splitMatch[2]! : trimmed;
  const match = ISO_TIME_ONLY_RE.exec(timeCandidate);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] !== undefined ? Number(match[3]) : 0;
  if (!isValidClockTime(hour, minute, second)) {
    return null;
  }
  return `${match[1]}:${match[2]}`;
}

/** Returns local calendar date `"YYYY-MM-DD"` (injectable clock seam for tests). */
export function getLocalIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMinutesOfDay(hhmm: string): number {
  const hour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(3, 5));
  return hour * 60 + minute;
}

/**
 * Clamps an `"HH:MM"` time within optional `[minTime, maxTime]` bounds.
 *
 * `BasicDateTimeInput` also hands these bounds to `TimeField`'s native
 * `min`/`max` (`nsh 0.7.2`); this clamp stays on every write so the data model
 * never receives an out-of-range time, whatever the native control does.
 */
export function clampTimeToBounds(
  time: string,
  minTime: string | null,
  maxTime: string | null,
): string {
  const normalized = extractIsoTimePart(time);
  if (!normalized) {
    return time;
  }
  const mins = toMinutesOfDay(normalized);
  if (minTime !== null) {
    const minMins = toMinutesOfDay(minTime);
    if (mins < minMins) {
      return minTime;
    }
  }
  if (maxTime !== null) {
    const maxMins = toMinutesOfDay(maxTime);
    if (mins > maxMins) {
      return maxTime;
    }
  }
  return normalized;
}

/**
 * Computes effective time bounds for `selectedDate` given raw `min`/`max`
 * ISO 8601 strings:
 * - In `"time"` mode, always applies any extracted `min`/`max` time parts.
 * - In `"datetime"` mode, applies `min`'s time bound when `min` has no date or
 *   matches `selectedDate`, and `max`'s time bound when `max` has no date or
 *   matches `selectedDate`.
 */
export function resolveEffectiveTimeBounds(
  mode: DateTimeMode,
  selectedDate: string | null,
  rawMin: string | undefined,
  rawMax: string | undefined,
): { readonly minTime: string | null; readonly maxTime: string | null } {
  const minDate = extractIsoDatePart(rawMin);
  const maxDate = extractIsoDatePart(rawMax);
  const rawMinTime = extractIsoTimePart(rawMin);
  const rawMaxTime = extractIsoTimePart(rawMax);

  if (mode === "time") {
    return { minTime: rawMinTime, maxTime: rawMaxTime };
  }

  const minTime =
    rawMinTime !== null && (minDate === null || selectedDate === minDate)
      ? rawMinTime
      : null;
  const maxTime =
    rawMaxTime !== null && (maxDate === null || selectedDate === maxDate)
      ? rawMaxTime
      : null;
  return { minTime, maxTime };
}

/**
 * Combines a date or time edit with the existing ISO 8601 string according to
 * `mode`, preserving the complementary part in `"datetime"` mode.
 */
export function applyDateTimeEdit(
  mode: DateTimeMode,
  currentRaw: string,
  edit: { readonly kind: "date"; readonly value: string | null } | { readonly kind: "time"; readonly value: string },
  options?: {
    readonly rawMin?: string;
    readonly rawMax?: string;
    readonly todayIso?: () => string;
  },
): string {
  if (mode === "date") {
    if (edit.kind !== "date" || edit.value === null) {
      return "";
    }
    return extractIsoDatePart(edit.value) ?? "";
  }

  if (mode === "time") {
    if (edit.kind !== "time") {
      return currentRaw;
    }
    const bounds = resolveEffectiveTimeBounds(
      "time",
      null,
      options?.rawMin,
      options?.rawMax,
    );
    return clampTimeToBounds(edit.value, bounds.minTime, bounds.maxTime);
  }

  // Combined "datetime" mode.
  if (edit.kind === "date") {
    if (edit.value === null) {
      return "";
    }
    const nextDate = extractIsoDatePart(edit.value);
    if (!nextDate) {
      return "";
    }
    const existingTime = extractIsoTimePart(currentRaw) ?? "00:00";
    const bounds = resolveEffectiveTimeBounds(
      "datetime",
      nextDate,
      options?.rawMin,
      options?.rawMax,
    );
    const clampedTime = clampTimeToBounds(
      existingTime,
      bounds.minTime,
      bounds.maxTime,
    );
    return `${nextDate}T${clampedTime}:00`;
  }

  const baseDate =
    extractIsoDatePart(currentRaw) ?? (options?.todayIso ?? getLocalIsoDate)();
  const bounds = resolveEffectiveTimeBounds(
    "datetime",
    baseDate,
    options?.rawMin,
    options?.rawMax,
  );
  const clampedTime = clampTimeToBounds(
    edit.value,
    bounds.minTime,
    bounds.maxTime,
  );
  return `${baseDate}T${clampedTime}:00`;
}
