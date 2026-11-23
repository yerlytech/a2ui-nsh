/**
 * xlarge catalog `Calendar` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * A month grid of the bound `month` (`"YYYY-MM"`, or `{ month, days }` where
 * `days` marks a date with its count or label), weeks starting on Monday.
 * With `screen`, pressing a day opens that screen: an A2UI 1.0
 * `{ event: { name: "screen:<screen>", context: { date } } }`, the way xlarge
 * opens screens. The heading and weekday words are the host's
 * (`monthLabels`, `weekdayLabels`).
 */

import { Text, View, computed, type JSX } from "nsh";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import { calendarMonth, eventPayload, screenAction, type CalendarDay } from "./model";

export function createXlargeCalendar(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeCalendar(props: A2uiComponentProps): JSX.Element {
    const monthProp = props.bridge.prop("month");
    const screenProp = props.bridge.prop("screen");

    const grid = computed(() => calendarMonth(unwrapBinding(monthProp())));
    const action = computed(() => screenAction(unwrapOptionalString(screenProp())));
    const heading = computed(() => {
      const month = grid();
      return month !== undefined
        ? `${options.monthLabels[month.month - 1] ?? month.month} ${month.year}`
        : "";
    });
    const weeks = computed(() =>
      (grid()?.weeks ?? []).map((days, index) => ({ key: `week:${index}`, days })),
    );

    const open = (day: CalendarDay): void => {
      const name = action();
      if (name === undefined || day.date === "") {
        return;
      }
      void props.store.resolver
        .dispatchNodeAction(props.node, eventPayload(name, { date: day.date }), {
          userActivation: true,
        })
        .catch(() => undefined);
    };

    const dayLabel = (day: CalendarDay): string =>
      day.mark !== "" ? `${day.date}, ${day.mark}` : day.date;

    return (
      <View testID={props.testId} class="gap-1" accessibilityLabel={heading()}>
        <Text testID={`${props.testId}:month`} role="header" class="text-base font-semibold text-foreground">
          {heading()}
        </Text>
        <View class="flex-row">
          <Each of={options.weekdayLabels} key="index">
            {(word) => <Text class="flex-1 text-center text-xs text-muted-foreground">{word()}</Text>}
          </Each>
        </View>
        <Each of={weeks()} key={(week) => week.key}>
          {(week) => (
            <View class="flex-row gap-1">
              <Each of={week().days} key={(day) => day.key}>
                {(day) => (
                  <If when={day().date !== ""} else={<View class="min-h-[44px] flex-1" />}>
                    <View
                      testID={`${props.testId}:day:${day().date}`}
                      class={`min-h-[44px] flex-1 items-center justify-center rounded-(--radius) border border-border ${
                        action() !== undefined ? "hover:bg-muted active:opacity-80" : ""
                      } ${day().mark !== "" ? "bg-secondary" : ""}`}
                      role={action() !== undefined ? "button" : undefined}
                      accessibilityLabel={dayLabel(day())}
                      onPress={action() !== undefined ? () => open(day()) : undefined}
                    >
                      <Text class="text-sm text-foreground">{String(day().day)}</Text>
                      <If when={day().mark !== ""}>
                        <Text testID={`${props.testId}:mark:${day().date}`} class="text-xs text-primary">
                          {day().mark}
                        </Text>
                      </If>
                    </View>
                  </If>
                )}
              </Each>
            </View>
          )}
        </Each>
      </View>
    );
  };
}
