import { describe, expect, test } from "nsh/test";
import {
  A2uiIntegrityError,
  BASIC_CATALOG_V1_ID,
  CatalogRegistry,
} from "./catalog";
import {
  MessageProcessor,
  type ComponentChange,
  type ComponentModel,
  type MessageProcessorOptions,
  type SurfaceModel,
} from "./processor";
import { A2uiRpcError } from "./rpc";
import type { RendererErrorEnvelope } from "./validator";

function basicProcessor(
  options: Partial<MessageProcessorOptions> = {},
): MessageProcessor {
  return new MessageProcessor({
    registry: CatalogRegistry.withBasicV1(),
    strictMode: true,
    ...options,
  });
}

function createSurfaceMessage(
  surfaceId: string,
  extra: Record<string, unknown> = {},
): unknown {
  return {
    version: "1.0",
    createSurface: { surfaceId, ...extra },
  };
}

function createAndGetSurface(
  processor: MessageProcessor,
  surfaceId: string,
  extra: Record<string, unknown> = {},
): SurfaceModel {
  processor.processMessages([createSurfaceMessage(surfaceId, extra)]);
  return processor.getSurface(surfaceId)!;
}

describe("SurfaceModel — component mutations", () => {
  test("upsertComponents replaces a component by id, keeps one entry, and reports previous and next", () => {
    const processor = basicProcessor();
    const surface = createAndGetSurface(processor, "s1", {
      catalogId: BASIC_CATALOG_V1_ID,
      components: [
        { id: "root", component: "Column", children: ["t1"] },
        { id: "t1", component: "Text", text: "First" },
      ],
    });
    const previous = surface.components.get("t1")!;
    const changes: (readonly ComponentChange[])[] = [];
    surface.onComponentsChanged((batch) => changes.push(batch));

    const replacement: ComponentModel = {
      ...previous,
      properties: { ...previous.properties, text: "Second" },
    };
    surface.upsertComponents([replacement]);

    expect(surface.components.size).toBe(2);
    expect(surface.components.get("t1")).toBe(replacement);
    expect(changes.length).toBe(1);
    expect(changes[0]!.length).toBe(1);
    expect(changes[0]![0]!.id).toBe("t1");
    expect(changes[0]![0]!.previous).toBe(previous);
    expect(changes[0]![0]!.next).toBe(replacement);
  });

  test("removeComponent returns false for a missing id and does not notify", () => {
    const processor = basicProcessor();
    const surface = createAndGetSurface(processor, "s1");
    const removed: string[] = [];
    surface.onComponentRemoved((componentId) => removed.push(componentId));

    expect(surface.removeComponent("missing")).toBe(false);
    expect(removed).toEqual([]);
  });

  test("removeComponent returns true for a present id, removes it, and reports the previous model", () => {
    const processor = basicProcessor();
    const surface = createAndGetSurface(processor, "s1", {
      catalogId: BASIC_CATALOG_V1_ID,
      components: [
        { id: "root", component: "Column", children: ["t1"] },
        { id: "t1", component: "Text", text: "Gone" },
      ],
    });
    const previous = surface.components.get("t1")!;
    const removed: Array<{ readonly id: string; readonly previous: ComponentModel }> = [];
    surface.onComponentRemoved((componentId, model) =>
      removed.push({ id: componentId, previous: model }),
    );

    expect(surface.removeComponent("t1")).toBe(true);
    expect(surface.components.has("t1")).toBe(false);
    expect(removed.length).toBe(1);
    expect(removed[0]!.id).toBe("t1");
    expect(removed[0]!.previous).toBe(previous);
  });
});

