/**
 * Pure TypeScript A2UI v1.0 MessageProcessor managing surface lifecycles,
 * atomic component updates, out-of-order streaming buffers, data models,
 * renderer capabilities, `sendDataModel` reporting, and outbound
 * `renderer_to_agent` error emission.
 */

import {
  dispatchAction as dispatchSurfaceAction,
  type ActionDispatchResult,
  type ActionHandler,
  type ClockSeam,
} from "./actions";
import {
  A2uiCatalogError,
  A2uiIntegrityError,
  Catalog,
  CatalogRegistry,
  isV10ProtocolVersion,
  type ComponentMetadata,
} from "./catalog";
import { DataModel } from "./data_model";
import { A2uiValidationError } from "./expression";
import { FunctionRegistry, type UrlOpener } from "./functions";
import { isJsonObject, type JsonObject } from "./json_schema";
import {
  ReactiveCheckEvaluation,
  ReactiveEvaluation,
  RpcManager,
  type CallRendererFunctionPayload,
  type FunctionResponsePayload,
  type OutboundRpcHandler,
  type ReactiveEvaluationOptions,
  type RpcLimits,
  type TimerSeam,
} from "./rpc";
import {
  PERMISSIVE_VALIDATION,
  PayloadValidator,
  STRICT_VALIDATION,
  SurfaceTopologyIndex,
  componentSchemaDeclaresCustomBareProp,
  resolveValidationConfig,
  toRendererError,
  type RendererErrorEnvelope,
  type ValidatedComponent,
  type ValidationConfig,
} from "./validator";

/** Stored component state on a surface. */
export interface ComponentModel {
  readonly id: string;
  readonly type: string;
  readonly catalogId: string;
  readonly catalog: Catalog;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly metadata?: ComponentMetadata;
  readonly accessibility?: Readonly<Record<string, unknown>>;
  readonly checks?: readonly unknown[];
  readonly normalizedWire: Record<string, unknown>;
}

/** Describes one component entry changed during a batch update on a surface. */
export interface ComponentChange {
  readonly id: string;
  readonly previous?: ComponentModel;
  readonly next: ComponentModel;
}

/** Live surface state owned by `MessageProcessor`. */
export interface SurfaceModel {
  readonly id: string;
  readonly protocolVersion: string;
  readonly defaultCatalogId?: string;
  readonly sendDataModel: boolean;
  readonly metadata?: ComponentMetadata;
  readonly dataModel: DataModel;
  readonly components: Map<string, ComponentModel>;
  /** Components received before 'root' arrived (permissive streaming buffer). */
  readonly pendingComponents: Map<string, ComponentModel>;
  /** Incremental topology index for O(|batch|) validation. */
  readonly topologyIndex: SurfaceTopologyIndex;
  /** Whether this surface has been deleted/disposed. */
  readonly disposed: boolean;
  /** Total number of active reactive listeners held on this surface and its data model. */
  readonly activeSubscriptionCount: number;
  /** Inserts or replaces a batch of component definitions and notifies listeners once. */
  upsertComponents(components: readonly ComponentModel[]): void;
  /** Removes a component definition by ID and notifies listeners. */
  removeComponent(componentId: string): boolean;
  /** Subscribes to atomic component-batch commits on this surface. */
  onComponentsChanged(
    listener: (changes: readonly ComponentChange[]) => void,
  ): () => void;
  /** Subscribes to component removals on this surface. */
  onComponentRemoved(
    listener: (componentId: string, previous: ComponentModel) => void,
  ): () => void;
  /** Subscribes to surface-level runtime/resolution error envelopes. */
  onError(listener: (envelope: RendererErrorEnvelope) => void): () => void;
  /** Emits a typed v1.0 error envelope to surface and processor error listeners. */
  emitError(code: string, message: string, path?: string): void;
  /** Subscribes to surface disposal (`deleteSurface` or `processor.dispose()`). */
  onDisposed(listener: () => void): () => void;
  /** Disposes this surface, its `DataModel`, and notifies disposal listeners once. */
  dispose(): void;
}

class LiveSurfaceModel implements SurfaceModel {
  readonly id: string;
  readonly protocolVersion: string;
  readonly defaultCatalogId?: string;
  readonly sendDataModel: boolean;
  readonly metadata?: ComponentMetadata;
  readonly dataModel: DataModel;
  readonly components: Map<string, ComponentModel>;
  readonly pendingComponents: Map<string, ComponentModel>;
  readonly topologyIndex: SurfaceTopologyIndex;
  private readonly componentBatchListeners: Array<
    (changes: readonly ComponentChange[]) => void
  > = [];
  private readonly componentRemovedListeners: Array<
    (componentId: string, previous: ComponentModel) => void
  > = [];
  private readonly errorListeners: Array<
    (envelope: RendererErrorEnvelope) => void
  > = [];
  private readonly disposedListeners: Array<() => void> = [];
  private readonly onForwardError?: ErrorHandler;
  private _disposed = false;

