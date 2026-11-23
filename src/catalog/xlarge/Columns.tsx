/**
 * xlarge catalog `Columns` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Lays its `children` side by side when the window is wide (Native Shell's
 * `horizontalSizeClass` is `regular`, 600pt and above) and stacks them when it
 * is narrow (`compact`: a phone, a narrow window, a small terminal). `widths`
 * gives each column its share of the row (`[2, 1]`, `["2fr", "1fr"]`); without
 * it the columns share evenly. Stacked, every column takes the full width.
 */

import { View, computed, horizontalSizeClass, type JSX } from "nsh";
import type { A2uiComponentProps } from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { extractChildNodes } from "../basic/layout_helpers";
import type { ResolvedXlargeOptions } from "./context";
import { columnWeights } from "./model";

export function createXlargeColumns(
  _options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeColumns(props: A2uiComponentProps): JSX.Element {
    const childrenProp = props.bridge.prop("children");
    const widthsProp = props.bridge.prop("widths");

    const children = computed(() => extractChildNodes(childrenProp()));
    const wide = computed(() => horizontalSizeClass() === "regular");
    const columns = computed(() => {
      const nodes = children();
      const weights = columnWeights(widthsProp(), nodes.length);
      return nodes.map((node, index) => ({ node, weight: weights[index] ?? 1 }));
    });

    return (
      <View testID={props.testId} class="w-full">
        <View
          testID={`${props.testId}:${wide() ? "side" : "stacked"}`}
          class={wide() ? "w-full flex-row items-start gap-4" : "w-full gap-4"}
        >
          <Each of={columns()} key={(column) => column.node.id}>
            {(column) => (
              <View
                testID={`${props.testId}:column:${column().node.id}`}
                class="min-w-0 gap-4"
                style={wide() ? { flexGrow: column().weight, flexShrink: 1, flexBasis: 0 } : { width: "100%" }}
              >
                {props.renderNode(column().node)}
              </View>
            )}
          </Each>
        </View>
      </View>
    );
  };
}
