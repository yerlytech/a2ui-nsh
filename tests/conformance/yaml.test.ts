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
