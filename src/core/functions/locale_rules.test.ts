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

// One rule per test for src/core/functions/locale.ts. The broad scenarios live
// in locale.test.ts; this file pins each rule on its own.

interface ProfileShape {
  readonly decimal: string;
  readonly group: string;
  readonly currencyPosition: string;
  readonly currencySpace: string;
}

const EN_PROFILE: ProfileShape = {
  decimal: ".",
  group: ",",
  currencyPosition: "prefix",
  currencySpace: "",
};

const TR_PROFILE: ProfileShape = {
  decimal: ",",
  group: ".",
  currencyPosition: "prefix",
  currencySpace: "",
};

const DE_PROFILE: ProfileShape = {
  decimal: ",",
  group: ".",
  currencyPosition: "suffix",
  currencySpace: "\u00A0",
};

const DE_CH_PROFILE: ProfileShape = {
  decimal: ".",
  group: "\u2019",
  currencyPosition: "prefix",
  currencySpace: "\u00A0",
};

const FR_PROFILE: ProfileShape = {
  decimal: ",",
  group: "\u202F",
  currencyPosition: "suffix",
  currencySpace: "\u00A0",
};

const ES_PROFILE: ProfileShape = {
  decimal: ",",
  group: ".",
  currencyPosition: "suffix",
  currencySpace: "\u00A0",
};

const PROFILE_EXPECTATIONS: ReadonlyArray<readonly [string, ProfileShape]> = [
  ["en", EN_PROFILE],
  ["en-us", EN_PROFILE],
  ["en-gb", EN_PROFILE],
  ["en-ca", EN_PROFILE],
  ["en-au", EN_PROFILE],
  ["tr", TR_PROFILE],
  ["tr-tr", TR_PROFILE],
  ["de", DE_PROFILE],
  ["de-de", DE_PROFILE],
  ["de-at", DE_PROFILE],
  ["de-ch", DE_CH_PROFILE],
  ["fr", FR_PROFILE],
  ["fr-fr", FR_PROFILE],
  ["es", ES_PROFILE],
  ["es-es", ES_PROFILE],
];

describe("resolveLocaleTag", () => {
  test("keeps well-formed recognized tags and the caller casing", () => {
    expect(resolveLocaleTag("zh-Hant-TW")).toBe("zh-Hant-TW");
    expect(resolveLocaleTag("es-419")).toBe("es-419");
    expect(resolveLocaleTag("EN-us")).toBe("EN-us");
  });

  test("keeps a tag whose base language is known only to the plural table", () => {
    expect(resolveLocaleTag("nl")).toBe("nl");
    expect(resolveLocaleTag("pl-PL")).toBe("pl-PL");
  });

  test("falls back to en-US for malformed, empty, and missing tags", () => {
    expect(resolveLocaleTag("en_US")).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleTag("e")).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleTag("english")).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleTag("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocaleTag()).toBe(DEFAULT_LOCALE);
  });

  test("falls back to en-US for a well-formed but unknown language", () => {
    expect(resolveLocaleTag("xx-XX")).toBe(DEFAULT_LOCALE);
  });

  test("rejects the four-digit variant in de-DE-1996", () => {
    // differs from CLDR: BCP 47 allows four-digit variant subtags such as
    // "1996", so "de-DE-1996" is well-formed and should be kept.
    expect(resolveLocaleTag("de-DE-1996")).toBe(DEFAULT_LOCALE);
  });
});

describe("getLocaleNumberProfile", () => {
  test("pins every built-in profile by decimal, group, position, and space", () => {
    for (const [tag, expected] of PROFILE_EXPECTATIONS) {
      expect(getLocaleNumberProfile(tag)).toEqual(expected);
    }
  });

  test("an exact region key wins over the base language profile", () => {
    expect(getLocaleNumberProfile("de-CH")).toEqual(DE_CH_PROFILE);
    expect(getLocaleNumberProfile("de-DE")).toEqual(DE_PROFILE);
    expect(getLocaleNumberProfile("de-CH").decimal).not.toBe(
      getLocaleNumberProfile("de-DE").decimal,
    );
  });

  test("a plural-only language falls back to the English profile", () => {
    expect(getLocaleNumberProfile("nl")).toEqual(EN_PROFILE);
  });
});

