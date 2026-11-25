import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../core/catalog";
import { STRICT_VALIDATION } from "../core/validator";

const HARNESS = "./test_harness.tsx";

type Container = "Column" | "Row" | "Card" | "List" | "Button" | "Tabs";

/** One container of `kind` whose single child is `childId`. */
function container(
  kind: Container,
  id: string,
  childId: string,
): Record<string, unknown> {
  switch (kind) {
    case "Column":
    case "Row":
    case "List":
      return { id, component: kind, children: [childId] };
    case "Card":
      return { id, component: kind, child: childId };
    case "Button":
      return {
        id,
        component: kind,
        child: childId,
        action: { event: { name: "deep" } },
      };
    case "Tabs":
      return { id, component: kind, tabs: [{ title: id, child: childId }] };
  }
}

/** A chain of `levels` nested `kind` containers around one Text leaf. */
function chain(kind: Container, levels: number): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [];
  for (let level = 0; level < levels; level += 1) {
    const id = level === 0 ? "root" : `c${level}`;
    const childId = level + 1 === levels ? "leaf" : `c${level + 1}`;
    components.push(container(kind, id, childId));
  }
  components.push({ id: "leaf", component: "Text", text: "deepest leaf" });
  return components;
}

// nsh 0.7.0 stops an app whose views nest deeper than `MAX_TREE_DEPTH` (1024,
// `crates/nsh-core/src/core/mod.rs`, #2614). The A2UI validator caps the
// component tree at `maxRecursionDepth` (50), so the deepest surface an agent
// can send must stay below the native limit for every container.
describe("view depth under nsh 0.7.0's 1024 limit", () => {
  const levels = STRICT_VALIDATION.maxRecursionDepth - 1;
  const kinds: readonly Container[] = [
    "Column",
    "Row",
    "Card",
    "List",
    "Button",
    "Tabs",
  ];
  for (const kind of kinds) {
    test(`${levels} nested ${kind} containers render their leaf`, async () => {
      // Wide enough that 49 nested Card paddings leave the leaf on screen.
      const app = await open(HARNESS, {
        width: 4000,
        height: 4000,
        host: {
          params: {
            messages: [
              {
                version: "1.0",
                createSurface: {
                  surfaceId: "s_deep",
                  catalogId: BASIC_CATALOG_V1_ID,
                  components: chain(kind, levels),
                },
              },
            ],
          },
          handlers: { "a2ui.error": null, "a2ui.exception": null },
        },
      });
      expect(app.host.posts()).toEqual([]);
      expect(app.texts()).toContain("deepest leaf");
    });
  }
});
