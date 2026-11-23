import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "act.add": "Add a deal",
  "act.save": "Save deal",
  "act.show": "Show",
  "f.title": "Title",
  "f.state": "State",
};

describe("xlarge catalog Form", () => {
  test("refuses empty required fields with a message on each, then sends submit with context", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_form",
          [
            {
              id: "root",
              component: "Form",
              submit: "crm.open_deal",
              submitLabel: "act.save",
              context: { source: "desk" },
              children: ["title", "state"],
            },
            { id: "title", component: "Field", field: "title", input: "text", label: "f.title", checks: ["required"] },
            { id: "state", component: "Field", field: "state", input: "text", label: "f.state" },
          ],
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toContain("Title *");
    expect(app.shows("label:Save deal")).toBe(true);

    await app.press("id:s_form:root:submit");
    expect(sentActions(app)).toEqual([]);
    expect(app.shows("id:s_form:title:error")).toBe(true);
    expect(app.texts()).toContain("Required");
    expect(app.shows("id:s_form:state:error")).toBe(false);

    await app.type("id:s_form:title", "Fleet");
    expect(app.shows("id:s_form:title:error")).toBe(false);
    await app.press("id:s_form:root:submit");
    expect(sentActions(app)).toEqual([
      { name: "crm.open_deal", sourceComponentId: "root", context: { source: "desk", title: "Fleet" } },
    ]);
    // After a send the draft is empty again.
    expect(app.value("id:s_form:title")).toBe("");
  });

  test("a dialog form opens from its titled button, cancels without sending, and closes after a send", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_form_dlg", [
          { id: "root", component: "Form", dialog: true, title: "act.add", submit: "add", children: ["title"] },
          { id: "title", component: "Field", field: "title", input: "text", label: "f.title" },
        ]),
        WORDS,
      ),
    );
    expect(app.texts()).toEqual(["Add a deal"]);
    await app.press("label:Add a deal");
    expect(app.shows("id:s_form_dlg:root:body")).toBe(true);
    await app.type("id:s_form_dlg:title", "draft");
    await app.press("id:s_form_dlg:root:cancel");
    expect(app.shows("id:s_form_dlg:root:body")).toBe(false);
    expect(sentActions(app)).toEqual([]);

    await app.press("id:s_form_dlg:root:open");
    // Cancel forgot what was typed.
    expect(app.value("id:s_form_dlg:title")).toBe("");
    await app.type("id:s_form_dlg:title", "kept");
    await app.press("id:s_form_dlg:root:submit");
    expect(sentActions(app)).toEqual([
      { name: "add", sourceComponentId: "root", context: { title: "kept" } },
    ]);
    expect(app.shows("id:s_form_dlg:root:body")).toBe(false);
  });

  test("a filters form asks its table's searchAction with searchInput, defaults and typed values", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_form_filter", [
          { id: "root", component: "Card", children: ["filter", "table"] },
          { id: "filter", component: "Form", filters: "table", submitLabel: "act.show", children: ["state", "title"] },
          { id: "state", component: "Field", field: "state", input: "text", label: "f.state", default: "active" },
          { id: "title", component: "Field", field: "title", input: "text", label: "f.title" },
          {
            id: "table",
            component: "Table",
            columns: [{ field: "title", label: "f.title" }],
            rows: { "@path": "/rows" },
            searchAction: "deals.list",
            searchInput: { limit: 50, state: "all" },
          },
        ]),
        WORDS,
      ),
    );
    await app.press("label:Show");
    await app.type("id:s_form_filter:title", "fork");
    await app.press("label:Show");
    expect(sentActions(app)).toEqual([
      { name: "deals.list", sourceComponentId: "filter", context: { limit: 50, state: "active" } },
      { name: "deals.list", sourceComponentId: "filter", context: { limit: 50, state: "active", title: "fork" } },
    ]);
    // A filter keeps what it holds.
    expect(app.value("id:s_form_filter:title")).toBe("fork");
  });
});