describe("getLocaleDateNames", () => {
  test("de-AT returns German names", () => {
    const names = getLocaleDateNames("de-AT");
    expect(names.monthsWide[2]).toBe("März");
    expect(names.monthsShort[2]).toBe("März");
    expect(names.weekdaysWide[0]).toBe("Sonntag");
    expect(names.dayPeriods).toEqual(["AM", "PM"]);
  });

  test("fr-CA returns French names", () => {
    const names = getLocaleDateNames("fr-CA");
    expect(names.monthsWide[0]).toBe("janvier");
    expect(names.monthsWide[7]).toBe("août");
    expect(names.weekdaysWide[6]).toBe("samedi");
  });

  test("es-MX returns Spanish names", () => {
    const names = getLocaleDateNames("es-MX");
    expect(names.monthsWide[0]).toBe("enero");
    expect(names.monthsWide[8]).toBe("septiembre");
    expect(names.weekdaysWide[3]).toBe("miércoles");
    expect(names.dayPeriods).toEqual(["a. m.", "p. m."]);
  });

  test("nl and ja fall back to English names", () => {
    for (const tag of ["nl", "ja"]) {
      const names = getLocaleDateNames(tag);
      expect(names.monthsWide[0]).toBe("January");
      expect(names.weekdaysWide[0]).toBe("Sunday");
      expect(names.dayPeriods).toEqual(["AM", "PM"]);
    }
  });
});

describe("currency tables", () => {
  test("minor-unit defaults are case-insensitive and unknown codes get 2", () => {
    expect(getCurrencyDefaultDecimals("jpy")).toBe(0);
    expect(getCurrencyDefaultDecimals("kwd")).toBe(3);
    expect(getCurrencyDefaultDecimals("usd")).toBe(2);
    expect(getCurrencyDefaultDecimals("zzz")).toBe(2);
  });

  test("an unknown symbol is the upper-cased code and locale is ignored", () => {
    expect(getCurrencySymbol("abc")).toBe("ABC");
    expect(getCurrencySymbol("abc", "de-DE")).toBe("ABC");
    expect(getCurrencySymbol("abc", "tr-TR")).toBe("ABC");
  });
});

