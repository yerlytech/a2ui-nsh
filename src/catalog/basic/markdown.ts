/**
 * A2UI v1.0 simple Markdown subset parser and sanitizer backed by
 * `nsh/base`'s native Rust `TextView.parse()`.
 *
 * Enforces the Basic Catalog v1 `Text` contract (`adapter/markdown_subset.yaml`):
 * - Supports simple formatting: headings, emphasis, strong, inline code,
 *   lists, blockquotes, code blocks, strikethrough, thematic rules.
 * - Disables raw HTML (`options: { html: false }`) so raw HTML stays literal text.
 * - Strips link targets (preserving visible link text) and images (preserving
 *   alt text) so no active links or image elements are emitted.
 */

import {
  TextView,
  type TextViewBlock,
  type TextViewDocument,
  type TextViewInline,
} from "nsh/base";

export type MarkdownFeature =
  | "emphasis"
  | "strong"
  | "heading"
  | "list_item"
  | "code"
  | "code_block"
  | "blockquote"
  | "strikethrough"
  | "rule";

export interface ParsedA2uiMarkdown {
  readonly document: TextViewDocument;
  readonly hasFormatting: boolean;
  readonly features: ReadonlySet<MarkdownFeature>;
  readonly visibleText: string;
}

function mergeAdjacentText(inlines: TextViewInline[]): TextViewInline[] {
  const out: TextViewInline[] = [];
  for (let i = 0; i < inlines.length; i += 1) {
    const node = inlines[i]!;
    if (
      node.type === "text" &&
      out.length > 0 &&
      out[out.length - 1]!.type === "text"
    ) {
      const prev = out[out.length - 1] as { type: "text"; text: string };
      out[out.length - 1] = { type: "text", text: prev.text + node.text };
    } else {
      out.push(node);
    }
  }
  return out;
}

function sanitizeInlines(
  inlines: readonly TextViewInline[],
  features: Set<MarkdownFeature>,
): TextViewInline[] {
  const out: TextViewInline[] = [];
  for (let i = 0; i < inlines.length; i += 1) {
    const node = inlines[i]!;
    switch (node.type) {
      case "text":
        if (node.text.length > 0) {
          out.push({ type: "text", text: node.text });
        }
        break;
      case "emphasis":
        features.add("emphasis");
        out.push({
          type: "emphasis",
          content: sanitizeInlines(node.content, features),
        });
        break;
      case "strong":
        features.add("strong");
        out.push({
          type: "strong",
          content: sanitizeInlines(node.content, features),
        });
        break;
      case "strikethrough":
        features.add("strikethrough");
        out.push({
          type: "strikethrough",
          content: sanitizeInlines(node.content, features),
        });
        break;
      case "code":
        features.add("code");
        out.push({ type: "code", code: node.code });
        break;
      case "break":
        out.push({ type: "break" });
        break;
      case "link":
        // A2UI simple Markdown subset: render link text without link target.
        out.push(...sanitizeInlines(node.content, features));
        break;
      case "image":
        // A2UI simple Markdown subset: do not render image; preserve alt text.
        if (node.alt && node.alt.length > 0) {
          out.push({ type: "text", text: node.alt });
        }
        break;
      case "underline":
      case "superscript":
      case "subscript":
      case "small":
      case "highlight":
        out.push(...sanitizeInlines(node.content, features));
        break;
      case "keyboard":
        if (node.text.length > 0) {
          out.push({ type: "text", text: node.text });
        }
        break;
      case "math":
        if (node.tex.length > 0) {
          out.push({ type: "text", text: node.tex });
        }
        break;
      case "footnoteReference":
        if (node.label.length > 0) {
          out.push({ type: "text", text: node.label });
        }
        break;
      case "custom":
        if (node.content && node.content.length > 0) {
          out.push(...sanitizeInlines(node.content, features));
        } else if (node.text && node.text.length > 0) {
          out.push({ type: "text", text: node.text });
        }
        break;
    }
  }
  return mergeAdjacentText(out);
}

