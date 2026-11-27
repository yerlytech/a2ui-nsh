import { describe, expect, test } from "nsh/test";
import { YamlParseError, parseYaml } from "./yaml";

describe("YAML subset parser", () => {
  test("parses block mappings, sequences, quoted keys, and flow collections", () => {
    const doc = parseYaml(`
# leading comment
- name: sample_case
  features: [F-CORE-14, F-CORE-15]
  description: >-
    First line
    second line.
  initial: {"user": {"name": "Alice"}, "items": ["a", "b"]}
  steps:
    - op: "set"
      path: "/a~1b/c~0d"
      value: 42
    - op: "get"
      path: "/"
      expect:
        "a/b":
          "c~d": 42
        "@path": "/literal"
`);

    expect(doc).toEqual([
      {
        name: "sample_case",
        features: ["F-CORE-14", "F-CORE-15"],
        description: "First line second line.",
        initial: { user: { name: "Alice" }, items: ["a", "b"] },
        steps: [
          { op: "set", path: "/a~1b/c~0d", value: 42 },
          {
            op: "get",
            path: "/",
            expect: {
              "a/b": { "c~d": 42 },
              "@path": "/literal",
            },
          },
        ],
      },
    ]);
  });

  test("handles double-quoted escapes, Unicode escapes, and single-quoted literals", () => {
    const doc = parseYaml(`
unicode: "\${/a/\\u0301b/\\U00020BB7}"
escaped_in_dq: "\${'line\\\\nbreak'}"
newline_in_dq: "line\\nbreak"
single_quoted: '\${"hello world"}'
single_quote_escape: 'it''s'
hash_in_plain: common_types.json#/$defs/DynamicValue
inline_comment: 123 # trailing comment
scientific: [1.0e+308, -1.5e-3, 0, true, false, null, ~]
version_string: "1.0"
`) as Record<string, unknown>;

    expect(doc["unicode"]).toBe("${/a/\u0301b/𠮷}");
    expect(doc["escaped_in_dq"]).toBe("${'line\\nbreak'}");
    expect(doc["newline_in_dq"]).toBe("line\nbreak");
    expect(doc["single_quoted"]).toBe('${"hello world"}');
    expect(doc["single_quote_escape"]).toBe("it's");
    expect(doc["hash_in_plain"]).toBe("common_types.json#/$defs/DynamicValue");
    expect(doc["inline_comment"]).toBe(123);
    expect(doc["scientific"]).toEqual([1e308, -0.0015, 0, true, false, null, null]);
    expect(doc["version_string"]).toBe("1.0");
  });

  test("handles block scalars (|, |-, |+, >, >-, >+) and zero-indented sequences", () => {
    const doc = parseYaml(`
folded_strip: >-
  Line one
  line two
folded_clip: >
  Line one
  line two
literal_strip: |-
  a
  b
literal_keep: |+
  a

zero_indent:
- one
- two
`) as Record<string, unknown>;

    expect(doc["folded_strip"]).toBe("Line one line two");
    expect(doc["folded_clip"]).toBe("Line one line two\n");
    expect(doc["literal_strip"]).toBe("a\nb");
    expect(doc["literal_keep"]).toBe("a\n\n");
    expect(doc["zero_indent"]).toEqual(["one", "two"]);
  });

  test("supports anchors, aliases, merge keys, and multi-line flow collections", () => {
    const doc = parseYaml(`
base: &base_obj
  a: 1
  b: 2
derived:
  <<: *base_obj
  b: 20
  c: 3
multiline_flow: {
  x: [
    1,
    2,
  ],
  y: "ok"
}
`) as Record<string, unknown>;

    expect(doc["derived"]).toEqual({ a: 1, b: 20, c: 3 });
    expect(doc["multiline_flow"]).toEqual({ x: [1, 2], y: "ok" });
  });

  test("throws YamlParseError on malformed syntax", () => {
    expect(() => parseYaml('unterminated: "abc')).toThrow(YamlParseError);
    expect(() => parseYaml("bad_flow: [1, 2")).toThrow(YamlParseError);
    expect(() => parseYaml("bad_alias: *missing")).toThrow(YamlParseError);
  });
});

