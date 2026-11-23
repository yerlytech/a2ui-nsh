import { describe, expect, test } from "nsh/test";
import {
  deriveCollectionIndicesFromScope,
  validateActionMetadata,
  type DispatchedActionEnvelope,
} from "./actions";
import { BASIC_CATALOG_V1_ID, Catalog, CatalogRegistry } from "./catalog";
import { DataModel } from "./data_model";
import { A2uiValidationError } from "./expression";
import { FunctionRegistry } from "./functions";
import { MessageProcessor } from "./processor";
import type { OutboundRpcMessage } from "./rpc";
import type { RendererErrorEnvelope } from "./validator";

describe("actions — dispatch-time evaluation, metadata & local/agent calls", () => {
  test("evaluates context and userMessage at dispatch time using latest DataModel state", async () => {
    const registry = CatalogRegistry.withBasicV1();
    const dispatched: DispatchedActionEnvelope[] = [];
    const processor = new MessageProcessor({
      registry,
      strictMode: false,
      nowIso: () => "2026-11-21T00:00:00.000Z",
      onAction: (env) => dispatched.push(env),
    });

    processor.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: "orders",
          catalogId: BASIC_CATALOG_V1_ID,
          dataModel: {
            customer: "Ada",
            items: [{ sku: "SKU-1", qty: 2 }],
          },
        },
      },
    ]);

    const actionPayload = {
      event: {
        name: "save_line",
        userMessage: {
          "@call": "formatString",
          args: { value: "Saved ${sku} x${qty} for ${/customer}" },
        },
        context: {
          sku: { "@path": "sku" },
          qty: { "@path": "qty" },
          rowIndex: { "@call": "@index" },
          rowNumber: { "@call": "@index", args: { offset: 1 } },
          escaped: { "@@path": "/literal" },
        },
      },
    };

    // Mutate DataModel AFTER defining the payload and BEFORE dispatching.
    processor.processMessages([
      {
        version: "1.0",
        updateDataModel: {
          surfaceId: "orders",
          path: "/items/0/qty",
          value: 5,
        },
      },
    ]);

    const result = await processor.dispatchAction({
      surfaceId: "orders",
      sourceComponentId: "save_btn",
      scope: "/items/0",
      actionPayload,
    });

    expect(result.kind).toBe("event");
    expect(dispatched.length).toBe(1);
    expect(dispatched[0]).toEqual({
      version: "1.0",
      action: {
        name: "save_line",
        surfaceId: "orders",
        sourceComponentId: "save_btn",
        timestamp: "2026-11-21T00:00:00.000Z",
        userMessage: "Saved SKU-1 x5 for Ada",
        context: {
          sku: "SKU-1",
          qty: 5,
          rowIndex: 0,
          rowNumber: 1,
          escaped: { "@path": "/literal" },
        },
      },
    });
  });

  test("enforces UAX #31 identifiers and closed schema on action.metadata", async () => {
    const valid = validateActionMetadata({
      extensions: {
        a2ui_trace: { span: 1 },
        com_acme_sig: "ok",
        _internal_v2: true,
      },
    });
    expect(valid).toEqual({
      extensions: {
        a2ui_trace: { span: 1 },
        com_acme_sig: "ok",
        _internal_v2: true,
      },
    });

    const badCases: unknown[] = [
      "not-an-object",
      { extraField: 1 },
      { extensions: "not-an-object" },
      { extensions: { "com-acme-sig": "bad-hyphen" } },
      { extensions: { "123leading": "bad-digit" } },
      { extensions: { "": "empty" } },
    ];

    for (const bad of badCases) {
      let caught: unknown;
      try {
        validateActionMetadata(bad);
      } catch (err) {
        caught = err;
      }
      expect(caught instanceof A2uiValidationError).toBe(true);
    }
  });

  test("derives nested collection indices from DataModel scopes", () => {
    const model = new DataModel({
      groups: [
        { items: ["a", "b"] },
        { items: ["c", "d", "e"] },
      ],
    });
    expect(deriveCollectionIndicesFromScope("/", model)).toEqual([]);
    expect(deriveCollectionIndicesFromScope("/groups/1", model)).toEqual([1]);
    expect(
      deriveCollectionIndicesFromScope("/groups/1/items/2", model),
    ).toEqual([1, 2]);
  });

  test("enforces openUrl requiresUserActivation and invokes injected UrlOpener seam", async () => {
    const opened: string[] = [];
    const errors: RendererErrorEnvelope[] = [];
    const dispatched: DispatchedActionEnvelope[] = [];

    const processor = new MessageProcessor({
      registry: CatalogRegistry.withBasicV1(),
      strictMode: false,
      openUrl: (url) => opened.push(url),
      onAction: (env) => dispatched.push(env),
      onError: (env) => errors.push(env),
    });

    processor.processMessages([
      {
        version: "1.0",
        createSurface: {
          surfaceId: "s1",
          catalogId: BASIC_CATALOG_V1_ID,
        },
      },
    ]);

    const denied = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "link",
      userActivation: false,
      actionPayload: {
        functionCall: {
          "@call": "openUrl",
          args: { url: "https://example.com" },
        },
      },
    });
    expect(denied.kind).toBe("failed");
    expect(opened).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.message.includes("openUrl")).toBe(true);

    const allowed = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "link",
      userActivation: true,
      actionPayload: {
        functionCall: {
          "@call": "openUrl",
          args: { url: "https://example.com/docs" },
        },
      },
    });
    expect(allowed.kind).toBe("functionCall");
    expect(opened).toEqual(["https://example.com/docs"]);
    expect(dispatched).toEqual([]);
  });

  test("aborts event action silently without dispatching if surface is deleted mid-flight", async () => {
    const registry = new CatalogRegistry();
    registry.register(
      Catalog.fromJson({ catalogId: "erp_cat", protocolVersion: "1.0" }),
    );
    const outbound: OutboundRpcMessage[] = [];
    const dispatched: DispatchedActionEnvelope[] = [];
    const errors: RendererErrorEnvelope[] = [];

    const processor = new MessageProcessor({
      registry,
      functionRegistry: new FunctionRegistry(),
      strictMode: false,
      onOutbound: (msg) => outbound.push(msg),
      onAction: (env) => dispatched.push(env),
      onError: (env) => errors.push(env),
    });

    processor.processMessages([
      {
        version: "1.0",
        createSurface: { surfaceId: "s1", catalogId: "erp_cat" },
      },
    ]);

    const pendingAction = processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: {
        event: {
          name: "confirm",
          context: {
            first: { "@call": "stepOne", args: {} },
            second: { "@call": "stepTwo", args: {} },
          },
        },
      },
    });

    await Promise.resolve();
    expect(outbound.length).toBe(1);

    // Delete surface while first agent call is still in-flight.
    processor.processMessages([
      { version: "1.0", deleteSurface: { surfaceId: "s1" } },
    ]);

    const result = await pendingAction;
    expect(result.kind).toBe("cancelled");
    expect(outbound.length).toBe(1); // stepTwo was never sent
    expect(dispatched.length).toBe(0);
    expect(errors.length).toBe(0);
  });
});
