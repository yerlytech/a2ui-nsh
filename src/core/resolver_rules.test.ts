import { describe, expect, test } from "nsh/test";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
} from "./catalog";
import {
  MessageProcessor,
  type ComponentModel,
  type SurfaceModel,
} from "./processor";
import {
  MutableComponentNode,
  NodeResolver,
  PLACEHOLDER_TYPE,
  ResolvedBinding,
  WritableBinding,
  isComponentNode,
  isWritable,
  sameBinding,
  type ComponentNode,
  type NodeAction,
} from "./resolver";

// One rule per test for src/core/resolver.ts. The broad scenarios live in
// resolver.test.ts; this file pins each rule on its own.

const catalog = Catalog.fromJson(buildV10BasicCatalogDocument());

function comp(
  id: string,
  type: string,
  properties: Record<string, unknown>,
  extras: {
    readonly accessibility?: Record<string, unknown>;
    readonly metadata?: Record<string, unknown>;
  } = {},
): ComponentModel {
  const normalizedWire: Record<string, unknown> = {
    id,
    component: type,
    ...properties,
  };
  if (extras.accessibility) {
    normalizedWire["@accessibility"] = extras.accessibility;
  }
  if (extras.metadata) {
    normalizedWire["@metadata"] = extras.metadata;
  }
  return {
    id,
    type,
    catalogId: catalog.catalogId,
    catalog,
    properties,
    accessibility: extras.accessibility,
    metadata: extras.metadata,
    normalizedWire,
  };
}

interface SentAction {
  readonly name: string;
  readonly sourceComponentId: unknown;
  readonly context: Record<string, unknown> | undefined;
}

interface Harness {
  readonly processor: MessageProcessor;
  readonly surface: SurfaceModel;
  readonly errorCodes: string[];
  readonly sent: SentAction[];
  resolver(rootId?: string): NodeResolver;
}

function harness(data: Record<string, unknown> = {}): Harness {
  const errorCodes: string[] = [];
  const sent: SentAction[] = [];
  const processor = new MessageProcessor({
    catalogs: [catalog],
    strictMode: false,
    onError: (env) => errorCodes.push(env.error.code),
    onAction: (env) => {
      sent.push({
        name: env.action.name,
        sourceComponentId: (env.action as unknown as Record<string, unknown>)[
          "sourceComponentId"
        ],
        context: env.action.context,
      });
    },
  });
  const surface = processor.createSurfaceModel({
    id: "s1",
    defaultCatalogId: BASIC_CATALOG_V1_ID,
    data,
  });
  return {
    processor,
    surface,
    errorCodes,
    sent,
    resolver: (rootId?: string) =>
      new NodeResolver({ surface, processor, rootId }),
  };
}

function kids(node: ComponentNode | undefined, key = "children"): ComponentNode[] {
  return (node?.props[key] ?? []) as ComponentNode[];
}

function bareNode(
  state: "resolved" | "pending" | "unknown-type" | "cyclic" = "resolved",
  initialProps: Record<string, unknown> = {},
): MutableComponentNode {
  return new MutableComponentNode({
    instanceId: "n",
    componentId: "n",
    type: state === "pending" ? PLACEHOLDER_TYPE : "Text",
    catalogId: BASIC_CATALOG_V1_ID,
    dataPath: "/",
    state,
    initialProps,
  });
}

describe("ResolvedBinding / WritableBinding", () => {
  test("a literal prop resolves to a non-writable ResolvedBinding", () => {
    const h = harness();
    h.surface.upsertComponents([comp("root", "Text", { text: "Hi" })]);
    const binding = h.resolver().rootNode!.props["text"] as ResolvedBinding;
    expect(binding instanceof ResolvedBinding).toBe(true);
    expect(isWritable(binding)).toBe(false);
    expect(binding.value).toBe("Hi");
  });

  test("a relative data path resolves writable against the node scope", () => {
    const h = harness({ items: [{ title: "A" }] });
    h.surface.upsertComponents([
      comp("root", "Column", { children: { componentId: "row", path: "/items" } }),
      comp("row", "Text", { text: { "@path": "title" } }),
    ]);
    const row = kids(h.resolver().rootNode)[0]!;
    const binding = row.props["text"] as ResolvedBinding;
    expect(isWritable(binding)).toBe(true);
    const writable = binding as WritableBinding;
    expect(writable.path).toBe("title");
    expect(writable.resolvedPath).toBe("/items/0/title");
    expect(writable.value).toBe("A");
  });

  test("an absolute data path ignores the template item scope", () => {
    const h = harness({ heading: "H", items: [{ title: "A" }] });
    h.surface.upsertComponents([
      comp("root", "Column", { children: { componentId: "row", path: "/items" } }),
      comp("row", "Text", { text: { "@path": "/heading" } }),
    ]);
    const row = kids(h.resolver().rootNode)[0]!;
    const binding = row.props["text"] as WritableBinding;
    expect(binding.resolvedPath).toBe("/heading");
    expect(binding.value).toBe("H");
  });

  test("set on a writable binding writes the resolved path in the data model", () => {
    const h = harness({ items: [{ title: "A" }, { title: "B" }] });
    h.surface.upsertComponents([
      comp("root", "Column", { children: { componentId: "row", path: "/items" } }),
      comp("row", "TextField", { label: "T", value: { "@path": "title" } }),
    ]);
    const second = kids(h.resolver().rootNode)[1]!;
    (second.props["value"] as WritableBinding).set("Z");
    expect(h.surface.dataModel.get("/items/1/title")).toBe("Z");
    expect(h.surface.dataModel.get("/items/0/title")).toBe("A");
  });

  test("a path that does not exist yet resolves writable with value undefined", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "TextField", { label: "T", value: { "@path": "/missing" } }),
    ]);
    const binding = h.resolver().rootNode!.props["value"] as WritableBinding;
    expect(isWritable(binding)).toBe(true);
    expect(binding.value).toBe(undefined);
  });
});

