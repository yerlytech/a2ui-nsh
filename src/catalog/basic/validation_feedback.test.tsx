import { describe, expect, open, test } from "nsh/test";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
} from "../../core/catalog";
import { MessageProcessor } from "../../core/processor";
import {
  NodeResolver,
  ResolvedBinding,
  WritableBinding,
  isWritable,
} from "../../core/resolver";
import { extractCheckableState, writeBinding } from "./validation_feedback";

const HARNESS = "../../renderer/test_harness.tsx";

function result(
  message: string,
  severity: "error" | "warning" | "info",
  valid = false,
): Record<string, unknown> {
  return { valid, message, severity };
}

describe("extractCheckableState", () => {
  test("marks the state invalid only when isValid is exactly false", () => {
    const state = extractCheckableState(false, undefined, undefined);
    expect(state.isInvalid).toBe(true);
    expect(state.isValid).toBe(false);
  });

  test("treats true, undefined, and a string isValid as valid", () => {
    expect(extractCheckableState(true, undefined, undefined).isValid).toBe(true);
    expect(extractCheckableState(undefined, undefined, undefined).isValid).toBe(
      true,
    );
    expect(extractCheckableState("false", undefined, undefined).isValid).toBe(
      true,
    );
    expect(
      extractCheckableState("false", undefined, undefined).isInvalid,
    ).toBe(false);
  });

  test("prefers validationResults over validationErrors when both are arrays", () => {
    const state = extractCheckableState(
      false,
      ["legacy error"],
      [result("structured error", "error")],
    );
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]?.message).toBe("structured error");
    expect(state.results.map((item) => item.message)).toEqual([
      "structured error",
    ]);
  });

  test("an empty validationResults array still wins over validationErrors", () => {
    const state = extractCheckableState(false, ["legacy error"], []);
    expect(state.results).toHaveLength(0);
    expect(state.errors).toHaveLength(0);
  });

  test("drops validationResults entries whose valid flag is true", () => {
    const state = extractCheckableState(true, undefined, [
      result("passed", "error", true),
      result("failed", "error"),
    ]);
    expect(state.results.map((item) => item.message)).toEqual(["failed"]);
  });

  test("drops validationResults entries with a missing or unknown severity", () => {
    const state = extractCheckableState(true, undefined, [
      { valid: false, message: "no severity" },
      { valid: false, message: "bad severity", severity: "fatal" },
      { valid: false, message: "good", severity: "info" },
    ]);
    expect(state.results.map((item) => item.message)).toEqual(["good"]);
    expect(state.infos).toHaveLength(1);
  });

  test("drops validationResults entries whose message is not a string", () => {
    const state = extractCheckableState(true, undefined, [
      { valid: false, severity: "error" },
      { valid: false, message: 42, severity: "error" },
      { valid: false, message: "kept", severity: "warning" },
    ]);
    expect(state.results.map((item) => item.message)).toEqual(["kept"]);
    expect(state.warnings).toHaveLength(1);
  });

  test("drops non-object validationResults entries", () => {
    const state = extractCheckableState(true, undefined, [
      null,
      "text",
      7,
      [],
      result("kept", "error"),
    ]);
    expect(state.results.map((item) => item.message)).toEqual(["kept"]);
  });

  test("splits errors, warnings, and infos in declaration order", () => {
    const state = extractCheckableState(false, undefined, [
      result("first warning", "warning"),
      result("first error", "error"),
      result("info", "info"),
      result("second warning", "warning"),
      result("second error", "error"),
    ]);
    expect(state.results.map((item) => item.message)).toEqual([
      "first warning",
      "first error",
      "info",
      "second warning",
      "second error",
    ]);
    expect(state.errors.map((item) => item.message)).toEqual([
      "first error",
      "second error",
    ]);
    expect(state.warnings.map((item) => item.message)).toEqual([
      "first warning",
      "second warning",
    ]);
    expect(state.infos.map((item) => item.message)).toEqual(["info"]);
  });

  test("a warning-only list leaves isValid true", () => {
    const state = extractCheckableState(true, undefined, [
      result("heads up", "warning"),
    ]);
    expect(state.isValid).toBe(true);
    expect(state.isInvalid).toBe(false);
    expect(state.warnings).toHaveLength(1);
    expect(state.errors).toHaveLength(0);
  });

  test("turns validationErrors strings into error results in order", () => {
    const state = extractCheckableState(false, ["first", "second"], undefined);
    expect(state.errors.map((item) => item.message)).toEqual([
      "first",
      "second",
    ]);
    expect(state.errors[0]?.severity).toBe("error");
    expect(state.errors[0]?.valid).toBe(false);
  });

  test("drops empty and non-string validationErrors entries", () => {
    const state = extractCheckableState(
      false,
      ["", 42, null, "kept"],
      undefined,
    );
    expect(state.results.map((item) => item.message)).toEqual(["kept"]);
  });

  test("non-array props give empty lists", () => {
    const state = extractCheckableState(
      undefined,
      "not an array",
      "not an array",
    );
    expect(state.results).toHaveLength(0);
    expect(state.errors).toHaveLength(0);
    expect(state.warnings).toHaveLength(0);
    expect(state.infos).toHaveLength(0);
  });
});

