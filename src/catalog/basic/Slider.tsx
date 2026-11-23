/**
 * A2UI Basic Catalog v1 `Slider` component on Native Shell (`nsh 0.6.1`).
 *
 * Wraps `nsh/base` `<Slider>` with A2UI `min` (default `0`), `max`, two-way
 * `DynamicNumber` `value`, division-count `steps` translation (`step = (max - min) / steps`,
 * or continuous `step={0}` when omitted), optional `label`, `weight`,
 * `Checkable` `@checks` via `ValidationFeedback`, and full `@accessibility`
 * plumbing via an outer `<View>` container (Spec 002 §1 & §3 Gap #8).
 */

import {
  Text,
  View,
  computed,
  effect,
  signal,
  type JSX,
  type ViewRef,
} from "nsh";
import { Slider } from "nsh/base";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  resolveEffectiveLabel,
  useLiveRegionAnnouncement,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  unwrapNumber,
  unwrapString,
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import {
  ValidationFeedback,
  extractCheckableState,
  writeBinding,
} from "./validation_feedback";

export interface SliderBounds {
  readonly min: number;
  readonly max: number;
}

/**
 * Resolves valid finite `[min, max]` bounds for an A2UI `Slider`.
 * Defaults `min` to `0` and ensures `max >= min`.
 */
export function resolveSliderBounds(
  minRaw: unknown,
  maxRaw: unknown,
): SliderBounds {
  const min =
    typeof minRaw === "number" && Number.isFinite(minRaw) ? minRaw : 0;
  const maxCandidate =
    typeof maxRaw === "number" && Number.isFinite(maxRaw)
      ? maxRaw
      : Math.max(min, 100);
  const max = maxCandidate >= min ? maxCandidate : min;
  return { min, max };
}

/**
 * Translates A2UI's division count `steps` (integer >= 1) into `nsh/base`'s
 * `step` increment (`(max - min) / steps`). Returns `0` (continuous in
 * `nsh/base`) when `steps` is omitted or invalid, or when `max <= min`.
 */
export function resolveSliderStep(
  min: number,
  max: number,
  stepsRaw: unknown,
): number {
  if (
    typeof stepsRaw !== "number" ||
    !Number.isFinite(stepsRaw) ||
    stepsRaw < 1
  ) {
    return 0;
  }
  const divisions = Math.floor(stepsRaw);
  if (divisions < 1 || max <= min) {
    return 0;
  }
  return (max - min) / divisions;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function cleanFloat(value: number): number {
  const rounded = Number(value.toPrecision(12));
  return normalizeZero(rounded);
}

/**
 * Clamps `rawValue` to `[min, max]` and, when discrete `steps >= 1` is given,
 * snaps to the nearest division `min + k * ((max - min) / steps)`.
 */
export function clampAndSnapSliderValue(
  rawValue: number,
  min: number,
  max: number,
  stepsRaw: unknown,
): number {
  if (!Number.isFinite(rawValue)) {
    return normalizeZero(min);
  }
  const clamped = Math.min(max, Math.max(min, rawValue));
  const step = resolveSliderStep(min, max, stepsRaw);
  if (step <= 0 || max <= min) {
    return normalizeZero(clamped);
  }
  const divisions = Math.floor(stepsRaw as number);
  const index = Math.min(
    divisions,
    Math.max(0, Math.round((clamped - min) / step)),
  );
  if (index === 0) {
    return normalizeZero(min);
  }
  if (index === divisions) {
    return normalizeZero(max);
  }
  const snapped = min + index * step;
  return Math.min(max, Math.max(min, cleanFloat(snapped)));
}

/** Formats a slider value concisely for display without trailing zeroes. */
export function formatSliderDisplayValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const normalized = normalizeZero(value);
  if (Number.isInteger(normalized)) {
    return String(normalized);
  }
  const fixed = normalized.toFixed(4).replace(/\.?0+$/, "");
  return fixed === "-0" ? "0" : fixed;
}

