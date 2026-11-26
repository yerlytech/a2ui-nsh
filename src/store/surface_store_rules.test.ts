/**
 * One-rule-per-test coverage for the nsh signal bridge in `surface_store.ts`.
 *
 * `surface_store.test.ts` keeps the long end-to-end scenarios; this file pins
 * the single behaviours (lookup, per-path data signals, errors, removal,
 * disposal) that those flows do not exercise on their own.
 */

import { describe, expect, test } from "nsh/test";
import { computed } from "nsh";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
} from "../core/catalog";
import type { ComponentNode, ResolvedBinding } from "../core/resolver";
import { A2uiStore } from "./surface_store";

function makeStore(): A2uiStore {
  return new A2uiStore({
    catalogs: [Catalog.fromJson(buildV10BasicCatalogDocument())],
    strictMode: false,
  });
}

function createSurface(
  store: A2uiStore,
  surfaceId: string,
  components: readonly unknown[],
  dataModel: Readonly<Record<string, unknown>> = {},
): void {
  store.processMessages([
    {
      version: "1.0",
      createSurface: {
        surfaceId,
        catalogId: BASIC_CATALOG_V1_ID,
        dataModel,
        components,
      },
    },
  ]);
}

describe("A2uiStore surface lookup rules", () => {
  test("surfaceSignal for an unknown id reads undefined until that surface is created", () => {
    const store = makeStore();
    const lookup = store.surfaceSignal("later");
    expect(lookup()).toBeUndefined();

    createSurface(store, "later", [{ id: "root", component: "Text", text: "Hi" }]);

    expect(lookup()).toBe(store.getSurface("later"));
    expect(store.surfaceIds()).toEqual(["later"]);
    store.dispose();
  });

  test("surfaceSignal reads undefined again after deleteSurface", () => {
    const store = makeStore();
    const lookup = store.surfaceSignal("gone");
    createSurface(store, "gone", [{ id: "root", component: "Text", text: "Hi" }]);
    const surfaceStore = lookup();
    expect(surfaceStore).toBeDefined();

    store.processMessages([
      { version: "1.0", deleteSurface: { surfaceId: "gone" } },
    ]);

    expect(lookup()).toBeUndefined();
    expect(store.getSurface("gone")).toBeUndefined();
    expect(surfaceStore!.disposed()).toBe(true);
    store.dispose();
  });

  test("separate surfaces keep separate lookup signals and data signals", () => {
    const store = makeStore();
    createSurface(
      store,
      "s1",
      [{ id: "root", component: "Text", text: "One" }],
      { name: "one" },
    );
    createSurface(
      store,
      "s2",
      [{ id: "root", component: "Text", text: "Two" }],
      { name: "two" },
    );

    const s1 = store.getSurface("s1")!;
    const s2 = store.getSurface("s2")!;
    const s1Name = s1.dataSignal("/name");
    const s2Name = s2.dataSignal("/name");
    expect(s1Name()).toBe("one");
    expect(s2Name()).toBe("two");

    let s2Runs = 0;
    const s2Derived = computed(() => {
      s2Runs += 1;
      return s2Name();
    });
    expect(s2Derived()).toBe("two");
    expect(s2Runs).toBe(1);

    s1.setData("/name", "changed");

    expect(s1Name()).toBe("changed");
    expect(s2Name()).toBe("two");
    expect(s2Derived()).toBe("two");
    expect(s2Runs).toBe(1);
    expect(store.surfaceSignal("s1")()).toBe(s1);
    expect(store.surfaceSignal("s2")()).toBe(s2);
    store.dispose();
  });
});