describe("YAML subset parser rules", () => {
  function parseError(source: string): YamlParseError {
    try {
      parseYaml(source);
    } catch (error) {
      if (error instanceof YamlParseError) {
        return error;
      }
      throw error;
    }
    throw new Error("Expected parseYaml to throw YamlParseError");
  }

  test("rule 1: plain scalars follow the YAML 1.2 core schema", () => {
    expect(parseYaml("")).toBeNull();
    expect(parseYaml("~")).toBeNull();
    expect(parseYaml("null")).toBeNull();
    expect(parseYaml("Null")).toBeNull();
    expect(parseYaml("NULL")).toBeNull();

    expect(parseYaml("true")).toBe(true);
    expect(parseYaml("True")).toBe(true);
    expect(parseYaml("TRUE")).toBe(true);
    expect(parseYaml("false")).toBe(false);
    expect(parseYaml("False")).toBe(false);
    expect(parseYaml("FALSE")).toBe(false);
    expect(parseYaml("yes")).toBe("yes");
    expect(parseYaml("on")).toBe("on");

    expect(parseYaml(".inf")).toBe(Number.POSITIVE_INFINITY);
    expect(parseYaml("+.inf")).toBe(Number.POSITIVE_INFINITY);
    expect(parseYaml("-.inf")).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(parseYaml(".nan"))).toBe(true);

    expect(parseYaml("-0")).toBe(0);
    expect(Object.is(parseYaml("-0"), -0)).toBe(false);
    expect(parseYaml("0x1F")).toBe(31);
    expect(parseYaml("0o17")).toBe(15);

    expect(parseYaml("1.5")).toBe(1.5);
    expect(parseYaml(".5")).toBe(0.5);
    expect(parseYaml("1e3")).toBe(1000);
    expect(parseYaml("-2.5E-1")).toBe(-0.25);

    expect(parseYaml("012")).toBe("012");
    expect(parseYaml("1_000")).toBe("1_000");
    expect(parseYaml("0x")).toBe("0x");
    expect(parseYaml("1.2.3")).toBe("1.2.3");
  });

  test("rule 2: comments and document markers are handled", () => {
    const doc = parseYaml(`
# full-line comment
a: b # c
b: b#c
c: "x # y"
d: 'x # y'

# a comment between entries
e: 1
...
`) as Record<string, unknown>;

    expect(doc["a"]).toBe("b");
    expect(doc["b"]).toBe("b#c");
    expect(doc["c"]).toBe("x # y");
    expect(doc["d"]).toBe("x # y");
    expect(doc["e"]).toBe(1);
    // The parser stops at the first document marker, as this subset expects.
    expect(parseYaml("---\nkey: value\n...\n")).toEqual({ key: "value" });
  });

  test("rule 3: quoted strings decode escapes and refuse bad ones", () => {
    const doc = parseYaml(String.raw`
newline: "a\nb"
tab: "a\tb"
backslash: "a\\b"
double_quote: "a\"b"
slash: "a\/b"
nul: "a\0b"
hex: "\x41"
unicode_escape: "\u00e9"
literal_e_acute: "é"
emoji: "\U0001F600"
`) as Record<string, unknown>;

    expect(doc["newline"]).toBe("a\nb");
    expect(doc["tab"]).toBe("a\tb");
    expect(doc["backslash"]).toBe("a\\b");
    expect(doc["double_quote"]).toBe('a"b');
    expect(doc["slash"]).toBe("a/b");
    expect(doc["nul"]).toBe("a\0b");
    expect(doc["hex"]).toBe("A");
    expect(doc["unicode_escape"]).toBe("é");
    expect(doc["literal_e_acute"]).toBe("é");
    expect(doc["emoji"]).toBe("😀");

    expect(() => parseYaml('bad: "\\q"')).toThrow(YamlParseError);
    expect(() => parseYaml('bad: "\\xZZ"')).toThrow(YamlParseError);
    expect(() => parseYaml('bad: "\\U00110000"')).toThrow(YamlParseError);
    expect(() => parseYaml('bad: "abc')).toThrow(YamlParseError);

    const single = parseYaml(`
single_quote_escape: 'it''s'
literal_backslash: 'a\\nb'
`) as Record<string, unknown>;
    expect(single["single_quote_escape"]).toBe("it's");
    expect(single["literal_backslash"]).toBe("a\\nb");
    expect(() => parseYaml("bad: 'abc")).toThrow(YamlParseError);
  });

  test("rule 4: block scalars handle styles, chomping, and indentation", () => {
    const doc = parseYaml(`
literal_clip: |
  a
  b

literal_strip: |-
  a
  b

literal_keep: |+
  a
  b

folded_clip: >
  line one
  line two

folded_strip: >-
  line one
  line two

folded_keep: >+
  line one
  line two

explicit: |2
  a
  b
more_indented: >
  line one
    indented
  line two
empty: |
next: done
`) as Record<string, unknown>;

    expect(doc["literal_clip"]).toBe("a\nb\n");
    expect(doc["literal_strip"]).toBe("a\nb");
    expect(doc["literal_keep"]).toBe("a\nb\n\n");
    expect(doc["folded_clip"]).toBe("line one line two\n");
    expect(doc["folded_strip"]).toBe("line one line two");
    expect(doc["folded_keep"]).toBe("line one line two\n\n");
    expect(doc["explicit"]).toBe("a\nb\n");
    expect(doc["more_indented"]).toBe("line one\n  indented\nline two\n");
    expect(doc["empty"]).toBe("");
    expect(doc["next"]).toBe("done");
  });

  test("rule 5: block structure nests mappings and sequences", () => {
    expect(parseYaml("- a: 1\n  b: 2")).toEqual([{ a: 1, b: 2 }]);
    expect(parseYaml("- - x")).toEqual([["x"]]);
    expect(parseYaml("- - x\n  - y")).toEqual([["x", "y"]]);
    expect(parseYaml("zero:\n- one\n- two")).toEqual({ zero: ["one", "two"] });
    expect(parseYaml('"a:b": 1\n\'x:y\': 2')).toEqual({ "a:b": 1, "x:y": 2 });
    expect(parseYaml("key:\n  value")).toEqual({ key: "value" });

    const error = parseError("a: 1\nb");
    expect(error instanceof YamlParseError).toBe(true);
    expect(error.message.includes("Expected mapping key-value pair")).toBe(true);
  });

  test("rule 6: flow collections parse and refuse malformed input", () => {
    expect(parseYaml("empty_seq: []\nempty_map: {}")).toEqual({
      empty_seq: [],
      empty_map: {},
    });
    expect(parseYaml("nested: [1, [2, 3], {a: [4]}]")).toEqual({
      nested: [1, [2, 3], { a: [4] }],
    });
    expect(parseYaml("trailing: [1, 2,]")).toEqual({ trailing: [1, 2] });
    expect(parseYaml("multi: [\n  1,\n  2,\n]")).toEqual({ multi: [1, 2] });

    expect(() => parseYaml("bad: [1, 2")).toThrow(YamlParseError);
    expect(() => parseYaml("bad: {a: 1")).toThrow(YamlParseError);

    // YAML 1.2 allows a space inside a flow plain scalar; this subset keeps it as one item.
    expect(parseYaml("bad: [1 2]")).toEqual({ bad: ["1 2"] });
    expect(() => parseYaml("bad: {a: 1 b: 2}")).toThrow(YamlParseError);

    expect(() => parseYaml("bad: {a 1}")).toThrow(YamlParseError);
    expect(() => parseYaml("bad: [1] extra")).toThrow(YamlParseError);
  });

  test("rule 7: anchors, aliases, and merge keys work", () => {
    const copy = parseYaml(`
base: &base
  nested:
    value: 1
copy: *base
`) as Record<string, unknown>;
    const copied = copy["copy"] as { nested: { value: number } };
    copied.nested.value = 99;
    expect((copy["base"] as { nested: { value: number } }).nested.value).toBe(1);

    expect(() => parseYaml("bad: *missing")).toThrow(YamlParseError);
    expect(() => parseYaml("bad: [*missing]")).toThrow(YamlParseError);
    expect(() => parseYaml("bad: &")).toThrow(YamlParseError);
    expect(() => parseYaml("bad: *")).toThrow(YamlParseError);

    const merged = parseYaml(`
base: &base
  a: 1
  b: 2
derived:
  <<: *base
  b: 20
  c: 3
`) as Record<string, unknown>;
    expect(merged["derived"]).toEqual({ a: 1, b: 20, c: 3 });

    const mergedPair = parseYaml(`
a: &a {x: 1, y: 1}
b: &b {y: 2, z: 3}
out:
  <<: [*a, *b]
`) as Record<string, unknown>;
    expect(mergedPair["out"]).toEqual({ x: 1, y: 1, z: 3 });
  });

  test("rule 8: prototype-named keys stay own properties", () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const doc = parseYaml("__proto__: polluted\nconstructor: overwritten") as Record<
      string,
      unknown
    >;

    expect(Object.keys(doc)).toEqual(["__proto__", "constructor"]);
    expect(Object.prototype.hasOwnProperty.call(doc, "__proto__")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(doc, "constructor")).toBe(true);
    expect(Object.getPrototypeOf(doc)).toBe(Object.prototype);
    expect((doc as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
  });

  test("rule 9: YamlParseError carries the fault line and message prefix", () => {
    const error = parseError('first: 1\nsecond: ok\nthird: "\\q"');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof YamlParseError).toBe(true);
    expect(error.name).toBe("YamlParseError");
    expect(error.line).toBe(3);
    expect(error.message.startsWith("YAML parse error at line 3:")).toBe(true);
  });
});
