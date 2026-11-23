/**
 * Clean-room pure TypeScript locale data, CLDR cardinal plural rules, and
 * localized number/currency formatting.
 *
 * Written directly from the Unicode CLDR and ISO 4217 specifications so
 * formatting works identically inside QuickJS / nsh (where `Intl.PluralRules`
 * is absent and Turkish/non-English date names or locale packs may be missing).
 */

export const DEFAULT_LOCALE = "en-US";

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

export interface LocaleNumberProfile {
  readonly decimal: string;
  readonly group: string;
  /** Currency symbol placement relative to the formatted magnitude. */
  readonly currencyPosition: "prefix" | "suffix";
  /** Separator inserted between currency symbol and amount ("" or "\u00A0"). */
  readonly currencySpace: string;
}

export interface LocaleDateNames {
  /** Wide month names, index 0 = January .. 11 = December. */
  readonly monthsWide: readonly string[];
  /** Abbreviated month names, index 0 = Jan .. 11 = Dec. */
  readonly monthsShort: readonly string[];
  /** Wide weekday names, index 0 = Sunday .. 6 = Saturday. */
  readonly weekdaysWide: readonly string[];
  /** Abbreviated weekday names, index 0 = Sun .. 6 = Sat. */
  readonly weekdaysShort: readonly string[];
  /** Day period markers [AM, PM]. */
  readonly dayPeriods: readonly [string, string];
}

// ---------------------------------------------------------------------------
// Built-in locale profiles (English, Turkish, German, French, Spanish)
// ---------------------------------------------------------------------------

const EN_NUMBER: LocaleNumberProfile = {
  decimal: ".",
  group: ",",
  currencyPosition: "prefix",
  currencySpace: "",
};

const TR_NUMBER: LocaleNumberProfile = {
  decimal: ",",
  group: ".",
  currencyPosition: "prefix",
  currencySpace: "",
};

const DE_NUMBER: LocaleNumberProfile = {
  decimal: ",",
  group: ".",
  currencyPosition: "suffix",
  currencySpace: "\u00A0",
};

const DE_CH_NUMBER: LocaleNumberProfile = {
  decimal: ".",
  group: "\u2019",
  currencyPosition: "prefix",
  currencySpace: "\u00A0",
};

const FR_NUMBER: LocaleNumberProfile = {
  decimal: ",",
  group: "\u202F",
  currencyPosition: "suffix",
  currencySpace: "\u00A0",
};

const ES_NUMBER: LocaleNumberProfile = {
  decimal: ",",
  group: ".",
  currencyPosition: "suffix",
  currencySpace: "\u00A0",
};

const NUMBER_PROFILES: Readonly<Record<string, LocaleNumberProfile>> = {
  en: EN_NUMBER,
  "en-us": EN_NUMBER,
  "en-gb": EN_NUMBER,
  "en-ca": EN_NUMBER,
  "en-au": EN_NUMBER,
  tr: TR_NUMBER,
  "tr-tr": TR_NUMBER,
  de: DE_NUMBER,
  "de-de": DE_NUMBER,
  "de-at": DE_NUMBER,
  "de-ch": DE_CH_NUMBER,
  fr: FR_NUMBER,
  "fr-fr": FR_NUMBER,
  es: ES_NUMBER,
  "es-es": ES_NUMBER,
};

const EN_DATE_NAMES: LocaleDateNames = {
  monthsWide: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  monthsShort: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  weekdaysWide: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  dayPeriods: ["AM", "PM"],
};

const TR_DATE_NAMES: LocaleDateNames = {
  monthsWide: [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
  ],
  monthsShort: [
    "Oca",
    "Şub",
    "Mar",
    "Nis",
    "May",
    "Haz",
    "Tem",
    "Ağu",
    "Eyl",
    "Eki",
    "Kas",
    "Ara",
  ],
  weekdaysWide: [
    "Pazar",
    "Pazartesi",
    "Salı",
    "Çarşamba",
    "Perşembe",
    "Cuma",
    "Cumartesi",
  ],
  weekdaysShort: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"],
  dayPeriods: ["ÖÖ", "ÖS"],
};

const DE_DATE_NAMES: LocaleDateNames = {
  monthsWide: [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ],
  monthsShort: [
    "Jan.",
    "Feb.",
    "März",
    "Apr.",
    "Mai",
    "Juni",
    "Juli",
    "Aug.",
    "Sept.",
    "Okt.",
    "Nov.",
    "Dez.",
  ],
  weekdaysWide: [
    "Sonntag",
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
  ],
  weekdaysShort: ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."],
  dayPeriods: ["AM", "PM"],
};