describe("SurfaceModel — error listeners", () => {
  test("onError delivers the envelope with code, message and path", () => {
    const processor = basicProcessor();
    const surface = createAndGetSurface(processor, "s1");
    const seen: RendererErrorEnvelope[] = [];
    surface.onError((envelope) => seen.push(envelope));

    surface.emitError("VALIDATION_FAILED", "bad value", "/customer/name");

    expect(seen.length).toBe(1);
    expect(seen[0]).toEqual({
      version: "1.0",
      error: {
        code: "VALIDATION_FAILED",
        surfaceId: "s1",
        path: "/customer/name",
        message: "bad value",
      },
    });
  });

  test("the onError unsubscribe function stops later deliveries", () => {
    const processor = basicProcessor();
    const surface = createAndGetSurface(processor, "s1");
    const seen: RendererErrorEnvelope[] = [];
    const unsubscribe = surface.onError((envelope) => seen.push(envelope));

    unsubscribe();
    surface.emitError("VALIDATION_FAILED", "ignored", "/x");

    expect(seen).toEqual([]);
  });

  test("emitError without listeners does not throw", () => {
    const processor = basicProcessor();
    const surface = createAndGetSurface(processor, "s1");

    expect(() =>
      surface.emitError("VALIDATION_FAILED", "unheard", "/x"),
    ).not.toThrow();
  });
});

describe("SurfaceModel — disposal", () => {
  test("onDisposed fires once and a second dispose does not fire it again", () => {
    const processor = basicProcessor();
    const surface = createAndGetSurface(processor, "s1");
    let disposedCount = 0;
    surface.onDisposed(() => {
      disposedCount += 1;
    });

    surface.dispose();
    surface.dispose();

    expect(surface.disposed).toBe(true);
    expect(disposedCount).toBe(1);
  });
});

describe("MessageProcessor — surface lifecycle", () => {
  test("onSurfaceCreated fires once per createSurface with the new surface", () => {
    const processor = basicProcessor();
    const created: SurfaceModel[] = [];
    processor.onSurfaceCreated((surface) => created.push(surface));

    processor.processMessages([
      createSurfaceMessage("s1"),
      createSurfaceMessage("s2"),
    ]);

    expect(created.map((surface) => surface.id)).toEqual(["s1", "s2"]);
    expect(created[0]).toBe(processor.getSurface("s1"));
    expect(created[1]).toBe(processor.getSurface("s2"));
  });

  test("the onSurfaceCreated unsubscribe function stops later notifications", () => {
    const processor = basicProcessor();
    const created: SurfaceModel[] = [];
    const unsubscribe = processor.onSurfaceCreated((surface) =>
      created.push(surface),
    );

    unsubscribe();
    processor.processMessages([createSurfaceMessage("s1")]);

    expect(created).toEqual([]);
  });

  test("getSurface is undefined for an unknown id and after deleteSurface", () => {
    const processor = basicProcessor();
    expect(processor.getSurface("unknown")).toBeUndefined();

    processor.processMessages([
      createSurfaceMessage("s1"),
      { version: "1.0", deleteSurface: { surfaceId: "s1" } },
    ]);

    expect(processor.getSurface("s1")).toBeUndefined();
  });

  test("deleteSurface disposes the surface and notifies surface listeners in order", () => {
    const processor = basicProcessor();
    const surface = createAndGetSurface(processor, "s1");
    const order: string[] = [];
    const deleted: Array<{ readonly id: string; readonly surface: SurfaceModel }> = [];
    surface.onDisposed(() => order.push("disposed"));
    processor.onSurfaceDeleted((surfaceId, deletedSurface) => {
      order.push("deleted");
      deleted.push({ id: surfaceId, surface: deletedSurface });
    });

    processor.processMessages([
      { version: "1.0", deleteSurface: { surfaceId: "s1" } },
    ]);

    expect(surface.disposed).toBe(true);
    expect(order).toEqual(["disposed", "deleted"]);
    expect(deleted.length).toBe(1);
    expect(deleted[0]!.id).toBe("s1");
    expect(deleted[0]!.surface).toBe(surface);
  });

  test("deleteSurface for an unknown id is a no-op", () => {
    const processor = basicProcessor();
    const deleted: string[] = [];
    processor.onSurfaceDeleted((surfaceId) => deleted.push(surfaceId));

    expect(() =>
      processor.processMessages([
        { version: "1.0", deleteSurface: { surfaceId: "never_existed" } },
      ]),
    ).not.toThrow();

    expect(deleted).toEqual([]);
    expect(processor.getSurface("never_existed")).toBeUndefined();
  });
});

