/**
 * xlarge catalog `Arrange` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Puts the `items` the data model holds in a new order, as xlarge's
 * lab-report layout does (`items = "/layout/blocks"`, `field = "blocks"`).
 * Items are `{ key?, kind, label, shown, kept?, removable?, text?, fields? }`
 * (`arrangeRows`; `fields` is not read). Each row shows its translated
 * `label` with a move-up and a move-down button, a shown toggle (not for a
 * `kept` item), a text box when the item has `text`, and a remove button
 * when it is `removable`. All are plain controls, so the keyboard reaches and
 * presses them on every target (Tab, then Enter or Space), the terminal
 * (`--target tui`) included. After a move or an add the new place is
 * announced (`announce()`, the host's `movedText`).
 *
 * With `add` (the new item's `kind`) an add button adds
 * `{ kind, label: addItem ?? addLabel, shown: true, removable: true, text: "" }`.
 *
 * The list as it stands is also in the draft (the enclosing `Form`'s, else
 * the screen's) under `field`, so a `Preview` whose `draft` names that field
 * draws from it, as on xlarge's lab-report layout screen.
 *
 * Save sends `save` with `{ [field]: items, version }`: every item in its new
 * order under `field` and the `version` its binding holds, so the server can
 * refuse a stale layout. Reset drops the local changes; with `reset` it also
 * sends that action with `{ version }`. A send that went out then follows
 * `after` (`screenAction`), as `Button` does. With `confirm` a send asks
 * first (`AskPanel`, `askStep`). New items from the data model replace the
 * local changes.
 */

import { Text, View, computed, effect, signal, type JSX } from "nsh";
import { Button, Checkbox, Input } from "nsh/base";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { AskPanel, BUTTON_CLASS, BUTTON_TEXT_CLASS, sendXlargeAction } from "./ask";
import { FormDraftContext, type ResolvedXlargeOptions } from "./context";
import {
  arrangeContext,
  arrangeField,
  arrangeMoved,
  arrangeRows,
  askStep,
  moveItem,
  newArrangeItem,
  patchArrangeItem,
  screenAction,
} from "./model";

const MOVE_BUTTON =
  "min-h-[36px] min-w-[36px] items-center justify-center rounded-(--radius) border border-border bg-secondary px-2 hover:bg-muted active:opacity-80 disabled:opacity-50 focus-visible:outline-2";

type Pending = "save" | "reset";

