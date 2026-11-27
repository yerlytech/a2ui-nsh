/**
 * Clean-room strict ISO 8601 timestamp parser and Unicode TR35 date formatter.
 *
 * Design guarantees:
 * - Rejects impossible calendar dates (e.g. `2026-02-30`, `2026-13-01`) by
 *   returning `""` instead of rolling over into adjacent months/years.
 * - Treats timestamps without an explicit offset as written (UTC), never as
 *   host-local time.
 * - Preserves written wall-clock date/time for timestamps carrying an explicit
 *   offset (e.g. `2026-09-04T23:30:00-05:00` renders as `2026-09-04 23:30`),
 *   while `format: "ISO"` emits the normalized UTC instant (`...Z`).
 * - Formats localized month, weekday, and day-period names via our pure-TS
 *   locale tables so Turkish, German, English, etc. work identically inside
 *   QuickJS without host ICU/timezone databases.
 */

import { getLocaleDateNames } from "./locale";

export interface ParsedTimestamp {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
  readonly hour: number; // 0-23
  readonly minute: number; // 0-59
  readonly second: number; // 0-59
  readonly ms: number; // 0-999
  /** Day of week for the wall-clock date: 0 = Sunday .. 6 = Saturday. */
  readonly weekday: number;
  /** Offset from UTC in minutes (e.g. -300 for -05:00, 0 for Z/unqualified). */
  readonly offsetMinutes: number;
  /** Exact UTC epoch milliseconds for `format: "ISO"`. */
  readonly instantMs: number;
}

const ISO_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;

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

function pad(n: number, width: number): string {
  const neg = n < 0;
  const s = String(Math.abs(Math.trunc(n))).padStart(width, "0");
  return neg ? `-${s}` : s;
}

function parseFromUtcMs(ms: number): ParsedTimestamp | null {
  if (!Number.isFinite(ms)) {
    return null;
  }
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    ms: d.getUTCMilliseconds(),
    weekday: d.getUTCDay(),
    offsetMinutes: 0,
    instantMs: d.getTime(),
  };
}

/**
 * Strictly parses an ISO 8601 date/time string, epoch millisecond number, or
 * `Date` instance. Returns `null` on invalid or impossible calendar values.
 */
export function parseStrictTimestamp(value: unknown): ParsedTimestamp | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return parseFromUtcMs(value.getTime());
  }
  if (typeof value === "number") {
    return parseFromUtcMs(value);
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const match = ISO_DATE_TIME_RE.exec(trimmed);
  if (!match) {
    return null;
  }

  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const day = parseInt(match[3]!, 10);

  if (month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  const hour = match[4] !== undefined ? parseInt(match[4], 10) : 0;
  const minute = match[5] !== undefined ? parseInt(match[5], 10) : 0;
  const second = match[6] !== undefined ? parseInt(match[6], 10) : 0;

  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  let ms = 0;
  if (match[7] !== undefined) {
    const frac = match[7].slice(0, 3).padEnd(3, "0");
    ms = parseInt(frac, 10);
  }

  let offsetMinutes = 0;
  const rawTz = match[8];
  if (rawTz !== undefined && rawTz !== "Z" && rawTz !== "z") {
    const sign = rawTz[0] === "-" ? -1 : 1;
    const digits = rawTz.slice(1).replace(":", "");
    const offH = parseInt(digits.slice(0, 2), 10);
    const offM = parseInt(digits.slice(2, 4), 10);
    if (offH > 23 || offM > 59) {
      return null;
    }
    offsetMinutes = sign * (offH * 60 + offM);
  }

  // Compute weekday and UTC instant in UTC (independent of host TZ).
  // setUTCFullYear keeps years 0-99 as written; Date.UTC maps them to 1900-1999.
  const wallDate = new Date(Date.UTC(2000, 0, 1, hour, minute, second, ms));
  wallDate.setUTCFullYear(year, month - 1, day);
  const wallUtcMs = wallDate.getTime();
  if (Number.isNaN(wallUtcMs)) {
    return null;
  }
  const instantMs = wallUtcMs - offsetMinutes * 60_000;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    ms,
    weekday: wallDate.getUTCDay(),
    offsetMinutes,
    instantMs,
  };
}

