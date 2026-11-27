/**
 * Measured on `nsh 0.7.2` (2026-11-27), headless: a `<List horizontal>`
 * without a height lays out 0 high and mounts no cell, while `<Scroll
 * horizontal>` grows to its 40-high cells, so `BasicList` renders horizontal
 * lists through `<Scroll horizontal>` (Spec 001 §3 Gap #8). It fails the day
 * `nsh` sizes the list's cross axis from its cells.
 */

import { describe, expect, open, test } from "nsh/test";

describe("nsh 0.7.2 measurement: horizontal List cross-axis height", () => {
  test("List horizontal needs a fixed height; Scroll horizontal sizes to its cells", async () => {
    const app = await open("./ListProbe.tsx", { platform: "macos" });

    expect(app.shows("id:auto")).toBe(false);
    expect(app.shows("id:auto:a")).toBe(false);
    expect(app.layout("id:afterAuto")?.y).toBe(0);

    expect(app.layout("id:fixed")?.height).toBe(40);
    expect(app.layout("id:fixed:c")).toMatchObject({ x: 120, width: 60, height: 40 });

    expect(app.layout("id:scroll")?.height).toBe(40);
    expect(app.layout("id:scroll:c")).toMatchObject({ x: 120, width: 60, height: 40 });
  });
});
