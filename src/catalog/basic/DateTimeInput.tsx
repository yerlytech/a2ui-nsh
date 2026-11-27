/**
 * A2UI Basic Catalog v1 `DateTimeInput` component on Native Shell (`nsh 0.7.2`).
 *
 * Composes `nsh/base` `<DatePicker>` and `<TimeField>` across date-only,
 * time-only, and combined date+time modes with `min`/`max` bounds, ISO 8601
 * two-way `@path` binding, `@checks` error/warning/info presentation, and full
 * `@accessibility` plumbing.
 */

import { Text, View, computed, effect, signal, type JSX, type ViewRef } from "nsh";
import { DatePicker, TimeField, type DateMatcher } from "nsh/base";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  resolveEffectiveLabel,
  useLiveRegionAnnouncement,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  unwrapBoolean,
  unwrapOptionalString,
  unwrapString,
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import {
  applyDateTimeEdit,
  extractIsoDatePart,
  extractIsoTimePart,
  getLocalIsoDate,
  resolveDateTimeFlags,
  resolveEffectiveTimeBounds,
} from "./datetime_helpers";
import {
  ValidationFeedback,
  extractCheckableState,
  writeBinding,
} from "./validation_feedback";

export function BasicDateTimeInput(props: A2uiComponentProps): JSX.Element {
  const valueProp = props.bridge.prop("value");
  const enableDateProp = props.bridge.prop<boolean | undefined>("enableDate");
  const enableTimeProp = props.bridge.prop<boolean | undefined>("enableTime");
  const minProp = props.bridge.prop("min");
  const maxProp = props.bridge.prop("max");
  const labelProp = props.bridge.prop("label");
  const weightProp = props.bridge.prop<number | undefined>("weight");
  const isValidProp = props.bridge.prop<boolean | undefined>("isValid");
  const validationErrorsProp = props.bridge.prop("validationErrors");
  const validationResultsProp = props.bridge.prop("validationResults");

  const feedbackRef = signal<ViewRef | null>(null);

  const labelText = computed(() => unwrapString(labelProp()));
  const rawValue = computed(() => unwrapString(valueProp()));
  const rawMin = computed(() => unwrapOptionalString(minProp()));
  const rawMax = computed(() => unwrapOptionalString(maxProp()));

  const flags = computed(() =>
    resolveDateTimeFlags(
      unwrapBoolean(enableDateProp()),
      unwrapBoolean(enableTimeProp()),
    ),
  );

  const datePart = computed(() => extractIsoDatePart(rawValue()));
  const timePart = computed(() => extractIsoTimePart(rawValue()));

  const disabledMatcher = computed<DateMatcher | null>(() => {
    const before = extractIsoDatePart(rawMin());
    const after = extractIsoDatePart(rawMax());
    if (before === null && after === null) {
      return null;
    }
    return {
      ...(before !== null ? { before } : {}),
      ...(after !== null ? { after } : {}),
    };
  });

  // The same time-only bounds applyDateTimeEdit clamps each write to, handed to
  // TimeField's native min/max ("HH:MM") so steps land on them; the clamp stays.
  const timeBounds = computed(() =>
    resolveEffectiveTimeBounds(
      flags().mode,
      flags().mode === "datetime" ? (datePart() ?? getLocalIsoDate()) : null,
      rawMin(),
      rawMax(),
    ),
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
    defaultRole: flags().mode === "datetime" ? "group" : undefined,
    fallbackLabel: labelText().length > 0 ? labelText() : undefined,
  }));
  const effectiveLabel = computed(() =>
    resolveEffectiveLabel(a11y(), a11yOptions().fallbackLabel),
  );
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  useLiveRegionAnnouncement(a11y, () => rawValue());

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

  const handleDateChange = (nextDate: string | null): void => {
    const formatted = applyDateTimeEdit(
      flags().mode,
      rawValue(),
      { kind: "date", value: nextDate },
      { rawMin: rawMin(), rawMax: rawMax() },
    );
    writeBinding(valueProp(), formatted);
  };

  const handleTimeChange = (nextTime: string): void => {
    const formatted = applyDateTimeEdit(
      flags().mode,
      rawValue(),
      { kind: "time", value: nextTime },
      { rawMin: rawMin(), rawMax: rawMax() },
    );
    writeBinding(valueProp(), formatted);
  };

  const triggerBorderClass = computed(() =>
    checkState().isInvalid ? "border-destructive" : "border-input",
  );

  return (
    <View
      testID={`${props.testId}:container`}
      class="gap-1.5"
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

      <View
        testID={props.testId}
        role={flags().mode === "datetime" ? "group" : undefined}
        accessibilityLabel={
          flags().mode === "datetime" ? effectiveLabel() : undefined
        }
        class="flex-row flex-wrap items-center gap-2"
      >
        <If when={flags().enableDate}>
          <DatePicker
            testID={`${props.testId}:date`}
            value={datePart()}
            disabledMatcher={disabledMatcher()}
            cleanable={true}
            clearButton={<Text class="text-xs text-muted-foreground">Clear</Text>}
            clearButtonClass="ml-1 min-h-[36px] justify-center rounded px-2 hover:bg-muted"
            clearButtonAccessibilityLabel="Clear date"
            accessibilityLabel={effectiveLabel() ?? "Date"}
            popupClass="rounded-(--radius) border border-border bg-card p-3"
            headerClass="flex-row items-center justify-between pb-2"
            bodyClass="gap-1"
            rowClass="flex-row gap-1"
            itemClass="min-h-[36px] min-w-[36px] items-center justify-center rounded text-sm text-foreground hover:bg-muted selected:bg-primary selected:text-primary-foreground disabled:opacity-40 focus-visible:outline-2"
            trigger={
              <View
                testID={`${props.testId}:date-trigger`}
                class={`min-h-[44px] min-w-[160px] flex-row items-center justify-between rounded-(--radius) border ${triggerBorderClass()} bg-background px-3 py-2 focus-visible:outline-2`}
              >
                <Text
                  class={
                    datePart() !== null
                      ? "text-sm text-foreground"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {datePart() ?? "Select date"}
                </Text>
              </View>
            }
            onChange={(event) => {
              const next = typeof event.value === "string" ? event.value : null;
              handleDateChange(next);
            }}
          />
        </If>

        <If when={flags().enableTime}>
          <TimeField
            testID={`${props.testId}:time`}
            value={timePart() ?? "00:00"}
            min={timeBounds().minTime}
            max={timeBounds().maxTime}
            precision="minute"
            hourCycle="h23"
            accessibilityLabel={
              flags().mode === "datetime"
                ? `${effectiveLabel() ?? "Time"} time`
                : (effectiveLabel() ?? "Time")
            }
            class={`min-h-[44px] flex-row items-center gap-1 rounded-(--radius) border ${triggerBorderClass()} bg-background px-3 py-2 focus-within:border-primary`}
            segmentClass="rounded px-1 py-0.5 text-sm text-foreground focus:bg-primary focus:text-primary-foreground"
            separatorClass="text-sm text-muted-foreground"
            renderSegment={(seg) => (
              <Text
                testID={`${props.testId}:time:${seg.segment}`}
                class="text-sm"
              >
                {seg.label}
              </Text>
            )}
            onChange={(event) => {
              handleTimeChange(event.value);
            }}
          />
        </If>
      </View>

      <ValidationFeedback
        testId={`${props.testId}:checks`}
        results={checkState().results}
        ref={(el) => feedbackRef.set(el)}
      />
    </View>
  );
}
