import { describe, expect, test } from "nsh/test";
import {
  deriveCollectionIndicesFromScope,
  validateActionMetadata,
  type DispatchedActionEnvelope,
} from "./actions";
import { BASIC_CATALOG_V1_ID, CatalogRegistry } from "./catalog";
import { DataModel } from "./data_model";
import { A2uiValidationError } from "./expression";
import { MessageProcessor } from "./processor";
import type { RendererErrorEnvelope } from "./validator";

const CLOCK_ISO = "2026-11-26T12:34:56.789Z";

interface HarnessOptions {
  readonly dataModel?: Record<string, unknown>;
  readonly nowIso?: () => string;
  readonly onAction?: (envelope: DispatchedActionEnvelope) => void;
}

function createSurfaceProcessor(options: HarnessOptions = {}): {
  readonly processor: MessageProcessor;
  readonly errors: RendererErrorEnvelope[];
  readonly opened: string[];
} {
  const errors: RendererErrorEnvelope[] = [];
  const opened: string[] = [];
  const processor = new MessageProcessor({
    registry: CatalogRegistry.withBasicV1(),
    strictMode: false,
    nowIso: options.nowIso ?? (() => CLOCK_ISO),
    openUrl: (url) => opened.push(url),
    onError: (envelope) => errors.push(envelope),
    ...(options.onAction ? { onAction: options.onAction } : {}),
  });
  processor.processMessages([
    {
      version: "1.0",
      createSurface: {
        surfaceId: "s1",
        catalogId: BASIC_CATALOG_V1_ID,
        ...(options.dataModel ? { dataModel: options.dataModel } : {}),
      },
    },
  ]);
  return { processor, errors, opened };
}

function catchValidationError(fn: () => unknown): A2uiValidationError {
  try {
    fn();
  } catch (err) {
    if (err instanceof A2uiValidationError) {
      return err;
    }
    throw err;
  }
  throw new Error("expected an A2uiValidationError, but nothing was thrown");
}

describe("validateActionMetadata — closed schema and UAX #31 keys", () => {
  test("accepts an empty metadata object", () => {
    expect(validateActionMetadata({})).toEqual({});
  });

  test("accepts the only allowed key, extensions, and keeps its entries", () => {
    const validated = validateActionMetadata(
      {
        extensions: {
          trace_id: "abc",
          nested: { span: 1 },
        },
      },
      "s1",
    );

    expect(validated).toEqual({
      extensions: {
        trace_id: "abc",
        nested: { span: 1 },
      },
    });
  });

  test("refuses a non-object metadata value", () => {
    const err = catchValidationError(() => validateActionMetadata("meta", "s1"));

    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.path).toBe("/action/metadata");
    expect(err.surfaceId).toBe("s1");
    expect(err.message).toBe("Action metadata must be an object");
  });

  test("refuses an unknown top-level key (closed schema)", () => {
    const err = catchValidationError(() =>
      validateActionMetadata({ signature: "sig" }, "s1"),
    );

    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.path).toBe("/action/metadata/signature");
    expect(err.surfaceId).toBe("s1");
    expect(err.message).toBe(
      "Action metadata does not allow property 'signature'",
    );
  });

  test("refuses a non-UAX #31 extension key", () => {
    const err = catchValidationError(() =>
      validateActionMetadata(
        { extensions: { "com-acme": "bad-hyphen" } },
        "s1",
      ),
    );

    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.path).toBe("/action/metadata/extensions/com-acme");
    expect(err.surfaceId).toBe("s1");
    expect(err.message).toBe(
      "Action metadata extension key 'com-acme' must be a valid UAX #31 identifier",
    );
  });

  test("refuses a non-object extensions value", () => {
    const err = catchValidationError(() =>
      validateActionMetadata({ extensions: ["not", "an", "object"] }, "s1"),
    );

    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.path).toBe("/action/metadata/extensions");
    expect(err.surfaceId).toBe("s1");
    expect(err.message).toBe("Action metadata extensions must be an object");
  });
});

describe("deriveCollectionIndicesFromScope — list levels and stops", () => {
  test("returns no indices for the root scope", () => {
    const model = new DataModel({ groups: [{ items: ["a"] }] });

    expect(deriveCollectionIndicesFromScope("/", model)).toEqual([]);
    expect(deriveCollectionIndicesFromScope("", model)).toEqual([]);
  });

  test("returns one index for a single list level", () => {
    const model = new DataModel({ groups: [{ items: ["a"] }] });

    expect(deriveCollectionIndicesFromScope("/groups/1", model)).toEqual([1]);
  });

  test("returns nested indices in outer-to-inner order", () => {
    const model = new DataModel({
      groups: [
        { items: [{ id: "a" }, { id: "b" }] },
        { items: [{ id: "c" }, { id: "d" }] },
      ],
    });

    expect(
      deriveCollectionIndicesFromScope("/groups/1/items/0", model),
    ).toEqual([1, 0]);
  });

  test("skips an object key that sits between two lists", () => {
    const model = new DataModel({
      groups: [
        { items: [{ id: "a" }, { id: "b" }] },
        { items: [{ id: "c" }, { id: "d" }] },
      ],
    });

    expect(
      deriveCollectionIndicesFromScope("/groups/0/items/1", model),
    ).toEqual([0, 1]);
  });

  test("stops before a non-numeric segment where a list index is expected", () => {
    const model = new DataModel({ groups: [{ items: ["a"] }] });

    expect(deriveCollectionIndicesFromScope("/groups/1x", model)).toEqual([]);
    expect(
      deriveCollectionIndicesFromScope("/groups/0/items/not-an-index", model),
    ).toEqual([0]);
  });

  test("treats a negative segment as not an array index", () => {
    const model = new DataModel({ groups: [{ items: ["a"] }] });

    expect(deriveCollectionIndicesFromScope("/groups/-1", model)).toEqual([]);
    expect(
      deriveCollectionIndicesFromScope("/groups/0/items/-1", model),
    ).toEqual([0]);
  });
});