  constructor(options: {
    readonly id: string;
    readonly protocolVersion: string;
    readonly defaultCatalogId?: string;
    readonly sendDataModel: boolean;
    readonly metadata?: ComponentMetadata;
    readonly dataModel: DataModel;
    readonly components: Map<string, ComponentModel>;
    readonly pendingComponents: Map<string, ComponentModel>;
    readonly topologyIndex: SurfaceTopologyIndex;
    readonly onForwardError?: ErrorHandler;
  }) {
    this.id = options.id;
    this.protocolVersion = options.protocolVersion;
    this.defaultCatalogId = options.defaultCatalogId;
    this.sendDataModel = options.sendDataModel;
    this.metadata = options.metadata;
    this.dataModel = options.dataModel;
    this.components = options.components;
    this.pendingComponents = options.pendingComponents;
    this.topologyIndex = options.topologyIndex;
    this.onForwardError = options.onForwardError;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  get activeSubscriptionCount(): number {
    return (
      this.componentBatchListeners.length +
      this.componentRemovedListeners.length +
      this.errorListeners.length +
      this.disposedListeners.length +
      this.dataModel.activeSubscriptionCount
    );
  }

  upsertComponents(models: readonly ComponentModel[]): void {
    if (this._disposed || models.length === 0) {
      return;
    }
    const changes: ComponentChange[] = [];
    for (let i = 0; i < models.length; i += 1) {
      const model = models[i]!;
      const previous = this.components.get(model.id);
      this.components.set(model.id, model);
      this.topologyIndex.applyComponent(
        model.id,
        model.normalizedWire,
        model.catalog,
        this.components,
      );
      if (!this.components.has("root")) {
        this.pendingComponents.set(model.id, model);
      }
      changes.push({ id: model.id, previous, next: model });
    }
    if (this.components.has("root") && this.pendingComponents.size > 0) {
      this.pendingComponents.clear();
    }
    if (this.componentBatchListeners.length > 0) {
      const snapshot = this.componentBatchListeners.slice();
      for (let i = 0; i < snapshot.length; i += 1) {
        snapshot[i]!(changes);
      }
    }
  }

  removeComponent(componentId: string): boolean {
    if (this._disposed) {
      return false;
    }
    const previous = this.components.get(componentId);
    if (!previous) {
      return false;
    }
    this.components.delete(componentId);
    this.pendingComponents.delete(componentId);
    this.topologyIndex.removeComponent(componentId);
    if (this.componentRemovedListeners.length > 0) {
      const snapshot = this.componentRemovedListeners.slice();
      for (let i = 0; i < snapshot.length; i += 1) {
        snapshot[i]!(componentId, previous);
      }
    }
    return true;
  }

  onComponentsChanged(
    listener: (changes: readonly ComponentChange[]) => void,
  ): () => void {
    this.componentBatchListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.componentBatchListeners.indexOf(listener);
      if (idx >= 0) {
        this.componentBatchListeners.splice(idx, 1);
      }
    };
  }

  onComponentRemoved(
    listener: (componentId: string, previous: ComponentModel) => void,
  ): () => void {
    this.componentRemovedListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.componentRemovedListeners.indexOf(listener);
      if (idx >= 0) {
        this.componentRemovedListeners.splice(idx, 1);
      }
    };
  }

  onError(listener: (envelope: RendererErrorEnvelope) => void): () => void {
    this.errorListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.errorListeners.indexOf(listener);
      if (idx >= 0) {
        this.errorListeners.splice(idx, 1);
      }
    };
  }

  emitError(code: string, message: string, path?: string): void {
    const errorPayload =
      path !== undefined
        ? {
            code: code as "VALIDATION_FAILED" | "UNALLOWED_PARENT" | "UNALLOWED_CHILD",
            surfaceId: this.id,
            path,
            message,
          }
        : {
            code,
            surfaceId: this.id,
            message,
          };
    const envelope: RendererErrorEnvelope = {
      version: "1.0",
      error: errorPayload,
    };
    if (this.errorListeners.length > 0) {
      const snapshot = this.errorListeners.slice();
      for (let i = 0; i < snapshot.length; i += 1) {
        snapshot[i]!(envelope);
      }
    }
    if (this.onForwardError) {
      this.onForwardError(envelope, new Error(message));
    }
  }

  onDisposed(listener: () => void): () => void {
    this.disposedListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.disposedListeners.indexOf(listener);
      if (idx >= 0) {
        this.disposedListeners.splice(idx, 1);
      }
    };
  }

  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    const listeners = this.disposedListeners.slice();
    this.disposedListeners.length = 0;
    for (let i = 0; i < listeners.length; i += 1) {
      listeners[i]!();
    }
    this.componentBatchListeners.length = 0;
    this.componentRemovedListeners.length = 0;
    this.errorListeners.length = 0;
    this.dataModel.dispose();
    this.topologyIndex.clear();
  }
}

