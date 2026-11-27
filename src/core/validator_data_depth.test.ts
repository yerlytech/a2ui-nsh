import { describe, expect, test } from "nsh/test";
import {
  A2uiRecursionError,
  BASIC_CATALOG_V1_ID,
  CatalogRegistry,
} from "./catalog";
import { PayloadValidator, STRICT_VALIDATION } from "./validator";

// A2UI 1.0 counts the global depth limit from the message root: message (0)
// → createSurface / updateDataModel (1) → dataModel / value (2). With the
// default limit (50), the deepest container a data value may hold sits at
// depth 50, so the value itself holds a chain of 49 nested containers.
const LIMIT = STRICT_VALIDATION.maxRecursionDepth;
const CONTAINERS_AT_LIMIT = LIMIT - 1;

/** Builds `count` nested objects around `leaf` (the outermost is the value). */
function objectChain(count: number, leaf?: unknown): Record<string, unknown> {
  let value: Record<string, unknown> = leaf === undefined ? {} : { leaf };
  for (let i = 1; i < count; i += 1) {
    value = { nested: value };
  }
  return value;
}

/** Builds `count` nested arrays around `leaf` (the outermost is the value). */
function arrayChain(count: number, leaf?: unknown): unknown[] {
  let value: unknown[] = leaf === undefined ? [] : [leaf];
  for (let i = 1; i < count; i += 1) {
    value = [value];
  }
  return value;
}

function createSurface(dataModel: unknown): Record<string, unknown> {
  return {
    version: "1.0",
    createSurface: {
      surfaceId: "s1",
      catalogId: BASIC_CATALOG_V1_ID,
      dataModel,
    },
  };
}

function updateDataModel(value: unknown): Record<string, unknown> {
  return {
    version: "1.0",
    updateDataModel: { surfaceId: "s1", path: "/", value },
  };
}

function validate(msg: unknown): string {
  const validator = new PayloadValidator(CatalogRegistry.withBasicV1());
  return validator.validateMessageEnvelope(msg, 0, STRICT_VALIDATION);
}

function recursionError(msg: unknown): A2uiRecursionError {
  try {
    validate(msg);
  } catch (error) {
    expect(error instanceof A2uiRecursionError).toBe(true);
    return error as A2uiRecursionError;
  }
  throw new Error("expected the message to be refused");
}

describe("PayloadValidator — data depth counts from the message root", () => {
  test("accepts a createSurface dataModel whose deepest container sits at the limit", () => {
    expect(validate(createSurface(objectChain(CONTAINERS_AT_LIMIT)))).toBe(
      "createSurface",
    );
  });

  test("refuses a createSurface dataModel one level deeper with RECURSION_LIMIT_EXCEEDED at /dataModel", () => {
    const error = recursionError(
      createSurface(objectChain(CONTAINERS_AT_LIMIT + 1)),
    );

    expect(error.code).toBe("RECURSION_LIMIT_EXCEEDED");
    expect(error.path).toBe("/dataModel");
    expect(error.surfaceId).toBe("s1");
  });

  test("accepts an updateDataModel value whose deepest container sits at the limit", () => {
    expect(validate(updateDataModel(objectChain(CONTAINERS_AT_LIMIT)))).toBe(
      "updateDataModel",
    );
    expect(validate(updateDataModel(arrayChain(CONTAINERS_AT_LIMIT)))).toBe(
      "updateDataModel",
    );
  });

  test("refuses an updateDataModel value one level deeper with RECURSION_LIMIT_EXCEEDED at /value", () => {
    for (const value of [
      objectChain(CONTAINERS_AT_LIMIT + 1),
      arrayChain(CONTAINERS_AT_LIMIT + 1),
    ]) {
      const error = recursionError(updateDataModel(value));

      expect(error.code).toBe("RECURSION_LIMIT_EXCEEDED");
      expect(error.path).toBe("/value");
      expect(error.surfaceId).toBe("s1");
    }
  });

  test("never refuses a scalar, whatever its depth: the limit counts containers", () => {
    for (const leaf of ["text", 42, true, null]) {
      // The scalar sits one level below the deepest allowed container.
      expect(
        validate(createSurface(objectChain(CONTAINERS_AT_LIMIT, leaf))),
      ).toBe("createSurface");
      expect(
        validate(updateDataModel(objectChain(CONTAINERS_AT_LIMIT, leaf))),
      ).toBe("updateDataModel");
      expect(
        validate(updateDataModel(arrayChain(CONTAINERS_AT_LIMIT, leaf))),
      ).toBe("updateDataModel");
    }
    for (const value of ["text", 42, true]) {
      expect(validate(updateDataModel(value))).toBe("updateDataModel");
    }
  });
});
