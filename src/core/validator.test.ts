import { describe, expect, test } from "nsh/test";
import {
  A2uiCatalogError,
  A2uiIntegrityError,
  A2uiRecursionError,
  BASIC_CATALOG_V1_ID,
  CatalogRegistry,
} from "./catalog";
import { A2uiValidationError } from "./expression";
import { A2uiDataError } from "./pointer";
import {
  PERMISSIVE_VALIDATION,
  PayloadValidator,
  STRICT_VALIDATION,
  resolveValidationConfig,
  toRendererError,
} from "./validator";

/** Builds `count` nested `formatString` calls around a string leaf. */
function nestFormatStringCalls(count: number): Record<string, unknown> {
  let value: unknown = "leaf";
  for (let i = 0; i < count; i += 1) {
    value = { "@call": "formatString", args: { value } };
  }
  return value as Record<string, unknown>;
}

describe("PayloadValidator — envelope & component checks", () => {
  test("rejects missing version, unsupported version, and multiple actions", () => {
    const validator = new PayloadValidator(CatalogRegistry.withBasicV1());

    expect(() =>
      validator.validateMessageEnvelope(
        { createSurface: { surfaceId: "s1" } },
        0,
        STRICT_VALIDATION,
      ),
    ).toThrow(A2uiValidationError);

    expect(() =>
      validator.validateMessageEnvelope(
        { version: "v99.0", createSurface: { surfaceId: "s1" } },
        0,
        STRICT_VALIDATION,
      ),
    ).toThrow(/Unsupported protocol version/);

    expect(() =>
      validator.validateMessageEnvelope(
        {
          version: "1.0",
          createSurface: { surfaceId: "s1" },
          deleteSurface: { surfaceId: "s1" },
        },
        0,
        STRICT_VALIDATION,
      ),
    ).toThrow(/multiple conflicting update actions/);
  });

  test("rejects agentOnly functions in component bindings", () => {
    const registry = CatalogRegistry.withBasicV1();
    registry.registerInline({
      protocolVersion: "1.0",
      catalogId: "sec-cat",
      functions: {
        secretOp: {
          type: "object",
          returnType: "string",
          allowedCallers: "agentOnly",
          properties: {
            "@call": { const: "secretOp" },
            args: { type: "object", additionalProperties: false },
          },
          required: ["@call"],
        },
      },
    });
    const validator = new PayloadValidator(registry);

    expect(() =>
      validator.validateComponentsBatch(
        [
          {
            id: "root",
            component: "Text",
            text: { "@call": "secretOp", catalogId: "sec-cat" },
          },
        ],
        {
          surfaceId: "s1",
          defaultCatalogId: BASIC_CATALOG_V1_ID,
          existingComponents: new Map(),
          config: STRICT_VALIDATION,
        },
      ),
    ).toThrow(/agentOnly/);
  });

  test("nested function calls have no depth limit of their own", () => {
    const validator = new PayloadValidator(CatalogRegistry.withBasicV1());

    // Six calls failed the former limit of 5; 23 is the most the global
    // depth limit (50, counted from the message) leaves room for.
    for (const count of [6, 23]) {
      expect(() =>
        validator.validateComponentsBatch(
          [{ id: "root", component: "Text", text: nestFormatStringCalls(count) }],
          {
            surfaceId: "s1",
            defaultCatalogId: BASIC_CATALOG_V1_ID,
            existingComponents: new Map(),
            config: STRICT_VALIDATION,
          },
        ),
      ).not.toThrow();
    }
  });

  test("nested function calls past the global depth limit fail with RecursionError", () => {
    const validator = new PayloadValidator(CatalogRegistry.withBasicV1());

    // Each call adds two JSON levels (the call and its args). The component
    // sits at depth 3 of its message, so the args of call 24 sit at 51.
    expect(() =>
      validator.validateComponentsBatch(
        [{ id: "root", component: "Text", text: nestFormatStringCalls(24) }],
        {
          surfaceId: "s1",
          defaultCatalogId: BASIC_CATALOG_V1_ID,
          existingComponents: new Map(),
          config: STRICT_VALIDATION,
        },
      ),
    ).toThrow(A2uiRecursionError);
    expect(() =>
      validator.validateComponentsBatch(
        [{ id: "root", component: "Text", text: nestFormatStringCalls(24) }],
        {
          surfaceId: "s1",
          defaultCatalogId: BASIC_CATALOG_V1_ID,
          existingComponents: new Map(),
          config: STRICT_VALIDATION,
        },
      ),
    ).toThrow(/Global recursion limit exceeded/);
  });

  test("resolveValidationConfig defaults omitted fields to strict", () => {
    const cfg = resolveValidationConfig({ allowOrphanComponents: true });
    expect(cfg.allowOrphanComponents).toBe(true);
    expect(cfg.allowDanglingReferences).toBe(false);
    expect(cfg.allowUnknownElements).toBe(false);
    expect(cfg.allowMissingRoot).toBe(false);
    expect(PERMISSIVE_VALIDATION.allowMissingRoot).toBe(true);
  });

  test("toRendererError emits v1.0 compliant error payloads", () => {
    const valErr = toRendererError(
      new A2uiValidationError("VALIDATION_FAILED", "bad text", "/components/0/text", {
        surfaceId: "main",
      }),
    );
    expect(valErr).toEqual({
      version: "1.0",
      error: {
        code: "VALIDATION_FAILED",
        surfaceId: "main",
        path: "/components/0/text",
        message: "bad text",
      },
    });

    const rpcErr = toRendererError(
      new A2uiValidationError("INVALID_FUNCTION_CALL", "missing args", "/callFunction", {
        functionCallId: "fc-1",
      }),
    );
    expect(rpcErr).toEqual({
      version: "1.0",
      error: {
        code: "INVALID_FUNCTION_CALL",
        functionCallId: "fc-1",
        message: "missing args",
      },
    });

    const catErr = toRendererError(
      new A2uiCatalogError("CATALOG_NOT_FOUND", "no cat", "s1"),
    );
    expect(catErr.error.code).toBe("CATALOG_NOT_FOUND");

    const dataErr = toRendererError(
      new A2uiDataError("FORBIDDEN_SEGMENT", "forbidden __proto__", "/__proto__"),
      "s1",
    );
    expect(dataErr.error.code).toBe("DATA_ERROR");

    const intErr = toRendererError(
      new A2uiIntegrityError("INTEGRITY_ERROR", "dup", "s1"),
    );
    expect(intErr.error.code).toBe("INTEGRITY_ERROR");
  });
});
