/**
 * Real-target check of xlarge's `Arrange` (spec 003, round 2): its items are
 * reordered with the keyboard alone (Tab reaches a move button, Enter presses
 * it), then the new order is saved. Uses zero `host.handlers`, so it runs
 * headless, on `--target tui`, and on `--target web`; the sent action shows
 * in the target app's status strip.
 */

import { describe, expect, open, test } from "nsh/test";
import deals from "../fixtures/xlarge/crm-deals.json";

const APP_ENTRY = "./App.tsx";
const SURFACE = "target_arrange";

function arrangeMessages(): unknown[] {
  return [
    { version: "1.0", createSurface: { surfaceId: SURFACE, catalogId: "tech.yerly.xlarge/v1" } },
    {
      version: "1.0",
      updateComponents: {
        surfaceId: SURFACE,
        components: [
          {
            id: "root",
            component: "Arrange",
            items: { "@path": "/stages" },
            field: "title",
            save: "crm.order_stages",
            version: { "@path": "/stages_version" },
          },
        ],
      },
    },
    {
      version: "1.0",
      updateDataModel: {
        surfaceId: SURFACE,
        path: "/",
        value: {
          stages: [
            { id: "s1", title: "Lead" },
            { id: "s2", title: "Offer" },
            { id: "s3", title: "Won" },
          ],
          stages_version: "7",
        },
      },
    },
  ];
}

/** True when each of `words` shows in `texts`, in that order. */
function inOrder(texts: readonly string[], words: readonly string[]): boolean {
  const at = words.map((word) => texts.indexOf(word));
  return at.every((index, i) => index >= 0 && (i === 0 || index > at[i - 1]!));
}

describe("xlarge Arrange on a real target", () => {
  test("Tab and Enter reorder the items; save sends the new order with version", async () => {
    const app = await open(APP_ENTRY, {
      host: { params: { catalog: deals.catalog, messages: arrangeMessages() } },
    });
    await app.waitFor("text:Lead");
    expect(inOrder(app.texts(), ["Lead", "Offer", "Won"])).toBe(true);

    // The first item's up button is disabled, so Tab lands on its down button.
    await app.keyboard.press("tab");
    await app.keyboard.press("enter");
    await app.waitUntil(() => inOrder(app.texts(), ["Offer", "Lead", "Won"]));

    // Two more Tabs: the second item's up, then its down button.
    await app.keyboard.press("tab");
    await app.keyboard.press("tab");
    await app.keyboard.press("enter");
    await app.waitUntil(() => inOrder(app.texts(), ["Offer", "Won", "Lead"]));

    await app.press("id:target_arrange:root:save");
    await app.waitFor("text:actions=1 last=crm.order_stages");
    const sent = app.texts().find((t) => t.startsWith("{")) ?? "";
    expect(sent).toBe(
      '{"items":[{"id":"s2","title":"Offer"},{"id":"s3","title":"Won"},{"id":"s1","title":"Lead"}],"version":"7"}',
    );
    expect(app.shows("text:errors=0")).toBe(true);
  });
});
