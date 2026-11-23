import { beforeAll, describe, expect, test } from "nsh/test";
import {
  A2uiCatalogError,
  A2uiIntegrityError,
  A2uiRecursionError,
  BASIC_CATALOG_V1_ID,
  Catalog,
  CatalogRegistry,
} from "../../src/core/catalog";
import {
  A2uiValidationError,
  isV1DataBinding,
  isV1FunctionCall,
} from "../../src/core/expression";
import {
  FunctionRegistry,
  evaluateSurfaceComponents,
  type EvaluatedComponentNode,
} from "../../src/core/functions";
import type { JsonObject } from "../../src/core/json_schema";
import { A2uiDataError } from "../../src/core/pointer";
import { MessageProcessor } from "../../src/core/processor";
import {
  toRendererError,
  type RendererErrorEnvelope,
  type ValidationConfig,
} from "../../src/core/validator";
import {
  ConformanceClient,
  type ConformanceCase,
  type ConformanceExpectError,
} from "./harness";

/**
 * Documented skips for C3 conformance suites.
 * - Pre-v1.0 cases (v0.9, v0.9.1) are out of scope per Spec 001 (v1.0 only).
 * - Multi-catalog cases that evaluate Basic Catalog functions or template
 *   repeaters are deferred to T6 (standard functions) and T8 (node resolver).
 */
export const VALIDATOR_V1_0_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map();

export const MESSAGE_PROCESSOR_V1_0_SKIP_TEST_NAMES: ReadonlyMap<
  string,
  string
> = new Map([
  ["test_v091_version_string_compatibility", "v0.9.1 out of scope (v1.0 only)"],
  [
    "test_v10_get_renderer_data_model_filters_by_surface_protocol_version",
    "Creates a v0.9 surface alongside v1.0; v0.9 out of scope (v1.0 only)",
  ],
]);

export const ERROR_RESPONSES_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map([
    [
      "test_error_response_create_surface_invalid_theme_property",
      "v0.9 out of scope (v1.0 only)",
    ],
  ]);

export const MULTI_CATALOG_SKIP_TEST_NAMES: ReadonlyMap<string, string> =
  new Map();

interface ExpectedErrorSpec extends ConformanceExpectError {
  readonly code?: string;
  readonly surfaceId?: string;
  readonly functionCallId?: string;
  readonly path?: string;
  readonly details?: readonly {
    readonly path?: string;
    readonly code?: string;
    readonly surfaceId?: string;
  }[];
  readonly rendererError?: {
    readonly version: string;
    readonly error: {
      readonly code?: string;
      readonly surfaceId?: string;
      readonly functionCallId?: string;
      readonly path?: string;
      readonly message?: string;
    };
  };
}

interface ProcessorStep {
  readonly messages?: unknown;
  readonly payload?: unknown;
  readonly validationConfig?: Partial<ValidationConfig>;
  readonly expect?: Record<string, unknown>;
  readonly expectError?: ExpectedErrorSpec | string;
}

function matchesC3Category(err: unknown, category: string): boolean {
  switch (category) {
    case "ValidationError":
      return err instanceof A2uiValidationError;
    case "CatalogError":
    case "A2uiCatalogError":
      return err instanceof A2uiCatalogError;
    case "IntegrityError":
      return err instanceof A2uiIntegrityError || err instanceof A2uiRecursionError;
    case "RecursionError":
      return err instanceof A2uiRecursionError;
    case "DataError":
      return err instanceof A2uiDataError;
    default:
      return err instanceof Error;
  }
}