describe("selectPluralCategory", () => {
  test("ONE_I1_V0: German one only for i=1 with no visible fraction", () => {
    expect(selectPluralCategory(1, "de")).toBe("one");
    expect(selectPluralCategory(1.5, "de")).toBe("other");
    expect(selectPluralCategory(0, "de")).toBe("other");
  });

  test("ONE_N1: Spanish one only for n=1", () => {
    expect(selectPluralCategory(1, "es")).toBe("one");
    expect(selectPluralCategory(0, "es")).toBe("other");
    expect(selectPluralCategory(1.5, "es")).toBe("other");
  });

  test("ONE_I0_OR_I1: French and Portuguese one for integer part 0 or 1", () => {
    for (const tag of ["fr", "pt"]) {
      expect(selectPluralCategory(0, tag)).toBe("one");
      expect(selectPluralCategory(1, tag)).toBe("one");
      expect(selectPluralCategory(1.5, tag)).toBe("one");
      expect(selectPluralCategory(2, tag)).toBe("other");
    }
  });

  test("ALWAYS_OTHER: Japanese always other", () => {
    expect(selectPluralCategory(0, "ja")).toBe("other");
    expect(selectPluralCategory(1, "ja")).toBe("other");
  });

  test("EAST_SLAVIC: Ukrainian one/few/many boundaries", () => {
    expect(selectPluralCategory(1, "uk")).toBe("one");
    expect(selectPluralCategory(21, "uk")).toBe("one");
    expect(selectPluralCategory(2, "uk")).toBe("few");
    expect(selectPluralCategory(22, "uk")).toBe("few");
    expect(selectPluralCategory(11, "uk")).toBe("many");
    expect(selectPluralCategory(12, "uk")).toBe("many");
    expect(selectPluralCategory(14, "uk")).toBe("many");
    expect(selectPluralCategory(5, "uk")).toBe("many");
    expect(selectPluralCategory(1.5, "uk")).toBe("other");
  });

  test("POLISH: Polish one/few/many boundaries", () => {
    expect(selectPluralCategory(1, "pl")).toBe("one");
    expect(selectPluralCategory(21, "pl")).toBe("many");
    expect(selectPluralCategory(22, "pl")).toBe("few");
    expect(selectPluralCategory(12, "pl")).toBe("many");
  });

  test("CZECH_SLOVAK: Czech and Slovak one/few/many boundaries", () => {
    for (const tag of ["cs", "sk"]) {
      expect(selectPluralCategory(1, tag)).toBe("one");
      expect(selectPluralCategory(2, tag)).toBe("few");
      expect(selectPluralCategory(3, tag)).toBe("few");
      expect(selectPluralCategory(4, tag)).toBe("few");
      expect(selectPluralCategory(5, tag)).toBe("other");
      expect(selectPluralCategory(1.5, tag)).toBe("many");
    }
  });

  test("WELSH: Welsh zero/one/two/few/many/other boundaries", () => {
    expect(selectPluralCategory(0, "cy")).toBe("zero");
    expect(selectPluralCategory(1, "cy")).toBe("one");
    expect(selectPluralCategory(2, "cy")).toBe("two");
    expect(selectPluralCategory(3, "cy")).toBe("few");
    expect(selectPluralCategory(6, "cy")).toBe("many");
    expect(selectPluralCategory(4, "cy")).toBe("other");
  });

  test("HEBREW: Hebrew one/two boundaries", () => {
    expect(selectPluralCategory(1, "he")).toBe("one");
    expect(selectPluralCategory(2, "he")).toBe("two");
    expect(selectPluralCategory(3, "he")).toBe("other");
    // differs from CLDR: Hebrew has a "many" category for v=0 when n != 0
    // and n % 10 = 0, so 10 should be "many".
    expect(selectPluralCategory(10, "he")).toBe("other");
  });

  test("ROMANIAN: Romanian one/few/other boundaries", () => {
    expect(selectPluralCategory(1, "ro")).toBe("one");
    expect(selectPluralCategory(0, "ro")).toBe("few");
    expect(selectPluralCategory(2, "ro")).toBe("few");
    expect(selectPluralCategory(19, "ro")).toBe("few");
    expect(selectPluralCategory(20, "ro")).toBe("other");
    expect(selectPluralCategory(101, "ro")).toBe("few");
    expect(selectPluralCategory(1.5, "ro")).toBe("few");
  });

  test("LITHUANIAN: Lithuanian one/few/many/other boundaries", () => {
    expect(selectPluralCategory(1, "lt")).toBe("one");
    expect(selectPluralCategory(21, "lt")).toBe("one");
    expect(selectPluralCategory(11, "lt")).toBe("other");
    expect(selectPluralCategory(2, "lt")).toBe("few");
    expect(selectPluralCategory(12, "lt")).toBe("other");
    expect(selectPluralCategory(10, "lt")).toBe("other");
    expect(selectPluralCategory(1.5, "lt")).toBe("many");
    // differs from CLDR: f != 0 means "many", but a fraction whose n % 10
    // lands in 2..9 is classified as "few" here.
    expect(selectPluralCategory(2.5, "lt")).toBe("few");
  });

  test("SLOVENIAN: Slovenian one/two/few/other boundaries", () => {
    expect(selectPluralCategory(1, "sl")).toBe("one");
    expect(selectPluralCategory(101, "sl")).toBe("one");
    expect(selectPluralCategory(2, "sl")).toBe("two");
    expect(selectPluralCategory(3, "sl")).toBe("few");
    expect(selectPluralCategory(4, "sl")).toBe("few");
    expect(selectPluralCategory(5, "sl")).toBe("other");
    expect(selectPluralCategory(1.5, "sl")).toBe("other");
  });

  test("ARABIC: Arabic zero/one/two/few/many/other boundaries", () => {
    expect(selectPluralCategory(0, "ar")).toBe("zero");
    expect(selectPluralCategory(1, "ar")).toBe("one");
    expect(selectPluralCategory(2, "ar")).toBe("two");
    expect(selectPluralCategory(3, "ar")).toBe("few");
    expect(selectPluralCategory(11, "ar")).toBe("many");
    expect(selectPluralCategory(100, "ar")).toBe("other");
  });

  test("a negative value is judged by its magnitude", () => {
    expect(selectPluralCategory(-1, "en")).toBe("one");
    expect(selectPluralCategory(-1.5, "en")).toBe("other");
    expect(selectPluralCategory(-21, "uk")).toBe("one");
  });
});

describe("plural operands", () => {
  test("1.0 has no visible fraction and is one in English", () => {
    expect(selectPluralCategory(1.0, "en")).toBe("one");
  });

  test("exponent-form numbers are judged as integers, not fraction strings", () => {
    expect(selectPluralCategory(1e-7, "fr")).toBe("one");
    expect(selectPluralCategory(1e21, "en")).toBe("other");
    expect(selectPluralCategory(1e21, "ru")).toBe("many");
  });

  test("NaN and both infinities are other", () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(selectPluralCategory(value, "en")).toBe("other");
    }
  });
});

