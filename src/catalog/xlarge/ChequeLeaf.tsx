/**
 * xlarge catalog `ChequeLeaf` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * A cheque or promissory note's leaf: its `rows` (a data binding) are the
 * states the leaf went through, oldest first. Each row shows its `state` as
 * the translation of `statePrefix + state`, its `date` (or `at`), its `amount`
 * (formatted from its text, never through a float), and its `party` (or
 * `partner`) and `note` when it has them. The last row is the leaf's state now.
 */

import { Text, View, computed, type JSX } from "nsh";
import {
  unwrapBinding,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import { chequeLeafRows } from "./model";

export function createXlargeChequeLeaf(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeChequeLeaf(props: A2uiComponentProps): JSX.Element {
    const rowsProp = props.bridge.prop("rows");
    const statePrefixProp = props.bridge.prop("statePrefix");

    const rows = computed(() =>
      chequeLeafRows(unwrapBinding(rowsProp()), unwrapBinding(statePrefixProp()), options.translate),
    );
    const lastKey = computed(() => rows()[rows().length - 1]?.key);

    return (
      <View testID={props.testId} class="gap-0 rounded-(--radius) border border-border bg-card">
        <Each of={rows()} key={(row) => row.key}>
          {(row) => (
            <View
              testID={`${props.testId}:row:${row().key}`}
              class="flex-row flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2"
              accessibilityLabel={[row().state, row().date, row().amount, row().party, row().note]
                .filter((part) => part !== "")
                .join(", ")}
            >
              <Text
                testID={`${props.testId}:state:${row().key}`}
                class={
                  row().key === lastKey()
                    ? "min-w-32 text-sm font-semibold text-foreground"
                    : "min-w-32 text-sm text-muted-foreground"
                }
              >
                {row().state}
              </Text>
              <If when={row().date !== ""}>
                <Text class="text-sm text-muted-foreground">{row().date}</Text>
              </If>
              <If when={row().amount !== ""}>
                <Text class="text-sm text-foreground">{row().amount}</Text>
              </If>
              <If when={row().party !== ""}>
                <Text class="text-sm text-foreground">{row().party}</Text>
              </If>
              <If when={row().note !== ""}>
                <Text class="text-xs text-muted-foreground">{row().note}</Text>
              </If>
            </View>
          )}
        </Each>
      </View>
    );
  };
}
