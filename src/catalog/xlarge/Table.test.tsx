import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const COLUMNS = [
  { field: "title", label: "col.title", grow: true },
  { field: "state", label: "col.state", enumPrefix: "state." },
  { field: "amount", label: "col.amount", format: "money" },
  { field: "on", label: "col.on", format: "date" },
];

const WORDS = {
  "col.title": "Title",
  "col.state": "State",
  "col.amount": "Amount",
  "col.on": "On",
  "state.won": "Won",
  "list.title": "Deals list",
};

const ROWS = [
  { id: "r1", title: "First", state: "won", amount: "1200.5", on: "2026-01-02T10:00:00Z" },
  { id: "r2", title: "Second", state: "won", amount: "7", on: null },
];

describe("xlarge catalog Table", () => {
  test("draws headers and formatted rows bound by @path, and follows data updates", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_tbl",
          [{ id: "root", component: "Table", title: "list.title", columns: COLUMNS, rows: { "@path": "/rows" } }],
          { rows: ROWS },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual([
      "Deals list",
      "Title", "State", "Amount", "On",
      "First", "Won", "1,200.50", "2026-01-02",
      "Second", "Won", "7.00", "",
    ]);
    // Without rowAction a row is not a button.
    expect(app.shows("label:First")).toBe(false);
    expect(app.shows("id:s_tbl:root:search")).toBe(false);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_tbl", path: "/rows", value: [] },
    });
    expect(app.texts()).not.toContain("First");
    expect(app.shows("id:s_tbl:root:empty")).toBe(true);
  });

  test("a list of codes under `enumPrefix` is translated entry by entry", async () => {
    // As xlarge's audit history sends it: `changed`, `format = "list"`, `enumPrefix = ""`.
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_tbl_list",
          [
            {
              id: "root",
              component: "Table",
              columns: [{ enumPrefix: "", field: "changed", format: "list", grow: true, label: "audit.field.changed" }],
              rows: { "@path": "/history" },
            },
          ],
          { history: [{ id: "h1", changed: ["field.amount", "field.stage"] }, { id: "h2", changed: [] }] },
        ),
        { "audit.field.changed": "Changed", "field.amount": "Amount", "field.stage": "Stage" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["Changed", "Amount, Stage", ""]);
  });

  test("a row press sends rowAction (or rowOpens) with the row id", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_tbl_act",
          [{ id: "root", component: "Table", columns: COLUMNS, rows: { "@path": "/rows" }, rowOpens: "screen:deal" }],
          { rows: ROWS },
        ),
        WORDS,
      ),
    );
    await app.press("label:Second");
    await app.press("id:s_tbl_act:root:row:id:r1");
    expect(sentActions(app)).toEqual([
      { name: "screen:deal", sourceComponentId: "root", context: { id: "r2" } },
      { name: "screen:deal", sourceComponentId: "root", context: { id: "r1" } },
    ]);
  });

  test("search sends searchAction with searchInput and the trimmed query; an empty query is left out", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_tbl_search", [
          {
            id: "root",
            component: "Table",
            columns: COLUMNS,
            rows: { "@path": "/rows" },
            search: true,
            searchAction: "deals.list",
            searchInput: { limit: 20 },
          },
        ]),
      ),
    );
    await app.type("id:s_tbl_search:root:search", "  acme  \n");
    await app.clear("id:s_tbl_search:root:search");
    await app.type("id:s_tbl_search:root:search", "\n");
    expect(sentActions(app)).toEqual([
      { name: "deals.list", sourceComponentId: "root", context: { limit: 20, query: "acme" } },
      { name: "deals.list", sourceComponentId: "root", context: { limit: 20 } },
    ]);
  });
});