describe("sameBinding", () => {
  const noop = (): void => {};

  test("is true for the same path, the same scope and an equal value", () => {
    const a = new WritableBinding("x", noop, "name", "/p/0/name");
    const b = new WritableBinding("x", noop, "name", "/p/0/name");
    expect(sameBinding(a, b)).toBe(true);
  });

  test("is false for the same authored path in another scope", () => {
    const a = new WritableBinding("x", noop, "name", "/p/0/name");
    const b = new WritableBinding("x", noop, "name", "/p/1/name");
    expect(sameBinding(a, b)).toBe(false);
  });

  test("is false for different authored paths that resolve to the same pointer", () => {
    const a = new WritableBinding("x", noop, "name", "/p/0/name");
    const b = new WritableBinding("x", noop, "/p/0/name", "/p/0/name");
    expect(sameBinding(a, b)).toBe(false);
  });

  test("is false for the same path when the value differs", () => {
    const a = new WritableBinding("x", noop, "name", "/p/0/name");
    const b = new WritableBinding("y", noop, "name", "/p/0/name");
    expect(sameBinding(a, b)).toBe(false);
  });

  test("is false between a literal and a path with the same value", () => {
    const literal = new ResolvedBinding("x");
    const path = new WritableBinding("x", noop, "name", "/name");
    expect(sameBinding(literal, path)).toBe(false);
    expect(sameBinding(path, literal)).toBe(false);
  });

  test("is true for two deep-equal literal objects", () => {
    expect(
      sameBinding(
        new ResolvedBinding({ a: [1, { b: 2 }] }),
        new ResolvedBinding({ a: [1, { b: 2 }] }),
      ),
    ).toBe(true);
  });

  test("ignores the setter function when comparing writable bindings", () => {
    const a = new WritableBinding("x", () => {}, "name", "/name");
    const b = new WritableBinding("x", () => {}, "name", "/name");
    expect(sameBinding(a, b)).toBe(true);
  });
});

describe("isComponentNode", () => {
  test("is true for a resolver node and a bare MutableComponentNode", () => {
    const h = harness();
    h.surface.upsertComponents([comp("root", "Text", { text: "Hi" })]);
    expect(isComponentNode(h.resolver().rootNode)).toBe(true);
    expect(isComponentNode(bareNode())).toBe(true);
  });

  test("is false for a plain object shaped like a node", () => {
    const lookalike = {
      instanceId: "root",
      id: "a2ui-node-1",
      componentId: "root",
      type: "Text",
      dataPath: "/",
      state: "resolved",
      isPlaceholder: false,
      disposed: false,
      props: {},
      onPropsChange: () => () => {},
      toJSON: () => ({}),
    };
    expect(isComponentNode(lookalike)).toBe(false);
  });

  test("is false for null, undefined, primitives and bindings", () => {
    expect(isComponentNode(null)).toBe(false);
    expect(isComponentNode(undefined)).toBe(false);
    expect(isComponentNode("root")).toBe(false);
    expect(isComponentNode(0)).toBe(false);
    expect(isComponentNode(true)).toBe(false);
    expect(isComponentNode(new ResolvedBinding("root"))).toBe(false);
  });
});

