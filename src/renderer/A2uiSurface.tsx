/**
 * Top-level Native Shell (`nsh 0.7.1`) renderer shell for A2UI v1.0 surfaces.
 *
 * Reads the T8 `SurfaceSignalStore` directly, dispatches each resolved
 * `ComponentNode` through `ComponentRegistry` keyed by `node.id` so scalar
 * `updateDataModel` mutations update leaves with zero parent remounts while
 * pending placeholders, type changes, and template repeaters upgrade in place.
 */

import {
  ErrorBoundary,
  Text,
  View,
  cleanup,
  type JSX,
  type StyleProp,
  type ViewStyle,
} from "nsh";
import { ResolvedBinding, type ComponentNode } from "../core/resolver";
import type { SurfaceSignalStore } from "../store/surface_store";
import type { AccessibilitySnapshot } from "./accessibility";
import {
  ComponentRegistry,
  type A2uiComponentProps,
  type A2uiComponentRenderer,
} from "./registry";

export {
  ComponentRegistry,
  type A2uiComponentProps,
  type A2uiComponentRenderer,
} from "./registry";

/** Deterministic `testID` for a rendered `ComponentNode` within a surface. */
export function buildNodeTestId(
  surfaceId: string,
  node: ComponentNode,
): string {
  return `${surfaceId}:${node.instanceId}`;
}

/** Unwraps a T8 `ResolvedBinding` (or returns a plain value as-is). */
export function unwrapBinding<T = unknown>(value: unknown): T | undefined {
  if (value instanceof ResolvedBinding) {
    return value.value as T;
  }
  return value as T | undefined;
}

/** Unwraps a dynamic string binding, coercing nullish values to `""`. */
export function unwrapString(value: unknown): string {
  const raw = unwrapBinding(value);
  if (raw === undefined || raw === null) {
    return "";
  }
  return typeof raw === "string" ? raw : String(raw);
}

/** Unwraps an optional dynamic string binding, returning `undefined` when empty/nullish. */
export function unwrapOptionalString(value: unknown): string | undefined {
  const raw = unwrapBinding(value);
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const str = typeof raw === "string" ? raw : String(raw);
  return str.length > 0 ? str : undefined;
}

