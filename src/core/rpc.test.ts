import { describe, expect, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID, Catalog, CatalogRegistry } from "./catalog";
import { FunctionRegistry } from "./functions";
import { MessageProcessor } from "./processor";
import {
  A2uiRpcError,
  applySchemaDefaults,
  canonicalCallKey,
  canonicalJson,
  hasNonJsonNumber,
  type OutboundRpcMessage,
  type RendererFunctionResponseEnvelope,
  type TimerSeam,
} from "./rpc";
import type { RendererErrorEnvelope } from "./validator";

class FakeClock implements TimerSeam {
  private now = 0;
  private nextId = 1;
  private readonly timers = new Map<
    number,
    { readonly fireAt: number; readonly cb: () => void }
  >();

  setTimeout(callback: () => void, ms: number): unknown {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { fireAt: this.now + ms, cb: callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === "number") {
      this.timers.delete(handle);
    }
  }

  advance(ms: number): void {
    this.now += ms;
    const due = Array.from(this.timers.entries())
      .filter(([, entry]) => entry.fireAt <= this.now)
      .sort((a, b) => a[1].fireAt - b[1].fireAt);
    for (const [id, entry] of due) {
      if (this.timers.delete(id)) {
        entry.cb();
      }
    }
  }
}

describe("rpc — callRendererFunction, callAgentFunction, routing, caching & limits", () => {
  test("canonicalizes object key order and detects non-JSON numbers", () => {
    expect(canonicalJson({ b: 2, a: { y: 1, x: 0 } })).toBe(
      canonicalJson({ a: { x: 0, y: 1 }, b: 2 }),
    );
    expect(
      canonicalCallKey("cat", "fn", { quote: "USD", base: "EUR" }),
    ).toBe(canonicalCallKey("cat", "fn", { base: "EUR", quote: "USD" }));

    expect(hasNonJsonNumber({ ok: 1, nested: [true, "s", null] })).toBe(false);
    expect(hasNonJsonNumber({ amount: Number.NaN })).toBe(true);
    expect(hasNonJsonNumber({ list: [1, Number.POSITIVE_INFINITY] })).toBe(true);
    expect(hasNonJsonNumber({ v: Number.NEGATIVE_INFINITY })).toBe(true);
  });

  test("applies nested JSON Schema defaults without mutating input", () => {
    const schema = {
      type: "object",
      properties: {
        symbol: { type: "string" },
        currency: { type: "string", default: "USD" },
        options: {
          type: "object",
          properties: {
            extended: { type: "boolean", default: false },
          },
        },
      },
    };
    const input = { symbol: "ACME", options: {} };
    const result = applySchemaDefaults(input, schema, {});
    expect(result).toEqual({
      symbol: "ACME",
      currency: "USD",
      options: { extended: false },
    });
    expect(input).toEqual({ symbol: "ACME", options: {} });
  });

  test("enforces deterministic timeout, maxPendingCalls, and ignores late responses", async () => {
    const clock = new FakeClock();
    const outbound: OutboundRpcMessage[] = [];
    const processor = new MessageProcessor({
      registry: CatalogRegistry.withBasicV1(),
      strictMode: false,
      timers: clock,
      rpcLimits: { defaultTimeoutMs: 100, maxPendingCalls: 2 },
      onOutbound: (msg) => outbound.push(msg),
    });

    const p1 = processor.rpc.callAgentFunction({
      surfaceId: "s1",
      functionCallId: "c1",
      callFunction: { "@call": "op", catalogId: BASIC_CATALOG_V1_ID, args: {} },
    });
    const p2 = processor.rpc.callAgentFunction({
      surfaceId: "s1",
      functionCallId: "c2",
      callFunction: { "@call": "op", catalogId: BASIC_CATALOG_V1_ID, args: {} },
    });

    // 3rd concurrent call exceeds maxPendingCalls (2).
    let capErr: unknown;
    try {
      await processor.rpc.callAgentFunction({
        surfaceId: "s1",
        functionCallId: "c3",
        callFunction: { "@call": "op", catalogId: BASIC_CATALOG_V1_ID, args: {} },
      });
    } catch (err) {
      capErr = err;
    }
    expect(capErr instanceof A2uiRpcError).toBe(true);
    expect((capErr as A2uiRpcError).code).toBe("MAX_PENDING_EXCEEDED");

    // Advance fake clock past timeout.
    let err1: unknown;
    let err2: unknown;
    const wait1 = p1.catch((e) => {
      err1 = e;
    });
    const wait2 = p2.catch((e) => {
      err2 = e;
    });
    clock.advance(100);
    await wait1;
    await wait2;

    expect((err1 as A2uiRpcError).code).toBe("TIMEOUT");
    expect((err2 as A2uiRpcError).code).toBe("TIMEOUT");
    expect(processor.rpc.pendingCount).toBe(0);

    // Late response after timeout is silently ignored.
    expect(
      processor.rpc.handleAgentFunctionResponse({
        functionCallId: "c1",
        value: "late",
      }),
    ).toBe(false);
  });

  test("resolves nested agent function call inside callRendererFunction arguments", async () => {
    const registry = CatalogRegistry.withBasicV1();
    registry.register(
      Catalog.fromJson({
        catalogId: "device_cat",
        protocolVersion: "1.0",
      }),
    );

    const fnRegistry = FunctionRegistry.withBasicV1();
    fnRegistry.register("device_cat", {
      name: "renderBanner",
      returnType: "object",
      allowedCallers: "rendererOrAgent",
      requiresUserActivation: false,
      execute: (args) => ({
        rendered: true,
        banner: args["banner"],
      }),
    });

    const outbound: OutboundRpcMessage[] = [];
    const processor = new MessageProcessor({
      registry,
      functionRegistry: fnRegistry,
      strictMode: false,
      onOutbound: (msg) => outbound.push(msg),
    });

    processor.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: "main",
          catalogId: "device_cat",
        },
      },
    ]);

    // Agent calls renderer function `renderBanner`, whose `banner` argument itself
    // invokes an unimplemented agent function `loadBannerText`.
    const responsePromise = processor.rpc.handleCallRendererFunction({
      functionCallId: "rf-1",
      surfaceId: "main",
      callFunction: {
        "@call": "renderBanner",
        catalogId: "device_cat",
        args: {
          banner: {
            "@call": "loadBannerText",
            catalogId: "device_cat",
            args: { tier: "gold" },
          },
        },
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    // Renderer emitted callAgentFunction for `loadBannerText`.
    expect(outbound.length).toBe(1);
    const agentCall = outbound[0]!;
    expect("callAgentFunction" in agentCall).toBe(true);
    if (!("callAgentFunction" in agentCall)) return;
    expect(agentCall.callAgentFunction.callFunction).toEqual({
      "@call": "loadBannerText",
      catalogId: "device_cat",
      args: { tier: "gold" },
    });

    // Agent answers `loadBannerText`.
    processor.processMessages([
      {
        version: "1.0",
        agentFunctionResponse: {
          functionCallId: agentCall.callAgentFunction.functionCallId,
          value: "Welcome Gold Member",
        },
      },
    ]);

    const finalResponse = await responsePromise;
    expect(finalResponse).toEqual({
      version: "1.0",
      rendererFunctionResponse: {
        functionCallId: "rf-1",
        value: {
          rendered: true,
          banner: "Welcome Gold Member",
        },
      },
    });
    expect(outbound.length).toBe(2);
    expect((outbound[1] as RendererFunctionResponseEnvelope).rendererFunctionResponse.value).toEqual({
      rendered: true,
      banner: "Welcome Gold Member",
    });
  });

  test("cancels in-flight calls and clears reactive cache on deleteSurface", async () => {
    const registry = new CatalogRegistry();
    registry.register(
      Catalog.fromJson({ catalogId: "fx_cat", protocolVersion: "1.0" }),
    );

    const outbound: OutboundRpcMessage[] = [];
    const errors: RendererErrorEnvelope[] = [];
    const processor = new MessageProcessor({
      registry,
      functionRegistry: new FunctionRegistry(),
      strictMode: false,
      onOutbound: (msg) => outbound.push(msg),
      onError: (env) => errors.push(env),
    });

    processor.processMessages([
      {
        version: "1.0",
        createSurface: { surfaceId: "s1", catalogId: "fx_cat" },
      },
    ]);

    // Populate cache with a settled binding.
    const b1 = processor.evaluateBinding("s1", {
      "@call": "fx",
      args: { base: "EUR" },
    });
    expect(outbound.length).toBe(1);
    const call0 = outbound[0]!;
    if (!("callAgentFunction" in call0)) return;
    processor.processMessages([
      {
        version: "1.0",
        agentFunctionResponse: {
          functionCallId: call0.callAgentFunction.functionCallId,
          value: 1.1,
        },
      },
    ]);
    await Promise.resolve();
    await Promise.resolve();
    expect(b1.value).toBe(1.1);

    // Start a second in-flight call on s1, then delete s1.
    const b2 = processor.evaluateBinding("s1", {
      "@call": "fx",
      args: { base: "GBP" },
    });
    expect(outbound.length).toBe(2);
    expect(processor.rpc.pendingCount).toBe(1);

    processor.processMessages([
      { version: "1.0", deleteSurface: { surfaceId: "s1" } },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(processor.rpc.pendingCount).toBe(0);
    expect(errors.length).toBe(0);

    // Re-creating s1 has an empty cache (EUR call sends fresh outbound request).
    processor.processMessages([
      {
        version: "1.0",
        createSurface: { surfaceId: "s1", catalogId: "fx_cat" },
      },
    ]);
    const b3 = processor.evaluateBinding("s1", {
      "@call": "fx",
      args: { base: "EUR" },
    });
    expect(outbound.length).toBe(3);
    b1.dispose();
    b2.dispose();
    b3.dispose();
    processor.dispose();
  });
});
