import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  announced,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "lab.block.header": "Header",
  "lab.block.results": "Results",
  "lab.block.note": "Note",
  "lab.action.add_note": "Add note",
};

// xlarge's lab-report layout blocks (`items = "/layout/blocks"`).
const BLOCKS = [
  { kind: "header", label: "lab.block.header", shown: true, kept: true },
  { kind: "results", label: "lab.block.results", shown: true, fields: ["value", "unit"] },
  { key: "note-1", kind: "note", label: "lab.block.note", shown: true, removable: true, text: "Fasting" },
];

const ARRANGE = {
  id: "root",
  component: "Arrange",
  items: { "@path": "/layout/blocks" },
  field: "blocks",
  version: { "@path": "/layout/version" },
  add: "note",
  addLabel: "lab.action.add_note",
  save: "lab.layout.save",
  reset: "lab.layout.reset",
  after: "lab.reports",
};

/** True when each of `words` shows in `texts`, in that order. */
function inOrder(texts: readonly string[], words: readonly string[]): boolean {
  const at = words.map((word) => texts.indexOf(word));
  return at.every((index, i) => index >= 0 && (i === 0 || index > at[i - 1]!));
}

describe("xlarge catalog Arrange", () => {
  test("shows labels, toggles, a remove button and a text box as each item says", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_ar", [ARRANGE], { layout: { blocks: BLOCKS, version: 4 } }), WORDS),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(inOrder(app.texts(), ["Header", "Results", "Note"])).toBe(true);
    expect(app.shows("label:Move up: Header")).toBe(true);
    // A kept item has no shown toggle; only a removable one has a remove button.
    expect(app.shows("id:s_ar:root:item:0:shown")).toBe(false);
    expect(app.shows("id:s_ar:root:item:1:shown")).toBe(true);
    expect(app.shows("label:Shown: Results")).toBe(true);
    expect(app.shows("id:s_ar:root:item:1:remove")).toBe(false);
    expect(app.shows("label:Remove: Note")).toBe(true);
    // Only an item with text has a text box.
    expect(app.shows("id:s_ar:root:item:1:text")).toBe(false);
    expect(app.value("id:s_ar:root:item:2:text")).toBe("Fasting");
    expect(app.shows("label:Add note")).toBe(true);

    expect(app.enabled("id:s_ar:root:item:0:up")).toBe(false);
    expect(app.enabled("id:s_ar:root:item:2:down")).toBe(false);
  });

  test("moves, toggles, edits, adds and removes, then saves under field with version and follows after", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_ar_save", [ARRANGE], { layout: { blocks: BLOCKS, version: 4 } }), WORDS),
    );
    await app.press("id:s_ar_save:root:item:2:up");
    expect(inOrder(app.texts(), ["Header", "Note", "Results"])).toBe(true);
    await app.press("id:s_ar_save:root:item:2:shown");
    await app.type("id:s_ar_save:root:item:1:text", " 12h");
    await app.press("id:s_ar_save:root:add");
    await app.press("id:s_ar_save:root:add");
    await app.press("id:s_ar_save:root:item:4:remove");
    // Without addItem the new item's label code is addLabel's.
    expect(announced(app)).toEqual([
      "Note moved to 2 of 3",
      "Add note moved to 4 of 4",
      "Add note moved to 5 of 5",
    ]);

    await app.press("id:s_ar_save:root:save");
    expect(sentActions(app)).toEqual([
      {
        name: "lab.layout.save",
        sourceComponentId: "root",
        context: {
          blocks: [
            BLOCKS[0],
            { ...BLOCKS[2], text: "Fasting 12h" },
            { ...BLOCKS[1], shown: false },
            { kind: "note", label: "lab.action.add_note", shown: true, removable: true, text: "" },
          ],
          version: 4,
        },
      },
      { name: "screen:lab.reports", sourceComponentId: "root", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("addItem names the new item's label; reset asks, restores and sends version", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_ar_reset",
          [{ ...ARRANGE, addItem: "lab.block.note", confirm: true, after: undefined }],
          { layout: { blocks: BLOCKS, version: "v9" } },
        ),
        WORDS,
      ),
    );
    await app.press("id:s_ar_reset:root:add");
    expect(app.texts().filter((t) => t === "Note")).toHaveLength(2);
    await app.press("id:s_ar_reset:root:item:0:down");
    expect(inOrder(app.texts(), ["Results", "Header"])).toBe(true);

    // confirm: cancel keeps the changes and sends nothing.
    await app.press("id:s_ar_reset:root:reset");
    expect(app.shows("id:s_ar_reset:root:ask")).toBe(true);
    await app.press("id:s_ar_reset:root:ask:cancel");
    expect(inOrder(app.texts(), ["Results", "Header"])).toBe(true);
    expect(sentActions(app)).toEqual([]);

    await app.press("id:s_ar_reset:root:reset");
    await app.press("id:s_ar_reset:root:ask:yes");
    expect(inOrder(app.texts(), ["Header", "Results", "Note"])).toBe(true);
    expect(app.texts().filter((t) => t === "Note")).toHaveLength(1);
    expect(sentActions(app)).toEqual([
      { name: "lab.layout.reset", sourceComponentId: "root", context: { version: "v9" } },
    ]);
  });

  test("new items from the data model replace the local list; without add there is no add button", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_ar_live",
          [{ id: "root", component: "Arrange", items: { "@path": "/rows" }, field: "blocks", save: "rows.order" }],
          { rows: [{ kind: "x" }, { kind: "y" }] },
        ),
      ),
    );
    await app.press("id:s_ar_live:root:item:0:down");
    expect(inOrder(app.texts(), ["y", "x"])).toBe(true);
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_ar_live", path: "/rows", value: [{ kind: "p" }, { kind: "q" }] },
    });
    expect(inOrder(app.texts(), ["p", "q"])).toBe(true);
    expect(app.shows("id:s_ar_live:root:add")).toBe(false);
    await app.press("id:s_ar_live:root:save");
    expect(sentActions(app)).toEqual([
      { name: "rows.order", sourceComponentId: "root", context: { blocks: [{ kind: "p" }, { kind: "q" }] } },
    ]);
  });

  test("its list, as it stands, is in the draft under field (what a Preview naming it reads)", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_ar_draft",
          [
            { id: "root", component: "Form", submit: "lab.keep", children: ["list", "page"] },
            { id: "list", component: "Arrange", items: { "@path": "/rows" }, field: "blocks", save: "rows.order" },
            { id: "page", component: "Preview", draft: ["blocks"], action: "export:lab.report?shape=pdf" },
          ],
          { rows: [{ kind: "x" }, { kind: "y" }] },
        ),
        {},
        { previewBase: "https://example.test/preview/", previewPauseMs: 20 },
      ),
    );
    await app.press("id:s_ar_draft:list:item:0:down");
    await app.wait(80);
    const asks = app.host.posts().filter((post) => post.name === "a2ui.preview").map((post) => post.data);
    expect(asks.at(-1)).toEqual({
      action: "export:lab.report?shape=pdf",
      body: { draft: { blocks: [{ kind: "y" }, { kind: "x" }] } },
    });
    // The list is not a Field: the Form does not send it.
    await app.press("id:s_ar_draft:root:submit");
    expect(sentActions(app)).toEqual([{ name: "lab.keep", sourceComponentId: "root", context: {} }]);
    expect(reportedErrors(app)).toEqual([]);
  });
});
