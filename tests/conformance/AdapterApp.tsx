/**
 * Headless Native Shell (`nsh 0.7.1`) A2UI v1.0 renderer host application for
 * Stage C6 conformance suites:
 * - `core/adapter_conformance.yaml`
 * - `core/accessibility.yaml`
 * - `adapter/markdown_subset.yaml`
 * - `e2e/*.yaml` (renderer half)
 *
 * Mounts real `<A2uiSurface>` trees backed by `A2uiStore` and all 18
 * Basic Catalog v1 components, captures wire-framed outbound envelopes, mount
 * identity tokens, accessibility snapshots, and active subscription counts, and
 * answers `a2ui.cmd` messages over the `a2ui.*` host bridge.
 */

import { Scroll, Text, View, computed, effect, host, mount, signal, type JSX } from "nsh";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  JSON_SCHEMA_DRAFT_2020_12,
  buildV10BasicCatalogDocument,
} from "../../src/core/catalog";
import { FunctionRegistry, type NormalizedValidationResult } from "../../src/core/functions";
import { isJsonObject, type JsonObject } from "../../src/core/json_schema";
import type { SurfaceModel } from "../../src/core/processor";
import {
  ResolvedBinding,
  isComponentNode,
  type ComponentNode,
  type NodeAction,
} from "../../src/core/resolver";
import { A2uiStore, type SurfaceSignalStore } from "../../src/store/surface_store";
import { createBasicCatalogRegistry } from "../../src/catalog/basic";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  type AccessibilitySnapshot,
} from "../../src/renderer/accessibility";
import {
  A2uiSurface,
  unwrapBinding,
  type A2uiComponentProps,
} from "../../src/renderer/A2uiSurface";

export interface ExtraCatalogSpec {
  readonly catalogId: string;
  readonly protocolVersion?: string;
  readonly components?: Readonly<Record<string, unknown>>;
  readonly functions?: Readonly<Record<string, unknown>>;
}

export interface SerializedViewNode {
  readonly id: string;
  readonly instanceId: string;
  readonly nodeId: string;
  readonly mountToken: number | null;
  readonly type: string;
  readonly state: string;
  readonly occupiesLayout: boolean;
  readonly isValid?: boolean;
  readonly validationErrors?: readonly string[];
  readonly validationResults?: readonly Record<string, unknown>[];
  readonly hints?: readonly string[];
  readonly props: Record<string, unknown>;
  readonly children: readonly SerializedViewNode[];
}

export interface SerializedSurfaceSnapshot {
  readonly surfaceId: string;
  readonly exists: boolean;
  readonly mounted: boolean;
  readonly disposed: boolean;
  readonly activeSubscriptions: number;
  readonly themeAbsent: boolean;
  readonly dataModel: unknown;
  readonly viewTree: SerializedViewNode | null;
  readonly accessibility: Record<string, AccessibilitySnapshot>;
}

export interface AdapterStateSnapshot {
  readonly surfaces: Record<string, SerializedSurfaceSnapshot>;
  readonly actions: readonly Record<string, unknown>[];
  readonly errors: readonly Record<string, unknown>[];
  readonly outbound: readonly Record<string, unknown>[];
  readonly lastCallId: string | null;
  readonly openedUrls: readonly string[];
  readonly disposedMap: Record<string, boolean>;
}

interface AdapterCommand {
  readonly id: number;
  readonly kind:
    | "process"
    | "clearBuffers"
    | "programmaticInvoke"
    | "unmount"
    | "snapshot";
  readonly messages?: unknown;
  readonly surfaceId?: string;
  readonly targetNode?: string;
  readonly userActivation?: boolean;
  readonly checkNodeIds?: readonly string[];
}

function unwrapDeep(value: unknown): unknown {
  if (value instanceof ResolvedBinding) {
    return unwrapDeep(value.value);
  }
  if (Array.isArray(value)) {
    return value.map(unwrapDeep);
  }
  if (isComponentNode(value) || typeof value === "function") {
    return undefined;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = unwrapDeep(v);
      if (next !== undefined) {
        out[k] = next;
      }
    }
    return out;
  }
  return value;
}

function buildExtraCatalog(spec: ExtraCatalogSpec): Catalog {
  const doc: JsonObject = {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    $id: spec.catalogId,
    protocolVersion: spec.protocolVersion ?? "1.0",
    catalogId: spec.catalogId,
    components: (spec.components ?? {}) as JsonObject,
    functions: (spec.functions ?? {}) as JsonObject,
  };
  return Catalog.fromJson(doc);
}

