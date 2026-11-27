/**
 * Zero-dependency YAML 1.2 subset parser for A2UI conformance suites.
 *
 * Supports:
 * - Block mappings and sequences (including compact `- key: val` and `- - item`)
 * - Flow mappings `{...}` and sequences `[...]` (single- or multi-line)
 * - Double-quoted strings (full YAML 1.2 escape sequences), single-quoted strings (`''`)
 * - Plain scalars (YAML 1.2 core schema: null, bool, int, float, scientific, string)
 * - Block scalars (`|`, `|-`, `|+`, `>`, `>-`, `>+` with optional indent indicator)
 * - Comments (`#` at line start or after whitespace) and document markers (`---`, `...`)
 * - Anchors (`&name`), aliases (`*name`), and merge keys (`<<`)
 */

export class YamlParseError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`YAML parse error at line ${line}: ${message}`);
    this.name = "YamlParseError";
    this.line = line;
  }
}

function defineOwn(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function deepClone(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepClone);
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    defineOwn(out, key, deepClone(src[key]));
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHexCodePoint(
  text: string,
  start: number,
  digits: number,
  line: number,
): string {
  const hex = text.slice(start, start + digits);
  if (hex.length !== digits || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new YamlParseError(`Invalid hex escape "\\${hex}"`, line);
  }
  const cp = Number.parseInt(hex, 16);
  if (cp > 0x10ffff) {
    throw new YamlParseError(`Unicode code point out of range: 0x${hex}`, line);
  }
  return String.fromCodePoint(cp);
}

/** Parses a YAML double-quoted string starting at `start` (pointing to `"`). */
function parseDoubleQuoted(
  text: string,
  start: number,
  line: number,
): { value: string; end: number } {
  let out = "";
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') {
      return { value: out, end: i + 1 };
    }
    if (ch === "\\") {
      i += 1;
      if (i >= text.length) {
        throw new YamlParseError("Unterminated escape in double-quoted string", line);
      }
      const esc = text[i]!;
      switch (esc) {
        case "0":
          out += "\0";
          break;
        case "a":
          out += "\x07";
          break;
        case "b":
          out += "\b";
          break;
        case "t":
        case "\t":
          out += "\t";
          break;
        case "n":
          out += "\n";
          break;
        case "v":
          out += "\v";
          break;
        case "f":
          out += "\f";
          break;
        case "r":
          out += "\r";
          break;
        case "e":
          out += "\x1b";
          break;
        case " ":
          out += " ";
          break;
        case '"':
          out += '"';
          break;
        case "/":
          out += "/";
          break;
        case "\\":
          out += "\\";
          break;
        case "N":
          out += "\u0085";
          break;
        case "_":
          out += "\u00a0";
          break;
        case "L":
          out += "\u2028";
          break;
        case "P":
          out += "\u2029";
          break;
        case "x":
          out += parseHexCodePoint(text, i + 1, 2, line);
          i += 2;
          break;
        case "u":
          out += parseHexCodePoint(text, i + 1, 4, line);
          i += 4;
          break;
        case "U":
          out += parseHexCodePoint(text, i + 1, 8, line);
          i += 8;
          break;
        case "\n":
          while (i + 1 < text.length && (text[i + 1] === " " || text[i + 1] === "\t")) {
            i += 1;
          }
          break;
        default:
          throw new YamlParseError(`Unknown escape sequence "\\${esc}"`, line);
      }
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  throw new YamlParseError("Unterminated double-quoted string", line);
}

/** Parses a YAML single-quoted string starting at `start` (pointing to `'`). */
function parseSingleQuoted(
  text: string,
  start: number,
  line: number,
): { value: string; end: number } {
  let out = "";
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "'") {
      if (i + 1 < text.length && text[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return { value: out, end: i + 1 };
    }
    out += ch;
    i += 1;
  }
  throw new YamlParseError("Unterminated single-quoted string", line);
}

const INT_DEC_RE = /^[+-]?(?:0|[1-9][0-9]*)$/;
const INT_HEX_RE = /^0x[0-9a-fA-F]+$/;
const INT_OCT_RE = /^0o[0-7]+$/;
const FLOAT_RE = /^[+-]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][+-]?[0-9]+)?$/;