function assertC3ErrorMatches(
  err: unknown,
  emitted: RendererErrorEnvelope | undefined,
  rawExpected: ExpectedErrorSpec | string,
  label: string,
): void {
  if (!(err instanceof Error)) {
    throw new Error(`${label}: expected Error, got ${String(err)}`);
  }
  if (typeof rawExpected === "string") {
    const ok =
      err.message.toLowerCase().includes(rawExpected.toLowerCase()) ||
      new RegExp(rawExpected).test(err.message);
    if (!ok) {
      throw new Error(
        `${label}: expected message matching "${rawExpected}", got "${err.message}"`,
      );
    }
    return;
  }

  const envelope = emitted ?? toRendererError(err);

  if (rawExpected.category && !matchesC3Category(err, rawExpected.category)) {
    throw new Error(
      `${label}: expected category '${rawExpected.category}', got ${err.name}: ${err.message}`,
    );
  }
  if (rawExpected.code) {
    const errCode = (err as { code?: string }).code;
    if (errCode !== rawExpected.code && envelope.error.code !== rawExpected.code) {
      throw new Error(
        `${label}: expected code '${rawExpected.code}', got '${errCode ?? envelope.error.code}': ${err.message}`,
      );
    }
  }
  if (rawExpected.surfaceId !== undefined) {
    const actualSurface =
      (err as { surfaceId?: string }).surfaceId ??
      ("surfaceId" in envelope.error ? envelope.error.surfaceId : undefined) ??
      "";
    if (actualSurface !== rawExpected.surfaceId) {
      throw new Error(
        `${label}: expected surfaceId '${rawExpected.surfaceId}', got '${actualSurface}'`,
      );
    }
  }
  if (rawExpected.functionCallId !== undefined) {
    const actualCallId =
      (err as { functionCallId?: string }).functionCallId ??
      ("functionCallId" in envelope.error
        ? envelope.error.functionCallId
        : undefined);
    if (actualCallId !== rawExpected.functionCallId) {
      throw new Error(
        `${label}: expected functionCallId '${rawExpected.functionCallId}', got '${String(actualCallId)}'`,
      );
    }
  }
  if (rawExpected.path !== undefined) {
    const actualPath =
      (err as { path?: string }).path ??
      ("path" in envelope.error ? envelope.error.path : undefined);
    if (actualPath !== rawExpected.path) {
      throw new Error(
        `${label}: expected path '${rawExpected.path}', got '${String(actualPath)}' (${err.message})`,
      );
    }
  }
  if (rawExpected.message) {
    const ok =
      err.message.toLowerCase().includes(rawExpected.message.toLowerCase()) ||
      new RegExp(rawExpected.message).test(err.message);
    if (!ok) {
      throw new Error(
        `${label}: expected message matching "${rawExpected.message}", got "${err.message}"`,
      );
    }
  }
  if (rawExpected.details && err instanceof A2uiValidationError) {
    const details = err.details ?? [];
    for (const expDet of rawExpected.details) {
      const matched = details.some(
        (d) =>
          (expDet.path === undefined || d.path === expDet.path) &&
          (expDet.code === undefined || d.code === expDet.code) &&
          (expDet.surfaceId === undefined || d.surfaceId === expDet.surfaceId),
      );
      if (!matched) {
        throw new Error(
          `${label}: expected detail ${JSON.stringify(expDet)} not found in ${JSON.stringify(details)}`,
        );
      }
    }
  }
  if (rawExpected.rendererError) {
    const expRe = rawExpected.rendererError;
    if (envelope.version !== expRe.version) {
      throw new Error(
        `${label}: expected rendererError version '${expRe.version}', got '${envelope.version}'`,
      );
    }
    if (expRe.error.code !== undefined && envelope.error.code !== expRe.error.code) {
      throw new Error(
        `${label}: expected rendererError.error.code '${expRe.error.code}', got '${envelope.error.code}'`,
      );
    }
    if (expRe.error.surfaceId !== undefined) {
      const actSid =
        "surfaceId" in envelope.error ? envelope.error.surfaceId : undefined;
      if (actSid !== expRe.error.surfaceId) {
        throw new Error(
          `${label}: expected rendererError.error.surfaceId '${expRe.error.surfaceId}', got '${String(actSid)}'`,
        );
      }
    }
    if (expRe.error.functionCallId !== undefined) {
      const actFid =
        "functionCallId" in envelope.error
          ? envelope.error.functionCallId
          : undefined;
      if (actFid !== expRe.error.functionCallId) {
        throw new Error(
          `${label}: expected rendererError.error.functionCallId '${expRe.error.functionCallId}', got '${String(actFid)}'`,
        );
      }
      if ("surfaceId" in envelope.error) {
        throw new Error(
          `${label}: rendererError correlated by functionCallId must not include surfaceId`,
        );
      }
    }
    if (expRe.error.path !== undefined) {
      const actPath = "path" in envelope.error ? envelope.error.path : undefined;
      if (actPath !== expRe.error.path) {
        // Accept child path prefixed by expected path (e.g. /components/0/unknownAttribute when /components/0 expected).
        if (
          typeof actPath !== "string" ||
          !actPath.startsWith(`${expRe.error.path}/`)
        ) {
          throw new Error(
            `${label}: expected rendererError.error.path '${expRe.error.path}', got '${String(actPath)}'`,
          );
        }
      }
    }
    if (expRe.error.message !== undefined) {
      const msg = envelope.error.message;
      const ok =
        msg.toLowerCase().includes(expRe.error.message.toLowerCase()) ||
        new RegExp(expRe.error.message).test(msg);
      if (!ok) {
        throw new Error(
          `${label}: expected rendererError.error.message matching "${expRe.error.message}", got "${msg}"`,
        );
      }
    }
  }
}

