import { beforeAll, describe, expect, test } from "nsh/test";
import { DataContext, DataModel } from "../../src/core/data_model";
import { decodePointerSegment } from "../../src/core/pointer";
import {
  ConformanceClient,
  assertMatchesExpectedError,
  type ConformanceCase,
  type ConformanceExpectError,
} from "./harness";

/**
 * Transition skip list for C1 data model suites (must remain empty; any stale
 * skip causes a test failure).
 */
export const SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map();

interface DataModelStep {
  readonly op: string;
  readonly path?: string;
  readonly value?: unknown;
  readonly expect?: unknown;
  readonly expect_absent?: boolean;
  readonly expect_type?: "list" | "object";
  readonly expect_notified?: readonly string[];
  readonly expect_values?: Readonly<Record<string, unknown>>;
  readonly expect_error?: ConformanceExpectError;
  readonly expectError?: ConformanceExpectError;
}

interface WatcherRecord {
  readonly path: string;
  readonly sub: ReturnType<DataModel["subscribe"]>;
  changeCount: number;
}

function deepClonePlain(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepClonePlain);
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    Object.defineProperty(out, key, {
      value: deepClonePlain(src[key]),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

function applyDataModelStep(
  model: DataModel,
  step: DataModelStep,
  inputState: { lastSetValue: unknown },
): void {
  const stepPath = step.path ?? "/";
  switch (step.op) {
    case "get": {
      const actual = model.get(stepPath);
      if (step.expect_absent === true) {
        expect(actual).toBeUndefined();
      }
      if (step.expect_type === "list") {
        expect(Array.isArray(actual)).toBe(true);
      } else if (step.expect_type === "object") {
        expect(
          typeof actual === "object" && actual !== null && !Array.isArray(actual),
        ).toBe(true);
      }
      if (step.expect !== undefined) {
        expect(actual).toEqual(step.expect);
      }
      break;
    }
    case "set": {
      const callerValue =
        step.value !== undefined ? deepClonePlain(step.value) : undefined;
      inputState.lastSetValue = callerValue;
      model.set(stepPath, callerValue);
      break;
    }
    case "mutate_input": {
      const tokens = stepPath
        .split("/")
        .filter((part) => part.length > 0)
        .map(decodePointerSegment);
      let curr: unknown = inputState.lastSetValue;
      if (tokens.length > 0 && curr !== null && curr !== undefined) {
        for (let i = 0; i < tokens.length - 1; i += 1) {
          const tok = tokens[i]!;
          curr = Array.isArray(curr)
            ? curr[Number(tok)]
            : (curr as Record<string, unknown>)[tok];
        }
        const last = tokens[tokens.length - 1]!;
        if (Array.isArray(curr)) {
          curr[Number(last)] = step.value;
        } else if (curr && typeof curr === "object") {
          (curr as Record<string, unknown>)[last] = step.value;
        }
      }
      break;
    }
    case "delete": {
      model.delete(stepPath);
      break;
    }
    case "dispose": {
      model.dispose();
      break;
    }
    default:
      throw new Error(`Unknown data_model step op: ${step.op}`);
  }
}

function runDataModelCase(tc: ConformanceCase): void {
  const model = new DataModel(tc["initial"] ?? {});
  const watchPaths = (tc["watch"] as readonly string[] | undefined) ?? [];
  const watchers: WatcherRecord[] = watchPaths.map((watchPath) => {
    const rec: WatcherRecord = {
      path: watchPath,
      sub: undefined as unknown as ReturnType<DataModel["subscribe"]>,
      changeCount: 0,
    };
    (rec as { sub: ReturnType<DataModel["subscribe"]> }).sub = model.subscribe(
      watchPath,
      () => {
        rec.changeCount += 1;
      },
    );
    return rec;
  });

  const steps = (tc["steps"] as readonly DataModelStep[] | undefined) ?? [];
  const inputState = { lastSetValue: undefined as unknown };

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    for (const w of watchers) {
      w.changeCount = 0;
    }

    const expectErr = step.expect_error ?? step.expectError;
    if (expectErr) {
      let caught: unknown;
      try {
        applyDataModelStep(model, step, inputState);
      } catch (err) {
        caught = err;
      }
      if (caught === undefined) {
        throw new Error(
          `${tc.name} step ${i}: expected error (${expectErr.category ?? ""}) but succeeded`,
        );
      }
      assertMatchesExpectedError(caught, expectErr, `${tc.name} step ${i}`);
      continue;
    }

    applyDataModelStep(model, step, inputState);

    if (step.expect_notified !== undefined) {
      const notified: string[] = [];
      for (const w of watchers) {
        for (let c = 0; c < w.changeCount; c += 1) {
          notified.push(w.path);
        }
      }
      expect(notified.slice().sort()).toEqual(step.expect_notified.slice().sort());
    }

    if (step.expect_values !== undefined) {
      for (const [valPath, expectedVal] of Object.entries(step.expect_values)) {
        const watcher = watchers.find((w) => w.path === valPath);
        if (!watcher) {
          throw new Error(`${tc.name} step ${i}: unwatched expect_values path ${valPath}`);
        }
        expect(watcher.sub.value).toEqual(expectedVal);
      }
    }
  }

  if (tc["expect"] !== undefined) {
    expect(model.get("/")).toEqual(tc["expect"]);
  }
}

interface DataUpdateMessage {
  readonly version: string;
  readonly createSurface?: {
    readonly surfaceId: string;
    readonly catalogId?: string;
    readonly dataModel?: unknown;
  };
  readonly updateDataModel?: {
    readonly surfaceId: string;
    readonly path?: string;
    readonly value?: unknown;
  };
}

interface ValidateDataStep {
  readonly payload: readonly DataUpdateMessage[];
  readonly expectError?: ConformanceExpectError;
  readonly expect_error?: ConformanceExpectError;
}

function applyValidateDataMessages(
  surfaces: Map<string, DataModel>,
  messages: readonly DataUpdateMessage[],
): void {
  for (const msg of messages) {
    if (msg.createSurface) {
      surfaces.set(
        msg.createSurface.surfaceId,
        new DataModel(msg.createSurface.dataModel ?? {}),
      );
    } else if (msg.updateDataModel) {
      const surface = surfaces.get(msg.updateDataModel.surfaceId);
      if (!surface) {
        throw new Error(`Unknown surface "${msg.updateDataModel.surfaceId}"`);
      }
      surface.applyUpdate(msg.updateDataModel.path, msg.updateDataModel.value);
    } else {
      throw new Error(`Unsupported C1 data message: ${JSON.stringify(msg)}`);
    }
  }
}

function runValidateDataCase(tc: ConformanceCase): void {
  const surfaces = new Map<string, DataModel>();
  const steps = (tc["steps"] as readonly ValidateDataStep[] | undefined) ?? [];

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    const expectErr = step.expectError ?? step.expect_error;
    if (expectErr) {
      let caught: unknown;
      try {
        applyValidateDataMessages(surfaces, step.payload);
      } catch (err) {
        caught = err;
      }
      if (caught === undefined) {
        throw new Error(
          `${tc.name} step ${i}: expected error (${expectErr.category ?? ""}) but succeeded`,
        );
      }
      assertMatchesExpectedError(caught, expectErr, `${tc.name} step ${i}`);
      continue;
    }
    applyValidateDataMessages(surfaces, step.payload);
  }

  const expected = tc["expect"] as
    | { surfaces?: Record<string, { dataModel?: unknown }> }
    | undefined;
  if (expected?.surfaces) {
    for (const [surfaceId, surfaceSpec] of Object.entries(expected.surfaces)) {
      const surface = surfaces.get(surfaceId);
      if (!surface) {
        throw new Error(`${tc.name}: expected surface "${surfaceId}" not found`);
      }
      if (surfaceSpec.dataModel !== undefined) {
        expect(surface.get("/")).toEqual(surfaceSpec.dataModel);
      }
    }
  }
}

