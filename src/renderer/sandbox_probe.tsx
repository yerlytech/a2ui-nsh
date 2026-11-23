/**
 * Minimal sandboxed A2UI v1.0 renderer entry point under the repository root
 * `nsh.json` (`"capabilities": { "host": ["a2ui.*"] }`, zero `network`, `fs`,
 * `openUrl`, `process`, or `clipboard` capabilities).
 *
 * Used by capability-sandbox denial tests (`sandbox.test.tsx` and
 * `c6_sandbox.suite.ts`) to prove that:
 * 1. Normal A2UI rendering and `a2ui.action` dispatch succeed under minimal
 *    host-only capabilities.
 * 2. Unauthorized `fetch`, `fs/promises`, `openUrl`, and non-`a2ui.*` host
 *    calls fail closed with `ERR_ACCESS_DENIED`.
 */

import { readFile } from "fs/promises";
import { Scroll, host, mount, openUrl, type JSX } from "nsh";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
} from "../core/catalog";
import { A2uiStore } from "../store/surface_store";
import { createBasicCatalogRegistry } from "../catalog/basic";
import { A2uiSurface } from "./A2uiSurface";

export interface SandboxProbeResult {
  readonly probe: "fetch" | "fs" | "openUrl" | "host";
  readonly denied: boolean;
  readonly code?: string;
  readonly permission?: string;
  readonly message?: string;
}

function extractDeniedInfo(
  probe: SandboxProbeResult["probe"],
  err: unknown,
): SandboxProbeResult {
  const rec = err as { code?: unknown; permission?: unknown; message?: unknown } | null;
  const code = typeof rec?.code === "string" ? rec.code : undefined;
  const permission = typeof rec?.permission === "string" ? rec.permission : undefined;
  const message = err instanceof Error ? err.message : String(err);
  return {
    probe,
    denied: code === "ERR_ACCESS_DENIED",
    ...(code !== undefined ? { code } : {}),
    ...(permission !== undefined ? { permission } : {}),
    message,
  };
}

function SandboxProbeApp(): JSX.Element {
  const store = new A2uiStore({
    catalogs: [Catalog.fromJson(buildV10BasicCatalogDocument())],
    strictMode: true,
    onAction: (envelope) => {
      if (host.available()) {
        host.post("a2ui.action", envelope);
      }
    },
  });
  const registry = createBasicCatalogRegistry(BASIC_CATALOG_V1_ID);

  store.processMessages([
    {
      version: "1.0",
      createSurface: {
        surfaceId: "sandbox_surface",
        catalogId: BASIC_CATALOG_V1_ID,
        components: [
          {
            id: "root",
            component: "Column",
            children: ["status_text", "action_btn"],
          },
          {
            id: "status_text",
            component: "Text",
            text: "Sandboxed A2UI Renderer",
          },
          {
            id: "action_btn",
            component: "Button",
            child: "action_label",
            action: {
              event: {
                name: "ping",
                context: { safe: true },
              },
            },
          },
          {
            id: "action_label",
            component: "Text",
            text: "Send Safe Action",
          },
        ],
      },
    },
  ]);

  host.on("a2ui.probe", (payload) => {
    const req = (payload ?? {}) as { id?: number; probe?: SandboxProbeResult["probe"] };
    const id = typeof req.id === "number" ? req.id : 0;
    const probe = req.probe;
    if (!probe) {
      return;
    }

    void (async () => {
      let result: SandboxProbeResult;
      try {
        switch (probe) {
          case "fetch":
            await fetch("https://example.com/exfil");
            result = { probe, denied: false, message: "fetch unexpectedly succeeded" };
            break;
          case "fs":
            await readFile("/etc/hosts", "utf8");
            result = { probe, denied: false, message: "readFile unexpectedly succeeded" };
            break;
          case "openUrl":
            await openUrl("https://example.com");
            result = { probe, denied: false, message: "openUrl unexpectedly succeeded" };
            break;
          case "host":
            host.post("evil.exfiltrate", { secret: "blocked" });
            result = { probe, denied: false, message: "host.post unexpectedly succeeded" };
            break;
        }
      } catch (err) {
        result = extractDeniedInfo(probe, err);
      }
      if (host.available()) {
        host.post("a2ui.probeResult", { id, result });
      }
    })();
  });

  return (
    <Scroll class="flex-1 bg-background" contentClass="p-4">
      <Each of={store.surfaces()} key={(s) => s.surfaceId}>
        {(surface) => <A2uiSurface store={surface()} registry={registry} />}
      </Each>
    </Scroll>
  );
}

mount(SandboxProbeApp);
