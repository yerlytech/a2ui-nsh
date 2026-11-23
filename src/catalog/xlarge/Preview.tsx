/**
 * xlarge catalog `Preview` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Shows a draft before it is kept: the translation of `about` as its heading,
 * then one line per `draft` entry (`draftLines`: amounts as typed text, never
 * through a float). Its accept button (`label`, a code, or the host's word)
 * sends the A2UI 1.0 event `action` with an empty context. With `confirm` the
 * press asks first, the way `Confirm` does (`AskPanel`, `askStep`).
 */

import { Text, View, computed, signal, type JSX } from "nsh";
import { Button } from "nsh/base";
import {
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { AskPanel, BUTTON_CLASS, BUTTON_TEXT_CLASS, sendXlargeAction } from "./ask";
import type { ResolvedXlargeOptions } from "./context";
import { askStep, draftLines } from "./model";

export function createXlargePreview(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargePreview(props: A2uiComponentProps): JSX.Element {
    const aboutProp = props.bridge.prop("about");
    const actionProp = props.bridge.prop("action");
    const labelProp = props.bridge.prop("label");
    const draftProp = props.bridge.prop("draft");
    const confirmProp = props.bridge.prop("confirm");

    const translated = (value: unknown): string | undefined => {
      const code = unwrapOptionalString(value);
      return code !== undefined ? options.translate(code) : undefined;
    };
    const about = computed(() => translated(aboutProp()));
    const label = computed(() => translated(labelProp()) ?? options.acceptLabel);
    const action = computed(() => unwrapOptionalString(actionProp()));
    const lines = computed(() =>
      draftLines(draftProp(), options.translate).map((line, index) => ({ ...line, index })),
    );
    const asking = signal(false);
    const sending = signal(false);

    const step = (which: "press" | "yes" | "cancel"): void => {
      const next = askStep(which, confirmProp() === true);
      asking.set(next.asking);
      const name = action();
      if (!next.send || name === undefined || sending()) {
        return;
      }
      sending.set(true);
      void sendXlargeAction(props, name, {}).finally(() => sending.set(false));
    };

    return (
      <View
        testID={props.testId}
        role="group"
        accessibilityLabel={about()}
        class="gap-3 rounded-(--radius) border border-border bg-card p-4"
      >
        <If when={about() !== undefined}>
          <Text testID={`${props.testId}:about`} role="header" class="text-base font-semibold text-foreground">
            {about() ?? ""}
          </Text>
        </If>
        <View class="gap-1">
          <Each of={lines()} key="index">
            {(line) => (
              <View testID={`${props.testId}:line:${line().index}`} class="flex-row flex-wrap gap-2">
                <If when={line().label !== undefined}>
                  <Text class="text-sm text-muted-foreground">{line().label ?? ""}</Text>
                </If>
                <Text class="text-sm text-foreground">{line().value}</Text>
              </View>
            )}
          </Each>
        </View>
        <View class="flex-row">
          <Button
            testID={`${props.testId}:accept`}
            accessibilityLabel={label()}
            disabled={action() === undefined || sending() || asking()}
            class={BUTTON_CLASS.primary}
            onPress={() => step("press")}
          >
            <Text class={BUTTON_TEXT_CLASS.primary}>{label()}</Text>
          </Button>
        </View>
        <If when={asking()}>
          <AskPanel
            testId={`${props.testId}:ask`}
            question={options.confirmQuestion}
            yesLabel={label()}
            cancelLabel={options.cancelLabel}
            busy={sending()}
            onYes={() => step("yes")}
            onCancel={() => step("cancel")}
          />
        </If>
      </View>
    );
  };
}
