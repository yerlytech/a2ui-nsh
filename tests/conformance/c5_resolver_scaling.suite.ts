/**
 * Stage C5 conformance runner against upstream `google-A2UI`:
 * - `conformance/core/node_resolution.yaml`
 * - `conformance/core/message_processor_scaling.yaml`
 *
 * All conformance fixtures and catalog JSONs are read directly from
 * `A2UI_CONFORMANCE_ROOT` (`target/refs/google-A2UI`) at test time — never
 * copied into this repository.
 *
 * Note on `core/node_resolution.yaml`: 24 of the 32 model-level fixtures in
 * upstream still point at `../catalogs/basic/v0_9_1/catalog.json` and use
 * legacy `{ path }` / `{ call }` / `checks` / `"v0.9"` keys even though the
 * tests verify protocol-version-neutral node resolution contracts. This runner
 * normalizes those v0.9.1 model-level fixtures to v1.0 while `src/core/` stays
 * strictly A2UI v1.0, allowing all 32/32 cases to execute and pass.
 */

import { beforeAll, describe, expect, test } from "nsh/test";
import {
  Catalog,
  type ComponentMetadata,
  type FunctionReturnType,
} from "../../src/core/catalog";
import { deepEqual } from "../../src/core/data_model";
import { FunctionRegistry, indexFunction } from "../../src/core/functions";
import { isJsonObject, type JsonObject } from "../../src/core/json_schema";
import {
  MessageProcessor,
  type ComponentModel,
  type SurfaceModel,
} from "../../src/core/processor";
import {
  NodeResolver,
  ResolvedBinding,
  isComponentNode,
  isWritable,
  type ComponentNode,
  type NodeAction,
} from "../../src/core/resolver";
import {
  PERMISSIVE_VALIDATION,
  type RendererErrorEnvelope,
} from "../../src/core/validator";
import { ConformanceClient, type ConformanceCase } from "./harness";
import { parseYaml } from "./yaml";

/** Skip list for `core/node_resolution.yaml` (empty: all 32/32 cases pass). */
export const NODE_RESOLUTION_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map();

/** Skip list for `core/message_processor_scaling.yaml` (empty: all 3/3 cases pass). */
export const SCALING_SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map();

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

function normalizePathSegments(fullPath: string): string {
  const isAbs = fullPath.startsWith("/");
  const parts = fullPath.split("/");
  const stack: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
      } else if (!isAbs) {
        stack.push("..");
      }
    } else {
      stack.push(part);
    }
  }
  return (isAbs ? "/" : "") + stack.join("/");
}

function joinPath(base: string, rel: string): string {
  return normalizePathSegments(`${base}/${rel}`);
}

// ---------------------------------------------------------------------------
// v0.9.1 model-level fixture normalizer (applied ONLY to v0_9_1 fixtures in
// node_resolution.yaml; native v1.0 fixtures are passed untouched).
// ---------------------------------------------------------------------------

function normalizeV09ValueToV10(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeV09ValueToV10);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (
    keys.length === 1 &&
    keys[0] === "path" &&
    typeof obj["path"] === "string"
  ) {
    return { "@path": obj["path"] };
  }
  if (typeof obj["call"] === "string" && !Object.prototype.hasOwnProperty.call(obj, "@call")) {
    const out: Record<string, unknown> = { "@call": obj["call"] };
    if (obj["args"] !== undefined) {
      out["args"] = normalizeV09ValueToV10(obj["args"]);
    }
    if (obj["catalogId"] !== undefined) {
      out["catalogId"] = obj["catalogId"];
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = normalizeV09ValueToV10(v);
  }
  return out;
}

function normalizeV09ComponentToV10(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "checks") {
      out["@checks"] = normalizeV09ValueToV10(v);
    } else if (k === "accessibility") {
      out["@accessibility"] = normalizeV09ValueToV10(v);
    } else if (k === "id" || k === "component" || k === "metadata") {
      out[k] = v;
    } else {
      out[k] = normalizeV09ValueToV10(v);
    }
  }
  return out;
}

