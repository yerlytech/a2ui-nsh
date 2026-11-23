/**
 * Accessibility plumbing from A2UI v1.0 `@accessibility` attributes to
 * Native Shell (`nsh 0.6.1`) views and `nsh/base` wrappers.
 *
 * Addresses the two `nsh 0.6.1` gaps documented in Spec 001 §3:
 * 1. `nsh/base` `ComponentHostProps` omits `accessibilityLabel`,
 *    `accessibilityDescription`, `accessibilityElementsHidden`, `role`, and
 *    `android.accessibilityLiveRegion`, so `nsh/base` controls (e.g. `TextView`)
 *    use a transparent `<View>` wrapper when accessibility attributes apply.
 * 2. `accessibilityLiveRegion` is Android-only in `nsh 0.6.1` TSX
 *    (`android={{ accessibilityLiveRegion }}`), so cross-platform live regions
 *    pair `role="alert"` (for `assertive`) with `announce()` on dynamic updates.
 */

import {
  announce,
  effect,
  type AccessibilityRole,
  type Accessor,
  type LiveRegion,
} from "nsh";

/** `nsh`'s `announce()`: says a message to assistive technology on every target. */
export { announce };

/** A2UI v1.0 `@accessibility.live` values (`common_types.json#/$defs/AccessibilityAttributes`). */
export type LiveRegionMode = "off" | "polite" | "assertive";

/** Normalized resolved A2UI v1.0 `@accessibility` attributes. */
export interface ResolvedAccessibility {
  readonly label?: string;
  readonly description?: string;
  readonly live?: LiveRegionMode;
  readonly hidden?: boolean;
}

/** Semantic role mirrored in `AccessibilitySnapshot` (includes `"textbox"`, omitted from `nsh 0.6.1` `AccessibilityRole`). */
export type SnapshotAccessibilityRole = AccessibilityRole | "textbox";

/** Options controlling how component defaults merge with explicit `@accessibility`. */
export interface AccessibilityOptions {
  /** Default native accessibility role when `live` is not `"assertive"`. */
  readonly defaultRole?: AccessibilityRole;
  /**
   * Optional semantic role mirrored into `AccessibilitySnapshot` when the
   * platform control reports a native role (e.g. `"textbox"` on `<Input>`) that
   * `nsh 0.6.1`'s `AccessibilityRole` union omits (Spec 001 §3 Gap #9c).
   */
  readonly snapshotRole?: SnapshotAccessibilityRole;
  /** Optional checked state mirrored into `AccessibilitySnapshot` (e.g. `CheckBox`). */
  readonly checked?: boolean;
  /** Inferred/fallback label (e.g. `Image.description`); explicit `@accessibility.label` wins. */
  readonly fallbackLabel?: string;
  /**
   * When true (e.g. decorative `Icon` or `Divider`), hides the element from
   * assistive technologies unless explicit label/description or `hidden: false` is set.
   */
  readonly decorativeByDefault?: boolean;
}

/** Subset of `nsh 0.6.1` `ViewProps` carrying native accessibility metadata. */
export interface ViewAccessibilityProps {
  readonly role?: AccessibilityRole;
  readonly accessibilityLabel?: string;
  readonly accessibilityDescription?: string;
  readonly accessibilityElementsHidden?: boolean;
  readonly importantForAccessibility?: "auto" | "yes" | "no" | "no-hide-descendants";
  readonly android?: {
    readonly accessibilityLiveRegion?: LiveRegion;
  };
}

/**
 * Typed accessibility mirror snapshot for headless tests (Spec 001 §3 Gap #3,
 * because `nsh/test` 0.6.1 does not yet expose `accessibilityDescription()` or
 * `accessibilityElementsHidden()`).
 */