describe("MutableComponentNode", () => {
  test("every node gets a distinct runtime id", () => {
    expect(bareNode().id).not.toBe(bareNode().id);
    expect(bareNode().id.startsWith("a2ui-node-")).toBe(true);
  });

  test("isPlaceholder is false only in the resolved state", () => {
    expect(bareNode("resolved").isPlaceholder).toBe(false);
    expect(bareNode("pending").isPlaceholder).toBe(true);
    expect(bareNode("unknown-type").isPlaceholder).toBe(true);
    expect(bareNode("cyclic").isPlaceholder).toBe(true);
  });

  test("setProps returns false and notifies nobody when every key is identical", () => {
    const shared = { deep: true };
    const node = bareNode("resolved", { a: 1, b: shared });
    let calls = 0;
    node.onPropsChange(() => {
      calls += 1;
    });
    expect(node.setProps({ a: 1, b: shared })).toBe(false);
    expect(calls).toBe(0);
  });

  test("setProps compares each key by identity, not deep equality", () => {
    const node = bareNode("resolved", { b: { deep: true } });
    let calls = 0;
    node.onPropsChange(() => {
      calls += 1;
    });
    expect(node.setProps({ b: { deep: true } })).toBe(true);
    expect(calls).toBe(1);
  });

  test("setProps returns true and notifies once with the next props when they differ", () => {
    const node = bareNode("resolved", { a: 1 });
    const seen: unknown[] = [];
    node.onPropsChange((p) => seen.push(p));
    const next = { a: 2 };
    expect(node.setProps(next)).toBe(true);
    expect(seen).toEqual([next]);
    expect(node.props).toBe(next);
  });

  test("setProps sees an added or removed key as a change", () => {
    const node = bareNode("resolved", { a: 1 });
    expect(node.setProps({ a: 1, b: undefined })).toBe(true);
    expect(node.setProps({ a: 1 })).toBe(true);
  });

  test("setProps with suppressNotify changes props without a notification", () => {
    const node = bareNode("resolved", { a: 1 });
    let calls = 0;
    node.onPropsChange(() => {
      calls += 1;
    });
    expect(node.setProps({ a: 2 }, true)).toBe(true);
    expect(node.props["a"]).toBe(2);
    expect(calls).toBe(0);
  });

  test("setMetadata returns false and notifies nobody for deep-equal metadata", () => {
    const node = bareNode();
    node.setMetadata({ extensions: { t: [1] } });
    let calls = 0;
    node.onMetadataChange(() => {
      calls += 1;
    });
    expect(node.setMetadata({ extensions: { t: [1] } })).toBe(false);
    expect(calls).toBe(0);
  });

  test("setMetadata returns true and notifies once when metadata differs", () => {
    const node = bareNode();
    const seen: unknown[] = [];
    node.onMetadataChange((m) => seen.push(m));
    expect(node.setMetadata({ extensions: { t: 1 } })).toBe(true);
    expect(node.setMetadata(undefined)).toBe(true);
    expect(seen).toEqual([{ extensions: { t: 1 } }, undefined]);
  });

  test("setMetadata does not notify props listeners", () => {
    const node = bareNode();
    let calls = 0;
    node.onPropsChange(() => {
      calls += 1;
    });
    node.setMetadata({ extensions: { t: 1 } });
    expect(calls).toBe(0);
  });

  test("setAccessibility with suppressNotify changes the value without a notification", () => {
    const node = bareNode();
    let calls = 0;
    node.onAccessibilityChange(() => {
      calls += 1;
    });
    expect(node.setAccessibility({ label: "x" }, true)).toBe(true);
    expect(node.accessibility).toEqual({ label: "x" });
    expect(calls).toBe(0);
    expect(node.setAccessibility({ label: "x" })).toBe(false);
    expect(node.setAccessibility({ label: "y" })).toBe(true);
    expect(calls).toBe(1);
  });

  test("the onPropsChange unsubscribe stops further calls and is safe to call twice", () => {
    const node = bareNode("resolved", { a: 0 });
    let calls = 0;
    const off = node.onPropsChange(() => {
      calls += 1;
    });
    node.setProps({ a: 1 });
    off();
    off();
    node.setProps({ a: 2 });
    expect(calls).toBe(1);
  });

  test("the onMetadataChange unsubscribe stops further calls", () => {
    const node = bareNode();
    let calls = 0;
    const off = node.onMetadataChange(() => {
      calls += 1;
    });
    off();
    node.setMetadata({ extensions: { t: 1 } });
    expect(calls).toBe(0);
  });

  test("the onDestroyed unsubscribe stops the call on dispose", () => {
    const node = bareNode();
    let kept = 0;
    let dropped = 0;
    node.onDestroyed(() => {
      kept += 1;
    });
    const off = node.onDestroyed(() => {
      dropped += 1;
    });
    off();
    node.dispose();
    expect(kept).toBe(1);
    expect(dropped).toBe(0);
  });

  test("dispose runs cleanups once in registration order, then onDestroyed listeners", () => {
    const node = bareNode();
    const order: string[] = [];
    node.onDestroyed(() => order.push("destroyed-1"));
    node.addCleanup(() => order.push("cleanup-1"));
    node.onDestroyed(() => order.push("destroyed-2"));
    node.addCleanup(() => order.push("cleanup-2"));
    node.dispose();
    expect(order).toEqual([
      "cleanup-1",
      "cleanup-2",
      "destroyed-1",
      "destroyed-2",
    ]);
  });

  test("dispose twice is a no-op", () => {
    const node = bareNode();
    let cleanups = 0;
    let destroyed = 0;
    node.addCleanup(() => {
      cleanups += 1;
    });
    node.onDestroyed(() => {
      destroyed += 1;
    });
    node.dispose();
    node.dispose();
    expect(cleanups).toBe(1);
    expect(destroyed).toBe(1);
  });

  test("disposed flips on dispose", () => {
    const node = bareNode();
    expect(node.disposed).toBe(false);
    node.dispose();
    expect(node.disposed).toBe(true);
  });

  test("addCleanup on a disposed node runs the cleanup at once", () => {
    const node = bareNode();
    node.dispose();
    let ran = 0;
    node.addCleanup(() => {
      ran += 1;
    });
    expect(ran).toBe(1);
  });

  test("a disposed node refuses setProps, setMetadata and setAccessibility", () => {
    const node = bareNode("resolved", { a: 1 });
    node.dispose();
    expect(node.setProps({ a: 2 })).toBe(false);
    expect(node.setMetadata({ extensions: { t: 1 } })).toBe(false);
    expect(node.setAccessibility({ label: "x" })).toBe(false);
    expect(node.props["a"]).toBe(1);
  });

  test("toJSON of a placeholder is id, type and state only", () => {
    const node = new MutableComponentNode({
      instanceId: "x",
      componentId: "x",
      type: PLACEHOLDER_TYPE,
      dataPath: "/",
      state: "pending",
      initialProps: { ignored: 1 },
    });
    expect(node.toJSON()).toEqual({
      id: "x",
      type: PLACEHOLDER_TYPE,
      state: "pending",
    });
  });

  test("toJSON of a resolved node unwraps bindings, names actions and nests children", () => {
    const child = bareNode("resolved", { text: new ResolvedBinding("c") });
    const node = new MutableComponentNode({
      instanceId: "p",
      componentId: "p",
      type: "Card",
      dataPath: "/",
      state: "resolved",
      initialProps: {
        title: new ResolvedBinding("T"),
        action: () => undefined,
        child,
        list: [new ResolvedBinding(1), 2],
      },
      initialMetadata: { extensions: { t: 1 } },
    });
    expect(node.toJSON()).toEqual({
      id: "p",
      type: "Card",
      title: "T",
      action: "<Action>",
      child: { id: "n", type: "Text", text: "c" },
      list: [1, 2],
      metadata: { extensions: { t: 1 } },
    });
  });

  test("toJSON leaves metadata out when there is none", () => {
    expect(bareNode("resolved", {}).toJSON()).toEqual({ id: "n", type: "Text" });
  });
});

