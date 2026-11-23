import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "st.order": "Order",
  "st.pack": "Pack",
  "st.ship": "Ship",
};

describe("xlarge catalog Steps", () => {
  test("lists the named steps the answer data holds, each marked by its own state", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_steps",
          [{ id: "root", component: "Steps", answer: "flow" }],
          {
            flow: [
              { name: "st.order", state: "done" },
              { name: "pack", label: "st.pack", status: "active" },
              { name: "st.ship" },
            ],
          },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["✓", "Order", "●", "Pack", "○", "Ship"]);
    expect(app.shows("label:Order, Done")).toBe(true);
    expect(app.shows("label:Pack, Current")).toBe(true);
    expect(app.shows("label:Ship, To do")).toBe(true);
    expect(sentActions(app)).toEqual([]);
  });

  test("follows the answer data as it changes, and draws nothing without it", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_steps_live", [{ id: "root", component: "Steps", answer: "flow" }]),
        WORDS,
      ),
    );
    expect(app.texts()).toEqual([]);
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_steps_live",
        path: "/flow",
        value: { steps: ["st.order", "st.pack", "st.ship"], current: 2 },
      },
    });
    expect(app.shows("label:Order, Done")).toBe(true);
    expect(app.shows("label:Pack, Done")).toBe(true);
    expect(app.shows("label:Ship, Current")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });
});
