import { describe, expect, test } from "nsh/test";
import { computed } from "nsh";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
} from "../core/catalog";
import {
  ResolvedBinding,
  isWritable,
  type ComponentNode,
} from "../core/resolver";
import { A2uiStore } from "./surface_store";

function makeStore(): A2uiStore {
  return new A2uiStore({
    catalogs: [Catalog.fromJson(buildV10BasicCatalogDocument())],
    strictMode: false,
  });
}

describe("A2uiStore & SurfaceSignalStore (nsh 0.7.1 signal bridge)", () => {
  test("tracks surface creation, rootNode, template children, and leaf prop signals", () => {
    const store = makeStore();
    expect(store.surfaceIds()).toEqual([]);

    const mainSurfaceSignal = store.surfaceSignal("main");
    expect(mainSurfaceSignal()).toBeUndefined();

    store.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: "main",
          catalogId: BASIC_CATALOG_V1_ID,
          dataModel: {
            restaurants: [
              { title: "The Golden Fork" },
              { title: "Blue Harbor" },
            ],
          },
          components: [
            {
              id: "root",
              component: "Column",
              children: { componentId: "item", path: "/restaurants" },
            },
            {
              id: "item",
              component: "Text",
              text: { "@path": "title" },
            },
          ],
        },
      },
    ]);

    expect(store.surfaceIds()).toEqual(["main"]);
    const surfaceStore = mainSurfaceSignal()!;
    expect(surfaceStore).toBeDefined();
    expect(surfaceStore.disposed()).toBe(false);
    expect(surfaceStore.activeNodeCount()).toBe(3);

    const root = surfaceStore.rootNode()!;
    expect(root).toBeDefined();
    expect(root.type).toBe("Column");

    const rootBridge = surfaceStore.nodeBridge(root);
    const childrenAccessor = rootBridge.prop<ComponentNode[]>("children");
    expect(childrenAccessor().length).toBe(2);

    const item0 = childrenAccessor()[0]!;
    const item1 = childrenAccessor()[1]!;
    const item0Bridge = surfaceStore.nodeBridge(item0);
    const item1Bridge = surfaceStore.nodeBridge(item1);

    let rootPropRecomputes = 0;
    const rootChildrenCount = computed(() => {
      rootPropRecomputes += 1;
      return rootBridge.props()["children"] as ComponentNode[];
    });

    let item0TextRecomputes = 0;
    const item0Text = computed(() => {
      item0TextRecomputes += 1;
      const binding = item0Bridge.prop<ResolvedBinding<string>>("text")();
      return binding.value;
    });

    let item1TextRecomputes = 0;
    const item1Text = computed(() => {
      item1TextRecomputes += 1;
      const binding = item1Bridge.prop<ResolvedBinding<string>>("text")();
      return binding.value;
    });

    expect(rootChildrenCount().length).toBe(2);
    expect(item0Text()).toBe("The Golden Fork");
    expect(item1Text()).toBe("Blue Harbor");
    expect(rootPropRecomputes).toBe(1);
    expect(item0TextRecomputes).toBe(1);
    expect(item1TextRecomputes).toBe(1);

    // Scalar dataModel update on item 0 must update item0Text ONLY, with 0 parent
    // or sibling recomputes and preserved node identity.
    store.processMessages([
      {
        version: "1.0",
        updateDataModel: {
          surfaceId: "main",
          path: "/restaurants/0/title",
          value: "The Platinum Fork",
        },
      },
    ]);

    expect(item0Text()).toBe("The Platinum Fork");
    expect(item1Text()).toBe("Blue Harbor");
    expect(rootChildrenCount()[0]).toBe(item0);
    expect(rootPropRecomputes).toBe(1);
    expect(item0TextRecomputes).toBe(2);
    expect(item1TextRecomputes).toBe(1);

    // Two-way write via WritableBinding propagates back to dataSignal.
    const titleDataSig = surfaceStore.dataSignal("/restaurants/0/title");
    expect(titleDataSig()).toBe("The Platinum Fork");
    const binding = item0Bridge.prop<ResolvedBinding<string>>("text")();
    expect(isWritable(binding)).toBe(true);
    if (isWritable(binding)) {
      binding.set("The Diamond Fork");
    }
    expect(titleDataSig()).toBe("The Diamond Fork");
    expect(item0Text()).toBe("The Diamond Fork");

    store.dispose();
    expect(store.disposed).toBe(true);
    expect(surfaceStore.disposed()).toBe(true);
    expect(surfaceStore.activeDataSignalCount).toBe(0);
    expect(surfaceStore.activeNodeBridgeCount).toBe(0);
  });

  test("per-path dataSignal isolates unrelated writes and deleteSurface cleans up everything", () => {
    const store = makeStore();
    store.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: "s1",
          catalogId: BASIC_CATALOG_V1_ID,
          dataModel: { user: { name: "Ada", role: "Admin" } },
          components: [
            { id: "root", component: "Text", text: { "@path": "/user/name" } },
          ],
        },
      },
    ]);

    const surfaceStore = store.getSurface("s1")!;
    const nameSig = surfaceStore.dataSignal("name", "/user");
    const roleSig = surfaceStore.dataSignal("role", "/user");

    let nameRuns = 0;
    const derivedName = computed(() => {
      nameRuns += 1;
      return String(nameSig());
    });
    let roleRuns = 0;
    const derivedRole = computed(() => {
      roleRuns += 1;
      return String(roleSig());
    });

    expect(derivedName()).toBe("Ada");
    expect(derivedRole()).toBe("Admin");
    expect(nameRuns).toBe(1);
    expect(roleRuns).toBe(1);

    surfaceStore.setData("name", "Grace", "/user");
    expect(derivedName()).toBe("Grace");
    expect(derivedRole()).toBe("Admin");
    expect(nameRuns).toBe(2);
    expect(roleRuns).toBe(1);

    const rootNode = surfaceStore.rootNode()!;
    const rootBridge = surfaceStore.nodeBridge(rootNode);
    expect(rootBridge.destroyed()).toBe(false);
    expect(surfaceStore.activeDataSignalCount).toBe(2);
    expect(surfaceStore.activeNodeBridgeCount).toBe(1);

    // deleteSurface disposes surface store, resolver, node bridges, and data signals.
    store.processMessages([
      {
        version: "1.0",
        deleteSurface: { surfaceId: "s1" },
      },
    ]);

    expect(store.surfaceIds()).toEqual([]);
    expect(store.getSurface("s1")).toBeUndefined();
    expect(surfaceStore.disposed()).toBe(true);
    expect(surfaceStore.rootNode()).toBeUndefined();
    expect(rootNode.disposed).toBe(true);
    expect(rootBridge.destroyed()).toBe(true);
    expect(surfaceStore.activeDataSignalCount).toBe(0);
    expect(surfaceStore.activeNodeBridgeCount).toBe(0);

    store.dispose();
  });

  test("surfaces resolution errors reactively on SurfaceSignalStore.errors", () => {
    const store = makeStore();
    store.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: "err-s",
          catalogId: BASIC_CATALOG_V1_ID,
          components: [
            { id: "root", component: "Card", child: "bad" },
            { id: "bad", component: "NotInCatalog" },
          ],
        },
      },
    ]);

    const surfaceStore = store.getSurface("err-s")!;
    expect(surfaceStore.errors().length).toBe(1);
    expect(surfaceStore.errors()[0]!.error.code).toBe("UNKNOWN_COMPONENT_TYPE");

    surfaceStore.clearErrors();
    expect(surfaceStore.errors().length).toBe(0);

    store.dispose();
  });

  test("updates ReactiveComponentNode.accessibility and nested Icon svgPath reactively", () => {
    const store = makeStore();
    store.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: "a11y-s",
          catalogId: BASIC_CATALOG_V1_ID,
          dataModel: {
            a11yLabel: "Initial Label",
            isHidden: false,
            glyph: "M2 2H22V22H2Z",
          },
          components: [
            {
              id: "root",
              component: "Icon",
              name: { svgPath: { "@path": "/glyph" } },
              "@accessibility": {
                label: { "@path": "/a11yLabel" },
                hidden: { "@path": "/isHidden" },
              },
            },
          ],
        },
      },
    ]);

    const surfaceStore = store.getSurface("a11y-s")!;
    const rootBridge = surfaceStore.nodeBridge(surfaceStore.rootNode()!);
    expect(rootBridge.accessibility()).toEqual({
      label: "Initial Label",
      hidden: false,
    });
    expect(rootBridge.prop<ResolvedBinding<{ svgPath: string }>>("name")().value).toEqual({
      svgPath: "M2 2H22V22H2Z",
    });

    // Mutate only @accessibility bindings without touching component props.
    store.processMessages([
      {
        version: "1.0",
        updateDataModel: {
          surfaceId: "a11y-s",
          path: "/a11yLabel",
          value: "Updated Label",
        },
      },
      {
        version: "1.0",
        updateDataModel: {
          surfaceId: "a11y-s",
          path: "/isHidden",
          value: true,
        },
      },
    ]);
    expect(rootBridge.accessibility()).toEqual({
      label: "Updated Label",
      hidden: true,
    });

    // Mutate nested svgPath DynamicString binding.
    store.processMessages([
      {
        version: "1.0",
        updateDataModel: {
          surfaceId: "a11y-s",
          path: "/glyph",
          value: "M12 2L22 22H2Z",
        },
      },
    ]);
    expect(rootBridge.prop<ResolvedBinding<{ svgPath: string }>>("name")().value).toEqual({
      svgPath: "M12 2L22 22H2Z",
    });

    store.dispose();
  });
});
