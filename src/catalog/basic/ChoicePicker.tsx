/**
 * A2UI Basic Catalog v1 `ChoicePicker` component on Native Shell (`nsh 0.6.1`).
 *
 * Maps every combination of `variant` (`mutuallyExclusive` | `multipleSelection`),
 * `displayStyle` (`checkbox` | `chips`), and `filterable` onto accessible
 * `nsh/base` controls:
 * - `mutuallyExclusive` + `checkbox`: `<RadioGroup>` + `<Radio>` (WAI-ARIA
 *   `radiogroup` with arrow-key navigation)
 * - `multipleSelection` + `checkbox`: `<View role="group">` + `<Checkbox>`
 * - `chips` (single or multi): `<View role="group">` + `<Toggle>` pill chips
 * - `filterable: true`: inline search `<Input>` filtering options case-insensitively
 *
 * Performs batched two-way `string[]` `@path` writes and renders `@checks`
 * error/warning/info feedback.
 */

import {
  Canvas,
  Path2D,
  Text,
  View,
  computed,
  effect,
  signal,
  token,
  type JSX,
  type ViewRef,
} from "nsh";
import { Checkbox, Input, Radio, RadioGroup, Toggle } from "nsh/base";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  resolveEffectiveLabel,
  useLiveRegionAnnouncement,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  unwrapBinding,
  unwrapBoolean,
  unwrapString,
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import { BASIC_ICON_PATHS } from "./icon_paths";
import {
  ValidationFeedback,
  extractCheckableState,
  writeBinding,
} from "./validation_feedback";

/** Normalized choice option extracted from a resolved `ChoicePicker.options` array. */
export interface ResolvedChoiceOption {
  readonly label: string;
  readonly value: string;
}

/** Extracts resolved option labels and stable string values from `ChoicePicker.options`. */
export function extractChoiceOptions(
  raw: unknown,
): readonly ResolvedChoiceOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ResolvedChoiceOption[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (entry !== null && typeof entry === "object") {
      const rec = entry as Record<string, unknown>;
      const rawVal = unwrapBinding(rec["value"]);
      if (typeof rawVal === "string") {
        out.push({
          label: unwrapString(rec["label"]),
          value: rawVal,
        });
      }
    }
  }
  return out;
}

/** Normalizes a resolved `DynamicStringList` value into a `readonly string[]`. */
export function normalizeSelectedValues(raw: unknown): readonly string[] {
  const unwrapped = unwrapBinding(raw);
  if (Array.isArray(unwrapped)) {
    const out: string[] = [];
    for (let i = 0; i < unwrapped.length; i += 1) {
      const item = unwrapped[i];
      if (typeof item === "string") {
        out.push(item);
      } else if (item !== null && item !== undefined) {
        out.push(String(item));
      }
    }
    return out;
  }
  if (typeof unwrapped === "string" && unwrapped.length > 0) {
    return [unwrapped];
  }
  return [];
}

const CHECK_VIEWBOX = 24;
const CHECK_SIZE = 14;
let cachedChoiceCheckPath: Path2D | undefined;

function getChoiceCheckPath(): Path2D {
  if (!cachedChoiceCheckPath) {
    cachedChoiceCheckPath = new Path2D(BASIC_ICON_PATHS["check"]!);
  }
  return cachedChoiceCheckPath;
}