describe("dispatchAction — envelope fields", () => {
  test("emits the full v1.0 envelope with the ClockSeam timestamp", async () => {
    const dispatched: DispatchedActionEnvelope[] = [];
    const { processor, errors } = createSurfaceProcessor({
      dataModel: { customer: "Ada" },
      nowIso: () => CLOCK_ISO,
      onAction: (envelope) => dispatched.push(envelope),
    });

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "save_btn",
      actionPayload: {
        event: {
          name: "save_line",
          context: {
            customer: { "@path": "customer" },
            note: "hello",
          },
        },
      },
      metadata: { extensions: { trace_id: "abc" } },
    });

    if (result.kind !== "event") {
      throw new Error(`expected an event result, got ${result.kind}`);
    }

    expect(dispatched.length).toBe(1);
    const envelope = dispatched[0]!;
    expect(result.envelope).toBe(envelope);
    expect(envelope.version).toBe("1.0");
    expect(envelope.action.name).toBe("save_line");
    expect(envelope.action.surfaceId).toBe("s1");
    expect(envelope.action.sourceComponentId).toBe("save_btn");
    expect(envelope.action.timestamp).toBe(CLOCK_ISO);
    expect(envelope.action.context).toEqual({
      customer: "Ada",
      note: "hello",
    });
    expect(envelope.action.metadata).toEqual({
      extensions: { trace_id: "abc" },
    });
    expect("userMessage" in envelope.action).toBe(false);
    expect(envelope).toEqual({
      version: "1.0",
      action: {
        name: "save_line",
        surfaceId: "s1",
        sourceComponentId: "save_btn",
        timestamp: CLOCK_ISO,
        context: {
          customer: "Ada",
          note: "hello",
        },
        metadata: { extensions: { trace_id: "abc" } },
      },
    });
    expect(errors).toEqual([]);
  });

  test("dispatches an event even when no onAction handler is registered", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: { event: { name: "no_handler" } },
    });

    if (result.kind !== "event") {
      throw new Error(`expected an event result, got ${result.kind}`);
    }
    expect(result.envelope.action.name).toBe("no_handler");
    expect(errors).toEqual([]);
  });
});

describe("dispatchAction — refusals", () => {
  test("refuses a non-object action payload", async () => {
    const dispatched: DispatchedActionEnvelope[] = [];
    const { processor, errors } = createSurfaceProcessor({
      onAction: (envelope) => dispatched.push(envelope),
    });

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: "not-an-object",
    });

    expect(result).toEqual({ kind: "failed" });
    expect(dispatched).toEqual([]);
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INVALID_ACTION");
    expect(surfaceScopedError(errors).surfaceId).toBe("s1");
  });

  test("refuses a payload with both event and functionCall", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: {
        event: { name: "both" },
        functionCall: { "@call": "formatString", args: { value: "x" } },
      },
    });

    expect(result).toEqual({ kind: "failed" });
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INVALID_ACTION");
    expect(errors[0]!.error.message).toBe(
      "Action payload must contain exactly one of 'event' or 'functionCall'",
    );
  });

  test("refuses a payload with neither event nor functionCall", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: {},
    });

    expect(result).toEqual({ kind: "failed" });
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INVALID_ACTION");
    expect(errors[0]!.error.message).toBe(
      "Action payload must contain exactly one of 'event' or 'functionCall'",
    );
  });

  test("refuses an event action without a non-empty name", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: { event: { name: "" } },
    });

    expect(result).toEqual({ kind: "failed" });
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INVALID_ACTION");
    expect(errors[0]!.error.message).toBe(
      "Action event requires a non-empty string 'name'",
    );
  });

  test("refuses an event context that is not an object", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: { event: { name: "ctx", context: "bad" } },
    });

    expect(result).toEqual({ kind: "failed" });
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INVALID_ACTION");
    expect(errors[0]!.error.message).toBe(
      "Action event 'context' must be an object",
    );
  });

  test("reports EXPRESSION_ERROR when an event context entry is invalid", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: {
        event: {
          name: "ctx",
          context: { bad: { "@unknown": 1 } },
        },
      },
    });

    expect(result).toEqual({ kind: "failed" });
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("EXPRESSION_ERROR");
    expect(surfaceScopedError(errors).surfaceId).toBe("s1");
    expect(errors[0]!.error.message).toBe(
      "Action event context entry 'bad' is invalid: Disallowed reserved single-@ key \"@unknown\" in dynamic object at \"/context/bad/@unknown\"",
    );
  });

  test("refuses invalid metadata before emitting anything", async () => {
    const dispatched: DispatchedActionEnvelope[] = [];
    const { processor, errors } = createSurfaceProcessor({
      onAction: (envelope) => dispatched.push(envelope),
    });

    let caught: unknown;
    try {
      await processor.dispatchAction({
        surfaceId: "s1",
        sourceComponentId: "btn",
        actionPayload: { event: { name: "save" } },
        metadata: { signature: "sig" },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught instanceof A2uiValidationError).toBe(true);
    const err = caught as A2uiValidationError;
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.path).toBe("/action/metadata/signature");
    expect(err.surfaceId).toBe("s1");
    expect(dispatched).toEqual([]);
    expect(errors).toEqual([]);
  });
});

