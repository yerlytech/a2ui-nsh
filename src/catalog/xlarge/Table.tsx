/**
 * xlarge catalog `Table` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Draws `rows` (a data binding, `{"@path": "/deals"}`) under `columns`
 * (`field`, `label` code, `format`, `enumPrefix`, `grow`). A row press sends
 * `rowAction` with the row's `id` as an A2UI 1.0 `action` event. With
 * `search: true` and a `searchAction`, a search box sends that action with
 * `searchInput` plus `query` when the person submits it; the agent answers
 * with an `updateDataModel` of the rows.
 */

import { Text, View, computed, signal, type JSX } from "nsh";
import {
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "nsh/base";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import {
  eventPayload,
  formatCell,
  tableColumns,
  tableRows,
} from "./model";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowKey(row: Record<string, unknown>, index: number): string {
  const id = row["id"];
  return typeof id === "string" || typeof id === "number" ? `id:${id}` : `at:${index}`;
}

export function createXlargeTable(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeTable(props: A2uiComponentProps): JSX.Element {
    const rowsProp = props.bridge.prop("rows");
    const columnsProp = props.bridge.prop("columns");
    const titleProp = props.bridge.prop("title");
    const rowActionProp = props.bridge.prop("rowAction");
    const rowOpensProp = props.bridge.prop("rowOpens");
    const searchProp = props.bridge.prop("search");
    const searchActionProp = props.bridge.prop("searchAction");
    const searchInputProp = props.bridge.prop("searchInput");

    const columns = computed(() => tableColumns(columnsProp()));
    const rows = computed(() => tableRows(unwrapBinding(rowsProp())));
    const title = computed(() => {
      const code = unwrapOptionalString(titleProp());
      return code !== undefined ? options.translate(code) : undefined;
    });
    const rowAction = computed(
      () => unwrapOptionalString(rowActionProp()) ?? unwrapOptionalString(rowOpensProp()),
    );
    const searchAction = computed(() =>
      searchProp() === true ? unwrapOptionalString(searchActionProp()) : undefined,
    );
    const query = signal("");

    const dispatch = (name: string, context: Record<string, unknown>): void => {
      void props.store.resolver
        .dispatchNodeAction(props.node, eventPayload(name, context), {
          userActivation: true,
        })
        .catch(() => undefined);
    };

    const openRow = (row: Record<string, unknown>): void => {
      const action = rowAction();
      if (action !== undefined && row["id"] !== undefined) {
        dispatch(action, { id: row["id"] });
      }
    };

    const search = (text: string): void => {
      const action = searchAction();
      if (action === undefined) {
        return;
      }
      const asked: Record<string, unknown> = isObject(searchInputProp())
        ? { ...(searchInputProp() as Record<string, unknown>) }
        : {};
      if (text.trim().length > 0) {
        asked["query"] = text.trim();
      }
      dispatch(action, asked);
    };

    // A row that opens something is named by its first column, as a link is.
    const rowLabel = (row: Record<string, unknown>): string | undefined => {
      const first = columns()[0];
      return rowAction() !== undefined && first !== undefined
        ? formatCell(row[first.field], first, options.translate)
        : undefined;
    };

    const cellClass = (grow: boolean): string =>
      grow ? "min-w-48 flex-1 px-3 py-2" : "w-32 px-3 py-2";

    return (
      <View testID={`${props.testId}:container`} class="gap-2">
        <If when={title() !== undefined}>
          <Text testID={`${props.testId}:title`} role="header" class="text-base font-semibold text-foreground">
            {title() ?? ""}
          </Text>
        </If>
        <If when={searchAction() !== undefined}>
          <Input
            testID={`${props.testId}:search`}
            value={query()}
            placeholder={options.searchPlaceholder}
            accessibilityLabel={options.searchPlaceholder}
            class="min-h-[44px] w-full rounded-(--radius) border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary"
            onChange={(event) => query.set(event.value)}
            onSubmit={(event) => search(event.text)}
          />
        </If>
        <Table
          testID={props.testId}
          accessibilityLabel={title()}
          class="rounded-(--radius) border border-border"
        >
          <TableHeader class="border-b border-border bg-muted">
            <TableRow>
              <View class="flex-row">
                <Each of={columns()} key={(column) => column.field}>
                  {(column) => (
                    <TableHead class={cellClass(column().grow)}>
                      <Text class="text-xs font-semibold text-muted-foreground">
                        {options.translate(column().label)}
                      </Text>
                    </TableHead>
                  )}
                </Each>
              </View>
            </TableRow>
          </TableHeader>
          <TableBody>
            <Each of={rows().map((row, index) => ({ row, key: rowKey(row, index) }))} key={(entry) => entry.key}>
              {(entry) => (
                <TableRow class={`border-b border-border ${rowAction() !== undefined ? "hover:bg-muted" : ""}`}>
                  <View
                    testID={`${props.testId}:row:${entry().key}`}
                    class="flex-row"
                    role={rowAction() !== undefined ? "button" : undefined}
                    accessibilityLabel={rowLabel(entry().row)}
                    onPress={rowAction() !== undefined ? () => openRow(entry().row) : undefined}
                  >
                    <Each of={columns()} key={(column) => column.field}>
                      {(column) => (
                        <TableCell class={cellClass(column().grow)}>
                          <Text class="text-sm text-foreground">
                            {formatCell(entry().row[column().field], column(), options.translate)}
                          </Text>
                        </TableCell>
                      )}
                    </Each>
                  </View>
                </TableRow>
              )}
            </Each>
          </TableBody>
        </Table>
        <If when={rows().length === 0}>
          <Text testID={`${props.testId}:empty`} class="px-3 py-2 text-sm text-muted-foreground">
            {options.emptyMessage}
          </Text>
        </If>
      </View>
    );
  };
}
