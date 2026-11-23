/**
 * Clean-room A2UI v1.0 portable regex dialect parser and static ReDoS safety
 * analyzer (`a2ui_protocol.md` §The `regex` function).
 *
 * Enforces:
 * - Max pattern length: 256 Unicode code points (`PATTERN_TOO_LONG`)
 * - Max matched value length: 4,096 Unicode code points
 * - Portable ECMAScript Unicode (`u`) subset rejecting backreferences,
 *   lookbehinds, named groups, `\p{...}`/`\P{...}`, `\cX`, legacy octals, and
 *   inline flags (`UNSUPPORTED_SYNTAX`)
 * - Static ReDoS guards:
 *   1. Nested quantifier with outer upper bound > 1 over unbounded inner (`NESTED_QUANTIFIER`)
 *   2. Unbounded repetition over alternation with overlapping branch first sets (`OVERLAPPING_ALTERNATION`)
 *   3. Adjacent unbounded atoms with overlapping character sets across empty/nullable items (`ADJACENT_OVERLAP`)
 */

import { A2uiFunctionError } from "./types";

/** Maximum allowed regex pattern length in Unicode code points. */
export const MAX_REGEX_PATTERN_CODE_POINTS = 256;

/** Maximum matched input length in Unicode code points before returning invalid. */
export const MAX_REGEX_VALUE_CODE_POINTS = 4096;

const MAX_UNICODE_CP = 0x10ffff;
const MAX_REGEX_CACHE_ENTRIES = 256;

export type RegexRejectReason =
  | "PATTERN_TOO_LONG"
  | "UNSUPPORTED_SYNTAX"
  | "NESTED_QUANTIFIER"
  | "OVERLAPPING_ALTERNATION"
  | "ADJACENT_OVERLAP";

export type RegexAnalysisResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: RegexRejectReason; readonly message: string };

/** Counts Unicode code points (scalar values) in `str`, not UTF-16 code units. */
export function countCodePoints(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; ) {
    const cp = str.codePointAt(i)!;
    count += 1;
    i += cp > 0xffff ? 2 : 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Sorted disjoint Unicode code-point interval sets
// ---------------------------------------------------------------------------

type CpRange = readonly [number, number];

function normalizeRanges(ranges: readonly CpRange[]): CpRange[] {
  if (ranges.length <= 1) {
    return ranges.slice();
  }
  const sorted = ranges
    .slice()
    .sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
  const out: CpRange[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    const prev = out[out.length - 1]!;
    if (cur[0] <= prev[1] + 1) {
      if (cur[1] > prev[1]) {
        out[out.length - 1] = [prev[0], cur[1]];
      }
    } else {
      out.push(cur);
    }
  }
  return out;
}

function unionRanges(a: readonly CpRange[], b: readonly CpRange[]): CpRange[] {
  if (a.length === 0) return b.slice();
  if (b.length === 0) return a.slice();
  return normalizeRanges([...a, ...b]);
}

function negateRanges(ranges: readonly CpRange[]): CpRange[] {
  const norm = normalizeRanges(ranges);
  if (norm.length === 0) {
    return [[0, MAX_UNICODE_CP]];
  }
  const out: CpRange[] = [];
  let cursor = 0;
  for (let i = 0; i < norm.length; i += 1) {
    const [start, end] = norm[i]!;
    if (cursor < start) {
      out.push([cursor, start - 1]);
    }
    cursor = end + 1;
  }
  if (cursor <= MAX_UNICODE_CP) {
    out.push([cursor, MAX_UNICODE_CP]);
  }
  return out;
}

function rangesIntersect(a: readonly CpRange[], b: readonly CpRange[]): boolean {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ra = a[i]!;
    const rb = b[j]!;
    if (ra[1] < rb[0]) {
      i += 1;
    } else if (rb[1] < ra[0]) {
      j += 1;
    } else {
      return true;
    }
  }
  return false;
}

// Standard ECMAScript ASCII-only \d, \w, full Unicode \s, and dot (excluding line terminators).
const DIGIT_RANGES: readonly CpRange[] = [[0x30, 0x39]];
const NON_DIGIT_RANGES: readonly CpRange[] = negateRanges(DIGIT_RANGES);

const WORD_RANGES: readonly CpRange[] = normalizeRanges([
  [0x30, 0x39], // 0-9
  [0x41, 0x5a], // A-Z
  [0x5f, 0x5f], // _
  [0x61, 0x7a], // a-z
]);
const NON_WORD_RANGES: readonly CpRange[] = negateRanges(WORD_RANGES);

