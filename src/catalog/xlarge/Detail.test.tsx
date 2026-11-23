import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "crm.field.title": "Title",
  "crm.field.amount": "Amount",
  "crm.field.stage": "Stage",
  "crm.field.note": "Note",
  "crm.field.owner": "Owner",
  "crm.stage.won": "Won",
  "action.save": "Save",
};

const ROWS = [
  { field: "title", label: "crm.field.title", edit: { input: "text" } },
  { field: "amount", label: "crm.field.amount", format: "money", edit: { input: "money" } },
  { field: "stage", label: "crm.field.stage", enumPrefix: "crm.stage." },
  { field: "note", label: "crm.field.note", edit: { input: "note" } },
  { field: "owner", label: "crm.field.owner", edit: { input: "record", field: "owner_id" } },
  { field: "lost", label: "crm.field.lost" },
];

const DEAL = {
  id: "deal-7",
  version: 3,
  title: "Fleet",
  amount: "25000.5",
  stage: "won",
  note: "",
  owner: "Ada",
  owner_id: "u1",
  lost: "",
};

describe("xlarge catalog Detail", () => {
  test("a row with edit is corrected in place and saved through update", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_detail",
          [
            {
              id: "root",
              component: "Detail",
              record: { "@path": "/deal" },
              rows: ROWS,
              skipEmpty: true,
              update: "crm.deal.update",
            },
          ],
          { deal: DEAL },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    // skipEmpty leaves out the empty plain row but keeps the empty editable note.
    expect(app.texts()).toEqual([
      "Title", "Fleet", "Amount", "25,000.50", "Stage", "Won", "Note", "—", "Owner", "Ada",
    ]);
    expect(app.shows("id:s_detail:root:row:lost")).toBe(false);
    expect(app.shows("id:s_detail:root:update")).toBe(false);

    // A value left as it was sends nothing.
    await app.press("id:s_detail:root:value:title");
    expect(app.value("id:s_detail:root:edit:title")).toBe("Fleet");
    await app.press("id:s_detail:root:save:title");
    expect(app.shows("id:s_detail:root:edit:title")).toBe(false);
    // Cancel puts it back.
    await app.press("id:s_detail:root:value:amount");
    expect(app.value("id:s_detail:root:edit:amount")).toBe("25000.5");
    await app.type("id:s_detail:root:edit:amount", "1");
    await app.press("id:s_detail:root:cancel:amount");
    expect(app.texts()).toContain("25,000.50");
    expect(sentActions(app)).toEqual([]);
    // A corrected value goes out with the record's id and version.
    await app.press("id:s_detail:root:value:amount");
    expect(app.value("id:s_detail:root:edit:amount")).toBe("25000.5");
    await app.clear("id:s_detail:root:edit:amount");
    await app.type("id:s_detail:root:edit:amount", "26000.75");
    await app.press("id:s_detail:root:save:amount");
    // A value the action calls by another name starts from, and is sent as, that name.
    await app.press("id:s_detail:root:value:owner");
    expect(app.value("id:s_detail:root:edit:owner")).toBe("u1");
    await app.clear("id:s_detail:root:edit:owner");
    await app.type("id:s_detail:root:edit:owner", "u2");
    await app.press("id:s_detail:root:save:owner");
    // An emptied box clears the value.
    await app.press("id:s_detail:root:value:title");
    await app.clear("id:s_detail:root:edit:title");
    await app.press("id:s_detail:root:save:title");

    expect(sentActions(app)).toEqual([
      { name: "crm.deal.update", sourceComponentId: "root", context: { id: "deal-7", version: 3, amount: "26000.75" } },
      { name: "crm.deal.update", sourceComponentId: "root", context: { id: "deal-7", version: 3, owner_id: "u2" } },
      { name: "crm.deal.update", sourceComponentId: "root", context: { id: "deal-7", version: 3, title: null } },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("without update nothing is correctable; rows may be a data binding; it follows the data", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_detail_live",
          [{ id: "root", component: "Detail", record: { "@path": "/deal" }, rows: { "@path": "/rows" } }],
          { deal: DEAL, rows: ROWS.slice(0, 4) },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_detail_live:root:row:note")).toBe(true);
    expect(app.texts()).toEqual(["Title", "Fleet", "Amount", "25,000.50", "Stage", "Won", "Note", "—"]);
    // The value is plain text, not a button: nothing to press.
    expect(app.shows("id:s_detail_live:root:value:title")).toBe(true);
    expect(app.shows("id:s_detail_live:root:edit:title")).toBe(false);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_detail_live", path: "/deal/amount", value: "12345.678" },
    });
    expect(app.texts()).toContain("12,345.678");
    expect(sentActions(app)).toEqual([]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("without rows shows every plain value under its key", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_detail_all",
          [{ id: "root", component: "Detail", record: { "@path": "/p" } }],
          { p: { name: "Acme", city: "Izmir", tags: ["a"] } },
        ),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["name", "Acme", "city", "Izmir"]);
  });
});
