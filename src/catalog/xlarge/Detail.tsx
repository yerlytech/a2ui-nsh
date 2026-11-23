/**
 * xlarge catalog `Detail` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Shows one record's labelled values: `record` (a data binding,
 * `{"@path": "/deal"}`) under `rows` (a list or a data binding to one, of
 * `Table.columns`-style entries: `field`, `label` code, `format`,
 * `enumPrefix`, `edit`; or bare field names). Without `rows` every plain value
 * of the record shows under its key; `skipEmpty` leaves out values that hold
 * nothing, except one that may be filled in. A value that holds nothing reads
 * as a dash.
 *
 * Where the screen names `update`, a row with `edit` is corrected in place,
 * as xlarge's client does (spec 009; there is no edit button): pressing the
 * value opens a box holding it; save sends the A2UI 1.0 event
 * `{ name: update, context: { id, version?, [edit.field ?? field]: value } }`
 * (`detailEditContext`; an emptied box sends `null`), and a value left as it
 * was sends nothing. Cancel puts it back.
 */

import { Text, View, computed, signal, type JSX, type KeyboardType } from "nsh";
import { Button, Input } from "nsh/base";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { BUTTON_CLASS, BUTTON_TEXT_CLASS, sendXlargeAction } from "./ask";
import type { ResolvedXlargeOptions } from "./context";
import {
  detailEditContext,
  detailEntries,
  fieldControl,
  sameValue,
  type DetailEntry,
} from "./model";

function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function keyboardFor(input: string): KeyboardType {
  const control = fieldControl(input);
  return control === "number" ? "decimal-pad" : control === "email" ? "email-address" : "default";
}

export function createXlargeDetail(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeDetail(props: A2uiComponentProps): JSX.Element {
    const recordProp = props.bridge.prop("record");
    const rowsProp = props.bridge.prop("rows");
    const skipEmptyProp = props.bridge.prop("skipEmpty");
    const updateProp = props.bridge.prop("update");

    const record = computed(() => unwrapBinding(recordProp()));
    const update = computed(() => unwrapOptionalString(updateProp()));
    const entries = computed(() =>
      detailEntries(
        unwrapBinding(rowsProp()),
        record(),
        unwrapBinding(skipEmptyProp()) === true,
        options.translate,
        update() !== undefined,
      ),
    );

    // The one row being corrected, and what its box holds.
    const editing = signal<string | null>(null);
    const typed = signal("");
    const sending = signal(false);

    const held = (entry: DetailEntry): unknown => {
      const data = record();
      return entry.edit !== undefined && typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)[entry.edit.field]
        : undefined;
    };

    const begin = (entry: DetailEntry): void => {
      typed.set(asText(held(entry)));
      editing.set(entry.field);
    };

    const save = async (entry: DetailEntry): Promise<void> => {
      const action = update();
      if (action === undefined || entry.edit === undefined || sending()) {
        return;
      }
      if (sameValue(typed(), held(entry))) {
        editing.set(null);
        return;
      }
      sending.set(true);
      try {
        const sent = await sendXlargeAction(
          props,
          action,
          detailEditContext(record(), entry.edit.field, typed()),
        );
        if (sent) {
          editing.set(null);
        }
      } finally {
        sending.set(false);
      }
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
              <If
                when={entry().edit !== undefined}
                else={
                  <Text testID={`${props.testId}:value:${entry().field}`} class="min-w-0 flex-1 text-sm text-foreground">
                    {entry().text === "" ? "—" : entry().text}
                  </Text>
                }
              >
                <If
                  when={editing() === entry().field}
                  else={
                    <Button
                      testID={`${props.testId}:value:${entry().field}`}
                      accessibilityLabel={`${entry().label}: ${entry().text}`}
                      class="min-h-[44px] min-w-0 flex-1 flex-row items-center rounded-(--radius) px-2 hover:bg-muted focus-visible:outline-2"
                      onPress={() => begin(entry())}
                    >
                      <Text class="text-sm text-foreground">{entry().text === "" ? "—" : entry().text}</Text>
                    </Button>
                  }
                >
                  <View class="min-w-0 flex-1 gap-2">
                    <Input
                      testID={`${props.testId}:edit:${entry().field}`}
                      value={typed()}
                      multiline={fieldControl(entry().edit?.input) === "multiline"}
                      keyboardType={keyboardFor(entry().edit?.input ?? "text")}
                      accessibilityLabel={entry().label}
                      class="min-h-[44px] w-full rounded-(--radius) border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus-visible:outline-2"
                      onChange={(event) => typed.set(event.value)}
                    />
                    <View class="flex-row flex-wrap gap-2">
                      <Button
                        testID={`${props.testId}:save:${entry().field}`}
                        accessibilityLabel={options.translate("action.save")}
                        disabled={sending()}
                        class={BUTTON_CLASS.primary}
                        onPress={() => {
                          void save(entry());
                        }}
                      >
                        <Text class={BUTTON_TEXT_CLASS.primary}>{options.translate("action.save")}</Text>
                      </Button>
                      <Button
                        testID={`${props.testId}:cancel:${entry().field}`}
                        accessibilityLabel={options.cancelLabel}
                        disabled={sending()}
                        class={BUTTON_CLASS.secondary}
                        onPress={() => editing.set(null)}
                      >
                        <Text class={BUTTON_TEXT_CLASS.secondary}>{options.cancelLabel}</Text>
                      </Button>
                    </View>
                  </View>
                </If>
              </If>
            </View>
          )}
        </Each>
      </View>
    );
  };
}