export type ErrorHandler = (
  envelope: RendererErrorEnvelope,
  error: Error,
) => void;

export interface MessageProcessorOptions {
  readonly registry?: CatalogRegistry;
  readonly catalogs?: readonly Catalog[];
  /** Local function implementations (defaults to Basic Catalog v1 + `@index`). */
  readonly functionRegistry?: FunctionRegistry;
  /** Shortcut for strict vs permissive preset when `validationConfig` is omitted. Default: true. */
  readonly strictMode?: boolean;
  readonly validationConfig?: Partial<ValidationConfig>;
  /**
   * When true, skips per-component JSON Schema and topology validation during
   * `processMessages` (used for unvalidated streaming / `validation_config: none`).
   */
  readonly skipValidation?: boolean;
  /** Callback invoked with the v1.0 `renderer_to_agent` error envelope before throwing or on runtime errors. */
  readonly onError?: ErrorHandler;
  /** Outbound transport handler for `callAgentFunction` and `rendererFunctionResponse`. */
  readonly onOutbound?: OutboundRpcHandler;
  /** Outbound transport handler for dispatched v1.0 `action` envelopes. */
  readonly onAction?: ActionHandler;
  /** Injected ISO 8601 UTC timestamp seam for outbound actions. */
  readonly nowIso?: ClockSeam;
  /** Injected URL opener seam for `openUrl`. */
  readonly openUrl?: UrlOpener;
  /** Active BCP 47 locale tag for formatting functions. */
  readonly locale?: string;
  /** Optional RPC timeout / pending-call safety limit overrides. */
  readonly rpcLimits?: Partial<RpcLimits>;
  /** Optional timer seam for deterministic RPC timeout tests. */
  readonly timers?: TimerSeam;
  /** Optional deterministic ID generator for outbound `callAgentFunction` messages. */
  readonly generateCallId?: () => string;
  /** User activation state applied to inbound `callRendererFunction` invocations. */
  readonly callRendererUserActivation?: boolean;
}

export interface DispatchSurfaceActionOptions {
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly actionPayload: unknown;
  readonly scope?: string;
  readonly collectionIndices?: readonly number[];
  readonly metadata?: unknown;
  readonly userActivation?: boolean;
  readonly locale?: string;
}

export interface ProcessMessagesOptions {
  /** Per-call validation override; any omitted rule defaults to strict. */
  readonly validationConfig?: Partial<ValidationConfig>;
  /** Skip component schema/topology validation for this call. */
  readonly skipValidation?: boolean;
}

export interface RendererCapabilitiesOptions {
  readonly includeInlineCatalogs?: boolean;
  readonly version?: string;
}

export interface RendererDataModelPayload {
  readonly version: string;
  readonly surfaces: Record<string, unknown>;
}

function toComponentModel(v: ValidatedComponent): ComponentModel {
  return {
    id: v.id,
    type: v.type,
    catalogId: v.catalogId,
    catalog: v.catalog,
    properties: v.properties,
    metadata: v.metadata,
    accessibility: v.accessibility,
    checks: v.checks,
    normalizedWire: v.normalizedWire,
  };
}

function buildInlineCatalogSnapshot(catalog: Catalog): JsonObject {
  const doc = catalog.toJson();
  const out: JsonObject = {
    catalogId: catalog.catalogId,
    protocolVersion: catalog.protocolVersion,
  };
  if (isJsonObject(doc["components"]) && Object.keys(doc["components"]).length > 0) {
    out["components"] = doc["components"];
  }
  if (isJsonObject(doc["functions"]) && Object.keys(doc["functions"]).length > 0) {
    out["functions"] = doc["functions"];
  }
  const compNames = Array.from(catalog.components.keys());
  const fnNames = Array.from(catalog.functions.keys());
  out["$defs"] = {
    anyComponent:
      compNames.length > 0
        ? {
            oneOf: compNames.map((name) => ({ $ref: `#/components/${name}` })),
            discriminator: { propertyName: "component" },
          }
        : { not: {} },
    anyFunction:
      fnNames.length > 0
        ? {
            oneOf: fnNames.map((name) => ({ $ref: `#/functions/${name}` })),
          }
        : { not: {} },
  };
  return out;
}

/**
 * Stateful A2UI v1.0 message processor managing surfaces, catalogs, validation,
 * out-of-order streaming buffers, data models, and error emission.
 */
