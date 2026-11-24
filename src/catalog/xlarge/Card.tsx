/**
 * xlarge catalog `Card` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Unlike the Basic Catalog `Card` (one `child`), xlarge's card holds a
 * `children` list under an optional `title` (an i18n code), `heading` and
 * `subtitle` (dynamic strings). `plain` drops the border. `when` and
 * `unless` (data bindings) hide it as `guardShown` says.
 */

import { Text, View, computed, type JSX } from "nsh";
import {
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { extractChildNodes } from "../basic/layout_helpers";
import { readGuard, type ResolvedXlargeOptions } from "./context";
import { guardShown } from "./model";

export function createXlargeCard(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeCard(props: A2uiComponentProps): JSX.Element {
    const childrenProp = props.bridge.prop("children");
    const titleProp = props.bridge.prop("title");
    const headingProp = props.bridge.prop("heading");
    const subtitleProp = props.bridge.prop("subtitle");
    const plainProp = props.bridge.prop("plain");
    const whenProp = props.bridge.prop("when");
    const unlessProp = props.bridge.prop("unless");
    const shown = computed(() => guardShown(readGuard(whenProp()), readGuard(unlessProp())));

    const children = computed(() => extractChildNodes(childrenProp()));
    const title = computed(() => {
      const code = unwrapOptionalString(titleProp());
      return code !== undefined ? options.translate(code) : undefined;
    });
    const heading = computed(() => unwrapOptionalString(headingProp()));
    const subtitle = computed(() => unwrapOptionalString(subtitleProp()));
    const frame = computed(() =>
      plainProp() === true
        ? "gap-4"
        : "gap-4 rounded-(--radius) border border-border bg-card p-4",
    );

    return (
      <If when={shown()}>
        <View
          testID={props.testId}
          class={frame()}
          role={title() !== undefined ? "region" : undefined}
          accessibilityLabel={title()}
        >
          <If when={title() !== undefined}>
            <Text
              testID={`${props.testId}:title`}
              role="header"
              class="text-lg font-semibold text-foreground"
            >
              {title() ?? ""}
            </Text>
          </If>
          <If when={heading() !== undefined}>
            <Text testID={`${props.testId}:heading`} class="text-base font-medium text-foreground">
              {heading() ?? ""}
            </Text>
          </If>
          <If when={subtitle() !== undefined}>
            <Text testID={`${props.testId}:subtitle`} class="text-sm text-muted-foreground">
              {subtitle() ?? ""}
            </Text>
          </If>
          <Each of={children()} key={(child) => child.id}>
            {(child) => props.renderNode(child())}
          </Each>
        </View>
      </If>
    );
  };
}