describe("writeBinding", () => {
  function resolvedTextField(): {
    readonly surface: ReturnType<MessageProcessor["createSurfaceModel"]>;
    readonly resolver: NodeResolver;
    readonly binding: ResolvedBinding<unknown>;
  } {
    const catalog = Catalog.fromJson(buildV10BasicCatalogDocument());
    const processor = new MessageProcessor({
      catalogs: [catalog],
      strictMode: false,
    });
    const surface = processor.createSurfaceModel({
      id: "s_write_binding",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
      data: { name: "Ada" },
    });
    surface.upsertComponents([
      {
        id: "root",
        type: "TextField",
        catalogId: BASIC_CATALOG_V1_ID,
        catalog,
        properties: {
          label: "Name",
          value: { "@path": "/name" },
        },
        metadata: undefined,
        checks: undefined,
        accessibility: undefined,
        normalizedWire: {
          id: "root",
          component: "TextField",
          label: "Name",
          value: { "@path": "/name" },
        },
      },
    ]);
    const resolver = new NodeResolver({ surface, processor });
    return {
      surface,
      resolver,
      binding: resolver.rootNode!.props["value"] as ResolvedBinding<unknown>,
    };
  }

  test("sets a writable ResolvedBinding, returns true, and dependent reads see the new value", () => {
    const { surface, resolver, binding } = resolvedTextField();
    expect(binding instanceof WritableBinding).toBe(true);
    expect(isWritable(binding)).toBe(true);

    const seen: unknown[] = [];
    const subscription = surface.dataModel.subscribe("/name", (value) => {
      seen.push(value);
    });

    expect(writeBinding(binding, "Grace")).toBe(true);
    expect(surface.dataModel.get("/name")).toBe("Grace");
    expect(seen).toEqual(["Grace"]);

    subscription.unsubscribe();
    resolver.dispose();
  });

  test("returns false and changes nothing for a literal read-only binding", () => {
    const { surface, resolver } = resolvedTextField();
    const literal = new ResolvedBinding("literal");
    expect(writeBinding(literal, "changed")).toBe(false);
    expect(literal.value).toBe("literal");
    expect(surface.dataModel.get("/name")).toBe("Ada");
    resolver.dispose();
  });

  test("returns false and changes nothing for a resolved @call binding", () => {
    const catalog = Catalog.fromJson(buildV10BasicCatalogDocument());
    const processor = new MessageProcessor({
      catalogs: [catalog],
      strictMode: false,
    });
    const surface = processor.createSurfaceModel({
      id: "s_write_call",
      defaultCatalogId: BASIC_CATALOG_V1_ID,
      data: { name: "Ada" },
    });
    surface.upsertComponents([
      {
        id: "root",
        type: "Text",
        catalogId: BASIC_CATALOG_V1_ID,
        catalog,
        properties: {
          text: {
            "@call": "formatString",
            args: { value: "Hello ${/name}" },
          },
        },
        metadata: undefined,
        checks: undefined,
        accessibility: undefined,
        normalizedWire: {
          id: "root",
          component: "Text",
          text: {
            "@call": "formatString",
            args: { value: "Hello ${/name}" },
          },
        },
      },
    ]);
    const resolver = new NodeResolver({ surface, processor });
    const callBinding = resolver.rootNode!.props["text"] as ResolvedBinding<
      unknown
    >;
    expect(callBinding instanceof ResolvedBinding).toBe(true);
    expect(writeBinding(callBinding, "changed")).toBe(false);
    expect(surface.dataModel.get("/name")).toBe("Ada");
    resolver.dispose();
  });

  test("returns false for null", () => {
    expect(writeBinding(null, "changed")).toBe(false);
  });

  test("returns false and changes nothing for a plain object", () => {
    const plain = { value: "Ada", set: () => undefined };
    expect(writeBinding(plain, "changed")).toBe(false);
    expect(plain.value).toBe("Ada");
  });
});