/** Converts an unquoted YAML 1.2 core-schema plain scalar to a JS value. */
function parsePlainScalar(raw: string): unknown {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL") {
    return null;
  }
  if (s === "true" || s === "True" || s === "TRUE") {
    return true;
  }
  if (s === "false" || s === "False" || s === "FALSE") {
    return false;
  }
  if (s === ".inf" || s === ".Inf" || s === ".INF" || s === "+.inf") {
    return Number.POSITIVE_INFINITY;
  }
  if (s === "-.inf" || s === "-.Inf" || s === "-.INF") {
    return Number.NEGATIVE_INFINITY;
  }
  if (s === ".nan" || s === ".NaN" || s === ".NAN") {
    return Number.NaN;
  }
  if (INT_DEC_RE.test(s)) {
    const n = Number(s);
    return Object.is(n, -0) ? 0 : n;
  }
  if (INT_HEX_RE.test(s)) {
    return Number.parseInt(s.slice(2), 16);
  }
  if (INT_OCT_RE.test(s)) {
    return Number.parseInt(s.slice(2), 8);
  }
  if ((s.includes(".") || s.includes("e") || s.includes("E")) && FLOAT_RE.test(s)) {
    const n = Number(s);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return s;
}

/** Strips a trailing `# ...` comment outside quotes (only when preceded by whitespace or at col 0). */
function stripInlineComment(text: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inDouble) {
      if (ch === "\\") {
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }
    if (inSingle) {
      if (ch === "'") {
        if (i + 1 < text.length && text[i + 1] === "'") {
          i += 1;
        } else {
          inSingle = false;
        }
      }
      continue;
    }
    if (ch === '"') {
      inDouble = true;
    } else if (ch === "'") {
      inSingle = true;
    } else if (
      ch === "#" &&
      (i === 0 || text[i - 1] === " " || text[i - 1] === "\t")
    ) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text.trimEnd();
}

/**
 * Finds the index of the block mapping separator `:` at flow depth 0 outside quotes,
 * or -1 if `text` is not a block mapping entry.
 */
function findMappingColon(text: string): number {
  let inSingle = false;
  let inDouble = false;
  let flowDepth = 0;
  let justClosedQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inDouble) {
      if (ch === "\\") {
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
        justClosedQuote = true;
      }
      continue;
    }
    if (inSingle) {
      if (ch === "'") {
        if (i + 1 < text.length && text[i + 1] === "'") {
          i += 1;
        } else {
          inSingle = false;
          justClosedQuote = true;
        }
      }
      continue;
    }
    if (ch === "#" && (i === 0 || text[i - 1] === " " || text[i - 1] === "\t")) {
      return -1;
    }
    if (ch === '"') {
      inDouble = true;
      justClosedQuote = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      justClosedQuote = false;
      continue;
    }
    if (ch === "{" || ch === "[") {
      flowDepth += 1;
      justClosedQuote = false;
      continue;
    }
    if (ch === "}" || ch === "]") {
      if (flowDepth > 0) {
        flowDepth -= 1;
      }
      justClosedQuote = false;
      continue;
    }
    if (flowDepth === 0 && ch === ":") {
      const next = i + 1 < text.length ? text[i + 1] : undefined;
      if (
        justClosedQuote ||
        next === undefined ||
        next === " " ||
        next === "\t"
      ) {
        return i;
      }
    }
    if (ch !== " " && ch !== "\t") {
      justClosedQuote = false;
    }
  }
  return -1;
}

/** Returns net open bracket depth (`{` / `[` minus `}` / `]`) outside quotes and comments. */
function flowBracketBalance(text: string): {
  depth: number;
  inSingle: boolean;
  inDouble: boolean;
} {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inDouble) {
      if (ch === "\\") {
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }
    if (inSingle) {
      if (ch === "'") {
        if (i + 1 < text.length && text[i + 1] === "'") {
          i += 1;
        } else {
          inSingle = false;
        }
      }
      continue;
    }
    if (
      ch === "#" &&
      (i === 0 || text[i - 1] === " " || text[i - 1] === "\t" || text[i - 1] === "\n")
    ) {
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      inDouble = true;
    } else if (ch === "'") {
      inSingle = true;
    } else if (ch === "{" || ch === "[") {
      depth += 1;
    } else if (ch === "}" || ch === "]") {
      depth -= 1;
    }
  }
  return { depth, inSingle, inDouble };
}