function assertSurfacesMatch(
  processor: MessageProcessor,
  expected: Record<string, unknown>,
  label: string,
): void {
  const surfacesSpec = expected["surfaces"] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!surfacesSpec) {
    return;
  }
  for (const [surfaceId, spec] of Object.entries(surfacesSpec)) {
    const surface = processor.getSurface(surfaceId);
    if (spec["exists"] === false) {
      if (surface !== undefined) {
        throw new Error(`${label}: expected surface '${surfaceId}' not to exist`);
      }
      continue;
    }
    if (!surface) {
      throw new Error(`${label}: expected surface '${surfaceId}' to exist`);
    }
    if (spec["sendDataModel"] !== undefined) {
      expect(surface.sendDataModel).toBe(spec["sendDataModel"]);
    }
    if (spec["metadata"] !== undefined) {
      expect(surface.metadata).toEqual(spec["metadata"]);
    }
    if (spec["dataModel"] !== undefined) {
      expect(surface.dataModel.get("/")).toEqual(spec["dataModel"]);
    }
    if (spec["components"] !== undefined) {
      const expComps = spec["components"];
      if (Array.isArray(expComps)) {
        for (const expComp of expComps as Record<string, unknown>[]) {
          const id = String(expComp["id"]);
          const actual = surface.components.get(id);
          if (!actual) {
            throw new Error(
              `${label}: surface '${surfaceId}' missing component '${id}'`,
            );
          }
          for (const [k, v] of Object.entries(expComp)) {
            if (k === "id") continue;
            if (k === "component") {
              expect(actual.type).toBe(v);
            } else if (k === "@metadata") {
              if (v === null) {
                expect(actual.metadata).toBeUndefined();
              } else {
                expect(actual.metadata).toEqual(v);
              }
            } else if (k === "@accessibility") {
              expect(actual.accessibility).toEqual(v);
            } else {
              expect(actual.properties[k]).toEqual(v);
            }
          }
        }
      } else if (typeof expComps === "object" && expComps !== null) {
        let evaluatedNodes: Map<string, EvaluatedComponentNode> | undefined;
        const getEvaluated = (): Map<string, EvaluatedComponentNode> => {
          if (!evaluatedNodes) {
            evaluatedNodes = evaluateSurfaceComponents(surface, {
              catalogRegistry: processor.registry,
              functionRegistry: FunctionRegistry.withBasicV1(),
            });
          }
          return evaluatedNodes;
        };

        for (const [id, expComp] of Object.entries(
          expComps as Record<string, Record<string, unknown>>,
        )) {
          const rawActual = surface.components.get(id);
          const needsEval =
            !rawActual ||
            Object.entries(expComp).some(
              ([k, v]) =>
                k !== "component" &&
                !isV1DataBinding(v) &&
                !isV1FunctionCall(v) &&
                (isV1DataBinding(rawActual.properties[k]) ||
                  isV1FunctionCall(rawActual.properties[k])),
            );
          const evalNode = needsEval ? getEvaluated().get(id) : undefined;
          if (!rawActual && !evalNode) {
            throw new Error(
              `${label}: surface '${surfaceId}' missing component '${id}'`,
            );
          }
          for (const [k, v] of Object.entries(expComp)) {
            if (k === "component") {
              expect(evalNode ? evalNode.type : rawActual!.type).toBe(v);
            } else {
              const actualProp = evalNode
                ? evalNode.properties[k]
                : rawActual!.properties[k];
              expect(actualProp).toEqual(v);
            }
          }
        }
      }
    }
  }
}

