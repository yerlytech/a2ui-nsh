import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";
import { parseA2uiMarkdown } from "./markdown";
import { resolveTextTruncationStyle } from "./Text";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog Text", () => {
  test("parses A2UI simple Markdown subset (emphasis, strong, headings, lists, code) while disabling HTML, images, and links", () => {
    const emStrong = parseA2uiMarkdown("This is *italic* and **bold** text.");
    expect(emStrong.visibleText).toBe("This is italic and bold text.");
    expect(emStrong.features.has("emphasis")).toBe(true);
    expect(emStrong.features.has("strong")).toBe(true);
    expect(emStrong.hasFormatting).toBe(true);

    const headings = parseA2uiMarkdown("# Header 1\n## Header 2");
    expect(headings.visibleText).toBe("Header 1 Header 2");
    expect(headings.features.has("heading")).toBe(true);

    const lists = parseA2uiMarkdown("- Item 1\n- Item 2\n- Item 3");
    expect(lists.visibleText).toBe("Item 1 Item 2 Item 3");
    expect(lists.features.has("list_item")).toBe(true);

    const inlineCode = parseA2uiMarkdown("Use the `a2ui` command to start.");
    expect(inlineCode.visibleText).toBe("Use the a2ui command to start.");
    expect(inlineCode.features.has("code")).toBe(true);

    const rawHtml = parseA2uiMarkdown("Hello <span>world</span>");
    expect(rawHtml.visibleText).toBe("Hello <span>world</span>");
    expect(rawHtml.features.size).toBe(0);

    const imgSyntax = parseA2uiMarkdown(
      "Look at ![photo](https://example.com/pic.png)",
    );
    expect(imgSyntax.visibleText).toBe("Look at photo");
    expect(imgSyntax.features.size).toBe(0);

    const linkSyntax = parseA2uiMarkdown(
      "Visit [Documentation](https://example.com) for details.",
    );
    expect(linkSyntax.visibleText).toBe("Visit Documentation for details.");
    expect(linkSyntax.features.size).toBe(0);
  });

  test("renders body and caption variants and updates bound @path text with zero remounts", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_text",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { title: "Initial Title" },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["body_txt", "caption_txt"],
                  },
                  {
                    id: "body_txt",
                    component: "Text",
                    text: { "@path": "/title" },
                    variant: "body",
                    weight: 1,
                  },
                  {
                    id: "caption_txt",
                    component: "Text",
                    text: "Secondary caption",
                    variant: "caption",
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null },
      },
    });

    expect(app.texts()).toContain("Initial Title");
    expect(app.texts()).toContain("Secondary caption");
    const mountsBefore = app.host
      .posts()
      .filter((p) => p.name === "a2ui.mount").length;

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_text",
        path: "/title",
        value: "Updated Title",
      },
    });

    expect(app.texts()).toContain("Updated Title");
    expect(app.texts()).not.toContain("Initial Title");
    expect(
      app.host.posts().filter((p) => p.name === "a2ui.mount").length,
    ).toBe(mountsBefore);
  });

  test("renders Markdown subset through TextView without opening links or executing HTML", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_md",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["md_em", "md_heading", "md_list", "md_code", "md_html", "md_link", "md_img"],
                  },
                  {
                    id: "md_em",
                    component: "Text",
                    text: "This is *italic* and **bold** text.",
                  },
                  {
                    id: "md_heading",
                    component: "Text",
                    text: "# Header 1\n## Header 2",
                  },
                  {
                    id: "md_list",
                    component: "Text",
                    text: "- Item 1\n- Item 2",
                  },
                  {
                    id: "md_code",
                    component: "Text",
                    text: "Use the `a2ui` command.",
                  },
                  {
                    id: "md_html",
                    component: "Text",
                    text: "Hello <span>world</span>",
                  },
                  {
                    id: "md_link",
                    component: "Text",
                    text: "Visit [Documentation](https://example.com) now.",
                  },
                  {
                    id: "md_img",
                    component: "Text",
                    text: "Look at ![photo](https://example.com/pic.png)",
                  },
                ],
              },
            },
          ],
        },
      },
    });

    const joined = app.texts().join(" ");
    expect(joined).toContain("This is italic and bold text.");
    expect(joined).toContain("Header 1");
    expect(joined).toContain("Header 2");
    expect(joined).toContain("Item 1");
    expect(joined).toContain("Item 2");
    expect(joined).toContain("Use the a2ui command.");
    expect(joined).toContain("Hello <span>world</span>");
    expect(joined).toContain("Visit Documentation now.");
    expect(joined).toContain("Look at photo");
    expect(app.openedUrls()).toEqual([]);
  });

  test("applies @accessibility label, description, live regions, and reactive hidden overrides", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_a11y",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  alertLabel: "Critical Alert",
                  isHidden: false,
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["alert_text", "polite_text"],
                  },
                  {
                    id: "alert_text",
                    component: "Text",
                    text: "Connection Lost!",
                    "@accessibility": {
                      label: { "@path": "/alertLabel" },
                      description: "Reconnect to continue",
                      live: "assertive",
                      hidden: { "@path": "/isHidden" },
                    },
                  },
                  {
                    id: "polite_text",
                    component: "Text",
                    text: "Status: **Active**",
                    "@accessibility": {
                      label: "Live Status",
                      live: "polite",
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("label:Critical Alert")).toBe(true);
    expect(app.shows("role:alert")).toBe(true);
    expect(app.shows("label:Live Status")).toBe(true);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_a11y",
        path: "/alertLabel",
        value: "Restored Alert",
      },
    });
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_a11y",
        path: "/isHidden",
        value: true,
      },
    });

    const a11ySnapshots = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "alert_text",
      )
      .map((p) => (p.data as { snapshot: Record<string, unknown> }).snapshot);

    expect(a11ySnapshots.length).toBeGreaterThanOrEqual(2);
    expect(a11ySnapshots[a11ySnapshots.length - 1]).toEqual({
      label: "Restored Alert",
      description: "Reconnect to continue",
      live: "assertive",
      hidden: true,
      role: "alert",
    });
  });

  test("resolves optional @metadata.extensions truncation styles cleanly without strict-mode errors", async () => {
    expect(resolveTextTruncationStyle(undefined)).toEqual({});
    expect(
      resolveTextTruncationStyle({
        extensions: {
          nsh_numberOfLines: 1,
          nsh_textOverflow: "ellipsis",
        },
      }),
    ).toEqual({
      numberOfLines: 1,
      textOverflow: "ellipsis",
    });
    expect(
      resolveTextTruncationStyle({
        extensions: {
          nsh_numberOfLines: 0,
          nsh_textOverflow: "invalid-mode",
        },
      }),
    ).toEqual({});

    const app = await open(HARNESS, {
      width: 240,
      height: 160,
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_trunc",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["email_txt"],
                  },
                  {
                    id: "email_txt",
                    component: "Text",
                    variant: "caption",
                    text: "billing@cedarridge.example",
                    "@metadata": {
                      extensions: {
                        nsh_numberOfLines: 1,
                        nsh_textOverflow: "ellipsis",
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.error": null },
      },
    });

    expect(app.shows("text:billing@cedarridge.example")).toBe(true);
    expect(app.host.posts().filter((p) => p.name === "a2ui.error")).toEqual([]);
  });
});
