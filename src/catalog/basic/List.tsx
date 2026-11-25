/**
 * A2UI Basic Catalog v1 `List` collection component on Native Shell (`nsh 0.7.0`).
 *
 * Vertical lists render via `nsh`'s native virtualized `<List viewport="parent">`
 * with `keyExtractor={(child) => child.id}` so only cells near the viewport exist
 * while surviving template-repeater rows preserve view identity.
 *
 * Horizontal lists render via `<Scroll horizontal>` because `nsh 0.6.1`'s
 * `<List horizontal>` uses independent Taffy cell roots and cannot auto-size its
 * cross-axis height without an explicit fixed height (Spec 001 §3 Gap #8).
 */

import { List, Scroll, View, computed, effect, platform, type JSX, type ViewStyle } from "nsh";
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
import { extractChildNodes, mapAlign } from "./layout_helpers";

const DEFAULT_ESTIMATED_ITEM_SIZE = 48;
const DEFAULT_LIST_GAP = 8;

export function BasicList(props: A2uiComponentProps): JSX.Element {
  const childrenProp = props.bridge.prop("children");
  const directionProp = props.bridge.prop<string | undefined>("direction");
  const alignProp = props.bridge.prop<string | undefined>("align");
  const weightProp = props.bridge.prop<number | undefined>("weight");

  const children = computed(() => extractChildNodes(childrenProp()));
  const isHorizontal = computed(() => directionProp() === "horizontal");
  const isTerminal = platform.idiom === "terminal";

  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "list",
  }));
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  // `nsh 0.6.1` `ListContentStyle` supports padding and gaps but not `alignItems`,
  // so cross-axis alignment applies on each cell wrapper (Spec 001 §3 Gap #8).
  const itemAlignmentStyle = computed<ViewStyle>(() => ({
    alignItems: mapAlign(alignProp()),
  }));

  const verticalTerminalStyle = computed<ViewStyle>(() => ({
    flexDirection: "column",
    gap: DEFAULT_LIST_GAP,
    ...weightStyle(weightProp()),
  }));

  const horizontalContentStyle = computed<ViewStyle>(() => ({
    flexDirection: "row",
    alignItems: mapAlign(alignProp()),
    gap: DEFAULT_LIST_GAP,
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
    <If
      when={isHorizontal()}
      else={
        <If
          when={isTerminal}
          else={
            <List
              testID={props.testId}
              viewport="parent"
              each={children()}
              keyExtractor={(child) => child.id}
              estimatedItemSize={DEFAULT_ESTIMATED_ITEM_SIZE}
              contentStyle={{ gap: DEFAULT_LIST_GAP }}
              style={weightStyle(weightProp())}
              role={a11yProps().role}
              accessibilityLabel={a11yProps().accessibilityLabel}
              accessibilityDescription={a11yProps().accessibilityDescription}
              accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
              importantForAccessibility={a11yProps().importantForAccessibility}
              accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
            >
              {(item) => (
                <View style={itemAlignmentStyle()}>
                  <Each of={item() ? [item()] : []} key={(child) => child.id}>
                    {(child) => props.renderNode(child())}
                  </Each>
                </View>
              )}
            </List>
          }
        >
          {/* On `nsh 0.6.1` TUI, `<List viewport="parent">` clips unmeasured rows when
              stacked above siblings in a compact 80x24 scroll view; a plain column keeps
              every row full-height inside the enclosing `<Scroll>`. */}
          <View
            testID={props.testId}
            style={verticalTerminalStyle()}
            role={a11yProps().role}
            accessibilityLabel={a11yProps().accessibilityLabel}
            accessibilityDescription={a11yProps().accessibilityDescription}
            accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
            importantForAccessibility={a11yProps().importantForAccessibility}
            accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
          >
            <Each of={children()} key={(child) => child.id}>
              {(child) => (
                <View style={itemAlignmentStyle()}>
                  {props.renderNode(child())}
                </View>
              )}
            </Each>
          </View>
        </If>
      }
    >
      <Scroll
        testID={props.testId}
        horizontal={true}
        style={weightStyle(weightProp())}
        contentStyle={horizontalContentStyle()}
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
      </Scroll>
    </If>
  );
}
