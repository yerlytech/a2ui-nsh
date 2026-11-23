/**
 * xlarge catalog `Refusal` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Explains why an action was refused: the translation of `code`, an optional
 * `hint` (a code), and, with `back`, a button that goes back. The button sends
 * `back` with an empty context: as it came when it is an action name (holds a
 * `:`), else the A2UI 1.0 event `screen:<back>`, the action xlarge opens
 * screens with (`screenAction`); it reads `backLabel` (a code) or the host's
 * word.
 */

import { Text, View, computed, type JSX } from "nsh";
import { Button } from "nsh/base";
import {
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import { eventPayload, screenAction } from "./model";

export function createXlargeRefusal(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeRefusal(props: A2uiComponentProps): JSX.Element {
    const codeProp = props.bridge.prop("code");
    const hintProp = props.bridge.prop("hint");
    const backProp = props.bridge.prop("back");
    const backLabelProp = props.bridge.prop("backLabel");

    const translated = (value: unknown): string | undefined => {
      const code = unwrapOptionalString(value);
      return code !== undefined ? options.translate(code) : undefined;
    };
    const message = computed(() => translated(codeProp()));
    const hint = computed(() => translated(hintProp()));
    const back = computed(() => screenAction(unwrapOptionalString(backProp())));
    const backLabel = computed(() => translated(backLabelProp()) ?? options.backLabel);

    const goBack = (): void => {
      const action = back();
      if (action === undefined) {
        return;
      }
      void props.store.resolver
        .dispatchNodeAction(props.node, eventPayload(action, {}), { userActivation: true })
        .catch(() => undefined);
    };

    return (
      <View
        testID={props.testId}
        role="alert"
        accessibilityLabel={message()}
        class="gap-3 rounded-(--radius) border border-destructive bg-card p-4"
      >
        <If when={message() !== undefined}>
          <Text testID={`${props.testId}:message`} class="text-base font-semibold text-destructive">
            {message() ?? ""}
          </Text>
        </If>
        <If when={hint() !== undefined}>
          <Text testID={`${props.testId}:hint`} class="text-sm text-muted-foreground">
            {hint() ?? ""}
          </Text>
        </If>
        <If when={back() !== undefined}>
          <View class="flex-row">
            <Button
              testID={`${props.testId}:back`}
              accessibilityLabel={backLabel()}
              class="min-h-[44px] flex-row items-center justify-center rounded-(--radius) border border-border bg-secondary px-4 py-2 hover:bg-muted active:opacity-80 focus-visible:outline-2"
              onPress={goBack}
            >
              <Text class="text-sm text-secondary-foreground">{backLabel()}</Text>
            </Button>
          </View>
        </If>
      </View>
    );
  };
}
