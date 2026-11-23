/**
 * xlarge catalog `Calendar` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * One month of every dated thing a person may see (xlarge spec 111), as the
 * platform's `calendar.month` answers it at the bound `month`: `{ month,
 * first, last, previous, next, items, sources, missing }`. Weeks Monday
 * first, each day with its items; an item is a button that sends its own
 * `screen` (`screen:work_orders.order`) with `{ id }`. The month before and
 * after read the `screen` again for that month: `{ event: { name:
 * "screen:<screen>", context: { period: "between", from, to } } }`, as
 * xlarge's client asks. A filter by what the items are (`sources`, one module
 * or everything), and a line for each module that could not be read
 * (`missing`). The heading and weekday words are the host's (`monthLabels`,
 * `weekdayLabels`); the rest are xlarge's codes (`calendar.*`), translated.
 */

import { Text, View, computed, signal, token, type JSX } from "nsh";
import { Button } from "nsh/base";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { BUTTON_CLASS, BUTTON_TEXT_CLASS, sendXlargeAction } from "./ask";
import type { ResolvedXlargeOptions } from "./context";
import {
  calendarMonth,
  calendarPeriod,
  fillParams,
  screenAction,
  type CalendarItem,
  type StateTone,
} from "./model";

const TONE_TOKEN: Readonly<Record<StateTone, Parameters<typeof token>[0]>> = {
  neutral: "muted-foreground",
  info: "primary",
  success: "chart-2",
  warning: "chart-4",
  danger: "destructive",
};

const CHIP =
  "min-h-[32px] flex-row items-center gap-1 rounded-(--radius) border border-border bg-secondary px-2 py-1 hover:bg-muted active:opacity-80 focus-visible:outline-2";

export function createXlargeCalendar(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeCalendar(props: A2uiComponentProps): JSX.Element {
    const monthProp = props.bridge.prop("month");
    const screenProp = props.bridge.prop("screen");
    const only = signal("");

    const shown = computed(() => calendarMonth(unwrapBinding(monthProp()), only()));
    const heading = computed(() => {
      const month = shown();
      return month !== undefined
        ? `${options.monthLabels[month.monthNumber - 1] ?? month.monthNumber} ${month.year}`
        : "";
    });
    const weeks = computed(() =>
      (shown()?.weeks ?? []).map((days, index) => ({ key: `week:${index}`, days })),
    );
    const filters = computed(() => [
      { key: "", label: options.translate("calendar.everything") },
      ...(shown()?.sources ?? []).map((source) => ({
        key: source.module,
        label: `${options.translate(source.label)} (${source.count})`,
      })),
    ]);

    const go = (to: string | undefined): void => {
      const name = screenAction(unwrapOptionalString(screenProp()));
      const context = calendarPeriod(to);
      if (name !== undefined && context !== undefined) {
        void sendXlargeAction(props, name, context);
      }
    };
    const open = (item: CalendarItem): void => {
      if (item.screen !== "" && item.id !== "") {
        void sendXlargeAction(props, item.screen, { id: item.id });
      }
    };
    const itemLabel = (item: CalendarItem): string =>
      [item.day, item.time, item.title].filter((part) => part !== "").join(" ");

    return (
      <View testID={props.testId} class="gap-3" accessibilityLabel={heading()}>
        <If when={shown() !== undefined}>
          <View class="flex-row flex-wrap items-center gap-2">
            <Button
              testID={`${props.testId}:previous`}
              accessibilityLabel={options.translate("calendar.action.previous")}
              disabled={shown()?.previous === ""}
              class={BUTTON_CLASS.secondary}
              onPress={() => go(shown()?.previous)}
            >
              <Text class={BUTTON_TEXT_CLASS.secondary}>‹</Text>
            </Button>
            <Text testID={`${props.testId}:month`} role="header" class="text-lg font-semibold text-foreground">
              {heading()}
            </Text>
            <Button
              testID={`${props.testId}:next`}
              accessibilityLabel={options.translate("calendar.action.next")}
              disabled={shown()?.next === ""}
              class={BUTTON_CLASS.secondary}
              onPress={() => go(shown()?.next)}
            >
              <Text class={BUTTON_TEXT_CLASS.secondary}>›</Text>
            </Button>
          </View>
          <View
            testID={`${props.testId}:filter`}
            class="flex-row flex-wrap items-center gap-2"
            accessibilityLabel={options.translate("calendar.field.showing")}
          >
            <Text class="text-sm text-muted-foreground">{options.translate("calendar.field.showing")}</Text>
            <Each of={filters()} key={(filter) => `filter:${filter.key}`}>
              {(filter) => (
                <Button
                  testID={`${props.testId}:filter:${filter().key === "" ? "all" : filter().key}`}
                  accessibilityLabel={filter().label}
                  selected={only() === filter().key}
                  class={only() === filter().key ? BUTTON_CLASS.primary : BUTTON_CLASS.secondary}
                  onPress={() => only.set(filter().key)}
                >
                  <Text class={only() === filter().key ? BUTTON_TEXT_CLASS.primary : BUTTON_TEXT_CLASS.secondary}>
                    {filter().label}
                  </Text>
                </Button>
              )}
            </Each>
          </View>
          <Each of={shown()?.missing ?? []} key={(missing) => `missing:${missing.module}`}>
            {(missing) => (
              <Text
                testID={`${props.testId}:missing:${missing().module}`}
                role="alert"
                class="rounded-(--radius) bg-muted px-3 py-2 text-sm text-destructive"
              >
                {fillParams(options.translate("calendar.could_not_read"), {
                  what: options.translate(missing().label),
                })}
              </Text>
            )}
          </Each>
          <View class="flex-row gap-1">
            <Each of={options.weekdayLabels} key="index">
              {(word) => <Text class="flex-1 text-center text-xs text-muted-foreground">{word()}</Text>}
            </Each>
          </View>
          <Each of={weeks()} key={(week) => week.key}>
            {(week) => (
              <View class="flex-row gap-1">
                <Each of={week().days} key={(day) => day.key}>
                  {(day) => (
                    <View
                      testID={day().date !== "" ? `${props.testId}:day:${day().date}` : undefined}
                      class={`min-h-[64px] flex-1 gap-1 rounded-(--radius) p-1 ${
                        day().date !== "" ? "border border-border bg-card" : ""
                      }`}
                    >
                      <If when={day().date !== ""}>
                        <Text class="text-xs font-semibold text-muted-foreground">{String(day().day)}</Text>
                        <Each of={day().items} key={(item) => item.key}>
                          {(item) => (
                            <Button
                              testID={`${props.testId}:item:${item().id}`}
                              accessibilityLabel={itemLabel(item())}
                              class={CHIP}
                              onPress={() => open(item())}
                            >
                              <View class="h-2 w-2 rounded-full" style={{ backgroundColor: String(token(TONE_TOKEN[item().tone])) }} />
                              <If when={item().time !== ""}>
                                <Text class="text-xs text-muted-foreground">{item().time}</Text>
                              </If>
                              <Text class="text-xs text-foreground">{item().title}</Text>
                            </Button>
                          )}
                        </Each>
                      </If>
                    </View>
                  )}
                </Each>
              </View>
            )}
          </Each>
          <If when={shown()?.shown === 0}>
            <Text testID={`${props.testId}:nothing`} class="text-sm text-muted-foreground">
              {options.translate("calendar.nothing")}
            </Text>
          </If>
        </If>
      </View>
    );
  };
}
