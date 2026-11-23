import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const DRAFT = [
  { label: "crm.field.title", value: "Forklift fleet" },
  { label: "crm.field.amount", value: "25000.5", format: "money" },
];

describe("xlarge catalog Preview", () => {
  test("shows the draft and sends its action on accept", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_preview", [
          {
            id: "root",
            component: "Preview",
            about: "crm.preview.deal",
            action: "crm.keep_deal",
            label: "crm.action.keep",
            draft: DRAFT,
          },
        ]),
        {
          "crm.preview.deal": "New deal",
          "crm.field.title": "Title",
          "crm.field.amount": "Amount",
          "crm.action.keep": "Keep",
        },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["New deal", "Title", "Forklift fleet", "Amount", "25,000.50", "Keep"]);
    expect(app.shows("label:New deal")).toBe(true);

    await app.press("id:s_preview:root:accept");
    expect(sentActions(app)).toEqual([
      { name: "crm.keep_deal", sourceComponentId: "root", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("with confirm it asks first; without label it reads the host's word", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_preview_ask", [
          { id: "root", component: "Preview", action: "crm.keep_deal", draft: ["one line"], confirm: true },
        ]),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["one line", "Accept"]);

    await app.press("id:s_preview_ask:root:accept");
    expect(sentActions(app)).toEqual([]);
    expect(app.shows("id:s_preview_ask:root:ask")).toBe(true);
    await app.press("id:s_preview_ask:root:ask:cancel");
    expect(sentActions(app)).toEqual([]);

    await app.press("id:s_preview_ask:root:accept");
    await app.press("id:s_preview_ask:root:ask:yes");
    expect(sentActions(app)).toEqual([
      { name: "crm.keep_deal", sourceComponentId: "root", context: {} },
    ]);
  });
});