function runResolvePathCase(tc: ConformanceCase): void {
  const args = tc["args"] as {
    readonly path?: string;
    readonly contextPath?: string;
    readonly context_path?: string;
  };
  const targetPath = args.path ?? "";
  const contextPath = args.contextPath ?? args.context_path ?? "/";
  const ctx = new DataContext(new DataModel(), contextPath);
  const expectErr = (tc["expectError"] ?? tc["expect_error"]) as
    | ConformanceExpectError
    | undefined;

  if (expectErr) {
    let caught: unknown;
    try {
      ctx.resolvePath(targetPath);
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      throw new Error(`${tc.name}: expected resolve_path error but succeeded`);
    }
    assertMatchesExpectedError(caught, expectErr, tc.name);
    return;
  }

  const actual = ctx.resolvePath(targetPath);
  const expected = tc["expect"];
  if (typeof expected === "string") {
    expect(actual).toBe(expected);
  } else if (
    expected &&
    typeof expected === "object" &&
    "result" in expected
  ) {
    expect(actual).toBe((expected as { result: string }).result);
  } else {
    throw new Error(`${tc.name}: unexpected resolve_path expect shape`);
  }
}

describe("C1 conformance — data model & pointers", () => {
  let client: ConformanceClient;

  beforeAll(async () => {
    client = await ConformanceClient.create();
  });

  test("core/data_model.yaml passes all cases", async () => {
    const records = await client.runSuite(
      "core/data_model.yaml",
      runDataModelCase,
      SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(52);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("core/data_model_pointers.yaml passes all cases", async () => {
    const records = await client.runSuite(
      "core/data_model_pointers.yaml",
      runValidateDataCase,
      SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(7);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("core/data_deletion.yaml passes all cases", async () => {
    const records = await client.runSuite(
      "core/data_deletion.yaml",
      runValidateDataCase,
      SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(7);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("core/data_context.yaml passes all cases", async () => {
    const records = await client.runSuite(
      "core/data_context.yaml",
      runResolvePathCase,
      SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(11);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });
});