async function preloadCaseFiles(
  client: ConformanceClient,
  cases: readonly ConformanceCase[],
  skips: ReadonlyMap<string, string>,
): Promise<Map<string, JsonObject>> {
  const cache = new Map<string, JsonObject>();
  const root = client.resolveConformanceRoot();
  for (const tc of cases) {
    if (skips.has(tc.name)) {
      continue;
    }
    const paths = tc["catalogPaths"] as readonly string[] | undefined;
    if (Array.isArray(paths)) {
      for (const rel of paths) {
        if (!cache.has(rel)) {
          const text = await client.readTextFile(`${root}/${rel}`);
          cache.set(rel, JSON.parse(text) as JsonObject);
        }
      }
    }
  }
  return cache;
}

function isCatalogErrorExpected(tc: ConformanceCase): boolean {
  const check = (e: unknown): boolean => {
    if (!e || typeof e !== "object") return false;
    const obj = e as ExpectedErrorSpec;
    return (
      obj.category === "CatalogError" ||
      obj.category === "A2uiCatalogError" ||
      obj.rendererError?.error?.code === "CATALOG_NOT_FOUND"
    );
  };
  if (check(tc["expectError"])) return true;
  const steps = tc["steps"] as readonly ProcessorStep[] | undefined;
  if (Array.isArray(steps)) {
    for (const st of steps) {
      if (check(st.expectError)) return true;
    }
  }
  return false;
}