describe("NodeResolver placeholders", () => {
  test("a child id not yet defined gives a pending Placeholder node and no error", () => {
    const h = harness();
    h.surface.upsertComponents([comp("root", "Column", { children: ["later"] })]);
    const pending = kids(h.resolver().rootNode)[0]!;
    expect(pending.state).toBe("pending");
    expect(pending.type).toBe(PLACEHOLDER_TYPE);
    expect(pending.catalogId).toBe(undefined);
    expect(pending.componentId).toBe("later");
    expect(pending.props).toEqual({});
    expect(h.errorCodes).toEqual([]);
  });

  test("the pending placeholder is replaced by the real node when the component arrives", () => {
    const h = harness();
    h.surface.upsertComponents([comp("root", "Column", { children: ["later"] })]);
    const resolver = h.resolver();
    const root = resolver.rootNode!;
    const pending = kids(root)[0]!;
    let rootEmits = 0;
    root.onPropsChange(() => {
      rootEmits += 1;
    });
    h.surface.upsertComponents([comp("later", "Text", { text: "here" })]);
    const real = kids(root)[0]!;
    expect(real).not.toBe(pending);
    expect(pending.disposed).toBe(true);
    expect(real.state).toBe("resolved");
    expect(real.type).toBe("Text");
    expect(rootEmits).toBe(1);
    expect(resolver.activeNodeCount).toBe(2);
  });

  test("an unknown component type gives an unknown-type node keeping the authored type", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["w"] }),
      comp("w", "Widget", { foo: 1 }),
    ]);
    const node = kids(h.resolver().rootNode)[0]!;
    expect(node.state).toBe("unknown-type");
    expect(node.type).toBe("Widget");
    expect(node.catalogId).toBe(BASIC_CATALOG_V1_ID);
    expect(node.props).toEqual({});
  });

  test("an unknown component type emits UNKNOWN_COMPONENT_TYPE once across later flushes", () => {
    const h = harness({ label: "a" });
    h.surface.upsertComponents([
      comp(
        "root",
        "Column",
        { children: ["w"] },
        { accessibility: { label: { "@path": "/label" } } },
      ),
      comp("w", "Widget", {}),
    ]);
    const resolver = h.resolver();
    h.surface.dataModel.set("/label", "b");
    h.surface.dataModel.set("/label", "c");
    expect(resolver.rootNode!.accessibility).toEqual({ label: "c" });
    expect(h.errorCodes).toEqual(["UNKNOWN_COMPONENT_TYPE"]);
  });

  test("A to B to A gives a cyclic leaf for the second A", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["a"] }),
      comp("a", "Card", { child: "b" }),
      comp("b", "Card", { child: "a" }),
    ]);
    const a = kids(h.resolver().rootNode)[0]!;
    const b = a.props["child"] as ComponentNode;
    const again = b.props["child"] as ComponentNode;
    expect(a.state).toBe("resolved");
    expect(b.state).toBe("resolved");
    expect(again.state).toBe("cyclic");
    expect(again.componentId).toBe("a");
    expect(again.type).toBe("Card");
    expect(again.isPlaceholder).toBe(true);
    expect(again.props).toEqual({});
  });

  test("a cycle emits CYCLIC_REFERENCE once across later flushes", () => {
    const h = harness({ label: "x" });
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["a"] }),
      comp("a", "Card", { child: "b" }),
      comp(
        "b",
        "Card",
        { child: "a" },
        { accessibility: { label: { "@path": "/label" } } },
      ),
    ]);
    const resolver = h.resolver();
    h.surface.dataModel.set("/label", "y");
    h.surface.upsertComponents([
      comp(
        "b",
        "Card",
        { child: "a" },
        { accessibility: { label: { "@path": "/label" } } },
      ),
    ]);
    expect(resolver.activeNodeCount).toBe(4);
    expect(h.errorCodes).toEqual(["CYCLIC_REFERENCE"]);
  });

  test("breaking the cycle replaces the cyclic leaf with the real node", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["a"] }),
      comp("a", "Card", { child: "b" }),
      comp("b", "Card", { child: "a" }),
    ]);
    const resolver = h.resolver();
    const b = kids(resolver.rootNode)[0]!.props["child"] as ComponentNode;
    const cyclic = b.props["child"] as ComponentNode;
    h.surface.upsertComponents([
      comp("b", "Card", { child: "t" }),
      comp("t", "Text", { text: "end" }),
    ]);
    const leaf = b.props["child"] as ComponentNode;
    expect(cyclic.disposed).toBe(true);
    expect(leaf.state).toBe("resolved");
    expect(leaf.componentId).toBe("t");
  });
});

