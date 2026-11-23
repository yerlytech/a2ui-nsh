/**
 * A2UI Basic Catalog v1 `Image` component on Native Shell (`nsh 0.6.1`).
 *
 * Supports `url` (sanitized against unsafe schemes), `description` (fallback
 * accessibility label overridden by `@accessibility.label`), `fit`, `variant`,
 * `weight`, and graceful fallback when loading fails or is denied by sandbox
 * capabilities.
 */

import {
  Image,
  View,
  computed,
  effect,
  signal,
  type ImageStyle,
  type JSX,
} from "nsh";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  unwrapOptionalString,
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import { sanitizeMediaUrl } from "./media_url";

function mapImageFit(value: unknown): NonNullable<ImageStyle["objectFit"]> {
  switch (value) {
    case "contain":
      return "contain";
    case "cover":
      return "cover";
    case "none":
      return "none";
    case "scaleDown":
      return "scale-down";
    case "fill":
    default:
      return "fill";
  }
}

function variantDimensions(variant: unknown): ImageStyle {
  switch (variant) {
    case "icon":
      return { width: 24, height: 24, borderRadius: 4 };
    case "avatar":
      return { width: 40, height: 40, borderRadius: 20 };
    case "smallFeature":
      return { width: 100, height: 100, borderRadius: 8 };
    case "largeFeature":
      return { width: "100%", height: 320, maxHeight: 400, borderRadius: 8 };
    case "header":
      return { width: "100%", height: 200 };
    case "mediumFeature":
    default:
      return { width: "100%", maxWidth: 240, height: 160, borderRadius: 8 };
  }
}

export function BasicImage(props: A2uiComponentProps): JSX.Element {
  const urlProp = props.bridge.prop("url");
  const descProp = props.bridge.prop("description");
  const fitProp = props.bridge.prop<string | undefined>("fit");
  const variantProp = props.bridge.prop<string | undefined>("variant");
  const weightProp = props.bridge.prop<number | undefined>("weight");

  const failedUrl = signal<string | undefined>(undefined);

  const safeUrl = computed(() =>
    sanitizeMediaUrl(unwrapOptionalString(urlProp())),
  );
  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "image",
    fallbackLabel: unwrapOptionalString(descProp()),
  }));
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  const imageStyle = computed<ImageStyle>(() => ({
    ...variantDimensions(variantProp()),
    objectFit: mapImageFit(fitProp()),
    ...weightStyle(weightProp()),
  }));

  const canRenderImage = computed(() => {
    const url = safeUrl();
    return url !== undefined && failedUrl() !== url;
  });

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
      when={canRenderImage()}
      else={
        <View
          testID={props.testId}
          class="items-center justify-center border border-border bg-muted"
          style={imageStyle()}
          role={a11yProps().role}
          accessibilityLabel={a11yProps().accessibilityLabel}
          accessibilityDescription={a11yProps().accessibilityDescription}
          accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
          importantForAccessibility={a11yProps().importantForAccessibility}
          android={a11yProps().android}
        />
      }
    >
      <Image
        testID={props.testId}
        src={safeUrl()}
        style={imageStyle()}
        role={a11yProps().role}
        accessibilityLabel={a11yProps().accessibilityLabel}
        accessibilityDescription={a11yProps().accessibilityDescription}
        accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
        importantForAccessibility={a11yProps().importantForAccessibility}
        android={a11yProps().android}
        onError={() => {
          const url = safeUrl();
          if (url !== undefined) {
            failedUrl.set(url);
          }
        }}
      />
    </If>
  );
}