describe("ValidationFeedback", () => {
  function checksMessages(): Record<string, unknown>[] {
    return [
      {
        version: "1.0",
        createSurface: {
          surfaceId: "s_vf",
          catalogId: BASIC_CATALOG_V1_ID,
          dataModel: {
            warning: result("Nickname is short.", "warning"),
            info: result("Add a phone number.", "info"),
            error: result("Email is required.", "error"),
          },
          components: [
            {
              id: "root",
              component: "Column",
              children: ["field", "muted_reference"],
            },
            {
              id: "field",
              component: "TextField",
              label: "Email",
              value: { "@path": "/email" },
              "@checks": [
                { condition: { "@path": "/warning" } },
                { condition: { "@path": "/info" } },
                { condition: { "@path": "/error" } },
              ],
            },
            {
              id: "muted_reference",
              component: "Text",
              text: "Muted reference",
              variant: "caption",
            },
          ],
        },
      },
    ];
  }

  test("renders one message per result in order under the checks container", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: { params: { messages: checksMessages() } },
    });

    expect(app.shows("id:s_vf:field:checks")).toBe(true);
    expect(app.shows("id:s_vf:field:checks:0")).toBe(true);
    expect(app.shows("id:s_vf:field:checks:1")).toBe(true);
    expect(app.shows("id:s_vf:field:checks:2")).toBe(true);

    const messages = new Set([
      "Nickname is short.",
      "Add a phone number.",
      "Email is required.",
    ]);
    const rendered = app.texts().filter((text) => messages.has(text));
    expect(rendered).toEqual([
      "Nickname is short.",
      "Add a phone number.",
      "Email is required.",
    ]);
  });

  test("uses the severity classes: destructive, amber, and muted foreground", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: { params: { messages: checksMessages() } },
    });

    const warning = app.spanStyle("text:Nickname is short.").color;
    const info = app.spanStyle("text:Add a phone number.").color;
    const error = app.spanStyle("text:Email is required.").color;
    const destructive = app.spanStyle("id:s_vf:field:label >> text:Email").color;
    const muted = app.spanStyle("text:Muted reference").color;

    // Error shares the invalid label text-destructive colour.
    expect(error).toBe(destructive);
    // Info shares a caption text-muted-foreground colour.
    expect(info).toBe(muted);
    // Warning is text-amber-600 in the light scheme.
    expect(warning).toBe("#e17100ff");
    expect(warning).not.toBe(error);
    expect(warning).not.toBe(info);
  });

  test("renders nothing when the results list is empty", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_vf_empty",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: { email: "ada@example.com" },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["field"],
                  },
                  {
                    id: "field",
                    component: "TextField",
                    label: "Email",
                    value: { "@path": "/email" },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(app.shows("id:s_vf_empty:field:checks")).toBe(false);
    expect(app.shows("id:s_vf_empty:field:checks:0")).toBe(false);
  });
});
