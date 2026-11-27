import { describe, expect, test } from "nsh/test";
import * as entry from "./index";
import { A2UI_PROTOCOL_VERSION } from "./index";
import { BASIC_CATALOG_V1_ID } from "./core/catalog";
import { MessageProcessor } from "./core/processor";
import {
  A2uiStore,
  ReactiveComponentNode,
  SurfaceSignalStore,
} from "./store/surface_store";
import { ComponentRegistry } from "./renderer/registry";
import {
  BASIC_CATALOG_V1_RENDERERS,
  createBasicCatalogRegistry,
} from "./catalog/basic/index";
import {
  XLARGE_CATALOG_V1_ID,
  XLARGE_DRAWN_COMPONENTS,
  createXlargeRenderers,
} from "./catalog/xlarge/index";

/**
 * Every runtime (non-type) name `src/index.ts` re-exports, grouped by the
 * source module that owns it. Type-only exports are omitted: they have no
 * runtime value to check. A dropped or renamed export fails by name in the
 * first test, because this list is compared with the module namespace.
 */
const ENTRY_EXPORTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["index.ts", ["A2UI_PROTOCOL_VERSION"]],
  [
    "./core/pointer",
    [
      "A2uiDataError",
      "DEFAULT_POINTER_LIMITS",
      "ancestorPointers",
      "assertSafeSegment",
      "decodePointerSegment",
      "encodePointerSegment",
      "formatPointer",
      "isPrefixSegments",
      "parseArrayIndex",
      "parsePointer",
      "pathsOverlap",
      "resolvePath",
    ],
  ],
  ["./core/data_model", ["DataContext", "DataModel", "deepEqual"]],
  [
    "./core/expression",
    [
      "A2uiExpressionError",
      "A2uiValidationError",
      "COMPONENT_ENVELOPE_RESERVED_KEYS",
      "DEFAULT_EXPRESSION_LIMITS",
      "evaluateExpressionTemplate",
      "isCallExpression",
      "isDisallowedSingleAtKey",
      "isPathExpression",
      "isV1DataBinding",
      "isV1FunctionCall",
      "isValidFunctionCallName",
      "isValidUax31Identifier",
      "joinExpressionLiterals",
      "parseExpressionTemplate",
      "stringifyInterpolatedValue",
      "unescapeAtKey",
      "unescapeDynamicValue",
      "validateReservedKeysInComponent",
      "validateReservedKeysInDynamicValue",
    ],
  ],
  [
    "./core/json_schema",
    [
      "DEFAULT_MAX_SCHEMA_DEPTH",
      "isJsonObject",
      "resolveLocalRef",
      "validateJsonSchema",
    ],
  ],
  [
    "./core/catalog",
    [
      "AGENT_TO_RENDERER_V1_ID",
      "A2uiCatalogError",
      "A2uiIntegrityError",
      "A2uiRecursionError",
      "BASIC_CATALOG_V1_ID",
      "COMMON_TYPES_V1_ID",
      "Catalog",
      "CatalogRegistry",
      "JSON_SCHEMA_DRAFT_2020_12",
      "buildV10AgentToRendererSchema",
      "buildV10BasicCatalogDocument",
      "buildV10CommonTypesSchema",
      "extractChildReferences",
      "isSelfContainedSchema",
      "isV10ProtocolVersion",
      "validateCompositionConstraints",
      "validateCompositionEdge",
      "validateRootComposition",
      "validateV10CommonType",
    ],
  ],
  [
    "./core/validator",
    [
      "PERMISSIVE_VALIDATION",
      "PayloadValidator",
      "STRICT_VALIDATION",
      "SurfaceTopologyIndex",
      "resolveValidationConfig",
      "toRendererError",
      "validateJsonNestingDepth",
    ],
  ],
  ["./core/processor", ["MessageProcessor"]],
  [
    "./core/functions",
    [
      "A2uiFunctionError",
      "BASIC_V1_FUNCTIONS",
      "DEFAULT_FUNCTION_EVAL_LIMITS",
      "DEFAULT_LOCALE",
      "FunctionRegistry",
      "MAX_REGEX_PATTERN_CODE_POINTS",
      "MAX_REGEX_VALUE_CODE_POINTS",
      "SYSTEM_V1_FUNCTIONS",
      "analyzeRegex",
      "andFunction",
      "coerceDynamicBoolean",
      "compileSafeRegex",
      "countCodePoints",
      "emailFunction",
      "evaluateCheckRules",
      "evaluateComponentChecks",
      "evaluateDynamicValue",
      "evaluateEmail",
      "evaluateFunctionCall",
      "evaluateLength",
      "evaluateNumeric",
      "evaluatePluralize",
      "evaluateRegex",
      "evaluateRequired",
      "evaluateSurfaceComponents",
      "formatCurrencyFunction",
      "formatDateFunction",
      "formatLocalizedCurrency",
      "formatLocalizedNumber",
      "formatNumberFunction",
      "formatStringFunction",
      "formatTr35Date",
      "getCurrencyDefaultDecimals",
      "getCurrencySymbol",
      "getLocaleDateNames",
      "getLocaleNumberProfile",
      "indexFunction",
      "isValidationResult",
      "lengthFunction",
      "normalizeCheckRuleResult",
      "notFunction",
      "numericFunction",
      "openUrlFunction",
      "orFunction",
      "parseStrictTimestamp",
      "pluralizeFunction",
      "regexFunction",
      "requiredFunction",
      "resolveLocaleTag",
      "selectPluralCategory",
      "validateSafeUrl",
    ],
  ],
  [
    "./core/rpc",
    [
      "A2uiRpcError",
      "DEFAULT_RPC_LIMITS",
      "ReactiveCheckEvaluation",
      "ReactiveEvaluation",
      "RpcManager",
      "applySchemaDefaults",
      "canonicalCallKey",
      "canonicalJson",
      "evaluateImperativeFunctionCall",
      "evaluateImperativeValue",
      "hasNonJsonNumber",
      "parseAndValidateFunctionArgs",
    ],
  ],
  [
    "./core/actions",
    ["deriveCollectionIndicesFromScope", "dispatchAction", "validateActionMetadata"],
  ],
  [
    "./core/resolver",
    [
      "MutableComponentNode",
      "NodeResolver",
      "PLACEHOLDER_TYPE",
      "ResolvedBinding",
      "WritableBinding",
      "isComponentNode",
      "isWritable",
      "sameBinding",
    ],
  ],
  [
    "./store/surface_store",
    ["A2uiStore", "ReactiveComponentNode", "SurfaceSignalStore"],
  ],
  [
    "./renderer/accessibility",
    [
      "buildAccessibilitySnapshot",
      "buildViewAccessibilityProps",
      "liveRegionReadingFor",
      "mapAndroidLiveRegion",
      "mapNativeLiveRegion",
      "needsAccessibilityWrapper",
      "normalizeAccessibility",
      "resolveEffectiveHidden",
      "resolveEffectiveLabel",
      "resolveEffectiveRole",
      "useLiveRegionAnnouncement",
    ],
  ],
  [
    "./renderer/A2uiSurface",
    [
      "A2uiNode",
      "A2uiSurface",
      "ComponentRegistry",
      "buildNodeTestId",
      "unwrapBinding",
      "unwrapBoolean",
      "unwrapNumber",
      "unwrapOptionalString",
      "unwrapString",
      "weightStyle",
    ],
  ],
  [
    "./catalog/basic",
    [
      "BASIC_CATALOG_V1_RENDERERS",
      "BASIC_ICON_NAME_LIST",
      "BASIC_ICON_PATHS",
      "BasicAudioPlayer",
      "BasicButton",
      "BasicCard",
      "BasicCheckBox",
      "BasicChoicePicker",
      "BasicColumn",
      "BasicDateTimeInput",
      "BasicDivider",
      "BasicIcon",
      "BasicImage",
      "BasicList",
      "BasicModal",
      "BasicRow",
      "BasicSlider",
      "BasicTabs",
      "BasicText",
      "BasicTextField",
      "BasicVideo",
      "FALLBACK_ICON_PATH",
      "MAX_SVG_PATH_LENGTH",
      "ModalTriggerContext",
      "ValidationFeedback",
      "applyDateTimeEdit",
      "clampAndSnapSliderValue",
      "clampTimeToBounds",
      "classifyAudioError",
      "createBasicCatalogRegistry",
      "extractCheckableState",
      "extractChildNodes",
      "extractChoiceOptions",
      "extractIsoDatePart",
      "extractIsoTimePart",
      "extractTabItems",
      "formatAudioTime",
      "formatSliderDisplayValue",
      "getLocalIsoDate",
      "isValidSvgPath",
      "mapAlign",
      "mapJustify",
      "normalizeSelectedValues",
      "parseA2uiMarkdown",
      "registerBasicCatalogComponents",
      "resolveDateTimeFlags",
      "resolveEffectiveTimeBounds",
      "resolveIconSvgPath",
      "resolveSliderBounds",
      "resolveSliderStep",
      "resolveVideoPresentationState",
      "sanitizeMediaUrl",
      "writeBinding",
    ],
  ],
  [
    "./catalog/xlarge",
    [
      "XLARGE_CATALOG_V1_ID",
      "XLARGE_DRAWN_COMPONENTS",
      "collectFieldSpecs",
      "createXlargeRenderers",
      "registerXlargeCatalogComponents",
    ],
  ],
];

