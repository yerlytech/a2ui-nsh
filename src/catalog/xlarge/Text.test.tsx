import { describe, expect, open, test } from "nsh/test";
import { HARNESS, harnessOptions, reportedErrors, surfaceMessages } from "./test_support";

describe("xlarge catalog Text", () => {
  test("draws a translated code filled from params, and a bound text as it is", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_text",
          [
            { id: "root", component: "Card", children: ["coded", "bound", "both"] },
            {
              id: "coded",
              component: "Text",
              code: "crm.deal.summary",
              params: { partner: "acme", amount: "25000.50" },
            },
            { id: "bound", component: "Text", text: { "@path": "/note" } },
            // `code` wins over `text`, as in xlarge's web client.
            { id: "both", component: "Text", text: "ignored text", code: "crm.deal.won" },
          ],
          { note: "Call on Monday" },
        ),
        { "crm.deal.summary": "{partner} owes {amount}", "crm.deal.won": "Won" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["acme owes 25000.50", "Call on Monday", "Won"]);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_text", path: "/note", value: "Call on Tuesday" },
    });
    expect(app.texts()).toContain("Call on Tuesday");
  });

  test("without a dictionary the code itself shows", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(surfaceMessages("s_text_code", [{ id: "root", component: "Text", code: "crm.deal.overdue" }])),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["crm.deal.overdue"]);
  });

  test("tone picks the colour; an unknown tone draws plain", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_text_tone", [
          { id: "root", component: "Card", children: ["danger", "odd"] },
          { id: "danger", component: "Text", text: "Overdue", tone: "danger" },
          { id: "odd", component: "Text", text: "Plain", tone: "sparkly" },
        ]),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_text_tone:danger")).toBe(true);
    expect(app.shows("id:s_text_tone:odd")).toBe(true);
    expect(app.spanStyle("text:Overdue")).not.toEqual(app.spanStyle("text:Plain"));
  });

  test("`when` and `unless` read the data: shown only while they say so", async () => {
    // As xlarge's `lab_results.performance` sends it: `when = "/performance/cut"`.
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_text_when",
          [
            { id: "root", component: "Card", children: ["cut", "missing", "kept", "unless"] },
            { id: "cut", component: "Text", text: "Cut", when: { "@path": "/performance/cut" } },
            { id: "missing", component: "Text", text: "Missing", when: { "@path": "/nowhere" } },
            { id: "kept", component: "Text", text: "Kept", when: { "@path": "/rows" } },
            { id: "unless", component: "Text", text: "Unless", unless: { "@path": "/performance/cut" } },
          ],
          { performance: { cut: false }, rows: [1] },
        ),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["Kept", "Unless"]);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_text_when", path: "/performance/cut", value: true },
    });
    expect(app.texts()).toEqual(["Cut", "Kept"]);
  });
});
