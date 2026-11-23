/**
 * xlarge catalog `ChequeLeaf` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * The physical leaves of a prenumbered cheque book: its `rows` (a data
 * binding) are the leaves, one per row. Each leaf shows its `number` (with the
 * translation of `statePrefix + state` beside it, in the destructive colour,
 * when the leaf is `void`), its `date`, `payee`, `amount` (formatted from its
 * text, never through a float), `amountWords` and `memo`, and under it the
 * `stub` kept in the book when the row has one.
 *
 * xlarge places each field at the row's `layout` (whole millimetres on a
 * 210 × 99 mm leaf) for printing. Native Shell draws a screen, not a print,
 * so the leaf here is the same fields stacked in a readable card and
 * `layout` is not read.
 */

import { Text, View, computed, type JSX } from "nsh";
import {
  unwrapBinding,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import { chequeLeafRows, type ChequeLeafStub } from "./model";

const STUB_FIELDS = ["number", "date", "payee", "amount", "memo"] as const;

/** A stub's filled fields, in the order xlarge prints them. */
function stubParts(
  stub: ChequeLeafStub | undefined,
): readonly { readonly field: string; readonly text: string }[] {
  if (stub === undefined) {
    return [];
  }
  return STUB_FIELDS.map((field) => ({ field, text: stub[field] })).filter((part) => part.text !== "");
}

export function createXlargeChequeLeaf(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeChequeLeaf(props: A2uiComponentProps): JSX.Element {
    const rowsProp = props.bridge.prop("rows");
    const statePrefixProp = props.bridge.prop("statePrefix");

    const leaves = computed(() =>
      chequeLeafRows(unwrapBinding(rowsProp()), unwrapBinding(statePrefixProp()), options.translate),
    );

    return (
      <View testID={props.testId} class="gap-6">
        <Each of={leaves()} key={(leaf) => leaf.key}>
          {(leaf) => (
            <View testID={`${props.testId}:leaf:${leaf().key}`} class="gap-4">
              <View
                testID={`${props.testId}:sheet:${leaf().key}`}
                class="gap-2 rounded-(--radius) border border-border bg-card p-4"
                accessibilityLabel={[
                  leaf().number,
                  leaf().voidWord,
                  leaf().date,
                  leaf().payee,
                  leaf().amount,
                  leaf().amountWords,
                  leaf().memo,
                ]
                  .filter((part) => part !== "")
                  .join(", ")}
              >
                <View class="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <View class="flex-row items-center gap-3">
                    <Text testID={`${props.testId}:number:${leaf().key}`} class="text-sm font-semibold text-foreground">
                      {leaf().number}
                    </Text>
                    <If when={leaf().voidWord !== ""}>
                      <Text testID={`${props.testId}:void:${leaf().key}`} class="text-sm text-destructive">
                        {leaf().voidWord}
                      </Text>
                    </If>
                  </View>
                  <If when={leaf().date !== ""}>
                    <Text testID={`${props.testId}:date:${leaf().key}`} class="text-sm text-foreground">
                      {leaf().date}
                    </Text>
                  </If>
                </View>
                <View class="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <If when={leaf().payee !== ""}>
                    <Text testID={`${props.testId}:payee:${leaf().key}`} class="text-sm text-foreground">
                      {leaf().payee}
                    </Text>
                  </If>
                  <If when={leaf().amount !== ""}>
                    <Text testID={`${props.testId}:amount:${leaf().key}`} class="text-sm font-semibold text-foreground">
                      {leaf().amount}
                    </Text>
                  </If>
                </View>
                <If when={leaf().amountWords !== ""}>
                  <Text testID={`${props.testId}:words:${leaf().key}`} class="text-sm text-foreground">
                    {leaf().amountWords}
                  </Text>
                </If>
                <If when={leaf().memo !== ""}>
                  <Text testID={`${props.testId}:memo:${leaf().key}`} class="text-xs text-muted-foreground">
                    {leaf().memo}
                  </Text>
                </If>
              </View>
              <If when={leaf().stub !== undefined}>
                <View
                  testID={`${props.testId}:stub:${leaf().key}`}
                  class="flex-row flex-wrap gap-x-4 gap-y-1 rounded-(--radius) border border-border p-3"
                >
                  <Each of={stubParts(leaf().stub)} key={(part) => part.field}>
                    {(part) => (
                      <Text class="text-xs text-muted-foreground">{part().text}</Text>
                    )}
                  </Each>
                </View>
              </If>
            </View>
          )}
        </Each>
      </View>
    );
  };
}