function createGenericCustomRenderer(componentName: string) {
  return function GenericCustomComponent(props: A2uiComponentProps): JSX.Element {
    const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
    const a11yProps = computed(() => buildViewAccessibilityProps(a11y()));

    if (props.onAccessibilitySnapshot) {
      const report = props.onAccessibilitySnapshot;
      effect(() => {
        report(
          props.node.componentId,
          props.node.instanceId,
          buildAccessibilitySnapshot(a11y()),
        );
      });
    }

    const displayText = computed(() => {
      const resolved = props.bridge.props();
      const parts: string[] = [];
      for (const [key, val] of Object.entries(resolved)) {
        if (
          key === "isValid" ||
          key === "validationErrors" ||
          key === "validationResults"
        ) {
          continue;
        }
        const unwrapped = unwrapBinding(val);
        if (typeof unwrapped === "string" || typeof unwrapped === "number") {
          parts.push(String(unwrapped));
        }
      }
      return parts.join(" ");
    });

    return (
      <View
        testID={props.testId}
        class="rounded-(--radius) border border-border bg-secondary px-2 py-1"
        role={a11yProps().role}
        accessibilityLabel={a11yProps().accessibilityLabel}
        accessibilityDescription={a11yProps().accessibilityDescription}
        accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
        importantForAccessibility={a11yProps().importantForAccessibility}
      >
        <Text testID={`${props.testId}:custom:${componentName}`} class="text-xs">
          {displayText()}
        </Text>
      </View>
    );
  };
}

function extractHints(validationResults: unknown): readonly string[] | undefined {
  if (!Array.isArray(validationResults)) {
    return undefined;
  }
  const hints: string[] = [];
  for (let i = 0; i < validationResults.length; i += 1) {
    const entry = validationResults[i] as Partial<NormalizedValidationResult> | undefined;
    if (
      entry &&
      entry.valid === false &&
      entry.severity === "info" &&
      typeof entry.message === "string"
    ) {
      hints.push(entry.message);
    }
  }
  return hints.length > 0 ? hints : undefined;
}

function extractDirectChildren(
  node: ComponentNode,
  mountedTokens: ReadonlyMap<string, number>,
): ComponentNode[] {
  const props = node.props;
  if (Array.isArray(props["children"])) {
    return (props["children"] as unknown[]).filter(isComponentNode);
  }
  if (isComponentNode(props["child"])) {
    return [props["child"]];
  }
  if (Array.isArray(props["tabs"])) {
    const tabs = props["tabs"] as Array<{ child?: unknown }>;
    // Prefer whichever tab child is currently mounted by BasicTabs.
    for (let i = 0; i < tabs.length; i += 1) {
      const child = tabs[i]?.child;
      if (isComponentNode(child) && mountedTokens.has(child.id)) {
        return [child];
      }
    }
    const first = tabs[0]?.child;
    return isComponentNode(first) ? [first] : [];
  }
  if (isComponentNode(props["trigger"])) {
    const out: ComponentNode[] = [props["trigger"]];
    const content = props["content"];
    if (isComponentNode(content) && mountedTokens.has(content.id)) {
      out.push(content);
    }
    return out;
  }
  return [];
}

