import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

const WORDS = { "crm.deal.saved": "Saved {title}", "crm.deal.moved": "Moved {title}" };

function toast(code: string) {
  return surfaceMessages("s_toast", [
    { id: "root", component: "Card", plain: true, children: ["note"] },
    { id: "note", component: "Toast", code, params: { title: "Forklift fleet" } },
  ]);
}

describe("xlarge catalog Toast", () => {
  test("shows its message, then passes after toastMs and stays passed", async () => {
    const app = await open(HARNESS, harnessOptions(toast("crm.deal.saved"), WORDS, { toastMs: 200 }));
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_toast:note")).toBe(true);
    expect(app.texts()).toContain("Saved Forklift fleet");
    expect(app.shows("label:Saved Forklift fleet")).toBe(true);

    await app.wait(400);
    expect(app.shows("id:s_toast:note")).toBe(false);
    expect(app.texts()).not.toContain("Saved Forklift fleet");
    await app.wait(400);
    expect(app.shows("id:s_toast:note")).toBe(false);
    expect(sentActions(app)).toEqual([]);
  });

  test("the close button dismisses it; the same message does not come back, a new one does", async () => {
    const app = await open(HARNESS, harnessOptions(toast("crm.deal.saved"), WORDS, { toastMs: 0 }));
    expect(app.shows("id:s_toast:note")).toBe(true);
    expect(app.shows("label:Dismiss")).toBe(true);

    await app.press("id:s_toast:note:dismiss");
    expect(app.shows("id:s_toast:note")).toBe(false);

    await app.host.send("a2ui.message", toast("crm.deal.saved")[1]);
    expect(app.shows("id:s_toast:note")).toBe(false);

    await app.host.send("a2ui.message", toast("crm.deal.moved")[1]);
    expect(app.shows("id:s_toast:note")).toBe(true);
    expect(app.texts()).toContain("Moved Forklift fleet");
    expect(reportedErrors(app)).toEqual([]);
  });
});
