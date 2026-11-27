/**
 * Measured on `nsh 0.7.1` (2026-11-27), headless: a press reaches only the
 * innermost pressable view; the pressable views around it hear nothing. This
 * is why `BasicModal` provides `ModalTriggerContext`. It fails the day
 * `nsh` starts bubbling presses.
 */

import { describe, expect, open, test } from "nsh/test";

describe("nsh 0.7.1 measurement: presses do not bubble", () => {
  test("a press on an inner pressable view or Button leaves the outer view's onPress silent", async () => {
    const app = await open("./PressProbe.tsx", { platform: "macos" });
    const counts = () => app.texts().find((t) => t.startsWith("outer=")) ?? "";

    await app.press("id:inner");
    await app.press("text:inner");
    await app.press("id:button");
    expect(counts()).toBe("outer=0 inner=2 outerOfButton=0 button=1");

    // Control: the outer view hears a press on its own padding.
    await app.press("id:outer", { position: { x: 2, y: 2 } });
    expect(counts()).toBe("outer=1 inner=2 outerOfButton=0 button=1");
  });
});