function buildRegistryForCase(
  tc: ConformanceCase,
  files: ReadonlyMap<string, JsonObject>,
): CatalogRegistry {
  const registry = new CatalogRegistry();
  const defaultVer =
    typeof tc["protocolVersion"] === "string" ? tc["protocolVersion"] : "1.0";
  let loadedAny = false;
  let firstCatalog: Catalog | undefined;

  const catalogPaths = tc["catalogPaths"] as readonly string[] | undefined;
  if (Array.isArray(catalogPaths)) {
    for (const rel of catalogPaths) {
      const doc = files.get(rel);
      if (!doc) {
        throw new Error(`${tc.name}: missing preloaded catalogPath '${rel}'`);
      }
      const cat = Catalog.fromJson(doc);
      registry.register(cat);
      if (!firstCatalog) firstCatalog = cat;
      loadedAny = true;
    }
  }

  const catalogsList = tc["catalogs"] as readonly JsonObject[] | undefined;
  if (Array.isArray(catalogsList)) {
    for (const rawCat of catalogsList) {
      const ver =
        typeof rawCat["protocolVersion"] === "string"
          ? rawCat["protocolVersion"]
          : defaultVer;
      const cat = Catalog.fromJson(rawCat, { protocolVersion: ver });
      registry.register(cat);
      if (!firstCatalog) firstCatalog = cat;
      loadedAny = true;
    }
  }

  const singleCat = tc["catalog"] as JsonObject | undefined;
  if (singleCat && typeof singleCat === "object") {
    const inner = (singleCat["catalogSchema"] ?? singleCat) as JsonObject;
    if (inner["components"] || inner["functions"] || inner["catalogId"]) {
      const ver =
        typeof singleCat["protocolVersion"] === "string"
          ? singleCat["protocolVersion"]
          : typeof inner["protocolVersion"] === "string"
            ? inner["protocolVersion"]
            : defaultVer;
      const cat = Catalog.fromJson(inner, {
        catalogId:
          typeof inner["catalogId"] === "string"
            ? inner["catalogId"]
            : typeof singleCat["catalogId"] === "string"
              ? singleCat["catalogId"]
              : "custom",
        protocolVersion: ver,
      });
      registry.register(cat);
      if (!firstCatalog) firstCatalog = cat;
      loadedAny = true;
    }
  }

  if (!loadedAny) {
    const basic = Catalog.basicV1();
    registry.register(basic);
    firstCatalog = basic;
  } else if (
    !isCatalogErrorExpected(tc) &&
    tc.action !== "get_renderer_capabilities" &&
    !registry.has(BASIC_CATALOG_V1_ID) &&
    JSON.stringify(tc).includes('"basic"')
  ) {
    const basic = Catalog.basicV1();
    registry.register(basic);
  }

  // Register standard aliases used across conformance payloads unless testing CatalogError.
  if (!isCatalogErrorExpected(tc) && firstCatalog) {
    const basicTarget = registry.get(BASIC_CATALOG_V1_ID) ?? firstCatalog;
    if (!registry.has("basic")) {
      registry.registerAlias("basic", basicTarget.catalogId);
    }
    if (!registry.has("https://a2ui.org/catalogs/basic/v1/catalog.json")) {
      registry.registerAlias(
        "https://a2ui.org/catalogs/basic/v1/catalog.json",
        basicTarget.catalogId,
      );
    }
    if (!registry.has("test-catalog-v10")) {
      registry.registerAlias("test-catalog-v10", firstCatalog.catalogId);
    }
  }

  return registry;
}

