/**
 * Measured on `nsh 0.7.2` (2026-11-27), headless: an `nsh/base` component host
 * still drops a view's `accessibilityDescription` and
 * `accessibilityElementsHidden` (`ComponentHostProps` omits them), while a
 * plain `<View>`/`<Text>` keeps both. `buildViewAccessibilityProps` therefore
 * keeps its transparent `<View>` wrapper around hosts (Spec 001 §3 Gap #1).
 */

import { expect, open, test } from "nsh/test";

test("nsh/base component hosts drop description and hidden", async () => {
  const app = await open("./host_a11y_app.tsx", { platform: "macos" });

  const host = app.accessibility("id:host");
  expect(host).toMatchObject({ role: "button", label: "Host label" });
  expect(host?.description ?? null).toBeNull();

  const plain = app.accessibility("id:plain");
  expect(plain).toMatchObject({
    label: "Plain label",
    description: "Plain description",
  });
});