describe("MessageProcessor — disposal", () => {
  test("dispose disposes every surface and clears the surface map", () => {
    const processor = basicProcessor();
    const first = createAndGetSurface(processor, "s1");
    const second = createAndGetSurface(processor, "s2");

    processor.dispose();

    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
    expect(processor.surfaces.size).toBe(0);
    expect(processor.getSurface("s1")).toBeUndefined();
    expect(processor.getSurface("s2")).toBeUndefined();
  });

  test("processing after dispose rejects an update to the disposed surface", () => {
    const processor = basicProcessor();
    createAndGetSurface(processor, "s1");
    processor.dispose();

    expect(() =>
      processor.processMessages([
        {
          version: "1.0",
          updateDataModel: { surfaceId: "s1", path: "/a", value: 1 },
        },
      ]),
    ).toThrow(A2uiIntegrityError);
  });
});

describe("MessageProcessor — data model and pending calls", () => {
  test("updateDataModel for an unknown surface rejects with INTEGRITY_ERROR and the surface id", () => {
    const errors: RendererErrorEnvelope[] = [];
    const processor = basicProcessor({ onError: (envelope) => errors.push(envelope) });

    expect(() =>
      processor.processMessages([
        {
          version: "1.0",
          updateDataModel: { surfaceId: "ghost", path: "/a", value: 1 },
        },
      ]),
    ).toThrow(A2uiIntegrityError);

    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INTEGRITY_ERROR");
    expect("surfaceId" in errors[0]!.error ? errors[0]!.error.surfaceId : undefined).toBe("ghost");
  });

  test("cancelSurfaceCalls returns 0 when no calls are pending", () => {
    const processor = basicProcessor();
    createAndGetSurface(processor, "s1");

    expect(processor.cancelSurfaceCalls("s1")).toBe(0);
  });

  test("cancelSurfaceCalls cancels every pending call for the surface and settles them as CANCELLED", async () => {
    const outbound: unknown[] = [];
    const processor = basicProcessor({
      onOutbound: (message) => outbound.push(message),
    });
    createAndGetSurface(processor, "s1");

    const first = processor.rpc.callAgentFunction({
      surfaceId: "s1",
      functionCallId: "call-1",
      callFunction: { "@call": "lookup", catalogId: BASIC_CATALOG_V1_ID, args: {} },
    });
    const second = processor.rpc.callAgentFunction({
      surfaceId: "s1",
      functionCallId: "call-2",
      callFunction: { "@call": "lookup", catalogId: BASIC_CATALOG_V1_ID, args: {} },
    });
    expect(processor.rpc.pendingCount).toBe(2);

    expect(processor.cancelSurfaceCalls("s1")).toBe(2);
    expect(processor.rpc.pendingCount).toBe(0);

    const settled = await Promise.all([
      first.catch((error: unknown) => error),
      second.catch((error: unknown) => error),
    ]);
    expect(settled[0] instanceof A2uiRpcError).toBe(true);
    expect(settled[1] instanceof A2uiRpcError).toBe(true);
    expect((settled[0] as A2uiRpcError).code).toBe("CANCELLED");
    expect((settled[1] as A2uiRpcError).code).toBe("CANCELLED");
    expect(outbound.length).toBe(2);
  });

  test("getRendererDataModel is null when no surface opts in", () => {
    const processor = basicProcessor();
    createAndGetSurface(processor, "s1", {
      dataModel: { customer: { name: "Acme" } },
    });
    createAndGetSurface(processor, "s2", {
      sendDataModel: false,
      dataModel: { customer: { name: "Beta" } },
    });

    expect(processor.getRendererDataModel("1.0")).toBeNull();
  });

  test("getRendererDataModel returns the opted-in surface payload and version", () => {
    const processor = basicProcessor();
    createAndGetSurface(processor, "s1", {
      sendDataModel: true,
      dataModel: { customer: { name: "Acme" } },
    });

    expect(processor.getRendererDataModel("1.0")).toEqual({
      version: "1.0",
      surfaces: { s1: { customer: { name: "Acme" } } },
    });
    expect(processor.getRendererDataModel()).toEqual({
      version: "1.0",
      surfaces: { s1: { customer: { name: "Acme" } } },
    });
  });

  test("getRendererDataModel returns null for an unknown version argument", () => {
    const processor = basicProcessor();
    createAndGetSurface(processor, "s1", {
      sendDataModel: true,
      dataModel: { customer: { name: "Acme" } },
    });

    expect(processor.getRendererDataModel("v0.9")).toBeNull();
  });
});
