/**
 * xlarge catalog `Text` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Shows the translation of `code` with its `{name}` placeholders filled from
 * `params` or, without `code`, `text` (a dynamic string: data, shown as it is).
 * `code` wins when both are set, as in xlarge's web client.
 * `tone` picks the colour and weight; an unknown tone draws plain.
 */

import { Text, computed, type JSX } from "nsh";
import {
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import { messageText, textTone, type TextTone } from "./model";

const TONE_CLASS: Readonly<Record<TextTone, string>> = {
  plain: "text-sm text-foreground",
  muted: "text-sm text-muted-foreground",
  strong: "text-sm font-semibold text-foreground",
  accent: "text-sm font-medium text-primary",
  danger: "text-sm font-medium text-destructive",
};

export function createXlargeText(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeText(props: A2uiComponentProps): JSX.Element {
    const textProp = props.bridge.prop("text");
    const codeProp = props.bridge.prop("code");
    const paramsProp = props.bridge.prop("params");
    const toneProp = props.bridge.prop("tone");

    // `code` wins over `text`, as in xlarge's web client.
    const content = computed(() => {
      const code = unwrapOptionalString(codeProp());
      if (code !== undefined) {
        return messageText(code, paramsProp(), options.translate);
      }
      return unwrapOptionalString(textProp()) ?? "";
    });
    const tone = computed(() => textTone(toneProp()));

    return (
      <Text testID={props.testId} class={TONE_CLASS[tone()]}>
        {content()}
      </Text>
    );
  };
}
