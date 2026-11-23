import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "w.send": "Send it",
  "f.title": "Title",
  "f.note": "Note",
  "f.amount": "Amount",
};

function wizardMessages(surfaceId: string, wizard: Record<string, unknown>): unknown[] {
  return surfaceMessages(surfaceId, [
    { id: "root", component: "Wizard", children: ["one", "two", "three"], ...wizard },
    { id: "one", component: "Field", field: "title", input: "text", label: "f.title", checks: ["required"] },
    { id: "two", component: "Field", field: "note", input: "note", label: "f.note" },
    { id: "three", component: "Field", field: "amount", input: "money", label: "f.amount", checks: ["required"] },
  ]);
}

describe("xlarge catalog Wizard", () => {
  test("shows one page at a time, refuses an incomplete page, and keeps the draft across pages", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(wizardMessages("s_wiz", { submit: "deal.open", submitLabel: "w.send" }), WORDS),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toContain("1 / 3");
    expect(app.shows("id:s_wiz:one")).toBe(true);
    expect(app.shows("id:s_wiz:two")).toBe(false);
    expect(app.shows("id:s_wiz:root:back")).toBe(false);

    await app.press("id:s_wiz:root:next");
    expect(app.shows("id:s_wiz:one:error")).toBe(true);
    expect(app.texts()).toContain("1 / 3");

    await app.type("id:s_wiz:one", "Fleet");
    await app.press("id:s_wiz:root:next");
    expect(app.texts()).toContain("2 / 3");
    expect(app.shows("id:s_wiz:one")).toBe(false);
    // An optional page moves on empty.
    await app.press("id:s_wiz:root:next");
    expect(app.texts()).toContain("3 / 3");
    expect(app.texts()).toContain("Send it");
    expect(app.texts()).not.toContain("Next");

    await app.press("id:s_wiz:root:back");
    await app.press("id:s_wiz:root:back");
    expect(app.value("id:s_wiz:one")).toBe("Fleet");
    await app.press("id:s_wiz:root:next");
    await app.press("id:s_wiz:root:next");
    await app.press("id:s_wiz:root:next");
    expect(sentActions(app)).toEqual([]);
    expect(app.shows("id:s_wiz:three:error")).toBe(true);

    await app.type("id:s_wiz:three", "1250.05");
    await app.press("id:s_wiz:root:next");
    expect(sentActions(app)).toEqual([
      { name: "deal.open", sourceComponentId: "root", context: { title: "Fleet", amount: "1250.05" } },
    ]);
    // After a send the draft is empty and page one shows again.
    expect(app.texts()).toContain("1 / 3");
    expect(app.value("id:s_wiz:one")).toBe("");
    expect(reportedErrors(app)).toEqual([]);
  });

  test("with confirm it asks before sending; with after it opens that screen", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_wiz_ask", [
          { id: "root", component: "Wizard", children: ["one"], submit: "deal.open", confirm: true, after: "crm.deals" },
          { id: "one", component: "Field", field: "title", input: "text", label: "f.title", default: "Kept" },
        ]),
        WORDS,
      ),
    );
    // One page: next is the submit button, labelled `action.save` by default.
    expect(app.texts()).toContain("action.save");
    await app.press("id:s_wiz_ask:root:next");
    expect(app.shows("id:s_wiz_ask:root:ask")).toBe(true);
    await app.press("id:s_wiz_ask:root:ask:cancel");
    expect(sentActions(app)).toEqual([]);
    await app.press("id:s_wiz_ask:root:next");
    await app.press("id:s_wiz_ask:root:ask:yes");
    expect(sentActions(app)).toEqual([
      { name: "deal.open", sourceComponentId: "root", context: { title: "Kept" } },
      { name: "screen:crm.deals", sourceComponentId: "root", context: {} },
    ]);
  });

  test("without submit the last page's button is disabled and sends nothing", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_wiz_none", [
          { id: "root", component: "Wizard", children: ["one"] },
          { id: "one", component: "Field", field: "title", input: "text", label: "f.title" },
        ]),
        WORDS,
      ),
    );
    expect(app.enabled("id:s_wiz_none:root:next")).toBe(false);
    expect(sentActions(app)).toEqual([]);
    expect(reportedErrors(app)).toEqual([]);
  });
});