function normalizeV09MessageToV10(msg: unknown): unknown {
  if (!isJsonObject(msg)) {
    return msg;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(msg)) {
    if (k === "version" && typeof v === "string" && v.startsWith("v0.")) {
      out[k] = "1.0";
    } else if (k === "updateComponents" && isJsonObject(v)) {
      const comps = Array.isArray(v["components"])
        ? v["components"].map((c) =>
            isJsonObject(c) ? normalizeV09ComponentToV10(c) : c,
          )
        : v["components"];
      out[k] = { ...v, components: comps };
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. core/node_resolution.yaml runner
// ---------------------------------------------------------------------------

interface NodeFixture {
  readonly catalog: string;
  readonly surface?: boolean;
  readonly data: Record<string, unknown>;
  readonly components: Array<Record<string, unknown> & { id: string; component: string }>;
}

interface NodeExpectation {
  readonly component_id?: string;
  readonly type?: string;
  readonly state?: string;
  readonly data_path?: string;
  readonly isValid?: boolean;
  readonly validationErrors?: readonly string[];
  readonly validationResults?: readonly Record<string, unknown>[];
  readonly props?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown> | null;
}

interface StepExpectation {
  readonly nodes: Record<string, NodeExpectation>;
  readonly emissions?: Record<string, number>;
  readonly created_emissions?: Record<string, number>;
  readonly metadata_emissions?: Record<string, number>;
  readonly same_nodes?: readonly string[];
  readonly replaced_nodes?: readonly string[];
  readonly destroyed?: Record<string, number>;
  readonly data?: Record<string, unknown>;
  readonly events?: readonly unknown[];
  readonly functions?: readonly unknown[];
  readonly errors?: readonly { code?: string; surfaceId?: string; message?: string }[];
}

interface NodeResolutionStep {
  readonly op: string;
  readonly path?: string;
  readonly value?: unknown;
  readonly components?: Array<Record<string, unknown> & { id: string; component: string }>;
  readonly component_id?: string;
  readonly node?: string;
  readonly property?: string;
  readonly metadata?: Record<string, unknown>;
  readonly messages?: readonly unknown[];
  readonly expect: StepExpectation;
}

interface WatchRecord {
  path: string;
  emissions: number;
  metadataEmissions: number;
  destroyed: number;
  lastProps?: unknown;
  stop(): void;
}

function normalizeResolvedValue(value: unknown, path: string): unknown {
  if (isComponentNode(value)) {
    return { node: path };
  }
  if (value instanceof ResolvedBinding) {
    return {
      value: normalizeResolvedValue(value.value, path),
      writable: isWritable(value),
    };
  }
  if (typeof value === "function") {
    return { action: true };
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => normalizeResolvedValue(item, `${path}/${i}`));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeResolvedValue(v, `${path}/${k}`);
    }
    return out;
  }
  return value ?? null;
}

function mountedNodes(resolver: NodeResolver): Map<string, ComponentNode> {
  const nodes = new Map<string, ComponentNode>();
  const seen = new Set<ComponentNode>();

  function visit(node: ComponentNode, path: string): void {
    if (seen.has(node)) {
      throw new Error(`${path}: each mounted position must have a distinct node`);
    }
    if (node.disposed) {
      throw new Error(`${path}: mounted node is disposed`);
    }
    seen.add(node);
    nodes.set(path, node);

    const siblingIds = new Set<string>();
    function walkChildren(value: unknown, childPath: string): void {
      if (isComponentNode(value)) {
        if (siblingIds.has(value.instanceId)) {
          throw new Error(
            `${childPath}: duplicate sibling instanceId '${value.instanceId}'`,
          );
        }
        siblingIds.add(value.instanceId);
        visit(value, childPath);
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
          walkChildren(value[i], `${childPath}/${i}`);
        }
      } else if (
        value !== null &&
        typeof value === "object" &&
        !(value instanceof ResolvedBinding)
      ) {
        for (const [key, item] of Object.entries(value)) {
          walkChildren(item, `${childPath}/${key}`);
        }
      }
    }
    walkChildren(node.props, path);
  }

  const root = resolver.rootNode;
  if (root) {
    visit(root, "root");
  }
  return nodes;
}