function findNodeByComponentId(
  node: ComponentNode | undefined,
  componentId: string,
  mountedTokens: ReadonlyMap<string, number>,
): ComponentNode | undefined {
  if (!node) {
    return undefined;
  }
  if (node.componentId === componentId) {
    return node;
  }
  const children = extractDirectChildren(node, mountedTokens);
  for (let i = 0; i < children.length; i += 1) {
    const found = findNodeByComponentId(children[i], componentId, mountedTokens);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function serializeTree(
  node: ComponentNode,
  surface: SurfaceModel,
  mountedTokens: ReadonlyMap<string, number>,
): SerializedViewNode {
  const resolvedType =
    node.state === "cyclic" && node.type === "Placeholder"
      ? (surface.components.get(node.componentId)?.type ?? node.type)
      : node.type;

  const plainProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node.props)) {
    if (
      k === "child" ||
      k === "children" ||
      k === "tabs" ||
      k === "trigger" ||
      k === "content" ||
      k === "isValid" ||
      k === "validationErrors" ||
      k === "validationResults"
    ) {
      continue;
    }
    const unwrapped = unwrapDeep(v);
    if (unwrapped !== undefined) {
      plainProps[k] = unwrapped;
    }
  }

  const isValid =
    typeof node.props["isValid"] === "boolean"
      ? (node.props["isValid"] as boolean)
      : undefined;
  const validationErrors = Array.isArray(node.props["validationErrors"])
    ? (node.props["validationErrors"] as string[]).slice()
    : undefined;
  const validationResults = Array.isArray(node.props["validationResults"])
    ? (unwrapDeep(node.props["validationResults"]) as Record<string, unknown>[])
    : undefined;
  const hints = extractHints(validationResults);

  const directChildren = extractDirectChildren(node, mountedTokens);
  const children = directChildren.map((child) =>
    serializeTree(child, surface, mountedTokens),
  );

  const mountToken = mountedTokens.get(node.id) ?? null;
  const occupiesLayout = node.state === "resolved" && mountToken !== null;

  return {
    id: node.componentId,
    instanceId: node.instanceId,
    nodeId: node.id,
    mountToken,
    type: resolvedType,
    state: node.state,
    occupiesLayout,
    ...(isValid !== undefined ? { isValid } : {}),
    ...(validationErrors !== undefined ? { validationErrors } : {}),
    ...(validationResults !== undefined ? { validationResults } : {}),
    ...(hints !== undefined ? { hints } : {}),
    props: plainProps,
    children,
  };
}

function safePost(name: string, data: unknown): void {
  if (!host.available()) {
    return;
  }
  try {
    host.post(name, data);
  } catch {
    // Ignore when channel is not registered.
  }
}