export class MessageProcessor {
  readonly registry: CatalogRegistry;
  readonly functionRegistry: FunctionRegistry;
  readonly rpc: RpcManager;
  private readonly validator: PayloadValidator;
  private readonly defaultConfig: ValidationConfig;
  private readonly defaultSkipValidation: boolean;
  private readonly onError?: ErrorHandler;
  private readonly onAction?: ActionHandler;
  private readonly nowIso?: ClockSeam;
  private readonly openUrl?: UrlOpener;
  private readonly locale?: string;
  private readonly callRendererUserActivation: boolean;
  private readonly surfaceMap = new Map<string, SurfaceModel>();
  private readonly surfaceCreatedListeners: Array<
    (surface: SurfaceModel) => void
  > = [];
  private readonly surfaceDeletedListeners: Array<
    (surfaceId: string, surface: SurfaceModel) => void
  > = [];
  /** Number of `addCatalog` calls so far. */
  private catalogGeneration = 0;
  /** Catalog ID added by `addCatalog` -> the generation it arrived in. */
  private readonly addedCatalogGenerations = new Map<string, number>();
  /** Surface -> the generation it was created in; its catalog set is fixed then. */
  private readonly surfaceCatalogGenerations = new WeakMap<SurfaceModel, number>();

  constructor(options: MessageProcessorOptions = {}) {
    this.registry = options.registry ?? new CatalogRegistry();
    if (options.catalogs) {
      for (const catalog of options.catalogs) {
        this.registry.register(catalog);
      }
    }
    this.functionRegistry =
      options.functionRegistry ?? FunctionRegistry.withBasicV1();
    this.validator = new PayloadValidator(this.registry);

    if (options.validationConfig) {
      this.defaultConfig = resolveValidationConfig(options.validationConfig);
    } else if (options.strictMode === false) {
      this.defaultConfig = PERMISSIVE_VALIDATION;
    } else {
      this.defaultConfig = STRICT_VALIDATION;
    }
    this.defaultSkipValidation = options.skipValidation === true;

    this.onError = options.onError;
    this.onAction = options.onAction;
    this.nowIso = options.nowIso;
    this.openUrl = options.openUrl;
    this.locale = options.locale;
    this.callRendererUserActivation =
      options.callRendererUserActivation ?? false;

    this.rpc = new RpcManager({
      catalogRegistry: this.registry,
      functionRegistry: this.functionRegistry,
      getSurface: (id) => this.surfaceMap.get(id),
      onOutbound: options.onOutbound,
      onError: this.onError
        ? (envelope) => {
            this.onError!(envelope, new Error(envelope.error.message));
          }
        : undefined,
      openUrl: this.openUrl,
      locale: this.locale,
      limits: options.rpcLimits,
      timers: options.timers,
      generateCallId: options.generateCallId,
    });
  }

  /**
   * Adds a catalog to the ones this processor holds (google/A2UI #3304).
   *
   * `createSurface` messages, renderer function calls and
   * `getRendererCapabilities` see the catalog from this call on. Surfaces
   * created before the call keep the catalogs they were created with.
   *
   * @throws {A2uiCatalogError} If the processor already holds a catalog with
   *     the same ID.
   */
  addCatalog(catalog: Catalog): void {
    if (this.registry.has(catalog.catalogId)) {
      throw new A2uiCatalogError(
        "CATALOG_ERROR",
        `Catalog already registered: ${catalog.catalogId}`,
      );
    }
    this.catalogGeneration += 1;
    this.addedCatalogGenerations.set(catalog.catalogId, this.catalogGeneration);
    this.registry.register(catalog);
  }

  /** Looks up catalogs as `surface` sees them: none added after it was created. */
  private catalogLookupFor(
    surface: SurfaceModel,
  ): (catalogId: string) => Catalog | undefined {
    const created =
      this.surfaceCatalogGenerations.get(surface) ?? this.catalogGeneration;
    return (catalogId) => {
      const catalog = this.registry.get(catalogId);
      if (!catalog) {
        return undefined;
      }
      const added = this.addedCatalogGenerations.get(catalog.catalogId);
      return added !== undefined && added > created ? undefined : catalog;
    };
  }

  private registerSurface(surface: SurfaceModel): void {
    this.surfaceCatalogGenerations.set(surface, this.catalogGeneration);
    this.surfaceMap.set(surface.id, surface);
  }

  /** Read-only view of all live surfaces. */
  get surfaces(): ReadonlyMap<string, SurfaceModel> {
    return this.surfaceMap;
  }

  getSurface(surfaceId: string): SurfaceModel | undefined {
    return this.surfaceMap.get(surfaceId);
  }