function requiredNode(
  nodes: Map<string, ComponentNode>,
  path: string,
): ComponentNode {
  const node = nodes.get(path);
  if (!node) {
    throw new Error(`No node at ${path}`);
  }
  return node;
}

function saveBindings(
  nodes: Map<string, ComponentNode>,
): Array<[ResolvedBinding<unknown>, unknown]> {
  const saved: Array<[ResolvedBinding<unknown>, unknown]> = [];
  function visit(value: unknown): void {
    if (value instanceof ResolvedBinding) {
      saved.push([value, normalizeResolvedValue(value.value, "")]);
    } else if (
      !isComponentNode(value) &&
      value !== null &&
      typeof value === "object"
    ) {
      for (const item of Object.values(value)) {
        visit(item);
      }
    }
  }
  for (const node of nodes.values()) {
    visit(node.props);
  }
  return saved;
}

function buildComponentModel(
  rawComp: Record<string, unknown>,
  catalog: Catalog,
  isV09Fixture: boolean,
): ComponentModel {
  const normalized = isV09Fixture
    ? normalizeV09ComponentToV10(rawComp)
    : rawComp;
  const id = String(normalized["id"]);
  const type = String(normalized["component"]);
  const properties: Record<string, unknown> = {};
  let metadata: ComponentMetadata | undefined;
  let checks: readonly unknown[] | undefined;
  let accessibility: Record<string, unknown> | undefined;

  for (const [k, v] of Object.entries(normalized)) {
    if (k === "id" || k === "component") {
      continue;
    }
    if (k === "metadata" || k === "@metadata") {
      metadata = v as ComponentMetadata | undefined;
      continue;
    }
    if (k === "@checks") {
      checks = v as readonly unknown[];
      continue;
    }
    if (k === "@accessibility") {
      accessibility = v as Record<string, unknown>;
      continue;
    }
    properties[k] = v;
  }

  const normalizedWire: Record<string, unknown> = {
    id,
    component: type,
    ...properties,
  };
  if (metadata !== undefined) {
    normalizedWire["@metadata"] = metadata;
  }
  if (checks !== undefined) {
    normalizedWire["@checks"] = checks;
  }
  if (accessibility !== undefined) {
    normalizedWire["@accessibility"] = accessibility;
  }

  return {
    id,
    type,
    catalogId: catalog.catalogId,
    catalog,
    properties,
    metadata,
    checks,
    accessibility,
    normalizedWire,
  };
}

function assertDeepEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (!deepEqual(actual, expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertStrictEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function assertNotStrictEqual(
  actual: unknown,
  unexpected: unknown,
  label: string,
): void {
  if (Object.is(actual, unexpected)) {
    throw new Error(`${label}: expected distinct node reference`);
  }
}

function checkNodes(
  nodes: Map<string, ComponentNode>,
  expected: StepExpectation,
  reason: string,
): void {
  const actualPaths = Array.from(nodes.keys()).sort();
  const expectedPaths = Object.keys(expected.nodes).sort();
  assertDeepEqual(actualPaths, expectedPaths, `${reason}: node paths`);

  for (const [path, fields] of Object.entries(expected.nodes)) {
    const node = requiredNode(nodes, path);
    if (fields.component_id !== undefined) {
      assertStrictEqual(
        node.componentId,
        fields.component_id,
        `${reason}: ${path}.component_id`,
      );
    }
    if (fields.type !== undefined) {
      assertStrictEqual(node.type, fields.type, `${reason}: ${path}.type`);
    }
    if (fields.state !== undefined) {
      assertStrictEqual(node.state, fields.state, `${reason}: ${path}.state`);
    }
    if (fields.data_path !== undefined) {
      assertStrictEqual(
        node.dataPath,
        fields.data_path,
        `${reason}: ${path}.data_path`,
      );
    }
    if (fields.isValid !== undefined) {
      assertStrictEqual(
        node.props["isValid"],
        fields.isValid,
        `${reason}: ${path}.isValid`,
      );
    }
    if (fields.validationErrors !== undefined) {
      assertDeepEqual(
        node.props["validationErrors"],
        fields.validationErrors,
        `${reason}: ${path}.validationErrors`,
      );
    }
    if (fields.validationResults !== undefined) {
      assertDeepEqual(
        node.props["validationResults"],
        fields.validationResults,
        `${reason}: ${path}.validationResults`,
      );
    }
    if (fields.props !== undefined) {
      for (const [key, expectedVal] of Object.entries(fields.props)) {
        if (!Object.prototype.hasOwnProperty.call(node.props, key)) {
          throw new Error(`${reason}: ${path}.${key} is absent`);
        }
        assertDeepEqual(
          normalizeResolvedValue(node.props[key], `${path}/${key}`),
          expectedVal,
          `${reason}: ${path}.${key}`,
        );
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, "metadata")) {
      assertDeepEqual(
        node.metadata ?? null,
        fields.metadata,
        `${reason}: ${path}.metadata`,
      );
    }
  }
}

interface NodeCaseFiles {
  readonly fixtures: Map<string, NodeFixture>;
  readonly catalogs: Map<string, JsonObject>;
}

async function preloadNodeResolutionFiles(
  client: ConformanceClient,
  cases: readonly ConformanceCase[],
): Promise<NodeCaseFiles> {
  const root = client.resolveConformanceRoot();
  const conformanceDir = joinPath(root, "conformance");
  const fixtures = new Map<string, NodeFixture>();
  const catalogs = new Map<string, JsonObject>();

  for (const tc of cases) {
    const fixtureRel = tc["fixture"] as string;
    if (!fixtures.has(fixtureRel)) {
      const text = await client.readTextFile(joinPath(conformanceDir, fixtureRel));
      const parsed = parseYaml(text) as NodeFixture;
      fixtures.set(fixtureRel, parsed);

      const effectiveCatalogRel = parsed.catalog.includes("v0_9_1")
        ? "../catalogs/basic/v1/catalog.json"
        : parsed.catalog;
      if (!catalogs.has(effectiveCatalogRel)) {
        const catText = await client.readTextFile(
          joinPath(conformanceDir, effectiveCatalogRel),
        );
        catalogs.set(effectiveCatalogRel, JSON.parse(catText) as JsonObject);
      }
    }
  }

  return { fixtures, catalogs };
}

async function runNodeResolutionCase(
  tc: ConformanceCase,
  files: NodeCaseFiles,
): Promise<void> {
  const fixtureRel = tc["fixture"] as string;
  const fixture = files.fixtures.get(fixtureRel);
  if (!fixture) {
    throw new Error(`Fixture not preloaded: ${fixtureRel}`);
  }
  const isV09Fixture = fixture.catalog.includes("v0_9_1");
  const effectiveCatalogRel = isV09Fixture
    ? "../catalogs/basic/v1/catalog.json"
    : fixture.catalog;
  const catalogJson = files.catalogs.get(effectiveCatalogRel);
  if (!catalogJson) {
    throw new Error(`Catalog not preloaded: ${effectiveCatalogRel}`);
  }

  const catalog = Catalog.fromJson(catalogJson);
  const recordedFunctions: Array<{ name: string; args: unknown }> = [];
  const recordedEvents: Array<Record<string, unknown>> = [];
  const recordedErrors: RendererErrorEnvelope[] = [];

  // Per node_resolution.md: catalog-declared functions are recorders returning
  // null; protocol system functions (@index) evaluate natively.
  const fnRegistry = new FunctionRegistry();
  fnRegistry.registerSystem(indexFunction);
  for (const fnDef of catalog.functions.values()) {
    fnRegistry.register(catalog.catalogId, {
      name: fnDef.name,
      returnType: (fnDef.returnType ?? "any") as FunctionReturnType,
      allowedCallers: fnDef.allowedCallers,
      requiresUserActivation: fnDef.requiresUserActivation,
      execute: (args) => {
        recordedFunctions.push({
          name: fnDef.name,
          args: normalizeResolvedValue(args, ""),
        });
        return null;
      },
    });
  }

  const processor = new MessageProcessor({
    catalogs: [catalog],
    functionRegistry: fnRegistry,
    strictMode: false,
    onAction: (envelope) => {
      const ev: Record<string, unknown> = {
        name: envelope.action.name,
        source_component_id: envelope.action.sourceComponentId,
        context: normalizeResolvedValue(envelope.action.context ?? {}, ""),
      };
      if (envelope.action.metadata !== undefined) {
        ev["metadata"] = envelope.action.metadata;
      }
      recordedEvents.push(ev);
    },
  });

  let surface: SurfaceModel | undefined;
  let resolver: NodeResolver | undefined;
  const watches = new Map<ComponentNode, WatchRecord>();
  const createdEmissions = new Map<ComponentNode, number>();
  const createdStops: Array<() => void> = [];
  const cleanups: Array<() => void> = [];

  const watchCreatedNodes = (): void => {
    if (!resolver) {
      return;
    }
    for (const node of mountedNodes(resolver).values()) {
      if (createdEmissions.has(node)) {
        continue;
      }
      createdEmissions.set(node, 0);
      const stop = node.onPropsChange(() => {
        createdEmissions.set(node, (createdEmissions.get(node) ?? 0) + 1);
        watchCreatedNodes();
      });
      createdStops.push(stop);
    }
  };

  const watchNodes = (nodes: Map<string, ComponentNode>): void => {
    for (const [path, node] of nodes) {
      const existing = watches.get(node);
      if (existing) {
        existing.path = path;
        continue;
      }
      const watch: WatchRecord = {
        path,
        emissions: 0,
        metadataEmissions: 0,
        destroyed: 0,
        stop: () => {},
      };
      const stopProps = node.onPropsChange((nextProps) => {
        watch.emissions += 1;
        watch.lastProps = normalizeResolvedValue(nextProps, watch.path);
        watchCreatedNodes();
      });
      const stopMeta = node.onMetadataChange(() => {
        watch.metadataEmissions += 1;
      });
      const stopDestroyed = node.onDestroyed(() => {
        watch.destroyed += 1;
      });
      watch.stop = () => {
        stopProps();
        stopMeta();
        stopDestroyed();
      };
      watches.set(node, watch);
    }
  };

  const attachSurface = (s: SurfaceModel): void => {
    if (s.id !== "s" || resolver) {
      return;
    }
    surface = s;
    resolver = new NodeResolver({ surface: s, processor });
    cleanups.push(
      resolver.onRootNodeChange(() => {
        watchCreatedNodes();
      }),
      s.onError((env) => {
        recordedErrors.push(env);
      }),
    );
    // Any nodes already created at attach time (inline createSurface) have 0 post-creation emissions.
    watchCreatedNodes();
  };

  cleanups.push(processor.onSurfaceCreated(attachSurface));

  if (fixture.surface !== false) {
    const s = processor.createSurfaceModel({
      id: "s",
      defaultCatalogId: catalog.catalogId,
      data: fixture.data,
    });
    if (fixture.components.length > 0) {
      s.upsertComponents(
        fixture.components.map((c) => buildComponentModel(c, catalog, isV09Fixture)),
      );
    }
  }

  const checkStepExpectation = (
    expected: StepExpectation,
    before: Map<string, ComponentNode>,
    reason: string,
  ): void => {
    const after = resolver
      ? mountedNodes(resolver)
      : new Map<string, ComponentNode>();
    checkNodes(after, expected, reason);

    const beforeNodes = new Set(before.values());
    const surviving = new Set(after.values());
    const emissions: Record<string, number> = {};
    const metadataEmissions: Record<string, number> = {};
    const destroyed: Record<string, number> = {};

    for (const [node, watch] of watches) {
      if (watch.emissions > 0 && surviving.has(node)) {
        emissions[watch.path] = (emissions[watch.path] ?? 0) + watch.emissions;
        assertDeepEqual(
          watch.lastProps,
          normalizeResolvedValue(node.props, watch.path),
          `${reason}: ${watch.path} last emission`,
        );
      }
      if (watch.metadataEmissions > 0 && surviving.has(node)) {
        metadataEmissions[watch.path] =
          (metadataEmissions[watch.path] ?? 0) + watch.metadataEmissions;
      }
      if (watch.destroyed > 0) {
        destroyed[watch.path] = (destroyed[watch.path] ?? 0) + watch.destroyed;
        assertStrictEqual(
          node.disposed,
          true,
          `${reason}: ${watch.path} disposed`,
        );
      }
    }

    assertDeepEqual(
      emissions,
      expected.emissions ?? {},
      `${reason}: emissions`,
    );

    if (expected.created_emissions !== undefined) {
      const actualCreated: Record<string, number> = {};
      for (const [path, node] of after) {
        if (!beforeNodes.has(node)) {
          actualCreated[path] = createdEmissions.get(node) ?? 0;
        }
      }
      assertDeepEqual(
        actualCreated,
        expected.created_emissions,
        `${reason}: created_emissions`,
      );
    }

    if (expected.metadata_emissions !== undefined) {
      assertDeepEqual(
        metadataEmissions,
        expected.metadata_emissions,
        `${reason}: metadata_emissions`,
      );
    }

    assertDeepEqual(
      destroyed,
      expected.destroyed ?? {},
      `${reason}: destroyed`,
    );

    for (const path of expected.same_nodes ?? []) {
      assertStrictEqual(
        requiredNode(after, path),
        requiredNode(before, path),
        `${reason}: ${path} identity`,
      );
    }

    for (const path of expected.replaced_nodes ?? []) {
      assertNotStrictEqual(
        requiredNode(after, path),
        requiredNode(before, path),
        `${reason}: ${path} replacement`,
      );
    }

    if (expected.data !== undefined) {
      if (!surface) {
        throw new Error(`${reason}: no surface for data assertion`);
      }
      for (const [path, expectedVal] of Object.entries(expected.data)) {
        assertDeepEqual(
          normalizeResolvedValue(surface.dataModel.get(path), path),
          expectedVal,
          `${reason}: data ${path}`,
        );
      }
    }

    assertDeepEqual(recordedEvents, expected.events ?? [], `${reason}: events`);
    assertDeepEqual(
      recordedFunctions,
      expected.functions ?? [],
      `${reason}: functions`,
    );

    if (expected.errors !== undefined) {
      assertStrictEqual(
        recordedErrors.length,
        expected.errors.length,
        `${reason}: errors count`,
      );
      for (let i = 0; i < expected.errors.length; i += 1) {
        const expErr = expected.errors[i]!;
        const actErr = recordedErrors[i]!.error;
        if (expErr.code !== undefined) {
          assertStrictEqual(
            actErr.code,
            expErr.code,
            `${reason}: errors[${i}].code`,
          );
        }
        if (expErr.surfaceId !== undefined) {
          const actualSurfaceId =
            "surfaceId" in actErr ? actErr.surfaceId : undefined;
          assertStrictEqual(
            actualSurfaceId,
            expErr.surfaceId,
            `${reason}: errors[${i}].surfaceId`,
          );
        }
        if (expErr.message !== undefined) {
          assertStrictEqual(
            actErr.message.includes(expErr.message),
            true,
            `${reason}: errors[${i}].message`,
          );
        }
      }
    }
  };

  try {
    checkStepExpectation(
      tc["expect"] as StepExpectation,
      new Map(),
      `${tc.name} initial`,
    );

    const steps = (tc["steps"] as readonly NodeResolutionStep[]) ?? [];
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i]!;
      const reason = `${tc.name} step ${i} (${step.op})`;
      const before = resolver
        ? mountedNodes(resolver)
        : new Map<string, ComponentNode>();
      watchNodes(before);
      for (const watch of watches.values()) {
        watch.emissions = 0;
        watch.metadataEmissions = 0;
        watch.destroyed = 0;
        watch.lastProps = undefined;
      }
      for (let s = 0; s < createdStops.length; s += 1) {
        createdStops[s]!();
      }
      createdStops.length = 0;
      createdEmissions.clear();
      recordedEvents.length = 0;
      recordedFunctions.length = 0;
      recordedErrors.length = 0;

      const savedBindings = saveBindings(before);

      switch (step.op) {
        case "set_data": {
          if (!surface) {
            throw new Error(`${reason}: no surface`);
          }
          surface.dataModel.set(step.path!, step.value);
          break;
        }
        case "update_components": {
          if (!surface) {
            throw new Error(`${reason}: no surface`);
          }
          const comps = step.components ?? [];
          for (const rawComp of comps) {
            const existing = surface.components.get(rawComp.id);
            if (existing) {
              assertStrictEqual(
                existing.type,
                rawComp.component,
                `${reason}: update_components cannot change ${rawComp.id}'s type`,
              );
            }
          }
          surface.upsertComponents(
            comps.map((c) => buildComponentModel(c, catalog, isV09Fixture)),
          );
          break;
        }
        case "remove_component": {
          if (!surface) {
            throw new Error(`${reason}: no surface`);
          }
          surface.removeComponent(step.component_id!);
          break;
        }
        case "write": {
          const target = requiredNode(before, step.node!);
          const binding = target.props[step.property!];
          if (!(binding instanceof ResolvedBinding) || !isWritable(binding)) {
            throw new Error(
              `${reason}: ${step.node}.${step.property} is not a writable binding`,
            );
          }
          binding.set(step.value);
          break;
        }
        case "invoke": {
          const target = requiredNode(before, step.node!);
          const action = target.props[step.property!];
          if (typeof action !== "function") {
            throw new Error(
              `${reason}: ${step.node}.${step.property} is not an action`,
            );
          }
          await (action as NodeAction)(
            step.metadata
              ? { metadata: step.metadata as ComponentMetadata }
              : undefined,
          );
          break;
        }
        case "process_messages": {
          const msgs = isV09Fixture
            ? (step.messages ?? []).map(normalizeV09MessageToV10)
            : (step.messages ?? []);
          processor.processMessages(msgs);
          break;
        }
        case "dispose": {
          if (!resolver) {
            throw new Error(`${reason}: no resolver`);
          }
          resolver.dispose();
          break;
        }
        default:
          throw new Error(`Unknown node operation: ${step.op}`);
      }

      checkStepExpectation(step.expect, before, reason);

      for (const [binding, snapshotValue] of savedBindings) {
        assertDeepEqual(
          normalizeResolvedValue(binding.value, ""),
          snapshotValue,
          `${reason}: prior binding snapshot mutated`,
        );
      }
    }
  } finally {
    for (let s = 0; s < createdStops.length; s += 1) {
      createdStops[s]!();
    }
    resolver?.dispose();
    surface?.dispose();
    for (const watch of watches.values()) {
      watch.stop();
    }
    for (let c = 0; c < cleanups.length; c += 1) {
      cleanups[c]!();
    }
  }
}

