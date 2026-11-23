import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

// xlarge's lab_samples/surfaces/sample.toml talk card, and what talk.on and
// talk.about answer.
const CONVERSATION = {
  id: "root",
  component: "Conversation",
  rows: { "@path": "/talk" },
  around: { "@path": "/talk_about" },
  kind: "sample",
  screen: "lab_samples.sample",
  called: { "@path": "/sample/code" },
};

const ROWS = [
  { id: "m2", by: { id: "u1", name: "Deniz" }, text: "On it.", takenBack: false, at: "2026-11-20T09:40:00Z", mine: true, reactions: [], myReaction: [] },
  { id: "m1", by: { id: "u2", name: "Ece" }, text: "Is it in?", takenBack: false, at: "2026-11-20T09:15:00Z", mine: false, reactions: [{ emoji: "👍", count: 1 }], myReaction: ["👍"] },
];

const AROUND = { talk: "r_sample_01S", people: [{ id: "u2", name: "Ece" }], unread: false };

const WORDS = {
  "talk.you": "You",
  "talk.none": "No messages yet",
  "talk.send": "Send",
  "talk.write_here": "Write here",
};

function model(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { sample: { code: "S-0012" }, talk: ROWS, talk_about: AROUND, ...extra };
}

describe("xlarge catalog Conversation", () => {
  test("draws talk.on's rows oldest first, one's own as You", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_talk", [CONVERSATION], model()), WORDS),
    );
    expect(reportedErrors(app)).toEqual([]);
    const texts = app.texts();
    expect(texts.indexOf("Is it in?")).toBeLessThan(texts.indexOf("On it."));
    expect(texts).toContain("Ece · 2026-11-20 09:15");
    expect(texts).toContain("You · 2026-11-20 09:40");
    expect(app.shows("label:Ece, 2026-11-20 09:15, Is it in?")).toBe(true);
    // Read already: nothing is sent on its own.
    expect(sentActions(app)).toEqual([]);

    // A new message arrives through the data model, newest first.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_talk",
        path: "/talk",
        value: [{ id: "m3", by: { id: "u2", name: "Ece" }, text: "Thanks.", takenBack: false, at: "2026-11-20T10:00:00Z", mine: false }, ...ROWS],
      },
    });
    expect(app.texts()).toContain("Thanks.");
    expect(reportedErrors(app)).toEqual([]);
  });

  test("a written message goes out as talk.write, then the screen is read again", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_talk_w", [CONVERSATION], model()), WORDS),
    );
    await app.type("id:s_talk_w:root:text", "Done @12:00");
    await app.press("id:s_talk_w:root:send");
    expect(sentActions(app)).toEqual([
      {
        name: "talk.write",
        sourceComponentId: "root",
        context: { kind: "sample", id: "01S", screen: "lab_samples.sample", label: "S-0012", text: "Done @12:00", tell: [] },
      },
      { name: "screen:lab_samples.sample", sourceComponentId: "root", context: { id: "01S" } },
    ]);
  });

  test("no rows says so; without talk.about nothing can be written", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_talk_none", [CONVERSATION], { sample: { code: "S-1" }, talk: [] }), WORDS),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_talk_none:root:empty")).toBe(true);
    expect(app.texts()).toContain("No messages yet");
    await app.type("id:s_talk_none:root:text", "Hello");
    // No record to write on: the send stays disabled.
    await expect(app.press("id:s_talk_none:root:send")).rejects.toMatchObject({});
    expect(app.shows("id:s_talk_none:root:tell")).toBe(false);
    expect(sentActions(app)).toEqual([]);
  });
});
