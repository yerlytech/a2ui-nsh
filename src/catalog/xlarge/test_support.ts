// Shared helpers for the xlarge catalog component tests.

import fixture from "../../../tests/fixtures/xlarge/crm-deals.json";
import { XLARGE_CATALOG_V1_ID } from "./model";

export const HARNESS = "./test_harness.tsx";

/** xlarge's published catalog definition, as its server sent it. */
export const XLARGE_CATALOG: unknown = fixture.catalog;

/** The two messages that open `surfaceId` with `components` and `dataModel`. */
export function surfaceMessages(
  surfaceId: string,
  components: readonly Record<string, unknown>[],
  dataModel: Record<string, unknown> = {},
): unknown[] {
  return [
    { version: "1.0", createSurface: { surfaceId, catalogId: XLARGE_CATALOG_V1_ID } },
    { version: "1.0", updateComponents: { surfaceId, components } },
    { version: "1.0", updateDataModel: { surfaceId, path: "/", value: dataModel } },
  ];
}

/** `open()` options for the xlarge harness. */
export function harnessOptions(
  messages: unknown[],
  translations: Record<string, string> = {},
  extra: Record<string, unknown> = {},
) {
  return {
    host: {
      params: { catalog: XLARGE_CATALOG, messages, translations, strictMode: true, ...extra },
      handlers: {
        "a2ui.action": null,
        "a2ui.error": null,
        "a2ui.exception": null,
        "a2ui.openUrl": null,
        "a2ui.announce": null,
      },
    },
  };
}

export interface SentAction {
  readonly name: string;
  readonly sourceComponentId: string;
  readonly context: Record<string, unknown>;
}

/** The action events the harness reported, oldest first. */
export function sentActions(app: {
  host: { posts(): { name: string; data?: unknown }[] };
}): SentAction[] {
  return app.host
    .posts()
    .filter((post) => post.name === "a2ui.action")
    .map((post) => (post.data as { action: SentAction }).action)
    .map(({ name, sourceComponentId, context }) => ({ name, sourceComponentId, context }));
}

/** What the renderers announced, oldest first. */
export function announced(app: {
  host: { posts(): { name: string; data?: unknown }[] };
}): string[] {
  return app.host
    .posts()
    .filter((post) => post.name === "a2ui.announce")
    .map((post) => (post.data as { message: string }).message);
}

/** Errors and exceptions the harness reported. */
export function reportedErrors(app: {
  host: { posts(): { name: string; data?: unknown }[] };
}): unknown[] {
  return app.host
    .posts()
    .filter((post) => post.name === "a2ui.error" || post.name === "a2ui.exception")
    .map((post) => post.data);
}
