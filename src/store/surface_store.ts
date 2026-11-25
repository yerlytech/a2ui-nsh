/**
 * Native Shell (`nsh 0.7.0`) reactive signal bridge for A2UI v1.0 surfaces
 * and `ComponentNode` trees.
 *
 * Bridges pure TypeScript `src/core/` primitives (`MessageProcessor`,
 * `SurfaceModel`, `NodeResolver`, `ComponentNode`, `DataModel`) onto `nsh`'s
 * native Rust reactive graph (`signal`, `computed`, `batch`, `untracked`) with
 * zero-remount leaf updates and complete subscription disposal.
 */

import {
  batch,
  signal,
  untracked,
  type Accessor,
  type Signal,
} from "nsh";
import type { ComponentMetadata } from "../core/catalog";
import { deepEqual, type DataSubscription } from "../core/data_model";
import { resolvePath, type CanonicalPointer } from "../core/pointer";
import {
  MessageProcessor,
  type MessageProcessorOptions,
  type ProcessMessagesOptions,
  type SurfaceModel,
} from "../core/processor";
import {
  NodeResolver,
  type ComponentNode,
  type NodeProps,
  type NodeResolverOptions,
  type NodeState,
} from "../core/resolver";
import type { RendererErrorEnvelope } from "../core/validator";

/**
 * Reactive `nsh` signal wrapper around one pure-TS `ComponentNode`.
 *
 * Leaf prop readers (`prop("text")`) and metadata readers (`metadata()`) track
 * independently so scalar data-model mutations only re-run subscribed leaves
 * without remounting parent containers.
 */
export class ReactiveComponentNode<TProps extends NodeProps = NodeProps> {
  readonly node: ComponentNode<TProps>;
  readonly id: string;
  readonly instanceId: string;
  readonly componentId: string;
  readonly type: string;
  readonly catalogId: string | undefined;
  readonly dataPath: CanonicalPointer;
  readonly state: NodeState;
  readonly isPlaceholder: boolean;

  private readonly propsSignal: Signal<TProps>;
  private readonly metadataSignal: Signal<ComponentMetadata | undefined>;
  private readonly accessibilitySignal: Signal<
    Readonly<Record<string, unknown>> | undefined
  >;
  private readonly destroyedSignal: Signal<boolean>;
  private readonly propSignals = new Map<string, Signal<unknown>>();
  private readonly unsubs: Array<() => void> = [];
  private _disposed = false;

  constructor(node: ComponentNode<TProps>) {
    this.node = node;
    this.id = node.id;
    this.instanceId = node.instanceId;
    this.componentId = node.componentId;
    this.type = node.type;
    this.catalogId = node.catalogId;
    this.dataPath = node.dataPath;
    this.state = node.state;
    this.isPlaceholder = node.isPlaceholder;

    this.propsSignal = signal<TProps>(node.props);
    this.metadataSignal = signal<ComponentMetadata | undefined>(node.metadata);
    this.accessibilitySignal = signal<
      Readonly<Record<string, unknown>> | undefined
    >(node.accessibility, { equals: deepEqual });
    this.destroyedSignal = signal<boolean>(node.disposed);

    if (!node.disposed) {
      this.unsubs.push(
        node.onPropsChange((nextProps) => {
          batch(() => {
            this.propsSignal.set(nextProps);
            this.accessibilitySignal.set(node.accessibility);
            for (const [key, sig] of this.propSignals) {
              sig.set(nextProps[key]);
            }
          });
        }),
        node.onMetadataChange((nextMeta) => {
          this.metadataSignal.set(nextMeta);
        }),
        node.onAccessibilityChange((nextA11y) => {
          this.accessibilitySignal.set(nextA11y);
        }),
        node.onDestroyed(() => {
          this.destroyedSignal.set(true);
          this.dispose();
        }),
      );
    } else {
      this._disposed = true;
    }
  }

  /** Reactive accessor for the node's resolved props snapshot. */
  get props(): Accessor<TProps> {
    return this.propsSignal;
  }

  /** Reactive accessor for the node's envelope metadata (separate from `props`). */
  get metadata(): Accessor<ComponentMetadata | undefined> {
    return this.metadataSignal;
  }

