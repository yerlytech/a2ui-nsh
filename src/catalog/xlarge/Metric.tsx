/**
 * xlarge catalog `Metric` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * One number with its change: the translated `label`, the bound `value`
 * formatted by `format` from its text (never through a float), and the bound
 * `change` with an arrow, coloured by `better` (`up` or `down`): the better way
 * is drawn in the primary colour, the other in the destructive one, a flat
 * change muted. `accent` colours the card's edge (`Text.tone` words) and
 * `hint` (a code) shows under it.
 */

import { Text, View, computed, type JSX } from "nsh";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import {
  changeDirection,
  changeText,
  changeTone,
  metricText,
  textTone,
  type ChangeTone,
  type TextTone,
} from "./model";

const CHANGE_CLASS: Readonly<Record<ChangeTone, string>> = {
  good: "text-sm font-medium text-primary",
  bad: "text-sm font-medium text-destructive",
  neutral: "text-sm text-muted-foreground",
};

const ACCENT_CLASS: Readonly<Record<TextTone, string>> = {
  plain: "border-border",
  muted: "border-border",
  strong: "border-foreground",
  accent: "border-primary",
  danger: "border-destructive",
};

export function createXlargeMetric(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeMetric(props: A2uiComponentProps): JSX.Element {
    const labelProp = props.bridge.prop("label");
    const valueProp = props.bridge.prop("value");
    const formatProp = props.bridge.prop("format");
    const changeProp = props.bridge.prop("change");
    const betterProp = props.bridge.prop("better");
    const accentProp = props.bridge.prop("accent");
    const hintProp = props.bridge.prop("hint");

    const translated = (value: unknown): string | undefined => {
      const code = unwrapOptionalString(value);
      return code !== undefined ? options.translate(code) : undefined;
    };
    const label = computed(() => translated(labelProp()));
    const hint = computed(() => translated(hintProp()));
    const format = computed(() => unwrapBinding(formatProp()));
    const value = computed(() => metricText(unwrapBinding(valueProp()), format()));
    const change = computed(() => {
      const raw = unwrapBinding(changeProp());
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        return undefined;
      }
      const direction = changeDirection(raw);
      const arrow = direction === "up" ? "▲ " : direction === "down" ? "▼ " : "";
      return {
        text: `${arrow}${changeText(raw, format())}`,
        tone: changeTone(direction, unwrapBinding(betterProp())),
      };
    });
    const frame = computed(
      () =>
        `gap-1 rounded-(--radius) border border-l-4 bg-card p-4 ${ACCENT_CLASS[textTone(unwrapBinding(accentProp()))]}`,
    );

    return (
      <View
        testID={props.testId}
        class={frame()}
        accessibilityLabel={[label(), value(), change()?.text].filter((part) => part).join(", ")}
      >
        <If when={label() !== undefined}>
          <Text testID={`${props.testId}:label`} class="text-sm text-muted-foreground">
            {label() ?? ""}
          </Text>
        </If>
        <Text testID={`${props.testId}:value`} class="text-2xl font-semibold text-foreground">
          {value()}
        </Text>
        <If when={change() !== undefined}>
          <Text testID={`${props.testId}:change`} class={CHANGE_CLASS[change()?.tone ?? "neutral"]}>
            {change()?.text ?? ""}
          </Text>
        </If>
        <If when={hint() !== undefined}>
          <Text testID={`${props.testId}:hint`} class="text-xs text-muted-foreground">
            {hint() ?? ""}
          </Text>
        </If>
      </View>
    );
  };
}
