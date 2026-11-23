import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  surfaceMessages,
} from "./test_support";

const COLUMNS = [
  { id: "root", component: "Columns", widths: ["2fr", "1fr"], children: ["left", "right"] },
  { id: "left", component: "Text", text: "Left side" },
  { id: "right", component: "Text", text: "Right side" },
];

describe("xlarge catalog Columns", () => {
  test("stacks its children when narrow and lays them side by side when wide", async () => {
    // On a desktop, the size class follows the window width (iOS reads
    // UIKit's trait instead, which a phone keeps compact when rotated).
    const app = await open(HARNESS, {
      ...harnessOptions(surfaceMessages("s_cols", COLUMNS)),
      platform: "macos",
      width: 390,
      height: 844,
    });
    expect(reportedErrors(app)).toEqual([]);
    // Narrow (below 600pt): compact, so stacked.
    expect(app.shows("id:s_cols:root:stacked")).toBe(true);
    expect(app.shows("id:s_cols:root:side")).toBe(false);
    expect(app.texts()).toEqual(["Left side", "Right side"]);

    await app.setViewport(1024, 768);
    expect(app.shows("id:s_cols:root:side")).toBe(true);
    expect(app.shows("id:s_cols:root:stacked")).toBe(false);
    expect(app.texts()).toEqual(["Left side", "Right side"]);

    await app.setViewport(390, 844);
    expect(app.shows("id:s_cols:root:stacked")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("draws without widths and with no children", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages("s_cols_even", [
          { id: "root", component: "Columns", children: ["a", "b", "c"] },
          { id: "a", component: "Text", text: "A" },
          { id: "b", component: "Text", text: "B" },
          { id: "c", component: "Text", text: "C" },
        ]),
        ...surfaceMessages("s_cols_none", [{ id: "root", component: "Columns" }]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["A", "B", "C"]);
  });
});
