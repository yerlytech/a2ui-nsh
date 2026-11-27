import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog Card", () => {
  test("renders single child inside themed card surface with @accessibility region and dynamic updates", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_card",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  heading: "Customer Profile",
                  cardLabel: "Profile Card",
                },
                components: [
                  {
                    id: "root",
                    component: "Card",
                    child: "card_title",
                    weight: 1,
                    "@accessibility": {
                      label: { "@path": "/cardLabel" },
                      description: "Summary of account details",
                    },
                  },
                  {
                    id: "card_title",
                    component: "Text",
                    text: { "@path": "/heading" },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null, "a2ui.a11y": null },
      },
    });

    expect(app.shows("id:s_card:root")).toBe(true);
    expect(app.shows("label:Profile Card")).toBe(true);
    expect(app.texts()).toContain("Customer Profile");
    // nsh 0.7.2 `app.accessibility()` reads the native label and description.
    expect(app.accessibility("id:s_card:root")).toMatchObject({
      label: "Profile Card",
      description: "Summary of account details",
    });

    const mountsBefore = app.host
      .posts()
      .filter((p) => p.name === "a2ui.mount").length;

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_card",
        path: "/heading",
        value: "Updated Profile",
      },
    });
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_card",
        path: "/cardLabel",
        value: "Account Card",
      },
    });

    expect(app.texts()).toContain("Updated Profile");
    expect(app.shows("label:Account Card")).toBe(true);
    expect(
      app.host.posts().filter((p) => p.name === "a2ui.mount").length,
    ).toBe(mountsBefore);

    const cardSnaps = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "root",
      )
      .map((p) => (p.data as { snapshot: Record<string, unknown> }).snapshot);
    expect(cardSnaps[cardSnaps.length - 1]).toEqual({
      label: "Account Card",
      description: "Summary of account details",
      hidden: false,
      role: "region",
    });
  });

  test("upgrades pending child in place without remounting Card", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_card_pending",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  { id: "root", component: "Card", child: "late_body" },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null },
      },
    });

    expect(app.shows("id:s_card_pending:root")).toBe(true);
    expect(app.texts()).toEqual([]);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateComponents: {
        surfaceId: "s_card_pending",
        components: [
          { id: "late_body", component: "Text", text: "Loaded Inside Card" },
        ],
      },
    });

    expect(app.shows("id:s_card_pending:late_body")).toBe(true);
    expect(app.texts()).toContain("Loaded Inside Card");
    const cardMounts = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(cardMounts).toHaveLength(1);
  });
});
