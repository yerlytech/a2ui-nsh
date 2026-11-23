import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

describe("xlarge catalog Refusal", () => {
  test("explains the refusal and its back button sends the back screen", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_refusal", [
          {
            id: "root",
            component: "Refusal",
            code: "crm.refused.closed_deal",
            hint: "crm.refused.reopen_first",
            back: "crm.deals",
            backLabel: "crm.action.back_to_deals",
          },
        ]),
        {
          "crm.refused.closed_deal": "This deal is closed",
          "crm.refused.reopen_first": "Reopen it first",
          "crm.action.back_to_deals": "Back to deals",
        },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["This deal is closed", "Reopen it first", "Back to deals"]);
    expect(app.shows("label:This deal is closed")).toBe(true);

    await app.press("id:s_refusal:root:back");
    expect(sentActions(app)).toEqual([
      { name: "screen:crm.deals", sourceComponentId: "root", context: {} },
    ]);
  });

  test("without backLabel it reads the host's word; without back it has no button", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages("s_ref_word", [
          { id: "root", component: "Refusal", code: "crm.refused.locked", back: "screen:crm.deal" },
        ]),
        ...surfaceMessages("s_ref_none", [{ id: "root", component: "Refusal", code: "crm.refused.locked" }]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_ref_word:root:back")).toBe(true);
    expect(app.shows("label:Back")).toBe(true);
    expect(app.shows("id:s_ref_none:root:back")).toBe(false);
    expect(app.shows("id:s_ref_none:root:hint")).toBe(false);

    await app.press("id:s_ref_word:root:back");
    expect(sentActions(app).map((a) => a.name)).toEqual(["screen:crm.deal"]);
  });
});