describe("NodeResolver root", () => {
  test("rootNode is undefined before the root component arrives and set after", () => {
    const h = harness();
    const resolver = h.resolver();
    expect(resolver.rootNode).toBe(undefined);
    expect(resolver.activeNodeCount).toBe(0);
    h.surface.upsertComponents([comp("root", "Text", { text: "Hi" })]);
    expect(resolver.rootNode?.componentId).toBe("root");
    expect(resolver.rootNode?.dataPath).toBe("/");
    expect(resolver.activeNodeCount).toBe(1);
  });

  test("onRootNodeChange fires once when the root appears", () => {
    const h = harness();
    const resolver = h.resolver();
    const seen: Array<ComponentNode | undefined> = [];
    resolver.onRootNodeChange((r) => seen.push(r));
    h.surface.upsertComponents([comp("root", "Text", { text: "Hi" })]);
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(resolver.rootNode);
  });

  test("the rootId option picks another component as the root", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Text", { text: "default" }),
      comp("main", "Text", { text: "chosen" }),
    ]);
    const resolver = h.resolver("main");
    expect(resolver.rootNode?.componentId).toBe("main");
    expect(resolver.activeNodeCount).toBe(1);
  });

  test("re-sending the root with the same type keeps the root node", () => {
    const h = harness();
    h.surface.upsertComponents([comp("root", "Text", { text: "a" })]);
    const resolver = h.resolver();
    const before = resolver.rootNode!;
    h.surface.upsertComponents([comp("root", "Text", { text: "b" })]);
    expect(resolver.rootNode).toBe(before);
    expect((before.props["text"] as ResolvedBinding).value).toBe("b");
  });

  test("replacing the root with another type disposes the old tree", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["t"] }),
      comp("t", "Text", { text: "x" }),
    ]);
    const resolver = h.resolver();
    const oldRoot = resolver.rootNode!;
    const oldChild = kids(oldRoot)[0]!;
    let destroyed = 0;
    oldRoot.onDestroyed(() => {
      destroyed += 1;
    });
    oldChild.onDestroyed(() => {
      destroyed += 1;
    });
    const seen: Array<ComponentNode | undefined> = [];
    resolver.onRootNodeChange((r) => seen.push(r));
    h.surface.upsertComponents([comp("root", "Row", { children: ["t"] })]);
    expect(oldRoot.disposed).toBe(true);
    expect(oldChild.disposed).toBe(true);
    expect(destroyed).toBe(2);
    expect(resolver.rootNode).not.toBe(oldRoot);
    expect(resolver.rootNode?.type).toBe("Row");
    expect(kids(resolver.rootNode)[0]).not.toBe(oldChild);
    expect(seen).toEqual([resolver.rootNode]);
    expect(resolver.activeNodeCount).toBe(2);
  });

  test("removing the root component clears rootNode and disposes the tree", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["t"] }),
      comp("t", "Text", { text: "x" }),
    ]);
    const resolver = h.resolver();
    const oldRoot = resolver.rootNode!;
    const seen: Array<ComponentNode | undefined> = [];
    resolver.onRootNodeChange((r) => seen.push(r));
    h.surface.removeComponent("root");
    expect(resolver.rootNode).toBe(undefined);
    expect(oldRoot.disposed).toBe(true);
    expect(kids(oldRoot)[0]!.disposed).toBe(true);
    expect(seen).toEqual([undefined]);
    expect(resolver.activeNodeCount).toBe(0);
  });

  test("activeNodeCount counts placeholders as live nodes", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["t", "missing", "w"] }),
      comp("t", "Text", { text: "x" }),
      comp("w", "Widget", {}),
    ]);
    expect(h.resolver().activeNodeCount).toBe(4);
  });

  test("activeNodeCount follows a repeater as it grows and shrinks", () => {
    const h = harness({ items: [1, 2, 3] });
    h.surface.upsertComponents([
      comp("root", "Column", { children: { componentId: "row", path: "/items" } }),
      comp("row", "Text", { text: "r" }),
    ]);
    const resolver = h.resolver();
    expect(resolver.activeNodeCount).toBe(4);
    h.surface.dataModel.set("/items", [1]);
    expect(resolver.activeNodeCount).toBe(2);
    h.surface.dataModel.set("/items", [1, 2, 3, 4, 5]);
    expect(resolver.activeNodeCount).toBe(6);
    h.surface.dataModel.set("/items", []);
    expect(resolver.activeNodeCount).toBe(1);
  });
});