describe("dispatchAction — function calls", () => {
  test("returns a functionCall result with the evaluated value", async () => {
    const dispatched: DispatchedActionEnvelope[] = [];
    const { processor, errors } = createSurfaceProcessor({
      onAction: (envelope) => dispatched.push(envelope),
    });

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: {
        functionCall: {
          "@call": "formatString",
          args: { value: "plain text" },
        },
      },
    });

    expect(result).toEqual({ kind: "functionCall", value: "plain text" });
    expect(dispatched).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("refuses an unknown function with no local implementation and no listener", async () => {
    const dispatched: DispatchedActionEnvelope[] = [];
    const { processor, errors } = createSurfaceProcessor({
      onAction: (envelope) => dispatched.push(envelope),
    });

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: {
        functionCall: { "@call": "noSuchFunction", args: {} },
      },
    });

    expect(result).toEqual({ kind: "failed" });
    expect(dispatched).toEqual([]);
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("EXPRESSION_ERROR");
    expect(surfaceScopedError(errors).surfaceId).toBe("s1");
    expect(errors[0]!.error.message).toBe(
      "Function 'noSuchFunction' has no local implementation and no outbound listener is available",
    );
  });

  test("refuses a function that requires user activation without activation", async () => {
    const dispatched: DispatchedActionEnvelope[] = [];
    const { processor, errors, opened } = createSurfaceProcessor({
      onAction: (envelope) => dispatched.push(envelope),
    });

    const result = await processor.dispatchAction({
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

    expect(result).toEqual({ kind: "failed" });
    expect(opened).toEqual([]);
    expect(dispatched).toEqual([]);
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("EXPRESSION_ERROR");
    expect(surfaceScopedError(errors).surfaceId).toBe("s1");
    expect(errors[0]!.error.message).toBe(
      "Function 'openUrl' requires user activation",
    );
  });
});

describe("dispatchAction — remaining refusal rules", () => {
  test("refuses an event value that is not an object", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: { event: "not-an-event" },
    });

    expect(result).toEqual({ kind: "failed" });
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INVALID_ACTION");
    expect(errors[0]!.error.message).toBe("Action 'event' must be an object");
  });

  test("refuses a userMessage that resolves to a non-string", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: { event: { name: "msg", userMessage: 42 } },
    });

    expect(result).toEqual({ kind: "failed" });
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INVALID_ACTION");
    expect(errors[0]!.error.message).toBe(
      "Action event 'userMessage' must resolve to a string or null (got number)",
    );
  });

  test("refuses a functionCall that is not a valid v1.0 FunctionCall object", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: {
        functionCall: { "@call": "formatString", extra: true },
      },
    });

    expect(result).toEqual({ kind: "failed" });
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INVALID_ACTION");
    expect(errors[0]!.error.message).toBe(
      "Action 'functionCall' must be a valid v1.0 FunctionCall object",
    );
  });

  test("refuses a functionCall whose @call name is not a UAX #31 identifier", async () => {
    const { processor, errors } = createSurfaceProcessor();

    const result = await processor.dispatchAction({
      surfaceId: "s1",
      sourceComponentId: "btn",
      actionPayload: {
        functionCall: { "@call": "bad-name", args: {} },
      },
    });

    expect(result).toEqual({ kind: "failed" });
    expect(errors.length).toBe(1);
    expect(errors[0]!.error.code).toBe("INVALID_ACTION");
    expect(errors[0]!.error.message).toBe(
      "Invalid function call name \"bad-name\" at \"/functionCall\"",
    );
  });
});

function surfaceScopedError(errors: readonly RendererErrorEnvelope[]): {
  readonly code: string;
  readonly surfaceId: string;
  readonly message: string;
} {
  const error = errors[0]!.error;
  if (!("surfaceId" in error)) {
    throw new Error("expected a surfaceId-scoped error envelope");
  }
  return error;
}
