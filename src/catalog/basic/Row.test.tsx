import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";
import { weightStyle } from "../../renderer/A2uiSurface";
import { mapAlign, mapJustify } from "./layout_helpers";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog Row", () => {
  test("maps justify and align enums onto nsh flexbox values", () => {
    expect(mapJustify("start")).toBe("flex-start");
    expect(mapJustify("center")).toBe("center");
    expect(mapJustify("end")).toBe("flex-end");
    expect(mapJustify("spaceBetween")).toBe("space-between");
    expect(mapJustify("spaceAround")).toBe("space-around");
    expect(mapJustify("spaceEvenly")).toBe("space-evenly");
    expect(mapJustify("stretch")).toBe("stretch");

    expect(mapAlign("start")).toBe("flex-start");
    expect(mapAlign("center")).toBe("center");
    expect(mapAlign("end")).toBe("flex-end");
    expect(mapAlign("stretch")).toBe("stretch");

    expect(weightStyle(1)).toEqual({ flexGrow: 1, flexShrink: 1, minWidth: 0 });
    expect(weightStyle(2)).toEqual({ flexGrow: 2, flexShrink: 1, minWidth: 0 });
    expect(weightStyle(0)).toEqual({ flexGrow: 0 });
    expect(weightStyle(undefined)).toEqual({});
  });

  test("renders static children in declared order with justify, align, weight, and @accessibility group", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_row",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Row",
                    justify: "spaceBetween",
                    align: "center",
                    children: ["left_txt", "right_txt"],
                    "@accessibility": {
                      label: "Summary Row",
                      description: "Key metrics",
                    },
                  },
                  { id: "left_txt", component: "Text", text: "Left", weight: 1 },
                  { id: "right_txt", component: "Text", text: "Right" },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.texts()).toEqual(["Left", "Right"]);
    expect(app.shows("label:Summary Row")).toBe(true);

    const rowSnap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(
      (rowSnap?.data as { snapshot?: Record<string, unknown> })?.snapshot,
    ).toEqual({
      label: "Summary Row",
      description: "Key metrics",
      hidden: false,
      role: "group",
    });
  });

  test("renders template ChildList and updates surviving items without remounting", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_row_tpl",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  tags: [{ label: "Alpha" }, { label: "Beta" }],
                },
                components: [
                  {
                    id: "root",
                    component: "Row",
                    children: { componentId: "tag_text", path: "/tags" },
                  },
                  {
                    id: "tag_text",
                    component: "Text",
                    text: { "@path": "label" },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null },
      },
    });

    expect(app.texts()).toEqual(["Alpha", "Beta"]);
    const mountsBefore = app.host
      .posts()
      .filter((p) => p.name === "a2ui.mount").length;

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_row_tpl",
        path: "/tags/0/label",
        value: "Alpha Updated",
      },
    });

    expect(app.texts()).toEqual(["Alpha Updated", "Beta"]);
    expect(
      app.host.posts().filter((p) => p.name === "a2ui.mount").length,
    ).toBe(mountsBefore);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_row_tpl",
        path: "/tags",
        value: [{ label: "Alpha Updated" }, { label: "Beta" }, { label: "Gamma" }],
      },
    });
    expect(app.texts()).toEqual(["Alpha Updated", "Beta", "Gamma"]);
  });
});