describe("SurfaceSignalStore.dataSignal rules", () => {
  test("dataSignal reads undefined before a missing path is written", () => {
    const store = makeStore();
    createSurface(store, "s", [{ id: "root", component: "Text", text: "Hi" }]);
    const surfaceStore = store.getSurface("s")!;
    const value = surfaceStore.dataSignal("/later/value");

    expect(value()).toBeUndefined();

    surfaceStore.setData("/later/value", 42);

    expect(value()).toBe(42);
    store.dispose();
  });

  test("dataSignal returns one cached signal for the same canonical path", () => {
    const store = makeStore();
    createSurface(
      store,
      "s",
      [{ id: "root", component: "Text", text: "Hi" }],
      { user: { name: "Ada" } },
    );
    const surfaceStore = store.getSurface("s")!;
    const scoped = surfaceStore.dataSignal("name", "/user");
    const absolute = surfaceStore.dataSignal("/user/name");

    expect(scoped).toBe(absolute);
    expect(scoped()).toBe("Ada");
    expect(surfaceStore.activeDataSignalCount).toBe(1);
    store.dispose();
  });

  test("a write to a parent path updates a child signal", () => {
    const store = makeStore();
    createSurface(
      store,
      "s",
      [{ id: "root", component: "Text", text: "Hi" }],
      { user: { name: "Ada", role: "Admin" } },
    );
    const surfaceStore = store.getSurface("s")!;
    const name = surfaceStore.dataSignal("/user/name");
    let runs = 0;
    const derivedName = computed(() => {
      runs += 1;
      return name();
    });
    expect(derivedName()).toBe("Ada");
    expect(runs).toBe(1);

    surfaceStore.setData("/user", { name: "Grace", role: "Admin" });

    expect(derivedName()).toBe("Grace");
    expect(runs).toBe(2);
    store.dispose();
  });

  test("a write to a sibling path does not fire another signal", () => {
    const store = makeStore();
    createSurface(
      store,
      "s",
      [{ id: "root", component: "Text", text: "Hi" }],
      { user: { name: "Ada", role: "Admin" } },
    );
    const surfaceStore = store.getSurface("s")!;
    const name = surfaceStore.dataSignal("/user/name");
    const role = surfaceStore.dataSignal("/user/role");
    let nameRuns = 0;
    let roleRuns = 0;
    const derivedName = computed(() => {
      nameRuns += 1;
      return name();
    });
    const derivedRole = computed(() => {
      roleRuns += 1;
      return role();
    });
    expect(derivedName()).toBe("Ada");
    expect(derivedRole()).toBe("Admin");
    expect(nameRuns).toBe(1);
    expect(roleRuns).toBe(1);

    surfaceStore.setData("/user/name", "Grace");

    expect(derivedName()).toBe("Grace");
    expect(derivedRole()).toBe("Admin");
    expect(nameRuns).toBe(2);
    expect(roleRuns).toBe(1);
    store.dispose();
  });

  test("deleteData resets the signal for the deleted path to undefined", () => {
    const store = makeStore();
    createSurface(
      store,
      "s",
      [{ id: "root", component: "Text", text: "Hi" }],
      { user: { name: "Ada", role: "Admin" } },
    );
    const surfaceStore = store.getSurface("s")!;
    const name = surfaceStore.dataSignal("/user/name");
    expect(name()).toBe("Ada");

    surfaceStore.deleteData("/user/name");

    expect(name()).toBeUndefined();
    expect(surfaceStore.surface.dataModel.get("/user/name")).toBeUndefined();
    store.dispose();
  });
});

describe("SurfaceSignalStore.errors rules", () => {
  test("errors is empty for a surface with no resolution errors", () => {
    const store = makeStore();
    createSurface(store, "clean", [{ id: "root", component: "Text", text: "Hi" }]);
    const surfaceStore = store.getSurface("clean")!;

    expect(surfaceStore.errors()).toEqual([]);
    store.dispose();
  });

  test("records one error per unresolved component type with its code and surface id", () => {
    const store = makeStore();
    createSurface(store, "err-s", [
      { id: "root", component: "Column", children: ["bad1", "bad2"] },
      { id: "bad1", component: "NotInCatalog" },
      { id: "bad2", component: "AlsoNotInCatalog" },
    ]);
    const surfaceStore = store.getSurface("err-s")!;

    expect(surfaceStore.errors().length).toBe(2);
    expect(surfaceStore.errors().map((entry) => entry.error.code)).toEqual([
      "UNKNOWN_COMPONENT_TYPE",
      "UNKNOWN_COMPONENT_TYPE",
    ]);
    expect(surfaceStore.errors().map((entry) => entry.error.surfaceId)).toEqual([
      "err-s",
      "err-s",
    ]);
    // Resolver-dispatched errors carry code + surface id, but no path.
    expect(surfaceStore.errors().map((entry) => "path" in entry.error)).toEqual([
      false,
      false,
    ]);
    store.dispose();
  });

  test("a surface-emitted error keeps its code and path in errors", () => {
    const store = makeStore();
    createSurface(store, "surface-err", [
      { id: "root", component: "Text", text: "Hi" },
    ]);
    const surfaceStore = store.getSurface("surface-err")!;

    surfaceStore.surface.emitError(
      "VALIDATION_FAILED",
      "bad value",
      "/customer/name",
    );

    const envelope = surfaceStore.errors()[0]!;
    expect(envelope.version).toBe("1.0");
    expect(envelope.error.code).toBe("VALIDATION_FAILED");
    expect((envelope.error as { path?: string }).path).toBe("/customer/name");
    store.dispose();
  });

  test("errors keeps earlier entries after a later good update until clearErrors", () => {
    const store = makeStore();
    createSurface(store, "keep-err", [
      { id: "root", component: "Card", child: "bad" },
      { id: "bad", component: "NotInCatalog" },
    ]);
    const surfaceStore = store.getSurface("keep-err")!;
    expect(surfaceStore.errors().length).toBe(1);
    expect(surfaceStore.errors()[0]!.error.code).toBe("UNKNOWN_COMPONENT_TYPE");

    store.processMessages([
      {
        version: "1.0",
        updateDataModel: { surfaceId: "keep-err", path: "/counter", value: 1 },
      },
    ]);

    expect(surfaceStore.errors().length).toBe(1);
    expect(surfaceStore.errors()[0]!.error.code).toBe("UNKNOWN_COMPONENT_TYPE");

    surfaceStore.clearErrors();

    expect(surfaceStore.errors()).toEqual([]);
    store.dispose();
  });
});