  /** Reactive accessor for the node's resolved `@accessibility` attributes. */
  get accessibility(): Accessor<Readonly<Record<string, unknown>> | undefined> {
    return this.accessibilitySignal;
  }

  /** Reactive accessor flipping to `true` when the underlying node is destroyed. */
  get destroyed(): Accessor<boolean> {
    return this.destroyedSignal;
  }

  /**
   * Fine-grained signal accessor tracking a single property key on `props`.
   * Backed by an owner-independent `nsh` `signal` so calling `prop(key)` inside
   * a `computed()` or `effect()` never suffers child-owner disposal on re-runs.
   */
  prop<V = unknown>(key: string): Accessor<V> {
    let sig = this.propSignals.get(key);
    if (!sig) {
      sig = signal<unknown>(untracked(() => this.propsSignal()[key]));
      this.propSignals.set(key, sig);
    }
    return sig as Accessor<V>;
  }

  /** Detaches bridge listeners from the underlying `ComponentNode`. Idempotent. */
  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    for (let i = 0; i < this.unsubs.length; i += 1) {
      this.unsubs[i]!();
    }
    this.unsubs.length = 0;
    this.propSignals.clear();
  }
}

export interface SurfaceSignalStoreOptions
  extends Omit<NodeResolverOptions, "surface"> {
  readonly surface: SurfaceModel;
}

/**
 * Per-surface `nsh` reactive store bridging one `SurfaceModel` and its
 * `NodeResolver` onto `nsh` signals.
 */
export class SurfaceSignalStore {
  readonly surfaceId: string;
  readonly surface: SurfaceModel;
  readonly resolver: NodeResolver;

  private readonly rootNodeSignal: Signal<ComponentNode | undefined>;
  private readonly activeNodeCountSignal: Signal<number>;
  private readonly errorsSignal: Signal<readonly RendererErrorEnvelope[]>;
  private readonly disposedSignal: Signal<boolean>;

  private readonly nodeBridges = new Map<
    ComponentNode,
    ReactiveComponentNode
  >();
  private readonly dataPathSignals = new Map<
    CanonicalPointer,
    { readonly sig: Signal<unknown>; readonly sub: DataSubscription }
  >();
  private readonly unsubs: Array<() => void> = [];
  private _disposed = false;

  constructor(options: SurfaceSignalStoreOptions) {
    this.surface = options.surface;
    this.surfaceId = options.surface.id;
    this.errorsSignal = signal<readonly RendererErrorEnvelope[]>([]);
    this.disposedSignal = signal<boolean>(this.surface.disposed);

    // Subscribe to surface errors BEFORE creating NodeResolver so errors emitted
    // during synchronous initial resolution (e.g. inline createSurface) are captured.
    this.unsubs.push(
      this.surface.onError((envelope) => {
        if (!this._disposed) {
          this.errorsSignal.update((prev) => [...prev, envelope]);
        }
      }),
    );

    this.resolver = new NodeResolver(options);

    this.rootNodeSignal = signal<ComponentNode | undefined>(
      this.resolver.rootNode,
    );
    this.activeNodeCountSignal = signal<number>(this.resolver.activeNodeCount);

    const syncCounts = (): void => {
      if (!this._disposed) {
        this.activeNodeCountSignal.set(this.resolver.activeNodeCount);
      }
    };

    this.unsubs.push(
      this.resolver.onRootNodeChange((nextRoot) => {
        batch(() => {
          this.rootNodeSignal.set(nextRoot);
          this.activeNodeCountSignal.set(this.resolver.activeNodeCount);
        });
      }),
      this.surface.onComponentsChanged(syncCounts),
      this.surface.onComponentRemoved(syncCounts),
      this.surface.dataModel.onAfterCommit(syncCounts),
      this.surface.onDisposed(() => {
        this.dispose();
      }),
    );
  }

  /** Reactive accessor for the root `ComponentNode` (or `undefined` before root arrives). */
  get rootNode(): Accessor<ComponentNode | undefined> {
    return this.rootNodeSignal;
  }

  /** Reactive accessor for the current number of mounted nodes in the surface tree. */
  get activeNodeCount(): Accessor<number> {
    return this.activeNodeCountSignal;
  }

  /** Reactive accessor for surface-level error envelopes emitted during resolution. */
  get errors(): Accessor<readonly RendererErrorEnvelope[]> {
    return this.errorsSignal;
  }

