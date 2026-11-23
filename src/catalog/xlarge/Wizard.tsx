/**
 * xlarge catalog `Wizard` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * A form spread over pages: each of its `children` is one page, shown one at
 * a time with a back and a next button. All pages share one draft (spec 003's
 * `FormDraftContext`), so what a person typed stays when they go back. Next
 * refuses while a required field of the page holds nothing (the message shows
 * on the field). On the last page the next button is `submitLabel` and sends
 * `submit` with the whole draft (defaults filled, blanks left out); with
 * `confirm` it asks first (`AskPanel`, `askStep`). After a send the draft is
 * empty and page one shows again; with `after`, the screen it names opens
 * (the event `screen:<after>`, as a `Refusal`'s `back`).
 */

import { Text, View, computed, signal, type JSX } from "nsh";
import { Button } from "nsh/base";
import type { ComponentNode } from "../../core/resolver";
import {
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { extractChildNodes } from "../basic/layout_helpers";
import { AskPanel, BUTTON_CLASS, BUTTON_TEXT_CLASS, sendXlargeAction } from "./ask";
import { FormDraftContext, createFormDraft, type ResolvedXlargeOptions } from "./context";
import { collectFieldSpecs } from "./Form";
import {
  askStep,
  heldValues,
  missingRequired,
  screenAction,
  wizardStep,
} from "./model";

export function createXlargeWizard(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeWizard(props: A2uiComponentProps): JSX.Element {
    const draft = createFormDraft();

    const childrenProp = props.bridge.prop("children");
    const submitProp = props.bridge.prop("submit");
    const submitLabelProp = props.bridge.prop("submitLabel");
    const confirmProp = props.bridge.prop("confirm");
    const afterProp = props.bridge.prop("after");

    const pages = computed(() => extractChildNodes(childrenProp()));
    const page = signal(0);
    const shownPage = computed(() =>
      Math.min(page(), Math.max(0, pages().length - 1)),
    );
    const current = computed<readonly ComponentNode[]>(() => {
      const node = pages()[shownPage()];
      return node !== undefined ? [node] : [];
    });
    const isLast = computed(() => shownPage() >= pages().length - 1);
    const submitLabel = computed(() =>
      options.translate(unwrapOptionalString(submitLabelProp()) ?? "action.save"),
    );
    const nextLabel = computed(() => (isLast() ? submitLabel() : options.nextLabel));
    const asking = signal(false);
    const sending = signal(false);

    /** Marks the required fields of `nodes` that hold nothing; true when none. */
    const check = (nodes: readonly ComponentNode[]): boolean => {
      const fields = nodes.flatMap((node) => collectFieldSpecs(node));
      const missing = missingRequired(fields, draft.values());
      if (missing.length === 0) {
        return true;
      }
      const errors: Record<string, string> = {};
      for (const name of missing) {
        errors[name] = options.requiredMessage;
      }
      draft.errors.set(errors);
      return false;
    };

    const send = async (): Promise<void> => {
      const name = unwrapOptionalString(submitProp());
      if (name === undefined || sending()) {
        return;
      }
      const held = heldValues(collectFieldSpecs(props.node), draft.values());
      sending.set(true);
      try {
        const sent = await sendXlargeAction(props, name, held);
        if (!sent) {
          return;
        }
        draft.reset();
        page.set(0);
        const after = screenAction(afterProp());
        if (after !== undefined) {
          await sendXlargeAction(props, after, {});
        }
      } finally {
        sending.set(false);
      }
    };

    const next = (): void => {
      if (sending()) {
        return;
      }
      const all = pages();
      const step = wizardStep("next", shownPage(), all.length, check(current()));
      if (!step.submit) {
        page.set(step.page);
        return;
      }
      // Every page was checked on the way; check them all again before sending.
      const firstIncomplete = all.findIndex(
        (node) => missingRequired(collectFieldSpecs(node), draft.values()).length > 0,
      );
      if (firstIncomplete >= 0) {
        page.set(firstIncomplete);
        check([all[firstIncomplete]!]);
        return;
      }
      draft.errors.set({});
      const ask = askStep("press", confirmProp() === true);
      asking.set(ask.asking);
      if (ask.send) {
        void send();
      }
    };

    const answer = (which: "yes" | "cancel"): void => {
      const ask = askStep(which, true);
      asking.set(ask.asking);
      if (ask.send) {
        void send();
      }
    };

    return (
      <View testID={props.testId} role="group" class="gap-3">
        <Text testID={`${props.testId}:page`} class="text-xs text-muted-foreground">
          {`${shownPage() + 1} / ${Math.max(1, pages().length)}`}
        </Text>
        <FormDraftContext.Provider value={draft}>
          <View testID={`${props.testId}:body`} class="gap-3">
            <Each of={current()} key={(child) => child.id}>
              {(child) => props.renderNode(child())}
            </Each>
          </View>
        </FormDraftContext.Provider>
        <View class="flex-row flex-wrap gap-2">
          <If when={shownPage() > 0}>
            <Button
              testID={`${props.testId}:back`}
              accessibilityLabel={options.backLabel}
              disabled={sending() || asking()}
              class={BUTTON_CLASS.secondary}
              onPress={() => {
                draft.errors.set({});
                page.set(wizardStep("back", shownPage(), pages().length, true).page);
              }}
            >
              <Text class={BUTTON_TEXT_CLASS.secondary}>{options.backLabel}</Text>
            </Button>
          </If>
          <Button
            testID={`${props.testId}:next`}
            accessibilityLabel={nextLabel()}
            disabled={sending() || asking() || (isLast() && unwrapOptionalString(submitProp()) === undefined)}
            class={BUTTON_CLASS.primary}
            onPress={next}
          >
            <Text class={BUTTON_TEXT_CLASS.primary}>{nextLabel()}</Text>
          </Button>
        </View>
        <If when={asking()}>
          <AskPanel
            testId={`${props.testId}:ask`}
            question={options.confirmQuestion}
            yesLabel={submitLabel()}
            cancelLabel={options.cancelLabel}
            busy={sending()}
            onYes={() => answer("yes")}
            onCancel={() => answer("cancel")}
          />
        </If>
      </View>
    );
  };
}