function sanitizeBlocks(
  blocks: readonly TextViewBlock[],
  features: Set<MarkdownFeature>,
): TextViewBlock[] {
  const out: TextViewBlock[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    switch (block.type) {
      case "paragraph":
        out.push({
          type: "paragraph",
          content: sanitizeInlines(block.content, features),
        });
        break;
      case "heading":
        features.add("heading");
        out.push({
          type: "heading",
          level: block.level,
          content: sanitizeInlines(block.content, features),
        });
        break;
      case "blockquote":
        features.add("blockquote");
        out.push({
          type: "blockquote",
          children: sanitizeBlocks(block.children, features),
        });
        break;
      case "list": {
        if (block.items.length > 0) {
          features.add("list_item");
        }
        out.push({
          type: "list",
          ...(block.ordered !== undefined ? { ordered: block.ordered } : {}),
          ...(block.start !== undefined ? { start: block.start } : {}),
          ...(block.loose !== undefined ? { loose: block.loose } : {}),
          items: block.items.map((item) => ({
            children: sanitizeBlocks(item.children, features),
          })),
        });
        break;
      }
      case "codeBlock":
        features.add("code_block");
        out.push({
          type: "codeBlock",
          code: block.code,
          ...(block.language !== undefined ? { language: block.language } : {}),
        });
        break;
      case "table": {
        const rows = [block.head, ...(block.rows ?? [])];
        for (let r = 0; r < rows.length; r += 1) {
          const row = rows[r]!;
          const rowInlines: TextViewInline[] = [];
          for (let c = 0; c < row.length; c += 1) {
            if (c > 0) {
              rowInlines.push({ type: "text", text: " " });
            }
            rowInlines.push(...sanitizeInlines(row[c]!.content, features));
          }
          out.push({
            type: "paragraph",
            content: mergeAdjacentText(rowInlines),
          });
        }
        break;
      }
      case "details":
        out.push({
          type: "paragraph",
          content: sanitizeInlines(block.summary, features),
        });
        out.push(...sanitizeBlocks(block.children, features));
        break;
      case "custom":
        if (block.children && block.children.length > 0) {
          out.push(...sanitizeBlocks(block.children, features));
        } else if (block.content && block.content.length > 0) {
          out.push({
            type: "paragraph",
            content: sanitizeInlines(block.content, features),
          });
        } else if (block.text && block.text.length > 0) {
          out.push({
            type: "paragraph",
            content: [{ type: "text", text: block.text }],
          });
        }
        break;
      default: {
        // `TextViewBlock` in nsh also allows `{ type: "rule" }` or `{ type: "mathBlock" }`.
        const rawBlock = block as { type: string; tex?: string };
        if (rawBlock.type === "rule") {
          features.add("rule");
          out.push(block);
        } else if (rawBlock.type === "mathBlock" && rawBlock.tex) {
          out.push({
            type: "paragraph",
            content: [{ type: "text", text: rawBlock.tex }],
          });
        }
        break;
      }
    }
  }
  return out;
}

function collectInlineText(inlines: readonly TextViewInline[], parts: string[]): void {
  for (let i = 0; i < inlines.length; i += 1) {
    const node = inlines[i]!;
    switch (node.type) {
      case "text":
        parts.push(node.text);
        break;
      case "code":
        parts.push(node.code);
        break;
      case "break":
        parts.push("\n");
        break;
      case "emphasis":
      case "strong":
      case "strikethrough":
      case "underline":
      case "superscript":
      case "subscript":
      case "small":
      case "highlight":
      case "link":
        collectInlineText(node.content, parts);
        break;
      case "image":
        if (node.alt) {
          parts.push(node.alt);
        }
        break;
      case "keyboard":
        parts.push(node.text);
        break;
      case "math":
        parts.push(node.tex);
        break;
      case "footnoteReference":
        parts.push(node.label);
        break;
      case "custom":
        if (node.content) {
          collectInlineText(node.content, parts);
        } else if (node.text) {
          parts.push(node.text);
        }
        break;
    }
  }
}

function collectBlockText(blocks: readonly TextViewBlock[], segments: string[]): void {
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    switch (block.type) {
      case "paragraph":
      case "heading": {
        const buf: string[] = [];
        collectInlineText(block.content, buf);
        const text = buf.join("").trim();
        if (text.length > 0) {
          segments.push(text);
        }
        break;
      }
      case "blockquote":
        collectBlockText(block.children, segments);
        break;
      case "list":
        for (let j = 0; j < block.items.length; j += 1) {
          collectBlockText(block.items[j]!.children, segments);
        }
        break;
      case "codeBlock":
        if (block.code.trim().length > 0) {
          segments.push(block.code.trim());
        }
        break;
      default:
        break;
    }
  }
}

function isPlainSingleParagraph(blocks: readonly TextViewBlock[]): boolean {
  if (blocks.length !== 1) {
    return false;
  }
  const first = blocks[0]!;
  if (first.type !== "paragraph") {
    return false;
  }
  return first.content.every((inline) => inline.type === "text");
}

/**
 * Parses `source` through `nsh/base`'s `TextView.parse` with HTML, math, and
 * GitHub alerts disabled, then strips links and images to match A2UI v1.0's
 * simple Markdown subset.
 */
export function parseA2uiMarkdown(source: string): ParsedA2uiMarkdown {
  if (source.length === 0) {
    return {
      document: { blocks: [] },
      hasFormatting: false,
      features: new Set<MarkdownFeature>(),
      visibleText: "",
    };
  }

  const parsed = TextView.parse(source, {
    html: false,
    math: false,
    alerts: false,
    frontmatter: false,
    mdx: false,
    streaming: false,
  });

  const features = new Set<MarkdownFeature>();
  const blocks = sanitizeBlocks(parsed.blocks, features);
  const document: TextViewDocument = { blocks };

  const segments: string[] = [];
  collectBlockText(blocks, segments);
  const visibleText = segments.join(" ");
  const hasFormatting = features.size > 0 || !isPlainSingleParagraph(blocks);

  return {
    document,
    hasFormatting,
    features,
    visibleText,
  };
}
