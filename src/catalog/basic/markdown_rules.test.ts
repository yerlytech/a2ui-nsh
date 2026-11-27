import { describe, expect, test } from "nsh/test";
import { parseA2uiMarkdown } from "./markdown";

// One rule per test for src/catalog/basic/markdown.ts. The broad scenarios
// live in markdown.test.ts; this file pins each rule on its own.
//
// Every case goes through the exported parseA2uiMarkdown. The parser fixes
// html: false, math: false and passes no extensions, so HTML tags, formulas
// and extension containers arrive as literal text: the sanitizer branches
// for those node kinds are pinned by what the source becomes, not by a node.

describe("markdown rules", () => {
  // Each kept MarkdownFeature, by the smallest source that has it.
  test("reports emphasis alone from *a*", () => {
    const parsed = parseA2uiMarkdown("*a*");
    expect([...parsed.features]).toEqual(["emphasis"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("a");
  });

  test("reports strong alone from **a**", () => {
    const parsed = parseA2uiMarkdown("**a**");
    expect([...parsed.features]).toEqual(["strong"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("a");
  });

  test("reports heading alone from # A", () => {
    const parsed = parseA2uiMarkdown("# A");
    expect([...parsed.features]).toEqual(["heading"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("A");
  });

  test("reports list_item alone from - A", () => {
    const parsed = parseA2uiMarkdown("- A");
    expect([...parsed.features]).toEqual(["list_item"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("A");
  });

  test("reports code alone from inline code", () => {
    const parsed = parseA2uiMarkdown("`a`");
    expect([...parsed.features]).toEqual(["code"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("a");
  });

  test("reports code_block alone from a fenced block", () => {
    const parsed = parseA2uiMarkdown("```\nx\n```");
    expect([...parsed.features]).toEqual(["code_block"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("x");
  });

  test("reports blockquote alone from > a", () => {
    const parsed = parseA2uiMarkdown("> a");
    expect([...parsed.features]).toEqual(["blockquote"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("a");
  });

  test("reports strikethrough alone from ~~a~~", () => {
    const parsed = parseA2uiMarkdown("~~a~~");
    expect([...parsed.features]).toEqual(["strikethrough"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("a");
  });

  test("reports rule alone from ---", () => {
    const parsed = parseA2uiMarkdown("---");
    expect([...parsed.features]).toEqual(["rule"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("");
  });

  // Inline nodes the reader does not keep (markdown.ts:97-130).
  test("a link keeps its text and drops its URL", () => {
    const parsed = parseA2uiMarkdown("See [Docs](https://example.com) now");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("See Docs now");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "See Docs now" }],
        },
      ],
    });
    expect(JSON.stringify(parsed.document)).not.toContain(
      "https://example.com",
    );
    expect(JSON.stringify(parsed.document)).not.toContain("\"link\"");
  });

  test("an image keeps its alt text and drops its URL and node", () => {
    const parsed = parseA2uiMarkdown(
      "Look ![photo](https://example.com/p.png) here",
    );
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("Look photo here");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Look photo here" }],
        },
      ],
    });
    expect(JSON.stringify(parsed.document)).not.toContain(
      "https://example.com/p.png",
    );
    expect(JSON.stringify(parsed.document)).not.toContain("\"image\"");
  });

  test("underline markup stays literal text with no feature", () => {
    const parsed = parseA2uiMarkdown("<u>a</u>");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.document).toEqual({
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "<u>a</u>" }] },
      ],
    });
  });

  test("superscript markup stays literal text with no feature", () => {
    const parsed = parseA2uiMarkdown("<sup>a</sup>");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("<sup>a</sup>");
  });

  test("subscript markup stays literal text with no feature", () => {
    const parsed = parseA2uiMarkdown("<sub>a</sub>");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("<sub>a</sub>");
  });

  test("small markup stays literal text with no feature", () => {
    const parsed = parseA2uiMarkdown("<small>a</small>");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("<small>a</small>");
  });

  test("highlight markup stays literal text with no feature", () => {
    const parsed = parseA2uiMarkdown("<mark>a</mark>");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("<mark>a</mark>");
  });

  test("keyboard markup stays literal text with no feature", () => {
    const parsed = parseA2uiMarkdown("<kbd>a</kbd>");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("<kbd>a</kbd>");
  });

  test("inline math stays literal text with no feature", () => {
    const parsed = parseA2uiMarkdown("$a$");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("$a$");
  });

  test("a footnote reference keeps its label and drops the footnote body", () => {
    const parsed = parseA2uiMarkdown("Text[^1]\n\n[^1]: Note");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("Text1");
    expect(parsed.document).toEqual({
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "Text1" }] },
      ],
    });
  });

  test("an inline custom pattern stays literal text with no feature", () => {
    const parsed = parseA2uiMarkdown("Hi @alice");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("Hi @alice");
  });

  // Block nodes the reader flattens or drops (markdown.ts:193-245).
  test("a table becomes one paragraph per row with cells joined by one space", () => {
    const parsed = parseA2uiMarkdown("| a | b |\n| - | - |\n| c | d |");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("a b c d");
    expect(parsed.document).toEqual({
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "a b" }] },
        { type: "paragraph", content: [{ type: "text", text: "c d" }] },
      ],
    });
  });

  test("a table keeps inline formatting and reports its features", () => {
    const parsed = parseA2uiMarkdown("| **a** | b |\n| - | - |");
    expect([...parsed.features]).toEqual(["strong"]);
    expect(parsed.visibleText).toBe("a b");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [
            {
              type: "strong",
              content: [{ type: "text", text: "a" }],
            },
            { type: "text", text: " b" },
          ],
        },
      ],
    });
  });

  test("an HTML details block stays literal text while html is off", () => {
    const parsed = parseA2uiMarkdown("<details><summary>S</summary>B</details>");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("<details><summary>S</summary>B</details>");
  });

  test("a details container stays literal text", () => {
    const parsed = parseA2uiMarkdown("::: details Summary\nbody\n:::");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.visibleText).toBe("::: details Summary body :::");
  });

  test("a custom container stays literal text", () => {
    const parsed = parseA2uiMarkdown(":::note\nx\n:::");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.visibleText).toBe(":::note x :::");
  });

  test("a math block stays literal text with no feature", () => {
    const parsed = parseA2uiMarkdown("$$\na\n$$");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("$$ a $$");
    // differs from the doc: markdown.ts:234 says nsh allows
    // { type: "mathBlock" }, but TextViewBlock names the math block
    // { type: "math" } and options.math is false, so it stays literal text.
    expect(parsed.document).toEqual({
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "$$ a $$" }] },
      ],
    });
  });

  test("a raw HTML block stays literal text while html is off", () => {
    const parsed = parseA2uiMarkdown("<div>a</div>");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("<div>a</div>");
  });

  test("a footnote definition is dropped while its reference stays behind", () => {
    const parsed = parseA2uiMarkdown("a\n\n[^1]: note");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("a");
    expect(parsed.document).toEqual({
      blocks: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
    });
  });

  test("an alert with alerts off stays a blockquote with its marker as text", () => {
    const parsed = parseA2uiMarkdown("> [!NOTE]\n> hi");
    expect([...parsed.features]).toEqual(["blockquote"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("[!NOTE] hi");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "[!NOTE] hi" }],
            },
          ],
        },
      ],
    });
  });

  // mergeAdjacentText: text left side by side after a stripped node.
  test("two text runs left by a stripped link become one run", () => {
    const parsed = parseA2uiMarkdown(
      "before [link](https://example.com) after",
    );
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "before link after" }],
        },
      ],
    });
  });

  test("an image with no alt is dropped and its neighbours merge", () => {
    const parsed = parseA2uiMarkdown("a ![](u) b");
    expect(parsed.visibleText).toBe("a  b");
    expect(parsed.document).toEqual({
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "a  b" }] },
      ],
    });
  });

  test("an image alt becomes text and its neighbours merge", () => {
    const parsed = parseA2uiMarkdown("a ![alt](u) b");
    expect(parsed.visibleText).toBe("a alt b");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "a alt b" }],
        },
      ],
    });
  });

  test("a footnote reference label joins its neighbours", () => {
    const parsed = parseA2uiMarkdown("a[^1] b\n\n[^1]: note");
    expect(parsed.visibleText).toBe("a1 b");
    expect(parsed.document).toEqual({
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "a1 b" }] },
      ],
    });
  });

  // hasFormatting and isPlainSingleParagraph.
  test("plain text has no formatting", () => {
    const parsed = parseA2uiMarkdown("Hello world");
    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
  });

  test("a single plain paragraph, even across a soft break, has no formatting", () => {
    const parsed = parseA2uiMarkdown("one\ntwo");
    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("one two");
  });

  test("any feature marks formatting", () => {
    const parsed = parseA2uiMarkdown("*a*");
    expect(parsed.hasFormatting).toBe(true);
  });

  test("two plain paragraphs mark formatting", () => {
    const parsed = parseA2uiMarkdown("a\n\nb");
    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("a b");
  });

  test("a hard break marks formatting without a feature", () => {
    const parsed = parseA2uiMarkdown("a  \nb");
    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(true);
  });

  test("a table header alone is one plain paragraph and has no formatting", () => {
    const parsed = parseA2uiMarkdown("| a | b |\n| - | - |");
    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("a b");
  });

  // visibleText: the segments and their separator.
  test("paragraphs are joined with one space", () => {
    const parsed = parseA2uiMarkdown("a\n\nb");
    expect(parsed.visibleText).toBe("a b");
  });

  test("a heading and a paragraph are joined with one space", () => {
    const parsed = parseA2uiMarkdown("# A\n\nB");
    expect(parsed.visibleText).toBe("A B");
  });

  test("list items are joined with one space", () => {
    const parsed = parseA2uiMarkdown("- a\n- b");
    expect(parsed.visibleText).toBe("a b");
  });

  test("a code block keeps its text and joins its neighbours with one space", () => {
    const parsed = parseA2uiMarkdown("before\n\n```\nx\n```\n\nafter");
    expect(parsed.visibleText).toBe("before x after");
    expect(parsed.document.blocks[1]).toEqual({ type: "codeBlock", code: "x" });
  });

  test("inline code keeps its code text", () => {
    const parsed = parseA2uiMarkdown("Use `a2ui` now");
    expect(parsed.visibleText).toBe("Use a2ui now");
  });

  test("a hard break gives a newline inside the segment", () => {
    const parsed = parseA2uiMarkdown("a  \nb");
    expect(parsed.visibleText).toBe("a\nb");
  });

  test("a rule contributes no segment", () => {
    const parsed = parseA2uiMarkdown("a\n\n---\n\nb");
    expect(parsed.visibleText).toBe("a b");
  });

  test("the empty string gives empty text and no features", () => {
    const parsed = parseA2uiMarkdown("");
    expect([...parsed.features]).toEqual([]);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("");
    expect(parsed.document).toEqual({ blocks: [] });
  });
});