// ---------------------------------------------------------------------------
// 2. core/message_processor_scaling.yaml runner (`measure_growth`)
// ---------------------------------------------------------------------------

type PayloadSegment =
  | string
  | { readonly repeat: string; readonly separator?: string };

function writePayloadTemplate(
  template: readonly PayloadSegment[],
  size: number,
): string {
  const parts: string[] = [];
  for (let i = 0; i < template.length; i += 1) {
    const seg = template[i]!;
    if (typeof seg === "string") {
      parts.push(seg);
    } else if (seg && typeof seg === "object" && typeof seg.repeat === "string") {
      const copies: string[] = [];
      for (let idx = 0; idx < size; idx += 1) {
        copies.push(seg.repeat.split("{i}").join(String(idx)));
      }
      parts.push(copies.join(seg.separator ?? ""));
    } else {
      throw new Error(`Unknown payload segment: ${JSON.stringify(seg)}`);
    }
  }
  return parts.join("");
}

function median(values: readonly number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function preloadScalingCatalogs(
  client: ConformanceClient,
  cases: readonly ConformanceCase[],
): Promise<Map<string, JsonObject>> {
  const root = client.resolveConformanceRoot();
  const out = new Map<string, JsonObject>();
  for (const tc of cases) {
    const paths = (tc["catalogPaths"] as readonly string[]) ?? [];
    for (const rel of paths) {
      if (!out.has(rel)) {
        const text = await client.readTextFile(joinPath(root, rel));
        out.set(rel, JSON.parse(text) as JsonObject);
      }
    }
  }
  return out;
}

function yieldTurn(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

async function runScalingCase(
  tc: ConformanceCase,
  catalogFiles: ReadonlyMap<string, JsonObject>,
): Promise<void> {
  expect(tc.action).toBe("measure_growth");
  expect(tc["operation"]).toBe("process_messages");

  const catalogPaths = (tc["catalogPaths"] as readonly string[]) ?? [];
  const catalogs = catalogPaths.map((rel) => {
    const doc = catalogFiles.get(rel);
    if (!doc) {
      throw new Error(`Missing preloaded catalog: ${rel}`);
    }
    return Catalog.fromJson(doc);
  });

  const args = (tc["args"] as Record<string, unknown>) ?? {};
  const configName = String(args["validation_config"] ?? "relaxed");
  const isNone = configName === "none";
  if (configName !== "relaxed" && configName !== "none") {
    throw new Error(`Unknown validation_config '${configName}'`);
  }

  const sizes = tc["sizes"] as readonly [number, number];
  const [smaller, larger] = sizes;
  const maxRatio = tc["max_ratio"] as number;
  const payloadTemplate = tc["payload"] as readonly PayloadSegment[];

  const smallMessages = JSON.parse(
    writePayloadTemplate(payloadTemplate, smaller),
  ) as unknown[];
  const largeMessages = JSON.parse(
    writePayloadTemplate(payloadTemplate, larger),
  ) as unknown[];

  const runOnce = (messages: unknown[]): void => {
    const processor = new MessageProcessor({
      catalogs,
      validationConfig: isNone ? undefined : PERMISSIVE_VALIDATION,
      skipValidation: isNone,
    });
    processor.processMessages(messages);
  };

  // Warmup once at each size before timing, yielding between calls so each
  // run stays cleanly within QuickJS's 2 s per-call CPU budget.
  runOnce(smallMessages);
  await yieldTurn();
  runOnce(largeMessages);
  await yieldTurn();

  const runs = 5;
  const smallTimes: number[] = [];
  const largeTimes: number[] = [];
  for (let r = 0; r < runs; r += 1) {
    const t0 = performance.now();
    runOnce(smallMessages);
    smallTimes.push(performance.now() - t0);
    await yieldTurn();

    const t1 = performance.now();
    runOnce(largeMessages);
    largeTimes.push(performance.now() - t1);
    await yieldTurn();
  }

  const smallMed = median(smallTimes);
  const largeMed = median(largeTimes);
  const ratio = smallMed > 0 ? largeMed / smallMed : 0;

  if (ratio > maxRatio) {
    throw new Error(
      `${tc.name}: median ${largeMed.toFixed(2)}ms at ${larger} vs ${smallMed.toFixed(2)}ms at ${smaller} (ratio ${ratio.toFixed(2)} > max_ratio ${maxRatio})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Suite registration
// ---------------------------------------------------------------------------

describe("C5 conformance — reactive node resolution & message processor scaling", () => {
  let client: ConformanceClient;

  beforeAll(async () => {
    client = await ConformanceClient.create();
  });

  test("core/node_resolution.yaml passes all 32 cases", async () => {
    const cases = await client.loadConformanceSuite("core/node_resolution.yaml");
    const files = await preloadNodeResolutionFiles(client, cases);
    const records = await client.runSuite(
      "core/node_resolution.yaml",
      (tc) => runNodeResolutionCase(tc, files),
      NODE_RESOLUTION_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(32);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("core/message_processor_scaling.yaml passes all 3 scaling cases", async () => {
    const cases = await client.loadConformanceSuite(
      "core/message_processor_scaling.yaml",
    );
    const catalogs = await preloadScalingCatalogs(client, cases);
    const records = await client.runSuite(
      "core/message_processor_scaling.yaml",
      (tc) => runScalingCase(tc, catalogs),
      SCALING_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(3);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });
});