const SPACE_RANGES: readonly CpRange[] = normalizeRanges([
  [0x0009, 0x000d], // \t \n \v \f \r
  [0x0020, 0x0020], // space
  [0x00a0, 0x00a0], // NBSP
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029], // LS, PS
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
]);
const NON_SPACE_RANGES: readonly CpRange[] = negateRanges(SPACE_RANGES);

const DOT_RANGES: readonly CpRange[] = negateRanges([
  [0x000a, 0x000a], // \n
  [0x000d, 0x000d], // \r
  [0x2028, 0x2028], // LS
  [0x2029, 0x2029], // PS
]);

// ---------------------------------------------------------------------------
// Regex AST
// ---------------------------------------------------------------------------

type RegexNode =
  | { readonly kind: "alt"; readonly branches: readonly SeqNode[] }
  | SeqNode
  | { readonly kind: "charset"; readonly ranges: readonly CpRange[] }
  | { readonly kind: "anchor" }
  | {
      readonly kind: "group";
      readonly groupKind: "capture" | "nonCapture" | "lookahead" | "negLookahead";
      readonly body: AltNode;
    }
  | {
      readonly kind: "quant";
      readonly atom: RegexNode;
      readonly min: number;
      readonly max: number | null;
    };

interface SeqNode {
  readonly kind: "seq";
  readonly items: readonly RegexNode[];
}

interface AltNode {
  readonly kind: "alt";
  readonly branches: readonly SeqNode[];
}

class DialectSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DialectSyntaxError";
  }
}

const SYNTAX_CHARS = new Set([
  "^",
  "$",
  "\\",
  ".",
  "*",
  "+",
  "?",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "|",
  "/",
]);

function isHexDigit(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  const c = ch.charCodeAt(0);
  return (
    (c >= 0x30 && c <= 0x39) ||
    (c >= 0x41 && c <= 0x46) ||
    (c >= 0x61 && c <= 0x66)
  );
}

function isAsciiDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

class A2uiRegexParser {
  private readonly src: string;
  private pos = 0;

  constructor(src: string) {
    this.src = src;
  }

  parse(): AltNode {
    const ast = this.parseAlternation();
    if (this.pos < this.src.length) {
      throw new DialectSyntaxError(
        `Unexpected token '${this.src[this.pos]}' at position ${this.pos}`,
      );
    }
    return ast;
  }

  private parseAlternation(): AltNode {
    const branches: SeqNode[] = [this.parseSequence()];
    while (this.pos < this.src.length && this.src[this.pos] === "|") {
      this.pos += 1;
      branches.push(this.parseSequence());
    }
    return { kind: "alt", branches };
  }

