import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "ar.new": "New column",
  "ar.add": "Add column",
};

const COLUMNS = [
  { key: "a", label: "Alpha" },
  { key: "b", label: "Beta" },
  { key: "c", label: "Gamma" },
];

/** True when each of `words` shows in `texts`, in that order. */
function inOrder(texts: readonly string[], words: readonly string[]): boolean {
  const at = words.map((word) => texts.indexOf(word));
  return at.every((index, i) => index >= 0 && (i === 0 || index > at[i - 1]!));
}

describe("xlarge catalog Arrange", () => {
  test("moves items up and down, adds one, and saves the new order with version", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_ar",
          [
            {
              id: "root",
              component: "Arrange",
              items: { "@path": "/cols" },
              field: "label",
              add: "ar.new",
              addLabel: "ar.add",
              addItem: "label",
              save: "cols.order",
              version: { "@path": "/v" },
            },
          ],
          { cols: COLUMNS, v: 3 },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(inOrder(app.texts(), ["Alpha", "Beta", "Gamma"])).toBe(true);
    expect(app.shows("label:Move up: Alpha")).toBe(true);
    expect(app.shows("label:Add column")).toBe(true);

    // The first item cannot go up nor the last down; nothing to reset yet.
    expect(app.enabled("id:s_ar:root:item:0:up")).toBe(false);
    expect(app.enabled("id:s_ar:root:item:2:down")).toBe(false);
    expect(app.enabled("id:s_ar:root:reset")).toBe(false);

    await app.press("id:s_ar:root:item:2:up");
    expect(inOrder(app.texts(), ["Alpha", "Gamma", "Beta"])).toBe(true);
    await app.press("id:s_ar:root:item:0:down");
    expect(inOrder(app.texts(), ["Gamma", "Alpha", "Beta"])).toBe(true);

    // A blank name adds nothing.
    await app.press("id:s_ar:root:add");
    await app.type("id:s_ar:root:new", "  Delta ");
    await app.press("id:s_ar:root:add");
    expect(app.value("id:s_ar:root:new")).toBe("");
    expect(inOrder(app.texts(), ["Gamma", "Alpha", "Beta", "Delta"])).toBe(true);

    await app.press("id:s_ar:root:save");
    expect(sentActions(app)).toEqual([
      {
        name: "cols.order",
        sourceComponentId: "root",
        context: {
          items: [COLUMNS[2], COLUMNS[0], COLUMNS[1], { label: "Delta" }],
          version: 3,
        },
      },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("reset restores the data model's order and, with reset, asks the server to", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_ar_reset",
          [
            {
              id: "root",
              component: "Arrange",
              items: { "@path": "/names" },
              save: "names.order",
              reset: "names.reset",
              confirm: true,
              version: { "@path": "/v" },
            },
          ],
          { names: ["one", "two"], v: "v9" },
        ),
      ),
    );
    await app.press("id:s_ar_reset:root:item:0:down");
    expect(inOrder(app.texts(), ["two", "one"])).toBe(true);

    // confirm: the reset asks; cancel keeps the new order and sends nothing.
    await app.press("id:s_ar_reset:root:reset");
    expect(app.shows("id:s_ar_reset:root:ask")).toBe(true);
    await app.press("id:s_ar_reset:root:ask:cancel");
    expect(inOrder(app.texts(), ["two", "one"])).toBe(true);
    expect(sentActions(app)).toEqual([]);

    await app.press("id:s_ar_reset:root:reset");
    await app.press("id:s_ar_reset:root:ask:yes");
    expect(inOrder(app.texts(), ["one", "two"])).toBe(true);
    expect(sentActions(app)).toEqual([
      { name: "names.reset", sourceComponentId: "root", context: { version: "v9" } },
    ]);
  });

  test("new items from the data model replace the local order; without add there is no text box", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_ar_live",
          [{ id: "root", component: "Arrange", items: { "@path": "/rows" }, field: "t", save: "rows.order" }],
          { rows: [{ t: "x" }, { t: "y" }] },
        ),
      ),
    );
    await app.press("id:s_ar_live:root:item:0:down");
    expect(inOrder(app.texts(), ["y", "x"])).toBe(true);
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_ar_live", path: "/rows", value: [{ t: "p" }, { t: "q" }] },
    });
    expect(inOrder(app.texts(), ["p", "q"])).toBe(true);
    expect(app.shows("id:s_ar_live:root:new")).toBe(false);
    await app.press("id:s_ar_live:root:save");
    expect(sentActions(app)).toEqual([
      { name: "rows.order", sourceComponentId: "root", context: { items: [{ t: "p" }, { t: "q" }] } },
    ]);
  });
});
