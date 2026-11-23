/**
 * xlarge catalog `Confirm` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Asks the translation of `question` with a yes button (`confirmLabel`, a
 * code, or the host's word) and a cancel button (the host's `cancelLabel`).
 * Yes sends the A2UI 1.0 event `action` with the literal `context` (or `{}`),
 * then follows `after` (`screenAction`). `cancel` is an action name, as in
 * xlarge's web client (`cancel = "screen:imports.jobs"`): pressing cancel
 * sends it with an empty context when it is set. Either answer closes the
 * question. The ask is the one `Button` with `confirm` shows (`AskPanel`,
 * `askStep`).
 */

import { computed, signal, type JSX } from "nsh";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { AskPanel, sendXlargeAction } from "./ask";
import type { ResolvedXlargeOptions } from "./context";
import { askStep, literalContext, screenAction } from "./model";

export function createXlargeConfirm(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeConfirm(props: A2uiComponentProps): JSX.Element {
    const questionProp = props.bridge.prop("question");
    const actionProp = props.bridge.prop("action");
    const contextProp = props.bridge.prop("context");
    const afterProp = props.bridge.prop("after");
    const confirmLabelProp = props.bridge.prop("confirmLabel");
    const cancelProp = props.bridge.prop("cancel");

    const translated = (value: unknown): string | undefined => {
      const code = unwrapOptionalString(value);
      return code !== undefined ? options.translate(code) : undefined;
    };
    const question = computed(() => translated(questionProp()) ?? options.confirmQuestion);
    const yesLabel = computed(() => translated(confirmLabelProp()) ?? options.confirmLabel);
    // A Confirm is the question itself: it is asking until it is answered.
    const asking = signal(askStep("press", true).asking);
    const sending = signal(false);

    const yes = async (): Promise<void> => {
      const next = askStep("yes", true);
      const name = unwrapOptionalString(actionProp());
      if (name === undefined) {
        asking.set(next.asking);
        return;
      }
      sending.set(true);
      try {
        const sent = await sendXlargeAction(
          props,
          name,
          literalContext(unwrapBinding(contextProp())),
        );
        if (!sent) {
          return;
        }
        asking.set(next.asking);
        const after = screenAction(unwrapOptionalString(afterProp()));
        if (after !== undefined) {
          await sendXlargeAction(props, after, {});
        }
      } finally {
        sending.set(false);
      }
    };

    const cancel = (): void => {
      asking.set(askStep("cancel", true).asking);
      const name = unwrapOptionalString(cancelProp());
      if (name !== undefined) {
        void sendXlargeAction(props, name, {});
      }
    };

    return (
      <If when={asking()}>
        <AskPanel
          testId={props.testId}
          question={question()}
          yesLabel={yesLabel()}
          cancelLabel={options.cancelLabel}
          busy={sending()}
          onYes={() => {
            if (!sending()) {
              void yes();
            }
          }}
          onCancel={() => {
            if (!sending()) {
              cancel();
            }
          }}
        />
      </If>
    );
  };
}
