/**
 * Test-only capability-sandbox verification entry point running under
 * `examples/erp-customers/nsh.json` (`"capabilities": { "host": ["a2ui.*"] }`).
 *
 * Mounts the real `ErpCustomersApp` alongside `a2ui.probe` handlers proving
 * unauthorized `fetch`, `fs/promises`, `openUrl`, and non-`a2ui.*` `host.post`
 * calls fail closed with `ERR_ACCESS_DENIED`.
 */

import { readFile } from "fs/promises";
import { host, mount, openUrl, type JSX } from "nsh";
import { ErpCustomersApp } from "./ErpCustomersApp";

export interface ErpSandboxProbeResult {
  readonly probe: "fetch" | "fs" | "openUrl" | "host";
  readonly denied: boolean;
  readonly code?: string;
  readonly permission?: string;
  readonly message?: string;
}

function toProbeResult(
  probe: ErpSandboxProbeResult["probe"],
  err: unknown,
): ErpSandboxProbeResult {
  const rec = err as { code?: unknown; permission?: unknown } | null;
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

function SandboxVerificationApp(): JSX.Element {
  host.on("a2ui.probe", (payload) => {
    const req = (payload ?? {}) as {
      id?: number;
      probe?: ErpSandboxProbeResult["probe"];
    };
    const id = typeof req.id === "number" ? req.id : 0;
    const probe = req.probe;
    if (!probe) {
      return;
    }

    void (async () => {
      let result: ErpSandboxProbeResult;
      try {
        switch (probe) {
          case "fetch":
            await fetch("https://example.com/erp-exfil");
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
            host.post("evil.exfiltrate", { leaked: true });
            result = { probe, denied: false, message: "host.post unexpectedly succeeded" };
            break;
        }
      } catch (err) {
        result = toProbeResult(probe, err);
      }
      if (host.available()) {
        host.post("a2ui.probeResult", { id, result });
      }
    })();
  });

  return <ErpCustomersApp />;
}

mount(SandboxVerificationApp);
