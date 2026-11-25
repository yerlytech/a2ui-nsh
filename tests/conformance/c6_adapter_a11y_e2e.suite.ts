/**
 * Stage C6 conformance runner against upstream `google-A2UI`:
 * - `conformance/core/adapter_conformance.yaml`
 * - `conformance/core/accessibility.yaml`
 * - `conformance/adapter/markdown_subset.yaml`
 * - `conformance/e2e/*.yaml` (renderer half, protocol version 1.0)
 *
 * Mounts real `<A2uiSurface>` trees via `tests/conformance/AdapterApp.tsx` on
 * Native Shell (`nsh 0.7.0`), drives interactions through `nsh/test` (`app.type`,
 * `app.clear`, `app.press`), validates every outbound envelope against upstream
 * `specification/v1_0/json/renderer_to_agent.json`, and writes executed-case
 * manifest records to `A2UI_CONFORMANCE_MANIFEST`.
 */

import { beforeAll, describe, expect, open, test, type App } from "nsh/test";
import { buildV10CommonTypesSchema } from "../../src/core/catalog";
import { deepEqual } from "../../src/core/data_model";
import {
  isJsonObject,
  resolveLocalRef,
  validateJsonSchema,
  type JsonObject,
  type JsonValue,
} from "../../src/core/json_schema";
import { parseA2uiMarkdown, type MarkdownFeature } from "../../src/catalog/basic/markdown";
import type { TextViewBlock, TextViewInline } from "nsh/base";
import type {
  AdapterStateSnapshot,
  ExtraCatalogSpec,
  SerializedSurfaceSnapshot,
  SerializedViewNode,
} from "./AdapterApp";
import { ConformanceClient, type ConformanceCase } from "./harness";

const ADAPTER_APP = "../../tests/conformance/AdapterApp.tsx";

/**
 * Documented skip list for `core/adapter_conformance.yaml`.
 *
 * Empty: all 18 Basic Catalog v1 components are implemented (Spec 002 T1–T3)
 * and all 22/22 `core/adapter_conformance.yaml` cases pass. `ConformanceClient.runSuite`
 * fails CI if any entry here goes stale.
 */
export const ADAPTER_SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map();

/** Skip list for `core/accessibility.yaml` (empty: all 7/7 cases pass). */
export const ACCESSIBILITY_SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map();

/** Skip list for `adapter/markdown_subset.yaml` (empty: all 7/7 cases pass). */
export const MARKDOWN_SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map();

/** Skip list for `e2e/*.yaml` (empty: all 4/4 v1.0 scenarios pass). */
export const E2E_SKIP_TEST_NAMES: ReadonlyMap<string, string> = new Map();

// ---------------------------------------------------------------------------
// Known-key allowlists (guards against silently ignoring new upstream fields)
// ---------------------------------------------------------------------------

const KNOWN_KEYS = {
  adapterCase: new Set([
    "name",
    "description",
    "features",
    "action",
    "protocolVersion",
    "strictMode",
    "catalogPaths",
    "catalogs",
    "steps",
  ]),
  adapterCatalog: new Set(["catalogId", "protocolVersion", "components", "functions"]),
  adapterStep: new Set([
    "description",
    "op",
    "messages",
    "targetNode",
    "inputValue",
    "userActivation",
    "expectViewTree",
    "expectAccessibilityTree",
    "expectDataModel",
    "expectActions",
    "expectErrors",
    "expectOutbound",
    "expectSameViewIdentity",
    "expectNewViewIdentity",
    "expectDisposedNodes",
    "expectSurfaceRemoved",
    "expectThemeAbsent",
    "expectActiveSubscriptions",
  ]),
  adapterOps: new Set([
    "process_messages",
    "user_input",
    "user_gesture",
    "programmatic_invoke",
    "unmount_surface",
  ]),
  viewNode: new Set([
    "id",
    "type",
    "state",
    "occupiesLayout",
    "text",
    "value",
    "url",
    "name",
    "axis",
    "label",
    "disabled",
    "badgeText",
    "isValid",
    "validationErrors",
    "validationResults",
    "hints",
    "children",
  ]),
  validationResult: new Set(["valid", "code", "message", "severity"]),
  expectedAction: new Set(["name", "surfaceId", "sourceComponentId", "context"]),
  expectedError: new Set(["code", "surfaceId", "message"]),
  accessibilityCase: new Set([
    "name",
    "description",
    "features",
    "action",
    "protocolVersion",
    "catalogPath",
    "surface",
    "messages",
    "assertions",
    "steps",
  ]),
  accessibilityStep: new Set(["description", "messages", "assertions"]),
  accessibilityAssertions: new Set(["accessibilityTree", "axeCore"]),
  accessibilityNode: new Set(["label", "description", "live", "hidden", "role", "checked"]),
  markdownCase: new Set([
    "name",
    "description",
    "features",
    "action",
    "markdown",
    "expectVisibleText",
    "expectPresent",
    "expectAbsent",
  ]),
  e2eCase: new Set([
    "name",
    "description",
    "action",
    "protocolVersion",
    "catalogPaths",
    "formats",
    "source",
    "turns",
  ]),
  e2eSource: new Set(["kind", "from", "model", "recordedAt"]),
  e2eTurn: new Set([
    "userText",
    "modelChunks",
    "expectWire",
    "expectViewTree",
    "expectErrors",
    "uiOps",
    "expectDataModel",
    "expectOutbound",
  ]),
  e2eUiOp: new Set(["op", "surfaceId", "targetNode", "inputValue", "userActivation"]),
} as const;

const RESERVED_VIEW_KEYS = new Set([
  "id",
  "type",
  "state",
  "occupiesLayout",
  "isValid",
  "validationErrors",
  "validationResults",
  "hints",
  "children",
]);

function assertKnownObjectKeys(
  obj: unknown,
  allowed: ReadonlySet<string>,
  where: string,
): void {
  if (obj === undefined || obj === null) {
    return;
  }
  if (!isJsonObject(obj)) {
    throw new Error(`${where}: expected object`);
  }
  const unknown = Object.keys(obj).filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    throw new Error(`${where}: unknown keys: ${unknown.join(", ")}`);
  }
}

function assertKnownViewNode(node: unknown, where: string): void {
  if (node === undefined || node === null) {
    return;
  }
  assertKnownObjectKeys(node, KNOWN_KEYS.viewNode, where);
  const rec = node as Record<string, unknown>;
  if (Array.isArray(rec["validationResults"])) {
    rec["validationResults"].forEach((item, idx) => {
      assertKnownObjectKeys(
        item,
        KNOWN_KEYS.validationResult,
        `${where}.validationResults[${idx}]`,
      );
    });
  }
  if (Array.isArray(rec["children"])) {
    rec["children"].forEach((child, idx) => {
      assertKnownViewNode(child, `${where}.children[${idx}]`);
    });
  }
}

// ---------------------------------------------------------------------------
// Outbound v1.0 envelope JSON Schema validation & wildcard matching
// ---------------------------------------------------------------------------

let cachedCommonTypes: JsonObject | undefined;
function getCommonTypes(): JsonObject {
  if (!cachedCommonTypes) {
    cachedCommonTypes = buildV10CommonTypesSchema();
  }
  return cachedCommonTypes;
}

