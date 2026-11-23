/**
 * Headless `nsh test` harness for the xlarge catalog renderers.
 *
 * `host.params`:
 * - `catalog`: xlarge's A2UI 1.0 catalog definition (`tech.yerly.xlarge/v1`);
 * - `messages`: the A2UI messages to process at startup;
 * - `translations`: optional i18n code → words map (missing codes show as-is);
 * - `strictMode`: optional, validates every message strictly;
 * - `toastMs`: optional, how long a `Toast` shows (the renderer option);
 * - `terminal`: optional, draws as a terminal host would (the renderer option);
 * - `fileBase`: optional, an `Image`'s attachment id is drawn from
 *   `fileBase + encodeURIComponent(id)` (the `fileUrl` renderer option);
 * - `openLinks`: optional, a `QrCode`'s "open in app" button posts
 *   `a2ui.openUrl` (the `openUrl` renderer option);
 * - `againstBeforeLabel`: optional, the words after a `Metric`'s change.
 *
 * What a renderer announces (`announce`) is posted as `a2ui.announce`.
 *
 * Reports outbound actions and errors via `host.post("a2ui.*", ...)`, and
 * answers `a2ui.readData` with the surface data at a path.
 */

import { Scroll, host, mount, type JSX } from "nsh";
import { Catalog, buildV10BasicCatalogDocument } from "../../core/catalog";
import { FunctionRegistry } from "../../core/functions";
import { A2uiStore } from "../../store/surface_store";
import { A2uiSurface } from "../../renderer/A2uiSurface";
import { createBasicCatalogRegistry } from "../basic";
import { registerXlargeCatalogComponents } from "./index";

function safePost(name: string, data: unknown): void {
  if (!host.available()) {
    return;
  }
  try {
    host.post(name, data);
  } catch {
    // The host may not list this channel.
  }
}

function XlargeHarnessApp(): JSX.Element {
  const params = host.params ?? {};
  const translations =
    typeof params["translations"] === "object" && params["translations"] !== null
      ? (params["translations"] as Record<string, string>)
      : {};

  const catalogs: Catalog[] = [Catalog.fromJson(buildV10BasicCatalogDocument())];
  if (params["catalog"] !== undefined) {
    catalogs.push(Catalog.fromJson(params["catalog"]));
  }

  const registry = createBasicCatalogRegistry();
  registerXlargeCatalogComponents(registry, {
    translate: (code) => translations[code] ?? code,
    toastMs: typeof params["toastMs"] === "number" ? params["toastMs"] : undefined,
    terminal: typeof params["terminal"] === "boolean" ? params["terminal"] : undefined,
    fileUrl:
      typeof params["fileBase"] === "string"
        ? (id) => `${params["fileBase"] as string}${encodeURIComponent(id)}`
        : undefined,
    openUrl: params["openLinks"] === true ? (url) => safePost("a2ui.openUrl", { url }) : undefined,
    againstBeforeLabel:
      typeof params["againstBeforeLabel"] === "string" ? params["againstBeforeLabel"] : undefined,
    announce: (message) => safePost("a2ui.announce", { message }),
  });

  const store = new A2uiStore({
    catalogs,
    functionRegistry: FunctionRegistry.withBasicV1(),
    strictMode: params["strictMode"] === true,
    nowIso: () => "2026-11-23T00:00:00.000Z",
    onAction: (envelope) => safePost("a2ui.action", envelope),
    onError: (envelope) => safePost("a2ui.error", envelope),
  });

  const handle = (payload: unknown): void => {
    try {
      store.processMessages(payload);
    } catch (err) {
      safePost("a2ui.exception", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (params["messages"] !== undefined) {
    handle(params["messages"]);
  }
  host.on("a2ui.message", handle);
  host.on("a2ui.readData", (payload) => {
    const req = (payload ?? {}) as { surfaceId?: string; path?: string };
    const surface = req.surfaceId ? store.getSurface(req.surfaceId) : store.surfaces()[0];
    const path = typeof req.path === "string" ? req.path : "/";
    safePost("a2ui.data", {
      path,
      value: surface ? surface.surface.dataModel.get(path) : undefined,
    });
  });

  return (
    <Scroll class="flex-1 bg-background" contentClass="p-4">
      <Each of={store.surfaces()} key={(s) => s.surfaceId}>
        {(surface) => <A2uiSurface store={surface()} registry={registry} />}
      </Each>
    </Scroll>
  );
}

mount(XlargeHarnessApp);
