/**
 * Real-target measurement (spec 003, round 2): whether `nsh`'s `<Image>`
 * draws the `data:image/svg+xml` URI xlarge's `QrCode` makes from its
 * server's SVG, with a PNG data URI as the control. Uses zero
 * `host.handlers`, so it runs headless, on `--target tui`, and on
 * `--target web`.
 */

import { describe, expect, open, test } from "nsh/test";

function settled(texts: readonly string[], kind: string): string | undefined {
  return texts.find((t) => t.startsWith(`${kind}:`) && t !== `${kind}:waiting`);
}

describe("SVG data URI on a real target", () => {
  test("an Image draws the SVG a QrCode makes as it draws a PNG", async () => {
    const app = await open("./SvgProbe.tsx", {});
    try {
      await app.waitUntil(
        () => settled(app.texts(), "svg") !== undefined && settled(app.texts(), "png") !== undefined,
        { timeout: 5000 },
      );
    } catch {
      // A target that never loads pictures reports neither.
    }
    const svg = app.texts().find((t) => t.startsWith("svg:")) ?? "";
    const png = app.texts().find((t) => t.startsWith("png:")) ?? "";
    console.log(`svg probe: ${svg} | ${png}`);
    expect(svg.startsWith("svg:failed")).toBe(false);
    // The SVG behaves as the PNG does: both load, or neither reports.
    expect(svg.split(" ")[0]!.replace("svg:", "")).toBe(png.split(" ")[0]!.replace("png:", ""));
  });
});