class FlowParser {
  private pos = 0;
  private readonly text: string;
  private readonly line: number;
  private readonly anchors: Map<string, unknown>;

  constructor(text: string, line: number, anchors: Map<string, unknown>) {
    this.text = text;
    this.line = line;
    this.anchors = anchors;
  }

  parseRoot(): unknown {
    this.skipWhitespaceAndComments();
    const val = this.parseValue(false);
    this.skipWhitespaceAndComments();
    if (this.pos < this.text.length) {
      throw new YamlParseError(
        `Unexpected trailing flow token "${this.text.slice(this.pos, this.pos + 20)}"`,
        this.line,
      );
    }
    return val;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos]!;
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        this.pos += 1;
        continue;
      }
      if (
        ch === "#" &&
        (this.pos === 0 ||
          this.text[this.pos - 1] === " " ||
          this.text[this.pos - 1] === "\t" ||
          this.text[this.pos - 1] === "\n")
      ) {
        while (this.pos < this.text.length && this.text[this.pos] !== "\n") {
          this.pos += 1;
        }
        continue;
      }
      break;
    }
  }

  private parseValue(inFlowContext: boolean): unknown {
    this.skipWhitespaceAndComments();
    if (this.pos >= this.text.length) {
      return null;
    }
    let anchorName: string | null = null;
    if (this.text[this.pos] === "&") {
      anchorName = this.readAnchorOrAliasName();
      this.skipWhitespaceAndComments();
    }
    const ch = this.text[this.pos];
    let val: unknown;
    if (ch === "{") {
      val = this.parseObject();
    } else if (ch === "[") {
      val = this.parseArray();
    } else if (ch === '"') {
      const res = parseDoubleQuoted(this.text, this.pos, this.line);
      this.pos = res.end;
      val = res.value;
    } else if (ch === "'") {
      const res = parseSingleQuoted(this.text, this.pos, this.line);
      this.pos = res.end;
      val = res.value;
    } else if (ch === "*") {
      const alias = this.readAnchorOrAliasName();
      if (!this.anchors.has(alias)) {
        throw new YamlParseError(`Unknown alias "*${alias}"`, this.line);
      }
      val = deepClone(this.anchors.get(alias));
    } else {
      val = this.parsePlain(inFlowContext);
    }
    if (anchorName !== null) {
      this.anchors.set(anchorName, deepClone(val));
    }
    return val;
  }

  private readAnchorOrAliasName(): string {
    this.pos += 1; // skip & or *
    const start = this.pos;
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos]!;
      if (
        ch === " " ||
        ch === "\t" ||
        ch === "\n" ||
        ch === "\r" ||
        ch === "," ||
        ch === "[" ||
        ch === "]" ||
        ch === "{" ||
        ch === "}"
      ) {
        break;
      }
      this.pos += 1;
    }
    const name = this.text.slice(start, this.pos);
    if (name.length === 0) {
      throw new YamlParseError("Empty anchor or alias name", this.line);
    }
    return name;
  }

  private parseArray(): unknown[] {
    this.pos += 1; // skip '['
    const items: unknown[] = [];
    while (true) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.text.length) {
        throw new YamlParseError("Unterminated flow sequence '['", this.line);
      }
      if (this.text[this.pos] === "]") {
        this.pos += 1;
        return items;
      }
      items.push(this.parseValue(true));
      this.skipWhitespaceAndComments();
      if (this.text[this.pos] === ",") {
        this.pos += 1;
        continue;
      }
      if (this.text[this.pos] === "]") {
        this.pos += 1;
        return items;
      }
      throw new YamlParseError(
        `Expected ',' or ']' in flow sequence near "${this.text.slice(this.pos, this.pos + 15)}"`,
        this.line,
      );
    }
  }

  private parseObject(): Record<string, unknown> {
    this.pos += 1; // skip '{'
    const obj: Record<string, unknown> = {};
    while (true) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.text.length) {
        throw new YamlParseError("Unterminated flow mapping '{'", this.line);
      }
      if (this.text[this.pos] === "}") {
        this.pos += 1;
        return obj;
      }
      const key = this.parseKey();
      this.skipWhitespaceAndComments();
      if (this.text[this.pos] !== ":") {
        throw new YamlParseError(
          `Expected ':' after flow mapping key "${key}"`,
          this.line,
        );
      }
      this.pos += 1; // skip ':'
      this.skipWhitespaceAndComments();
      let val: unknown;
      if (this.text[this.pos] === "," || this.text[this.pos] === "}") {
        val = null;
      } else {
        val = this.parseValue(true);
      }
      if (key === "<<") {
        applyMerge(obj, val);
      } else {
        defineOwn(obj, key, val);
      }
      this.skipWhitespaceAndComments();
      if (this.text[this.pos] === ",") {
        this.pos += 1;
        continue;
      }
      if (this.text[this.pos] === "}") {
        this.pos += 1;
        return obj;
      }
      throw new YamlParseError(
        `Expected ',' or '}' in flow mapping near "${this.text.slice(this.pos, this.pos + 15)}"`,
        this.line,
      );
    }
  }

  private parseKey(): string {
    const ch = this.text[this.pos];
    if (ch === '"') {
      const res = parseDoubleQuoted(this.text, this.pos, this.line);
      this.pos = res.end;
      return res.value;
    }
    if (ch === "'") {
      const res = parseSingleQuoted(this.text, this.pos, this.line);
      this.pos = res.end;
      return res.value;
    }
    const start = this.pos;
    while (this.pos < this.text.length) {
      const c = this.text[this.pos]!;
      if (c === ":") {
        const next = this.text[this.pos + 1];
        if (
          next === undefined ||
          next === " " ||
          next === "\t" ||
          next === "\n" ||
          next === "\r" ||
          next === "," ||
          next === "}" ||
          next === "]"
        ) {
          break;
        }
      }
      if (c === "," || c === "}" || c === "]") {
        break;
      }
      this.pos += 1;
    }
    return this.text.slice(start, this.pos).trim();
  }

  private parsePlain(inFlowContext: boolean): unknown {
    const start = this.pos;
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos]!;
      if (
        inFlowContext &&
        (ch === "," || ch === "]" || ch === "}" || ch === "\n" || ch === "\r")
      ) {
        break;
      }
      if (
        inFlowContext &&
        ch === ":" &&
        (this.text[this.pos + 1] === " " || this.text[this.pos + 1] === "\t")
      ) {
        // Rule 6: a flow plain scalar may not contain ": ".
        throw new YamlParseError(
          `Unexpected ": " in flow plain scalar near "${this.text.slice(start, this.pos + 2)}"`,
          this.line,
        );
      }
      if (
        ch === "#" &&
        this.pos > start &&
        (this.text[this.pos - 1] === " " || this.text[this.pos - 1] === "\t")
      ) {
        break;
      }
      this.pos += 1;
    }
    return parsePlainScalar(this.text.slice(start, this.pos));
  }
}

