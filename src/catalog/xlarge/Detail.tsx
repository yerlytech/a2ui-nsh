/**
 * xlarge catalog `Detail` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Shows one record's labelled values: `record` (a data binding,
 * `{"@path": "/deal"}`) under `rows` (`Table.columns`-style entries: `field`,
 * `label` code, `format`, `enumPrefix`; or bare field names). Without `rows`
 * every plain value of the record shows under its key; `skipEmpty` leaves out
 * values that hold nothing. With `update`, an edit button sends that action as
 * an A2UI 1.0 `{ event: { name: update, context: { id } } }` for the record.
 */

import { Text, View, computed, type JSX } from "nsh";
import { Button } from "nsh/base";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import { detailEntries, eventPayload, recordContext } from "./model";

export function createXlargeDetail(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeDetail(props: A2uiComponentProps): JSX.Element {
    const recordProp = props.bridge.prop("record");
    const rowsProp = props.bridge.prop("rows");
    const skipEmptyProp = props.bridge.prop("skipEmpty");
    const updateProp = props.bridge.prop("update");

    const record = computed(() => unwrapBinding(recordProp()));
    const entries = computed(() =>
      detailEntries(
        unwrapBinding(rowsProp()),
        record(),
        unwrapBinding(skipEmptyProp()) === true,
        options.translate,
      ),
    );
    const update = computed(() => unwrapOptionalString(updateProp()));

    const edit = (): void => {
      const action = update();
      if (action === undefined) {
        return;
      }
      void props.store.resolver
        .dispatchNodeAction(props.node, eventPayload(action, recordContext(record())), {
          userActivation: true,
        })
        .catch(() => undefined);
    };

    return (
      <View testID={props.testId} class="gap-2">
        <Each of={entries()} key={(entry) => entry.field}>
          {(entry) => (
            <View
              testID={`${props.testId}:row:${entry().field}`}
              class="flex-row flex-wrap gap-x-4 gap-y-1 border-b border-border py-2"
              accessibilityLabel={`${entry().label}: ${entry().text}`}
            >
              <Text class="w-40 text-sm text-muted-foreground">{entry().label}</Text>
              <Text testID={`${props.testId}:value:${entry().field}`} class="min-w-0 flex-1 text-sm text-foreground">
                {entry().text}
              </Text>
            </View>
          )}
        </Each>
        <If when={update() !== undefined}>
          <View class="flex-row">
            <Button
              testID={`${props.testId}:update`}
              accessibilityLabel={options.editLabel}
              class="min-h-[44px] flex-row items-center justify-center rounded-(--radius) border border-border bg-secondary px-4 py-2 hover:bg-muted active:opacity-80 focus-visible:outline-2"
              onPress={edit}
            >
              <Text class="text-sm text-secondary-foreground">{options.editLabel}</Text>
            </Button>
          </View>
        </If>
      </View>
    );
  };
}
