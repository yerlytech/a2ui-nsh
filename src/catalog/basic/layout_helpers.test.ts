import { describe, expect, test } from "nsh/test";
import { MutableComponentNode, type ComponentNode } from "../../core/resolver";
import { extractChildNodes, mapAlign, mapJustify } from "./layout_helpers";

function makeNode(componentId: string): ComponentNode {
  return new MutableComponentNode({
    instanceId: `${componentId}#0`,
    componentId,
    type: "Text",
    catalogId: "basic",
    dataPath: "/",
    state: "resolved",
    initialProps: {},
  });
}

describe("mapJustify", () => {
  test("maps every justify value named by the A2UI spec", () => {
    expect(mapJustify("start")).toBe("flex-start");
    expect(mapJustify("center")).toBe("center");
    expect(mapJustify("end")).toBe("flex-end");
    expect(mapJustify("spaceBetween")).toBe("space-between");
    expect(mapJustify("spaceAround")).toBe("space-around");
    expect(mapJustify("spaceEvenly")).toBe("space-evenly");
    expect(mapJustify("stretch")).toBe("stretch");
  });

  test("defaults an unknown or missing justify value to flex-start", () => {
    expect(mapJustify(undefined)).toBe("flex-start");
    expect(mapJustify(null)).toBe("flex-start");
    expect(mapJustify("middle")).toBe("flex-start");
  });
});

describe("mapAlign", () => {
  test("maps every align value named by the A2UI spec", () => {
    expect(mapAlign("start")).toBe("flex-start");
    expect(mapAlign("center")).toBe("center");
    expect(mapAlign("end")).toBe("flex-end");
    expect(mapAlign("stretch")).toBe("stretch");
  });

  test("defaults an unknown or missing align value to stretch", () => {
    expect(mapAlign(undefined)).toBe("stretch");
    expect(mapAlign(null)).toBe("stretch");
    expect(mapAlign("middle")).toBe("stretch");
  });
});

describe("extractChildNodes", () => {
  test("returns the component nodes in a child list in order", () => {
    const first = makeNode("first");
    const second = makeNode("second");

    const extracted = extractChildNodes([first, second]);

    expect(extracted.length).toBe(2);
    expect(extracted[0]).toBe(first);
    expect(extracted[1]).toBe(second);
  });

  test("returns an empty list for a non-array value", () => {
    expect(extractChildNodes(undefined)).toEqual([]);
    expect(extractChildNodes(null)).toEqual([]);
    expect(extractChildNodes("first")).toEqual([]);
    expect(extractChildNodes({ 0: makeNode("first") })).toEqual([]);
  });

  test("skips entries that are not component nodes", () => {
    const first = makeNode("first");
    const second = makeNode("second");

    const extracted = extractChildNodes([
      first,
      null,
      42,
      "second",
      { id: "fake" },
      second,
    ]);

    expect(extracted.length).toBe(2);
    expect(extracted[0]).toBe(first);
    expect(extracted[1]).toBe(second);
  });
});
