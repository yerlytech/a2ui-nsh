/**
 * A2UI Basic Catalog v1 `Tabs` navigation component on Native Shell (`nsh 0.7.0`).
 *
 * Uses `nsh/base` `<Tabs>` + `<Tab>` for native WAI-ARIA tablist semantics,
 * roving-tabindex keyboard navigation (Tab/Shift+Tab, Arrow keys, Home/End,
 * Space/Enter), and animated selection indicator. Mounts only the active tab's
 * child node and clamps selection when tabs shrink.
 */

import { Scroll, Text, View, computed, effect, signal, type JSX } from "nsh";
import { Tab, Tabs } from "nsh/base";
import { isComponentNode, type ComponentNode } from "../../core/resolver";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  useLiveRegionAnnouncement,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  unwrapString,
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";

/** Normalized entry extracted from a resolved A2UI `Tabs.tabs` array. */
export interface ResolvedTabItem {
  readonly title: string;
  readonly child: ComponentNode | undefined;
}

/** Extracts resolved tab titles and child `ComponentNode`s from `Tabs.tabs`. */
export function extractTabItems(value: unknown): readonly ResolvedTabItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: ResolvedTabItem[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const entry = value[i];
    if (entry !== null && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const title = unwrapString(record["title"]);
      const rawChild = record["child"];
      const child = isComponentNode(rawChild) ? rawChild : undefined;
      out.push({ title, child });
    }
  }
  return out;
}

export function BasicTabs(props: A2uiComponentProps): JSX.Element {
  const tabsProp = props.bridge.prop("tabs");
  const weightProp = props.bridge.prop<number | undefined>("weight");

  const tabs = computed(() => extractTabItems(tabsProp()));
  const selectedIndex = signal(0);

  const activeIndex = computed(() => {
    const list = tabs();
    if (list.length === 0) {
      return 0;
    }
    const idx = selectedIndex();
    return idx >= 0 && idx < list.length ? idx : 0;
  });

  // Keep persisted selection within bounds when tabs are removed dynamically.
  effect(() => {
    const len = tabs().length;
    const idx = selectedIndex();
    if (len === 0 && idx !== 0) {
      selectedIndex.set(0);
    } else if (len > 0 && (idx < 0 || idx >= len)) {
      selectedIndex.set(0);
    }
  });

  const activeTab = computed(() => tabs()[activeIndex()]);
  const activeChild = computed<ComponentNode | undefined>(
    () => activeTab()?.child,
  );
  const activeTitle = computed(() => activeTab()?.title ?? "");

  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "tablist",
  }));
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  useLiveRegionAnnouncement(a11y, activeTitle);

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
    // Outer View carries `description`, `hidden`, `android` live region, and `weight`
    // that `nsh/base` `Tabs` omits from `ComponentHostProps` (Spec 001 §3 Gap #1).
    <View
      testID={props.testId}
      class="gap-3"
      style={weightStyle(weightProp())}
      role={a11y().live === "assertive" ? "alert" : undefined}
      accessibilityDescription={a11yProps().accessibilityDescription}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
    >
      <Scroll horizontal={true} scrollbar={false}>
        <Tabs
          testID={`${props.testId}:tablist`}
          accessibilityLabel={a11y().label}
          class="flex-row self-start gap-1 rounded-(--radius) bg-muted p-1"
          indicatorClass="inset-y-1 rounded-(--radius) bg-background"
        >
          <Each of={tabs()} key="index">
            {(tab, index) => (
              <Tab
                testID={`${props.testId}:tab:${index()}`}
                selected={activeIndex() === index()}
                onPress={() => selectedIndex.set(index())}
                class="group min-h-[44px] justify-center rounded-(--radius) px-3 py-2 focus-visible:outline-2"
              >
                <Text class="text-sm font-medium text-muted-foreground group-selected:text-foreground">
                  {tab().title}
                </Text>
              </Tab>
            )}
          </Each>
        </Tabs>
      </Scroll>
      <View testID={`${props.testId}:panel`}>
        <Each of={activeChild() ? [activeChild()!] : []} key={(child) => child.id}>
          {(child) => props.renderNode(child())}
        </Each>
      </View>
    </View>
  );
}