  /** Reactive accessor flipping to `true` when the surface or store is disposed. */
  get disposed(): Accessor<boolean> {
    return this.disposedSignal;
  }

  /** Number of active per-path `DataModel` signal subscriptions owned by this store. */
  get activeDataSignalCount(): number {
    return this.dataPathSignals.size;
  }

  /** Number of cached `ReactiveComponentNode` bridges currently held by this store. */
  get activeNodeBridgeCount(): number {
    return this.nodeBridges.size;
  }

  /**
   * Returns a cached `ReactiveComponentNode` for `node`, automatically evicted
   * and disposed when `node` is destroyed.
   */
  nodeBridge<TProps extends NodeProps = NodeProps>(
    node: ComponentNode<TProps>,
  ): ReactiveComponentNode<TProps> {
    const existing = this.nodeBridges.get(node as ComponentNode);
    if (existing) {
      return existing as ReactiveComponentNode<TProps>;
    }
    const bridge = new ReactiveComponentNode(node);
    if (!node.disposed && !this._disposed) {
      this.nodeBridges.set(node as ComponentNode, bridge as ReactiveComponentNode);
      node.onDestroyed(() => {
        this.nodeBridges.delete(node as ComponentNode);
      });
    }
    return bridge;
  }

  /**
   * Returns a cached per-path reactive `nsh` accessor reading `path` (resolved
   * against optional `scope`, defaulting to `"/"`) from the surface `DataModel`.
   *
   * Scalar mutations to unrelated paths never notify this accessor.
   */
  dataSignal(path: string, scope: string = "/"): Accessor<unknown> {
    const canonical = resolvePath(path, scope);
    const existing = this.dataPathSignals.get(canonical);
    if (existing) {
      return existing.sig;
    }
    const sig = signal<unknown>(this.surface.dataModel.get(canonical), {
      equals: deepEqual,
    });
    const sub = this.surface.dataModel.subscribe(canonical, (nextVal) => {
      if (!this._disposed) {
        sig.set(nextVal);
      }
    });
    if (!this._disposed) {
      this.dataPathSignals.set(canonical, { sig, sub });
    } else {
      sub.unsubscribe();
    }
    return sig;
  }

  /** Writes `value` to `path` (resolved against optional `scope`) inside a single `nsh` batch. */
  setData(path: string, value: unknown, scope: string = "/"): void {
    const canonical = resolvePath(path, scope);
    batch(() => {
      this.surface.dataModel.set(canonical, value);
    });
  }

  /** Deletes `path` (resolved against optional `scope`) inside a single `nsh` batch. */
  deleteData(path: string, scope: string = "/"): void {
    const canonical = resolvePath(path, scope);
    batch(() => {
      this.surface.dataModel.delete(canonical);
    });
  }

  /** Clears accumulated surface error envelopes. */
  clearErrors(): void {
    this.errorsSignal.set([]);
  }

  /** Disposes the resolver, all node bridges, and all per-path `DataModel` watchers. Idempotent. */
  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    for (let i = 0; i < this.unsubs.length; i += 1) {
      this.unsubs[i]!();
    }
    this.unsubs.length = 0;

    for (const entry of this.dataPathSignals.values()) {
      entry.sub.unsubscribe();
    }
    this.dataPathSignals.clear();

    for (const bridge of this.nodeBridges.values()) {
      bridge.dispose();
    }
    this.nodeBridges.clear();

    this.resolver.dispose();

    batch(() => {
      this.rootNodeSignal.set(undefined);
      this.activeNodeCountSignal.set(0);
      this.disposedSignal.set(true);
    });
  }
}

export interface A2uiStoreOptions extends MessageProcessorOptions {
  /** Existing `MessageProcessor` to wrap instead of constructing a new one. */
  readonly processor?: MessageProcessor;
  /** Whether `store.dispose()` also disposes `processor`. Defaults to `true` when constructed internally, `false` when injected. */
  readonly ownsProcessor?: boolean;
}

/**
 * Multi-surface `nsh` signal store wrapping a `MessageProcessor`.
 *
 * Automatically creates a `SurfaceSignalStore` when `createSurface` runs and
 * disposes it when `deleteSurface` runs.
 */
