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

  test("a card whose `when` holds nothing is not drawn, children and all", async () => {
    // As xlarge's `lab_samples.sample` sends it: `when = "/custom/any"`, with
    // `custom` an empty list when the record has no own fields.
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_card_when",
          [
            { id: "root", component: "Card", plain: true, children: ["own", "other"] },
            { id: "own", component: "Card", title: "fields.title.own", when: { "@path": "/custom/any" }, children: ["inner"] },
            { id: "inner", component: "Text", text: "Inside" },
            { id: "other", component: "Card", title: "other.title", unless: { "@path": "/custom/any" } },
          ],
          { custom: [] },
        ),
        { "fields.title.own": "Own fields", "other.title": "Other" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_card_when:own")).toBe(false);
    expect(app.texts()).toEqual(["Other"]);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_card_when", path: "/custom", value: { any: true } },
    });
    expect(app.texts()).toEqual(["Own fields", "Inside"]);
  });
});
