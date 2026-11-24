import { describe, expect, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../catalog";
import { BASIC_V1_FUNCTIONS, SYSTEM_V1_FUNCTIONS } from "./basic_functions";
import { FunctionRegistry } from "./registry";
import type { FunctionImplementation } from "./types";

const CUSTOM_ID = "https://example.com/catalogs/custom/v1/catalog.json";
const OTHER_ID = "https://example.com/catalogs/other/v1/catalog.json";

function fn(name: string, result: unknown = name): FunctionImplementation {
  return {
    name,
    returnType: "any",
    allowedCallers: "rendererOnly",
    requiresUserActivation: false,
    execute: () => result,
  };
}

describe("FunctionRegistry.withBasicV1", () => {
  test("holds every Basic Catalog v1 function under the basic catalog id", () => {
    const registry = FunctionRegistry.withBasicV1();
    const expected = BASIC_V1_FUNCTIONS.map((impl) => impl.name);
    expect(registry.listCatalogFunctions(BASIC_CATALOG_V1_ID)).toEqual(expected);
    expect(expected.length).toBe(14);
    for (const impl of BASIC_V1_FUNCTIONS) {
      expect(registry.get(BASIC_CATALOG_V1_ID, impl.name)).toBe(impl);
    }
  });

  test("holds the system functions apart from the catalog table", () => {
    const registry = FunctionRegistry.withBasicV1();
    for (const impl of SYSTEM_V1_FUNCTIONS) {
      expect(registry.getSystem(impl.name)).toBe(impl);
      expect(registry.get(BASIC_CATALOG_V1_ID, impl.name)).toBe(undefined);
    }
    expect(registry.getSystem("@index")).not.toBe(undefined);
    expect(registry.getSystem("and")).toBe(undefined);
  });

  test("returns an independent registry on every call", () => {
    const first = FunctionRegistry.withBasicV1();
    const second = FunctionRegistry.withBasicV1();
    first.register(BASIC_CATALOG_V1_ID, fn("extra"));
    expect(first.has(BASIC_CATALOG_V1_ID, "extra")).toBe(true);
    expect(second.has(BASIC_CATALOG_V1_ID, "extra")).toBe(false);
  });
});

describe("FunctionRegistry register and lookup", () => {
  test("a new registry is empty", () => {
    const registry = new FunctionRegistry();
    expect(registry.listCatalogFunctions(BASIC_CATALOG_V1_ID)).toEqual([]);
    expect(registry.get(BASIC_CATALOG_V1_ID, "and")).toBe(undefined);
    expect(registry.getSystem("@index")).toBe(undefined);
  });

  test("looks a function up by catalog id and name", () => {
    const registry = new FunctionRegistry();
    const impl = fn("greet");
    registry.register(CUSTOM_ID, impl);
    expect(registry.get(CUSTOM_ID, "greet")).toBe(impl);
    expect(registry.has(CUSTOM_ID, "greet")).toBe(true);
    expect(registry.listCatalogFunctions(CUSTOM_ID)).toEqual(["greet"]);
  });

  test("keeps the same name in two catalogs apart", () => {
    const registry = new FunctionRegistry();
    const custom = fn("greet", "custom");
    const other = fn("greet", "other");
    registry.register(CUSTOM_ID, custom);
    registry.register(OTHER_ID, other);
    expect(registry.get(CUSTOM_ID, "greet")).toBe(custom);
    expect(registry.get(OTHER_ID, "greet")).toBe(other);
  });

  test("an unknown name returns undefined instead of throwing", () => {
    const registry = new FunctionRegistry();
    registry.register(CUSTOM_ID, fn("greet"));
    expect(registry.get(CUSTOM_ID, "missing")).toBe(undefined);
    expect(registry.has(CUSTOM_ID, "missing")).toBe(false);
  });

  test("an unknown catalog returns undefined and lists nothing", () => {
    const registry = new FunctionRegistry();
    registry.register(CUSTOM_ID, fn("greet"));
    expect(registry.get(OTHER_ID, "greet")).toBe(undefined);
    expect(registry.has(OTHER_ID, "greet")).toBe(false);
    expect(registry.listCatalogFunctions(OTHER_ID)).toEqual([]);
  });

  test("an unknown system function returns undefined", () => {
    const registry = FunctionRegistry.withBasicV1();
    expect(registry.getSystem("@missing")).toBe(undefined);
  });

  test("re-registering a name replaces the earlier implementation", () => {
    const registry = new FunctionRegistry();
    const first = fn("greet", 1);
    const second = fn("greet", 2);
    registry.register(CUSTOM_ID, first);
    registry.register(CUSTOM_ID, second);
    expect(registry.get(CUSTOM_ID, "greet")).toBe(second);
    expect(registry.listCatalogFunctions(CUSTOM_ID)).toEqual(["greet"]);
  });

  test("re-registering a system function replaces the earlier one", () => {
    const registry = new FunctionRegistry();
    const first = fn("@now", 1);
    const second = fn("@now", 2);
    registry.registerSystem(first);
    registry.registerSystem(second);
    expect(registry.getSystem("@now")).toBe(second);
  });

  test("registerCatalog adds every implementation in order", () => {
    const registry = new FunctionRegistry();
    registry.registerCatalog(CUSTOM_ID, [fn("a"), fn("b"), fn("c")]);
    expect(registry.listCatalogFunctions(CUSTOM_ID)).toEqual(["a", "b", "c"]);
  });
});