function AdapterConformanceApp(): JSX.Element {
  const params = (host.params ?? {}) as {
    strictMode?: boolean;
    extraCatalogs?: ExtraCatalogSpec[];
  };
  const strictMode = params.strictMode === true;
  const skipValidation = !strictMode;
  const extraCatalogs = Array.isArray(params.extraCatalogs)
    ? params.extraCatalogs
    : [];

  const basicDoc = buildV10BasicCatalogDocument();
  const basicFns = basicDoc["functions"] as Record<string, unknown>;
  basicFns["incrementCounter"] = {
    type: "object",
    description: "Adapter conformance helper incrementing a numeric path.",
    returnType: "void",
    allowedCallers: "rendererOrAgent",
    properties: {
      "@call": { const: "incrementCounter" },
      args: {
        type: "object",
        properties: {
          path: { type: "string" },
          targetPath: { type: "string" },
          step: {},
          amount: {},
        },
        unevaluatedProperties: false,
      },
    },
    required: ["@call", "args"],
  };

  const catalogs: Catalog[] = [Catalog.fromJson(basicDoc)];
  const functionRegistry = FunctionRegistry.withBasicV1();
  const componentRegistry = createBasicCatalogRegistry(BASIC_CATALOG_V1_ID);

  functionRegistry.register(BASIC_CATALOG_V1_ID, {
    name: "incrementCounter",
    returnType: "void",
    allowedCallers: "rendererOrAgent",
    requiresUserActivation: false,
    execute: (args, ctx) => {
      const targetPath =
        typeof args["path"] === "string"
          ? args["path"]
          : typeof args["targetPath"] === "string"
            ? args["targetPath"]
            : "/counter";
      const delta =
        typeof args["step"] === "number"
          ? args["step"]
          : typeof args["amount"] === "number"
            ? args["amount"]
            : 1;
      const cur = Number(ctx.dataContext.get(targetPath) ?? 0);
      ctx.dataContext.set(targetPath, cur + delta);
      return undefined;
    },
  });

  for (let i = 0; i < extraCatalogs.length; i += 1) {
    const spec = extraCatalogs[i]!;
    catalogs.push(buildExtraCatalog(spec));
    if (spec.components) {
      for (const compName of Object.keys(spec.components)) {
        componentRegistry.register(
          spec.catalogId,
          compName,
          createGenericCustomRenderer(compName),
        );
      }
    }
  }

  let stepActions: Record<string, unknown>[] = [];
  let stepErrors: Record<string, unknown>[] = [];
  let stepOutbound: Record<string, unknown>[] = [];
  let lastCallId: string | null = null;
  let lastCreatedSurfaceId: string | null = null;
  const openedUrls: string[] = [];

  const knownSurfaces = new Map<string, SurfaceModel>();
  const mountedSurfaceIds = signal<readonly string[]>([]);
  const mountedTokens = new Map<string, number>();
  const allSeenNodes = new Map<string, ComponentNode>();
  const a11yBySurface = new Map<string, Map<string, AccessibilitySnapshot>>();
  let nextMountToken = 1;

  const store = new A2uiStore({
    catalogs,
    functionRegistry,
    strictMode,
    skipValidation,
    onAction: (envelope) => {
      stepActions.push(envelope.action as unknown as Record<string, unknown>);
      stepOutbound.push(envelope as unknown as Record<string, unknown>);
    },
    onOutbound: (envelope) => {
      const rec = envelope as unknown as Record<string, unknown>;
      stepOutbound.push(rec);
      const callAgent = rec["callAgentFunction"];
      if (isJsonObject(callAgent) && typeof callAgent["functionCallId"] === "string") {
        lastCallId = callAgent["functionCallId"];
      }
    },
    onError: (envelope) => {
      const rec = envelope as unknown as Record<string, unknown>;
      const errBody = envelope.error as Record<string, unknown>;
      const surfaceId =
        typeof errBody["surfaceId"] === "string"
          ? errBody["surfaceId"]
          : (lastCreatedSurfaceId ?? "");
      stepErrors.push({
        code: errBody["code"],
        surfaceId,
        message: errBody["message"],
      });
      stepOutbound.push(rec);
    },
    openUrl: (url) => {
      openedUrls.push(url);
    },
  });

  store.processor.onSurfaceCreated((surface) => {
    knownSurfaces.set(surface.id, surface);
    lastCreatedSurfaceId = surface.id;
    mountedSurfaceIds.update((prev) =>
      prev.includes(surface.id) ? prev : [...prev, surface.id],
    );
  });

  store.processor.onSurfaceDeleted((surfaceId) => {
    mountedSurfaceIds.update((prev) => prev.filter((id) => id !== surfaceId));
  });

  const clearBuffers = (): void => {
    stepActions = [];
    stepErrors = [];
    stepOutbound = [];
  };

  const buildSnapshot = (
    checkNodeIds?: readonly string[],
  ): AdapterStateSnapshot => {
    const surfaces: Record<string, SerializedSurfaceSnapshot> = {};
    const mountedSet = new Set(mountedSurfaceIds());

    for (const [surfaceId, surfaceModel] of knownSurfaces) {
      const liveStore = store.getSurface(surfaceId);
      const exists = store.processor.getSurface(surfaceId) !== undefined;
      const isMounted = mountedSet.has(surfaceId) && liveStore !== undefined && !liveStore.disposed();
      const rootNode = isMounted ? liveStore.rootNode() : undefined;
      const viewTree = rootNode
        ? serializeTree(rootNode, surfaceModel, mountedTokens)
        : null;
      const a11yMap = a11yBySurface.get(surfaceId);
      const accessibility: Record<string, AccessibilitySnapshot> = {};
      if (a11yMap) {
        for (const [compId, snap] of a11yMap) {
          accessibility[compId] = snap;
        }
      }
      const hasThemeProp = Object.prototype.hasOwnProperty.call(
        surfaceModel as unknown as Record<string, unknown>,
        "theme",
      );
      surfaces[surfaceId] = {
        surfaceId,
        exists,
        mounted: isMounted,
        disposed: surfaceModel.disposed,
        activeSubscriptions: surfaceModel.activeSubscriptionCount,
        themeAbsent: !hasThemeProp,
        dataModel: surfaceModel.disposed ? null : surfaceModel.dataModel.get("/"),
        viewTree,
        accessibility,
      };
    }

    const disposedMap: Record<string, boolean> = {};
    if (checkNodeIds) {
      for (let i = 0; i < checkNodeIds.length; i += 1) {
        const nid = checkNodeIds[i]!;
        const seen = allSeenNodes.get(nid);
        disposedMap[nid] = seen ? seen.disposed : false;
      }
    }

    return {
      surfaces,
      actions: stepActions.slice(),
      errors: stepErrors.slice(),
      outbound: stepOutbound.slice(),
      lastCallId,
      openedUrls: openedUrls.slice(),
      disposedMap,
    };
  };

  const mountedStores = computed<readonly SurfaceSignalStore[]>(() => {
    const ids = mountedSurfaceIds();
    const out: SurfaceSignalStore[] = [];
    for (let i = 0; i < ids.length; i += 1) {
      const s = store.getSurface(ids[i]!);
      if (s && !s.disposed()) {
        out.push(s);
      }
    }
    return out;
  });

  host.on("a2ui.cmd", (raw) => {
    if (!isJsonObject(raw) || typeof raw["id"] !== "number") {
      return;
    }
    const cmd = raw as unknown as AdapterCommand;
    void (async () => {
      try {
        switch (cmd.kind) {
          case "clearBuffers":
            clearBuffers();
            safePost("a2ui.reply", {
              id: cmd.id,
              ok: true,
              snapshot: buildSnapshot(cmd.checkNodeIds),
            });
            break;

          case "process":
            clearBuffers();
            try {
              store.processMessages(cmd.messages);
            } catch {
              // Protocol errors already emitted their v1.0 error envelope via onError.
            }
            // Flush microtasks so reactive effects & mount probes settle before snapshotting.
            await Promise.resolve();
            await Promise.resolve();
            safePost("a2ui.reply", {
              id: cmd.id,
              ok: true,
              snapshot: buildSnapshot(cmd.checkNodeIds),
            });
            break;

          case "programmaticInvoke": {
            clearBuffers();
            const targetSurfaceId = cmd.surfaceId ?? lastCreatedSurfaceId ?? "";
            const surfaceStore = store.getSurface(targetSurfaceId);
            const targetNode =
              surfaceStore && cmd.targetNode
                ? findNodeByComponentId(
                    surfaceStore.rootNode(),
                    cmd.targetNode,
                    mountedTokens,
                  )
                : undefined;
            if (!targetNode) {
              throw new Error(
                `programmaticInvoke: node '${cmd.targetNode ?? ""}' not found on surface '${targetSurfaceId}'`,
              );
            }
            const actionFn = targetNode.props["action"] as NodeAction | undefined;
            if (typeof actionFn !== "function") {
              throw new Error(
                `programmaticInvoke: node '${cmd.targetNode}' has no callable action`,
              );
            }
            await actionFn({ userActivation: cmd.userActivation ?? false });
            await Promise.resolve();
            safePost("a2ui.reply", {
              id: cmd.id,
              ok: true,
              snapshot: buildSnapshot(cmd.checkNodeIds),
            });
            break;
          }

          case "unmount": {
            clearBuffers();
            const targetSurfaceId = cmd.surfaceId ?? lastCreatedSurfaceId ?? "";
            mountedSurfaceIds.update((prev) =>
              prev.filter((id) => id !== targetSurfaceId),
            );
            const surfaceStore = store.getSurface(targetSurfaceId);
            surfaceStore?.dispose();
            await Promise.resolve();
            safePost("a2ui.reply", {
              id: cmd.id,
              ok: true,
              snapshot: buildSnapshot(cmd.checkNodeIds),
            });
            break;
          }

          case "snapshot":
            await Promise.resolve();
            await Promise.resolve();
            safePost("a2ui.reply", {
              id: cmd.id,
              ok: true,
              snapshot: buildSnapshot(cmd.checkNodeIds),
            });
            break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        safePost("a2ui.reply", { id: cmd.id, ok: false, error: message });
      }
    })();
  });

  return (
    <Scroll class="flex-1 bg-background" contentClass="p-4">
      <Each of={mountedStores()} key={(s) => s.surfaceId}>
        {(surface) => (
          <A2uiSurface
            store={surface()}
            registry={componentRegistry}
            onNodeMount={(node) => {
              allSeenNodes.set(node.id, node);
              if (!mountedTokens.has(node.id)) {
                mountedTokens.set(node.id, nextMountToken);
                nextMountToken += 1;
              }
            }}
            onNodeUnmount={(node) => {
              mountedTokens.delete(node.id);
            }}
            onAccessibilitySnapshot={(componentId, _instanceId, snap) => {
              const sid = surface().surfaceId;
              let map = a11yBySurface.get(sid);
              if (!map) {
                map = new Map();
                a11yBySurface.set(sid, map);
              }
              map.set(componentId, snap);
            }}
          />
        )}
      </Each>
    </Scroll>
  );
}

mount(AdapterConformanceApp);