export function createXlargeArrange(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeArrange(props: A2uiComponentProps): JSX.Element {
    const itemsProp = props.bridge.prop("items");
    const fieldProp = props.bridge.prop("field");
    const addProp = props.bridge.prop("add");
    const addItemProp = props.bridge.prop("addItem");
    const addLabelProp = props.bridge.prop("addLabel");
    const saveProp = props.bridge.prop("save");
    const resetProp = props.bridge.prop("reset");
    const afterProp = props.bridge.prop("after");
    const confirmProp = props.bridge.prop("confirm");
    const versionProp = props.bridge.prop("version");

    const source = computed<readonly unknown[]>(() => {
      const value = unwrapBinding(itemsProp());
      return Array.isArray(value) ? value : [];
    });
    // The list a person made, until it is reset or the data model sends new items.
    const local = signal<readonly unknown[] | undefined>(undefined);
    effect(() => {
      source();
      local.set(undefined);
    });
    const items = computed(() => local() ?? source());
    const rows = computed(() => arrangeRows(items(), options.translate));

    // The list, as it stands, is in the draft under `field`: a `Preview`
    // naming that field draws from it (xlarge's lab-report layout).
    const draft = FormDraftContext();
    effect(() => {
      const list = items();
      const key = arrangeField(fieldProp());
      if (draft !== undefined) {
        draft.set(key, [...list]);
      }
    });

    const addKind = computed(() => unwrapOptionalString(addProp()));
    const addLabel = computed(() => {
      const code = unwrapOptionalString(addLabelProp());
      return code !== undefined ? options.translate(code) : options.addLabel;
    });
    const saveLabel = computed(() => options.translate("action.save"));
    const save = computed(() => unwrapOptionalString(saveProp()));
    const reset = computed(() => unwrapOptionalString(resetProp()));
    const asking = signal<Pending | undefined>(undefined);
    const sending = signal(false);

    const tell = (index: number): void => {
      const list = rows();
      const row = list[index];
      if (row !== undefined) {
        options.announce(arrangeMoved(options.movedText, row.text, index + 1, list.length));
      }
    };

    const move = (from: number, to: number): void => {
      local.set(moveItem(items(), from, to));
      tell(to);
    };

    const patch = (index: number, change: Readonly<Record<string, unknown>>): void => {
      local.set(patchArrangeItem(items(), index, change));
    };

    const remove = (index: number): void => {
      local.set(items().filter((_, at) => at !== index));
    };

    const add = (): void => {
      const label =
        unwrapOptionalString(addItemProp()) ?? unwrapOptionalString(addLabelProp());
      const item = newArrangeItem(addKind(), label);
      if (item === undefined) {
        return;
      }
      local.set([...items(), item]);
      tell(items().length - 1);
    };

    const version = (): unknown => unwrapBinding(versionProp());

    const send = (which: Pending): void => {
      if (sending()) {
        return;
      }
      if (which === "reset") {
        local.set(undefined);
      }
      const name = which === "save" ? save() : reset();
      if (name === undefined) {
        return;
      }
      const context =
        which === "save"
          ? arrangeContext(fieldProp(), items(), version())
          : version() === undefined || version() === null
            ? {}
            : { version: version() };
      sending.set(true);
      void (async () => {
        try {
          const sent = await sendXlargeAction(props, name, context);
          const after = screenAction(unwrapOptionalString(afterProp()));
          if (sent && after !== undefined) {
            await sendXlargeAction(props, after, {});
          }
        } finally {
          sending.set(false);
        }
      })();
    };

    const step = (which: "press" | "yes" | "cancel", target: Pending): void => {
      // Reset without an action only restores the list here: nothing to ask.
      const sends = target === "save" || reset() !== undefined;
      const next = askStep(which, confirmProp() === true && sends);
      asking.set(next.asking ? target : undefined);
      if (next.send) {
        send(target);
      }
    };

    return (
      <View testID={props.testId} role="group" class="gap-3">
        <View testID={`${props.testId}:items`} class="gap-1">
          <Each of={rows()} key="index">
            {(row) => (
              <View
                testID={`${props.testId}:item:${row().index}`}
                class="min-h-[44px] gap-2 rounded-(--radius) border border-border bg-card px-3 py-1"
              >
                <View class="flex-row flex-wrap items-center gap-2">
                  <Text class={row().shown ? "flex-1 text-sm text-foreground" : "flex-1 text-sm text-muted-foreground"}>
                    {row().text}
                  </Text>
                  <Button
                    testID={`${props.testId}:item:${row().index}:up`}
                    accessibilityLabel={`${options.moveUpLabel}: ${row().text}`}
                    disabled={row().index === 0 || sending()}
                    class={MOVE_BUTTON}
                    onPress={() => move(row().index, row().index - 1)}
                  >
                    <Text class="text-sm text-secondary-foreground">↑</Text>
                  </Button>
                  <Button
                    testID={`${props.testId}:item:${row().index}:down`}
                    accessibilityLabel={`${options.moveDownLabel}: ${row().text}`}
                    disabled={row().index === rows().length - 1 || sending()}
                    class={MOVE_BUTTON}
                    onPress={() => move(row().index, row().index + 1)}
                  >
                    <Text class="text-sm text-secondary-foreground">↓</Text>
                  </Button>
                  <If when={!row().kept}>
                    <Checkbox
                      testID={`${props.testId}:item:${row().index}:shown`}
                      checked={row().shown}
                      accessibilityLabel={`${options.shownLabel}: ${row().text}`}
                      disabled={sending()}
                      class="min-h-[36px] flex-row items-center gap-2 focus-visible:outline-2"
                      indicatorClass="h-5 w-5 items-center justify-center rounded border border-input bg-background checked:border-primary checked:bg-primary"
                      onChange={(event) => patch(row().index, { shown: event.checked })}
                    >
                      <Text class="text-sm text-foreground">{options.shownLabel}</Text>
                    </Checkbox>
                  </If>
                  <If when={row().removable}>
                    <Button
                      testID={`${props.testId}:item:${row().index}:remove`}
                      accessibilityLabel={`${options.removeLabel}: ${row().text}`}
                      disabled={sending()}
                      class={MOVE_BUTTON}
                      onPress={() => remove(row().index)}
                    >
                      <Text class="text-sm text-destructive">×</Text>
                    </Button>
                  </If>
                </View>
                <If when={row().note !== undefined}>
                  <Input
                    testID={`${props.testId}:item:${row().index}:text`}
                    value={row().note ?? ""}
                    accessibilityLabel={row().text}
                    class="min-h-[44px] rounded-(--radius) border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus-visible:outline-2"
                    onChange={(event) => patch(row().index, { text: event.value })}
                  />
                </If>
              </View>
            )}
          </Each>
        </View>

        <If when={addKind() !== undefined}>
          <View class="flex-row flex-wrap gap-2">
            <Button
              testID={`${props.testId}:add`}
              accessibilityLabel={addLabel()}
              disabled={sending()}
              class={BUTTON_CLASS.secondary}
              onPress={add}
            >
              <Text class={BUTTON_TEXT_CLASS.secondary}>{addLabel()}</Text>
            </Button>
          </View>
        </If>

        <View class="flex-row flex-wrap gap-2">
          <Button
            testID={`${props.testId}:save`}
            accessibilityLabel={saveLabel()}
            disabled={save() === undefined || sending() || asking() !== undefined}
            class={BUTTON_CLASS.primary}
            onPress={() => step("press", "save")}
          >
            <Text class={BUTTON_TEXT_CLASS.primary}>{saveLabel()}</Text>
          </Button>
          <Button
            testID={`${props.testId}:reset`}
            accessibilityLabel={options.resetLabel}
            disabled={(local() === undefined && reset() === undefined) || sending() || asking() !== undefined}
            class={BUTTON_CLASS.secondary}
            onPress={() => step("press", "reset")}
          >
            <Text class={BUTTON_TEXT_CLASS.secondary}>{options.resetLabel}</Text>
          </Button>
        </View>

        <If when={asking() !== undefined}>
          <AskPanel
            testId={`${props.testId}:ask`}
            question={options.confirmQuestion}
            yesLabel={asking() === "reset" ? options.resetLabel : saveLabel()}
            cancelLabel={options.cancelLabel}
            busy={sending()}
            onYes={() => step("yes", asking() ?? "save")}
            onCancel={() => step("cancel", asking() ?? "save")}
          />
        </If>
      </View>
    );
  };
}
