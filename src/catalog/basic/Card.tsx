/**
 * A2UI Basic Catalog v1 `Card` container component on Native Shell (`nsh 0.7.0`).
 *
 * Renders a themed card surface (`border`, `bg-card`, `rounded-(--radius)`,
 * padding) holding its single resolved `child` `ComponentNode`.
 */

import { View, computed, effect, type JSX } from "nsh";
import { isComponentNode, type ComponentNode } from "../../core/resolver";
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

export function BasicCard(props: A2uiComponentProps): JSX.Element {
  const childProp = props.bridge.prop("child");
  const weightProp = props.bridge.prop<number | undefined>("weight");

  const childNode = computed<ComponentNode | undefined>(() => {
    const candidate = childProp();
    return isComponentNode(candidate) ? candidate : undefined;
  });
  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: a11y().label !== undefined ? "region" : undefined,
  }));
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
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
      class="rounded-(--radius) border border-border bg-card p-4"
      style={weightStyle(weightProp())}
      role={a11yProps().role}
      accessibilityLabel={a11yProps().accessibilityLabel}
      accessibilityDescription={a11yProps().accessibilityDescription}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
    >
      <Each of={childNode() ? [childNode()!] : []} key={(child) => child.id}>
        {(child) => props.renderNode(child())}
      </Each>
    </View>
  );
}
