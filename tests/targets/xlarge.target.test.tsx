/**
 * Real-target check of xlarge's `Arrange` (spec 003, round 2) with the
 * lab-report layout shape (`items = "/layout/blocks"`, `field = "blocks"`):
 * its items are reordered and shown or hidden with the keyboard alone (Tab
 * reaches a control, Enter presses it, Space toggles), then the layout is
 * saved under `blocks`. Uses zero `host.handlers`, so it runs headless, on
 * `--target tui`, and on `--target web`; the sent action shows in the target
 * app's status strip.
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
            items: { "@path": "/layout/blocks" },
            field: "blocks",
            save: "lab.layout.save",
            version: { "@path": "/layout/version" },
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
          layout: {
            blocks: [
              { kind: "header", label: "Header", shown: true, kept: true },
              { kind: "patient", label: "Patient", shown: true },
              { kind: "results", label: "Results", shown: true },
            ],
            version: 7,
          },
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
  test("Tab, Enter and Space reorder and hide items; save sends them under field with version", async () => {
    const app = await open(APP_ENTRY, {
      host: { params: { catalog: deals.catalog, messages: arrangeMessages() } },
    });
    await app.waitFor("text:Header");
    expect(inOrder(app.texts(), ["Header", "Patient", "Results"])).toBe(true);

    // The kept first item has no toggle and its up button is disabled, so
    // Tab lands on its down button.
    await app.keyboard.press("tab");
    await app.keyboard.press("enter");
    await app.waitUntil(() => inOrder(app.texts(), ["Patient", "Header", "Results"]));

    // The first row is now Patient: Tab reaches its shown toggle; Space hides it.
    await app.keyboard.press("tab");
    await app.keyboard.press("space");

    // Then the second row's up, then its down button.
    await app.keyboard.press("tab");
    await app.keyboard.press("tab");
    await app.keyboard.press("enter");
    await app.waitUntil(() => inOrder(app.texts(), ["Patient", "Results", "Header"]));

    await app.press("id:target_arrange:root:save");
    await app.waitFor("text:actions=1 last=lab.layout.save");
    const sent = app.texts().find((t) => t.startsWith("{")) ?? "";
    // Parsed: a target may order an object's keys its own way.
    expect(JSON.parse(sent)).toEqual({
      blocks: [
        { kind: "patient", label: "Patient", shown: false },
        { kind: "results", label: "Results", shown: true },
        { kind: "header", label: "Header", shown: true, kept: true },
      ],
      version: 7,
    });
    expect(app.shows("text:errors=0")).toBe(true);
  });
});