const FR_DATE_NAMES: LocaleDateNames = {
  monthsWide: [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ],
  monthsShort: [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ],
  weekdaysWide: [
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
  ],
  weekdaysShort: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
  dayPeriods: ["AM", "PM"],
};

const ES_DATE_NAMES: LocaleDateNames = {
  monthsWide: [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ],
  monthsShort: [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sept",
    "oct",
    "nov",
    "dic",
  ],
  weekdaysWide: [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ],
  weekdaysShort: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  dayPeriods: ["a. m.", "p. m."],
};

const DATE_NAMES: Readonly<Record<string, LocaleDateNames>> = {
  en: EN_DATE_NAMES,
  tr: TR_DATE_NAMES,
  de: DE_DATE_NAMES,
  fr: FR_DATE_NAMES,
  es: ES_DATE_NAMES,
};

// Standard ISO 4217 currency symbols & minor-unit defaults.
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: "$",
  EUR: "€",
  TRY: "₺",
  GBP: "£",
  JPY: "¥",
  CNY: "CN¥",
  CHF: "CHF",
  CAD: "CA$",
  AUD: "A$",
  INR: "₹",
  KRW: "₩",
  BRL: "R$",
  RUB: "₽",
  PLN: "zł",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  MXN: "MX$",
  HKD: "HK$",
  NZD: "NZ$",
  SGD: "S$",
  ZAR: "R",
};

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
]);

const BCP47_TAG_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-[A-Za-z0-9]{5,8})*$/;

/**
 * Resolves a BCP 47 locale tag, falling back to `en-US` for missing,
 * malformed (e.g. `en_US`), or unrecognized tags so output never silently
 * drifts to the host ambient locale.
 */
export function resolveLocaleTag(locale?: string): string {
  if (!locale || !BCP47_TAG_RE.test(locale)) {
    return DEFAULT_LOCALE;
  }
  const lower = locale.toLowerCase();
  const base = lower.split("-")[0]!;
  if (lower in NUMBER_PROFILES || base in NUMBER_PROFILES || base in PLURAL_RULE_SET) {
    return locale;
  }
  return DEFAULT_LOCALE;
}

function getBaseLanguage(locale?: string): string {
  const resolved = resolveLocaleTag(locale).toLowerCase();
  return resolved.split("-")[0]!;
}

export function getLocaleNumberProfile(locale?: string): LocaleNumberProfile {
  const resolved = resolveLocaleTag(locale).toLowerCase();
  const exact = NUMBER_PROFILES[resolved];
  if (exact) return exact;
  const base = resolved.split("-")[0]!;
  return NUMBER_PROFILES[base] ?? EN_NUMBER;
}

export function getLocaleDateNames(locale?: string): LocaleDateNames {
  const base = getBaseLanguage(locale);
  return DATE_NAMES[base] ?? EN_DATE_NAMES;
}

