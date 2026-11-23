import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const MESSAGES = [
  { id: "m1", text: "Is the quote ready?", at: "2026-11-20T09:15:00Z" },
  { id: "m2", text: "Yes, 25,000.50.", at: "2026-11-20T09:40:00Z", from: "Deniz", direction: "out" },
  { id: "@m3", text: "Send it.", at: "2026-11-20T10:02:00Z" },
];

describe("xlarge catalog Conversation", () => {
  test("draws the thread with its heading, marks `around`, and a press opens the screen", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_conv",
          [
            {
              id: "root",
              component: "Conversation",
              rows: { "@path": "/messages" },
              kind: "crm.channel.whatsapp",
              called: { "@path": "/partner" },
              around: { "@path": "/around" },
              screen: "crm.message",
            },
          ],
          { messages: MESSAGES, partner: "Acme", around: "m2" },
        ),
        { "crm.channel.whatsapp": "WhatsApp" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual([
      "WhatsApp · Acme",
      "Acme",
      "2026-11-20 09:15",
      "Is the quote ready?",
      "Deniz",
      "2026-11-20 09:40",
      "Yes, 25,000.50.",
      "Acme",
      "2026-11-20 10:02",
      "Send it.",
    ]);
    expect(app.shows("label:Deniz, 2026-11-20 09:40, Yes, 25,000.50.")).toBe(true);

    await app.press("id:s_conv:root:row:id:m1");
    await app.press("id:s_conv:root:row:id:@m3");
    expect(sentActions(app)).toEqual([
      { name: "screen:crm.message", sourceComponentId: "root", context: { id: "m1" } },
      { name: "screen:crm.message", sourceComponentId: "root", context: { id: "@m3" } },
    ]);

    // New messages arrive through the data model.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_conv", path: "/messages/3", value: { id: "m4", text: "Signed." } },
    });
    expect(app.texts()).toContain("Signed.");
    expect(reportedErrors(app)).toEqual([]);
  });

  test("without screen nothing is a button; no rows says so", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages("s_conv_view", [{ id: "root", component: "Conversation", rows: { "@path": "/messages" } }], {
          messages: MESSAGES,
        }),
        ...surfaceMessages("s_conv_none", [{ id: "root", component: "Conversation", rows: { "@path": "/none" } }]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_conv_view:root:heading")).toBe(false);
    expect(app.shows("id:s_conv_none:root:empty")).toBe(true);
    // Not a button: nothing there takes a press, and nothing is sent.
    await expect(app.press("id:s_conv_view:root:row:id:m1")).rejects.toMatchObject({
      code: "ERR_NSH_TEST_NOT_FOUND",
    });
    expect(sentActions(app)).toEqual([]);
  });
});