export class A2uiStore {
  readonly processor: MessageProcessor;
  private readonly ownsProcessor: boolean;
  private readonly storeMap = new Map<string, SurfaceSignalStore>();
  private readonly surfaceLookupSignals = new Map<
    string,
    Signal<SurfaceSignalStore | undefined>
  >();
  private readonly surfaceIdsSignal: Signal<readonly string[]>;
  private readonly surfacesSignal: Signal<readonly SurfaceSignalStore[]>;
  private readonly unsubs: Array<() => void> = [];
  private _disposed = false;

  constructor(options: A2uiStoreOptions = {}) {
    if (options.processor) {
      this.processor = options.processor;
      this.ownsProcessor = options.ownsProcessor ?? false;
    } else {
      this.processor = new MessageProcessor(options);
      this.ownsProcessor = options.ownsProcessor ?? true;
    }

    this.surfaceIdsSignal = signal<readonly string[]>([]);
    this.surfacesSignal = signal<readonly SurfaceSignalStore[]>([]);

    // Attach to any surfaces already present on an injected processor.
    for (const surface of this.processor.surfaces.values()) {
      this.attachSurface(surface);
    }
    this.syncSurfaceSignals();

    this.unsubs.push(
      this.processor.onSurfaceCreated((surface) => {
        if (!this._disposed) {
          this.attachSurface(surface);
          this.syncSurfaceSignals();
        }
      }),
      this.processor.onSurfaceDeleted((surfaceId) => {
        if (!this._disposed) {
          const existing = this.storeMap.get(surfaceId);
          if (existing) {
            this.storeMap.delete(surfaceId);
            existing.dispose();
            this.syncSurfaceSignals();
          }
        }
      }),
    );
  }

  /** Reactive accessor listing active surface IDs in creation order. */
  get surfaceIds(): Accessor<readonly string[]> {
    return this.surfaceIdsSignal;
  }

  /** Reactive accessor listing active `SurfaceSignalStore` instances. */
  get surfaces(): Accessor<readonly SurfaceSignalStore[]> {
    return this.surfacesSignal;
  }

  /** Whether this store has been disposed. */
  get disposed(): boolean {
    return this._disposed;
  }

  /** Untracked lookup for a live `SurfaceSignalStore` by ID. */
  getSurface(surfaceId: string): SurfaceSignalStore | undefined {
    return untracked(() => this.storeMap.get(surfaceId));
  }

  /**
   * Owner-independent reactive signal returning the `SurfaceSignalStore` for
   * `surfaceId` (or `undefined`).
   */
  surfaceSignal(surfaceId: string): Accessor<SurfaceSignalStore | undefined> {
    let sig = this.surfaceLookupSignals.get(surfaceId);
    if (!sig) {
      sig = signal<SurfaceSignalStore | undefined>(this.storeMap.get(surfaceId));
      this.surfaceLookupSignals.set(surfaceId, sig);
    }
    return sig;
  }

  /** Processes one or more A2UI v1.0 messages inside a single `nsh` reactive `batch()`. */
  processMessages(input: unknown, options?: ProcessMessagesOptions): void {
    batch(() => {
      this.processor.processMessages(input, options);
    });
  }

  /** Disposes all attached surface stores and unsubscribes processor hooks. Idempotent. */
  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    for (let i = 0; i < this.unsubs.length; i += 1) {
      this.unsubs[i]!();
    }
    this.unsubs.length = 0;

    for (const store of this.storeMap.values()) {
      store.dispose();
    }
    this.storeMap.clear();
    this.syncSurfaceSignals();
    this.surfaceLookupSignals.clear();

    if (this.ownsProcessor) {
      this.processor.dispose();
    }
  }

  private attachSurface(surface: SurfaceModel): void {
    if (this.storeMap.has(surface.id)) {
      return;
    }
    const store = new SurfaceSignalStore({
      surface,
      processor: this.processor,
    });
    this.storeMap.set(surface.id, store);
  }

  private syncSurfaceSignals(): void {
    batch(() => {
      this.surfaceIdsSignal.set(Array.from(this.storeMap.keys()));
      this.surfacesSignal.set(Array.from(this.storeMap.values()));
      for (const [id, sig] of this.surfaceLookupSignals) {
        sig.set(this.storeMap.get(id));
      }
    });
  }
}