describe("formatLocalizedNumber rounding", () => {
  test("rounds half away from zero", () => {
    expect(formatLocalizedNumber(0.5, { locale: "en-US", decimals: 0 })).toBe("1");
    expect(formatLocalizedNumber(-0.5, { locale: "en-US", decimals: 0 })).toBe("-1");
    expect(formatLocalizedNumber(2.5, { locale: "en-US", decimals: 0 })).toBe("3");
    expect(formatLocalizedNumber(1.005, { locale: "en-US", decimals: 2 })).toBe(
      "1.01",
    );
  });

  test("truncates decimals and clamps them to 0..20", () => {
    expect(formatLocalizedNumber(1.005, { locale: "en-US", decimals: 2.9 })).toBe(
      "1.01",
    );
    expect(formatLocalizedNumber(2.5, { locale: "en-US", decimals: -3 })).toBe("3");
    expect(formatLocalizedNumber(1, { locale: "en-US", decimals: 25 })).toBe(
      "1.00000000000000000000",
    );
  });

  test("the default keeps up to three fraction digits and trims zeros", () => {
    expect(formatLocalizedNumber(1.23456, { locale: "en-US" })).toBe("1.235");
    expect(formatLocalizedNumber(1.5, { locale: "en-US" })).toBe("1.5");
  });

  test("a negative that rounds to zero has no sign", () => {
    expect(formatLocalizedNumber(-0.0004, { locale: "en-US" })).toBe("0");
    expect(formatLocalizedNumber(-0.001, { locale: "en-US", decimals: 2 })).toBe(
      "0.00",
    );
  });

  test("1e21 currently falls into exponent notation", () => {
    // differs from CLDR: expected "1,000,000,000,000,000,000,000.00"; the
    // fallback uses Number#toFixed, which switches to exponent notation.
    expect(formatLocalizedNumber(1e21, { locale: "en-US", decimals: 2 })).toBe(
      "1e,+21",
    );
  });
});

describe("formatLocalizedNumber grouping", () => {
  test("three digits stay ungrouped and four get one separator", () => {
    expect(formatLocalizedNumber(123, { locale: "en-US" })).toBe("123");
    expect(formatLocalizedNumber(1234, { locale: "en-US" })).toBe("1,234");
  });

  test("seven digits get two locale separators", () => {
    expect(formatLocalizedNumber(1234567, { locale: "en-US" })).toBe("1,234,567");
    expect(formatLocalizedNumber(1234567, { locale: "tr-TR" })).toBe("1.234.567");
  });

  test("grouping:false keeps raw digits and the fraction is never grouped", () => {
    expect(
      formatLocalizedNumber(1234567, { locale: "en-US", grouping: false }),
    ).toBe("1234567");
    expect(formatLocalizedNumber(1234.5678, { locale: "en-US", decimals: 4 })).toBe(
      "1,234.5678",
    );
  });
});

describe("formatLocalizedCurrency", () => {
  test("uses the currency minor unit by default", () => {
    expect(formatLocalizedCurrency(1234.5, "JPY", { locale: "en-US" })).toBe(
      "¥1,235",
    );
    expect(formatLocalizedCurrency(1234.5, "KWD", { locale: "en-US" })).toBe(
      "KWD1,234.500",
    );
  });

  test("an explicit decimals overrides the currency minor unit", () => {
    expect(formatLocalizedCurrency(1234.5, "JPY", { locale: "en-US", decimals: 2 })).toBe(
      "¥1,234.50",
    );
    expect(formatLocalizedCurrency(1234.5, "KWD", { locale: "en-US", decimals: 1 })).toBe(
      "KWD1,234.5",
    );
  });

  test("prefix/suffix placement and spacing come from each profile", () => {
    expect(formatLocalizedCurrency(1234.5, "USD", { locale: "en-US" })).toBe(
      "$1,234.50",
    );
    expect(formatLocalizedCurrency(1234.5, "USD", { locale: "tr-TR" })).toBe(
      "$1.234,50",
    );
    expect(formatLocalizedCurrency(1234.5, "USD", { locale: "de-DE" })).toBe(
      "1.234,50\u00A0$",
    );
    expect(formatLocalizedCurrency(1234.5, "USD", { locale: "fr-FR" })).toBe(
      "1\u202F234,50\u00A0$",
    );
  });

  test("a negative amount that rounds to zero has no sign", () => {
    expect(formatLocalizedCurrency(-0.001, "JPY", { locale: "en-US" })).toBe("¥0");
  });

  test("NaN gives an empty string", () => {
    expect(formatLocalizedCurrency(Number.NaN, "USD")).toBe("");
  });
});