function applyMerge(target: Record<string, unknown>, source: unknown): void {
  const mergeOne = (obj: Record<string, unknown>): void => {
    for (const k of Object.keys(obj)) {
      if (!Object.prototype.hasOwnProperty.call(target, k)) {
        defineOwn(target, k, deepClone(obj[k]));
      }
    }
  };
  if (isPlainObject(source)) {
    mergeOne(source);
  } else if (Array.isArray(source)) {
    for (const item of source) {
      if (isPlainObject(item)) {
        mergeOne(item);
      }
    }
  }
}

function countIndent(line: string): number {
  let count = 0;
  while (count < line.length && line[count] === " ") {
    count += 1;
  }
  return count;
}

function isBlankOrComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith("#");
}

function isSequenceItemStart(trimmed: string): boolean {
  return (
    trimmed === "-" ||
    trimmed.startsWith("- ") ||
    trimmed.startsWith("-\t")
  );
}

const BLOCK_SCALAR_HEADER_RE = /^([|>])([+-]?[1-9]?|[1-9]?[+-]?)$/;

class YamlParser {
  private readonly lines: string[];
  private lineIdx = 0;
  private readonly anchors = new Map<string, unknown>();

  constructor(source: string) {
    this.lines = source.replace(/\r\n?/g, "\n").split("\n");
  }