function formatOffset(
  offsetMinutes: number,
  colon: boolean,
  zForZero: boolean,
): string {
  if (offsetMinutes === 0 && zForZero) {
    return "Z";
  }
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const hh = pad(Math.floor(abs / 60), 2);
  const mm = pad(abs % 60, 2);
  return colon ? `${sign}${hh}:${mm}` : `${sign}${hh}${mm}`;
}

function isAsciiLetter(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

/**
 * Formats a date/time value using `"ISO"` (normalized UTC ISO 8601) or a
 * Unicode TR35 pattern string in the requested BCP 47 `locale`.
 */
export function formatTr35Date(
  value: unknown,
  formatPattern = "yyyy-MM-dd",
  locale?: string,
): string {
  const parsed = parseStrictTimestamp(value);
  if (!parsed) {
    return "";
  }

  const pattern = formatPattern.length > 0 ? formatPattern : "yyyy-MM-dd";
  if (pattern === "ISO") {
    return new Date(parsed.instantMs).toISOString();
  }

  const names = getLocaleDateNames(locale);
  const hours12 = parsed.hour % 12 === 0 ? 12 : parsed.hour % 12;
  let out = "";

  for (let i = 0; i < pattern.length; ) {
    const ch = pattern[i]!;

    // TR35 single-quoted literal text ('' -> literal ').
    if (ch === "'") {
      if (pattern[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      i += 1;
      while (i < pattern.length) {
        if (pattern[i] === "'") {
          if (pattern[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        out += pattern[i]!;
        i += 1;
      }
      continue;
    }

    if (!isAsciiLetter(ch)) {
      out += ch;
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < pattern.length && pattern[j] === ch) {
      j += 1;
    }
    const token = pattern.slice(i, j);
    i = j;

    switch (ch) {
      case "y":
        if (token.length === 2) {
          out += pad(parsed.year % 100, 2);
        } else if (token.length === 1) {
          out += String(parsed.year);
        } else {
          out += pad(parsed.year, token.length);
        }
        break;
      case "M":
      case "L":
        if (token.length >= 4) {
          out += names.monthsWide[parsed.month - 1]!;
        } else if (token.length === 3) {
          out += names.monthsShort[parsed.month - 1]!;
        } else if (token.length === 2) {
          out += pad(parsed.month, 2);
        } else {
          out += String(parsed.month);
        }
        break;
      case "d":
        out += token.length >= 2 ? pad(parsed.day, 2) : String(parsed.day);
        break;
      case "E":
        out +=
          token.length >= 4
            ? names.weekdaysWide[parsed.weekday]!
            : names.weekdaysShort[parsed.weekday]!;
        break;
      case "H":
        out += token.length >= 2 ? pad(parsed.hour, 2) : String(parsed.hour);
        break;
      case "h":
        out += token.length >= 2 ? pad(hours12, 2) : String(hours12);
        break;
      case "m":
        out += token.length >= 2 ? pad(parsed.minute, 2) : String(parsed.minute);
        break;
      case "s":
        out += token.length >= 2 ? pad(parsed.second, 2) : String(parsed.second);
        break;
      case "S": {
        const msStr = pad(parsed.ms, 3);
        out +=
          token.length <= 3
            ? msStr.slice(0, token.length)
            : msStr.padEnd(token.length, "0");
        break;
      }
      case "a":
        out += parsed.hour < 12 ? names.dayPeriods[0] : names.dayPeriods[1];
        break;
      case "Z":
        out +=
          token.length >= 5
            ? formatOffset(parsed.offsetMinutes, true, true)
            : formatOffset(parsed.offsetMinutes, false, false);
        break;
      case "X":
        // TR35: a single X is +HH, with minutes only when they are non-zero.
        out +=
          token.length === 1 && parsed.offsetMinutes % 60 === 0
            ? formatOffset(parsed.offsetMinutes, false, true).slice(0, 3)
            : formatOffset(parsed.offsetMinutes, token.length >= 3, true);
        break;
      default:
        out += token;
        break;
    }
  }

  return out;
}
