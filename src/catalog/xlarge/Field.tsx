/**
 * xlarge catalog `Field` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * One input of a `Form`, keyed by `field`. `input` picks the control
 * (`fieldControl`): text, multiline (`note`), email, password, number
 * (`number`, `decimal`, `money`, `kurus` — typed text with a decimal keypad,
 * never a float), date (`DatePicker`), and select (`choice` from `options`,
 * `record` from the rows under `/<from>`). Unknown inputs draw as text.
 *
 * The value lives in the enclosing `Form`'s draft (`FormDraftContext`), not in
 * the surface data model: xlarge's catalog binds no property to it.
 */

import { Text, View, computed, signal, type JSX, type KeyboardType } from "nsh";
import { DatePicker, Input, Select } from "nsh/base";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import {
  FormDraftContext,
  createFormDraft,
  type ResolvedXlargeOptions,
} from "./context";
import {
  fieldControl,
  fieldOptions,
  isBlank,
  recordRowsPath,
} from "./model";

function asText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

export function createXlargeField(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeField(props: A2uiComponentProps): JSX.Element {
    // A field outside any form still works, on a draft of its own.
    const draft = FormDraftContext() ?? createFormDraft();

    const fieldProp = props.bridge.prop("field");
    const inputProp = props.bridge.prop("input");
    const labelProp = props.bridge.prop("label");
    const exampleProp = props.bridge.prop("example");
    const checksProp = props.bridge.prop("checks");
    const defaultProp = props.bridge.prop("default");
    const fromProp = props.bridge.prop("from");
    const optionsProp = props.bridge.prop("options");
    const optionPrefixProp = props.bridge.prop("optionPrefix");
    const valueKeyProp = props.bridge.prop("value");
    const showProp = props.bridge.prop("show");

    const name = computed(() => asText(fieldProp()));
    const control = computed(() => fieldControl(inputProp()));
    const label = computed(() => {
      const code = unwrapOptionalString(labelProp());
      return code !== undefined ? options.translate(code) : "";
    });
    const example = computed(() => {
      const code = unwrapOptionalString(exampleProp());
      return code !== undefined ? options.translate(code) : undefined;
    });
    const required = computed(() => {
      const checks = checksProp();
      return Array.isArray(checks) && checks.includes("required");
    });
    const fallback = computed(() => unwrapBinding(defaultProp()));
    const current = computed<unknown>(() => {
      const typed = draft.values()[name()];
      return isBlank(typed) ? fallback() : typed;
    });
    const error = computed(() => draft.errors()[name()]);

    const rowsPath = computed(() =>
      control() === "select" ? recordRowsPath(fromProp()) : undefined,
    );
    const rows = computed<unknown>(() => {
      const path = rowsPath();
      return path !== undefined ? props.store.dataSignal(path)() : undefined;
    });
    const choices = computed(() =>
      fieldOptions(
        {
          input: inputProp(),
          options: optionsProp(),
          optionPrefix: optionPrefixProp(),
          value: unwrapBinding(valueKeyProp()),
          show: showProp(),
        },
        rows(),
        options.translate,
      ),
    );

    const chosenTitle = computed(() => {
      const held = current();
      if (isBlank(held)) {
        return undefined;
      }
      const value = asText(held);
      return choices().find((choice) => choice.value === value)?.title ?? value;
    });

    const keyboardType = computed<KeyboardType>(() => {
      if (control() === "number") {
        return "decimal-pad";
      }
      if (control() === "email") {
        return "email-address";
      }
      return "default";
    });

    const borderClass = computed(() =>
      error() !== undefined ? "border-destructive" : "border-input focus:border-primary",
    );
    const boxClass = computed(
      () =>
        `w-full rounded-(--radius) border bg-background px-3 text-sm text-foreground ${
          control() === "multiline" ? "min-h-[88px] py-2.5" : "min-h-[44px] py-2"
        } ${borderClass()} focus-visible:outline-2`,
    );
    const accessibleName = computed(() =>
      label().length > 0 ? label() : name(),
    );

    // A date is held as `YYYY-MM-DD`; anything else the picker cannot show.
    const datePart = computed(() => {
      const text = asText(current());
      return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
    });
    const dateOpen = signal(false);

    return (
      <View testID={`${props.testId}:container`} class="gap-1.5">
        <If when={label().length > 0}>
          <Text
            testID={`${props.testId}:label`}
            class={
              error() !== undefined
                ? "text-sm font-medium text-destructive"
                : "text-sm font-medium text-foreground"
            }
          >
            {required() ? `${label()} *` : label()}
          </Text>
        </If>

        <If when={control() === "select"}>
          <Select
            testID={props.testId}
            items={choices().map((choice) => ({
              value: choice.value,
              title: choice.title,
            }))}
            value={isBlank(current()) ? null : asText(current())}
            placeholder={example() ?? null}
            searchable={choices().length > 8}
            accessibilityLabel={accessibleName()}
            trigger={
              <View
                testID={`${props.testId}:trigger`}
                class={`${boxClass()} flex-row items-center`}
              >
                <Text class={chosenTitle() !== undefined ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>
                  {chosenTitle() ?? example() ?? ""}
                </Text>
              </View>
            }
            popupClass="rounded-(--radius) border border-border bg-card p-1"
            itemClass="min-h-[36px] justify-center rounded px-2 text-sm text-foreground focus:bg-muted selected:bg-primary selected:text-primary-foreground"
            onChange={(event: { value: string | null }) => {
              draft.set(name(), event.value ?? "");
            }}
          />
        </If>

        <If when={control() === "date"}>
          <DatePicker
            testID={props.testId}
            value={datePart()}
            open={dateOpen()}
            onOpenChange={(event: { open: boolean }) => dateOpen.set(event.open)}
            cleanable={true}
            accessibilityLabel={accessibleName()}
            popupClass="rounded-(--radius) border border-border bg-card p-3"
            headerClass="flex-row items-center justify-between pb-2"
            bodyClass="gap-1"
            rowClass="flex-row gap-1"
            itemClass="min-h-[36px] min-w-[36px] items-center justify-center rounded text-sm text-foreground hover:bg-muted selected:bg-primary selected:text-primary-foreground"
            trigger={
              <View
                testID={`${props.testId}:trigger`}
                class={`min-h-[44px] flex-row items-center rounded-(--radius) border ${borderClass()} bg-background px-3 py-2`}
              >
                <Text class={datePart() !== null ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>
                  {datePart() ?? example() ?? "YYYY-MM-DD"}
                </Text>
              </View>
            }
            onChange={(event: { value: unknown }) => {
              draft.set(name(), typeof event.value === "string" ? event.value : "");
            }}
          />
        </If>

        <If when={control() !== "select" && control() !== "date"}>
          <Input
            testID={props.testId}
            value={asText(current())}
            placeholder={
              example() ?? (control() === "datetime" ? "YYYY-MM-DDTHH:MM" : undefined)
            }
            multiline={control() === "multiline"}
            masked={control() === "password"}
            keyboardType={keyboardType()}
            autoCapitalize={control() === "email" || control() === "password" ? "none" : undefined}
            autoCorrect={control() === "email" || control() === "password" ? false : undefined}
            class={boxClass()}
            accessibilityLabel={accessibleName()}
            accessibilityState={error() !== undefined ? { invalid: true } : undefined}
            onChange={(event) => {
              draft.set(name(), event.value);
            }}
          />
        </If>

        <If when={error() !== undefined}>
          <Text
            testID={`${props.testId}:error`}
            role="alert"
            class="text-xs text-destructive"
          >
            {error() ?? ""}
          </Text>
        </If>
      </View>
    );
  };
}