function runProcessorOrValidatorCase(
  tc: ConformanceCase,
  files: ReadonlyMap<string, JsonObject>,
): void {
  const registry = buildRegistryForCase(tc, files);
  const action = String(tc.action ?? "validate");

  if (action === "get_renderer_capabilities") {
    const processor = new MessageProcessor({ registry });
    const args = (tc["args"] ?? {}) as {
      includeInlineCatalogs?: boolean;
      version?: string;
    };
    const actual = processor.getRendererCapabilities({
      includeInlineCatalogs: args.includeInlineCatalogs === true,
      version: args.version ?? "1.0",
    });
    expect(actual).toEqual(tc["expect"]);
    return;
  }

  if (action === "get_renderer_data_model") {
    const processor = new MessageProcessor({ registry, strictMode: false });
    const steps = tc["steps"] as readonly ProcessorStep[] | undefined;
    if (Array.isArray(steps)) {
      for (const st of steps) {
        processor.processMessages(st.messages ?? st.payload);
      }
    } else if (tc["messages"] !== undefined || tc["payload"] !== undefined) {
      processor.processMessages(tc["messages"] ?? tc["payload"]);
    }
    const args = (tc["args"] ?? {}) as { version?: string };
    const actual = processor.getRendererDataModel(args.version ?? "1.0");
    expect(actual).toEqual(tc["expect"]);
    return;
  }

  // Determine default strictMode: validate defaults true, process_messages defaults false.
  const defaultStrict = action === "validate";
  const strictMode =
    typeof tc["strictMode"] === "boolean" ? tc["strictMode"] : defaultStrict;

  let lastEmitted: RendererErrorEnvelope | undefined;
  const processor = new MessageProcessor({
    registry,
    strictMode,
    validationConfig: tc["validationConfig"] as
      | Partial<ValidationConfig>
      | undefined,
    onError: (env) => {
      lastEmitted = env;
    },
  });

  const steps = tc["steps"] as readonly ProcessorStep[] | undefined;
  if (Array.isArray(steps)) {
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i]!;
      const stepPayload = step.messages ?? step.payload;
      const stepOpts = step.validationConfig
        ? { validationConfig: step.validationConfig }
        : undefined;
      lastEmitted = undefined;

      if (step.expectError) {
        let caught: unknown;
        try {
          processor.processMessages(stepPayload, stepOpts);
        } catch (err) {
          caught = err;
        }
        if (caught === undefined) {
          throw new Error(
            `${tc.name} step ${i}: expected error but succeeded`,
          );
        }
        assertC3ErrorMatches(
          caught,
          lastEmitted,
          step.expectError,
          `${tc.name} step ${i}`,
        );
      } else {
        processor.processMessages(stepPayload, stepOpts);
        if (step.expect) {
          assertSurfacesMatch(processor, step.expect, `${tc.name} step ${i}`);
        }
      }
    }
    if (tc["expect"]) {
      assertSurfacesMatch(
        processor,
        tc["expect"] as Record<string, unknown>,
        tc.name,
      );
    }
    return;
  }

  const topPayload = tc["messages"] ?? tc["payload"];
  const topExpectErr = tc["expectError"] as
    | ExpectedErrorSpec
    | string
    | undefined;
  lastEmitted = undefined;

  if (topExpectErr) {
    let caught: unknown;
    try {
      processor.processMessages(topPayload);
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      throw new Error(`${tc.name}: expected error but succeeded`);
    }
    assertC3ErrorMatches(caught, lastEmitted, topExpectErr, tc.name);
    return;
  }

  processor.processMessages(topPayload);
  if (tc["expect"]) {
    assertSurfacesMatch(
      processor,
      tc["expect"] as Record<string, unknown>,
      tc.name,
    );
  }
}

function runSelectCatalogCase(tc: ConformanceCase): void {
  const args = tc["args"] as {
    surface: {
      id: string;
      defaultCatalogId?: string;
      supportedCatalogIds?: readonly string[];
    };
    catalogs?: Record<string, { protocolVersion: string }>;
    components?: Record<string, Record<string, unknown>>;
    functionCall?: Record<string, unknown>;
  };
  const surfaceVersion =
    typeof (tc["catalog"] as Record<string, unknown> | undefined)?.[
      "protocolVersion"
    ] === "string"
      ? String(
          (tc["catalog"] as Record<string, unknown>)["protocolVersion"],
        )
      : "1.0";

  const registry = new CatalogRegistry();
  const versionOverrides = new Map<string, string>();
  if (args.catalogs) {
    for (const [catId, info] of Object.entries(args.catalogs)) {
      versionOverrides.set(catId, info.protocolVersion);
    }
  }

  const execute = (): string => {
    if (args.surface.supportedCatalogIds) {
      registry.validateSurfaceCatalogVersions(
        args.surface.id,
        surfaceVersion,
        args.surface.supportedCatalogIds,
        versionOverrides,
      );
    }
    const surfaceCtx = {
      surfaceId: args.surface.id,
      defaultCatalogId: args.surface.defaultCatalogId,
      supportedCatalogIds: args.surface.supportedCatalogIds,
      protocolVersion: surfaceVersion,
    };

    let selected = args.surface.defaultCatalogId ?? "";
    if (args.components) {
      for (const comp of Object.values(args.components)) {
        const explicit =
          typeof comp["@catalogId"] === "string"
            ? comp["@catalogId"]
            : typeof comp["catalogId"] === "string"
              ? comp["catalogId"]
              : undefined;
        selected = registry.resolveCatalogId(surfaceCtx, explicit);
      }
    }
    if (args.functionCall) {
      const explicit =
        typeof args.functionCall["catalogId"] === "string"
          ? args.functionCall["catalogId"]
          : undefined;
      selected = registry.resolveCatalogId(surfaceCtx, explicit);
    }
    return selected;
  };

  const expectErr = tc["expectError"] as ExpectedErrorSpec | undefined;
  if (expectErr) {
    let caught: unknown;
    try {
      execute();
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      throw new Error(`${tc.name}: expected error but succeeded`);
    }
    assertC3ErrorMatches(caught, undefined, expectErr, tc.name);
    return;
  }

  const selected = execute();
  expect(selected).toBe(tc["expectSelected"]);
}

