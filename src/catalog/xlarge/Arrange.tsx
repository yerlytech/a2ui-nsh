/**
 * xlarge catalog `Arrange` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Puts the `items` the data model holds in a new order. Each item shows its
 * `field` (a plain item shows as it came) with a move-up and a move-down
 * button: plain buttons, so the keyboard reaches and presses them on every
 * target (Tab, then Enter or Space), the terminal (`--target tui`) included.
 * With `add` (the code naming the new item's text box) or `addLabel` (the
 * add button's code), a person can add an item: `{ [addItem ?? field]: text }`,
 * or the text itself when items carry no key.
 *
 * Save sends `save` with `{ items, version }`: every item in its new order
 * (added ones included, as they came otherwise) and the `version` the data
 * model holds, so the server can refuse a stale order. Reset drops the local
 * order and shows the data model's again; with `reset` it also sends that
 * action with `{ version }` so the server restores its own order. With
 * `confirm` a send asks first (`AskPanel`, `askStep`). New items from the
 * data model replace the local order.
 */

import { Text, View, computed, effect, signal, type JSX } from "nsh";
import { Button, Input } from "nsh/base";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { AskPanel, BUTTON_CLASS, BUTTON_TEXT_CLASS, sendXlargeAction } from "./ask";
import type { ResolvedXlargeOptions } from "./context";
import {
  arrangeContext,
  arrangeText,
  askStep,
  moveItem,
  newArrangeItem,
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
    const confirmProp = props.bridge.prop("confirm");
    const versionProp = props.bridge.prop("version");

    const source = computed<readonly unknown[]>(() => {
      const value = unwrapBinding(itemsProp());
      return Array.isArray(value) ? value : [];
    });
    // The order a person made, until it is reset or the data model sends new items.
    const local = signal<readonly unknown[] | undefined>(undefined);
    effect(() => {
      source();
      local.set(undefined);
    });
    const items = computed(() => local() ?? source());
    const rows = computed(() =>
      items().map((item, index) => ({ index, text: arrangeText(item, fieldProp()) })),
    );

    const translated = (value: unknown): string | undefined => {
      const code = unwrapOptionalString(value);
      return code !== undefined ? options.translate(code) : undefined;
    };
    const addBox = computed(() => translated(addProp()));
    const addLabel = computed(() => translated(addLabelProp()) ?? options.addLabel);
    const canAdd = computed(
      () => unwrapOptionalString(addProp()) !== undefined || unwrapOptionalString(addLabelProp()) !== undefined,
    );
    const typed = signal("");
    const saveLabel = computed(() => options.translate("action.save"));
    const save = computed(() => unwrapOptionalString(saveProp()));
    const reset = computed(() => unwrapOptionalString(resetProp()));
    const asking = signal<Pending | undefined>(undefined);
    const sending = signal(false);

    const move = (from: number, to: number): void => {
      local.set(moveItem(items(), from, to));
    };

    const add = (): void => {
      const field = unwrapOptionalString(addItemProp()) ?? unwrapOptionalString(fieldProp());
      const item = newArrangeItem(typed(), field);
      if (item === undefined) {
        return;
      }
      local.set([...items(), item]);
      typed.set("");
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
          ? arrangeContext(items(), version())
          : version() === undefined || version() === null
            ? {}
            : { version: version() };
      sending.set(true);
      void sendXlargeAction(props, name, context).finally(() => sending.set(false));
    };

    const step = (which: "press" | "yes" | "cancel", target: Pending): void => {
      // Reset without an action only restores the order here: nothing to ask.
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
                class="min-h-[44px] flex-row items-center gap-2 rounded-(--radius) border border-border bg-card px-3 py-1"
              >
                <Text class="flex-1 text-sm text-foreground">{row().text}</Text>
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
              </View>
            )}
          </Each>
        </View>

        <If when={canAdd()}>
          <View class="flex-row flex-wrap items-center gap-2">
            <Input
              testID={`${props.testId}:new`}
              value={typed()}
              placeholder={addBox()}
              accessibilityLabel={addBox() ?? addLabel()}
              class="min-h-[44px] flex-1 rounded-(--radius) border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus-visible:outline-2"
              onChange={(event) => typed.set(event.value)}
            />
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
