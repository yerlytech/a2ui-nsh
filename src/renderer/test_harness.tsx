/**
 * Headless `nsh test` harness entry point for rendering A2UI v1.0 surfaces
 * backed by the T8 `A2uiStore`, `A2uiSurface`, `ComponentRegistry`, and Basic
 * Catalog v1 layout & display components.
 *
 * Driven by `host.params` at startup and `host.on("a2ui.message", ...)` at
 * runtime; reports mount counts, accessibility snapshots, and errors via
 * `host.post("a2ui.*", ...)` without polluting `app.texts()`.
 */

import { Scroll, Text, View, computed, effect, host, mount, type JSX } from "nsh";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  JSON_SCHEMA_DRAFT_2020_12,
  buildV10BasicCatalogDocument,
} from "../core/catalog";
import { FunctionRegistry } from "../core/functions";
import type { JsonObject } from "../core/json_schema";
import { A2uiStore } from "../store/surface_store";
import { createBasicCatalogRegistry } from "../catalog/basic";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
} from "./accessibility";
import {
  A2uiSurface,
  unwrapString,
  type A2uiComponentProps,
} from "./A2uiSurface";

/** Mock `xlarge` company catalog ID used by multi-catalog override tests. */
export const MOCK_XLARGE_CATALOG_ID =
  "https://xlarge.example/catalogs/erp/v1/catalog.json" as const;

function buildMockXlargeCatalog(): Catalog {
  const doc: JsonObject = {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    $id: MOCK_XLARGE_CATALOG_ID,
    protocolVersion: "1.0",
    title: "Mock xlarge ERP Catalog",
    catalogId: MOCK_XLARGE_CATALOG_ID,
    components: {
      StatusBadge: {
        type: "object",
        properties: {
          component: { const: "StatusBadge" },
          badgeText: { $ref: "common_types.json#/$defs/DynamicString" },
        },
        required: ["component", "badgeText"],
      },
      Text: {
        type: "object",
        properties: {
          component: { const: "Text" },
          text: { $ref: "common_types.json#/$defs/DynamicString" },
        },
        required: ["component", "text"],
      },
    },
    functions: {
      formatSku: {
        type: "object",
        returnType: "string",
        properties: {
          "@call": { const: "formatSku" },
          args: {
            type: "object",
            properties: {
              code: { $ref: "common_types.json#/$defs/DynamicString" },
            },
            required: ["code"],
            unevaluatedProperties: false,
          },
        },
        required: ["@call", "args"],
      },
    },
  };
  return Catalog.fromJson(doc);
}

function MockXlargeStatusBadge(props: A2uiComponentProps): JSX.Element {
  const textProp = props.bridge.prop("badgeText");
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
      <Text class="text-xs text-secondary-foreground">
        {unwrapString(textProp())}
      </Text>
    </View>
  );
}

function MockXlargeText(props: A2uiComponentProps): JSX.Element {
  const textProp = props.bridge.prop("text");
  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yProps = computed(() => buildViewAccessibilityProps(a11y()));

  return (
    <Text
      testID={props.testId}
      class="text-base text-primary"
      role={a11yProps().role}
      accessibilityLabel={a11yProps().accessibilityLabel}
      accessibilityDescription={a11yProps().accessibilityDescription}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
    >
      {`[xlarge] ${unwrapString(textProp())}`}
    </Text>
  );
}

function safePost(name: string, data: unknown): void {
  if (!host.available()) {
    return;
  }
  try {
    host.post(name, data);
  } catch {
    // Ignore when host does not list this telemetry channel.
  }
}