describe("NodeResolver removal", () => {
  test("removing a referenced component disposes its node and subtree once", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["c"] }),
      comp("c", "Card", { child: "t" }),
      comp("t", "Text", { text: "x" }),
    ]);
    const resolver = h.resolver();
    const card = kids(resolver.rootNode)[0]!;
    const text = card.props["child"] as ComponentNode;
    const order: string[] = [];
    card.onDestroyed(() => order.push("card"));
    text.onDestroyed(() => order.push("text"));
    h.surface.removeComponent("c");
    h.surface.dataModel.set("/unrelated", 1);
    expect(card.disposed).toBe(true);
    expect(text.disposed).toBe(true);
    expect(order).toEqual(["text", "card"]);
  });

  test("a removed component that is still referenced becomes a pending placeholder", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["t"] }),
      comp("t", "Text", { text: "x" }),
    ]);
    const resolver = h.resolver();
    h.surface.removeComponent("t");
    const slot = kids(resolver.rootNode)[0]!;
    expect(slot.state).toBe("pending");
    expect(slot.componentId).toBe("t");
    expect(resolver.activeNodeCount).toBe(2);
    h.surface.upsertComponents([comp("t", "Text", { text: "back" })]);
    expect(kids(resolver.rootNode)[0]!.state).toBe("resolved");
  });

  test("removing a component no node uses changes nothing", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["t"] }),
      comp("t", "Text", { text: "x" }),
      comp("spare", "Text", { text: "unused" }),
    ]);
    const resolver = h.resolver();
    const root = resolver.rootNode!;
    let rootEmits = 0;
    root.onPropsChange(() => {
      rootEmits += 1;
    });
    h.surface.removeComponent("spare");
    expect(rootEmits).toBe(0);
    expect(resolver.activeNodeCount).toBe(2);
  });

  test("dropping a child id from the parent's list disposes only that child", () => {
    const h = harness();
    h.surface.upsertComponents([
      comp("root", "Column", { children: ["a", "b"] }),
      comp("a", "Text", { text: "a" }),
      comp("b", "Text", { text: "b" }),
    ]);
    const resolver = h.resolver();
    const [a, b] = kids(resolver.rootNode);
    h.surface.upsertComponents([comp("root", "Column", { children: ["b"] })]);
    expect(a!.disposed).toBe(true);
    expect(b!.disposed).toBe(false);
    expect(kids(resolver.rootNode)[0]).toBe(b);
  });
});

describe("NodeResolver repeaters", () => {
  function listHarness(items: unknown): { h: Harness; resolver: NodeResolver } {
    const h = harness({ items });
    h.surface.upsertComponents([
      comp("root", "Column", { children: { componentId: "row", path: "/items" } }),
      comp("row", "Text", { text: { "@path": "t" } }),
    ]);
    return { h, resolver: h.resolver() };
  }

  function texts(resolver: NodeResolver): unknown[] {
    return kids(resolver.rootNode).map(
      (n) => (n.props["text"] as ResolvedBinding).value,
    );
  }

  test("each item gets a scoped dataPath and instanceId", () => {
    const { resolver } = listHarness([{ t: "A" }, { t: "B" }]);
    const rows = kids(resolver.rootNode);
    expect(rows.map((r) => r.dataPath)).toEqual(["/items/0", "/items/1"]);
    expect(rows.map((r) => r.instanceId)).toEqual([
      "row-[/items/0]",
      "row-[/items/1]",
    ]);
  });

  test("appending an item keeps the existing node identities", () => {
    const { h, resolver } = listHarness([{ t: "A" }]);
    const first = kids(resolver.rootNode)[0]!;
    h.surface.dataModel.set("/items/1", { t: "B" });
    const rows = kids(resolver.rootNode);
    expect(rows.length).toBe(2);
    expect(rows[0]).toBe(first);
    expect(texts(resolver)).toEqual(["A", "B"]);
  });

  test("identity follows the index: removing a middle item disposes the last node", () => {
    const { h, resolver } = listHarness([{ t: "A" }, { t: "B" }, { t: "C" }]);
    const [n0, n1, n2] = kids(resolver.rootNode);
    h.surface.dataModel.set("/items", [{ t: "A" }, { t: "C" }]);
    const rows = kids(resolver.rootNode);
    expect(rows[0]).toBe(n0);
    expect(rows[1]).toBe(n1);
    expect(n1!.disposed).toBe(false);
    expect(n2!.disposed).toBe(true);
    expect(texts(resolver)).toEqual(["A", "C"]);
  });

  test("identity follows the index: reordering keeps nodes and swaps their props", () => {
    const { h, resolver } = listHarness([{ t: "A" }, { t: "B" }]);
    const [n0, n1] = kids(resolver.rootNode);
    let emits = 0;
    n0!.onPropsChange(() => {
      emits += 1;
    });
    n1!.onPropsChange(() => {
      emits += 1;
    });
    h.surface.dataModel.set("/items", [{ t: "B" }, { t: "A" }]);
    const rows = kids(resolver.rootNode);
    expect(rows[0]).toBe(n0);
    expect(rows[1]).toBe(n1);
    expect(texts(resolver)).toEqual(["B", "A"]);
    expect(emits).toBe(2);
  });

  test("identity follows the key for an object collection", () => {
    const { h, resolver } = listHarness({ a: { t: "A" }, b: { t: "B" } });
    const [na, nb] = kids(resolver.rootNode);
    expect(na!.dataPath).toBe("/items/a");
    h.surface.dataModel.set("/items", { b: { t: "B" } });
    const rows = kids(resolver.rootNode);
    expect(rows.length).toBe(1);
    expect(rows[0]).toBe(nb);
    expect(na!.disposed).toBe(true);
  });

  test("a collection that is neither a list nor an object gives no children", () => {
    const { h, resolver } = listHarness("not a list");
    expect(kids(resolver.rootNode)).toEqual([]);
    h.surface.dataModel.set("/items", [{ t: "A" }]);
    expect(texts(resolver)).toEqual(["A"]);
  });

  test("an item value change notifies only that item's node", () => {
    const { h, resolver } = listHarness([{ t: "A" }, { t: "B" }]);
    const root = resolver.rootNode!;
    const [n0, n1] = kids(root);
    const emits = { root: 0, n0: 0, n1: 0 };
    root.onPropsChange(() => {
      emits.root += 1;
    });
    n0!.onPropsChange(() => {
      emits.n0 += 1;
    });
    n1!.onPropsChange(() => {
      emits.n1 += 1;
    });
    h.surface.dataModel.set("/items/1/t", "Z");
    expect(emits).toEqual({ root: 0, n0: 0, n1: 1 });
  });
});

