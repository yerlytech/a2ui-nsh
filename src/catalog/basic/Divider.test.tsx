import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog Divider", () => {
  test("renders horizontal and vertical dividers hidden from screen readers by default, with explicit @accessibility opt-in", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_div",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["top_txt", "h_div", "row_split", "labeled_div"],
                  },
                  { id: "top_txt", component: "Text", text: "Section 1" },
                  {
                    id: "h_div",
                    component: "Divider",
                  },
                  {
                    id: "row_split",
                    component: "Row",
                    children: ["left_col", "v_div", "right_col"],
                  },
                  { id: "left_col", component: "Text", text: "Left" },
                  {
                    id: "v_div",
                    component: "Divider",
                    axis: "vertical",
                  },
                  { id: "right_col", component: "Text", text: "Right" },
                  {
                    id: "labeled_div",
                    component: "Divider",
                    axis: "horizontal",
                    "@accessibility": {
                      label: "End of Billing Section",
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

    expect(app.shows("id:s_div:h_div")).toBe(true);
    expect(app.shows("id:s_div:v_div")).toBe(true);
    expect(app.shows("id:s_div:labeled_div")).toBe(true);
    expect(app.shows("label:End of Billing Section")).toBe(true);
    expect(app.texts()).toEqual(["Section 1", "Left", "Right"]);

    const snapFor = (id: string) =>
      app.host
        .posts()
        .find(
          (p) =>
            p.name === "a2ui.a11y" &&
            (p.data as { componentId?: string }).componentId === id,
        )?.data as { snapshot?: Record<string, unknown> } | undefined;

    expect(snapFor("h_div")?.snapshot).toEqual({ hidden: true });
    expect(snapFor("v_div")?.snapshot).toEqual({ hidden: true });
    expect(snapFor("labeled_div")?.snapshot).toEqual({
      label: "End of Billing Section",
      hidden: false,
    });
  });
});