export function BasicChoicePicker(props: A2uiComponentProps): JSX.Element {
  const labelProp = props.bridge.prop("label");
  const variantProp = props.bridge.prop<string | undefined>("variant");
  const optionsProp = props.bridge.prop("options");
  const valueProp = props.bridge.prop("value");
  const displayStyleProp = props.bridge.prop<string | undefined>("displayStyle");
  const filterableProp = props.bridge.prop<boolean | undefined>("filterable");
  const weightProp = props.bridge.prop<number | undefined>("weight");
  const isValidProp = props.bridge.prop<boolean | undefined>("isValid");
  const validationErrorsProp = props.bridge.prop("validationErrors");
  const validationResultsProp = props.bridge.prop("validationResults");

  const filterQuery = signal("");
  const feedbackRef = signal<ViewRef | null>(null);

  const labelText = computed(() => unwrapString(labelProp()));
  const isMulti = computed(() => variantProp() === "multipleSelection");
  const isChips = computed(() => displayStyleProp() === "chips");
  const isFilterable = computed(() => unwrapBoolean(filterableProp()) === true);

  const allOptions = computed(() => extractChoiceOptions(optionsProp()));
  const visibleOptions = computed(() => {
    const opts = allOptions();
    if (!isFilterable()) {
      return opts;
    }
    const q = filterQuery().trim().toLowerCase();
    if (q.length === 0) {
      return opts;
    }
    return opts.filter((opt) => opt.label.toLowerCase().includes(q));
  });

  const selectedValues = computed(() => normalizeSelectedValues(valueProp()));

  const checkState = computed(() =>
    extractCheckableState(
      isValidProp(),
      validationErrorsProp(),
      validationResultsProp(),
    ),
  );

  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: !isChips() && !isMulti() ? "radiogroup" : "group",
    fallbackLabel: labelText().length > 0 ? labelText() : undefined,
  }));
  const effectiveLabel = computed(() =>
    resolveEffectiveLabel(a11y(), a11yOptions().fallbackLabel),
  );
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  useLiveRegionAnnouncement(a11y, () => selectedValues().join(", "));

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

  const toggleOption = (optionValue: string): void => {
    const current = selectedValues();
    if (isMulti()) {
      const exists = current.includes(optionValue);
      const next = exists
        ? current.filter((v) => v !== optionValue)
        : [...current, optionValue];
      writeBinding(valueProp(), next);
    } else {
      writeBinding(valueProp(), [optionValue]);
    }
  };

  return (
    <View
      testID={props.testId}
      class="gap-2"
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

      <If when={isFilterable()}>
        <Input
          testID={`${props.testId}:filter`}
          value={filterQuery()}
          placeholder="Filter options..."
          accessibilityLabel="Filter options"
          class="min-h-[44px] w-full rounded-(--radius) border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus-visible:outline-2"
          onChange={(e) => filterQuery.set(e.value)}
        />
      </If>

      <If
        when={visibleOptions().length > 0}
        else={
          <Text
            testID={`${props.testId}:empty`}
            class="text-xs text-muted-foreground"
          >
            No matching options
          </Text>
        }
      >
        <If
          when={isChips()}
          else={
            <If
              when={isMulti()}
              else={
                <RadioGroup
                  testID={`${props.testId}:group`}
                  accessibilityLabel={effectiveLabel()}
                  class="gap-1"
                >
                  <Each of={visibleOptions()} key={(opt) => opt.value}>
                    {(opt) => {
                      const isSelected = computed(() =>
                        selectedValues().includes(opt().value),
                      );
                      return (
                        <Radio
                          testID={`${props.testId}:option:${opt().value}`}
                          checked={isSelected()}
                          accessibilityLabel={opt().label}
                          class="group min-h-[44px] flex-row items-center gap-2.5 py-2 focus-visible:outline-2"
                          onChange={() => toggleOption(opt().value)}
                        >
                          <View
                            class={
                              isSelected()
                                ? "h-5 w-5 items-center justify-center rounded-full border-2 border-primary"
                                : checkState().isInvalid
                                  ? "h-5 w-5 items-center justify-center rounded-full border-2 border-destructive"
                                  : "h-5 w-5 items-center justify-center rounded-full border-2 border-input"
                            }
                          >
                            <If when={isSelected()}>
                              <View class="h-2.5 w-2.5 rounded-full bg-primary" />
                            </If>
                          </View>
                          <Text class="text-sm text-foreground">
                            {opt().label}
                          </Text>
                        </Radio>
                      );
                    }}
                  </Each>
                </RadioGroup>
              }
            >
              <View
                testID={`${props.testId}:group`}
                role="group"
                accessibilityLabel={effectiveLabel()}
                class="gap-1"
              >
                <Each of={visibleOptions()} key={(opt) => opt.value}>
                  {(opt) => {
                    const isSelected = computed(() =>
                      selectedValues().includes(opt().value),
                    );
                    return (
                      <Checkbox
                        testID={`${props.testId}:option:${opt().value}`}
                        checked={isSelected()}
                        accessibilityLabel={opt().label}
                        class="group min-h-[44px] flex-row items-center gap-2.5 py-2 focus-visible:outline-2"
                        indicatorClass={
                          checkState().isInvalid
                            ? "h-5 w-5 items-center justify-center rounded border border-destructive bg-background checked:border-primary checked:bg-primary"
                            : "h-5 w-5 items-center justify-center rounded border border-input bg-background checked:border-primary checked:bg-primary"
                        }
                        indicator={
                          <If when={isSelected()}>
                            <Canvas
                              style={{ width: CHECK_SIZE, height: CHECK_SIZE }}
                              accessibilityElementsHidden={true}
                              importantForAccessibility="no-hide-descendants"
                              draw={(cx, size) => {
                                const path = getChoiceCheckPath();
                                const w =
                                  size.width > 0 ? size.width : CHECK_SIZE;
                                const h =
                                  size.height > 0 ? size.height : CHECK_SIZE;
                                cx.save();
                                cx.scale(
                                  w / CHECK_VIEWBOX,
                                  h / CHECK_VIEWBOX,
                                );
                                cx.fillStyle = token("primary-foreground");
                                cx.fill(path, "evenodd");
                                cx.restore();
                              }}
                            />
                          </If>
                        }
                        onChange={() => toggleOption(opt().value)}
                      >
                        <Text class="text-sm text-foreground">
                          {opt().label}
                        </Text>
                      </Checkbox>
                    );
                  }}
                </Each>
              </View>
            </If>
          }
        >
          <View
            testID={`${props.testId}:group`}
            role="group"
            accessibilityLabel={effectiveLabel()}
            class="flex-row flex-wrap gap-2"
          >
            <Each of={visibleOptions()} key={(opt) => opt.value}>
              {(opt) => {
                const isSelected = computed(() =>
                  selectedValues().includes(opt().value),
                );
                return (
                  <Toggle
                    testID={`${props.testId}:option:${opt().value}`}
                    pressed={isSelected()}
                    accessibilityLabel={opt().label}
                    class="group min-h-[44px] flex-row items-center justify-center rounded-full border border-border bg-secondary px-4 py-2 hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary focus-visible:outline-2"
                    onChange={() => toggleOption(opt().value)}
                  >
                    <Text class="text-sm font-medium text-secondary-foreground group-aria-pressed:text-primary-foreground">
                      {opt().label}
                    </Text>
                  </Toggle>
                );
              }}
            </Each>
          </View>
        </If>
      </If>

      <ValidationFeedback
        testId={`${props.testId}:checks`}
        results={checkState().results}
        ref={(el) => feedbackRef.set(el)}
      />
    </View>
  );
}
