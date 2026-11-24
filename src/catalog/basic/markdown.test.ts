import { describe, expect, test } from "nsh/test";
import { parseA2uiMarkdown } from "./markdown";

describe("parseA2uiMarkdown", () => {
  test("reports emphasis alone", () => {
    const parsed = parseA2uiMarkdown("*italic*");

    expect([...parsed.features]).toEqual(["emphasis"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("italic");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [
            {
              type: "emphasis",
              content: [{ type: "text", text: "italic" }],
            },
          ],
        },
      ],
    });
  });

  test("reports strong alone", () => {
    const parsed = parseA2uiMarkdown("**bold**");

    expect([...parsed.features]).toEqual(["strong"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("bold");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [
            {
              type: "strong",
              content: [{ type: "text", text: "bold" }],
            },
          ],
        },
      ],
    });
  });

  test("keeps a level 1 heading", () => {
    const parsed = parseA2uiMarkdown("# Title");

    expect([...parsed.features]).toEqual(["heading"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("Title");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "heading",
          level: 1,
          content: [{ type: "text", text: "Title" }],
        },
      ],
    });
  });

  test("keeps a level 3 heading", () => {
    const parsed = parseA2uiMarkdown("### Title");

    expect([...parsed.features]).toEqual(["heading"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("Title");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "heading",
          level: 3,
          content: [{ type: "text", text: "Title" }],
        },
      ],
    });
  });

  test("keeps a bulleted list", () => {
    const parsed = parseA2uiMarkdown("- One\n- Two");

    expect([...parsed.features]).toEqual(["list_item"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("One Two");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "list",
          ordered: false,
          start: 1,
          loose: false,
          items: [
            {
              children: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "One" }],
                },
              ],
            },
            {
              children: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Two" }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  test("keeps a numbered list", () => {
    const parsed = parseA2uiMarkdown("1. One\n2. Two");

    expect([...parsed.features]).toEqual(["list_item"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("One Two");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "list",
          ordered: true,
          start: 1,
          loose: false,
          items: [
            {
              children: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "One" }],
                },
              ],
            },
            {
              children: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Two" }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  test("keeps inline code", () => {
    const parsed = parseA2uiMarkdown("Use `a2ui` now");

    expect([...parsed.features]).toEqual(["code"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("Use a2ui now");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Use " },
            { type: "code", code: "a2ui" },
            { type: "text", text: " now" },
          ],
        },
      ],
    });
  });

  test("keeps a fenced code block and its language", () => {
    const parsed = parseA2uiMarkdown("```ts\nconst x = 1;\n```");

    expect([...parsed.features]).toEqual(["code_block"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("const x = 1;");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "codeBlock",
          code: "const x = 1;",
          language: "ts",
        },
      ],
    });
  });

  test("keeps a blockquote", () => {
    const parsed = parseA2uiMarkdown("> quoted");

    expect([...parsed.features]).toEqual(["blockquote"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("quoted");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "quoted" }],
            },
          ],
        },
      ],
    });
  });

  test("keeps strikethrough", () => {
    const parsed = parseA2uiMarkdown("~~gone~~");

    expect([...parsed.features]).toEqual(["strikethrough"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("gone");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [
            {
              type: "strikethrough",
              content: [{ type: "text", text: "gone" }],
            },
          ],
        },
      ],
    });
  });

  test("keeps a thematic rule", () => {
    const parsed = parseA2uiMarkdown("---");

    expect([...parsed.features]).toEqual(["rule"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("");
    expect(parsed.document).toEqual({ blocks: [{ type: "rule" }] });
  });

  test("leaves plain text unformatted", () => {
    const parsed = parseA2uiMarkdown("Hello world");

    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("Hello world");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    });
  });

  test("treats the empty string as an empty unformatted document", () => {
    const parsed = parseA2uiMarkdown("");

    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("");
    expect(parsed.document).toEqual({ blocks: [] });
  });

  test("keeps raw HTML as literal text", () => {
    const source = "Hello <span>world</span>";
    const parsed = parseA2uiMarkdown(source);

    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe(source);
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: source }],
        },
      ],
    });
  });

  test("strips a link target and keeps its visible text", () => {
    const parsed = parseA2uiMarkdown(
      "Visit [Docs](https://example.com) now",
    );

    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("Visit Docs now");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Visit Docs now" }],
        },
      ],
    });
    const json = JSON.stringify(parsed.document);
    expect(json).not.toContain("https://example.com");
    expect(json).not.toContain("\"link\"");
  });

  test("keeps image alt text and emits no image node", () => {
    const parsed = parseA2uiMarkdown(
      "Look ![photo](https://example.com/p.png)",
    );

    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("Look photo");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Look photo" }],
        },
      ],
    });
    const json = JSON.stringify(parsed.document);
    expect(json).not.toContain("https://example.com");
    expect(json).not.toContain("\"image\"");
  });

  test("strips a link inside emphasis and keeps the emphasis", () => {
    const parsed = parseA2uiMarkdown("*[Docs](https://example.com)*");

    expect([...parsed.features]).toEqual(["emphasis"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("Docs");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [
            {
              type: "emphasis",
              content: [{ type: "text", text: "Docs" }],
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(parsed.document)).not.toContain(
      "https://example.com",
    );
  });

  test("treats a bare URL as literal text", () => {
    const source = "See https://example.com now";
    const parsed = parseA2uiMarkdown(source);

    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe(source);
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: source }],
        },
      ],
    });
    expect(JSON.stringify(parsed.document)).not.toContain("\"link\"");
  });

  test("treats an angle-bracket autolink as literal text", () => {
    const parsed = parseA2uiMarkdown("See <https://example.com> now");

    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("See https://example.com now");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "See https://example.com now" }],
        },
      ],
    });
    expect(JSON.stringify(parsed.document)).not.toContain("\"link\"");
  });

  test("merges text runs around a stripped link into one node", () => {
    const parsed = parseA2uiMarkdown(
      "before [link](https://example.com) after",
    );
    const blocks = parsed.document.blocks;

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "before link after" }],
    });
  });

  test("reports the exact feature set of mixed input", () => {
    const parsed = parseA2uiMarkdown(
      "# Title\n\n- **bold** item\n\n```\ncode\n```",
    );

    expect([...parsed.features].sort()).toEqual([
      "code_block",
      "heading",
      "list_item",
      "strong",
    ]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("Title bold item code");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "heading",
          level: 1,
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "list",
          ordered: false,
          start: 1,
          loose: false,
          items: [
            {
              children: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "strong",
                      content: [{ type: "text", text: "bold" }],
                    },
                    { type: "text", text: " item" },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "codeBlock",
          code: "code",
        },
      ],
    });
  });

  test("keeps nested emphasis inside strong", () => {
    const parsed = parseA2uiMarkdown("**bold and *italic***");

    expect([...parsed.features]).toEqual(["strong", "emphasis"]);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("bold and italic");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [
            {
              type: "strong",
              content: [
                { type: "text", text: "bold and " },
                {
                  type: "emphasis",
                  content: [{ type: "text", text: "italic" }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  test("keeps a hard break and counts it as formatting", () => {
    const parsed = parseA2uiMarkdown("one  \ntwo");

    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(true);
    expect(parsed.visibleText).toBe("one\ntwo");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "one" },
            { type: "break" },
            { type: "text", text: "two" },
          ],
        },
      ],
    });
  });

  test("folds a soft line break into one plain text node", () => {
    const parsed = parseA2uiMarkdown("one\ntwo");

    expect(parsed.features.size).toBe(0);
    expect(parsed.hasFormatting).toBe(false);
    expect(parsed.visibleText).toBe("one two");
    expect(parsed.document).toEqual({
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "one two" }],
        },
      ],
    });
  });
});
