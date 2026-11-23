import { describe, expect, open, test } from "nsh/test";
import { Path2D } from "nsh";
import {
  BASIC_CATALOG_V1_ID,
  buildV10BasicCatalogDocument,
} from "../../core/catalog";
import type { JsonObject } from "../../core/json_schema";
import {
  BASIC_ICON_NAME_LIST,
  BASIC_ICON_PATHS,
  FALLBACK_ICON_PATH,
  isValidSvgPath,
  resolveIconSvgPath,
} from "./icon_paths";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog Icon", () => {
  test("covers every Basic Catalog v1 named icon with a valid Path2D and validates dynamic svgPath strings", () => {
    const basicDoc = buildV10BasicCatalogDocument();
    const components = basicDoc["components"] as JsonObject;
    const iconSchema = components["Icon"] as JsonObject;
    const iconProps = iconSchema["properties"] as JsonObject;
    const nameOneOf = (iconProps["name"] as JsonObject)["oneOf"] as JsonObject[];
    const schemaEnum = nameOneOf[0]!["enum"] as string[];

    expect(BASIC_ICON_NAME_LIST.length).toBe(schemaEnum.length);
    expect(schemaEnum.length).toBe(59);

    for (const iconName of schemaEnum) {
      const pathData = BASIC_ICON_PATHS[iconName];
      expect(pathData).toBeDefined();
      expect(isValidSvgPath(pathData)).toBe(true);
      expect(new Path2D(pathData!) instanceof Path2D).toBe(true);
    }

    expect(new Path2D(FALLBACK_ICON_PATH) instanceof Path2D).toBe(true);

    expect(resolveIconSvgPath("star")).toEqual({
      pathData: BASIC_ICON_PATHS["star"],
      isFallback: false,
    });
    expect(resolveIconSvgPath({ svgPath: "M12 2L22 22H2Z" })).toEqual({
      pathData: "M12 2L22 22H2Z",
      isFallback: false,
    });
    expect(resolveIconSvgPath("nonExistentIcon")).toEqual({
      pathData: FALLBACK_ICON_PATH,
      isFallback: true,
    });
    expect(resolveIconSvgPath({ svgPath: "not-an-svg-path" })).toEqual({
      pathData: FALLBACK_ICON_PATH,
      isFallback: true,
    });
  });

  test("renders named icons, reactive @path icons, custom svgPath, and @accessibility decorative vs labeled modes", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_icon",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  iconName: "star",
                  customSvg: "M12 2L22 22H2Z",
                },
                components: [
                  {
                    id: "root",
                    component: "Row",
                    children: ["decorative_icon", "labeled_icon", "svg_icon"],
                  },
                  {
                    id: "decorative_icon",
                    component: "Icon",
                    name: { "@path": "/iconName" },
                  },
                  {
                    id: "labeled_icon",
                    component: "Icon",
                    name: "warning",
                    "@accessibility": {
                      label: "Warning status",
                      description: "Requires immediate review",
                    },
                  },
                  {
                    id: "svg_icon",
                    component: "Icon",
                    name: { svgPath: { "@path": "/customSvg" } },
                    "@accessibility": {
                      label: "Custom triangle",
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null, "a2ui.a11y": null },
      },
    });

    expect(app.shows("id:s_icon:decorative_icon")).toBe(true);
    expect(app.shows("label:Warning status")).toBe(true);
    expect(app.shows("label:Custom triangle")).toBe(true);

    const decorativeSnap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "decorative_icon",
      );
    expect(
      (decorativeSnap?.data as { snapshot?: { hidden?: boolean } })?.snapshot
        ?.hidden,
    ).toBe(true);

    const labeledSnap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "labeled_icon",
      );
    expect(
      (labeledSnap?.data as { snapshot?: Record<string, unknown> })?.snapshot,
    ).toEqual({
      label: "Warning status",
      description: "Requires immediate review",
      hidden: false,
      role: "image",
    });

    const mountsBefore = app.host
      .posts()
      .filter((p) => p.name === "a2ui.mount").length;

    // Reactive updates to both named icon and custom svgPath keep 0 remounts.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_icon",
        path: "/iconName",
        value: "check",
      },
    });
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_icon",
        path: "/customSvg",
        value: "M4 4H20V20H4Z",
      },
    });

    expect(
      app.host.posts().filter((p) => p.name === "a2ui.mount").length,
    ).toBe(mountsBefore);
  });
});
