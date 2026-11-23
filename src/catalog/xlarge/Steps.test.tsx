import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "audit.action.crm.create_deal": "Created a deal",
  "audit.action.crm.win_deal": "Won a deal",
  "audit.action.crm.delete_deal": "Deleted a deal",
  "crm.nav.crm": "Deals",
  "agents.step.looked_in": "Looked in {place}",
  "agents.step.looked": "Looked",
  "agents.steps": "Steps",
  "agents.step.none": "Nothing was done",
  "agents.outcome.done": "Done",
  "agents.outcome.refused": "Refused",
  "agents.outcome.waiting": "Waiting for you",
  "agents.outcome.taken": "Taken",
  "agents.action.take": "Take",
  "agents.action.open": "Open",
  "agents.stopped.budget": "Stopped: out of budget",
  "auth.forbidden": "Not allowed",
  "action.confirm": "Are you sure",
  "action.yes_go_ahead": "Yes, go ahead",
};

const ANSWER = {
  words: "I made the deal; winning it is yours.",
  stopped: "agents.stopped.budget",
  steps: [
    { action: "crm.deals", input: {}, outcome: "done" },
    {
      action: "crm.create_deal",
      input: { title: "Fleet" },
      outcome: "done",
      opens: { screen: "screen:crm.deal", about: "d1" },
    },
    { action: "crm.delete_deal", input: { id: "d0" }, outcome: "refused", code: "auth.forbidden" },
    { action: "crm.win_deal", input: { id: "d1", "@at": "now" }, outcome: "waiting" },
  ],
};

describe("xlarge catalog Steps", () => {
  test("draws the answer's words, stop and steps; take asks, then sends the step", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_steps", [{ id: "root", component: "Steps", answer: "steps" }]),
        WORDS,
        { answer: ANSWER },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual([
      "I made the deal; winning it is yours.",
      "Stopped: out of budget",
      "Looked in Deals",
      "Done",
      "Created a deal",
      "Done",
      "Open",
      "Deleted a deal",
      "Not allowed",
      "Won a deal",
      "Waiting for you",
      "Take",
    ]);
    expect(app.shows("label:Steps")).toBe(true);

    // Take asks first; cancel sends nothing.
    await app.press("id:s_steps:root:step:3:take");
    expect(app.shows("text:Are you sure — Won a deal")).toBe(true);
    await app.press("id:s_steps:root:step:3:ask:cancel");
    expect(sentActions(app)).toEqual([]);
    // Yes sends the step's action with its input, and marks it taken.
    await app.press("id:s_steps:root:step:3:take");
    await app.press("id:s_steps:root:step:3:ask:yes");
    expect(app.texts()).toContain("Taken");
    expect(app.shows("id:s_steps:root:step:3:take")).toBe(false);
    // Open sends the screen with the record it is about.
    await app.press("id:s_steps:root:step:1:open");
    expect(sentActions(app)).toEqual([
      { name: "crm.win_deal", sourceComponentId: "root", context: { id: "d1", "@at": "now" } },
      { name: "screen:crm.deal", sourceComponentId: "root", context: { id: "d1" } },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("reads the answer, not the data model, and follows a new answer", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_steps_live", [{ id: "root", component: "Steps", answer: "flow" }], {
          flow: [{ action: "crm.create_deal", input: {}, outcome: "done" }],
        }),
        WORDS,
      ),
    );
    // No answer yet: nothing, whatever the data model holds.
    expect(app.texts()).toEqual([]);
    await app.host.send("a2ui.answer", { flow: [] });
    expect(app.texts()).toEqual(["Nothing was done"]);
    await app.host.send("a2ui.answer", {
      flow: [{ action: "crm.create_deal", input: {}, outcome: "refused" }],
    });
    expect(app.texts()).toEqual(["Created a deal", "Refused"]);
    // An answer without the named list draws nothing again.
    await app.host.send("a2ui.answer", { steps: [] });
    expect(app.texts()).toEqual([]);
    expect(sentActions(app)).toEqual([]);
    expect(reportedErrors(app)).toEqual([]);
  });
});
