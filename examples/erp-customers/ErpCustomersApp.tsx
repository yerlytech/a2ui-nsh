/**
 * Thin Native Shell (`nsh 0.7.1`) TSX host shell for the ERP Customers demo.
 *
 * All visible UI comes purely from A2UI v1.0 JSON envelopes (`a2ui/surface.json`
 * + `ErpCustomerAgent` updates) rendered by `A2uiStore` and `<A2uiSurface>`.
 */

import {
  Scroll,
  cleanup,
  effect,
  host,
  windowSize,
  type JSX,
} from "nsh";
import {
  A2uiStore,
  A2uiSurface,
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
  createBasicCatalogRegistry,
} from "../../src/index";
import {
  ERP_SURFACE_ID,
  ErpCustomerAgent,
  type InitialScreenState,
  type LayoutMode,
} from "./agent";

const DESKTOP_BREAKPOINT_PX = 768;
const DEFAULT_RELOAD_DELAY_MS = 600;

function safeHostPost(name: string, data: unknown): void {
  if (!host.available()) {
    return;
  }
  try {
    host.post(name, data);
  } catch {
    // Ignore when an embedding host does not subscribe to optional telemetry events.
  }
}

function parseInitialState(raw: unknown): InitialScreenState {
  if (raw === "loading" || raw === "error") {
    return raw;
  }
  return "ready";
}

function computeLayoutMode(width: number): LayoutMode {
  return width >= DESKTOP_BREAKPOINT_PX ? "desktop" : "compact";
}

export function ErpCustomersApp(): JSX.Element {
  const params = host.params ?? {};
  const initialState = parseInitialState(params["initialState"]);
  const manualLoading = params["manualLoading"] === true;
  const reloadDelayMs =
    typeof params["reloadDelayMs"] === "number" && params["reloadDelayMs"] >= 0
      ? params["reloadDelayMs"]
      : DEFAULT_RELOAD_DELAY_MS;

  const initialWidth = windowSize().width;
  const agent = new ErpCustomerAgent({
    initialState,
    initialLayoutMode: computeLayoutMode(initialWidth > 0 ? initialWidth : 1280),
  });

  let reloadTimer: ReturnType<typeof setTimeout> | undefined;

  const clearReloadTimer = (): void => {
    if (reloadTimer !== undefined) {
      clearTimeout(reloadTimer);
      reloadTimer = undefined;
    }
  };

  const registry = createBasicCatalogRegistry(BASIC_CATALOG_V1_ID);

  const store = new A2uiStore({
    catalogs: [Catalog.fromJson(buildV10BasicCatalogDocument())],
    strictMode: true,
    onAction: (envelope) => {
      safeHostPost("a2ui.action", envelope);
      const responses = agent.handleAction(envelope);
      if (responses.length > 0) {
        store.processMessages(responses);
      }

      if (envelope.action.name === "reload_customers" && !manualLoading) {
        clearReloadTimer();
        reloadTimer = setTimeout(() => {
          reloadTimer = undefined;
          const finishMsgs = agent.completeLoading();
          if (finishMsgs.length > 0) {
            store.processMessages(finishMsgs);
          }
        }, reloadDelayMs);
      }
    },
    onError: (envelope) => {
      safeHostPost("a2ui.error", envelope);
    },
  });

  store.processMessages(agent.buildInitialMessages());

  // Reactive live search bridge: forwards `/search/query` two-way edits to the
  // agent as a standard A2UI v1.0 `search_customers` action envelope.
  const initialSurface = store.getSurface(ERP_SURFACE_ID);
  const searchSub = initialSurface?.surface.dataModel.subscribe(
    "/search/query",
    (nextValue) => {
      const nextQuery = typeof nextValue === "string" ? nextValue : "";
      if (nextQuery !== agent.searchQuery) {
        const msgs = agent.handleAction({
          version: "1.0",
          action: {
            name: "search_customers",
            surfaceId: ERP_SURFACE_ID,
            sourceComponentId: "search_input",
            timestamp: new Date().toISOString(),
            context: { query: nextQuery },
          },
        });
        if (msgs.length > 0) {
          store.processMessages(msgs);
        }
      }
    },
  );

  // Responsive master-detail layout adaptation: switches `workspace_split`
  // between `Row` (desktop >= 768 px) and `Column` (compact < 768 px) via A2UI JSON.
  effect(() => {
    const width = windowSize().width;
    if (width <= 0) {
      return;
    }
    const nextMode = computeLayoutMode(width);
    const layoutMsgs = agent.setLayoutMode(nextMode);
    if (layoutMsgs.length > 0) {
      store.processMessages(layoutMsgs);
    }
  });

  // Optional host control messages for embedding hosts and headless tests.
  host.on("a2ui.message", (payload) => {
    store.processMessages(payload);
  });

  host.on("a2ui.scenario", (payload) => {
    const req = (payload ?? {}) as { kind?: string; failNextSave?: boolean };
    if (req.kind === "loading") {
      clearReloadTimer();
      store.processMessages(agent.enterLoadingState());
    } else if (req.kind === "completeLoading") {
      clearReloadTimer();
      store.processMessages(agent.completeLoading());
    } else if (req.kind === "serverError") {
      clearReloadTimer();
      store.processMessages(agent.triggerSimulatedError(req.failNextSave === true));
    }
  });

  host.on("a2ui.readData", (payload) => {
    const req = (payload ?? {}) as { path?: string };
    const path = typeof req.path === "string" ? req.path : "/";
    const surface = store.getSurface(ERP_SURFACE_ID);
    safeHostPost("a2ui.data", {
      surfaceId: ERP_SURFACE_ID,
      path,
      value: surface ? surface.surface.dataModel.get(path) : undefined,
    });
  });

  cleanup(() => {
    clearReloadTimer();
    searchSub?.unsubscribe();
    store.dispose();
  });

  return (
    <Scroll class="flex-1 bg-background" contentClass="p-4">
      <Each of={store.surfaces()} key={(s) => s.surfaceId}>
        {(surface) => <A2uiSurface store={surface()} registry={registry} />}
      </Each>
    </Scroll>
  );
}
