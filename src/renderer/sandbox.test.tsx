import { describe, expect, open, test } from "nsh/test";
import type { SandboxProbeResult } from "./sandbox_probe";

const SANDBOX_APP = "./sandbox_probe.tsx";

describe("Capability sandbox enforcement (nsh.json host-only capabilities)", () => {
  test("renders A2UI surface and dispatches a2ui.* actions while rejecting fetch, fs, openUrl, and unauthorized host calls with ERR_ACCESS_DENIED", async () => {
    const app = await open(SANDBOX_APP, {
      platform: "macos",
      host: {
        handlers: {
          "a2ui.action": null,
          "a2ui.probeResult": null,
        },
      },
    });

    // 1. Authorized A2UI surface rendering and a2ui.* action dispatch succeed.
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

    // 2. Unauthorized capability probes must all fail closed with ERR_ACCESS_DENIED.
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

    // No external network requests or URLs were opened.
    expect(app.requests()).toEqual([]);
    expect(app.openedUrls()).toEqual([]);
  });
});