const RUNTIME_EXPORT_NAMES = ENTRY_EXPORTS.flatMap(([, names]) => names);

/** The 18 Basic Catalog v1 component types, sorted. */
const BASIC_COMPONENTS = [
  "AudioPlayer",
  "Button",
  "Card",
  "CheckBox",
  "ChoicePicker",
  "Column",
  "DateTimeInput",
  "Divider",
  "Icon",
  "Image",
  "List",
  "Modal",
  "Row",
  "Slider",
  "Tabs",
  "Text",
  "TextField",
  "Video",
].sort();

/** The 22 components of the xlarge `tech.yerly.xlarge/v1` catalog, sorted. */
const XLARGE_COMPONENTS = [
  "Card",
  "Field",
  "Form",
  "Table",
  "Text",
  "Toast",
  "Refusal",
  "Image",
  "QrCode",
  "Button",
  "Confirm",
  "Preview",
  "Columns",
  "Detail",
  "Metric",
  "ChequeLeaf",
  "Wizard",
  "Steps",
  "Arrange",
  "Chart",
  "Calendar",
  "Conversation",
].sort();

describe("a2ui-nsh", () => {
  test("exports protocol version 1.0", () => {
    expect(A2UI_PROTOCOL_VERSION).toBe("1.0");
  });
});

