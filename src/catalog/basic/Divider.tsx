/**
 * A2UI Basic Catalog v1 `Divider` component on Native Shell (`nsh 0.7.2`).
 *
 * Renders a 1 pt horizontal or vertical theme-colored border line, hidden from
 * screen readers by default unless explicit `@accessibility` attributes opt in.
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

export function BasicDivider(props: A2uiComponentProps): JSX.Element {
  const axisProp = props.bridge.prop<string | undefined>("axis");
  const weightProp = props.bridge.prop<number | undefined>("weight");

  const isVertical = computed(() => axisProp() === "vertical");
  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    decorativeByDefault: true,
  }));
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  const dividerStyle = computed<ViewStyle>(() =>
    isVertical()
      ? {
          width: 1,
          minHeight: 16,
          alignSelf: "stretch",
          marginHorizontal: 8,
          ...weightStyle(weightProp()),
        }
      : {
          height: 1,
          alignSelf: "stretch",
          marginVertical: 8,
          ...weightStyle(weightProp()),
        },
  );

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
      class="bg-border"
      style={dividerStyle()}
      role={a11yProps().role}
      accessibilityLabel={a11yProps().accessibilityLabel}
      accessibilityDescription={a11yProps().accessibilityDescription}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
    />
  );
}
