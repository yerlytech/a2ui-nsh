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
  "crm.stage.won": "Won",
};

const ROWS = [
  { field: "title", label: "crm.field.title" },
  { field: "amount", label: "crm.field.amount", format: "money" },
  { field: "stage", label: "crm.field.stage", enumPrefix: "crm.stage." },
  { field: "note", label: "crm.field.note" },
];

describe("xlarge catalog Detail", () => {
  test("shows the record's labelled values and its update sends the edit action", async () => {
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
          { deal: { id: "deal-7", title: "Fleet", amount: "25000.5", stage: "won", note: "" } },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["Title", "Fleet", "Amount", "25,000.50", "Stage", "Won", "Edit"]);
    expect(app.shows("id:s_detail:root:row:note")).toBe(false);
    expect(app.shows("label:Amount: 25,000.50")).toBe(true);

    await app.press("id:s_detail:root:update");
    expect(sentActions(app)).toEqual([
      { name: "crm.deal.update", sourceComponentId: "root", context: { id: "deal-7" } },
    ]);
  });

  test("follows the data model; without skipEmpty empty rows stay; without update no button", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_detail_live",
          [{ id: "root", component: "Detail", record: { "@path": "/deal" }, rows: ROWS }],
          { deal: { title: "Fleet", amount: "10", stage: "won", note: "" } },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_detail_live:root:row:note")).toBe(true);
    expect(app.shows("id:s_detail_live:root:update")).toBe(false);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_detail_live", path: "/deal/amount", value: "12345.678" },
    });
    expect(app.texts()).toContain("12,345.678");
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