/** Unwraps a numeric value (returning `undefined` for non-finite values). */
export function unwrapNumber(value: unknown): number | undefined {
  const raw = unwrapBinding(value);
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

/** Unwraps a boolean value. */
export function unwrapBoolean(value: unknown): boolean | undefined {
  const raw = unwrapBinding(value);
  return typeof raw === "boolean" ? raw : undefined;
}

/**
 * Converts A2UI's `weight` property into an `nsh` flex `ViewStyle`.
 *
 * Because `nsh` views default to `flexShrink: 0` (unlike CSS's `1`) and
 * `minWidth: auto`, positive weights also opt into `flexShrink: 1` and
 * `minWidth: 0` so weighted children in a `Row` can shrink and wrap text
 * instead of pushing trailing siblings past the container edge.
 */
export function weightStyle(weight: unknown): ViewStyle {
  const numeric = unwrapNumber(weight);
  if (numeric !== undefined && numeric > 0) {
    return { flexGrow: numeric, flexShrink: 1, minWidth: 0 };
  }
  if (numeric === 0) {
    return { flexGrow: 0 };
  }
  return {};
}

export interface A2uiNodeProps {
  /** Resolved `ComponentNode` to render. */
  readonly node: ComponentNode;
  /** Owning T8 `SurfaceSignalStore`. */
  readonly store: SurfaceSignalStore;
  /** Multi-catalog component renderer registry. */
  readonly registry: ComponentRegistry;
  /** Prefix used when building `testID`s (defaults to `store.surfaceId`). */
  readonly testIdPrefix?: string;
  /** Optional lifecycle probe invoked once when a resolved node mounts. */
  readonly onNodeMount?: (node: ComponentNode) => void;
  /** Optional lifecycle probe invoked when a mounted node unmounts. */
  readonly onNodeUnmount?: (node: ComponentNode) => void;
  /** Optional test-mode accessibility snapshot reporter. */
  readonly onAccessibilitySnapshot?: (
    componentId: string,
    instanceId: string,
    snapshot: AccessibilitySnapshot,
  ) => void;
}

/**
 * Renders one `ComponentNode` keyed by `node.id`.
 *
 * Keeping the `<Each>` key equal to `node.id` ensures:
 * - In-place prop/data updates preserve the mounted subtree (0 remounts).
 * - Pending-to-resolved upgrades, component type replacements, or catalog
 *   changes swap only this node without remounting its parent container.
 */
export function A2uiNode(props: A2uiNodeProps): JSX.Element {
  const prefix = props.testIdPrefix ?? props.store.surfaceId;

  const renderChild = (child: ComponentNode): JSX.Element => (
    <A2uiNode
      node={child}
      store={props.store}
      registry={props.registry}
      testIdPrefix={prefix}
      onNodeMount={props.onNodeMount}
      onNodeUnmount={props.onNodeUnmount}
      onAccessibilitySnapshot={props.onAccessibilitySnapshot}
    />
  );

  return (
    <Each of={[props.node]} key={(n) => n.id}>
      {(currentNodeAccessor) => {
        const node = currentNodeAccessor();
        const testId = buildNodeTestId(prefix, node);

        if (node.state === "pending") {
          return (
            <View
              testID={`${testId}:placeholder:pending`}
              style={{ display: "none" }}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          );
        }

        if (node.state === "cyclic" || node.state === "unknown-type") {
          return (
            <View
              testID={`${testId}:placeholder:${node.state}`}
              style={{ display: "none" }}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          );
        }

        const renderer = props.registry.resolve(node.catalogId, node.type);
        if (!renderer) {
          return (
            <View
              testID={`${testId}:placeholder:unregistered`}
              style={{ display: "none" }}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          );
        }

        const bridge = props.store.nodeBridge(node);
        props.onNodeMount?.(node);
        if (props.onNodeUnmount) {
          const reportUnmount = props.onNodeUnmount;
          cleanup(() => {
            reportUnmount(node);
          });
        }

        const componentProps: A2uiComponentProps = {
          node,
          bridge,
          store: props.store,
          renderNode: renderChild,
          testId,
          onAccessibilitySnapshot: props.onAccessibilitySnapshot,
        };

        return (
          <ErrorBoundary
            fallback={() => (
              <View testID={`${testId}:error`}>
                <Text class="text-xs text-destructive">
                  {`Unable to render ${node.type}`}
                </Text>
              </View>
            )}
          >
            {renderer(componentProps)}
          </ErrorBoundary>
        );
      }}
    </Each>
  );
}

export interface A2uiSurfaceProps {
  /** T8 reactive store for one A2UI v1.0 surface. */
  readonly store: SurfaceSignalStore;
  /** Multi-catalog component renderer registry. */
  readonly registry: ComponentRegistry;
  /** Optional override for `testID` prefix (defaults to `store.surfaceId`). */
  readonly testIdPrefix?: string;
  /** Optional mount probe invoked once per mounted resolved component node. */
  readonly onNodeMount?: (node: ComponentNode) => void;
  /** Optional unmount probe invoked when a mounted component node unmounts. */
  readonly onNodeUnmount?: (node: ComponentNode) => void;
  /** Optional test-mode accessibility snapshot reporter. */
  readonly onAccessibilitySnapshot?: (
    componentId: string,
    instanceId: string,
    snapshot: AccessibilitySnapshot,
  ) => void;
  /** Optional Tailwind classes applied to the surface root container. */
  readonly class?: string;
  /** Optional inline styles applied to the surface root container. */
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Renders a live A2UI v1.0 surface backed by a T8 `SurfaceSignalStore`.
 *
 * Unmounts cleanly when `deleteSurface` disposes `store`, and renders nothing
 * until the `root` component arrives.
 */
export function A2uiSurface(props: A2uiSurfaceProps): JSX.Element {
  const prefix = props.testIdPrefix ?? props.store.surfaceId;
  const activeRoot = (): ComponentNode | undefined => {
    if (props.store.disposed()) {
      return undefined;
    }
    return props.store.rootNode();
  };

  return (
    <If when={activeRoot()}>
      {(root) => (
        <View
          testID={`surface:${prefix}`}
          class={props.class}
          style={props.style}
        >
          <A2uiNode
            node={root()}
            store={props.store}
            registry={props.registry}
            testIdPrefix={prefix}
            onNodeMount={props.onNodeMount}
            onNodeUnmount={props.onNodeUnmount}
            onAccessibilitySnapshot={props.onAccessibilitySnapshot}
          />
        </View>
      )}
    </If>
  );
}
