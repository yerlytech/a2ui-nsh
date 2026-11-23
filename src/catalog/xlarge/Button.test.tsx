import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

describe("xlarge catalog Button", () => {
  test("shows its filled label and sends its action with the literal context", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_btn", [
          {
            id: "root",
            component: "Button",
            action: "crm.win_deal",
            label: "crm.action.win",
            labelParams: { title: "Forklift fleet" },
            icon: "check",
            // A literal `@` key arrives escaped as `@@` (A2UI reserved-key rule).
            context: { id: "d1", amount: "25000.50", "@@note": "kept as text" },
          },
        ]),
        { "crm.action.win": "Win {title}" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["Win Forklift fleet"]);
    expect(app.shows("label:Win Forklift fleet")).toBe(true);
    expect(app.count("id:s_btn:root:icon")).toBe(1);

    await app.press("id:s_btn:root");
    expect(sentActions(app)).toEqual([
      {
        name: "crm.win_deal",
        sourceComponentId: "root",
        context: { id: "d1", amount: "25000.50", "@note": "kept as text" },
      },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("without context it sends an empty one; an unknown icon is not drawn", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_btn_plain", [
          { id: "root", component: "Button", action: "crm.refresh", label: "crm.action.refresh", icon: "no-such-icon", variant: "secondary" },
        ]),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["crm.action.refresh"]);
    expect(app.count("id:s_btn_plain:root:icon")).toBe(0);
    await app.press("id:s_btn_plain:root");
    expect(sentActions(app)).toEqual([
      { name: "crm.refresh", sourceComponentId: "root", context: {} },
    ]);
  });

  test("with confirm it asks first: cancel sends nothing, yes sends once", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_btn_ask", [
          {
            id: "root",
            component: "Button",
            action: "crm.drop_deal",
            label: "crm.action.drop",
            variant: "danger",
            confirm: true,
            context: { id: "d1" },
          },
        ]),
        { "crm.action.drop": "Drop" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_btn_ask:root:ask")).toBe(false);

    await app.press("id:s_btn_ask:root");
    expect(sentActions(app)).toEqual([]);
    expect(app.shows("id:s_btn_ask:root:ask")).toBe(true);
    expect(app.texts()).toContain("Are you sure?");

    await app.press("id:s_btn_ask:root:ask:cancel");
    expect(app.shows("id:s_btn_ask:root:ask")).toBe(false);
    expect(sentActions(app)).toEqual([]);

    await app.press("id:s_btn_ask:root");
    await app.press("id:s_btn_ask:root:ask:yes");
    expect(app.shows("id:s_btn_ask:root:ask")).toBe(false);
    expect(sentActions(app)).toEqual([
      { name: "crm.drop_deal", sourceComponentId: "root", context: { id: "d1" } },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("reads bound context values and version from the data model, then follows after", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_btn_bound",
          [
            {
              id: "root",
              component: "Button",
              action: "crm.deal.save",
              label: "crm.action.save",
              variant: "primary",
              context: { id: { path: "/deal/id" }, stage: { "@path": "/deal/stage" }, source: "web" },
              version: { "@path": "/deal/version" },
              after: "crm.deals",
            },
          ],
          { deal: { id: "d7", stage: "won", version: 3 } },
        ),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    await app.press("id:s_btn_bound:root");
    expect(sentActions(app)).toEqual([
      {
        name: "crm.deal.save",
        sourceComponentId: "root",
        context: { id: "d7", stage: "won", source: "web", version: 3 },
      },
      { name: "screen:crm.deals", sourceComponentId: "root", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("only primary draws primary; a missing or unknown variant draws the plain button", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_btn_variant", [
          { id: "root", component: "Card", children: ["main", "bare", "odd"] },
          { id: "main", component: "Button", action: "a.main", label: "Main", variant: "primary" },
          { id: "bare", component: "Button", action: "a.bare", label: "Bare" },
          { id: "odd", component: "Button", action: "a.odd", label: "Odd", variant: "sparkly" },
        ]),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.spanStyle("text:Bare")).toEqual(app.spanStyle("text:Odd"));
    expect(app.spanStyle("text:Main")).not.toEqual(app.spanStyle("text:Bare"));
  });

  test("without action the button is disabled and sends nothing", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_btn_none", [{ id: "root", component: "Button", label: "x.label" }])),
    );
    expect(reportedErrors(app)).toEqual([]);
    let refused = false;
    try {
      await app.press("id:s_btn_none:root");
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
    expect(sentActions(app)).toEqual([]);
  });
});