function resolveCommonTypesRef(
  ref: string,
): { readonly root: JsonObject; readonly schema: JsonValue } | undefined {
  const hashIdx = ref.indexOf("#");
  if (hashIdx < 0) {
    return undefined;
  }
  const uri = ref.slice(0, hashIdx);
  const fragment = ref.slice(hashIdx);
  if (uri === "common_types.json" || uri.endsWith("/common_types.json")) {
    const root = getCommonTypes();
    const schema = resolveLocalRef(root, fragment);
    if (schema !== undefined) {
      return { root, schema };
    }
  }
  return undefined;
}

function validateOutboundEnvelopes(
  envelopes: readonly Record<string, unknown>[],
  rendererToAgentSchema: JsonObject,
  where: string,
): void {
  for (let i = 0; i < envelopes.length; i += 1) {
    const env = envelopes[i]!;
    const issues = validateJsonSchema(
      rendererToAgentSchema,
      env as JsonValue,
      rendererToAgentSchema,
      {
        resolveExternalRef: resolveCommonTypesRef,
        customRefValidator: (ref, val, instancePath) => {
          if (
            ref === "catalog.json#/$defs/anyFunction" ||
            ref.endsWith("/FunctionCall")
          ) {
            if (!isJsonObject(val)) {
              return [
                {
                  path: instancePath,
                  keyword: "type",
                  message: "FunctionCall must be an object",
                },
              ];
            }
            if (typeof val["@call"] !== "string" || val["@call"].length === 0) {
              return [
                {
                  path: `${instancePath}/@call`,
                  keyword: "required",
                  message: "FunctionCall requires non-empty '@call'",
                },
              ];
            }
            for (const key of Object.keys(val)) {
              if (key !== "@call" && key !== "catalogId" && key !== "args") {
                return [
                  {
                    path: `${instancePath}/${key}`,
                    keyword: "additionalProperties",
                    message: `Unexpected FunctionCall property '${key}'`,
                  },
                ];
              }
            }
            if (
              val["catalogId"] !== undefined &&
              typeof val["catalogId"] !== "string"
            ) {
              return [
                {
                  path: `${instancePath}/catalogId`,
                  keyword: "type",
                  message: "FunctionCall catalogId must be a string",
                },
              ];
            }
            if (val["args"] !== undefined && !isJsonObject(val["args"])) {
              return [
                {
                  path: `${instancePath}/args`,
                  keyword: "type",
                  message: "FunctionCall args must be an object",
                },
              ];
            }
            return true;
          }
          return undefined;
        },
      },
    );
    if (issues.length > 0) {
      throw new Error(
        `${where}: outbound[${i}] failed renderer_to_agent.json validation: ${issues
          .map((iss) => `${iss.path}: ${iss.message}`)
          .join("; ")}`,
      );
    }
  }
}