function TestHarnessApp(): JSX.Element {
  const params = host.params ?? {};
  const strictMode = params["strictMode"] === true;
  const skipValidation = params["skipValidation"] === true;
  const enableXlarge = params["enableXlargeCatalog"] === true;
  const enableTestFunctions = params["enableTestFunctions"] === true;
  const initialMessages = params["messages"];

  const basicDoc = buildV10BasicCatalogDocument();
  if (enableTestFunctions) {
    const fns = basicDoc["functions"] as Record<string, unknown>;
    fns["incrementCounter"] = {
      type: "object",
      description: "Test helper incrementing a numeric path in the data model.",
      returnType: "void",
      allowedCallers: "rendererOrAgent",
      properties: {
        "@call": { const: "incrementCounter" },
        args: {
          type: "object",
          properties: {
            path: { type: "string" },
            step: { type: "number" },
          },
          required: ["path", "step"],
          unevaluatedProperties: false,
        },
      },
      required: ["@call", "args"],
    };
  }

  const catalogs: Catalog[] = [Catalog.fromJson(basicDoc)];
  const functionRegistry = FunctionRegistry.withBasicV1();
  const componentRegistry = createBasicCatalogRegistry(BASIC_CATALOG_V1_ID);

  if (enableTestFunctions) {
    functionRegistry.register(BASIC_CATALOG_V1_ID, {
      name: "incrementCounter",
      returnType: "void",
      allowedCallers: "rendererOrAgent",
      requiresUserActivation: false,
      execute: (args, ctx) => {
        const path = String(args["path"] ?? "/counter");
        const step = Number(args["step"] ?? 1);
        const cur = Number(ctx.dataContext.get(path) ?? 0);
        ctx.dataContext.set(path, cur + step);
        return undefined;
      },
    });
  }

  if (enableXlarge) {
    catalogs.push(buildMockXlargeCatalog());
    functionRegistry.register(MOCK_XLARGE_CATALOG_ID, {
      name: "formatSku",
      returnType: "string",
      allowedCallers: "rendererOrAgent",
      requiresUserActivation: false,
      execute: (args) => {
        const raw = args["code"];
        const code = typeof raw === "string" ? raw : String(raw ?? "");
        return `SKU:${code.toUpperCase()}`;
      },
    });
    componentRegistry.registerCatalog(MOCK_XLARGE_CATALOG_ID, {
      StatusBadge: MockXlargeStatusBadge,
      Text: MockXlargeText,
    });
  }

  const store = new A2uiStore({
    catalogs,
    functionRegistry,
    strictMode,
    skipValidation,
    onAction: (envelope) => {
      safePost("a2ui.action", envelope);
    },
    openUrl: (url) => {
      safePost("a2ui.openUrl", { url });
    },
    onError: (envelope) => {
      safePost("a2ui.error", envelope);
    },
  });

  const handleMessages = (payload: unknown): void => {
    try {
      store.processMessages(payload);
    } catch (err) {
      safePost("a2ui.exception", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (initialMessages !== undefined) {
    handleMessages(initialMessages);
  }

  host.on("a2ui.message", (payload) => {
    handleMessages(payload);
  });

  host.on("a2ui.readData", (payload) => {
    const req = (payload ?? {}) as { surfaceId?: string; path?: string };
    const surface = req.surfaceId
      ? store.getSurface(req.surfaceId)
      : store.surfaces()[0];
    const path = typeof req.path === "string" ? req.path : "/";
    safePost("a2ui.data", {
      surfaceId: surface?.surfaceId ?? null,
      path,
      value: surface ? surface.surface.dataModel.get(path) : undefined,
    });
  });

  return (
    <Scroll class="flex-1 bg-background" contentClass="p-4">
      <Each of={store.surfaces()} key={(s) => s.surfaceId}>
        {(surface) => (
          <A2uiSurface
            store={surface()}
            registry={componentRegistry}
            onNodeMount={(node) => {
              safePost("a2ui.mount", {
                surfaceId: surface().surfaceId,
                componentId: node.componentId,
                instanceId: node.instanceId,
                nodeId: node.id,
                type: node.type,
                catalogId: node.catalogId ?? null,
              });
            }}
            onAccessibilitySnapshot={(componentId, instanceId, snapshot) => {
              safePost("a2ui.a11y", {
                surfaceId: surface().surfaceId,
                componentId,
                instanceId,
                snapshot,
              });
            }}
          />
        )}
      </Each>
    </Scroll>
  );
}

mount(TestHarnessApp);
