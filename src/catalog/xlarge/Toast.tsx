/**
 * xlarge catalog `Toast` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * A passing message: the translation of `code`, filled from `params`, shown
 * once. It passes after `toastMs` (the host's option), when swiped away, or
 * when its close button is pressed; the same message does not come back while
 * the component stays on the surface. A different message shows again.
 */

import { Text, View, computed, effect, signal, type JSX } from "nsh";
import { Button, Toast, ToastStack } from "nsh/base";
import {
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import { messageText } from "./model";

export function createXlargeToast(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeToast(props: A2uiComponentProps): JSX.Element {
    const codeProp = props.bridge.prop("code");
    const paramsProp = props.bridge.prop("params");

    const message = computed(() => {
      const code = unwrapOptionalString(codeProp());
      return code !== undefined ? messageText(code, paramsProp(), options.translate) : undefined;
    });
    // The message that has passed; it stays passed (shown once).
    const passed = signal<string | undefined>(undefined);
    const showing = computed(() => message() !== undefined && passed() !== message());
    const dismiss = (): void => passed.set(message());

    effect(() => {
      const shown = message();
      if (shown === undefined || !showing() || options.toastMs <= 0) {
        return;
      }
      const timer = options.timers.setTimeout(() => passed.set(shown), options.toastMs);
      return () => options.timers.clearTimeout(timer);
    });

    return (
      <View testID={`${props.testId}:container`}>
        <If when={showing()}>
          <ToastStack class="w-full" onCancel={dismiss}>
            <Toast
              testID={props.testId}
              transitionStatus="present"
              accessibilityLabel={message() ?? ""}
              onDismissRequest={dismiss}
              class="flex-row items-center gap-3 rounded-(--radius) border border-border bg-popover px-4 py-3"
            >
              <Text class="flex-1 text-sm text-popover-foreground">{message() ?? ""}</Text>
              <Button
                testID={`${props.testId}:dismiss`}
                accessibilityLabel={options.dismissLabel}
                class="min-h-[44px] min-w-[44px] items-center justify-center rounded-(--radius) hover:bg-muted focus-visible:outline-2"
                onPress={dismiss}
              >
                <Text class="text-sm text-muted-foreground">×</Text>
              </Button>
            </Toast>
          </ToastStack>
        </If>
      </View>
    );
  };
}