  /** Subscribes to surface creation events. */
  onSurfaceCreated(listener: (surface: SurfaceModel) => void): () => void {
    this.surfaceCreatedListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.surfaceCreatedListeners.indexOf(listener);
      if (idx >= 0) {
        this.surfaceCreatedListeners.splice(idx, 1);
      }
    };
  }

  /** Subscribes to surface deletion events. */
  onSurfaceDeleted(
    listener: (surfaceId: string, surface: SurfaceModel) => void,
  ): () => void {
    this.surfaceDeletedListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.surfaceDeletedListeners.indexOf(listener);
      if (idx >= 0) {
        this.surfaceDeletedListeners.splice(idx, 1);
      }
    };
  }

  /**
   * Programmatically creates and registers a `SurfaceModel` (for model-level
   * initialization and tests) and notifies `onSurfaceCreated` listeners.
   */
  createSurfaceModel(options: {
    readonly id: string;
    readonly defaultCatalogId?: string;
    readonly data?: unknown;
    readonly metadata?: ComponentMetadata;
    readonly sendDataModel?: boolean;
  }): SurfaceModel {
    if (this.surfaceMap.has(options.id)) {
      throw new A2uiIntegrityError(
        "INTEGRITY_ERROR",
        `Surface '${options.id}' already exists`,
        options.id,
      );
    }
    const surface = new LiveSurfaceModel({
      id: options.id,
      protocolVersion: "1.0",
      defaultCatalogId: options.defaultCatalogId,
      sendDataModel: options.sendDataModel === true,
      metadata: options.metadata,
      dataModel: new DataModel(options.data ?? {}),
      components: new Map(),
      pendingComponents: new Map(),
      topologyIndex: new SurfaceTopologyIndex(),
      onForwardError: this.onError,
    });
    this.registerSurface(surface);
    this.notifySurfaceCreated(surface);
    return surface;
  }

  private notifySurfaceCreated(surface: SurfaceModel): void {
    if (this.surfaceCreatedListeners.length === 0) {
      return;
    }
    const snapshot = this.surfaceCreatedListeners.slice();
    for (let i = 0; i < snapshot.length; i += 1) {
      snapshot[i]!(surface);
    }
  }

  private notifySurfaceDeleted(surfaceId: string, surface: SurfaceModel): void {
    if (this.surfaceDeletedListeners.length === 0) {
      return;
    }
    const snapshot = this.surfaceDeletedListeners.slice();
    for (let i = 0; i < snapshot.length; i += 1) {
      snapshot[i]!(surfaceId, surface);
    }
  }

  /**
   * Processes one or more A2UI v1.0 messages (accepts a message array, a
   * `{ messages: [...] }` wrapper object, or a single message object).
   */
  processMessages(
    input: unknown,
    options?: ProcessMessagesOptions,
  ): void {
    const config = options?.validationConfig
      ? resolveValidationConfig(options.validationConfig)
      : this.defaultConfig;
    const skipValidation =
      options?.skipValidation ?? this.defaultSkipValidation;

    let messages: readonly unknown[];
    if (Array.isArray(input)) {
      messages = input;
    } else if (isJsonObject(input) && Array.isArray(input["messages"])) {
      messages = input["messages"];
    } else if (isJsonObject(input)) {
      messages = [input];
    } else {
      const err = new A2uiValidationError(
        "VALIDATION_FAILED",
        "Message payload must be an array, wrapper object, or message object",
        "/",
      );
      this.emitAndThrow(err);
    }

    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      const fallbackSurfaceId = this.peekSurfaceId(msg);
      try {
        this.processSingleMessage(msg, i, config, skipValidation);
      } catch (err) {
        this.emitAndThrow(err, fallbackSurfaceId);
      }
    }
  }

  private peekSurfaceId(msg: unknown): string | undefined {
    if (!isJsonObject(msg)) {
      return undefined;
    }
    for (const key of [
      "createSurface",
      "updateComponents",
      "updateDataModel",
      "deleteSurface",
    ] as const) {
      const body = msg[key];
      if (isJsonObject(body) && typeof body["surfaceId"] === "string") {
        return body["surfaceId"];
      }
    }
    return undefined;
  }

  private emitAndThrow(err: unknown, fallbackSurfaceId?: string): never {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    if (this.onError) {
      const envelope = toRendererError(errorObj, fallbackSurfaceId);
      this.onError(envelope, errorObj);
    }
    throw errorObj;
  }

  private processSingleMessage(
    msg: unknown,
    index: number,
    config: ValidationConfig,
    skipValidation: boolean,
  ): void {
    const action = this.validator.validateMessageEnvelope(msg, index, config);
    const record = msg as JsonObject;

    switch (action) {
      case "createSurface":
        this.handleCreateSurface(
          record["createSurface"] as JsonObject,
          config,
          skipValidation,
        );
        break;
      case "updateComponents":
        this.handleUpdateComponents(
          record["updateComponents"] as JsonObject,
          config,
          skipValidation,
        );
        break;
      case "updateDataModel":
        this.handleUpdateDataModel(record["updateDataModel"] as JsonObject);
        break;
      case "deleteSurface":
        this.handleDeleteSurface(record["deleteSurface"] as JsonObject);
        break;
      case "callRendererFunction":
        void this.rpc.handleCallRendererFunction(
          record["callRendererFunction"] as unknown as CallRendererFunctionPayload,
          { userActivation: this.callRendererUserActivation },
        );
        break;
      case "agentFunctionResponse":
        this.rpc.handleAgentFunctionResponse(
          record["agentFunctionResponse"] as unknown as FunctionResponsePayload,
        );
        break;
    }
  }

  private parseUnvalidatedComponents(
    rawList: readonly unknown[],
    surfaceId: string,
    defaultCatalogId: string | undefined,
    lookupCatalog: (catalogId: string) => Catalog | undefined = (id) =>
      this.registry.get(id),
  ): ComponentModel[] {
    const models: ComponentModel[] = [];
    for (let i = 0; i < rawList.length; i += 1) {
      const raw = rawList[i];
      if (!isJsonObject(raw)) {
        continue;
      }
      const id = raw["id"];
      const type = raw["component"];
      if (typeof id !== "string" || typeof type !== "string") {
        continue;
      }
      const defaultCatalog = defaultCatalogId
        ? lookupCatalog(defaultCatalogId)
        : undefined;
      const defaultCompSchema = defaultCatalog?.components.get(type)?.schema;
      const defaultDeclaresCustomCatalogId = componentSchemaDeclaresCustomBareProp(
        defaultCompSchema,
        "catalogId",
      );

      let explicitCatId: string | undefined;
      let stripBareCatalogId = false;
      if (typeof raw["@catalogId"] === "string" && raw["@catalogId"].length > 0) {
        explicitCatId = raw["@catalogId"];
      } else if (
        !defaultDeclaresCustomCatalogId &&
        typeof raw["catalogId"] === "string" &&
        raw["catalogId"].length > 0
      ) {
        explicitCatId = raw["catalogId"];
        stripBareCatalogId = true;
      }

      const catId = explicitCatId ?? defaultCatalogId;
      if (!catId) {
        throw new A2uiCatalogError(
          "CATALOG_NOT_FOUND",
          `Surface '${surfaceId}' has no default catalogId and component '${id}' specifies no '@catalogId'`,
          surfaceId,
        );
      }
      const catalog = lookupCatalog(catId);
      if (!catalog) {
        throw new A2uiCatalogError(
          "CATALOG_NOT_FOUND",
          `Catalog '${catId}' not found for surface '${surfaceId}'`,
          surfaceId,
        );
      }

      const compRawSchema = catalog.components.get(type)?.schema;
      const declaresCustomMeta = componentSchemaDeclaresCustomBareProp(
        compRawSchema,
        "metadata",
      );
      const declaresCustomA11y = componentSchemaDeclaresCustomBareProp(
        compRawSchema,
        "accessibility",
      );
      const declaresCustomChecks = componentSchemaDeclaresCustomBareProp(
        compRawSchema,
        "checks",
      );

      const useBareMeta =
        raw["@metadata"] === undefined &&
        !declaresCustomMeta &&
        raw["metadata"] !== undefined;
      const useBareA11y =
        raw["@accessibility"] === undefined &&
        !declaresCustomA11y &&
        raw["accessibility"] !== undefined;
      const useBareChecks =
        raw["@checks"] === undefined &&
        !declaresCustomChecks &&
        raw["checks"] !== undefined;

      const properties: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (
          k === "id" ||
          k === "component" ||
          k === "@catalogId" ||
          (k === "catalogId" && stripBareCatalogId) ||
          k === "@metadata" ||
          (k === "metadata" && useBareMeta) ||
          k === "@accessibility" ||
          (k === "accessibility" && useBareA11y) ||
          k === "@checks" ||
          (k === "checks" && useBareChecks)
        ) {
          continue;
        }
        properties[k] = v;
      }
      const rawMeta = raw["@metadata"] ?? (useBareMeta ? raw["metadata"] : undefined);
      const metadata: ComponentMetadata | undefined = isJsonObject(rawMeta)
        ? {
            extensions: isJsonObject(rawMeta["extensions"])
              ? { ...rawMeta["extensions"] }
              : undefined,
          }
        : undefined;
      const rawA11y =
        raw["@accessibility"] ?? (useBareA11y ? raw["accessibility"] : undefined);
      const accessibility = isJsonObject(rawA11y) ? { ...rawA11y } : undefined;
      const rawChecks = raw["@checks"] ?? (useBareChecks ? raw["checks"] : undefined);
      const checks = Array.isArray(rawChecks)
        ? (rawChecks as readonly unknown[])
        : undefined;
      models.push({
        id,
        type,
        catalogId: catalog.catalogId,
        catalog,
        properties,
        metadata,
        accessibility,
        checks,
        normalizedWire: raw as Record<string, unknown>,
      });
    }
    return models;
  }

  private handleCreateSurface(
    body: JsonObject,
    config: ValidationConfig,
    skipValidation: boolean,
  ): void {
    const surfaceId = body["surfaceId"] as string;
    if (this.surfaceMap.has(surfaceId)) {
      throw new A2uiIntegrityError(
        "INTEGRITY_ERROR",
        `Surface '${surfaceId}' already exists`,
        surfaceId,
      );
    }

    const defaultCatalogId =
      typeof body["catalogId"] === "string" ? body["catalogId"] : undefined;
    if (defaultCatalogId !== undefined) {
      const catalog = this.registry.get(defaultCatalogId);
      if (!catalog) {
        throw new A2uiCatalogError(
          "CATALOG_NOT_FOUND",
          `Catalog '${defaultCatalogId}' is not registered`,
          surfaceId,
        );
      }
      if (!isV10ProtocolVersion(catalog.protocolVersion)) {
        throw new A2uiCatalogError(
          "CATALOG_NOT_FOUND",
          `Catalog '${defaultCatalogId}' (version ${catalog.protocolVersion}) is incompatible with protocol version 1.0`,
          surfaceId,
        );
      }
    }

    const rawMeta = body["metadata"] as JsonObject | undefined;
    const metadata: ComponentMetadata | undefined = rawMeta
      ? {
          extensions: isJsonObject(rawMeta["extensions"])
            ? { ...rawMeta["extensions"] }
            : undefined,
        }
      : undefined;

    const initialData = isJsonObject(body["dataModel"]) ? body["dataModel"] : {};
    const dataModel = new DataModel(initialData);
    const components = new Map<string, ComponentModel>();
    const pendingComponents = new Map<string, ComponentModel>();
    const topologyIndex = new SurfaceTopologyIndex();

    // Validate inline components atomically BEFORE registering the surface.
    let initialModels: ComponentModel[] = [];
    if (Array.isArray(body["components"])) {
      if (skipValidation) {
        initialModels = this.parseUnvalidatedComponents(
          body["components"],
          surfaceId,
          defaultCatalogId,
        );
      } else {
        const validated = this.validator.validateComponentsBatch(
          body["components"],
          {
            surfaceId,
            defaultCatalogId,
            existingComponents: new Map(),
            topologyIndex,
            config,
          },
        );
        initialModels = validated.map(toComponentModel);
      }
    }

    const surface = new LiveSurfaceModel({
      id: surfaceId,
      protocolVersion: "1.0",
      defaultCatalogId,
      sendDataModel: body["sendDataModel"] === true,
      metadata,
      dataModel,
      components,
      pendingComponents,
      topologyIndex,
      onForwardError: this.onError,
    });
    if (initialModels.length > 0) {
      surface.upsertComponents(initialModels);
    }

    this.registerSurface(surface);
    this.notifySurfaceCreated(surface);
  }

  private handleUpdateComponents(
    body: JsonObject,
    config: ValidationConfig,
    skipValidation: boolean,
  ): void {
    const surfaceId = body["surfaceId"] as string;
    const surface = this.surfaceMap.get(surfaceId);
    if (!surface) {
      throw new A2uiIntegrityError(
        "INTEGRITY_ERROR",
        `Cannot update components: surface '${surfaceId}' does not exist`,
        surfaceId,
      );
    }

    const lookupCatalog = this.catalogLookupFor(surface);
    if (skipValidation) {
      const models = this.parseUnvalidatedComponents(
        body["components"] as readonly unknown[],
        surfaceId,
        surface.defaultCatalogId,
        lookupCatalog,
      );
      surface.upsertComponents(models);
      return;
    }

    const validated = this.validator.validateComponentsBatch(
      body["components"] as readonly unknown[],
      {
        surfaceId,
        defaultCatalogId: surface.defaultCatalogId,
        existingComponents: surface.components,
        topologyIndex: surface.topologyIndex,
        config,
        lookupCatalog,
      },
    );

    // Commit only after full pre-flight validation succeeded (atomic rollback).
    surface.upsertComponents(validated.map(toComponentModel));
  }

  private handleUpdateDataModel(body: JsonObject): void {
    const surfaceId = body["surfaceId"] as string;
    const surface = this.surfaceMap.get(surfaceId);
    if (!surface) {
      throw new A2uiIntegrityError(
        "INTEGRITY_ERROR",
        `Cannot update data model: surface '${surfaceId}' does not exist`,
        surfaceId,
      );
    }

    const path = typeof body["path"] === "string" ? body["path"] : "/";
    const value = body["value"];
    if (value === null) {
      surface.dataModel.delete(path);
    } else {
      surface.dataModel.set(path, value);
    }
  }

  private handleDeleteSurface(body: JsonObject): void {
    const surfaceId = body["surfaceId"] as string;
    const surface = this.surfaceMap.get(surfaceId);
    this.surfaceMap.delete(surfaceId);
    if (surface) {
      surface.dispose();
      this.notifySurfaceDeleted(surfaceId, surface);
    }
    this.rpc.cancelSurfaceCalls(surfaceId, { clearCache: true });
  }

  /**
   * Dispatches a component `Action` (`event` or `functionCall`) on `surfaceId`,
   * evaluating context/`userMessage` at dispatch time and routing unimplemented
   * functions to the agent via `callAgentFunction`.
   */
  dispatchAction(
    options: DispatchSurfaceActionOptions,
  ): Promise<ActionDispatchResult> {
    const surface = this.surfaceMap.get(options.surfaceId);
    if (!surface) {
      return Promise.reject(
        new A2uiIntegrityError(
          "INTEGRITY_ERROR",
          `Cannot dispatch action: surface '${options.surfaceId}' does not exist`,
          options.surfaceId,
        ),
      );
    }
    return dispatchSurfaceAction({
      rpc: this.rpc,
      surfaceId: surface.id,
      surfaceDefaultCatalogId: surface.defaultCatalogId,
      sourceComponentId: options.sourceComponentId,
      dataModel: surface.dataModel,
      actionPayload: options.actionPayload,
      scope: options.scope,
      collectionIndices: options.collectionIndices,
      metadata: options.metadata,
      userActivation: options.userActivation,
      locale: options.locale ?? this.locale,
      openUrl: this.openUrl,
      nowIso: this.nowIso,
      onAction: this.onAction,
      isSurfaceAlive: () => this.surfaceMap.get(surface.id) === surface,
    });
  }

  /** Creates a reactive dynamic-value binding on `surfaceId` with agent fallback routing. */
  evaluateBinding(
    surfaceId: string,
    expression: unknown,
    options?: ReactiveEvaluationOptions,
  ): ReactiveEvaluation {
    if (!this.surfaceMap.has(surfaceId)) {
      throw new A2uiIntegrityError(
        "INTEGRITY_ERROR",
        `Cannot evaluate binding: surface '${surfaceId}' does not exist`,
        surfaceId,
      );
    }
    return new ReactiveEvaluation(this.rpc, surfaceId, expression, options);
  }

  /** Creates a reactive check-rule evaluation on `surfaceId` with agent fallback routing. */
  evaluateCheckRule(
    surfaceId: string,
    condition: unknown,
    ruleMessage?: string,
    options?: Omit<ReactiveEvaluationOptions, "onChange"> & {
      readonly onChange?: (
        passed: boolean,
        result: import("./functions").NormalizedValidationResult,
      ) => void;
    },
  ): ReactiveCheckEvaluation {
    if (!this.surfaceMap.has(surfaceId)) {
      throw new A2uiIntegrityError(
        "INTEGRITY_ERROR",
        `Cannot evaluate check rule: surface '${surfaceId}' does not exist`,
        surfaceId,
      );
    }
    return new ReactiveCheckEvaluation(
      this.rpc,
      surfaceId,
      condition,
      ruleMessage,
      options,
    );
  }

  /** Cancels pending agent function calls for `surfaceId` while keeping the surface live. */
  cancelSurfaceCalls(surfaceId: string): number {
    return this.rpc.cancelSurfaceCalls(surfaceId, { clearCache: false });
  }

  /** Disposes all surfaces and pending RPC state owned by this processor. */
  dispose(): void {
    for (const surface of this.surfaceMap.values()) {
      surface.dispose();
    }
    this.surfaceMap.clear();
    this.surfaceCreatedListeners.length = 0;
    this.surfaceDeletedListeners.length = 0;
    this.rpc.dispose();
  }

  /**
   * Generates the A2UI v1.0 renderer capabilities advertisement object
   * (`supportedCatalogIds` and optional `inlineCatalogs`).
   */
  getRendererCapabilities(
    options: RendererCapabilitiesOptions = {},
  ): Record<string, unknown> {
    const version = options.version ?? "1.0";
    const matching = this.registry
      .list()
      .filter((c) => c.protocolVersion === version);
    const entry: Record<string, unknown> = {
      supportedCatalogIds: matching.map((c) => c.catalogId),
    };
    if (options.includeInlineCatalogs === true) {
      entry["inlineCatalogs"] = matching.map((c) =>
        buildInlineCatalogSnapshot(c),
      );
    }
    return { [version]: entry };
  }

  /**
   * Returns the renderer data model snapshot for all surfaces opting into
   * `sendDataModel: true` matching `version`, or `null` if none match.
   */
  getRendererDataModel(version = "1.0"): RendererDataModelPayload | null {
    const surfaces: Record<string, unknown> = {};
    let count = 0;
    for (const [id, surface] of this.surfaceMap) {
      if (surface.sendDataModel && surface.protocolVersion === version) {
        surfaces[id] = surface.dataModel.get("/");
        count += 1;
      }
    }
    if (count === 0) {
      return null;
    }
    return { version, surfaces };
  }
}