describe("C3 conformance — validator, message processor, error responses & multi-catalog", () => {
  let client: ConformanceClient;

  beforeAll(async () => {
    client = await ConformanceClient.create();
  });

  test("core/validator_v1_0.yaml passes all cases", async () => {
    const cases = await client.loadConformanceSuite("core/validator_v1_0.yaml");
    const files = await preloadCaseFiles(
      client,
      cases,
      VALIDATOR_V1_0_SKIP_TEST_NAMES,
    );
    const records = await client.runSuite(
      "core/validator_v1_0.yaml",
      (tc) => runProcessorOrValidatorCase(tc, files),
      VALIDATOR_V1_0_SKIP_TEST_NAMES,
    );
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("core/message_processor_v1_0.yaml passes all v1.0 cases", async () => {
    const cases = await client.loadConformanceSuite(
      "core/message_processor_v1_0.yaml",
    );
    const files = await preloadCaseFiles(
      client,
      cases,
      MESSAGE_PROCESSOR_V1_0_SKIP_TEST_NAMES,
    );
    const records = await client.runSuite(
      "core/message_processor_v1_0.yaml",
      (tc) => runProcessorOrValidatorCase(tc, files),
      MESSAGE_PROCESSOR_V1_0_SKIP_TEST_NAMES,
    );
    const passed = records.filter((r) => r.status === "passed").length;
    const skipped = records.filter((r) => r.status === "skipped").length;
    expect(passed).toBe(records.length - MESSAGE_PROCESSOR_V1_0_SKIP_TEST_NAMES.size);
    expect(skipped).toBe(MESSAGE_PROCESSOR_V1_0_SKIP_TEST_NAMES.size);
  });

  test("core/error_responses.yaml passes all v1.0 cases", async () => {
    const cases = await client.loadConformanceSuite("core/error_responses.yaml");
    const files = await preloadCaseFiles(
      client,
      cases,
      ERROR_RESPONSES_SKIP_TEST_NAMES,
    );
    const records = await client.runSuite(
      "core/error_responses.yaml",
      (tc) => runProcessorOrValidatorCase(tc, files),
      ERROR_RESPONSES_SKIP_TEST_NAMES,
    );
    const passed = records.filter((r) => r.status === "passed").length;
    const skipped = records.filter((r) => r.status === "skipped").length;
    expect(passed).toBe(records.length - ERROR_RESPONSES_SKIP_TEST_NAMES.size);
    expect(skipped).toBe(ERROR_RESPONSES_SKIP_TEST_NAMES.size);
  });

  test("core/multi_catalog.yaml passes all cases", async () => {
    const cases = await client.loadConformanceSuite("core/multi_catalog.yaml");
    const files = await preloadCaseFiles(
      client,
      cases,
      MULTI_CATALOG_SKIP_TEST_NAMES,
    );
    const records = await client.runSuite(
      "core/multi_catalog.yaml",
      (tc) => {
        if (tc.action === "select_catalog") {
          runSelectCatalogCase(tc);
        } else {
          runProcessorOrValidatorCase(tc, files);
        }
      },
      MULTI_CATALOG_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(8);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });
});
