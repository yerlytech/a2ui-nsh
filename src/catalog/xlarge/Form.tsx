/**
 * xlarge catalog `Form` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Holds a draft for the `Field`s under it and, on submit:
 *
 * 1. refuses while a required field is empty (the message shows on the field);
 * 2. with `filters: "<tableId>"`, asks that table's `searchAction` again with
 *    its `searchInput` plus what the form holds (spec 008 in xlarge);
 * 3. otherwise sends the `submit` action with what the form holds, plus any
 *    literal `context` the form carries.
 *
 * Both go out as A2UI 1.0 `action` events (`name`, `context`) sourced from the
 * form, through the same dispatcher a Basic Catalog `Button` uses. A `dialog`
 * form is closed behind a button named by its `title` until pressed, and
 * closes again after a send.
 */

import { Text, View, computed, signal, type JSX } from "nsh";
import { Button } from "nsh/base";
import {
  isComponentNode,
  type ComponentNode,
} from "../../core/resolver";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { extractChildNodes } from "../basic/layout_helpers";
import {
  FormDraftContext,
  createFormDraft,
  type ResolvedXlargeOptions,
} from "./context";
import {
  eventPayload,
  heldValues,
  missingRequired,
  type FieldSpec,
} from "./model";

/** The `Field`s drawn under `node`, depth first, not crossing a nested `Form`. */
export function collectFieldSpecs(node: ComponentNode): readonly FieldSpec[] {
  const out: FieldSpec[] = [];
  const visit = (current: ComponentNode, isRoot: boolean): void => {
    if (!isRoot && current.type === "Form") {
      return;
    }
    if (current.type === "Field") {
      const name = current.props["field"];
      if (typeof name === "string" && name.length > 0) {
        const checks = current.props["checks"];
        out.push({
          name,
          required: Array.isArray(checks) && checks.includes("required"),
          fallback: unwrapBinding(current.props["default"]),
        });
      }
    }
    for (const value of Object.values(current.props)) {
      if (isComponentNode(value)) {
        visit(value, false);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (isComponentNode(item)) {
            visit(item, false);
          }
        }
      }
    }
  };
  visit(node, true);
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PRIMARY_BUTTON =
  "min-h-[44px] flex-row items-center justify-center rounded-(--radius) bg-primary px-4 py-2 hover:opacity-90 active:opacity-80 disabled:opacity-50 focus-visible:outline-2";
const SECONDARY_BUTTON =
  "min-h-[44px] flex-row items-center justify-center rounded-(--radius) border border-border bg-secondary px-4 py-2 hover:bg-muted active:opacity-80 disabled:opacity-50 focus-visible:outline-2";

export function createXlargeForm(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeForm(props: A2uiComponentProps): JSX.Element {
    const draft = createFormDraft();

    const childrenProp = props.bridge.prop("children");
    const titleProp = props.bridge.prop("title");
    const submitProp = props.bridge.prop("submit");
    const submitLabelProp = props.bridge.prop("submitLabel");
    const filtersProp = props.bridge.prop("filters");
    const dialogProp = props.bridge.prop("dialog");
    const contextProp = props.bridge.prop("context");
    const rowProp = props.bridge.prop("row");

    const children = computed(() => extractChildNodes(childrenProp()));
    const title = computed(() => {
      const code = unwrapOptionalString(titleProp());
      return code !== undefined ? options.translate(code) : undefined;
    });
    const submitLabel = computed(() =>
      options.translate(unwrapOptionalString(submitLabelProp()) ?? "action.save"),
    );
    const isDialog = computed(() => dialogProp() === true);
    const open = signal(false);
    const showBody = computed(() => !isDialog() || open());
    const sending = signal(false);

    const send = async (): Promise<void> => {
      if (sending()) {
        return;
      }
      const fields = collectFieldSpecs(props.node);
      const values = draft.values();
      const missing = missingRequired(fields, values);
      if (missing.length > 0) {
        const errors: Record<string, string> = {};
        for (const name of missing) {
          errors[name] = options.requiredMessage;
        }
        draft.errors.set(errors);
        return;
      }
      draft.errors.set({});
      const held = heldValues(fields, values);

      let payload: ReturnType<typeof eventPayload> | undefined;
      const filters = unwrapOptionalString(filtersProp());
      if (filters !== undefined) {
        const table = props.store.surface.components.get(filters);
        const tableProps = table?.properties ?? {};
        const searchAction = tableProps["searchAction"];
        if (typeof searchAction !== "string" || searchAction.length === 0) {
          return;
        }
        const base = isObject(tableProps["searchInput"]) ? tableProps["searchInput"] : {};
        payload = eventPayload(searchAction, { ...base, ...held });
      } else {
        const submit = unwrapOptionalString(submitProp());
        if (submit === undefined) {
          return;
        }
        const given = isObject(contextProp()) ? (contextProp() as Record<string, unknown>) : {};
        payload = eventPayload(submit, { ...given, ...held });
      }

      sending.set(true);
      try {
        const result = await props.store.resolver.dispatchNodeAction(
          props.node,
          payload,
          { userActivation: true },
        );
        if (result.kind === "event" && filters === undefined) {
          draft.reset();
          open.set(false);
        }
      } finally {
        sending.set(false);
      }
    };

    return (
      <View testID={props.testId} class="gap-3">
        <If when={isDialog() && !open()}>
          <Button
            testID={`${props.testId}:open`}
            accessibilityLabel={title() ?? submitLabel()}
            class={PRIMARY_BUTTON}
            onPress={() => open.set(true)}
          >
            <Text class="text-sm font-medium text-primary-foreground">
              {title() ?? submitLabel()}
            </Text>
          </Button>
        </If>
        <If when={showBody()}>
          <View
            testID={`${props.testId}:body`}
            class={isDialog() ? "gap-3 rounded-(--radius) border border-border bg-card p-4" : "gap-3"}
            role={isDialog() ? "dialog" : "group"}
            accessibilityLabel={title()}
          >
            <If when={isDialog() && title() !== undefined}>
              <Text testID={`${props.testId}:title`} role="header" class="text-base font-semibold text-foreground">
                {title() ?? ""}
              </Text>
            </If>
            <FormDraftContext.Provider value={draft}>
              <View class={rowProp() === true ? "flex-row flex-wrap gap-3" : "gap-3"}>
                <Each of={children()} key={(child) => child.id}>
                  {(child) => props.renderNode(child())}
                </Each>
              </View>
            </FormDraftContext.Provider>
            <View class="flex-row gap-2">
              <Button
                testID={`${props.testId}:submit`}
                accessibilityLabel={submitLabel()}
                disabled={sending()}
                class={PRIMARY_BUTTON}
                onPress={() => {
                  void send();
                }}
              >
                <Text class="text-sm font-medium text-primary-foreground">{submitLabel()}</Text>
              </Button>
              <If when={isDialog()}>
                <Button
                  testID={`${props.testId}:cancel`}
                  accessibilityLabel={options.cancelLabel}
                  class={SECONDARY_BUTTON}
                  onPress={() => {
                    draft.reset();
                    open.set(false);
                  }}
                >
                  <Text class="text-sm text-secondary-foreground">{options.cancelLabel}</Text>
                </Button>
              </If>
            </View>
          </View>
        </If>
      </View>
    );
  };
}
