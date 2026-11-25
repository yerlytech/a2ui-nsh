/**
 * A2UI Basic Catalog v1 `Icon` component on Native Shell (`nsh 0.7.0`).
 *
 * Renders all 59 Basic Catalog v1 named icons and custom dynamic `{ svgPath }`
 * strings natively on `<Canvas>` via `Path2D` scaled from a 24×24 viewBox.
 * Decorative by default (hidden from assistive technologies unless
 * `@accessibility.label`, `@accessibility.description`, or `hidden: false` is set).
 */

import { Canvas, Path2D, computed, effect, token, type JSX } from "nsh";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  unwrapBinding,
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import { FALLBACK_ICON_PATH, resolveIconSvgPath } from "./icon_paths";
import { ButtonForegroundContext } from "./Button";

const ICON_VIEWBOX_SIZE = 24;
const pathCache = new Map<string, Path2D>();

function getOrCreatePath2D(pathData: string): Path2D {
  const cached = pathCache.get(pathData);
  if (cached) {
    return cached;
  }
  try {
    const built = new Path2D(pathData);
    // Keep cache bounded to named icons + recent custom paths.
    if (pathCache.size < 256) {
      pathCache.set(pathData, built);
    }
    return built;
  } catch {
    const fallback = pathCache.get(FALLBACK_ICON_PATH) ?? new Path2D(FALLBACK_ICON_PATH);
    pathCache.set(FALLBACK_ICON_PATH, fallback);
    return fallback;
  }
}

export function BasicIcon(props: A2uiComponentProps): JSX.Element {
  const nameProp = props.bridge.prop("name");
  const weightProp = props.bridge.prop<number | undefined>("weight");
  const buttonForeground = ButtonForegroundContext();

  const resolvedIcon = computed(() =>
    resolveIconSvgPath(unwrapBinding(nameProp())),
  );
  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: a11y().label !== undefined ? "image" : undefined,
    decorativeByDefault: true,
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
    <Canvas
      testID={props.testId}
      style={{
        width: ICON_VIEWBOX_SIZE,
        height: ICON_VIEWBOX_SIZE,
        ...weightStyle(weightProp()),
      }}
      role={a11yProps().role}
      accessibilityLabel={a11yProps().accessibilityLabel}
      accessibilityDescription={a11yProps().accessibilityDescription}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
      draw={(cx, size) => {
        const icon = resolvedIcon();
        const path = getOrCreatePath2D(icon.pathData);
        const width = size.width > 0 ? size.width : ICON_VIEWBOX_SIZE;
        const height = size.height > 0 ? size.height : ICON_VIEWBOX_SIZE;
        cx.save();
        cx.scale(width / ICON_VIEWBOX_SIZE, height / ICON_VIEWBOX_SIZE);
        cx.fillStyle = token(buttonForeground?.() ?? "foreground");
        cx.fill(path, "evenodd");
        cx.restore();
      }}
    />
  );
}