describe("public entry point exports", () => {
  test("exports exactly the listed runtime names, each defined", () => {
    const runtime = entry as unknown as Record<string, unknown>;
    const missing = RUNTIME_EXPORT_NAMES.filter(
      (name) => runtime[name] === undefined,
    );
    const unexpected = Object.keys(entry).filter(
      (name) => !RUNTIME_EXPORT_NAMES.includes(name),
    );

    expect(missing).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(Object.keys(entry).sort()).toEqual([...RUNTIME_EXPORT_NAMES].sort());
  });

  test("re-exports the same objects as the source modules, never wrappers", () => {
    expect(entry.MessageProcessor).toBe(MessageProcessor);
    expect(entry.A2uiStore).toBe(A2uiStore);
    expect(entry.SurfaceSignalStore).toBe(SurfaceSignalStore);
    expect(entry.ReactiveComponentNode).toBe(ReactiveComponentNode);
    expect(entry.ComponentRegistry).toBe(ComponentRegistry);
    expect(entry.BASIC_CATALOG_V1_RENDERERS).toBe(BASIC_CATALOG_V1_RENDERERS);
    expect(entry.createBasicCatalogRegistry).toBe(createBasicCatalogRegistry);
    expect(entry.XLARGE_DRAWN_COMPONENTS).toBe(XLARGE_DRAWN_COMPONENTS);
    expect(entry.XLARGE_CATALOG_V1_ID).toBe(XLARGE_CATALOG_V1_ID);
    expect(entry.createXlargeRenderers).toBe(createXlargeRenderers);
  });

  test("names exactly the 18 Basic Catalog v1 components under the Basic Catalog id", () => {
    expect(BASIC_CATALOG_V1_ID).toBe(
      "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
    );
    expect(entry.BASIC_CATALOG_V1_ID).toBe(BASIC_CATALOG_V1_ID);
    expect([...Object.keys(BASIC_CATALOG_V1_RENDERERS)].sort()).toEqual(
      BASIC_COMPONENTS,
    );
    expect(BASIC_COMPONENTS).toHaveLength(18);
  });

  test("names exactly the 22 xlarge components under tech.yerly.xlarge/v1", () => {
    expect(XLARGE_CATALOG_V1_ID).toBe("tech.yerly.xlarge/v1");
    expect(entry.XLARGE_CATALOG_V1_ID).toBe(XLARGE_CATALOG_V1_ID);
    expect([...XLARGE_DRAWN_COMPONENTS].sort()).toEqual(XLARGE_COMPONENTS);
    expect(XLARGE_COMPONENTS).toHaveLength(22);
  });

  test("exports every name the ERP demo and target app import from src/index", () => {
    // examples/erp-customers/ErpCustomersApp.tsx,
    // examples/erp-customers/agent.test.ts, tests/targets/App.tsx.
    // (agent.test.ts also imports the type-only `DispatchedActionEnvelope`,
    // which has no runtime value to check.)
    const consumerImports = [
      "A2uiStore",
      "A2uiSurface",
      "BASIC_CATALOG_V1_ID",
      "Catalog",
      "MessageProcessor",
      "buildV10BasicCatalogDocument",
      "createBasicCatalogRegistry",
      "registerXlargeCatalogComponents",
    ];
    const missing = consumerImports.filter(
      (name) => !RUNTIME_EXPORT_NAMES.includes(name),
    );

    expect(missing).toEqual([]);
    for (const name of consumerImports) {
      expect((entry as unknown as Record<string, unknown>)[name]).toBeDefined();
    }
  });
});
