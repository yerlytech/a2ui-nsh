import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

describe("xlarge catalog Confirm", () => {
  test("asks its question and sends its action only on yes", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_confirm", [
          {
            id: "root",
            component: "Confirm",
            question: "crm.ask.close_deal",
            action: "crm.close_deal",
            confirmLabel: "crm.action.close",
            cancel: "crm.action.keep",
          },
        ]),
        {
          "crm.ask.close_deal": "Close this deal?",
          "crm.action.close": "Close it",
          "crm.action.keep": "Keep it",
        },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["Close this deal?", "Close it", "Keep it"]);
    expect(app.shows("label:Close this deal?")).toBe(true);

    await app.press("id:s_confirm:root:yes");
    expect(sentActions(app)).toEqual([
      { name: "crm.close_deal", sourceComponentId: "root", context: {} },
    ]);
    expect(app.shows("id:s_confirm:root")).toBe(false);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("cancel sends nothing and closes; missing labels read the host's words", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_confirm_no", [
          { id: "root", component: "Confirm", question: "crm.ask.close_deal", action: "crm.close_deal" },
        ]),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["crm.ask.close_deal", "Confirm", "Cancel"]);

    await app.press("id:s_confirm_no:root:cancel");
    expect(sentActions(app)).toEqual([]);
    expect(app.shows("id:s_confirm_no:root")).toBe(false);
  });
});