function isMatchAny(value: unknown): boolean {
  if (!isJsonObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && value["$match"] === "any";
}

function assertMatchesOutbound(
  actual: unknown,
  expected: unknown,
  where: string,
): void {
  if (isMatchAny(expected)) {
    if (actual === undefined || actual === null) {
      throw new Error(`${where}: expected defined non-null value for $match:any`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      throw new Error(`${where}: expected array, got ${typeof actual}`);
    }
    if (actual.length !== expected.length) {
      throw new Error(
        `${where}: expected array length ${expected.length}, got ${actual.length}`,
      );
    }
    for (let i = 0; i < expected.length; i += 1) {
      assertMatchesOutbound(actual[i], expected[i], `${where}[${i}]`);
    }
    return;
  }
  if (isJsonObject(expected)) {
    if (!isJsonObject(actual)) {
      throw new Error(`${where}: expected object, got ${typeof actual}`);
    }
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (!deepEqual(actualKeys, expectedKeys)) {
      throw new Error(
        `${where}: expected keys [${expectedKeys.join(", ")}], got [${actualKeys.join(", ")}]`,
      );
    }
    for (let i = 0; i < expectedKeys.length; i += 1) {
      const k = expectedKeys[i]!;
      assertMatchesOutbound(actual[k], expected[k], `${where}.${k}`);
    }
    return;
  }
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${where}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertExpectedOutbound(
  actual: readonly Record<string, unknown>[],
  expected: readonly Record<string, unknown>[] | undefined,
  rendererToAgentSchema: JsonObject,
  where: string,
): void {
  validateOutboundEnvelopes(actual, rendererToAgentSchema, where);
  if (expected === undefined) {
    return;
  }
  if (actual.length !== expected.length) {
    throw new Error(
      `${where}: expected ${expected.length} outbound envelope(s), got ${actual.length}: ${JSON.stringify(actual)}`,
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    assertMatchesOutbound(actual[i], expected[i], `${where}.expectOutbound[${i}]`);
  }
}

function substituteLastCallId(value: unknown, lastCallId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => substituteLastCallId(item, lastCallId));
  }
  if (isJsonObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && value["$ref"] === "lastCallId") {
      return lastCallId;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = substituteLastCallId(v, lastCallId);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// AdapterApp RPC client wrapper
// ---------------------------------------------------------------------------

interface AdapterReply {
  readonly id: number;
  readonly ok: boolean;
  readonly snapshot?: AdapterStateSnapshot;
  readonly error?: string;
}

class AdapterSession {
  readonly app: App;
  private nextCmdId = 1;
  lastSnapshot: AdapterStateSnapshot = {
    surfaces: {},
    actions: [],
    errors: [],
    outbound: [],
    lastCallId: null,
    openedUrls: [],
    disposedMap: {},
  };

  private constructor(app: App) {
    this.app = app;
  }

  static async openSession(options?: {
    readonly strictMode?: boolean;
    readonly extraCatalogs?: readonly ExtraCatalogSpec[];
  }): Promise<AdapterSession> {
    const app = await open(ADAPTER_APP, {
      platform: "macos",
      host: {
        params: {
          strictMode: options?.strictMode === true,
          extraCatalogs: options?.extraCatalogs ?? [],
        },
        handlers: {
          "a2ui.reply": null,
        },
      },
    });
    return new AdapterSession(app);
  }

  async sendCommand(payload: Record<string, unknown>): Promise<AdapterStateSnapshot> {
    const id = this.nextCmdId;
    this.nextCmdId += 1;
    await this.app.host.send("a2ui.cmd", { ...payload, id });
    await this.app.waitUntil(() =>
      this.app.host.posts().some((p) => {
        if (p.name !== "a2ui.reply") {
          return false;
        }
        const data = p.data as AdapterReply | null;
        return data !== null && data.id === id;
      }),
    );
    const match = this.app.host.posts().find((p) => {
      if (p.name !== "a2ui.reply") {
        return false;
      }
      const data = p.data as AdapterReply | null;
      return data !== null && data.id === id;
    });
    const reply = match?.data as AdapterReply | undefined;
    if (!reply || !reply.ok || !reply.snapshot) {
      throw new Error(
        `AdapterApp command ${String(payload["kind"])} #${id} failed: ${reply?.error ?? "missing reply"}`,
      );
    }
    this.lastSnapshot = reply.snapshot;
    return reply.snapshot;
  }

  getPrimarySurface(preferredId?: string): SerializedSurfaceSnapshot | undefined {
    if (preferredId && this.lastSnapshot.surfaces[preferredId]) {
      return this.lastSnapshot.surfaces[preferredId];
    }
    const all = Object.values(this.lastSnapshot.surfaces);
    return all[0];
  }
}

// ---------------------------------------------------------------------------
// View tree indexing, live UI assertions, and interaction dispatch
// ---------------------------------------------------------------------------

interface IndexedNodeInfo {
  readonly nodeId: string;
  readonly mountToken: number | null;
  readonly instanceId: string;
  readonly type: string;
  readonly node: SerializedViewNode;
}

function indexViewTree(root: SerializedViewNode | null): Map<string, IndexedNodeInfo> {
  const map = new Map<string, IndexedNodeInfo>();
  if (!root) {
    return map;
  }
  const visit = (node: SerializedViewNode, nodePath: string): void => {
    const info: IndexedNodeInfo = {
      nodeId: node.nodeId,
      mountToken: node.mountToken,
      instanceId: node.instanceId,
      type: node.type,
      node,
    };
    map.set(nodePath, info);
    if (!map.has(node.id)) {
      map.set(node.id, info);
    }
    for (let i = 0; i < node.children.length; i += 1) {
      visit(node.children[i]!, `${nodePath}/children/${i}`);
    }
  };
  visit(root, "root");
  return map;
}

function findFirstSerializedNode(
  root: SerializedViewNode | null,
  componentId: string,
): SerializedViewNode | undefined {
  if (!root) {
    return undefined;
  }
  if (root.id === componentId) {
    return root;
  }
  for (let i = 0; i < root.children.length; i += 1) {
    const found = findFirstSerializedNode(root.children[i]!, componentId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function assertViewTree(
  actual: SerializedViewNode | null,
  expected: Record<string, unknown>,
  app: App,
  surfaceId: string,
  nodePath = "root",
): void {
  if (!actual) {
    throw new Error(`${nodePath}: expected view node, got null`);
  }
  if (expected["id"] !== undefined && actual.id !== expected["id"]) {
    throw new Error(
      `${nodePath}.id: expected ${String(expected["id"])}, got ${actual.id}`,
    );
  }
  if (expected["type"] !== undefined && actual.type !== expected["type"]) {
    throw new Error(
      `${nodePath}.type: expected ${String(expected["type"])}, got ${actual.type}`,
    );
  }
  if (expected["state"] !== undefined && actual.state !== expected["state"]) {
    throw new Error(
      `${nodePath}.state: expected ${String(expected["state"])}, got ${actual.state}`,
    );
  }
  if (expected["occupiesLayout"] !== undefined) {
    if (actual.occupiesLayout !== expected["occupiesLayout"]) {
      throw new Error(
        `${nodePath}.occupiesLayout: expected ${String(expected["occupiesLayout"])}, got ${String(actual.occupiesLayout)}`,
      );
    }
    if (expected["occupiesLayout"] === false) {
      const placeholderSelector =
        actual.state === "resolved"
          ? `id:${surfaceId}:${actual.instanceId}`
          : `id:${surfaceId}:${actual.instanceId}:placeholder:${actual.state}`;
      const shown = app.shows(placeholderSelector);
      if (shown) {
        throw new Error(
          `${nodePath}.occupiesLayout: expected display:none view (${placeholderSelector}) not to be shown in nsh`,
        );
      }
    }
  }
  if (expected["isValid"] !== undefined && actual.isValid !== expected["isValid"]) {
    throw new Error(
      `${nodePath}.isValid: expected ${String(expected["isValid"])}, got ${String(actual.isValid)}`,
    );
  }
  if (
    expected["validationErrors"] !== undefined &&
    !deepEqual(actual.validationErrors, expected["validationErrors"])
  ) {
    throw new Error(
      `${nodePath}.validationErrors: expected ${JSON.stringify(expected["validationErrors"])}, got ${JSON.stringify(actual.validationErrors)}`,
    );
  }
  if (
    expected["validationResults"] !== undefined &&
    !deepEqual(actual.validationResults, expected["validationResults"])
  ) {
    throw new Error(
      `${nodePath}.validationResults: expected ${JSON.stringify(expected["validationResults"])}, got ${JSON.stringify(actual.validationResults)}`,
    );
  }
  if (expected["hints"] !== undefined) {
    const expectedHints = expected["hints"] as string[];
    if (!deepEqual(actual.hints ?? [], expectedHints)) {
      throw new Error(
        `${nodePath}.hints: expected ${JSON.stringify(expectedHints)}, got ${JSON.stringify(actual.hints)}`,
      );
    }
    const screenText = app.texts().join(" ");
    for (let i = 0; i < expectedHints.length; i += 1) {
      if (!screenText.includes(expectedHints[i]!)) {
        throw new Error(
          `${nodePath}.hints: expected rendered screen text to contain hint "${expectedHints[i]}"`,
        );
      }
    }
  }

  for (const [key, expectedVal] of Object.entries(expected)) {
    if (RESERVED_VIEW_KEYS.has(key)) {
      continue;
    }
    const actualVal = actual.props[key];
    if (!deepEqual(actualVal, expectedVal)) {
      throw new Error(
        `${nodePath}.${key}: expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(actualVal)}`,
      );
    }
  }

  // Live headless nsh screen assertions for resolved nodes.
  if (actual.state === "resolved") {
    const screenJoined = app.texts().join(" ").replace(/\s+/g, " ");
    if (typeof expected["text"] === "string") {
      const visibleExpected =
        actual.type === "Text" && actual.props["variant"] !== "caption"
          ? parseA2uiMarkdown(expected["text"]).visibleText.replace(/\s+/g, " ")
          : expected["text"].replace(/\s+/g, " ");
      if (visibleExpected.length > 0 && !screenJoined.includes(visibleExpected)) {
        throw new Error(
          `${nodePath}.text: expected nsh screen texts "${screenJoined}" to contain "${visibleExpected}"`,
        );
      }
    }
    if (typeof expected["badgeText"] === "string") {
      if (!screenJoined.includes(expected["badgeText"])) {
        throw new Error(
          `${nodePath}.badgeText: expected nsh screen texts "${screenJoined}" to contain "${expected["badgeText"]}"`,
        );
      }
    }
    if (actual.type === "TextField" && typeof expected["value"] === "string") {
      const inputVal = app.value(`id:${surfaceId}:${actual.instanceId}`);
      if (inputVal !== expected["value"]) {
        throw new Error(
          `${nodePath}.value: expected nsh Input value "${expected["value"]}", got "${String(inputVal)}"`,
        );
      }
    }
  }

  if (expected["children"] !== undefined) {
    const expectedChildren = expected["children"] as Record<string, unknown>[];
    if (actual.children.length !== expectedChildren.length) {
      throw new Error(
        `${nodePath}.children: expected ${expectedChildren.length} child(ren), got ${actual.children.length}`,
      );
    }
    for (let i = 0; i < expectedChildren.length; i += 1) {
      assertViewTree(
        actual.children[i]!,
        expectedChildren[i]!,
        app,
        surfaceId,
        `${nodePath}/children/${i}`,
      );
    }
  }
}

function assertAccessibilityTree(
  surface: SerializedSurfaceSnapshot,
  expectedMap: Record<string, Record<string, unknown>>,
  app: App,
  where: string,
): void {
  for (const [compId, expected] of Object.entries(expectedMap)) {
    const actual = surface.accessibility[compId];
    if (!actual) {
      throw new Error(
        `${where}: missing accessibility snapshot for component "${compId}"`,
      );
    }
    if (expected["label"] !== undefined && actual.label !== expected["label"]) {
      throw new Error(
        `${where}.${compId}.label: expected ${JSON.stringify(expected["label"])}, got ${JSON.stringify(actual.label)}`,
      );
    }
    if (
      expected["description"] !== undefined &&
      actual.description !== expected["description"]
    ) {
      throw new Error(
        `${where}.${compId}.description: expected ${JSON.stringify(expected["description"])}, got ${JSON.stringify(actual.description)}`,
      );
    }
    if (expected["live"] !== undefined && actual.live !== expected["live"]) {
      throw new Error(
        `${where}.${compId}.live: expected ${JSON.stringify(expected["live"])}, got ${JSON.stringify(actual.live)}`,
      );
    }
    if (expected["hidden"] !== undefined && actual.hidden !== expected["hidden"]) {
      throw new Error(
        `${where}.${compId}.hidden: expected ${JSON.stringify(expected["hidden"])}, got ${JSON.stringify(actual.hidden)}`,
      );
    }
    if (expected["role"] !== undefined && actual.role !== expected["role"]) {
      throw new Error(
        `${where}.${compId}.role: expected ${JSON.stringify(expected["role"])}, got ${JSON.stringify(actual.role)}`,
      );
    }
    if (expected["checked"] !== undefined && actual.checked !== expected["checked"]) {
      throw new Error(
        `${where}.${compId}.checked: expected ${JSON.stringify(expected["checked"])}, got ${JSON.stringify(actual.checked)}`,
      );
    }

    // Cross-check native nsh/test accessibility selector for non-hidden labeled nodes.
    if (typeof expected["label"] === "string" && !actual.hidden) {
      if (!app.shows(`label:${expected["label"]}`)) {
        throw new Error(
          `${where}.${compId}: expected nsh view with label:${expected["label"]} to be shown`,
        );
      }
    }
    if (expected["live"] === "assertive" && !actual.hidden) {
      if (!app.shows("role:alert")) {
        throw new Error(
          `${where}.${compId}: expected nsh view with role:alert for assertive live region`,
        );
      }
    }
  }
}

function assertAxeCoreSemantics(
  surface: SerializedSurfaceSnapshot,
  rules: readonly string[],
  where: string,
): void {
  const nodes = indexViewTree(surface.viewTree);
  const visited = new Set<string>();

  if (rules.includes("button-name")) {
    for (const info of nodes.values()) {
      if (visited.has(info.nodeId)) {
        continue;
      }
      visited.add(info.nodeId);
      if (info.type === "Button") {
        const snap = surface.accessibility[info.node.id];
        if (!snap?.label || snap.label.trim().length === 0) {
          throw new Error(
            `${where}: axeCore rule "button-name" failed for Button "${info.node.id}" (missing accessible label)`,
          );
        }
      }
    }
  }

  if (rules.includes("aria-valid-attr-value")) {
    for (const [compId, snap] of Object.entries(surface.accessibility)) {
      if (
        snap.live !== undefined &&
        snap.live !== "off" &&
        snap.live !== "polite" &&
        snap.live !== "assertive"
      ) {
        throw new Error(
          `${where}: axeCore rule "aria-valid-attr-value" failed for "${compId}" (invalid live="${String(snap.live)}")`,
        );
      }
    }
  }

  if (rules.includes("aria-allowed-attr")) {
    for (const [compId, snap] of Object.entries(surface.accessibility)) {
      if (snap.checked !== undefined && snap.role !== "checkbox" && snap.role !== "radio" && snap.role !== "switch") {
        throw new Error(
          `${where}: axeCore rule "aria-allowed-attr" failed for "${compId}" (checked on role "${String(snap.role)}")`,
        );
      }
    }
  }

  if (rules.includes("aria-hidden-focus")) {
    // Verify hidden subtrees explicitly set hidden=true in accessibility metadata.
    const anyHidden = Object.values(surface.accessibility).some((s) => s.hidden);
    if (!anyHidden) {
      throw new Error(
        `${where}: axeCore rule "aria-hidden-focus" expected at least one hidden subtree`,
      );
    }
  }
}

async function performUiOperation(
  session: AdapterSession,
  op: {
    readonly op: string;
    readonly surfaceId?: string;
    readonly targetNode?: string;
    readonly inputValue?: unknown;
    readonly userActivation?: boolean;
  },
  checkNodeIds?: readonly string[],
): Promise<AdapterStateSnapshot> {
  const surface = session.getPrimarySurface(op.surfaceId);
  if (!surface) {
    throw new Error(
      `Cannot run op "${op.op}": surface "${op.surfaceId ?? "(default)"}" not found`,
    );
  }
  const surfaceId = surface.surfaceId;

  if (op.op === "unmount_surface") {
    return session.sendCommand({
      kind: "unmount",
      surfaceId,
      checkNodeIds,
    });
  }

  if (op.op === "programmatic_invoke") {
    return session.sendCommand({
      kind: "programmaticInvoke",
      surfaceId,
      targetNode: op.targetNode,
      userActivation: op.userActivation ?? false,
      checkNodeIds,
    });
  }

  const targetNodeId = op.targetNode;
  if (!targetNodeId) {
    throw new Error(`op "${op.op}" missing targetNode`);
  }
  const target = findFirstSerializedNode(surface.viewTree, targetNodeId);
  if (!target) {
    throw new Error(
      `op "${op.op}": targetNode "${targetNodeId}" not found on surface "${surfaceId}"`,
    );
  }
  const selector = `id:${surfaceId}:${target.instanceId}`;

  await session.sendCommand({ kind: "clearBuffers" });

  if (op.op === "user_gesture") {
    await session.app.press(selector);
    return session.sendCommand({ kind: "snapshot", checkNodeIds });
  }

  if (op.op === "user_input") {
    if (target.type === "Tabs") {
      const tabIdx = Number(op.inputValue ?? 0);
      await session.app.press(`${selector}:tab:${tabIdx}`);
    } else if (target.type === "CheckBox") {
      const desired = Boolean(op.inputValue);
      const current = Boolean(target.props["value"]);
      if (desired !== current) {
        await session.app.press(selector);
      }
    } else if (target.type === "ChoicePicker") {
      const desiredValues = (
        Array.isArray(op.inputValue) ? op.inputValue : [op.inputValue]
      ).map(String);
      for (let i = 0; i < desiredValues.length; i += 1) {
        await session.app.press(`${selector}:option:${desiredValues[i]!}`);
      }
    } else if (target.type === "Slider") {
      const desired = Number(op.inputValue);
      const min =
        typeof target.props["min"] === "number" ? target.props["min"] : 0;
      const max =
        typeof target.props["max"] === "number" ? target.props["max"] : 100;
      const current =
        typeof target.props["value"] === "number" ? target.props["value"] : min;
      const stepsRaw = target.props["steps"];
      const hasDiscreteSteps =
        typeof stepsRaw === "number" && Number.isFinite(stepsRaw) && stepsRaw >= 1;
      const divisions = hasDiscreteSteps ? Math.floor(stepsRaw) : 0;
      const stepSize =
        divisions >= 1 ? (max - min) / divisions : (max - min) * 0.01;
      const pageSize = (max - min) * 0.1;
      const clampedTarget = Math.min(max, Math.max(min, desired));

      // Tab until this slider's thumb holds keyboard focus (using pageup/pagedown,
      // which do not mutate CheckBox, RadioGroup, Button, or DateTimeInput).
      const probeKey = current >= max ? "pagedown" : "pageup";
      let focused = false;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await session.app.keyboard.press("tab");
        await session.app.keyboard.press(probeKey);
        const snap = await session.sendCommand({ kind: "snapshot" });
        const updated = findFirstSerializedNode(
          snap.surfaces[surfaceId]?.viewTree ?? null,
          targetNodeId,
        );
        if (updated && updated.props["value"] !== current) {
          focused = true;
          break;
        }
      }
      if (!focused) {
        throw new Error(
          `user_input: could not focus Slider "${targetNodeId}" via keyboard Tab`,
        );
      }

      await session.app.keyboard.press("home");

      if (stepSize > 0 && clampedTarget > min) {
        let remaining = clampedTarget - min;
        if (!hasDiscreteSteps && pageSize > stepSize) {
          while (remaining >= pageSize - 1e-9) {
            await session.app.keyboard.press("pageup");
            remaining -= pageSize;
          }
        }
        const singleSteps = Math.round(remaining / stepSize);
        for (let i = 0; i < singleSteps; i += 1) {
          await session.app.keyboard.press("right");
        }
      }
    } else if (target.type === "DateTimeInput") {
      const nextIso = String(op.inputValue ?? "");
      const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(nextIso);
      const timeMatch = /(?:T|^)(\d{2}):(\d{2})/.exec(nextIso);
      const enableDate =
        target.props["enableDate"] === true ||
        (target.props["enableDate"] === undefined &&
          target.props["enableTime"] !== true);
      const enableTime = target.props["enableTime"] === true;

      if (enableDate && dateMatch) {
        const targetDate = dateMatch[1]!;
        await session.app.press(`${selector}:date-trigger`);
        await session.app.waitFor(`label:${targetDate}`);
        await session.app.press(`label:${targetDate}`);
      }
      if (enableTime && timeMatch) {
        const targetHour = timeMatch[1]!;
        const targetMinute = timeMatch[2]!;
        await session.app.press(`${selector}:time:hour`);
        await session.app.type(`${selector}:time`, `${targetHour}${targetMinute}`);
      }
    } else {
      // TextField (default): clear existing text if non-empty, then type new text.
      const existing = session.app.value(selector) ?? "";
      if (existing.length > 0) {
        await session.app.clear(selector);
      }
      const nextText = String(op.inputValue ?? "");
      if (nextText.length > 0) {
        await session.app.type(selector, nextText);
      }
    }
    return session.sendCommand({ kind: "snapshot", checkNodeIds });
  }

  throw new Error(`Unsupported UI op: "${op.op}"`);
}

function assertExpectedActions(
  actual: readonly Record<string, unknown>[],
  expected: readonly Record<string, unknown>[] | undefined,
  where: string,
): void {
  if (expected === undefined) {
    return;
  }
  if (actual.length !== expected.length) {
    throw new Error(
      `${where}.expectActions: expected ${expected.length} action(s), got ${actual.length}: ${JSON.stringify(actual)}`,
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    const exp = expected[i]!;
    const act = actual[i]!;
    if (act["name"] !== exp["name"]) {
      throw new Error(
        `${where}.expectActions[${i}].name: expected ${String(exp["name"])}, got ${String(act["name"])}`,
      );
    }
    if (exp["surfaceId"] !== undefined && act["surfaceId"] !== exp["surfaceId"]) {
      throw new Error(
        `${where}.expectActions[${i}].surfaceId: expected ${String(exp["surfaceId"])}, got ${String(act["surfaceId"])}`,
      );
    }
    if (
      exp["sourceComponentId"] !== undefined &&
      act["sourceComponentId"] !== exp["sourceComponentId"]
    ) {
      throw new Error(
        `${where}.expectActions[${i}].sourceComponentId: expected ${String(exp["sourceComponentId"])}, got ${String(act["sourceComponentId"])}`,
      );
    }
    if (
      exp["context"] !== undefined &&
      !deepEqual(act["context"], exp["context"])
    ) {
      throw new Error(
        `${where}.expectActions[${i}].context: expected ${JSON.stringify(exp["context"])}, got ${JSON.stringify(act["context"])}`,
      );
    }
  }
}

function assertExpectedErrors(
  actual: readonly Record<string, unknown>[],
  expected: readonly Record<string, unknown>[] | undefined,
  where: string,
): void {
  if (expected === undefined) {
    return;
  }
  if (actual.length !== expected.length) {
    throw new Error(
      `${where}.expectErrors: expected ${expected.length} error(s), got ${actual.length}: ${JSON.stringify(actual)}`,
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    const exp = expected[i]!;
    const act = actual[i]!;
    if (exp["code"] !== undefined && act["code"] !== exp["code"]) {
      throw new Error(
        `${where}.expectErrors[${i}].code: expected ${String(exp["code"])}, got ${String(act["code"])}`,
      );
    }
    if (exp["surfaceId"] !== undefined && act["surfaceId"] !== exp["surfaceId"]) {
      throw new Error(
        `${where}.expectErrors[${i}].surfaceId: expected ${String(exp["surfaceId"])}, got ${String(act["surfaceId"])}`,
      );
    }
    if (
      exp["message"] !== undefined &&
      !String(act["message"] ?? "").includes(String(exp["message"]))
    ) {
      throw new Error(
        `${where}.expectErrors[${i}].message: expected "${String(act["message"])}" to contain "${String(exp["message"])}"`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Markdown AST inspection helpers for `adapter/markdown_subset.yaml`
// ---------------------------------------------------------------------------

function inspectDisallowedInlines(
  inlines: readonly TextViewInline[],
  found: Set<string>,
): void {
  for (let i = 0; i < inlines.length; i += 1) {
    const node = inlines[i]!;
    if (node.type === "link" || node.type === "image") {
      found.add(node.type);
    }
    if (
      node.type === "emphasis" ||
      node.type === "strong" ||
      node.type === "strikethrough" ||
      node.type === "underline" ||
      node.type === "superscript" ||
      node.type === "subscript" ||
      node.type === "small" ||
      node.type === "highlight" ||
      node.type === "link"
    ) {
      inspectDisallowedInlines(node.content, found);
    } else if (node.type === "custom" && node.content) {
      inspectDisallowedInlines(node.content, found);
    }
  }
}

function inspectDisallowedBlocks(
  blocks: readonly TextViewBlock[],
  found: Set<string>,
): void {
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    const rawType = (block as { type: string }).type;
    if (rawType === "html" || rawType === "image" || rawType === "link") {
      found.add(rawType);
    }
    switch (block.type) {
      case "paragraph":
      case "heading":
        inspectDisallowedInlines(block.content, found);
        break;
      case "blockquote":
        inspectDisallowedBlocks(block.children, found);
        break;
      case "list":
        for (let j = 0; j < block.items.length; j += 1) {
          inspectDisallowedBlocks(block.items[j]!.children, found);
        }
        break;
      case "details":
        inspectDisallowedInlines(block.summary, found);
        inspectDisallowedBlocks(block.children, found);
        break;
      case "custom":
        if (block.children) {
          inspectDisallowedBlocks(block.children, found);
        }
        if (block.content) {
          inspectDisallowedInlines(block.content, found);
        }
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Suite executors
// ---------------------------------------------------------------------------

async function runAdapterCase(
  tc: ConformanceCase,
  rendererToAgentSchema: JsonObject,
): Promise<void> {
  assertKnownObjectKeys(tc, KNOWN_KEYS.adapterCase, `case(${tc.name})`);
  if (tc.action !== "render_surface") {
    throw new Error(`case(${tc.name}): unsupported action "${String(tc.action)}"`);
  }

  const rawCatalogs = Array.isArray(tc["catalogs"])
    ? (tc["catalogs"] as ExtraCatalogSpec[])
    : [];
  for (let i = 0; i < rawCatalogs.length; i += 1) {
    assertKnownObjectKeys(
      rawCatalogs[i],
      KNOWN_KEYS.adapterCatalog,
      `case(${tc.name}).catalogs[${i}]`,
    );
  }

  const steps = (tc["steps"] ?? []) as Array<Record<string, unknown>>;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    assertKnownObjectKeys(step, KNOWN_KEYS.adapterStep, `case(${tc.name}).steps[${i}]`);
    if (
      step["op"] !== undefined &&
      !KNOWN_KEYS.adapterOps.has(String(step["op"]))
    ) {
      throw new Error(
        `case(${tc.name}).steps[${i}]: unsupported op "${String(step["op"])}"`,
      );
    }
    if (step["expectViewTree"] !== undefined) {
      assertKnownViewNode(
        step["expectViewTree"],
        `case(${tc.name}).steps[${i}].expectViewTree`,
      );
    }
    if (isJsonObject(step["expectAccessibilityTree"])) {
      for (const [compId, node] of Object.entries(step["expectAccessibilityTree"])) {
        assertKnownObjectKeys(
          node,
          KNOWN_KEYS.accessibilityNode,
          `case(${tc.name}).steps[${i}].expectAccessibilityTree.${compId}`,
        );
      }
    }
    if (Array.isArray(step["expectActions"])) {
      step["expectActions"].forEach((item, idx) =>
        assertKnownObjectKeys(
          item,
          KNOWN_KEYS.expectedAction,
          `case(${tc.name}).steps[${i}].expectActions[${idx}]`,
        ),
      );
    }
    if (Array.isArray(step["expectErrors"])) {
      step["expectErrors"].forEach((item, idx) =>
        assertKnownObjectKeys(
          item,
          KNOWN_KEYS.expectedError,
          `case(${tc.name}).steps[${i}].expectErrors[${idx}]`,
        ),
      );
    }
  }

  const session = await AdapterSession.openSession({
    strictMode: tc["strictMode"] === true,
    extraCatalogs: rawCatalogs,
  });

  let previousIndex = new Map<string, IndexedNodeInfo>();

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx += 1) {
    const step = steps[stepIdx]!;
    const where = `${tc.name}.steps[${stepIdx}]`;
    const op = String(step["op"] ?? "process_messages");

    const disposedTargets = Array.isArray(step["expectDisposedNodes"])
      ? (step["expectDisposedNodes"] as string[])
      : [];
    const checkNodeIds: string[] = [];
    for (let d = 0; d < disposedTargets.length; d += 1) {
      const prev = previousIndex.get(disposedTargets[d]!);
      if (prev) {
        checkNodeIds.push(prev.nodeId);
      }
    }

    let snap: AdapterStateSnapshot;
    if (op === "process_messages") {
      const substituted = substituteLastCallId(
        step["messages"] ?? [],
        session.lastSnapshot.lastCallId ?? "",
      );
      await session.sendCommand({
        kind: "process",
        messages: substituted,
        checkNodeIds,
      });
      // Let virtualized containers (<List>) finish their layout mount pass before snapshotting.
      await session.app.wait(0);
      snap = await session.sendCommand({ kind: "snapshot", checkNodeIds });
    } else {
      snap = await performUiOperation(
        session,
        {
          op,
          targetNode:
            typeof step["targetNode"] === "string" ? step["targetNode"] : undefined,
          inputValue: step["inputValue"],
          userActivation:
            typeof step["userActivation"] === "boolean"
              ? step["userActivation"]
              : undefined,
        },
        checkNodeIds,
      );
    }

    const surface = session.getPrimarySurface();
    const currentIndex = indexViewTree(surface?.viewTree ?? null);

    if (step["expectViewTree"] !== undefined) {
      if (!surface) {
        throw new Error(`${where}: expected surface for expectViewTree`);
      }
      assertViewTree(
        surface.viewTree,
        step["expectViewTree"] as Record<string, unknown>,
        session.app,
        surface.surfaceId,
        `${where}.expectViewTree`,
      );
    }

    if (isJsonObject(step["expectAccessibilityTree"])) {
      if (!surface) {
        throw new Error(`${where}: expected surface for expectAccessibilityTree`);
      }
      assertAccessibilityTree(
        surface,
        step["expectAccessibilityTree"] as Record<string, Record<string, unknown>>,
        session.app,
        `${where}.expectAccessibilityTree`,
      );
    }

    if (step["expectDataModel"] !== undefined) {
      if (!surface) {
        throw new Error(`${where}: expected surface for expectDataModel`);
      }
      if (!deepEqual(surface.dataModel, step["expectDataModel"])) {
        throw new Error(
          `${where}.expectDataModel: expected ${JSON.stringify(step["expectDataModel"])}, got ${JSON.stringify(surface.dataModel)}`,
        );
      }
    }

    assertExpectedActions(
      snap.actions,
      step["expectActions"] as readonly Record<string, unknown>[] | undefined,
      where,
    );
    assertExpectedErrors(
      snap.errors,
      step["expectErrors"] as readonly Record<string, unknown>[] | undefined,
      where,
    );
    assertExpectedOutbound(
      snap.outbound,
      step["expectOutbound"] as readonly Record<string, unknown>[] | undefined,
      rendererToAgentSchema,
      where,
    );

    if (Array.isArray(step["expectSameViewIdentity"])) {
      for (const nodePath of step["expectSameViewIdentity"] as string[]) {
        const prev = previousIndex.get(nodePath);
        const curr = currentIndex.get(nodePath);
        if (!prev || !curr) {
          throw new Error(
            `${where}.expectSameViewIdentity(${nodePath}): missing node (prev=${Boolean(prev)}, curr=${Boolean(curr)})`,
          );
        }
        if (prev.nodeId !== curr.nodeId || prev.mountToken !== curr.mountToken) {
          throw new Error(
            `${where}.expectSameViewIdentity(${nodePath}): view remounted (prev=${prev.nodeId}#${prev.mountToken}, curr=${curr.nodeId}#${curr.mountToken})`,
          );
        }
      }
    }

    if (Array.isArray(step["expectNewViewIdentity"])) {
      for (const nodePath of step["expectNewViewIdentity"] as string[]) {
        const prev = previousIndex.get(nodePath);
        const curr = currentIndex.get(nodePath);
        if (!prev || !curr) {
          throw new Error(
            `${where}.expectNewViewIdentity(${nodePath}): missing node (prev=${Boolean(prev)}, curr=${Boolean(curr)})`,
          );
        }
        if (prev.nodeId === curr.nodeId || prev.mountToken === curr.mountToken) {
          throw new Error(
            `${where}.expectNewViewIdentity(${nodePath}): expected new view identity, kept ${curr.nodeId}#${curr.mountToken}`,
          );
        }
      }
    }

    for (let d = 0; d < disposedTargets.length; d += 1) {
      const compId = disposedTargets[d]!;
      const prev = previousIndex.get(compId);
      if (!prev) {
        throw new Error(
          `${where}.expectDisposedNodes(${compId}): node was not present in previous step`,
        );
      }
      if (snap.disposedMap[prev.nodeId] !== true) {
        throw new Error(
          `${where}.expectDisposedNodes(${compId}): expected node ${prev.nodeId} to be disposed`,
        );
      }
      if (currentIndex.has(compId)) {
        throw new Error(
          `${where}.expectDisposedNodes(${compId}): component still present in view tree`,
        );
      }
    }

    if (step["expectSurfaceRemoved"] === true) {
      if (!surface) {
        throw new Error(`${where}.expectSurfaceRemoved: missing tracked surface`);
      }
      if (surface.exists || !surface.disposed || surface.mounted) {
        throw new Error(
          `${where}.expectSurfaceRemoved: expected surface removed/disposed/unmounted (got exists=${surface.exists}, disposed=${surface.disposed}, mounted=${surface.mounted})`,
        );
      }
      if (session.app.shows(`id:surface:${surface.surfaceId}`)) {
        throw new Error(
          `${where}.expectSurfaceRemoved: surface root view still shown in nsh`,
        );
      }
    }

    if (step["expectThemeAbsent"] === true) {
      if (!surface || !surface.themeAbsent) {
        throw new Error(
          `${where}.expectThemeAbsent: expected no theme properties on surface`,
        );
      }
    }

    if (typeof step["expectActiveSubscriptions"] === "number") {
      if (!surface) {
        throw new Error(
          `${where}.expectActiveSubscriptions: missing tracked surface`,
        );
      }
      if (surface.activeSubscriptions !== step["expectActiveSubscriptions"]) {
        throw new Error(
          `${where}.expectActiveSubscriptions: expected ${step["expectActiveSubscriptions"]}, got ${surface.activeSubscriptions}`,
        );
      }
    }

    previousIndex = currentIndex;
  }
}

async function runAccessibilityCase(tc: ConformanceCase): Promise<void> {
  assertKnownObjectKeys(tc, KNOWN_KEYS.accessibilityCase, `case(${tc.name})`);
  if (tc.action !== "accessibility_check") {
    throw new Error(`case(${tc.name}): unsupported action "${String(tc.action)}"`);
  }

  const rawSteps = Array.isArray(tc["steps"])
    ? (tc["steps"] as Array<{
        messages: unknown[];
        assertions: {
          accessibilityTree?: Record<string, Record<string, unknown>>;
          axeCore?: string[];
        };
      }>)
    : [
        {
          messages: (tc["messages"] ?? []) as unknown[],
          assertions: (tc["assertions"] ?? {}) as {
            accessibilityTree?: Record<string, Record<string, unknown>>;
            axeCore?: string[];
          },
        },
      ];

  for (let i = 0; i < rawSteps.length; i += 1) {
    const step = rawSteps[i]!;
    assertKnownObjectKeys(
      step.assertions,
      KNOWN_KEYS.accessibilityAssertions,
      `case(${tc.name}).steps[${i}].assertions`,
    );
    if (step.assertions.accessibilityTree) {
      for (const [compId, node] of Object.entries(step.assertions.accessibilityTree)) {
        assertKnownObjectKeys(
          node,
          KNOWN_KEYS.accessibilityNode,
          `case(${tc.name}).steps[${i}].assertions.accessibilityTree.${compId}`,
        );
      }
    }
  }

  const session = await AdapterSession.openSession({ strictMode: false });

  for (let i = 0; i < rawSteps.length; i += 1) {
    const step = rawSteps[i]!;
    const where = `${tc.name}.steps[${i}]`;
    await session.sendCommand({
      kind: "process",
      messages: step.messages,
    });
    const surface = session.getPrimarySurface("a11y_surface");
    if (!surface) {
      throw new Error(`${where}: surface "a11y_surface" not created`);
    }
    if (step.assertions.accessibilityTree) {
      assertAccessibilityTree(
        surface,
        step.assertions.accessibilityTree,
        session.app,
        `${where}.accessibilityTree`,
      );
    }
    if (Array.isArray(step.assertions.axeCore) && step.assertions.axeCore.length > 0) {
      assertAxeCoreSemantics(surface, step.assertions.axeCore, where);
    }
  }
}

async function runMarkdownCase(tc: ConformanceCase): Promise<void> {
  assertKnownObjectKeys(tc, KNOWN_KEYS.markdownCase, `case(${tc.name})`);
  if (tc.action !== "render_markdown") {
    throw new Error(`case(${tc.name}): unsupported action "${String(tc.action)}"`);
  }

  const markdown = String(tc["markdown"] ?? "");
  const expectedVisible =
    typeof tc["expectVisibleText"] === "string" ? tc["expectVisibleText"] : undefined;
  const expectPresent = Array.isArray(tc["expectPresent"])
    ? (tc["expectPresent"] as string[])
    : [];
  const expectAbsent = Array.isArray(tc["expectAbsent"])
    ? (tc["expectAbsent"] as string[])
    : [];

  // 1. Verify AST features & sanitization on our Basic Catalog markdown parser.
  const parsed = parseA2uiMarkdown(markdown);
  for (let i = 0; i < expectPresent.length; i += 1) {
    const token = expectPresent[i] as MarkdownFeature;
    if (!parsed.features.has(token)) {
      throw new Error(
        `${tc.name}: expected Markdown feature "${token}" to be present`,
      );
    }
  }
  const disallowed = new Set<string>();
  inspectDisallowedBlocks(parsed.document.blocks, disallowed);
  for (let i = 0; i < expectAbsent.length; i += 1) {
    const token = expectAbsent[i]!;
    if (disallowed.has(token)) {
      throw new Error(
        `${tc.name}: expected disallowed Markdown node "${token}" to be absent`,
      );
    }
  }

  // 2. Render inside a real A2UI v1.0 Text component on nsh and verify visible text.
  const session = await AdapterSession.openSession({ strictMode: true });
  await session.sendCommand({
    kind: "process",
    messages: [
      {
        version: "1.0",
        createSurface: {
          surfaceId: "md_surface",
          catalogId: "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
          components: [
            {
              id: "root",
              component: "Text",
              text: markdown,
            },
          ],
        },
      },
    ],
  });

  if (expectPresent.includes("list_item")) {
    if (!session.app.texts().includes("•")) {
      throw new Error(
        `${tc.name}: expected rendered list bullet ("•") in nsh TextView output`,
      );
    }
  }

  if (expectedVisible !== undefined) {
    const actualNormalized = session.app
      .texts()
      .filter((t) => t.trim() !== "•")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const expectedNormalized = expectedVisible.replace(/\s+/g, " ").trim();
    if (actualNormalized !== expectedNormalized) {
      throw new Error(
        `${tc.name}: expected visible text "${expectedNormalized}", got "${actualNormalized}"`,
      );
    }
    if (parsed.visibleText.replace(/\s+/g, " ").trim() !== expectedNormalized) {
      throw new Error(
        `${tc.name}: expected parsed visibleText "${expectedNormalized}", got "${parsed.visibleText}"`,
      );
    }
  }
  if (session.app.openedUrls().length > 0) {
    throw new Error(
      `${tc.name}: expected no URLs opened, got ${JSON.stringify(session.app.openedUrls())}`,
    );
  }
}

async function runE2eScenario(
  scenario: ConformanceCase,
  rendererToAgentSchema: JsonObject,
): Promise<void> {
  assertKnownObjectKeys(scenario, KNOWN_KEYS.e2eCase, `scenario(${scenario.name})`);
  if (scenario.action !== "e2e_scenario") {
    throw new Error(
      `scenario(${scenario.name}): unsupported action "${String(scenario.action)}"`,
    );
  }
  if (scenario["source"] !== undefined) {
    assertKnownObjectKeys(
      scenario["source"],
      KNOWN_KEYS.e2eSource,
      `scenario(${scenario.name}).source`,
    );
  }

  const turns = (scenario["turns"] ?? []) as Array<Record<string, unknown>>;
  if (turns.length === 0) {
    throw new Error(`scenario(${scenario.name}): expected at least one turn`);
  }

  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i]!;
    assertKnownObjectKeys(turn, KNOWN_KEYS.e2eTurn, `scenario(${scenario.name}).turns[${i}]`);
    if (isJsonObject(turn["expectViewTree"])) {
      for (const [sid, tree] of Object.entries(turn["expectViewTree"])) {
        if (tree !== null) {
          assertKnownViewNode(
            tree,
            `scenario(${scenario.name}).turns[${i}].expectViewTree.${sid}`,
          );
        }
      }
    }
    if (Array.isArray(turn["uiOps"])) {
      turn["uiOps"].forEach((op, j) =>
        assertKnownObjectKeys(
          op,
          KNOWN_KEYS.e2eUiOp,
          `scenario(${scenario.name}).turns[${i}].uiOps[${j}]`,
        ),
      );
    }
  }

  const session = await AdapterSession.openSession({ strictMode: false });

  for (let turnIdx = 0; turnIdx < turns.length; turnIdx += 1) {
    const turn = turns[turnIdx]!;
    const where = `${scenario.name}.turns[${turnIdx}]`;
    const turnOutbound: Record<string, unknown>[] = [];
    const turnErrors: Record<string, unknown>[] = [];

    // 1. Feed all `a2ui` message batches from `expectWire` (ignoring chat text parts).
    const wireParts = (turn["expectWire"] ?? []) as Array<{
      text?: string;
      a2ui?: unknown[];
    }>;
    for (let p = 0; p < wireParts.length; p += 1) {
      const part = wireParts[p]!;
      if (Array.isArray(part.a2ui) && part.a2ui.length > 0) {
        const snap = await session.sendCommand({
          kind: "process",
          messages: part.a2ui,
        });
        turnOutbound.push(...snap.outbound);
        turnErrors.push(...snap.errors);
      }
    }

    // 2. Assert expected view trees per surface (or absence when `null`).
    if (isJsonObject(turn["expectViewTree"])) {
      for (const [surfaceId, expectedTree] of Object.entries(turn["expectViewTree"])) {
        const surface = session.lastSnapshot.surfaces[surfaceId];
        if (expectedTree === null) {
          if (surface && surface.exists) {
            throw new Error(
              `${where}.expectViewTree.${surfaceId}: expected surface to be absent`,
            );
          }
          if (session.app.shows(`id:surface:${surfaceId}`)) {
            throw new Error(
              `${where}.expectViewTree.${surfaceId}: expected surface view not to be shown`,
            );
          }
        } else {
          if (!surface || !surface.exists) {
            throw new Error(
              `${where}.expectViewTree.${surfaceId}: expected surface to exist`,
            );
          }
          assertViewTree(
            surface.viewTree,
            expectedTree as Record<string, unknown>,
            session.app,
            surfaceId,
            `${where}.expectViewTree.${surfaceId}`,
          );
        }
      }
    }

    // 3. Execute UI operations in sequence against real nsh controls.
    if (Array.isArray(turn["uiOps"])) {
      for (let u = 0; u < turn["uiOps"].length; u += 1) {
        const uiOp = turn["uiOps"][u] as {
          op: string;
          surfaceId: string;
          targetNode?: string;
          inputValue?: unknown;
          userActivation?: boolean;
        };
        const snap = await performUiOperation(session, uiOp);
        turnOutbound.push(...snap.outbound);
        turnErrors.push(...snap.errors);
      }
    }

    // 4. Assert updated DataModel state per surface.
    if (isJsonObject(turn["expectDataModel"])) {
      for (const [surfaceId, expectedData] of Object.entries(turn["expectDataModel"])) {
        const surface = session.lastSnapshot.surfaces[surfaceId];
        if (!surface || !surface.exists) {
          throw new Error(
            `${where}.expectDataModel.${surfaceId}: expected surface to exist`,
          );
        }
        if (!deepEqual(surface.dataModel, expectedData)) {
          throw new Error(
            `${where}.expectDataModel.${surfaceId}: expected ${JSON.stringify(expectedData)}, got ${JSON.stringify(surface.dataModel)}`,
          );
        }
      }
    }

    // 5. Assert errors & schema-validated outbound wire envelopes.
    assertExpectedErrors(
      turnErrors,
      turn["expectErrors"] as readonly Record<string, unknown>[] | undefined,
      where,
    );
    assertExpectedOutbound(
      turnOutbound,
      turn["expectOutbound"] as readonly Record<string, unknown>[] | undefined,
      rendererToAgentSchema,
      where,
    );
  }
}

// ---------------------------------------------------------------------------
// Test suite registration
// ---------------------------------------------------------------------------

describe("C6 conformance — adapter, accessibility, markdown subset & e2e renderer half", () => {
  let client: ConformanceClient;
  let rendererToAgentSchema: JsonObject;

  beforeAll(async () => {
    client = await ConformanceClient.create();
    const root = client.resolveConformanceRoot();
    const schemaText = await client.readTextFile(
      `${root}/specification/v1_0/json/renderer_to_agent.json`,
    );
    rendererToAgentSchema = JSON.parse(schemaText) as JsonObject;
  });

  test("core/adapter_conformance.yaml passes all 22 cases (0 skips)", async () => {
    const records = await client.runSuite(
      "core/adapter_conformance.yaml",
      (tc) => runAdapterCase(tc, rendererToAgentSchema),
      ADAPTER_SKIP_TEST_NAMES,
    );
    const passed = records.filter((r) => r.status === "passed");
    const skipped = records.filter((r) => r.status === "skipped");
    expect(passed.length).toBe(22);
    expect(skipped.length).toBe(0);
  });

  test("core/accessibility.yaml passes all 7 cases", async () => {
    const records = await client.runSuite(
      "core/accessibility.yaml",
      (tc) => runAccessibilityCase(tc),
      ACCESSIBILITY_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(7);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("adapter/markdown_subset.yaml passes all 7 cases", async () => {
    const records = await client.runSuite(
      "adapter/markdown_subset.yaml",
      (tc) => runMarkdownCase(tc),
      MARKDOWN_SKIP_TEST_NAMES,
    );
    expect(records.length).toBe(7);
    expect(records.every((r) => r.status === "passed")).toBe(true);
  });

  test("e2e/*.yaml (renderer half, v1.0) passes all 4 scenarios", async () => {
    const root = client.resolveConformanceRoot();
    const entries = await client.listDirectory(`${root}/conformance/e2e`);
    const yamlFiles = entries.filter((name) => name.endsWith(".yaml")).sort();
    expect(yamlFiles.length).toBeGreaterThanOrEqual(4);

    let totalPassed = 0;
    for (let i = 0; i < yamlFiles.length; i += 1) {
      const suiteRel = `e2e/${yamlFiles[i]!}`;
      const records = await client.runSuite(
        suiteRel,
        (tc) => runE2eScenario(tc, rendererToAgentSchema),
        E2E_SKIP_TEST_NAMES,
      );
      expect(records.every((r) => r.status === "passed")).toBe(true);
      totalPassed += records.length;
    }
    expect(totalPassed).toBe(yamlFiles.length);
  });
});