  parse(): unknown {
    this.skipIgnorable();
    if (this.lineIdx >= this.lines.length) {
      return null;
    }
    if (this.lines[this.lineIdx]!.trim() === "---") {
      this.lineIdx += 1;
      this.skipIgnorable();
      if (this.lineIdx >= this.lines.length) {
        return null;
      }
    }
    if (this.lines[this.lineIdx]!.trim() === "...") {
      return null;
    }
    const indent = countIndent(this.lines[this.lineIdx]!);
    return this.parseBlock(indent);
  }

  private skipIgnorable(): void {
    while (this.lineIdx < this.lines.length) {
      const line = this.lines[this.lineIdx]!;
      if (isBlankOrComment(line)) {
        this.lineIdx += 1;
        continue;
      }
      break;
    }
  }

  private peekNextContent(): { idx: number; indent: number; trimmed: string } | null {
    let idx = this.lineIdx;
    while (idx < this.lines.length) {
      const line = this.lines[idx]!;
      if (!isBlankOrComment(line)) {
        const trimmed = line.trim();
        if (trimmed === "..." || trimmed === "---") {
          return null;
        }
        return { idx, indent: countIndent(line), trimmed };
      }
      idx += 1;
    }
    return null;
  }

  private parseBlock(expectedIndent: number): unknown {
    const next = this.peekNextContent();
    if (next === null || next.indent < expectedIndent) {
      return null;
    }
    this.lineIdx = next.idx;
    const indent = next.indent;
    const trimmed = next.trimmed;

    if (isSequenceItemStart(trimmed)) {
      return this.parseSequence(indent);
    }
    if (findMappingColon(trimmed) >= 0) {
      return this.parseMapping(indent);
    }
    const raw = this.lines[this.lineIdx]!.slice(indent);
    const lineNum = this.lineIdx + 1;
    this.lineIdx += 1;
    return this.parseValueFromInline(raw, indent - 1, lineNum);
  }

  private parseSequence(seqIndent: number): unknown[] {
    const items: unknown[] = [];
    while (true) {
      const next = this.peekNextContent();
      if (next === null || next.indent !== seqIndent || !isSequenceItemStart(next.trimmed)) {
        break;
      }
      this.lineIdx = next.idx;
      const line = this.lines[this.lineIdx]!;
      const lineNum = this.lineIdx + 1;
      const afterDash = line.slice(seqIndent + 1);
      const spacesAfter = countIndent(afterDash);
      const rest = afterDash.slice(spacesAfter);
      const restNoComment = stripInlineComment(rest);

      if (restNoComment.length === 0) {
        this.lineIdx += 1;
        const child = this.peekNextContent();
        if (child !== null && child.indent > seqIndent) {
          items.push(this.parseBlock(child.indent));
        } else {
          items.push(null);
        }
        continue;
      }

      const itemCol = seqIndent + 1 + spacesAfter;
      items.push(this.parseInlineSequenceItem(rest, seqIndent, itemCol, lineNum));
    }
    return items;
  }

