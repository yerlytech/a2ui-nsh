import { describe, expect, test } from "nsh/test";
import {
  DEFAULT_LOCALE,
  formatLocalizedCurrency,
  formatLocalizedNumber,
  getCurrencyDefaultDecimals,
  getCurrencySymbol,
  getLocaleDateNames,
  getLocaleNumberProfile,
  resolveLocaleTag,
  selectPluralCategory,
} from "./locale";

describe("resolveLocaleTag", () => {
  test("keeps recognized BCP 47 tags and their casing", () => {
    expect(resolveLocaleTag("tr")).toBe("tr");
    expect(resolveLocaleTag("tr-TR")).toBe("tr-TR");
    expect(resolveLocaleTag("TR-tr")).toBe("TR-tr");
    expect(resolveLocaleTag("de-CH")).toBe("de-CH");
    expect(resolveLocaleTag("fr-CA")).toBe("fr-CA");
    expect(resolveLocaleTag("ru-RU")).toBe("ru-RU");
  });

  test("falls back to DEFAULT_LOCALE for missing, malformed, and unknown tags", () => {
    expect(DEFAULT_LOCALE).toBe("en-US");
    expect(resolveLocaleTag()).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleTag("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleTag("en_US")).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleTag("xx-YY")).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleTag("not a tag")).toBe(DEFAULT_LOCALE);
  });
});

describe("getLocaleNumberProfile", () => {
  test("returns the decimal, group, and currency pattern for en-US", () => {
    const profile = getLocaleNumberProfile("en-US");
    expect(profile.decimal).toBe(".");
    expect(profile.group).toBe(",");
    expect(profile.currencyPosition).toBe("prefix");
    expect(profile.currencySpace).toBe("");
  });

  test("returns Turkish separators and prefix currency placement", () => {
    const profile = getLocaleNumberProfile("tr-TR");
    expect(profile.decimal).toBe(",");
    expect(profile.group).toBe(".");
    expect(profile.currencyPosition).toBe("prefix");
    expect(profile.currencySpace).toBe("");
  });

  test("returns German separators and suffix currency placement", () => {
    const profile = getLocaleNumberProfile("de-DE");
    expect(profile.decimal).toBe(",");
    expect(profile.group).toBe(".");
    expect(profile.currencyPosition).toBe("suffix");
    expect(profile.currencySpace).toBe("\u00A0");
  });

  test("falls back to the base language and to en-US", () => {
    const turkishCyprus = getLocaleNumberProfile("tr-CY");
    expect(turkishCyprus.decimal).toBe(",");
    expect(turkishCyprus.group).toBe(".");

    const unknown = getLocaleNumberProfile("xx-YY");
    expect(unknown.decimal).toBe(".");
    expect(unknown.group).toBe(",");
    expect(unknown.currencyPosition).toBe("prefix");
  });
});

describe("getLocaleDateNames", () => {
  test("returns Turkish wide and short month names", () => {
    const names = getLocaleDateNames("tr-TR");
    expect(names.monthsWide[0]).toBe("Ocak");
    expect(names.monthsWide[1]).toBe("Şubat");
    expect(names.monthsWide[4]).toBe("Mayıs");
    expect(names.monthsWide[8]).toBe("Eylül");
    expect(names.monthsWide[11]).toBe("Aralık");
    expect(names.monthsShort[0]).toBe("Oca");
    expect(names.monthsShort[1]).toBe("Şub");
    expect(names.monthsShort[4]).toBe("May");
    expect(names.monthsShort[8]).toBe("Eyl");
    expect(names.monthsShort[11]).toBe("Ara");
  });

  test("returns Turkish wide and short weekday names", () => {
    const names = getLocaleDateNames("tr-TR");
    expect(names.weekdaysWide[0]).toBe("Pazar");
    expect(names.weekdaysWide[1]).toBe("Pazartesi");
    expect(names.weekdaysWide[2]).toBe("Salı");
    expect(names.weekdaysWide[3]).toBe("Çarşamba");
    expect(names.weekdaysWide[4]).toBe("Perşembe");
    expect(names.weekdaysWide[5]).toBe("Cuma");
    expect(names.weekdaysWide[6]).toBe("Cumartesi");
    expect(names.weekdaysShort[0]).toBe("Paz");
    expect(names.weekdaysShort[1]).toBe("Pzt");
    expect(names.weekdaysShort[2]).toBe("Sal");
    expect(names.weekdaysShort[3]).toBe("Çar");
    expect(names.weekdaysShort[4]).toBe("Per");
    expect(names.weekdaysShort[5]).toBe("Cum");
    expect(names.weekdaysShort[6]).toBe("Cmt");
    expect(names.dayPeriods).toEqual(["ÖÖ", "ÖS"]);
  });

  test("returns English names and falls back to them for unknown tags", () => {
    const english = getLocaleDateNames("en-US");
    expect(english.monthsWide[0]).toBe("January");
    expect(english.monthsWide[11]).toBe("December");
    expect(english.monthsShort[0]).toBe("Jan");
    expect(english.weekdaysWide[0]).toBe("Sunday");
    expect(english.weekdaysWide[6]).toBe("Saturday");
    expect(english.weekdaysShort[0]).toBe("Sun");
    expect(english.dayPeriods).toEqual(["AM", "PM"]);

    const fallback = getLocaleDateNames("xx-YY");
    expect(fallback.monthsWide[0]).toBe("January");
    expect(fallback.weekdaysWide[0]).toBe("Sunday");
  });
});

describe("currency metadata", () => {
  test("returns ISO 4217 minor-unit defaults", () => {
    expect(getCurrencyDefaultDecimals("TRY")).toBe(2);
    expect(getCurrencyDefaultDecimals("USD")).toBe(2);
    expect(getCurrencyDefaultDecimals("JPY")).toBe(0);
    expect(getCurrencyDefaultDecimals("jpy")).toBe(0);
    expect(getCurrencyDefaultDecimals("KRW")).toBe(0);
    expect(getCurrencyDefaultDecimals("BHD")).toBe(3);
    expect(getCurrencyDefaultDecimals("KWD")).toBe(3);
    expect(getCurrencyDefaultDecimals("ZZZ")).toBe(2);
  });

  test("returns ISO currency symbols and the code for unknown currencies", () => {
    expect(getCurrencySymbol("TRY")).toBe("₺");
    expect(getCurrencySymbol("trY")).toBe("₺");
    expect(getCurrencySymbol("EUR")).toBe("€");
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("JPY")).toBe("¥");
    expect(getCurrencySymbol("ZZZ")).toBe("ZZZ");
    expect(getCurrencySymbol("TRY", "tr-TR")).toBe("₺");
  });
});

