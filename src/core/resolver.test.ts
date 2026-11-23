import { describe, expect, test } from "nsh/test";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
  type ComponentMetadata,
} from "./catalog";
import { MessageProcessor, type ComponentModel } from "./processor";
import {
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
import type { RendererErrorEnvelope } from "./validator";

function makeBasicCatalog(): Catalog {
  return Catalog.fromJson(buildV10BasicCatalogDocument());
}

function makeComp(
  catalog: Catalog,
  id: string,
  type: string,
  properties: Record<string, unknown>,
  extras?: {
    readonly metadata?: ComponentMetadata;
    readonly checks?: readonly unknown[];
    readonly accessibility?: Record<string, unknown>;
  },
): ComponentModel {
  const normalizedWire: Record<string, unknown> = {
    id,
    component: type,
    ...properties,
  };
  if (extras?.metadata) {
    normalizedWire["@metadata"] = extras.metadata;
  }
  if (extras?.checks) {
    normalizedWire["@checks"] = extras.checks;
  }
  if (extras?.accessibility) {
    normalizedWire["@accessibility"] = extras.accessibility;
  }
  return {
    id,
    type,
    catalogId: catalog.catalogId,
    catalog,
    properties,
    metadata: extras?.metadata,
    checks: extras?.checks,
    accessibility: extras?.accessibility,
    normalizedWire,
  };
}

describe("NodeResolver (Core C5)", () => {
  test("resolves scoped writable bindings, preserves immutable snapshots, and emits once per change", () => {
    const catalog = makeBasicCatalog();
    const processor = new MessageProcessor({
      catalogs: [catalog],
      strictMode: false,
    });
    const surface = processor.createSurfaceModel({
      id: "s1",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
      data: { people: [{ name: "Ada" }, { name: "Lin" }] },
    });
    surface.upsertComponents([
      makeComp(catalog, "root", "Column", {
        children: { componentId: "field", path: "/people" },
      }),
      makeComp(catalog, "field", "TextField", {
        label: "Name",
        value: { "@path": "name" },
      }),
    ]);

    const resolver = new NodeResolver({ surface, processor });
    const root = resolver.rootNode!;
    expect(root).toBeDefined();
    expect(root.type).toBe("Column");
    expect(root.state).toBe("resolved");
    expect(root.dataPath).toBe("/");

    const children = root.props["children"] as ComponentNode[];
    expect(children.length).toBe(2);
    const first = children[0]!;
    const second = children[1]!;
    expect(first.dataPath).toBe("/people/0");
    expect(second.dataPath).toBe("/people/1");
    expect(first.instanceId).not.toBe(second.instanceId);

    const labelBinding = first.props["label"] as ResolvedBinding<unknown>;
    const valueBinding = first.props["value"] as ResolvedBinding<unknown>;
    expect(labelBinding instanceof ResolvedBinding).toBe(true);
    expect(isWritable(labelBinding)).toBe(false);
    expect(labelBinding.value).toBe("Name");

    expect(valueBinding instanceof WritableBinding).toBe(true);
    expect(isWritable(valueBinding)).toBe(true);
    expect(valueBinding.value).toBe("Ada");

    let rootEmits = 0;
    let firstEmits = 0;
    let secondEmits = 0;
    root.onPropsChange(() => {
      rootEmits += 1;
    });
    first.onPropsChange(() => {
      firstEmits += 1;
    });
    second.onPropsChange(() => {
      secondEmits += 1;
    });

    if (isWritable(valueBinding)) {
      valueBinding.set("Grace");
    }

    expect(rootEmits).toBe(0);
    expect(firstEmits).toBe(1);
    expect(secondEmits).toBe(0);
    // Prior binding snapshot remains immutable.
    expect(valueBinding.value).toBe("Ada");
    expect((first.props["value"] as ResolvedBinding<unknown>).value).toBe(
      "Grace",
    );
    expect(surface.dataModel.get("/people/0/name")).toBe("Grace");
    expect(surface.dataModel.get("/people/1/name")).toBe("Lin");

    // Equal-value rewrite does not emit.
    surface.dataModel.set("/people/0/name", "Grace");
    expect(firstEmits).toBe(1);

    resolver.dispose();
    expect(resolver.disposed).toBe(true);
    expect(resolver.activeNodeCount).toBe(0);
    expect(first.disposed).toBe(true);
  });

  test("template repeaters preserve surviving node identity and dispose removed items once", () => {
    const catalog = makeBasicCatalog();
    const processor = new MessageProcessor({
      catalogs: [catalog],
      strictMode: false,
    });
    const surface = processor.createSurfaceModel({
      id: "s1",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
      data: { items: [{ title: "A" }, { title: "B" }] },
    });
    surface.upsertComponents([
      makeComp(catalog, "root", "Column", {
        children: { componentId: "row", path: "/items" },
      }),
      makeComp(catalog, "row", "Text", {
        text: { "@path": "title" },
      }),
    ]);

    const resolver = new NodeResolver({ surface, processor });
    const root = resolver.rootNode!;
    const initial = root.props["children"] as ComponentNode[];
    const node0 = initial[0]!;
    const node1 = initial[1]!;

    let node1Destroyed = 0;
    let node2Destroyed = 0;
    node1.onDestroyed(() => {
      node1Destroyed += 1;
    });

    // Append item 2 -> 0 and 1 keep identity.
    surface.dataModel.set("/items", [
      { title: "A" },
      { title: "B" },
      { title: "C" },
    ]);
    const grown = root.props["children"] as ComponentNode[];
    expect(grown.length).toBe(3);
    expect(grown[0]).toBe(node0);
    expect(grown[1]).toBe(node1);
    const node2 = grown[2]!;
    node2.onDestroyed(() => {
      node2Destroyed += 1;
    });

    // Shrink to 1 item -> 0 survives, 1 and 2 destroyed exactly once.
    surface.dataModel.set("/items", [{ title: "A" }]);
    const shrunk = root.props["children"] as ComponentNode[];
    expect(shrunk.length).toBe(1);
    expect(shrunk[0]).toBe(node0);
    expect(node0.disposed).toBe(false);
    expect(node1.disposed).toBe(true);
    expect(node2.disposed).toBe(true);
    expect(node1Destroyed).toBe(1);
    expect(node2Destroyed).toBe(1);

    // Further mutation on removed paths does not trigger disposed nodes.
    surface.dataModel.set("/items", [{ title: "A" }, { title: "Z" }]);
    expect(node1Destroyed).toBe(1);

    resolver.dispose();
  });

  test("handles pending, unknown-type, and cyclic placeholders with deduplicated error emission", () => {
    const catalog = makeBasicCatalog();
    const errors: RendererErrorEnvelope[] = [];
    const processor = new MessageProcessor({
      catalogs: [catalog],
      strictMode: false,
      onError: (env) => errors.push(env),
    });
    const surface = processor.createSurfaceModel({
      id: "s1",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
    });
    const resolver = new NodeResolver({ surface, processor });

    // Pending child arrives later and upgrades in place.
    surface.upsertComponents([
      makeComp(catalog, "root", "Column", {
        children: ["missing", "mystery", "cyc"],
      }),
      makeComp(catalog, "mystery", "UnknownWidget", { foo: 1 }),
      makeComp(catalog, "cyc", "Card", { child: "root" }),
    ]);

    const root = resolver.rootNode!;
    const kids = root.props["children"] as ComponentNode[];
    expect(kids.length).toBe(3);

    const pendingNode = kids[0]!;
    expect(pendingNode.state).toBe("pending");
    expect(pendingNode.type).toBe(PLACEHOLDER_TYPE);
    expect(pendingNode.isPlaceholder).toBe(true);

    const unknownNode = kids[1]!;
    expect(unknownNode.state).toBe("unknown-type");
    expect(unknownNode.type).toBe("UnknownWidget");
    expect(unknownNode.isPlaceholder).toBe(true);

    const cycParent = kids[2]!;
    expect(cycParent.state).toBe("resolved");
    const cycLeaf = cycParent.props["child"] as ComponentNode;
    expect(isComponentNode(cycLeaf)).toBe(true);
    expect(cycLeaf.state).toBe("cyclic");
    expect(cycLeaf.componentId).toBe("root");
    expect(cycLeaf.isPlaceholder).toBe(true);

    const codes = errors.map((e) => e.error.code);
    expect(codes).toContain("UNKNOWN_COMPONENT_TYPE");
    expect(codes).toContain("CYCLIC_REFERENCE");

    // Upgrade pending node once its definition arrives.
    let pendingDestroyed = 0;
    pendingNode.onDestroyed(() => {
      pendingDestroyed += 1;
    });
    surface.upsertComponents([
      makeComp(catalog, "missing", "Text", { text: "Now here" }),
    ]);
    const updatedKids = root.props["children"] as ComponentNode[];
    expect(updatedKids[0]).not.toBe(pendingNode);
    expect(updatedKids[0]!.state).toBe("resolved");
    expect(pendingDestroyed).toBe(1);
    expect(
      (updatedKids[0]!.props["text"] as ResolvedBinding<unknown>).value,
    ).toBe("Now here");

    resolver.dispose();
  });

  test("tracks metadata separately from props and evaluates actions at dispatch time", async () => {
    const catalog = makeBasicCatalog();
    const dispatched: Array<{ name: string; context?: Record<string, unknown>; metadata?: unknown }> = [];
    const processor = new MessageProcessor({
      catalogs: [catalog],
      strictMode: false,
      onAction: (env) => {
        dispatched.push({
          name: env.action.name,
          context: env.action.context,
          metadata: env.action.metadata,
        });
      },
    });
    const surface = processor.createSurfaceModel({
      id: "s1",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
      data: { user: "Ada" },
    });
    surface.upsertComponents([
      makeComp(
        catalog,
        "root",
        "Button",
        {
          child: "lbl",
          action: {
            event: { name: "save", context: { user: { "@path": "/user" } } },
          },
        },
        { metadata: { extensions: { trace: "t1" } } },
      ),
      makeComp(catalog, "lbl", "Text", { text: "Save" }),
    ]);

    const resolver = new NodeResolver({ surface, processor });
    const root = resolver.rootNode!;
    let propEmits = 0;
    let metaEmits = 0;
    root.onPropsChange(() => {
      propEmits += 1;
    });
    root.onMetadataChange(() => {
      metaEmits += 1;
    });

    // Updating data referenced only inside an action must not trigger props emit.
    surface.dataModel.set("/user", "Grace");
    expect(propEmits).toBe(0);

    // Updating only metadata emits metadata without emitting props.
    surface.upsertComponents([
      makeComp(
        catalog,
        "root",
        "Button",
        {
          child: "lbl",
          action: {
            event: { name: "save", context: { user: { "@path": "/user" } } },
          },
        },
        { metadata: { extensions: { trace: "t2" } } },
      ),
    ]);
    expect(propEmits).toBe(0);
    expect(metaEmits).toBe(1);
    expect(root.metadata).toEqual({ extensions: { trace: "t2" } });

    const action = root.props["action"] as NodeAction;
    await action({ metadata: { extensions: { signed: true } } });
    expect(dispatched.length).toBe(1);
    expect(dispatched[0]!.name).toBe("save");
    expect(dispatched[0]!.context).toEqual({ user: "Grace" });
    expect(dispatched[0]!.metadata).toEqual({ extensions: { signed: true } });

    resolver.dispose();
  });

  test("evaluates reactive @checks and @accessibility bindings cleanly", () => {
    const catalog = makeBasicCatalog();
    const processor = new MessageProcessor({
      catalogs: [catalog],
      strictMode: false,
    });
    const surface = processor.createSurfaceModel({
      id: "s1",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
      data: { accepted: false, hiddenFlag: false },
    });
    surface.upsertComponents([
      makeComp(
        catalog,
        "root",
        "CheckBox",
        { label: "Accept", value: { "@path": "/accepted" } },
        {
          checks: [
            { condition: { "@path": "/accepted" }, message: "Required" },
          ],
          accessibility: {
            label: "Accept terms",
            hidden: { "@path": "/hiddenFlag" },
          },
        },
      ),
    ]);

    const resolver = new NodeResolver({ surface, processor });
    const root = resolver.rootNode!;
    expect(root.props["isValid"]).toBe(false);
    expect(root.props["validationErrors"]).toEqual(["Required"]);
    expect(root.accessibility).toEqual({ label: "Accept terms", hidden: false });

    let emits = 0;
    root.onPropsChange(() => {
      emits += 1;
    });

    const valBinding = root.props["value"] as WritableBinding<boolean>;
    valBinding.set(true);
    expect(emits).toBe(1);
    expect(root.props["isValid"]).toBe(true);
    expect(root.props["validationErrors"]).toEqual([]);

    surface.dataModel.set("/hiddenFlag", true);
    expect(root.accessibility).toEqual({ label: "Accept terms", hidden: true });

    expect(
      sameBinding(new ResolvedBinding("a"), new ResolvedBinding("a")),
    ).toBe(true);
    expect(
      sameBinding(new ResolvedBinding("a"), new ResolvedBinding("b")),
    ).toBe(false);

    resolver.dispose();
  });
});