  private parseInlineSequenceItem(
    rest: string,
    seqIndent: number,
    itemCol: number,
    lineNum: number,
  ): unknown {
    // Check for leading anchor on sequence item
    const { anchor, remainder, consumedCols } = extractLeadingAnchor(rest, lineNum);
    if (anchor !== null && stripInlineComment(remainder).length === 0) {
      this.lineIdx += 1;
      const child = this.peekNextContent();
      const val =
        child !== null && child.indent > seqIndent
          ? this.parseBlock(child.indent)
          : null;
      this.anchors.set(anchor, deepClone(val));
      return val;
    }

    const effectiveRest = anchor !== null ? remainder : rest;
    const effectiveCol = anchor !== null ? itemCol + consumedCols : itemCol;

    let value: unknown;
    if (isSequenceItemStart(effectiveRest)) {
      // Compact nested sequence: `- - item`
      const nestedAfter = effectiveRest.slice(1);
      const nestedSpaces = countIndent(nestedAfter);
      const nestedRest = nestedAfter.slice(nestedSpaces);
      const firstItem =
        stripInlineComment(nestedRest).length === 0
          ? (() => {
              this.lineIdx += 1;
              const c = this.peekNextContent();
              return c !== null && c.indent > effectiveCol
                ? this.parseBlock(c.indent)
                : null;
            })()
          : this.parseInlineSequenceItem(
              nestedRest,
              effectiveCol,
              effectiveCol + 1 + nestedSpaces,
              lineNum,
            );
      const restItems = this.parseSequence(effectiveCol);
      value = [firstItem, ...restItems];
    } else if (findMappingColon(effectiveRest) >= 0) {
      value = this.parseMapping(effectiveCol, effectiveRest, lineNum);
    } else {
      this.lineIdx += 1;
      value = this.parseValueFromInline(effectiveRest, seqIndent, lineNum);
    }

    if (anchor !== null) {
      this.anchors.set(anchor, deepClone(value));
    }
    return value;
  }

  private parseMapping(
    mapIndent: number,
    firstEntryText?: string,
    firstLineNum?: number,
  ): Record<string, unknown> {
    const obj: Record<string, unknown> = {};

    const processEntry = (entryText: string, lineNum: number): void => {
      const colonIdx = findMappingColon(entryText);
      if (colonIdx < 0) {
        throw new YamlParseError(
          `Expected mapping key-value pair near "${entryText}"`,
          lineNum,
        );
      }
      const rawKey = entryText.slice(0, colonIdx).trim();
      const key = parseMappingKey(rawKey, lineNum);
      const rawVal = entryText.slice(colonIdx + 1).trimStart();

      this.lineIdx += 1;
      const val = this.parseMappingValue(rawVal, mapIndent, lineNum);
      if (key === "<<") {
        applyMerge(obj, val);
      } else {
        defineOwn(obj, key, val);
      }
    };

    if (firstEntryText !== undefined && firstLineNum !== undefined) {
      processEntry(firstEntryText, firstLineNum);
    }

    while (true) {
      const next = this.peekNextContent();
      if (next === null || next.indent !== mapIndent) {
        break;
      }
      if (isSequenceItemStart(next.trimmed)) {
        break;
      }
      if (findMappingColon(next.trimmed) < 0) {
        // Rule 5: a same-indent line without "key:" cannot continue a block mapping.
        throw new YamlParseError(
          `Expected mapping key-value pair near "${next.trimmed}"`,
          next.idx + 1,
        );
      }
      this.lineIdx = next.idx;
      const lineText = this.lines[this.lineIdx]!.slice(mapIndent);
      processEntry(lineText, this.lineIdx + 1);
    }

    return obj;
  }

  private parseMappingValue(
    rawVal: string,
    mapIndent: number,
    lineNum: number,
  ): unknown {
    const { anchor, remainder } = extractLeadingAnchor(rawVal, lineNum);
    const effective = anchor !== null ? remainder : rawVal;
    const stripped = stripInlineComment(effective);

    let val: unknown;
    if (stripped.length === 0) {
      const child = this.peekNextContent();
      if (child !== null && child.indent > mapIndent) {
        val = this.parseBlock(child.indent);
      } else if (
        child !== null &&
        child.indent === mapIndent &&
        isSequenceItemStart(child.trimmed)
      ) {
        val = this.parseSequence(mapIndent);
      } else {
        val = null;
      }
    } else {
      val = this.parseValueFromInline(effective, mapIndent, lineNum);
    }

    if (anchor !== null) {
      this.anchors.set(anchor, deepClone(val));
    }
    return val;
  }

