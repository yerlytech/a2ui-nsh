// Draws xlarge's real `crm.deals` screen (captured from its server, see
// `tests/fixtures/xlarge/crm-deals.json`) with the xlarge catalog renderers,
// then walks it: open a deal, filter the list, search, and open a row.

import { describe, expect, open, test } from "nsh/test";
import fixture from "../../../tests/fixtures/xlarge/crm-deals.json";

const HARNESS = "./test_harness.tsx";

const WORDS: Record<string, string> = {
  "crm.title.deals": "Deals",
  "crm.action.open_deal": "Open a deal",
  "crm.action.show": "Show",
  "crm.field.title": "Title",
  "crm.field.partner": "Partner",
  "crm.field.pipeline": "Pipeline",
  "crm.field.amount": "Amount",
  "crm.field.contact": "Contact",
  "crm.field.email": "Email",
  "crm.field.phone": "Phone",
  "crm.field.note": "Note",
  "crm.field.state": "State",
  "crm.field.stage": "Stage",
  "crm.field.entered_on": "Entered on",
  "crm.field.next_meeting": "Next meeting",
  "crm.state.active": "Active",
  "crm.state.won": "Won",
  "crm.state.lost": "Lost",
  "crm.pipeline.sales": "Sales",
  "crm.stage.new": "New",
};

interface ActionPost {
  readonly action: {
    readonly name: string;
    readonly surfaceId: string;
    readonly sourceComponentId: string;
    readonly context: Record<string, unknown>;
  };
}

function actions(app: { host: { posts(): { name: string; data?: unknown }[] } }): ActionPost[] {
  return app.host
    .posts()
    .filter((post) => post.name === "a2ui.action")
    .map((post) => post.data as ActionPost);
}

async function openDeals() {
  return open(HARNESS, {
    host: {
      params: {
        catalog: fixture.catalog,
        messages: fixture.messages,
        translations: WORDS,
        strictMode: true,
      },
      handlers: { "a2ui.action": null, "a2ui.error": null, "a2ui.exception": null },
    },
  });
}

const DEAL_ROWS = {
  version: "1.0",
  updateDataModel: {
    surfaceId: "crm.deals",
    path: "/deals",
    value: [
      {
        id: "d1",
        title: "Forklift fleet",
        partnerName: "acme",
        pipelineName: "crm.pipeline.sales",
        stageName: "crm.stage.new",
        amount: "25000",
        enteredOn: "2026-11-20T09:15:00Z",
        nextMeeting: "Call on Monday",
      },
    ],
  },
};

describe("xlarge crm.deals drawn by a2ui-nsh", () => {
  test("draws the card, the dialog button, the filter form and the empty table", async () => {
    const app = await openDeals();
    const errors = app.host.posts().filter((p) => p.name === "a2ui.error" || p.name === "a2ui.exception");
    expect(errors).toEqual([]);

    expect(app.shows("id:crm.deals:root")).toBe(true);
    expect(app.texts()).toContain("Deals");
    // The `add` form is a dialog: only its button shows until pressed.
    expect(app.shows("id:crm.deals:add:open")).toBe(true);
    expect(app.shows("id:crm.deals:add:body")).toBe(false);
    // The filter form is inline, with its two fields and its button.
    expect(app.shows("id:crm.deals:which")).toBe(true);
    expect(app.shows("id:crm.deals:state")).toBe(true);
    expect(app.texts()).toContain("Show");
    // The table: its translated headers, no rows yet.
    for (const header of ["Title", "Partner", "Pipeline", "Stage", "Amount", "Entered on", "Next meeting"]) {
      expect(app.texts()).toContain(header);
    }
    expect(app.shows("id:crm.deals:table:empty")).toBe(true);
  });

  test("rows arrive by updateDataModel and a row press sends rowAction with the row id", async () => {
    const app = await openDeals();
    await app.host.send("a2ui.message", DEAL_ROWS);

    expect(app.shows("id:crm.deals:table:empty")).toBe(false);
    expect(app.texts()).toContain("Forklift fleet");
    expect(app.texts()).toContain("Sales");
    expect(app.texts()).toContain("New");
    expect(app.texts()).toContain("25,000.00");
    expect(app.texts()).toContain("2026-11-20");

    await app.press("id:crm.deals:table:row:id:d1");
    expect(actions(app).map((a) => a.action)).toEqual([
      {
        name: "screen:crm.deal",
        surfaceId: "crm.deals",
        sourceComponentId: "table",
        timestamp: "2026-11-23T00:00:00.000Z",
        context: { id: "d1" },
      },
    ]);
  });

  test("the add dialog refuses an empty required field, then sends crm.open_deal", async () => {
    const app = await openDeals();
    await app.press("id:crm.deals:add:open");
    expect(app.shows("id:crm.deals:add:body")).toBe(true);
    expect(app.texts()).toContain("Title *");

    await app.press("id:crm.deals:add:submit");
    expect(actions(app)).toEqual([]);
    expect(app.shows("id:crm.deals:title:error")).toBe(true);
    expect(app.shows("id:crm.deals:partner:error")).toBe(true);

    await app.type("id:crm.deals:title", "Forklift fleet");
    expect(app.shows("id:crm.deals:title:error")).toBe(false);
    await app.press("id:crm.deals:partner:trigger");
    await app.press("text:acme");
    await app.type("id:crm.deals:amount", "25000.50");
    await app.type("id:crm.deals:email", "buyer@acme.test");

    await app.press("id:crm.deals:add:submit");
    const sent = actions(app);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.action.name).toBe("crm.open_deal");
    expect(sent[0]!.action.sourceComponentId).toBe("add");
    expect(sent[0]!.action.context).toEqual({
      title: "Forklift fleet",
      partner: "01M84VPC5AXDJZ91G0BE9P9KE3",
      amount: "25000.50",
      email: "buyer@acme.test",
    });
    // A sent dialog closes and forgets what was typed.
    expect(app.shows("id:crm.deals:add:body")).toBe(false);
  });

  test("the filter form asks the table's searchAction with its searchInput and the defaults", async () => {
    const app = await openDeals();
    await app.press("id:crm.deals:filter:submit");
    expect(actions(app).map((a) => [a.action.name, a.action.sourceComponentId, a.action.context])).toEqual([
      ["crm.deals", "filter", { limit: 50, state: "active" }],
    ]);
  });

  test("the table search box sends searchAction with query", async () => {
    const app = await openDeals();
    await app.type("id:crm.deals:table:search", "fork\n");
    expect(actions(app).map((a) => [a.action.name, a.action.context])).toEqual([
      ["crm.deals", { limit: 50, query: "fork" }],
    ]);
  });
});