describe("selectPluralCategory", () => {
  test("selects English one/other", () => {
    expect(selectPluralCategory(1, "en")).toBe("one");
    expect(selectPluralCategory(1, "en-US")).toBe("one");
    expect(selectPluralCategory(0, "en")).toBe("other");
    expect(selectPluralCategory(2, "en")).toBe("other");
    expect(selectPluralCategory(1.5, "en")).toBe("other");
    expect(selectPluralCategory(11, "en")).toBe("other");
  });

  test("selects Turkish one/other", () => {
    expect(selectPluralCategory(1, "tr")).toBe("one");
    expect(selectPluralCategory(1, "tr-TR")).toBe("one");
    expect(selectPluralCategory(0, "tr")).toBe("other");
    expect(selectPluralCategory(2, "tr")).toBe("other");
    expect(selectPluralCategory(0.5, "tr")).toBe("other");
  });

  test("selects few and many in a Slavic language", () => {
    expect(selectPluralCategory(1, "ru")).toBe("one");
    expect(selectPluralCategory(2, "ru")).toBe("few");
    expect(selectPluralCategory(4, "ru")).toBe("few");
    expect(selectPluralCategory(5, "ru")).toBe("many");
    expect(selectPluralCategory(11, "ru")).toBe("many");
    expect(selectPluralCategory(21, "ru")).toBe("one");
    expect(selectPluralCategory(1.5, "ru")).toBe("other");
  });

  test("selects Arabic categories and maps non-finite values to other", () => {
    expect(selectPluralCategory(0, "ar")).toBe("zero");
    expect(selectPluralCategory(1, "ar")).toBe("one");
    expect(selectPluralCategory(2, "ar")).toBe("two");
    expect(selectPluralCategory(3, "ar")).toBe("few");
    expect(selectPluralCategory(15, "ar")).toBe("many");
    expect(selectPluralCategory(Number.NaN, "en")).toBe("other");
    expect(selectPluralCategory(Number.POSITIVE_INFINITY, "en")).toBe("other");
  });
});

