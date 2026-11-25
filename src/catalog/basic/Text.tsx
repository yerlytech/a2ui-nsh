/**
 * A2UI Basic Catalog v1 `Text` component on Native Shell (`nsh 0.7.0`).
 *
 * Renders plain text and `caption` variants via `<Text>` and A2UI's simple
 * Markdown subset (without raw HTML, active links, or images) via `nsh/base`
 * `<TextView>`.
 */

import { Text, View, computed, effect, type JSX, type TextStyle } from "nsh";
import { TextView } from "nsh/base";
import type { ComponentMetadata } from "../../core/catalog";
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
import { parseA2uiMarkdown } from "./markdown";
import { ButtonForegroundContext } from "./Button";

const VALID_TEXT_OVERFLOW = new Set<NonNullable<TextStyle["textOverflow"]>>([
  "ellipsis",
  "clip",
  "ellipsis-start",
  "ellipsis-middle",
]);

/**
 * Extracts optional `nsh` truncation overrides from A2UI `@metadata.extensions`
 * (`nsh_numberOfLines`, `nsh_textOverflow`) so long single-line labels such as
 * e-mail addresses ellipsize cleanly instead of breaking mid-word.
 */
export function resolveTextTruncationStyle(
  metadata: ComponentMetadata | undefined,
): TextStyle {
  const extensions = metadata?.extensions;
  if (!extensions || typeof extensions !== "object") {
    return {};
  }
  const style: TextStyle = {};
  const rawLines = extensions["nsh_numberOfLines"];
  if (
    typeof rawLines === "number" &&
    Number.isFinite(rawLines) &&
    rawLines >= 1
  ) {
    style.numberOfLines = Math.floor(rawLines);
  }
  const rawOverflow = extensions["nsh_textOverflow"];
  if (
    typeof rawOverflow === "string" &&
    VALID_TEXT_OVERFLOW.has(
      rawOverflow as NonNullable<TextStyle["textOverflow"]>,
    )
  ) {
    style.textOverflow = rawOverflow as NonNullable<TextStyle["textOverflow"]>;
  }
  return style;
}

export function BasicText(props: A2uiComponentProps): JSX.Element {
  const textProp = props.bridge.prop("text");
  const variantProp = props.bridge.prop<string | undefined>("variant");
  const weightProp = props.bridge.prop<number | undefined>("weight");
  const buttonForeground = ButtonForegroundContext();

  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const plainTextStyle = computed<TextStyle>(() => ({
    ...weightStyle(weightProp()),
    ...resolveTextTruncationStyle(props.bridge.metadata()),
  }));
  const rawText = computed(() => unwrapString(textProp()));
  const variant = computed(() =>
    variantProp() === "caption" ? "caption" : "body",
  );
  const plainTextClass = computed(() => {
    const tone = buttonForeground?.();
    if (tone === "primary-foreground") {
      return variant() === "caption"
        ? "text-xs text-primary-foreground"
        : "text-base text-primary-foreground";
    }
    if (tone === "secondary-foreground") {
      return variant() === "caption"
        ? "text-xs text-secondary-foreground"
        : "text-base text-secondary-foreground";
    }
    return variant() === "caption"
      ? "text-xs text-muted-foreground"
      : "text-base text-foreground";
  });
  const markdownTextClass = computed(() => {
    const tone = buttonForeground?.();
    if (tone === "primary-foreground") {
      return "text-base text-primary-foreground";
    }
    if (tone === "secondary-foreground") {
      return "text-base text-secondary-foreground";
    }
    return "text-base text-foreground";
  });
  const parsedMarkdown = computed(() =>
    variant() === "caption" ? undefined : parseA2uiMarkdown(rawText()),
  );
  const visibleText = computed(() => {
    const parsed = parsedMarkdown();
    return parsed ? parsed.visibleText : rawText();
  });
  const isFormattedMarkdown = computed(() => {
    const parsed = parsedMarkdown();
    return parsed !== undefined && parsed.hasFormatting;
  });

  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "text",
  }));
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  useLiveRegionAnnouncement(a11y, visibleText);

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
      when={isFormattedMarkdown()}
      else={
        <Text
          testID={props.testId}
          class={plainTextClass()}
          style={plainTextStyle()}
          role={a11yProps().role}
          accessibilityLabel={a11yProps().accessibilityLabel}
          accessibilityDescription={a11yProps().accessibilityDescription}
          accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
          importantForAccessibility={a11yProps().importantForAccessibility}
          accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
        >
          {visibleText()}
        </Text>
      }
    >
      {/* Wrap nsh/base TextView in View so full accessibility props apply (Spec 001 §3 Gap #1). */}
      <View
        testID={props.testId}
        style={weightStyle(weightProp())}
        role={a11yProps().role}
        accessibilityLabel={a11yProps().accessibilityLabel}
        accessibilityDescription={a11yProps().accessibilityDescription}
        accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
        importantForAccessibility={a11yProps().importantForAccessibility}
        accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
      >
        <TextView
          document={parsedMarkdown()?.document ?? { blocks: [] }}
          links="report"
          class={markdownTextClass()}
        />
      </View>
    </If>
  );
}