describe("ReactiveComponentNode rules", () => {
  test("props signal updates when the same component id is upserted", () => {
    const store = makeStore();
    createSurface(store, "upsert", [
      { id: "root", component: "Text", text: "Before" },
    ]);
    const surfaceStore = store.getSurface("upsert")!;
    const rootNode = surfaceStore.rootNode()!;
    const bridge = surfaceStore.nodeBridge(rootNode);
    let runs = 0;
    const text = computed(() => {
      runs += 1;
      return (bridge.props()["text"] as ResolvedBinding<string>).value;
    });

    expect(text()).toBe("Before");
    expect(runs).toBe(1);

    store.processMessages([
      {
        version: "1.0",
        updateComponents: {
          surfaceId: "upsert",
          components: [{ id: "root", component: "Text", text: "After" }],
        },
      },
    ]);

    expect(text()).toBe("After");
    expect(runs).toBe(2);
    expect(surfaceStore.nodeBridge(surfaceStore.rootNode()!)).toBe(bridge);
    store.dispose();
  });

  test("a removed component bridge is destroyed and keeps its last props", () => {
    const store = makeStore();
    createSurface(store, "remove", [
      { id: "root", component: "Column", children: ["child"] },
      { id: "child", component: "Text", text: "Leaf" },
    ]);
    const surfaceStore = store.getSurface("remove")!;
    const rootBridge = surfaceStore.nodeBridge(surfaceStore.rootNode()!);
    const children = rootBridge.prop<ComponentNode[]>("children");
    const child = children()[0]!;
    const childBridge = surfaceStore.nodeBridge(child);
    expect(childBridge.destroyed()).toBe(false);
    expect((childBridge.props()["text"] as ResolvedBinding<string>).value).toBe(
      "Leaf",
    );
    expect(surfaceStore.activeNodeBridgeCount).toBe(2);

    const surfaceModel = store.processor.surfaces.get("remove")!;
    expect(surfaceModel.removeComponent("child")).toBe(true);

    expect(child.disposed).toBe(true);
    expect(childBridge.destroyed()).toBe(true);
    // Reading a removed node bridge still returns its last resolved snapshot.
    expect((childBridge.props()["text"] as ResolvedBinding<string>).value).toBe(
      "Leaf",
    );
    // The root still references "child", so re-materialization yields a fresh
    // pending placeholder rather than an empty child list.
    expect(children().length).toBe(1);
    expect(children()[0]!.componentId).toBe("child");
    expect(children()[0]!.isPlaceholder).toBe(true);
    expect(children()[0]).not.toBe(child);
    expect(surfaceStore.activeNodeBridgeCount).toBe(1);
    store.dispose();
  });

  test("accessibility is undefined when the component declares none", () => {
    const store = makeStore();
    createSurface(store, "plain", [
      { id: "root", component: "Text", text: "Hi" },
    ]);
    const surfaceStore = store.getSurface("plain")!;
    const bridge = surfaceStore.nodeBridge(surfaceStore.rootNode()!);

    expect(bridge.accessibility()).toBeUndefined();
    store.dispose();
  });
});

describe("dispose and deleteSurface rules", () => {
  test("deleteSurface freezes the surface data signals", () => {
    const store = makeStore();
    createSurface(
      store,
      "delete-s",
      [{ id: "root", component: "Text", text: "Hi" }],
      { count: 1 },
    );
    const surfaceStore = store.getSurface("delete-s")!;
    const count = surfaceStore.dataSignal("/count");
    let runs = 0;
    const derivedCount = computed(() => {
      runs += 1;
      return count();
    });
    expect(derivedCount()).toBe(1);
    expect(runs).toBe(1);

    store.processMessages([
      { version: "1.0", deleteSurface: { surfaceId: "delete-s" } },
    ]);
    expect(surfaceStore.disposed()).toBe(true);

    surfaceStore.surface.dataModel.set("/count", 2);

    expect(count()).toBe(1);
    expect(derivedCount()).toBe(1);
    expect(runs).toBe(1);
    store.dispose();
  });

  test("A2uiStore.dispose freezes data signals and both disposes are idempotent", () => {
    const store = makeStore();
    createSurface(
      store,
      "dispose-s",
      [{ id: "root", component: "Text", text: "Hi" }],
      { count: 1 },
    );
    const surfaceStore = store.getSurface("dispose-s")!;
    const count = surfaceStore.dataSignal("/count");
    let runs = 0;
    const derivedCount = computed(() => {
      runs += 1;
      return count();
    });
    expect(derivedCount()).toBe(1);
    expect(runs).toBe(1);

    store.dispose();

    expect(store.disposed).toBe(true);
    expect(surfaceStore.disposed()).toBe(true);
    expect(surfaceStore.rootNode()).toBeUndefined();
    expect(surfaceStore.activeDataSignalCount).toBe(0);

    surfaceStore.surface.dataModel.set("/count", 2);

    expect(count()).toBe(1);
    expect(derivedCount()).toBe(1);
    expect(runs).toBe(1);
    expect(() => store.dispose()).not.toThrow();
    expect(() => surfaceStore.dispose()).not.toThrow();
  });
});
