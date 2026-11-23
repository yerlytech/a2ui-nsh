import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";
import {
  clampAndSnapSliderValue,
  formatSliderDisplayValue,
  resolveSliderBounds,
  resolveSliderStep,
} from "./Slider";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog Slider", () => {
  test("pure helpers compute bounds, division steps, clamping/snapping, and display text", () => {
    expect(resolveSliderBounds(undefined, 100)).toEqual({ min: 0, max: 100 });
    expect(resolveSliderBounds(10, 50)).toEqual({ min: 10, max: 50 });
    expect(resolveSliderBounds(50, 20)).toEqual({ min: 50, max: 50 });

    // Omitted steps -> continuous (step = 0 in nsh/base).
    expect(resolveSliderStep(0, 100, undefined)).toBe(0);
    // Discrete divisions: steps = 4 over [0, 100] -> step = 25.
    expect(resolveSliderStep(0, 100, 4)).toBe(25);
    expect(Math.abs(resolveSliderStep(0, 1, 10) - 0.1) < 1e-12).toBe(true);

    // Clamping and discrete snapping.
    expect(clampAndSnapSliderValue(-5, 0, 100, undefined)).toBe(0);
    expect(clampAndSnapSliderValue(150, 0, 100, undefined)).toBe(100);
    expect(clampAndSnapSliderValue(42.5, 0, 100, undefined)).toBe(42.5);
    expect(clampAndSnapSliderValue(37, 0, 100, 4)).toBe(25);
    expect(clampAndSnapSliderValue(38, 0, 100, 4)).toBe(50);
    expect(clampAndSnapSliderValue(0.30000000000000004, 0, 1, 10)).toBe(0.3);

    expect(formatSliderDisplayValue(42)).toBe("42");
    expect(formatSliderDisplayValue(2.5)).toBe("2.5");
    expect(formatSliderDisplayValue(-0)).toBe("0");
  });

  test("renders continuous slider (step=0), writes two-way @path on keyboard and drag without remounting", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_sl_cont",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { volume: 10 },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["vol_slider", "readout"],
                  },
                  {
                    id: "vol_slider",
                    component: "Slider",
                    label: "Volume",
                    min: 0,
                    max: 100,
                    value: { "@path": "/volume" },
                  },
                  {
                    id: "readout",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "Volume: ${/volume}" },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null, "a2ui.data": null },
      },
    });

    expect(app.shows("text:Volume")).toBe(true);
    expect(app.shows("text:Volume: 10")).toBe(true);

    // Focus thumb via Tab and move with WAI-ARIA keys (step=0 -> 1% per arrow, 10% per pageup).
    await app.keyboard.press("tab");
    await app.keyboard.press("pageup");
    await app.keyboard.press("right");
    await app.keyboard.press("right");
    expect(app.shows("text:Volume: 22")).toBe(true);

    await app.host.send("a2ui.readData", {
      surfaceId: "s_sl_cont",
      path: "/volume",
    });
    expect(
      (
        app.host
          .posts()
          .filter((p) => p.name === "a2ui.data")
          .pop()?.data as { value?: unknown }
      )?.value,
    ).toBe(22);

    // Drag thumb all the way to max (100).
    await app.drag("label:Volume", { x: 400 });
    expect(app.shows("text:Volume: 100")).toBe(true);

    // Verify 0 remounts across value updates.
    const mounts = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "vol_slider",
      );
    expect(mounts).toHaveLength(1);
  });

  test("translates discrete steps divisions and snaps writes to division increments", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_sl_step",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { quality: 25 },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["q_slider", "readout"],
                  },
                  {
                    id: "q_slider",
                    component: "Slider",
                    label: "Quality",
                    min: 0,
                    max: 100,
                    steps: 4,
                    value: { "@path": "/quality" },
                  },
                  {
                    id: "readout",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "Quality: ${/quality}" },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.data": null },
      },
    });

    expect(app.shows("text:Quality: 25")).toBe(true);

    // Each Right press moves by (100 - 0) / 4 = 25.
    await app.keyboard.press("tab");
    await app.keyboard.press("right");
    expect(app.shows("text:Quality: 50")).toBe(true);

    await app.keyboard.press("right");
    expect(app.shows("text:Quality: 75")).toBe(true);

    await app.keyboard.press("home");
    expect(app.shows("text:Quality: 0")).toBe(true);

    await app.keyboard.press("end");
    expect(app.shows("text:Quality: 100")).toBe(true);
  });

  test("renders @checks error, warning, and info messages and clears error once value becomes valid", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_sl_checks",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  discount: 80,
                  warnMsg: {
                    valid: false,
                    message: "Discounts above 20% require manager note",
                    severity: "warning",
                  },
                  infoMsg: {
                    valid: false,
                    message: "Standard range is 0–50%",
                    severity: "info",
                  },
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["disc_slider"],
                  },
                  {
                    id: "disc_slider",
                    component: "Slider",
                    label: "Discount",
                    min: 0,
                    max: 100,
                    steps: 10,
                    value: { "@path": "/discount" },
                    "@checks": [
                      {
                        condition: {
                          "@call": "numeric",
                          args: {
                            value: { "@path": "/discount" },
                            min: 0,
                            max: 50,
                          },
                        },
                        message: "Discount cannot exceed 50%.",
                      },
                      { condition: { "@path": "/warnMsg" } },
                      { condition: { "@path": "/infoMsg" } },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(app.shows("text:Discount cannot exceed 50%.")).toBe(true);
    expect(app.shows("text:Discounts above 20% require manager note")).toBe(true);
    expect(app.shows("text:Standard range is 0–50%")).toBe(true);

    // Move slider to 0 via Tab + Home -> clears error while warning/info remain.
    await app.keyboard.press("tab");
    await app.keyboard.press("home");
    expect(app.shows("text:Discount cannot exceed 50%.")).toBe(false);
    expect(app.shows("text:Discounts above 20% require manager note")).toBe(true);
  });

  test("applies @accessibility label override, description, role, and hidden metadata", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_sl_a11y",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Slider",
                    label: "Brightness",
                    min: 0,
                    max: 100,
                    value: 60,
                    "@accessibility": {
                      label: "Display Brightness",
                      description: "Adjusts screen luminance percentage",
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("label:Display Brightness")).toBe(true);
    expect(app.shows("label:Brightness")).toBe(false);

    const snap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(
      (snap?.data as { snapshot?: Record<string, unknown> })?.snapshot,
    ).toEqual({
      label: "Display Brightness",
      description: "Adjusts screen luminance percentage",
      hidden: false,
      role: "adjustable",
    });
  });
});
