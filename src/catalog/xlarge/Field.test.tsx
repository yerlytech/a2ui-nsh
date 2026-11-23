import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "f.name": "Name",
  "f.amount": "Amount",
  "f.due": "Due",
  "f.state": "State",
  "f.owner": "Owner",
  "f.note": "Note",
  "f.at": "At",
  "ex.name": "e.g. Forklift fleet",
  "st.open": "Open",
  "st.closed": "Closed",
};

function fieldForm(surfaceId: string, fields: Record<string, unknown>[], data: Record<string, unknown> = {}) {
  return surfaceMessages(
    surfaceId,
    [
      { id: "root", component: "Form", submit: "save", submitLabel: "Save", children: fields.map((f) => f["id"]) },
      ...fields,
    ],
    data,
  );
}

describe("xlarge catalog Field", () => {
  test("text, number (money), note and datetime inputs type into the form's draft", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        fieldForm("s_fld", [
          { id: "name", component: "Field", field: "name", input: "text", label: "f.name", example: "ex.name" },
          { id: "amount", component: "Field", field: "amount", input: "money", label: "f.amount" },
          { id: "note", component: "Field", field: "note", input: "note", label: "f.note" },
          { id: "at", component: "Field", field: "at", input: "datetime", label: "f.at" },
        ]),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["Name", "Amount", "Note", "At", "Save"]);
    expect(app.shows("label:Name")).toBe(true);

    await app.type("text:e.g. Forklift fleet", "Fleet");
    await app.type("id:s_fld:amount", "1250.75");
    await app.type("id:s_fld:note", "line one");
    await app.type("text:YYYY-MM-DDTHH:MM", "2026-12-01T09:30");
    expect(app.value("id:s_fld:name")).toBe("Fleet");
    expect(app.value("id:s_fld:amount")).toBe("1250.75");

    await app.press("id:s_fld:root:submit");
    expect(sentActions(app)).toEqual([
      {
        name: "save",
        sourceComponentId: "root",
        // An amount goes out as the string typed, never a float.
        context: { name: "Fleet", amount: "1250.75", note: "line one", at: "2026-12-01T09:30" },
      },
    ]);
  });

  test("choice translates options through optionPrefix and starts at its default", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        fieldForm("s_fld_choice", [
          {
            id: "state",
            component: "Field",
            field: "state",
            input: "choice",
            label: "f.state",
            options: ["open", "closed"],
            optionPrefix: "st.",
            default: "open",
          },
        ]),
        WORDS,
      ),
    );
    expect(app.texts()).toContain("Open");
    await app.press("id:s_fld_choice:state:trigger");
    await app.press("text:Closed");
    await app.press("id:s_fld_choice:root:submit");
    expect(sentActions(app)).toEqual([
      { name: "save", sourceComponentId: "root", context: { state: "closed" } },
    ]);
  });

  test("record options come from the rows under /<from> and follow data updates", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        fieldForm(
          "s_fld_rec",
          [
            {
              id: "owner",
              component: "Field",
              field: "owner",
              input: "record",
              label: "f.owner",
              from: "users.list",
              value: "id",
              show: "name",
            },
          ],
          { "users.list": [{ id: "u1", name: "Ada" }] },
        ),
        WORDS,
      ),
    );
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_fld_rec",
        path: "/users.list",
        value: [
          { id: "u1", name: "Ada" },
          { id: "u2", name: "Grace" },
        ],
      },
    });
    await app.press("id:s_fld_rec:owner:trigger");
    await app.press("text:Grace");
    expect(app.texts()).toContain("Grace");
    await app.press("id:s_fld_rec:root:submit");
    expect(sentActions(app)).toEqual([
      { name: "save", sourceComponentId: "root", context: { owner: "u2" } },
    ]);
  });

  test("a date field shows its default day and sends it", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        fieldForm(
          "s_fld_date",
          [{ id: "due", component: "Field", field: "due", input: "date", label: "f.due", default: { "@path": "/today" } }],
          { today: "2026-11-23" },
        ),
        WORDS,
      ),
    );
    expect(app.shows("id:s_fld_date:due:trigger")).toBe(true);
    expect(app.texts()).toContain("2026-11-23");
    await app.press("id:s_fld_date:root:submit");
    expect(sentActions(app)).toEqual([
      { name: "save", sourceComponentId: "root", context: { due: "2026-11-23" } },
    ]);
  });

  test("an unknown input draws as text; a field outside a form still takes typing", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_fld_alone", [
          { id: "root", component: "Card", children: ["code"] },
          { id: "code", component: "Field", field: "code", input: "barcode", label: "f.name" },
        ]),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    await app.type("id:s_fld_alone:code", "ABC-1");
    expect(app.value("id:s_fld_alone:code")).toBe("ABC-1");
  });
});
