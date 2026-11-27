/**
 * A2UI Basic Catalog v1 `TextField` component on Native Shell (`nsh 0.7.1`).
 *
 * Uses `nsh/base` `<Input>` supporting `shortText`, `longText` (`multiline`),
 * `number` (`decimal-pad`), and `obscured` (`masked`), batched two-way `@path`
 * writes, reactive `@checks` error/warning/info presentation wired via
 * `accessibilityState.invalid` and `accessibilityDescribedBy`, and full
 * `@accessibility` plumbing.
 */

import {
  Text,
  View,
  computed,
  effect,
  signal,
  type JSX,
  type KeyboardType,
  type ViewRef,
} from "nsh";
import { Input } from "nsh/base";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  resolveEffectiveLabel,
  useLiveRegionAnnouncement,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  unwrapOptionalString,
  unwrapString,
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import {
  ValidationFeedback,
  extractCheckableState,
  writeBinding,
} from "./validation_feedback";

export function BasicTextField(props: A2uiComponentProps): JSX.Element {
  const labelProp = props.bridge.prop("label");
  const valueProp = props.bridge.prop("value");
  const placeholderProp = props.bridge.prop("placeholder");
  const variantProp = props.bridge.prop<string | undefined>("variant");
  const weightProp = props.bridge.prop<number | undefined>("weight");
  const isValidProp = props.bridge.prop<boolean | undefined>("isValid");
  const validationErrorsProp = props.bridge.prop("validationErrors");
  const validationResultsProp = props.bridge.prop("validationResults");

  const feedbackRef = signal<ViewRef | null>(null);

  const labelText = computed(() => unwrapString(labelProp()));
  const valueText = computed(() => unwrapString(valueProp()));
  const placeholderText = computed(() =>
    unwrapOptionalString(placeholderProp()),
  );
  const variant = computed(() => {
    const raw = variantProp();
    if (raw === "longText" || raw === "number" || raw === "obscured") {
      return raw;
    }
    return "shortText";
  });

  const isMultiline = computed(() => variant() === "longText");
  const isMasked = computed(() => variant() === "obscured");
  const keyboardType = computed<KeyboardType>(() =>
    variant() === "number" ? "decimal-pad" : "default",
  );

  const checkState = computed(() =>
    extractCheckableState(
      isValidProp(),
      validationErrorsProp(),
      validationResultsProp(),
    ),
  );

  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    snapshotRole: "textbox",
    fallbackLabel: labelText().length > 0 ? labelText() : undefined,
  }));
  const effectiveLabel = computed(() =>
    resolveEffectiveLabel(a11y(), a11yOptions().fallbackLabel),
  );
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  useLiveRegionAnnouncement(a11y, () => {
    const firstMsg = checkState().results[0]?.message;
    return firstMsg ?? valueText();
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

  const inputClass = computed(() => {
    const borderClass = checkState().isInvalid
      ? "border-destructive"
      : "border-input focus:border-primary";
    const sizeClass = isMultiline() ? "min-h-[88px] py-2.5" : "min-h-[44px] py-2";
    return `w-full rounded-(--radius) border bg-background px-3 text-sm text-foreground ${sizeClass} ${borderClass} focus-visible:outline-2`;
  });

  return (
    <View
      testID={`${props.testId}:container`}
      class="gap-1.5"
      style={weightStyle(weightProp())}
      role={a11y().live === "assertive" ? "alert" : undefined}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
    >
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
      <Input
        testID={props.testId}
        value={valueText()}
        placeholder={placeholderText()}
        multiline={isMultiline()}
        masked={isMasked()}
        keyboardType={keyboardType()}
        autoCorrect={isMasked() ? false : undefined}
        autoCapitalize={isMasked() ? "none" : undefined}
        class={inputClass()}
        role="textbox"
        accessibilityLabel={effectiveLabel()}
        accessibilityDescription={a11y().description}
        accessibilityState={
          checkState().isInvalid ? { invalid: true } : undefined
        }
        accessibilityDescribedBy={
          checkState().results.length > 0 ? feedbackRef() : null
        }
        onChange={(event) => {
          writeBinding(valueProp(), event.value);
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