export function BasicSlider(props: A2uiComponentProps): JSX.Element {
  const labelProp = props.bridge.prop("label");
  const minProp = props.bridge.prop("min");
  const maxProp = props.bridge.prop("max");
  const valueProp = props.bridge.prop("value");
  const stepsProp = props.bridge.prop("steps");
  const weightProp = props.bridge.prop<number | undefined>("weight");
  const isValidProp = props.bridge.prop<boolean | undefined>("isValid");
  const validationErrorsProp = props.bridge.prop("validationErrors");
  const validationResultsProp = props.bridge.prop("validationResults");

  const feedbackRef = signal<ViewRef | null>(null);

  const labelText = computed(() => unwrapString(labelProp()));
  const bounds = computed(() =>
    resolveSliderBounds(unwrapNumber(minProp()), unwrapNumber(maxProp())),
  );
  const stepsRaw = computed(() => unwrapNumber(stepsProp()));
  const stepValue = computed(() => {
    const b = bounds();
    return resolveSliderStep(b.min, b.max, stepsRaw());
  });
  const currentValue = computed(() => {
    const b = bounds();
    const raw = unwrapNumber(valueProp());
    if (raw === undefined) {
      return normalizeZero(b.min);
    }
    return normalizeZero(Math.min(b.max, Math.max(b.min, raw)));
  });
  const formattedValue = computed(() =>
    formatSliderDisplayValue(currentValue()),
  );

  const checkState = computed(() =>
    extractCheckableState(
      isValidProp(),
      validationErrorsProp(),
      validationResultsProp(),
    ),
  );

  const a11y = computed(() =>
    normalizeAccessibility(props.bridge.accessibility()),
  );
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "adjustable",
    fallbackLabel: labelText().length > 0 ? labelText() : undefined,
  }));
  const effectiveLabel = computed(() =>
    resolveEffectiveLabel(a11y(), a11yOptions().fallbackLabel),
  );
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  useLiveRegionAnnouncement(a11y, () =>
    labelText().length > 0
      ? `${labelText()} ${formattedValue()}`
      : formattedValue(),
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

  const rangeClass = computed(() =>
    checkState().isInvalid
      ? "rounded-full bg-destructive"
      : "rounded-full bg-primary",
  );
  const thumbClass = computed(() =>
    checkState().isInvalid
      ? "size-5 rounded-full border-2 border-destructive bg-background focus-visible:outline-2"
      : "size-5 rounded-full border-2 border-primary bg-background focus-visible:outline-2",
  );

  return (
    // Outer View carries `description`, `hidden`, `invalid`, `describedBy`, and
    // `android` live region omitted from `nsh/base` `ComponentHostProps` (Spec 002 §3 Gap #8).
    <View
      testID={`${props.testId}:container`}
      class="w-full gap-1"
      style={weightStyle(weightProp())}
      role={a11y().live === "assertive" ? "alert" : undefined}
      accessibilityDescription={a11yProps().accessibilityDescription}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityState={
        checkState().isInvalid ? { invalid: true } : undefined
      }
      accessibilityDescribedBy={
        checkState().results.length > 0 ? feedbackRef() : null
      }
      android={a11yProps().android}
    >
      <View class="flex-row items-center justify-between gap-2">
        <If when={labelText().length > 0}>
          <Text
            testID={`${props.testId}:label`}
            class={
              checkState().isInvalid
                ? "text-sm font-medium text-destructive"
                : "text-sm font-medium text-foreground"
            }
          >
            {labelText()}
          </Text>
        </If>
        <Text
          testID={`${props.testId}:value`}
          class="text-xs text-muted-foreground"
        >
          {formattedValue()}
        </Text>
      </View>

      <Slider
        testID={props.testId}
        min={bounds().min}
        max={bounds().max}
        step={stepValue()}
        value={currentValue()}
        accessibilityLabel={effectiveLabel() ?? null}
        class="w-full"
        trackClass="h-10 w-full justify-center"
        indicatorClass="h-2 w-full rounded-full bg-muted"
        rangeClass={rangeClass()}
        thumbClass={thumbClass()}
        onChange={(event) => {
          const b = bounds();
          const raw = Array.isArray(event.value) ? event.value[1] : event.value;
          const next = clampAndSnapSliderValue(raw, b.min, b.max, stepsRaw());
          writeBinding(valueProp(), next);
        }}
      />

      <ValidationFeedback
        testId={`${props.testId}:checks`}
        results={checkState().results}
        ref={(el) => feedbackRef.set(el)}
      />
    </View>
  );
}