export function getCurrencyDefaultDecimals(currencyCode: string): number {
  const code = currencyCode.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export function getCurrencySymbol(currencyCode: string, _locale?: string): string {
  const code = currencyCode.toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? code;
}

// ---------------------------------------------------------------------------
// Deterministic CLDR cardinal plural rules
// ---------------------------------------------------------------------------

interface PluralOperands {
  readonly n: number;
  readonly i: number;
  readonly v: number;
  readonly f: number;
  readonly t: number;
}

function computePluralOperands(value: number): PluralOperands {
  const n = Math.abs(value);
  const i = Math.trunc(n);
  const str = String(n);
  const dot = str.indexOf(".");
  if (dot < 0 || str.includes("e") || str.includes("E")) {
    return { n, i, v: 0, f: 0, t: 0 };
  }
  const frac = str.slice(dot + 1);
  const v = frac.length;
  const f = parseInt(frac, 10) || 0;
  const trimmed = frac.replace(/0+$/, "");
  const t = trimmed.length > 0 ? parseInt(trimmed, 10) : 0;
  return { n, i, v, f, t };
}

type PluralRuleFn = (op: PluralOperands) => PluralCategory;

const ONE_I1_V0: PluralRuleFn = ({ i, v }) => (i === 1 && v === 0 ? "one" : "other");
const ONE_N1: PluralRuleFn = ({ n }) => (n === 1 ? "one" : "other");
const ONE_I0_OR_I1: PluralRuleFn = ({ i }) => (i === 0 || i === 1 ? "one" : "other");
const ALWAYS_OTHER: PluralRuleFn = () => "other";

const EAST_SLAVIC: PluralRuleFn = ({ i, v }) => {
  if (v !== 0) return "other";
  const mod10 = i % 10;
  const mod100 = i % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "few";
  return "many";
};

const POLISH: PluralRuleFn = ({ i, v }) => {
  if (v !== 0) return "other";
  if (i === 1) return "one";
  const mod10 = i % 10;
  const mod100 = i % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "few";
  return "many";
};

const CZECH_SLOVAK: PluralRuleFn = ({ i, v }) => {
  if (v === 0 && i === 1) return "one";
  if (v === 0 && i >= 2 && i <= 4) return "few";
  if (v !== 0) return "many";
  return "other";
};

const ARABIC: PluralRuleFn = ({ n }) => {
  if (n === 0) return "zero";
  if (n === 1) return "one";
  if (n === 2) return "two";
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return "few";
  if (mod100 >= 11 && mod100 <= 99) return "many";
  return "other";
};

const WELSH: PluralRuleFn = ({ n }) => {
  if (n === 0) return "zero";
  if (n === 1) return "one";
  if (n === 2) return "two";
  if (n === 3) return "few";
  if (n === 6) return "many";
  return "other";
};

const HEBREW: PluralRuleFn = ({ i, v }) => {
  if (i === 1 && v === 0) return "one";
  if (i === 2 && v === 0) return "two";
  return "other";
};

const ROMANIAN: PluralRuleFn = ({ i, v, n }) => {
  if (i === 1 && v === 0) return "one";
  if (v !== 0 || n === 0 || (n !== 1 && n % 100 >= 1 && n % 100 <= 19)) {
    return "few";
  }
  return "other";
};

const LITHUANIAN: PluralRuleFn = ({ n, f }) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && !(mod100 >= 11 && mod100 <= 19)) return "one";
  if (mod10 >= 2 && mod10 <= 9 && !(mod100 >= 11 && mod100 <= 19)) return "few";
  if (f !== 0) return "many";
  return "other";
};

const SLOVENIAN: PluralRuleFn = ({ i, v }) => {
  if (v !== 0) return "other";
  const mod100 = i % 100;
  if (mod100 === 1) return "one";
  if (mod100 === 2) return "two";
  if (mod100 === 3 || mod100 === 4) return "few";
  return "other";
};

const PLURAL_RULE_SET: Readonly<Record<string, PluralRuleFn>> = {
  // Germanic, Romance, Uralic, etc. (i = 1, v = 0 -> one)
  en: ONE_I1_V0,
  de: ONE_I1_V0,
  nl: ONE_I1_V0,
  sv: ONE_I1_V0,
  da: ONE_I1_V0,
  no: ONE_I1_V0,
  nb: ONE_I1_V0,
  nn: ONE_I1_V0,
  fi: ONE_I1_V0,
  et: ONE_I1_V0,
  el: ONE_I1_V0,
  it: ONE_I1_V0,
  ca: ONE_I1_V0,
  eu: ONE_I1_V0,
  // Turkic / Spanish / Hungarian / Bulgarian (n = 1 -> one)
  tr: ONE_N1,
  az: ONE_N1,
  es: ONE_N1,
  hu: ONE_N1,
  bg: ONE_N1,
  // French / Portuguese / Hindi / Persian (i = 0 or 1 -> one)
  fr: ONE_I0_OR_I1,
  pt: ONE_I0_OR_I1,
  hi: ONE_I0_OR_I1,
  fa: ONE_I0_OR_I1,
  // East/Southeast Asian (always other)
  ja: ALWAYS_OTHER,
  ko: ALWAYS_OTHER,
  zh: ALWAYS_OTHER,
  vi: ALWAYS_OTHER,
  th: ALWAYS_OTHER,
  id: ALWAYS_OTHER,
  ms: ALWAYS_OTHER,
  // Slavic / Baltic / Semitic / Celtic
  ru: EAST_SLAVIC,
  uk: EAST_SLAVIC,
  hr: EAST_SLAVIC,
  sr: EAST_SLAVIC,
  bs: EAST_SLAVIC,
  pl: POLISH,
  cs: CZECH_SLOVAK,
  sk: CZECH_SLOVAK,
  ar: ARABIC,
  cy: WELSH,
  he: HEBREW,
  ro: ROMANIAN,
  lt: LITHUANIAN,
  sl: SLOVENIAN,
};

/** Selects the CLDR cardinal plural category for `value` in `locale`. */
export function selectPluralCategory(
  value: number,
  locale?: string,
): PluralCategory {
  if (!Number.isFinite(value)) {
    return "other";
  }
  const base = getBaseLanguage(locale);
  const rule = PLURAL_RULE_SET[base] ?? ONE_I1_V0;
  return rule(computePluralOperands(value));
}

