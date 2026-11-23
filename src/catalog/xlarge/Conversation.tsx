/**
 * xlarge catalog `Conversation` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * A message thread: the bound `rows`, oldest first, each with its author,
 * time and text; messages from this side sit at the end. The heading is the
 * translated `kind` (the thread's channel, a code) and the bound `called`
 * (who the thread is with, also the author of the other side's messages that
 * name none). The bound `around` is the `id` of the message the thread is
 * opened around: that message is marked. With `screen`, pressing a message
 * opens that screen: an A2UI 1.0 `{ event: { name: "screen:<screen>",
 * context: { id } } }`, as a `Table` row press does.
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
  conversationRows,
  eventPayload,
  screenAction,
  type ConversationRow,
} from "./model";

function scalar(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

export function createXlargeConversation(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeConversation(props: A2uiComponentProps): JSX.Element {
    const rowsProp = props.bridge.prop("rows");
    const kindProp = props.bridge.prop("kind");
    const aroundProp = props.bridge.prop("around");
    const calledProp = props.bridge.prop("called");
    const screenProp = props.bridge.prop("screen");

    const called = computed(() => scalar(unwrapBinding(calledProp())));
    const rows = computed(() => conversationRows(unwrapBinding(rowsProp()), called()));
    const around = computed(() => scalar(unwrapBinding(aroundProp())));
    const action = computed(() => screenAction(unwrapOptionalString(screenProp())));
    const heading = computed(() => {
      const kind = unwrapOptionalString(kindProp());
      return [kind !== undefined ? options.translate(kind) : undefined, called()]
        .filter((part) => part)
        .join(" · ");
    });

    const open = (row: ConversationRow): void => {
      const name = action();
      if (name === undefined || row.id === undefined || row.id === null) {
        return;
      }
      void props.store.resolver
        .dispatchNodeAction(props.node, eventPayload(name, { id: row.id }), {
          userActivation: true,
        })
        .catch(() => undefined);
    };

    const pressable = (row: ConversationRow): boolean =>
      action() !== undefined && row.id !== undefined && row.id !== null;
    const isAround = (row: ConversationRow): boolean =>
      around() !== undefined && scalar(row.id) === around();
    const bubble = (row: ConversationRow): string =>
      [
        "max-w-[80%] gap-1 rounded-(--radius) border px-3 py-2",
        row.mine ? "self-end bg-secondary" : "self-start bg-card",
        isAround(row) ? "border-primary border-2" : "border-border",
        pressable(row) ? "hover:bg-muted active:opacity-80" : "",
      ].join(" ");
    const rowLabel = (row: ConversationRow): string =>
      [row.author, row.at, row.text].filter((part) => part).join(", ");

    return (
      <View testID={props.testId} class="gap-2">
        <If when={heading() !== ""}>
          <Text testID={`${props.testId}:heading`} role="header" class="text-base font-semibold text-foreground">
            {heading()}
          </Text>
        </If>
        <Each of={rows()} key={(row) => row.key}>
          {(row) => (
            <View
              testID={`${props.testId}:row:${row().key}`}
              class={bubble(row())}
              role={pressable(row()) ? "button" : undefined}
              accessibilityLabel={rowLabel(row())}
              accessibilityState={isAround(row()) ? { selected: true } : undefined}
              onPress={pressable(row()) ? () => open(row()) : undefined}
            >
              <View class="flex-row flex-wrap gap-x-2">
                <If when={row().author !== ""}>
                  <Text class="text-xs font-semibold text-foreground">{row().author}</Text>
                </If>
                <If when={row().at !== ""}>
                  <Text class="text-xs text-muted-foreground">{row().at}</Text>
                </If>
              </View>
              <Text class="text-sm text-foreground">{row().text}</Text>
            </View>
          )}
        </Each>
        <If when={rows().length === 0}>
          <Text testID={`${props.testId}:empty`} class="text-sm text-muted-foreground">
            {options.emptyMessage}
          </Text>
        </If>
      </View>
    );
  };
}
