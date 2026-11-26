import { describe, expect, test } from "nsh/test";
import { CatalogRegistry } from "./catalog";
import { A2uiValidationError } from "./expression";
import {
  PERMISSIVE_VALIDATION,
  PayloadValidator,
  STRICT_VALIDATION,
  type ValidationConfig,
} from "./validator";

function createValidator(): PayloadValidator {
  return new PayloadValidator(CatalogRegistry.withBasicV1());
}

/**
 * Runs `validateMessageEnvelope` and returns the refusal it raises, asserting
 * that the refusal is an `A2uiValidationError`.
 */
function envelopeError(
  message: unknown,
  config: ValidationConfig = STRICT_VALIDATION,
  messageIndex = 0,
): A2uiValidationError {
  try {
    createValidator().validateMessageEnvelope(message, messageIndex, config);
  } catch (error) {
    expect(error instanceof A2uiValidationError).toBe(true);
    return error as A2uiValidationError;
  }
  throw new Error("expected validateMessageEnvelope to refuse the message");
}

function envelopeAction(
  message: unknown,
  config: ValidationConfig = STRICT_VALIDATION,
): string {
  return createValidator().validateMessageEnvelope(message, 0, config);
}

describe("PayloadValidator — createSurface envelope", () => {
  test("refuses a non-object payload", () => {
    const error = envelopeError({
      version: "1.0",
      createSurface: null,
    });
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/createSurface");
  });

  test("requires surfaceId", () => {
    const error = envelopeError(
      { version: "1.0", createSurface: {} },
      STRICT_VALIDATION,
      2,
    );
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/surfaceId");
    expect(error.surfaceId).toBe("");
    expect(error.details?.[0]?.path).toBe(
      "messages.2.createSurface.surfaceId",
    );
    expect(error.details?.[0]?.code).toBe("missing_field");
  });

  test("requires surfaceId to be a string", () => {
    const error = envelopeError({
      version: "1.0",
      createSurface: { surfaceId: 7 },
    });
    expect(error.path).toBe("/surfaceId");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.[0]?.path).toBe(
      "messages.0.createSurface.surfaceId",
    );
    expect(error.details?.[0]?.code).toBe("type_mismatch");
  });

  test("refuses an unexpected property", () => {
    const error = envelopeError({
      version: "1.0",
      createSurface: { surfaceId: "s1", extra: true },
    });
    expect(error.path).toBe("/extra");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.surfaceId).toBe("s1");
  });

  test("drops theme only in permissive mode", () => {
    const message = {
      version: "1.0",
      createSurface: { surfaceId: "s1", theme: "dark" },
    };
    const error = envelopeError(message, STRICT_VALIDATION);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/theme");

    expect(envelopeAction(message, PERMISSIVE_VALIDATION)).toBe(
      "createSurface",
    );
  });

  test("requires catalogId to be a string", () => {
    const error = envelopeError({
      version: "1.0",
      createSurface: { surfaceId: "s1", catalogId: 5 },
    });
    expect(error.path).toBe("/catalogId");
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  test("requires sendDataModel to be a boolean", () => {
    const error = envelopeError({
      version: "1.0",
      createSurface: { surfaceId: "s1", sendDataModel: "yes" },
    });
    expect(error.path).toBe("/sendDataModel");
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  test("requires dataModel to be an object", () => {
    const error = envelopeError({
      version: "1.0",
      createSurface: { surfaceId: "s1", dataModel: [] },
    });
    expect(error.path).toBe("/dataModel");
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  test("requires components to be a non-empty array", () => {
    const error = envelopeError({
      version: "1.0",
      createSurface: { surfaceId: "s1", components: [] },
    });
    expect(error.path).toBe("/components");
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  test("accepts the minimal envelope", () => {
    expect(
      envelopeAction({
        version: "1.0",
        createSurface: { surfaceId: "s1" },
      }),
    ).toBe("createSurface");
  });
});

describe("PayloadValidator — updateComponents envelope", () => {
  test("refuses a non-object payload", () => {
    const error = envelopeError({
      version: "1.0",
      updateComponents: "bad",
    });
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/updateComponents");
  });

  test("requires surfaceId", () => {
    const error = envelopeError(
      {
        version: "1.0",
        updateComponents: { components: [{ id: "root", component: "Text" }] },
      },
      STRICT_VALIDATION,
      1,
    );
    expect(error.path).toBe("/surfaceId");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.[0]?.path).toBe(
      "messages.1.updateComponents.surfaceId",
    );
    expect(error.details?.[0]?.code).toBe("missing_field");
  });

  test("requires surfaceId to be a string", () => {
    const error = envelopeError({
      version: "1.0",
      updateComponents: {
        surfaceId: 7,
        components: [{ id: "root", component: "Text" }],
      },
    });
    expect(error.path).toBe("/surfaceId");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.[0]?.code).toBe("type_mismatch");
  });

  test("refuses an unexpected property", () => {
    const error = envelopeError({
      version: "1.0",
      updateComponents: {
        surfaceId: "s1",
        components: [{ id: "root", component: "Text" }],
        extra: true,
      },
    });
    expect(error.path).toBe("/extra");
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  test("requires a non-empty components array", () => {
    const error = envelopeError({
      version: "1.0",
      updateComponents: { surfaceId: "s1", components: [] },
    });
    expect(error.path).toBe("/components");
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  test("accepts the minimal envelope", () => {
    expect(
      envelopeAction({
        version: "1.0",
        updateComponents: {
          surfaceId: "s1",
          components: [{ id: "root", component: "Text" }],
        },
      }),
    ).toBe("updateComponents");
  });
});

describe("PayloadValidator — updateDataModel envelope", () => {
  test("refuses a non-object payload", () => {
    const error = envelopeError({
      version: "1.0",
      updateDataModel: null,
    });
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/updateDataModel");
  });

  test("requires surfaceId", () => {
    const error = envelopeError({
      version: "1.0",
      updateDataModel: { value: 1 },
    });
    expect(error.path).toBe("/surfaceId");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.[0]?.path).toBe(
      "messages.0.updateDataModel.surfaceId",
    );
    expect(error.details?.[0]?.code).toBe("missing_field");
  });

  test("requires surfaceId to be a string", () => {
    const error = envelopeError({
      version: "1.0",
      updateDataModel: { surfaceId: 7, value: 1 },
    });
    expect(error.path).toBe("/surfaceId");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.[0]?.code).toBe("type_mismatch");
  });

  test("refuses an unexpected property", () => {
    const error = envelopeError({
      version: "1.0",
      updateDataModel: { surfaceId: "s1", value: 1, extra: true },
    });
    expect(error.path).toBe("/extra");
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  test("requires value", () => {
    const error = envelopeError({
      version: "1.0",
      updateDataModel: { surfaceId: "s1" },
    });
    expect(error.path).toBe("/value");
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  test("requires path to be a string", () => {
    const error = envelopeError({
      version: "1.0",
      updateDataModel: { surfaceId: "s1", value: 1, path: 5 },
    });
    expect(error.path).toBe("/path");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.message).toMatch(/must be a string/);
  });

  test("requires path to start with '/'", () => {
    const error = envelopeError({
      version: "1.0",
      updateDataModel: { surfaceId: "s1", value: 1, path: "count" },
    });
    expect(error.path).toBe("/path");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.message).toMatch(/must start with '\/'/);
  });

  test("refuses an invalid '~' escape", () => {
    const error = envelopeError({
      version: "1.0",
      updateDataModel: { surfaceId: "s1", value: 1, path: "/a~2b" },
    });
    expect(error.path).toBe("/path");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.message).toMatch(/invalid '~' escape/);
  });

  test("accepts the minimal envelope", () => {
    expect(
      envelopeAction({
        version: "1.0",
        updateDataModel: { surfaceId: "s1", value: { count: 0 } },
      }),
    ).toBe("updateDataModel");
  });
});

describe("PayloadValidator — deleteSurface envelope", () => {
  test("refuses a non-object payload", () => {
    const error = envelopeError({
      version: "1.0",
      deleteSurface: null,
    });
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.path).toBe("/deleteSurface");
    expect(error.surfaceId).toBe("");
  });

  test("requires surfaceId", () => {
    const error = envelopeError({
      version: "1.0",
      deleteSurface: {},
    });
    expect(error.path).toBe("/surfaceId");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.[0]?.path).toBe(
      "messages.0.deleteSurface.surfaceId",
    );
    expect(error.details?.[0]?.code).toBe("missing_field");
  });

  test("requires surfaceId to be a string", () => {
    const error = envelopeError({
      version: "1.0",
      deleteSurface: { surfaceId: 7 },
    });
    expect(error.path).toBe("/surfaceId");
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.[0]?.code).toBe("type_mismatch");
  });

  test("refuses an unexpected property", () => {
    const error = envelopeError({
      version: "1.0",
      deleteSurface: { surfaceId: "s1", extra: true },
    });
    expect(error.path).toBe("/extra");
    expect(error.code).toBe("VALIDATION_FAILED");
  });

  test("accepts the minimal envelope", () => {
    expect(
      envelopeAction({
        version: "1.0",
        deleteSurface: { surfaceId: "s1" },
      }),
    ).toBe("deleteSurface");
  });
});

describe("PayloadValidator — callRendererFunction envelope", () => {
  test("refuses a non-object payload", () => {
    const error = envelopeError({
      version: "1.0",
      callRendererFunction: null,
    });
    expect(error.code).toBe("INVALID_FUNCTION_CALL");
    expect(error.path).toBe("/callRendererFunction");
  });

  test("requires functionCallId", () => {
    const error = envelopeError({
      version: "1.0",
      callRendererFunction: {
        callFunction: { "@call": "someFn", catalogId: "cat" },
      },
    });
    expect(error.code).toBe("INVALID_FUNCTION_CALL");
    expect(error.path).toBe("/functionCallId");
  });

  test("requires surfaceId to be a string when present", () => {
    const error = envelopeError({
      version: "1.0",
      callRendererFunction: {
        functionCallId: "fc1",
        surfaceId: 7,
        callFunction: { "@call": "someFn", catalogId: "cat" },
      },
    });
    expect(error.path).toBe("/surfaceId");
    expect(error.code).toBe("INVALID_FUNCTION_CALL");
    expect(error.functionCallId).toBe("fc1");
  });

  test("requires callFunction to be an object", () => {
    const error = envelopeError({
      version: "1.0",
      callRendererFunction: { functionCallId: "fc1", callFunction: null },
    });
    expect(error.path).toBe("/callFunction");
    expect(error.code).toBe("INVALID_FUNCTION_CALL");
    expect(error.functionCallId).toBe("fc1");
  });

  test("requires a non-empty '@call'", () => {
    const error = envelopeError({
      version: "1.0",
      callRendererFunction: {
        functionCallId: "fc1",
        callFunction: { "@call": "", catalogId: "cat" },
      },
    });
    expect(error.path).toBe("/callFunction/@call");
    expect(error.code).toBe("INVALID_FUNCTION_CALL");
  });

  test("requires a catalogId", () => {
    const error = envelopeError({
      version: "1.0",
      callRendererFunction: {
        functionCallId: "fc1",
        callFunction: { "@call": "someFn" },
      },
    });
    expect(error.path).toBe("/callFunction/catalogId");
    expect(error.code).toBe("INVALID_FUNCTION_CALL");
  });

  test("requires args to be an object when present", () => {
    const error = envelopeError({
      version: "1.0",
      callRendererFunction: {
        functionCallId: "fc1",
        callFunction: { "@call": "someFn", catalogId: "cat", args: [] },
      },
    });
    expect(error.path).toBe("/callFunction/args");
    expect(error.code).toBe("INVALID_FUNCTION_CALL");
  });

  test("accepts the minimal envelope", () => {
    expect(
      envelopeAction({
        version: "1.0",
        callRendererFunction: {
          functionCallId: "fc1",
          callFunction: { "@call": "someFn", catalogId: "cat" },
        },
      }),
    ).toBe("callRendererFunction");
  });
});