// ---------------------------------------------------------------------------
// Exact decimal rounding & localized number / currency formatting
// ---------------------------------------------------------------------------

/**
 * Rounds a non-negative finite number half-away-from-zero to `decimals`
 * fractional digits and returns `{ intPart, fracPart }` as digit strings.
 */
function roundHalfAwayFromZero(
  absValue: number,
  decimals: number,
): { readonly intPart: string; readonly fracPart: string } {
  const clamped = Math.max(0, Math.min(20, Math.trunc(decimals)));
  // Use exponential scaling to avoid binary float drift (e.g. 1.005 -> 1.01).
  const scaled = Number(`${absValue}e+${clamped}`);
  const rounded = Number.isFinite(scaled)
    ? Math.floor(scaled + 0.5)
    : Math.round(absValue * Math.pow(10, clamped));

  if (clamped === 0) {
    return {
      intPart: Number.isFinite(rounded) ? rounded.toFixed(0) : absValue.toFixed(0),
      fracPart: "",
    };
  }

  if (Number.isFinite(scaled) && rounded < 1e21) {
    const digits = rounded.toFixed(0).padStart(clamped + 1, "0");
    return {
      intPart: digits.slice(0, digits.length - clamped),
      fracPart: digits.slice(digits.length - clamped),
    };
  }

  const fixed = absValue.toFixed(clamped);
  const dot = fixed.indexOf(".");
  return dot >= 0
    ? { intPart: fixed.slice(0, dot), fracPart: fixed.slice(dot + 1) }
    : { intPart: fixed, fracPart: "" };
}

function insertGrouping(digits: string, separator: string): string {
  if (digits.length <= 3) {
    return digits;
  }
  let out = "";
  const firstGroup = digits.length % 3 || 3;
  out = digits.slice(0, firstGroup);
  for (let i = firstGroup; i < digits.length; i += 3) {
    out += separator + digits.slice(i, i + 3);
  }
  return out;
}

export interface NumberFormatOptions {
  readonly locale?: string;
  readonly decimals?: number;
  readonly grouping?: boolean;
}

/** Formats a number according to `locale`, `decimals`, and `grouping`. */
export function formatLocalizedNumber(
  value: number,
  options: NumberFormatOptions = {},
): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const profile = getLocaleNumberProfile(options.locale);
  const useGrouping = options.grouping !== false;
  const negative = value < 0;
  const abs = Math.abs(value);

  let intPart: string;
  let fracPart: string;
  if (options.decimals !== undefined && Number.isFinite(options.decimals)) {
    const rounded = roundHalfAwayFromZero(abs, options.decimals);
    intPart = rounded.intPart;
    fracPart = rounded.fracPart;
  } else {
    // CLDR default decimal style: up to 3 fraction digits, no trailing zeros.
    const rounded = roundHalfAwayFromZero(abs, 3);
    intPart = rounded.intPart;
    fracPart = rounded.fracPart.replace(/0+$/, "");
  }

  // Normalize "-0" / "-0.00" to positive zero.
  const isZero = /^0+$/.test(intPart) && (fracPart.length === 0 || /^0+$/.test(fracPart));
  const groupedInt = useGrouping ? insertGrouping(intPart, profile.group) : intPart;
  const body =
    fracPart.length > 0 ? `${groupedInt}${profile.decimal}${fracPart}` : groupedInt;
  return negative && !isZero ? `-${body}` : body;
}

/** Formats a monetary value with ISO 4217 currency symbol and locale pattern. */
export function formatLocalizedCurrency(
  value: number,
  currency: string,
  options: NumberFormatOptions = {},
): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const profile = getLocaleNumberProfile(options.locale);
  const decimals =
    options.decimals !== undefined && Number.isFinite(options.decimals)
      ? options.decimals
      : getCurrencyDefaultDecimals(currency);
  const symbol = getCurrencySymbol(currency, options.locale);
  const negative = value < 0;
  const magnitude = formatLocalizedNumber(Math.abs(value), {
    locale: options.locale,
    decimals,
    grouping: options.grouping,
  });
  const isZero = /^0(?:[.,]0+)?$/.test(magnitude.replace(/[^0-9.,]/g, ""));
  const sign = negative && !isZero ? "-" : "";

  if (profile.currencyPosition === "suffix") {
    return `${sign}${magnitude}${profile.currencySpace}${symbol}`;
  }
  return `${sign}${symbol}${profile.currencySpace}${magnitude}`;
}
