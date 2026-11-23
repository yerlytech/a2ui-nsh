/**
 * Multi-catalog TSX component registry for `a2ui-nsh`.
 *
 * Strictly scopes component renderers by `(catalogId, componentType)` following
 * A2UI v1.0 multi-catalog resolution rules: there is zero implicit fallback
 * across catalogs.
 */

import type { JSX } from "nsh";
import type { ComponentNode } from "../core/resolver";
import type {
  ReactiveComponentNode,
  SurfaceSignalStore,
} from "../store/surface_store";
import type { AccessibilitySnapshot } from "./accessibility";

/** Props passed by `A2uiSurface` to every registered catalog component renderer. */
export interface A2uiComponentProps {
  /** Underlying pure-TS `ComponentNode` from the T8 resolver. */
  readonly node: ComponentNode;
  /** Fine-grained `nsh` signal bridge for `node` from `SurfaceSignalStore`. */
  readonly bridge: ReactiveComponentNode;
  /** Owning T8 `SurfaceSignalStore`. */
  readonly store: SurfaceSignalStore;
  /** Recursively renders a child `ComponentNode` within the same surface. */
  readonly renderNode: (child: ComponentNode) => JSX.Element;
  /** Deterministic `testID` for this node instance (`<surfaceId>:<instanceId>`). */
  readonly testId: string;
  /** Optional test-mode accessibility snapshot reporter (Spec 001 §3 Gap #3). */
  readonly onAccessibilitySnapshot?: (
    componentId: string,
    instanceId: string,
    snapshot: AccessibilitySnapshot,
  ) => void;
}

/** Function rendering a resolved A2UI component into `nsh` JSX elements. */
export type A2uiComponentRenderer = (props: A2uiComponentProps) => JSX.Element;

/**
 * Registry mapping `(catalogId, componentType)` pairs to TSX component renderers.
 *
 * Catalogs are completely isolated: resolving a component requires an exact
 * `catalogId` match (as resolved by the v1.0 `MessageProcessor` / `NodeResolver`).
 */
export class ComponentRegistry {
  private readonly catalogs = new Map<
    string,
    Map<string, A2uiComponentRenderer>
  >();

  /** Registers a single component renderer under `catalogId` and `componentType`. */
  register(
    catalogId: string,
    componentType: string,
    renderer: A2uiComponentRenderer,
  ): this {
    if (!catalogId || !componentType) {
      throw new Error(
        "ComponentRegistry.register requires non-empty catalogId and componentType.",
      );
    }
    let table = this.catalogs.get(catalogId);
    if (!table) {
      table = new Map<string, A2uiComponentRenderer>();
      this.catalogs.set(catalogId, table);
    }
    table.set(componentType, renderer);
    return this;
  }

  /** Registers a map of component renderers under `catalogId`. */
  registerCatalog(
    catalogId: string,
    components: Readonly<Record<string, A2uiComponentRenderer>>,
  ): this {
    for (const [componentType, renderer] of Object.entries(components)) {
      this.register(catalogId, componentType, renderer);
    }
    return this;
  }

  /**
   * Resolves the renderer for `(catalogId, componentType)` with strict catalog
   * isolation (no implicit fallback to another catalog).
   */
  resolve(
    catalogId: string | undefined,
    componentType: string,
  ): A2uiComponentRenderer | undefined {
    if (!catalogId) {
      return undefined;
    }
    return this.catalogs.get(catalogId)?.get(componentType);
  }

  /** Returns true if a renderer is registered for `(catalogId, componentType)`. */
  has(catalogId: string | undefined, componentType: string): boolean {
    return this.resolve(catalogId, componentType) !== undefined;
  }

  /** Returns registered catalog IDs in insertion order. */
  catalogIds(): readonly string[] {
    return Array.from(this.catalogs.keys());
  }

  /** Returns registered component type names for `catalogId`. */
  componentTypes(catalogId: string): readonly string[] {
    const table = this.catalogs.get(catalogId);
    return table ? Array.from(table.keys()) : [];
  }

  /** Returns a shallow copy of this registry for isolated composition or tests. */
  clone(): ComponentRegistry {
    const copy = new ComponentRegistry();
    for (const [catalogId, table] of this.catalogs) {
      for (const [type, renderer] of table) {
        copy.register(catalogId, type, renderer);
      }
    }
    return copy;
  }
}
