import { describe, expect, open, test } from "nsh/test";
import { HARNESS, harnessOptions, reportedErrors, surfaceMessages } from "./test_support";

describe("xlarge catalog Card", () => {
  test("draws a translated title, heading and subtitle above its children", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_card",
          [
            {
              id: "root",
              component: "Card",
              title: "crm.title.deals",
              heading: { "@path": "/who" },
              subtitle: "Open deals only",
              children: ["inner"],
            },
            { id: "inner", component: "Card", plain: true, title: "inner.title" },
          ],
          { who: "Acme" },
        ),
        { "crm.title.deals": "Deals", "inner.title": "Inside" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_card:root")).toBe(true);
    expect(app.shows("label:Deals")).toBe(true);
    expect(app.texts()).toEqual(["Deals", "Acme", "Open deals only", "Inside"]);
    expect(app.shows("id:s_card:inner")).toBe(true);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_card", path: "/who", value: "Beta" },
    });
    expect(app.texts()).toContain("Beta");
  });

  test("a card without a title draws no header and no region name", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_card_bare", [{ id: "root", component: "Card", children: [] }])),
    );
    expect(app.shows("id:s_card_bare:root")).toBe(true);
    expect(app.shows("id:s_card_bare:root:title")).toBe(false);
    expect(app.texts()).toEqual([]);
  });
});
