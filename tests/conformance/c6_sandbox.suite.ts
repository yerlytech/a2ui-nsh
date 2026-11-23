/**
 * Capability-sandbox denial conformance suite (`ERR_ACCESS_DENIED`).
 *
 * Opens `src/renderer/sandbox_probe.tsx` under the repository root `nsh.json`
 * (`"capabilities": { "host": ["a2ui.*"] }`) and verifies that normal A2UI v1.0
 * rendering and `a2ui.action` dispatch work while unauthorized `fetch`,
 * `fs/promises`, `openUrl`, and non-`a2ui.*` host calls all reject/throw with
 * `ERR_ACCESS_DENIED`.
 */

import { describe, expect, open, test } from "nsh/test";
import type { SandboxProbeResult } from "../../src/renderer/sandbox_probe";

const SANDBOX_APP = "../../src/renderer/sandbox_probe.tsx";

describe("C6 capability-sandbox denial tests (ERR_ACCESS_DENIED)", () => {
  test("enforces host-only a2ui.* capability boundary and denies fetch, fs, openUrl, and foreign host channels", async () => {
    const app = await open(SANDBOX_APP, {
      platform: "macos",
      host: {
        handlers: {
          "a2ui.action": null,
          "a2ui.probeResult": null,
        },
      },
    });

    expect(app.texts()).toContain("Sandboxed A2UI Renderer");
    await app.press("id:sandbox_surface:action_btn");
    const actionPost = app.host.posts().find((p) => p.name === "a2ui.action");
    expect(actionPost?.data).toMatchObject({
      version: "1.0",
      action: {
        name: "ping",
        surfaceId: "sandbox_surface",
        sourceComponentId: "action_btn",
        context: { safe: true },
      },
    });

    const probes: ReadonlyArray<{
      readonly id: number;
      readonly probe: SandboxProbeResult["probe"];
      readonly expectedPermission: string;
    }> = [
      { id: 1, probe: "fetch", expectedPermission: "network" },
      { id: 2, probe: "fs", expectedPermission: "fs" },
      { id: 3, probe: "openUrl", expectedPermission: "openUrl" },
      { id: 4, probe: "host", expectedPermission: "host" },
    ];

    for (const item of probes) {
      await app.host.send("a2ui.probe", { id: item.id, probe: item.probe });
      await app.waitUntil(() =>
        app.host.posts().some(
          (p) =>
            p.name === "a2ui.probeResult" &&
            (p.data as { id?: number } | null)?.id === item.id,
        ),
      );
      const reply = app.host.posts().find(
        (p) =>
          p.name === "a2ui.probeResult" &&
          (p.data as { id?: number } | null)?.id === item.id,
      );
      const result = (reply?.data as { result?: SandboxProbeResult } | null)?.result;
      expect(result).toBeDefined();
      expect(result!.denied).toBe(true);
      expect(result!.code).toBe("ERR_ACCESS_DENIED");
      expect(result!.permission).toBe(item.expectedPermission);
    }

    expect(app.requests()).toEqual([]);
    expect(app.openedUrls()).toEqual([]);
  });
});