  private parseValueFromInline(
    rawVal: string,
    parentIndent: number,
    lineNum: number,
  ): unknown {
    const { anchor, remainder } = extractLeadingAnchor(rawVal, lineNum);
    const effective = (anchor !== null ? remainder : rawVal).trimStart();
    const stripped = stripInlineComment(effective);

    let val: unknown;
    const blockHeader = BLOCK_SCALAR_HEADER_RE.exec(stripped);
    if (blockHeader !== null) {
      val = this.parseBlockScalar(blockHeader[1]!, blockHeader[2]!, parentIndent);
    } else if (effective.startsWith("{") || effective.startsWith("[")) {
      val = this.parseFlowValue(effective, lineNum);
    } else if (stripped.startsWith("*")) {
      const alias = stripped.slice(1).trim();
      if (!this.anchors.has(alias)) {
        throw new YamlParseError(`Unknown alias "*${alias}"`, lineNum);
      }
      val = deepClone(this.anchors.get(alias));
    } else if (effective.startsWith('"')) {
      val = this.parseMultilineQuoted('"', effective, lineNum);
    } else if (effective.startsWith("'")) {
      val = this.parseMultilineQuoted("'", effective, lineNum);
    } else {
      // Plain scalar, possibly spanning indented continuation lines.
      let combined = stripped;
      while (true) {
        const next = this.peekNextContent();
        if (next === null || next.indent <= parentIndent) {
          break;
        }
        if (isSequenceItemStart(next.trimmed) || findMappingColon(next.trimmed) >= 0) {
          break;
        }
        this.lineIdx = next.idx + 1;
        combined += " " + stripInlineComment(next.trimmed);
      }
      val = parsePlainScalar(combined);
    }

    if (anchor !== null) {
      this.anchors.set(anchor, deepClone(val));
    }
    return val;
  }

  private parseMultilineQuoted(
    quote: '"' | "'",
    firstLineText: string,
    lineNum: number,
  ): string {
    let combined = firstLineText;
    while (true) {
      const bal = flowBracketBalance(combined);
      const closed = quote === '"' ? !bal.inDouble : !bal.inSingle;
      if (closed) {
        break;
      }
      if (this.lineIdx >= this.lines.length) {
        throw new YamlParseError(`Unterminated ${quote} string`, lineNum);
      }
      const nextLine = this.lines[this.lineIdx]!;
      this.lineIdx += 1;
      combined += "\n" + nextLine.trim();
    }
    const res =
      quote === '"'
        ? parseDoubleQuoted(combined, 0, lineNum)
        : parseSingleQuoted(combined, 0, lineNum);
    const tail = stripInlineComment(combined.slice(res.end)).trim();
    if (tail.length > 0) {
      throw new YamlParseError(
        `Unexpected characters after quoted string: "${tail}"`,
        lineNum,
      );
    }
    return res.value;
  }

  private parseFlowValue(firstLineText: string, lineNum: number): unknown {
    let combined = firstLineText;
    while (true) {
      const bal = flowBracketBalance(combined);
      if (bal.depth <= 0 && !bal.inSingle && !bal.inDouble) {
        break;
      }
      if (this.lineIdx >= this.lines.length) {
        throw new YamlParseError("Unterminated flow collection", lineNum);
      }
      combined += "\n" + this.lines[this.lineIdx]!;
      this.lineIdx += 1;
    }
    const parser = new FlowParser(combined, lineNum, this.anchors);
    return parser.parseRoot();
  }