describe("formatLocalizedNumber", () => {
  test("groups thousands with locale separators", () => {
    expect(
      formatLocalizedNumber(1234567.891, { locale: "en-US", decimals: 2 }),
    ).toBe("1,234,567.89");
    expect(
      formatLocalizedNumber(1234567.891, { locale: "tr-TR", decimals: 2 }),
    ).toBe("1.234.567,89");
    expect(
      formatLocalizedNumber(1234567.891, { locale: "de-DE", decimals: 2 }),
    ).toBe("1.234.567,89");
    expect(
      formatLocalizedNumber(1234567.891, { locale: "fr-FR", decimals: 2 }),
    ).toBe("1\u202F234\u202F567,89");
    expect(formatLocalizedNumber(1234567, { locale: "en-US" })).toBe("1,234,567");
  });

  test("rounds half away from zero and trims default fraction zeros", () => {
    expect(formatLocalizedNumber(1.005, { locale: "en-US", decimals: 2 })).toBe("1.01");
    expect(formatLocalizedNumber(2.675, { locale: "en-US", decimals: 2 })).toBe("2.68");
    expect(formatLocalizedNumber(-1.005, { locale: "en-US", decimals: 2 })).toBe("-1.01");
    expect(formatLocalizedNumber(1234.5678, { locale: "en-US" })).toBe("1,234.568");
    expect(formatLocalizedNumber(1234.5, { locale: "en-US" })).toBe("1,234.5");
    expect(formatLocalizedNumber(1.0004, { locale: "en-US" })).toBe("1");
    expect(formatLocalizedNumber(0, { locale: "en-US", decimals: 2 })).toBe("0.00");
  });

  test("formats negative numbers and negative zero", () => {
    expect(formatLocalizedNumber(-1234.5, { locale: "en-US", decimals: 2 })).toBe(
      "-1,234.50",
    );
    expect(formatLocalizedNumber(-1234.5, { locale: "tr-TR", decimals: 2 })).toBe(
      "-1.234,50",
    );
    expect(formatLocalizedNumber(-0.001, { locale: "en-US", decimals: 2 })).toBe("0.00");
    expect(formatLocalizedNumber(-0, { locale: "tr-TR", decimals: 2 })).toBe("0,00");
  });

  test("honours grouping:false, fallback locales, and non-finite values", () => {
    expect(
      formatLocalizedNumber(1234.5, {
        locale: "tr-TR",
        decimals: 2,
        grouping: false,
      }),
    ).toBe("1234,50");
    expect(
      formatLocalizedNumber(1234.5, { locale: "xx-YY", decimals: 1 }),
    ).toBe("1,234.5");
    expect(formatLocalizedNumber(Number.NaN)).toBe("");
    expect(formatLocalizedNumber(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("formatLocalizedCurrency", () => {
  test("formats TRY in Turkish and English placements", () => {
    expect(formatLocalizedCurrency(1234.5, "TRY", { locale: "tr-TR" })).toBe(
      "₺1.234,50",
    );
    expect(formatLocalizedCurrency(1234.5, "TRY", { locale: "en-US" })).toBe(
      "₺1,234.50",
    );
    expect(formatLocalizedCurrency(1234.5, "TRY", { locale: "tr-TR", decimals: 0 })).toBe(
      "₺1.235",
    );
  });

  test("formats zero and negative amounts", () => {
    expect(formatLocalizedCurrency(0, "TRY", { locale: "tr-TR" })).toBe("₺0,00");
    expect(formatLocalizedCurrency(-99.9, "TRY", { locale: "tr-TR" })).toBe(
      "-₺99,90",
    );
    expect(formatLocalizedCurrency(-0, "TRY", { locale: "tr-TR" })).toBe("₺0,00");
    expect(formatLocalizedCurrency(-1234.5, "EUR", { locale: "de-DE" })).toBe(
      "-1.234,50\u00A0€",
    );
  });

  test("rounds amounts to the currency minor unit", () => {
    expect(formatLocalizedCurrency(1234.567, "TRY", { locale: "tr-TR" })).toBe(
      "₺1.234,57",
    );
    expect(formatLocalizedCurrency(1.005, "USD", { locale: "en-US" })).toBe("$1.01");
    expect(formatLocalizedCurrency(1234.5, "JPY", { locale: "en-US" })).toBe("¥1,235");
  });

  test("formats zero-decimal, suffix, French, and unknown currencies", () => {
    expect(formatLocalizedCurrency(5000, "JPY", { locale: "en-US" })).toBe("¥5,000");
    expect(formatLocalizedCurrency(5000, "JPY", { locale: "tr-TR" })).toBe("¥5.000");
    expect(formatLocalizedCurrency(1234.5, "EUR", { locale: "de-DE" })).toBe(
      "1.234,50\u00A0€",
    );
    expect(formatLocalizedCurrency(1234.5, "EUR", { locale: "fr-FR" })).toBe(
      "1\u202F234,50\u00A0€",
    );
    expect(formatLocalizedCurrency(1234.5, "ZZZ", { locale: "en-US" })).toBe(
      "ZZZ1,234.50",
    );
    expect(formatLocalizedCurrency(Number.NaN, "USD")).toBe("");
  });
});
