/**
 * A2UI Basic Catalog v1 `Column` layout component on Native Shell (`nsh 0.7.1`).
 *
 * Arranges static or template-repeated child `ComponentNode`s vertically,
 * preserving surviving child view identity via `key={(child) => child.id}`.
 */

import { View, computed, effect, type JSX, type ViewStyle } from "nsh";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import {
  extractChildNodes,
  mapAlign,
  mapJustify,
} from "./layout_helpers";

export function BasicColumn(props: A2uiComponentProps): JSX.Element {
  const childrenProp = props.bridge.prop("children");
  const justifyProp = props.bridge.prop<string | undefined>("justify");
  const alignProp = props.bridge.prop<string | undefined>("align");
  const weightProp = props.bridge.prop<number | undefined>("weight");

  const children = computed(() => extractChildNodes(childrenProp()));
  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: a11y().label !== undefined ? "group" : undefined,
  }));
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  const containerStyle = computed<ViewStyle>(() => ({
    flexDirection: "column",
    justifyContent: mapJustify(justifyProp()),
    alignItems: mapAlign(alignProp()),
    gap: 8,
    ...weightStyle(weightProp()),
  }));

  if (props.onAccessibilitySnapshot) {
    const report = props.onAccessibilitySnapshot;
    effect(() => {
      report(
        props.node.componentId,
        props.node.instanceId,
        buildAccessibilitySnapshot(a11y(), a11yOptions()),
      );
    });
  }

  return (
    <View
      testID={props.testId}
      style={containerStyle()}
      role={a11yProps().role}
      accessibilityLabel={a11yProps().accessibilityLabel}
      accessibilityDescription={a11yProps().accessibilityDescription}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
    >
      <Each of={children()} key={(child) => child.id}>
        {(child) => props.renderNode(child())}
      </Each>
    </View>
  );
}
