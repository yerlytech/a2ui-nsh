import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const COMPONENTS = [
  { id: "root", component: "Form", submit: "sales.invoice.save", children: ["partner", "amount", "page"] },
  { id: "partner", component: "Field", field: "partner", label: "f.partner" },
  { id: "amount", component: "Field", field: "amount", label: "f.amount", input: "money" },
  {
    id: "page",
    component: "Preview",
    draft: ["amount", "partner"],
    about: "partner",
    action: "export:sales.invoice?shape=invoice",
    label: "sales.preview.invoice",
  },
];

const WORDS = {
  "sales.preview.invoice": "Invoice preview",
  "preview.drawing": "Drawing…",
  "preview.failed": "The preview could not be drawn",
  "preview.open": "Open",
};

interface Post {
  readonly name: string;
  readonly data?: unknown;
}

function previewAsks(app: { host: { posts(): Post[] } }): unknown[] {
  return app.host
    .posts()
    .filter((post) => post.name === "a2ui.preview")
    .map((post) => post.data);
}

describe("xlarge catalog Preview", () => {
  test("asks the host's preview with the named draft values once all are typed; sends no event", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_preview", COMPONENTS), WORDS, {
        previewBase: "https://example.test/preview/",
        previewPauseMs: 100,
        openLinks: true,
      }),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("label:Invoice preview")).toBe(true);
    // Nothing is typed: nothing is asked, the page is still to come.
    expect(previewAsks(app)).toEqual([]);
    expect(app.shows("id:s_preview:page:waiting")).toBe(true);
    // No accept button: xlarge's client has none.
    expect(app.shows("id:s_preview:page:accept")).toBe(false);

    await app.type("id:s_preview:amount", "25000.50");
    await app.wait(200);
    expect(previewAsks(app)).toEqual([]);
    // Typed key by key, it asks once, a moment after the last change.
    await app.type("id:s_preview:partner", "p1");
    await app.wait(200);
    expect(previewAsks(app)).toEqual([
      {
        action: "export:sales.invoice?shape=invoice",
        body: { draft: { amount: "25000.50", partner: "p1" }, about: "p1" },
      },
    ]);
    expect(app.shows("id:s_preview:page:page")).toBe(true);
    await app.press("id:s_preview:page:open");
    expect(app.host.posts().filter((post) => post.name === "a2ui.openUrl")).toEqual([
      {
        name: "a2ui.openUrl",
        data: { url: `https://example.test/preview/${encodeURIComponent("export:sales.invoice?shape=invoice")}` },
      },
    ]);
    // The export name is never sent as an A2UI event.
    expect(sentActions(app)).toEqual([]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("a refused preview says so; without the host option the named values are listed as typed", async () => {
    const refused = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_preview_no", COMPONENTS), WORDS, {
        previewBase: "https://example.test/preview/",
        previewPauseMs: 0,
        previewFails: true,
      }),
    );
    await refused.type("id:s_preview_no:amount", "1");
    await refused.type("id:s_preview_no:partner", "p1");
    await refused.wait(50);
    expect(refused.texts()).toContain("The preview could not be drawn");

    const listed = await open(HARNESS, harnessOptions(surfaceMessages("s_preview_list", COMPONENTS), WORDS));
    expect(reportedErrors(listed)).toEqual([]);
    expect(listed.shows("id:s_preview_list:page:line:amount")).toBe(true);
    await listed.type("id:s_preview_list:amount", "25000.50");
    expect(listed.texts()).toContain("25000.50");
    expect(listed.texts()).toContain("—");
    expect(sentActions(listed)).toEqual([]);
  });

  test("outside a Form it reads the screen's draft: a loose Field and an Arrange's list (captured layout)", async () => {
    // As xlarge's lab_reports.layout (captured 2026-11-24): no Form holds
    // the Preview; `draft` names the Arrange's `field`, `about` a loose Field.
    const blocks = [
      { kind: "header", label: "lab.block.header", shown: true },
      { kind: "table", label: "lab.block.table", shown: true, kept: true },
    ];
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_preview_screen",
          [
            { id: "root", component: "Card", children: ["blocks", "sample", "page"] },
            { id: "blocks", component: "Arrange", items: { "@path": "/layout/blocks" }, field: "blocks", save: "lab.arrange" },
            { id: "sample", component: "Field", field: "sample", label: "f.sample" },
            { id: "page", component: "Preview", draft: ["blocks"], about: "sample", action: "export:lab.report?shape=pdf" },
          ],
          { layout: { blocks } },
        ),
        WORDS,
        { previewBase: "https://example.test/preview/", previewPauseMs: 20 },
      ),
    );
    await app.wait(80);
    expect(previewAsks(app)).toEqual([{ action: "export:lab.report?shape=pdf", body: { draft: { blocks } } }]);
    await app.type("id:s_preview_screen:sample", "s1");
    await app.press("id:s_preview_screen:blocks:item:0:down");
    await app.wait(80);
    expect(previewAsks(app).at(-1)).toEqual({
      action: "export:lab.report?shape=pdf",
      body: { draft: { blocks: [blocks[1], blocks[0]] }, about: "s1" },
    });
    expect(sentActions(app)).toEqual([]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("two surfaces keep two screen drafts", async () => {
    const page = (surfaceId: string): unknown[] =>
      surfaceMessages(surfaceId, [
        { id: "root", component: "Card", children: ["note", "page"] },
        { id: "note", component: "Field", field: "note", label: "f.note" },
        { id: "page", component: "Preview", draft: ["note"] },
      ]);
    const app = await open(HARNESS, harnessOptions([...page("s_one"), ...page("s_two")], WORDS));
    await app.type("id:s_one:note", "first");
    expect(app.texts()).toContain("first");
    expect(app.value("id:s_two:note")).toBe("");
    expect(app.texts().filter((text) => text === "—")).toHaveLength(1);
    expect(reportedErrors(app)).toEqual([]);
  });
});