describe("NodeResolver batching", () => {
  test("one commit touching two bound paths notifies the node once", () => {
    const h = harness({ person: { first: "Ada", last: "L" } });
    h.surface.upsertComponents([
      comp("root", "TextField", {
        label: { "@path": "/person/first" },
        value: { "@path": "/person/last" },
      }),
    ]);
    const root = h.resolver().rootNode!;
    let emits = 0;
    root.onPropsChange(() => {
      emits += 1;
    });
    h.surface.dataModel.set("/person", { first: "Grace", last: "H" });
    expect(emits).toBe(1);
    expect((root.props["label"] as ResolvedBinding).value).toBe("Grace");
    expect((root.props["value"] as ResolvedBinding).value).toBe("H");
  });

  test("two separate commits notify the node twice", () => {
    const h = harness({ person: { first: "Ada", last: "L" } });
    h.surface.upsertComponents([
      comp("root", "TextField", {
        label: { "@path": "/person/first" },
        value: { "@path": "/person/last" },
      }),
    ]);
    const root = h.resolver().rootNode!;
    let emits = 0;
    root.onPropsChange(() => {
      emits += 1;
    });
    h.surface.dataModel.set("/person/first", "Grace");
    h.surface.dataModel.set("/person/last", "H");
    expect(emits).toBe(2);
  });

  test("one commit that dirties a parent and its child notifies each once", () => {
    const h = harness({ items: [{ t: "A" }], title: "x" });
    h.surface.upsertComponents([
      comp("root", "Column", { children: { componentId: "row", path: "/items" } }),
      comp("row", "Text", { text: { "@path": "t" } }),
    ]);
    const root = h.resolver().rootNode!;
    const row = kids(root)[0]!;
    let rootEmits = 0;
    let rowEmits = 0;
    root.onPropsChange(() => {
      rootEmits += 1;
    });
    row.onPropsChange(() => {
      rowEmits += 1;
    });
    h.surface.dataModel.set("/items", [{ t: "B" }, { t: "C" }]);
    expect(rootEmits).toBe(1);
    expect(rowEmits).toBe(1);
    expect(kids(root)[0]).toBe(row);
  });

  test("a write to an unbound path notifies nobody", () => {
    const h = harness({ a: 1, b: 1 });
    h.surface.upsertComponents([
      comp("root", "Text", { text: { "@path": "/a" } }),
    ]);
    const root = h.resolver().rootNode!;
    let emits = 0;
    root.onPropsChange(() => {
      emits += 1;
    });
    h.surface.dataModel.set("/b", 2);
    expect(emits).toBe(0);
  });
});

