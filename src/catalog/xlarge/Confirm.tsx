/**
 * xlarge catalog `Confirm` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Asks the translation of `question` with a yes button (`confirmLabel`, a
 * code, or the host's word) and a cancel button (`cancel`, a code, or the
 * host's word). Only yes sends the A2UI 1.0 event `action` with an empty
 * context; cancel sends nothing. Either answer closes the question. The ask is
 * the one `Button` with `confirm` shows (`AskPanel`, `askStep`).
 */

import { computed, signal, type JSX } from "nsh";
import {
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { AskPanel, sendXlargeAction } from "./ask";
import type { ResolvedXlargeOptions } from "./context";
import { askStep } from "./model";

export function createXlargeConfirm(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeConfirm(props: A2uiComponentProps): JSX.Element {
    const questionProp = props.bridge.prop("question");
    const actionProp = props.bridge.prop("action");
    const confirmLabelProp = props.bridge.prop("confirmLabel");
    const cancelProp = props.bridge.prop("cancel");

    const translated = (value: unknown): string | undefined => {
      const code = unwrapOptionalString(value);
      return code !== undefined ? options.translate(code) : undefined;
    };
    const question = computed(() => translated(questionProp()) ?? options.confirmQuestion);
    const yesLabel = computed(() => translated(confirmLabelProp()) ?? options.confirmLabel);
    const cancelLabel = computed(() => translated(cancelProp()) ?? options.cancelLabel);
    // A Confirm is the question itself: it is asking until it is answered.
    const asking = signal(askStep("press", true).asking);
    const sending = signal(false);

    const answer = (which: "yes" | "cancel"): void => {
      if (sending()) {
        return;
      }
      const next = askStep(which, true);
      const name = unwrapOptionalString(actionProp());
      if (!next.send || name === undefined) {
        asking.set(next.asking);
        return;
      }
      sending.set(true);
      void sendXlargeAction(props, name, {}).then((sent) => {
        sending.set(false);
        if (sent) {
          asking.set(next.asking);
        }
      });
    };

    return (
      <If when={asking()}>
        <AskPanel
          testId={props.testId}
          question={question()}
          yesLabel={yesLabel()}
          cancelLabel={cancelLabel()}
          busy={sending()}
          onYes={() => answer("yes")}
          onCancel={() => answer("cancel")}
        />
      </If>
    );
  };
}