  private parseSequence(): SeqNode {
    const items: RegexNode[] = [];
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos]!;
      if (ch === "|" || ch === ")") {
        break;
      }
      const atom = this.parseAtom();
      const quant = this.tryParseQuantifier();
      if (quant !== null) {
        if (
          atom.kind === "anchor" ||
          (atom.kind === "group" &&
            (atom.groupKind === "lookahead" || atom.groupKind === "negLookahead"))
        ) {
          throw new DialectSyntaxError(
            `Quantifier cannot apply to zero-width assertion at position ${this.pos}`,
          );
        }
        items.push({
          kind: "quant",
          atom,
          min: quant.min,
          max: quant.max,
        });
      } else {
        items.push(atom);
      }
    }
    return { kind: "seq", items };
  }

  private parseAtom(): RegexNode {
    const ch = this.src[this.pos]!;
    if (ch === "^" || ch === "$") {
      this.pos += 1;
      return { kind: "anchor" };
    }
    if (ch === ".") {
      this.pos += 1;
      return { kind: "charset", ranges: DOT_RANGES };
    }
    if (ch === "(") {
      return this.parseGroup();
    }
    if (ch === "[") {
      return this.parseCharClass();
    }
    if (ch === "\\") {
      return this.parseAtomEscape();
    }
    if (ch === "*" || ch === "+" || ch === "?" || ch === "{" || ch === "}" || ch === "]") {
      throw new DialectSyntaxError(
        `Unescaped syntax character '${ch}' at position ${this.pos}`,
      );
    }
    const cp = this.readCodePoint();
    return { kind: "charset", ranges: [[cp, cp]] };
  }

  private readCodePoint(): number {
    const cp = this.src.codePointAt(this.pos)!;
    this.pos += cp > 0xffff ? 2 : 1;
    return cp;
  }

  private parseGroup(): RegexNode {
    this.pos += 1; // skip '('
    let groupKind: "capture" | "nonCapture" | "lookahead" | "negLookahead" =
      "capture";
    if (this.src[this.pos] === "?") {
      const next = this.src[this.pos + 1];
      if (next === ":") {
        groupKind = "nonCapture";
        this.pos += 2;
      } else if (next === "=") {
        groupKind = "lookahead";
        this.pos += 2;
      } else if (next === "!") {
        groupKind = "negLookahead";
        this.pos += 2;
      } else {
        // Rejects (?<=, (?<!, (?<name>, (?i), (?i:...), etc.
        throw new DialectSyntaxError(
          `Unsupported group modifier '(?${next ?? ""}' at position ${this.pos - 1}`,
        );
      }
    }
    const body = this.parseAlternation();
    if (this.src[this.pos] !== ")") {
      throw new DialectSyntaxError("Unclosed group '('");
    }
    this.pos += 1; // skip ')'
    return { kind: "group", groupKind, body };
  }

  private parseAtomEscape(): RegexNode {
    this.pos += 1; // skip '\'
    if (this.pos >= this.src.length) {
      throw new DialectSyntaxError("Trailing backslash at end of pattern");
    }
    const ch = this.src[this.pos]!;
    switch (ch) {
      case "d":
        this.pos += 1;
        return { kind: "charset", ranges: DIGIT_RANGES };
      case "D":
        this.pos += 1;
        return { kind: "charset", ranges: NON_DIGIT_RANGES };
      case "w":
        this.pos += 1;
        return { kind: "charset", ranges: WORD_RANGES };
      case "W":
        this.pos += 1;
        return { kind: "charset", ranges: NON_WORD_RANGES };
      case "s":
        this.pos += 1;
        return { kind: "charset", ranges: SPACE_RANGES };
      case "S":
        this.pos += 1;
        return { kind: "charset", ranges: NON_SPACE_RANGES };
      case "b":
      case "B":
        this.pos += 1;
        return { kind: "anchor" };
      case "t":
        this.pos += 1;
        return { kind: "charset", ranges: [[0x09, 0x09]] };
      case "n":
        this.pos += 1;
        return { kind: "charset", ranges: [[0x0a, 0x0a]] };
      case "v":
        this.pos += 1;
        return { kind: "charset", ranges: [[0x0b, 0x0b]] };
      case "f":
        this.pos += 1;
        return { kind: "charset", ranges: [[0x0c, 0x0c]] };
      case "r":
        this.pos += 1;
        return { kind: "charset", ranges: [[0x0d, 0x0d]] };
      case "0":
        this.pos += 1;
        if (isAsciiDigit(this.src[this.pos])) {
          throw new DialectSyntaxError("Legacy octal escape is not allowed");
        }
        return { kind: "charset", ranges: [[0x00, 0x00]] };
      case "x": {
        const cp = this.parseHexEscape(2);
        return { kind: "charset", ranges: [[cp, cp]] };
      }
      case "u": {
        const cp = this.parseUnicodeEscape();
        return { kind: "charset", ranges: [[cp, cp]] };
      }
      case "p":
      case "P":
        throw new DialectSyntaxError(`Unicode property escape \\${ch}{...} is not allowed`);
      case "k":
        throw new DialectSyntaxError("Named backreference \\k<...> is not allowed");
      case "c":
        throw new DialectSyntaxError("Control letter escape \\cX is not allowed");
      default:
        if (ch >= "1" && ch <= "9") {
          throw new DialectSyntaxError(`Backreference \\${ch} is not allowed`);
        }
        if (SYNTAX_CHARS.has(ch)) {
          this.pos += 1;
          const cp = ch.codePointAt(0)!;
          return { kind: "charset", ranges: [[cp, cp]] };
        }
        throw new DialectSyntaxError(`Unsupported escape sequence \\${ch}`);
    }
  }

  private parseHexEscape(digits: number): number {
    this.pos += 1; // skip 'x' or 'u'
    const slice = this.src.slice(this.pos, this.pos + digits);
    if (slice.length !== digits) {
      throw new DialectSyntaxError("Incomplete hex escape");
    }
    for (let i = 0; i < digits; i += 1) {
      if (!isHexDigit(slice[i])) {
        throw new DialectSyntaxError(`Invalid hex escape '${slice}'`);
      }
    }
    this.pos += digits;
    return parseInt(slice, 16);
  }

  private parseUnicodeEscape(): number {
    if (this.src[this.pos + 1] === "{") {
      this.pos += 2; // skip 'u{'
      const start = this.pos;
      while (this.pos < this.src.length && this.src[this.pos] !== "}") {
        if (!isHexDigit(this.src[this.pos])) {
          throw new DialectSyntaxError("Invalid braced Unicode escape");
        }
        this.pos += 1;
      }
      if (this.pos === start || this.src[this.pos] !== "}") {
        throw new DialectSyntaxError("Unterminated braced Unicode escape");
      }
      const hex = this.src.slice(start, this.pos);
      this.pos += 1; // skip '}'
      const cp = parseInt(hex, 16);
      if (!Number.isFinite(cp) || cp > MAX_UNICODE_CP) {
        throw new DialectSyntaxError(`Unicode code point out of range: \\u{${hex}}`);
      }
      return cp;
    }
    const lead = this.parseHexEscape(4);
    // Combine surrogate pair \uD800..\uDBFF followed by \uDC00..\uDFFF in u-mode.
    if (
      lead >= 0xd800 &&
      lead <= 0xdbff &&
      this.src[this.pos] === "\\" &&
      this.src[this.pos + 1] === "u" &&
      this.src[this.pos + 2] !== "{"
    ) {
      const saved = this.pos;
      this.pos += 1; // skip '\'
      const trail = this.parseHexEscape(4);
      if (trail >= 0xdc00 && trail <= 0xdfff) {
        return 0x10000 + ((lead - 0xd800) << 10) + (trail - 0xdc00);
      }
      this.pos = saved;
    }
    return lead;
  }

  private parseCharClass(): RegexNode {
    this.pos += 1; // skip '['
    let negated = false;
    if (this.src[this.pos] === "^") {
      negated = true;
      this.pos += 1;
    }
    const ranges: CpRange[] = [];
    while (this.pos < this.src.length && this.src[this.pos] !== "]") {
      const first = this.parseClassAtom();
      if (
        this.src[this.pos] === "-" &&
        this.pos + 1 < this.src.length &&
        this.src[this.pos + 1] !== "]"
      ) {
        this.pos += 1; // skip '-'
        const second = this.parseClassAtom();
        if (first.single === null || second.single === null) {
          throw new DialectSyntaxError(
            "Character class range cannot use shorthand character class",
          );
        }
        if (first.single > second.single) {
          throw new DialectSyntaxError("Character class range out of order");
        }
        ranges.push([first.single, second.single]);
      } else {
        for (let i = 0; i < first.ranges.length; i += 1) {
          ranges.push(first.ranges[i]!);
        }
      }
    }
    if (this.src[this.pos] !== "]") {
      throw new DialectSyntaxError("Unclosed character class '['");
    }
    this.pos += 1; // skip ']'
    const normalized = normalizeRanges(ranges);
    return {
      kind: "charset",
      ranges: negated ? negateRanges(normalized) : normalized,
    };
  }

  private parseClassAtom(): {
    readonly single: number | null;
    readonly ranges: readonly CpRange[];
  } {
    const ch = this.src[this.pos]!;
    if (ch !== "\\") {
      const cp = this.readCodePoint();
      return { single: cp, ranges: [[cp, cp]] };
    }
    this.pos += 1; // skip '\'
    if (this.pos >= this.src.length) {
      throw new DialectSyntaxError("Trailing backslash inside character class");
    }
    const esc = this.src[this.pos]!;
    switch (esc) {
      case "d":
        this.pos += 1;
        return { single: null, ranges: DIGIT_RANGES };
      case "D":
        this.pos += 1;
        return { single: null, ranges: NON_DIGIT_RANGES };
      case "w":
        this.pos += 1;
        return { single: null, ranges: WORD_RANGES };
      case "W":
        this.pos += 1;
        return { single: null, ranges: NON_WORD_RANGES };
      case "s":
        this.pos += 1;
        return { single: null, ranges: SPACE_RANGES };
      case "S":
        this.pos += 1;
        return { single: null, ranges: NON_SPACE_RANGES };
      case "b":
        this.pos += 1;
        return { single: 0x08, ranges: [[0x08, 0x08]] };
      case "t":
        this.pos += 1;
        return { single: 0x09, ranges: [[0x09, 0x09]] };
      case "n":
        this.pos += 1;
        return { single: 0x0a, ranges: [[0x0a, 0x0a]] };
      case "v":
        this.pos += 1;
        return { single: 0x0b, ranges: [[0x0b, 0x0b]] };
      case "f":
        this.pos += 1;
        return { single: 0x0c, ranges: [[0x0c, 0x0c]] };
      case "r":
        this.pos += 1;
        return { single: 0x0d, ranges: [[0x0d, 0x0d]] };
      case "0":
        this.pos += 1;
        if (isAsciiDigit(this.src[this.pos])) {
          throw new DialectSyntaxError("Legacy octal escape is not allowed");
        }
        return { single: 0x00, ranges: [[0x00, 0x00]] };
      case "x": {
        const cp = this.parseHexEscape(2);
        return { single: cp, ranges: [[cp, cp]] };
      }
      case "u": {
        const cp = this.parseUnicodeEscape();
        return { single: cp, ranges: [[cp, cp]] };
      }
      case "-":
        this.pos += 1;
        return { single: 0x2d, ranges: [[0x2d, 0x2d]] };
      case "p":
      case "P":
        throw new DialectSyntaxError(`Unicode property escape \\${esc}{...} is not allowed`);
      case "c":
        throw new DialectSyntaxError("Control letter escape \\cX is not allowed");
      default:
        if (esc >= "1" && esc <= "9") {
          throw new DialectSyntaxError(`Escape \\${esc} is not allowed in character class`);
        }
        if (SYNTAX_CHARS.has(esc)) {
          this.pos += 1;
          const cp = esc.codePointAt(0)!;
          return { single: cp, ranges: [[cp, cp]] };
        }
        throw new DialectSyntaxError(`Unsupported class escape \\${esc}`);
    }
  }

  private tryParseQuantifier(): { readonly min: number; readonly max: number | null } | null {
    const ch = this.src[this.pos];
    if (ch === "*") {
      this.pos += 1;
      if (this.src[this.pos] === "?") this.pos += 1;
      return { min: 0, max: null };
    }
    if (ch === "+") {
      this.pos += 1;
      if (this.src[this.pos] === "?") this.pos += 1;
      return { min: 1, max: null };
    }
    if (ch === "?") {
      this.pos += 1;
      if (this.src[this.pos] === "?") this.pos += 1;
      return { min: 0, max: 1 };
    }
    if (ch === "{") {
      this.pos += 1;
      const minStart = this.pos;
      while (isAsciiDigit(this.src[this.pos])) {
        this.pos += 1;
      }
      if (this.pos === minStart) {
        throw new DialectSyntaxError("Invalid quantifier '{'");
      }
      const min = parseInt(this.src.slice(minStart, this.pos), 10);
      let max: number | null = min;
      if (this.src[this.pos] === ",") {
        this.pos += 1;
        if (this.src[this.pos] === "}") {
          max = null;
        } else {
          const maxStart = this.pos;
          while (isAsciiDigit(this.src[this.pos])) {
            this.pos += 1;
          }
          if (this.pos === maxStart) {
            throw new DialectSyntaxError("Invalid quantifier upper bound");
          }
          max = parseInt(this.src.slice(maxStart, this.pos), 10);
          if (max < min) {
            throw new DialectSyntaxError("Quantifier upper bound is less than lower bound");
          }
        }
      }
      if (this.src[this.pos] !== "}") {
        throw new DialectSyntaxError("Unclosed quantifier '{'");
      }
      this.pos += 1; // skip '}'
      if (this.src[this.pos] === "?") this.pos += 1;
      return { min, max };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Static ReDoS safety analysis helpers
// ---------------------------------------------------------------------------

function isZeroWidthAssertion(node: RegexNode): boolean {
  return (
    node.kind === "anchor" ||
    (node.kind === "group" &&
      (node.groupKind === "lookahead" || node.groupKind === "negLookahead"))
  );
}

function isNullable(node: RegexNode): boolean {
  switch (node.kind) {
    case "anchor":
      return true;
    case "charset":
      return false;
    case "group":
      if (node.groupKind === "lookahead" || node.groupKind === "negLookahead") {
        return true;
      }
      return isNullable(node.body);
    case "alt":
      return node.branches.some((b) => isNullable(b));
    case "seq":
      return node.items.every((item) => isNullable(item));
    case "quant":
      return node.min === 0 || isNullable(node.atom);
  }
}

function firstSet(node: RegexNode): CpRange[] {
  switch (node.kind) {
    case "anchor":
      return [];
    case "charset":
      return node.ranges.slice();
    case "group":
      if (node.groupKind === "lookahead" || node.groupKind === "negLookahead") {
        return [];
      }
      return firstSet(node.body);
    case "alt": {
      let acc: CpRange[] = [];
      for (let i = 0; i < node.branches.length; i += 1) {
        acc = unionRanges(acc, firstSet(node.branches[i]!));
      }
      return acc;
    }
    case "seq": {
      let acc: CpRange[] = [];
      for (let i = 0; i < node.items.length; i += 1) {
        const item = node.items[i]!;
        acc = unionRanges(acc, firstSet(item));
        if (!isNullable(item)) {
          break;
        }
      }
      return acc;
    }
    case "quant":
      return node.max === 0 ? [] : firstSet(node.atom);
  }
}

function lastSet(node: RegexNode): CpRange[] {
  switch (node.kind) {
    case "anchor":
      return [];
    case "charset":
      return node.ranges.slice();
    case "group":
      if (node.groupKind === "lookahead" || node.groupKind === "negLookahead") {
        return [];
      }
      return lastSet(node.body);
    case "alt": {
      let acc: CpRange[] = [];
      for (let i = 0; i < node.branches.length; i += 1) {
        acc = unionRanges(acc, lastSet(node.branches[i]!));
      }
      return acc;
    }
    case "seq": {
      let acc: CpRange[] = [];
      for (let i = node.items.length - 1; i >= 0; i -= 1) {
        const item = node.items[i]!;
        acc = unionRanges(acc, lastSet(item));
        if (!isNullable(item)) {
          break;
        }
      }
      return acc;
    }
    case "quant":
      return node.max === 0 ? [] : lastSet(node.atom);
  }
}

function containsUnboundedQuantifier(node: RegexNode): boolean {
  switch (node.kind) {
    case "anchor":
    case "charset":
      return false;
    case "group":
      if (node.groupKind === "lookahead" || node.groupKind === "negLookahead") {
        return false;
      }
      return containsUnboundedQuantifier(node.body);
    case "alt":
      return node.branches.some((b) => containsUnboundedQuantifier(b));
    case "seq":
      return node.items.some((item) => containsUnboundedQuantifier(item));
    case "quant":
      return node.max === null || containsUnboundedQuantifier(node.atom);
  }
}

/** Unwraps transparent capture/non-capture groups and single-element wrappers. */
function unwrapTransparent(node: RegexNode): RegexNode {
  let cur = node;
  while (true) {
    if (
      cur.kind === "group" &&
      (cur.groupKind === "capture" || cur.groupKind === "nonCapture")
    ) {
      cur = cur.body;
      continue;
    }
    if (cur.kind === "alt" && cur.branches.length === 1) {
      cur = cur.branches[0]!;
      continue;
    }
    if (cur.kind === "seq" && cur.items.length === 1) {
      cur = cur.items[0]!;
      continue;
    }
    return cur;
  }
}

function validateAstSafety(node: RegexNode): RegexAnalysisResult {
  switch (node.kind) {
    case "anchor":
    case "charset":
      return { ok: true };

    case "group":
      return validateAstSafety(node.body);

    case "alt":
      for (let i = 0; i < node.branches.length; i += 1) {
        const res = validateAstSafety(node.branches[i]!);
        if (!res.ok) return res;
      }
      return { ok: true };

    case "quant": {
      // Rule 2: quantifier with upper bound > 1 over unbounded inner quantifier.
      const upperAboveOne = node.max === null || node.max > 1;
      if (upperAboveOne && containsUnboundedQuantifier(node.atom)) {
        return {
          ok: false,
          reason: "NESTED_QUANTIFIER",
          message: "Nested quantifier with unbounded inner repetition",
        };
      }

      // Rule 3: unbounded quantifier over alternation with overlapping first sets.
      if (node.max === null) {
        const inner = unwrapTransparent(node.atom);
        if (inner.kind === "alt" && inner.branches.length >= 2) {
          const branchSets = inner.branches.map((b) => ({
            first: firstSet(b),
            nullable: isNullable(b),
          }));
          for (let i = 0; i < branchSets.length; i += 1) {
            for (let j = i + 1; j < branchSets.length; j += 1) {
              const a = branchSets[i]!;
              const b = branchSets[j]!;
              if (
                rangesIntersect(a.first, b.first) ||
                (a.nullable && b.nullable)
              ) {
                return {
                  ok: false,
                  reason: "OVERLAPPING_ALTERNATION",
                  message:
                    "Unbounded repetition over alternation with overlapping branches",
                };
              }
            }
          }
        }
      }

      return validateAstSafety(node.atom);
    }

    case "seq": {
      // First validate each item recursively.
      for (let i = 0; i < node.items.length; i += 1) {
        const res = validateAstSafety(node.items[i]!);
        if (!res.ok) return res;
      }

      // Rule 4: adjacent unbounded-quantified atoms with overlapping character sets
      // separated only by zero-width assertions or nullable items.
      const activeUnbounded: Array<{
        readonly first: readonly CpRange[];
        readonly last: readonly CpRange[];
      }> = [];

      for (let i = 0; i < node.items.length; i += 1) {
        const item = node.items[i]!;
        if (isZeroWidthAssertion(item)) {
          continue;
        }
        const unwrapped = unwrapTransparent(item);
        const itemNullable = isNullable(item);

        if (unwrapped.kind === "quant" && unwrapped.max === null) {
          const curFirst = firstSet(unwrapped.atom);
          const curLast = lastSet(unwrapped.atom);

          for (let p = 0; p < activeUnbounded.length; p += 1) {
            const prev = activeUnbounded[p]!;
            if (
              rangesIntersect(prev.last, curFirst) ||
              rangesIntersect(prev.first, curFirst)
            ) {
              return {
                ok: false,
                reason: "ADJACENT_OVERLAP",
                message:
                  "Adjacent unbounded quantifiers with overlapping character sets",
              };
            }
          }

          if (!itemNullable) {
            activeUnbounded.length = 0;
          }
          activeUnbounded.push({ first: curFirst, last: curLast });
        } else if (!itemNullable) {
          activeUnbounded.length = 0;
        }
      }

      return { ok: true };
    }
  }
}

/**
 * Validates `pattern` against the A2UI v1.0 regex dialect and static ReDoS
 * safety rules without executing it.
 */
export function analyzeRegex(pattern: string): RegexAnalysisResult {
  if (countCodePoints(pattern) > MAX_REGEX_PATTERN_CODE_POINTS) {
    return {
      ok: false,
      reason: "PATTERN_TOO_LONG",
      message: `Regex pattern exceeds ${MAX_REGEX_PATTERN_CODE_POINTS} code points`,
    };
  }

  let ast: AltNode;
  try {
    ast = new A2uiRegexParser(pattern).parse();
  } catch (err) {
    return {
      ok: false,
      reason: "UNSUPPORTED_SYNTAX",
      message: err instanceof Error ? err.message : "Invalid regex syntax",
    };
  }

  return validateAstSafety(ast);
}

const compiledRegexCache = new Map<string, RegExp>();

/**
 * Analyzes and compiles `pattern` in Unicode (`u`) mode, caching up to 256
 * patterns. Throws `A2uiFunctionError` (`category: "ExpressionError"`) on any
 * dialect or ReDoS violation.
 */
export function compileSafeRegex(pattern: string): RegExp {
  const cached = compiledRegexCache.get(pattern);
  if (cached !== undefined) {
    compiledRegexCache.delete(pattern);
    compiledRegexCache.set(pattern, cached);
    return cached;
  }

  const analysis = analyzeRegex(pattern);
  if (!analysis.ok) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Invalid or unsafe regex pattern (${analysis.reason}): ${analysis.message}`,
      "regex",
    );
  }

  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern, "u");
  } catch (err) {
    throw new A2uiFunctionError(
      "EXPRESSION_ERROR",
      `Invalid regex pattern (UNSUPPORTED_SYNTAX): ${err instanceof Error ? err.message : String(err)}`,
      "regex",
    );
  }

  if (compiledRegexCache.size >= MAX_REGEX_CACHE_ENTRIES) {
    const oldest = compiledRegexCache.keys().next().value;
    if (oldest !== undefined) {
      compiledRegexCache.delete(oldest);
    }
  }
  compiledRegexCache.set(pattern, compiled);
  return compiled;
}