describe("NodeResolver dispose", () => {
  function tree(): { h: Harness; resolver: NodeResolver; nodes: ComponentNode[] } {
    const h = harness({ items: [{ t: "A" }, { t: "B" }] });
    h.surface.upsertComponents([
      comp("root", "Column", {
        children: ["c", "missing"],
      }),
      comp("c", "Column", { children: { componentId: "row", path: "/items" } }),
      comp("row", "Text", { text: { "@path": "t" } }),
    ]);
    const resolver = h.resolver();
    const root = resolver.rootNode!;
    const [c, missing] = kids(root);
    const nodes = [root, c!, missing!, ...kids(c)];
    return { h, resolver, nodes };
  }

  test("dispose disposes every node exactly once", () => {
    const { resolver, nodes } = tree();
    expect(resolver.activeNodeCount).toBe(nodes.length);
    const counts = nodes.map(() => 0);
    nodes.forEach((n, i) =>
      n.onDestroyed(() => {
        counts[i] = counts[i]! + 1;
      }),
    );
    resolver.dispose();
    resolver.dispose();
    expect(counts).toEqual(nodes.map(() => 1));
    expect(nodes.every((n) => n.disposed)).toBe(true);
    expect(resolver.activeNodeCount).toBe(0);
  });

  test("dispose flips disposed, clears rootNode and tells root listeners", () => {
    const { resolver } = tree();
    const seen: Array<ComponentNode | undefined> = [];
    resolver.onRootNodeChange((r) => seen.push(r));
    expect(resolver.disposed).toBe(false);
    resolver.dispose();
    expect(resolver.disposed).toBe(true);
    expect(resolver.rootNode).toBe(undefined);
    expect(seen).toEqual([undefined]);
  });

  test("dispose releases every data-model subscription the resolver held", () => {
    const h = harness({ items: [{ t: "A" }] });
    const baseline = h.surface.dataModel.activeSubscriptionCount;
    h.surface.upsertComponents([
      comp("root", "Column", { children: { componentId: "row", path: "/items" } }),
      comp("row", "Text", { text: { "@path": "t" } }),
    ]);
    const resolver = h.resolver();
    expect(h.surface.dataModel.activeSubscriptionCount).toBeGreaterThan(baseline);
    resolver.dispose();
    expect(h.surface.dataModel.activeSubscriptionCount).toBe(baseline);
  });

  test("after dispose, component and data changes create no node and do not throw", () => {
    const { h, resolver, nodes } = tree();
    resolver.dispose();
    h.surface.upsertComponents([
      comp("missing", "Text", { text: "late" }),
      comp("root", "Row", { children: ["c"] }),
    ]);
    h.surface.dataModel.set("/items", [{ t: "X" }, { t: "Y" }, { t: "Z" }]);
    h.surface.removeComponent("c");
    expect(resolver.rootNode).toBe(undefined);
    expect(resolver.activeNodeCount).toBe(0);
    expect((nodes[0]!.props["children"] as ComponentNode[]).length).toBe(2);
  });

  test("disposing the surface disposes the resolver", () => {
    const { h, resolver, nodes } = tree();
    h.surface.dispose();
    expect(resolver.disposed).toBe(true);
    expect(nodes.every((n) => n.disposed)).toBe(true);
  });
});

describe("NodeResolver actions", () => {
  test("dispatchNodeAction evaluates the context at dispatch time", async () => {
    const h = harness({ user: "Ada" });
    h.surface.upsertComponents([comp("root", "Text", { text: "x" })]);
    const resolver = h.resolver();
    const root = resolver.rootNode!;
    h.surface.dataModel.set("/user", "Grace");
    await resolver.dispatchNodeAction(root, {
      event: { name: "save", context: { user: { "@path": "/user" } } },
    });
    expect(h.sent.length).toBe(1);
    expect(h.sent[0]!.name).toBe("save");
    expect(h.sent[0]!.context).toEqual({ user: "Grace" });
    expect(h.sent[0]!.sourceComponentId).toBe("root");
  });

  test("dispatchNodeAction resolves relative context paths against the node scope", async () => {
    const h = harness({ items: [{ id: "a" }, { id: "b" }] });
    h.surface.upsertComponents([
      comp("root", "Column", { children: { componentId: "row", path: "/items" } }),
      comp("row", "Text", { text: "r" }),
    ]);
    const resolver = h.resolver();
    const second = kids(resolver.rootNode)[1]!;
    await resolver.dispatchNodeAction(second, {
      event: { name: "open", context: { id: { "@path": "id" } } },
    });
    expect(h.sent[0]!.context).toEqual({ id: "b" });
    expect(h.sent[0]!.sourceComponentId).toBe("row");
  });

  test("a resolved action prop keeps its identity across unrelated data changes", () => {
    const h = harness({ user: "Ada", label: "a" });
    h.surface.upsertComponents([
      comp(
        "root",
        "Button",
        {
          child: "lbl",
          action: { event: { name: "go", context: { u: { "@path": "/user" } } } },
        },
        { accessibility: { label: { "@path": "/label" } } },
      ),
      comp("lbl", "Text", { text: "Go" }),
    ]);
    const root = h.resolver().rootNode!;
    const before = root.props["action"] as NodeAction;
    h.surface.dataModel.set("/label", "b");
    h.surface.dataModel.set("/user", "Grace");
    expect(root.props["action"]).toBe(before);
  });

  test("dispatchNodeAction on a node of a disposed resolver still dispatches", async () => {
    const h = harness({ user: "Ada" });
    h.surface.upsertComponents([comp("root", "Text", { text: "x" })]);
    const resolver = h.resolver();
    const root = resolver.rootNode!;
    resolver.dispose();
    expect(root.disposed).toBe(true);
    await resolver.dispatchNodeAction(root, {
      event: { name: "late", context: { user: { "@path": "/user" } } },
    });
    expect(h.sent.map((a) => a.name)).toEqual(["late"]);
  });
});
