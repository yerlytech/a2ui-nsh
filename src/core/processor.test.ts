import { describe, expect, test } from "nsh/test";
import {
  A2uiIntegrityError,
  A2uiRecursionError,
  BASIC_CATALOG_V1_ID,
  CatalogRegistry,
} from "./catalog";
import { MessageProcessor } from "./processor";
import type { RendererErrorEnvelope } from "./validator";

describe("MessageProcessor — lifecycle, streaming & error emission", () => {
  test("creates surface inline, updates data model including null deletion, and reports sendDataModel", () => {
    const processor = new MessageProcessor({
      registry: CatalogRegistry.withBasicV1(),
      strictMode: true,
    });

    processor.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: "erp",
          catalogId: BASIC_CATALOG_V1_ID,
          sendDataModel: true,
          dataModel: { customer: { name: "Acme", temp: "drop" } },
          components: [
            { id: "root", component: "Column", children: ["t1"] },
            { id: "t1", component: "Text", text: { "@path": "/customer/name" } },
          ],
        },
      },
      {
        version: "1.0",
        updateDataModel: {
          surfaceId: "erp",
          path: "/customer/temp",
          value: null,
        },
      },
    ]);

    const surface = processor.getSurface("erp");
    expect(surface).toBeDefined();
    expect(surface!.components.size).toBe(2);
    expect(surface!.dataModel.get("/")).toEqual({
      customer: { name: "Acme" },
    });
    expect(processor.getRendererDataModel("1.0")).toEqual({
      version: "1.0",
      surfaces: { erp: { customer: { name: "Acme" } } },
    });
    expect(processor.getRendererDataModel("v0.9")).toBeNull();
  });

  test("rolls back atomically on cycle and emits renderer_to_agent error envelope", () => {
    const errors: RendererErrorEnvelope[] = [];
    const processor = new MessageProcessor({
      registry: CatalogRegistry.withBasicV1(),
      strictMode: true,
      onError: (env) => errors.push(env),
    });

    processor.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: "s1",
          catalogId: BASIC_CATALOG_V1_ID,
          components: [
            { id: "root", component: "Column", children: ["c1"] },
            { id: "c1", component: "Text", text: "Safe" },
          ],
        },
      },
    ]);

    expect(() =>
      processor.processMessages([
        {
          version: "1.0",
          updateComponents: {
            surfaceId: "s1",
            components: [
              { id: "c1", component: "Column", children: ["c2"] },
              { id: "c2", component: "Column", children: ["c1"] },
            ],
          },
        },
      ]),
    ).toThrow(A2uiRecursionError);

    // Existing valid tree remained untouched.
    expect(processor.getSurface("s1")!.components.get("c1")?.type).toBe("Text");
    expect(processor.getSurface("s1")!.components.has("c2")).toBe(false);
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("RECURSION_LIMIT_EXCEEDED");
  });

  test("buffers out-of-order streaming components before root in permissive mode", () => {
    const processor = new MessageProcessor({
      registry: CatalogRegistry.withBasicV1(),
      strictMode: false,
    });

    processor.processMessages([
      {
        version: "1.0",
        createSurface: { surfaceId: "stream", catalogId: BASIC_CATALOG_V1_ID },
      },
      {
        version: "1.0",
        updateComponents: {
          surfaceId: "stream",
          components: [{ id: "leaf", component: "Text", text: "Hi" }],
        },
      },
    ]);

    const surface = processor.getSurface("stream")!;
    expect(surface.pendingComponents.has("leaf")).toBe(true);

    processor.processMessages([
      {
        version: "1.0",
        updateComponents: {
          surfaceId: "stream",
          components: [
            { id: "root", component: "Column", children: ["leaf"] },
          ],
        },
      },
    ]);

    expect(surface.pendingComponents.size).toBe(0);
    expect(surface.components.has("root")).toBe(true);
    expect(surface.components.has("leaf")).toBe(true);
  });

  test("rejects duplicate createSurface and updates after deleteSurface", () => {
    const processor = new MessageProcessor({
      registry: CatalogRegistry.withBasicV1(),
      strictMode: true,
    });

    processor.processMessages([
      { version: "1.0", createSurface: { surfaceId: "s1" } },
    ]);
    expect(() =>
      processor.processMessages([
        { version: "1.0", createSurface: { surfaceId: "s1" } },
      ]),
    ).toThrow(A2uiIntegrityError);

    processor.processMessages([
      { version: "1.0", deleteSurface: { surfaceId: "s1" } },
      { version: "1.0", deleteSurface: { surfaceId: "never_existed" } },
    ]);
    expect(processor.getSurface("s1")).toBeUndefined();

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
