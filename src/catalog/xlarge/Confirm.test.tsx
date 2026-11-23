import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

describe("xlarge catalog Confirm", () => {
  test("yes sends its action with the literal context, then follows after", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_confirm", [
          {
            id: "root",
            component: "Confirm",
            question: "crm.ask.close_deal",
            action: "crm.close_deal",
            context: { id: "d1" },
            after: "crm.deals",
            confirmLabel: "crm.action.close",
            cancel: "screen:crm.deal",
          },
        ]),
        {
          "crm.ask.close_deal": "Close this deal?",
          "crm.action.close": "Close it",
        },
        // xlarge's web client reads `Confirm.context`, but its catalog does not
        // declare it yet, so strict validation would refuse it.
        { strictMode: false },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    // `cancel` is an action, not a label: the cancel button reads the host's word.
    expect(app.texts()).toEqual(["Close this deal?", "Close it", "Cancel"]);
    expect(app.shows("label:Close this deal?")).toBe(true);

    await app.press("id:s_confirm:root:yes");
    expect(sentActions(app)).toEqual([
      { name: "crm.close_deal", sourceComponentId: "root", context: { id: "d1" } },
      { name: "screen:crm.deals", sourceComponentId: "root", context: {} },
    ]);
    expect(app.shows("id:s_confirm:root")).toBe(false);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("cancel sends its cancel action and closes", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_confirm_cancel", [
          {
            id: "root",
            component: "Confirm",
            question: "imports.ask.drop",
            action: "imports.drop",
            cancel: "screen:imports.jobs",
          },
        ]),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    await app.press("id:s_confirm_cancel:root:cancel");
    expect(sentActions(app)).toEqual([
      { name: "screen:imports.jobs", sourceComponentId: "root", context: {} },
    ]);
    expect(app.shows("id:s_confirm_cancel:root")).toBe(false);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("without cancel, cancel sends nothing and closes; missing labels read the host's words", async () => {
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