export interface AccessibilitySnapshot {
  readonly label?: string;
  readonly description?: string;
  readonly live?: LiveRegionMode;
  readonly hidden: boolean;
  readonly role?: SnapshotAccessibilityRole;
  readonly checked?: boolean;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseLiveRegionMode(value: unknown): LiveRegionMode | undefined {
  if (value === "off" || value === "polite" || value === "assertive") {
    return value;
  }
  return undefined;
}

/** Normalizes a raw resolved `@accessibility` record from `ComponentNode.accessibility`. */
export function normalizeAccessibility(
  raw: Readonly<Record<string, unknown>> | undefined,
): ResolvedAccessibility {
  if (!raw) {
    return {};
  }
  const label = nonEmptyString(raw["label"]);
  const description = nonEmptyString(raw["description"]);
  const live = parseLiveRegionMode(raw["live"]);
  const hidden = typeof raw["hidden"] === "boolean" ? raw["hidden"] : undefined;
  return {
    ...(label !== undefined ? { label } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(live !== undefined ? { live } : {}),
    ...(hidden !== undefined ? { hidden } : {}),
  };
}

/** Resolves the effective screen-reader label: explicit `@accessibility.label` overrides fallback. */
export function resolveEffectiveLabel(
  a11y: ResolvedAccessibility,
  fallbackLabel?: string,
): string | undefined {
  if (a11y.label !== undefined) {
    return a11y.label;
  }
  return nonEmptyString(fallbackLabel);
}

/** Maps A2UI `live` mode onto `nsh`'s Android `LiveRegion` prop value. */
export function mapAndroidLiveRegion(
  live: LiveRegionMode | undefined,
): LiveRegion | undefined {
  if (live === "polite") {
    return "polite";
  }
  if (live === "assertive") {
    return "assertive";
  }
  if (live === "off") {
    return "none";
  }
  return undefined;
}

/** Resolves whether the element should be hidden from assistive technologies. */
export function resolveEffectiveHidden(
  a11y: ResolvedAccessibility,
  options?: AccessibilityOptions,
): boolean {
  if (a11y.hidden !== undefined) {
    return a11y.hidden;
  }
  if (options?.decorativeByDefault) {
    const label = resolveEffectiveLabel(a11y, options.fallbackLabel);
    return label === undefined && a11y.description === undefined;
  }
  return false;
}

/** Resolves the effective native `AccessibilityRole`. */
export function resolveEffectiveRole(
  a11y: ResolvedAccessibility,
  options?: AccessibilityOptions,
): AccessibilityRole | undefined {
  if (a11y.live === "assertive") {
    return "alert";
  }
  return options?.defaultRole;
}

/**
 * Builds native `nsh 0.6.1` accessibility props for primitive elements
 * (`<View>`, `<Text>`, `<Image>`, `<Canvas>`).
 */
export function buildViewAccessibilityProps(
  a11y: ResolvedAccessibility,
  options?: AccessibilityOptions,
): ViewAccessibilityProps {
  const effectiveLabel = resolveEffectiveLabel(a11y, options?.fallbackLabel);
  const effectiveHidden = resolveEffectiveHidden(a11y, options);
  const role = resolveEffectiveRole(a11y, options);
  const androidLive = mapAndroidLiveRegion(a11y.live);

  return {
    ...(role !== undefined ? { role } : {}),
    ...(effectiveLabel !== undefined ? { accessibilityLabel: effectiveLabel } : {}),
    ...(a11y.description !== undefined
      ? { accessibilityDescription: a11y.description }
      : {}),
    ...(effectiveHidden
      ? {
          accessibilityElementsHidden: true,
          importantForAccessibility: "no-hide-descendants" as const,
        }
      : {}),
    ...(androidLive !== undefined
      ? { android: { accessibilityLiveRegion: androidLive } }
      : {}),
  };
}

/**
 * Returns true when an `nsh/base` component (whose `ComponentHostProps` drops
 * `accessibilityDescription`, `accessibilityElementsHidden`, `role`, and
 * `android.accessibilityLiveRegion`) requires a transparent `<View>` wrapper.
 */
export function needsAccessibilityWrapper(
  a11y: ResolvedAccessibility,
  options?: AccessibilityOptions,
): boolean {
  const effectiveLabel = resolveEffectiveLabel(a11y, options?.fallbackLabel);
  const effectiveHidden = resolveEffectiveHidden(a11y, options);
  const role = resolveEffectiveRole(a11y, options);
  return (
    effectiveLabel !== undefined ||
    a11y.description !== undefined ||
    effectiveHidden ||
    role !== undefined ||
    (a11y.live !== undefined && a11y.live !== "off")
  );
}

/** Builds a serializable accessibility snapshot for test-mode verification. */
export function buildAccessibilitySnapshot(
  a11y: ResolvedAccessibility,
  options?: AccessibilityOptions,
): AccessibilitySnapshot {
  const label = resolveEffectiveLabel(a11y, options?.fallbackLabel);
  const hidden = resolveEffectiveHidden(a11y, options);
  const role: SnapshotAccessibilityRole | undefined =
    resolveEffectiveRole(a11y, options) ?? options?.snapshotRole;
  return {
    ...(label !== undefined ? { label } : {}),
    ...(a11y.description !== undefined ? { description: a11y.description } : {}),
    ...(a11y.live !== undefined ? { live: a11y.live } : {}),
    hidden,
    ...(role !== undefined ? { role } : {}),
    ...(options?.checked !== undefined ? { checked: options.checked } : {}),
  };
}

/**
 * Announces live-region text changes via `nsh`'s `announce()` so `polite` and
 * `assertive` regions work cross-platform while `accessibilityLiveRegion` is
 * Android-only in `nsh 0.6.1`.
 */
export function useLiveRegionAnnouncement(
  a11yAccessor: Accessor<ResolvedAccessibility>,
  messageAccessor: Accessor<string>,
  onAnnounce: (message: string) => void = announce,
): void {
  let initialized = false;
  let lastMessage = "";

  effect(() => {
    const a11y = a11yAccessor();
    const message = messageAccessor().trim();
    const live = a11y.live;
    const isHidden = a11y.hidden === true;

    if (!initialized) {
      initialized = true;
      lastMessage = message;
      if (!isHidden && live === "assertive" && message.length > 0) {
        onAnnounce(message);
      }
      return;
    }

    if (
      !isHidden &&
      (live === "polite" || live === "assertive") &&
      message.length > 0 &&
      message !== lastMessage
    ) {
      onAnnounce(message);
    }
    lastMessage = message;
  });
}