  private parseBlockScalar(
    style: string,
    modifiers: string,
    parentIndent: number,
  ): string {
    let chomp: "clip" | "strip" | "keep" = "clip";
    let explicitIndent = 0;
    for (const ch of modifiers) {
      if (ch === "-") {
        chomp = "strip";
      } else if (ch === "+") {
        chomp = "keep";
      } else if (ch >= "1" && ch <= "9") {
        explicitIndent = Number(ch);
      }
    }

    let blockIndent = explicitIndent > 0 ? Math.max(0, parentIndent) + explicitIndent : -1;
    const rawLines: string[] = [];

    if (blockIndent < 0) {
      // Determine indent from first non-empty line in the block.
      let probe = this.lineIdx;
      while (probe < this.lines.length) {
        const line = this.lines[probe]!;
        if (line.trim().length > 0) {
          const ind = countIndent(line);
          if (ind > parentIndent) {
            blockIndent = ind;
          }
          break;
        }
        probe += 1;
      }
    }

    if (blockIndent < 0) {
      // Only blank lines or immediate dedent -> empty block scalar.
      let emptyCount = 0;
      while (this.lineIdx < this.lines.length && this.lines[this.lineIdx]!.trim().length === 0) {
        emptyCount += 1;
        this.lineIdx += 1;
      }
      return chomp === "keep" ? "\n".repeat(emptyCount) : "";
    }

    while (this.lineIdx < this.lines.length) {
      const line = this.lines[this.lineIdx]!;
      if (line.trim().length === 0) {
        rawLines.push(line.length > blockIndent ? line.slice(blockIndent) : "");
        this.lineIdx += 1;
        continue;
      }
      const ind = countIndent(line);
      if (ind < blockIndent) {
        break;
      }
      rawLines.push(line.slice(blockIndent));
      this.lineIdx += 1;
    }

    // Separate trailing blank lines for chomping.
    let trailingBlanks = 0;
    while (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
      rawLines.pop();
      trailingBlanks += 1;
    }

    if (rawLines.length === 0) {
      return chomp === "keep" ? "\n".repeat(trailingBlanks) : "";
    }

    let body: string;
    if (style === "|") {
      body = rawLines.join("\n");
    } else {
      body = foldBlockLines(rawLines);
    }

    if (chomp === "strip") {
      return body;
    }
    if (chomp === "keep") {
      return body + "\n" + "\n".repeat(trailingBlanks);
    }
    return body + "\n";
  }
}

function foldBlockLines(lines: string[]): string {
  let out = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const isMoreIndented = line.startsWith(" ") || line.startsWith("\t");
    if (i === 0) {
      out += line;
      i += 1;
      continue;
    }
    if (line === "") {
      let emptyRun = 0;
      while (i < lines.length && lines[i] === "") {
        emptyRun += 1;
        i += 1;
      }
      if (i >= lines.length) {
        break;
      }
      const next = lines[i]!;
      const nextMoreIndented = next.startsWith(" ") || next.startsWith("\t");
      const prev = lines[i - emptyRun - 1] ?? "";
      const prevMoreIndented = prev.startsWith(" ") || prev.startsWith("\t");
      if (prevMoreIndented || nextMoreIndented) {
        out += "\n".repeat(emptyRun + 1) + next;
      } else {
        out += "\n".repeat(emptyRun) + next;
      }
      i += 1;
      continue;
    }
    const prev = lines[i - 1]!;
    const prevMoreIndented = prev.startsWith(" ") || prev.startsWith("\t");
    if (isMoreIndented || prevMoreIndented) {
      out += "\n" + line;
    } else {
      out += " " + line;
    }
    i += 1;
  }
  return out;
}

function extractLeadingAnchor(text: string, lineNum: number): {
  anchor: string | null;
  remainder: string;
  consumedCols: number;
} {
  if (!text.startsWith("&")) {
    return { anchor: null, remainder: text, consumedCols: 0 };
  }
  let i = 1;
  while (i < text.length && text[i] !== " " && text[i] !== "\t") {
    i += 1;
  }
  const anchor = text.slice(1, i);
  if (anchor.length === 0) {
    // Rule 7: an anchor indicator needs a non-empty name.
    throw new YamlParseError("Empty anchor or alias name", lineNum);
  }
  let j = i;
  while (j < text.length && (text[j] === " " || text[j] === "\t")) {
    j += 1;
  }
  return { anchor, remainder: text.slice(j), consumedCols: j };
}

function parseMappingKey(rawKey: string, lineNum: number): string {
  if (rawKey.startsWith('"')) {
    const res = parseDoubleQuoted(rawKey, 0, lineNum);
    return res.value;
  }
  if (rawKey.startsWith("'")) {
    const res = parseSingleQuoted(rawKey, 0, lineNum);
    return res.value;
  }
  return rawKey;
}

/** Parses a YAML 1.2 document into JavaScript values. */
export function parseYaml(source: string): unknown {
  return new YamlParser(source).parse();
}
