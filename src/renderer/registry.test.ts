import { describe, expect, test } from "nsh/test";
import { ComponentRegistry, type A2uiComponentRenderer } from "./registry";

const rendererA = (() => null) as unknown as A2uiComponentRenderer;
const rendererB = (() => null) as unknown as A2uiComponentRenderer;

describe("ComponentRegistry", () => {
  test("registers and resolves a renderer by catalog id and component type", () => {
    const registry = new ComponentRegistry();

    registry.register("basic", "Text", rendererA);

    expect(registry.resolve("basic", "Text")).toBe(rendererA);
    expect(registry.has("basic", "Text")).toBe(true);
  });

  test("reports an unregistered component as absent", () => {
    const registry = new ComponentRegistry();

    expect(registry.has("basic", "Text")).toBe(false);
    expect(registry.resolve("basic", "Text")).toBeUndefined();
  });

  test("throws when the catalog id is empty", () => {
    const registry = new ComponentRegistry();

    expect(() => registry.register("", "Text", rendererA)).toThrow();
  });

  test("throws when the component type is empty", () => {
    const registry = new ComponentRegistry();

    expect(() => registry.register("basic", "", rendererA)).toThrow();
  });

  test("keeps catalogs strictly isolated for the same component type", () => {
    const registry = new ComponentRegistry();

    registry.register("basic", "Text", rendererA);
    registry.register("other", "Text", rendererB);

    expect(registry.resolve("basic", "Text")).toBe(rendererA);
    expect(registry.resolve("other", "Text")).toBe(rendererB);
    expect(registry.has("missing", "Text")).toBe(false);
  });

  test("resolves nothing when the catalog id is undefined", () => {
    const registry = new ComponentRegistry();

    registry.register("basic", "Text", rendererA);

    expect(registry.resolve(undefined, "Text")).toBeUndefined();
    expect(registry.has(undefined, "Text")).toBe(false);
  });

  test("replaces the renderer when a component is registered again", () => {
    const registry = new ComponentRegistry();

    registry.register("basic", "Text", rendererA);
    registry.register("basic", "Text", rendererB);

    expect(registry.resolve("basic", "Text")).toBe(rendererB);
    expect(registry.componentTypes("basic")).toEqual(["Text"]);
  });

  test("registers a whole catalog of renderers", () => {
    const registry = new ComponentRegistry();

    registry.registerCatalog("basic", {
      Text: rendererA,
      Button: rendererB,
    });

    expect(registry.resolve("basic", "Text")).toBe(rendererA);
    expect(registry.resolve("basic", "Button")).toBe(rendererB);
  });

  test("lists catalog ids in insertion order", () => {
    const registry = new ComponentRegistry();

    registry.register("basic", "Text", rendererA);
    registry.register("other", "Text", rendererB);

    expect(registry.catalogIds()).toEqual(["basic", "other"]);
  });

  test("lists component types in insertion order", () => {
    const registry = new ComponentRegistry();

    registry.register("basic", "Text", rendererA);
    registry.register("basic", "Button", rendererB);
    registry.register("basic", "Image", rendererA);

    expect(registry.componentTypes("basic")).toEqual(["Text", "Button", "Image"]);
  });

  test("returns no component types for an unknown catalog", () => {
    const registry = new ComponentRegistry();

    registry.register("basic", "Text", rendererA);

    expect(registry.componentTypes("missing")).toEqual([]);
  });

  test("clones the registry independently of the original", () => {
    const registry = new ComponentRegistry();
    registry.register("basic", "Text", rendererA);

    const copy = registry.clone();
    copy.register("basic", "Image", rendererB);

    expect(copy).not.toBe(registry);
    expect(copy.resolve("basic", "Text")).toBe(rendererA);
    expect(copy.has("basic", "Image")).toBe(true);
    expect(registry.has("basic", "Image")).toBe(false);
  });
});
