/**
 * A2UI Basic Catalog v1 `CheckBox` component on Native Shell (`nsh 0.7.1`).
 *
 * Uses `nsh/base` `<Checkbox>` with a native `Path2D` checkmark indicator,
 * batched two-way boolean `@path` binding, `@checks` error/warning/info
 * presentation, 44 px minimum touch target, and full `@accessibility` plumbing.
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
import { Checkbox } from "nsh/base";
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

const CHECK_VIEWBOX = 24;
const CHECK_SIZE = 14;
let cachedCheckPath: Path2D | undefined;

function getCheckPath(): Path2D {
  if (!cachedCheckPath) {
    cachedCheckPath = new Path2D(BASIC_ICON_PATHS["check"]!);
  }
  return cachedCheckPath;
}

export function BasicCheckBox(props: A2uiComponentProps): JSX.Element {
  const labelProp = props.bridge.prop("label");
  const valueProp = props.bridge.prop("value");
  const weightProp = props.bridge.prop<number | undefined>("weight");
  const isValidProp = props.bridge.prop<boolean | undefined>("isValid");
  const validationErrorsProp = props.bridge.prop("validationErrors");
  const validationResultsProp = props.bridge.prop("validationResults");

  const feedbackRef = signal<ViewRef | null>(null);

  const labelText = computed(() => unwrapString(labelProp()));
  const isChecked = computed(() => unwrapBoolean(valueProp()) === true);

  const checkState = computed(() =>
    extractCheckableState(
      isValidProp(),
      validationErrorsProp(),
      validationResultsProp(),
    ),
  );

  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "checkbox",
    checked: isChecked(),
    fallbackLabel: labelText().length > 0 ? labelText() : undefined,
  }));
  const effectiveLabel = computed(() =>
    resolveEffectiveLabel(a11y(), a11yOptions().fallbackLabel),
  );
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  useLiveRegionAnnouncement(a11y, () =>
    `${labelText()} ${isChecked() ? "checked" : "unchecked"}`,
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

  const indicatorClass = computed(() => {
    const borderClass = checkState().isInvalid
      ? "border-destructive"
      : "border-input";
    return `h-5 w-5 items-center justify-center rounded border ${borderClass} bg-background checked:border-primary checked:bg-primary`;
  });

  return (
    // Outer View carries `description`, `hidden`, `invalid`, `describedBy`, and
    // `android` live region omitted from `nsh/base` `ComponentHostProps` (Spec 001 §3 Gap #1).
    <View
      testID={`${props.testId}:container`}
      class="gap-1"
      style={weightStyle(weightProp())}
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
      <Checkbox
        testID={props.testId}
        checked={isChecked()}
        role={a11yProps().role}
        accessibilityLabel={effectiveLabel()}
        class="group min-h-[44px] flex-row items-center gap-2.5 py-2 focus-visible:outline-2"
        indicatorClass={indicatorClass()}
        indicator={
          <If when={isChecked()}>
            <Canvas
              style={{ width: CHECK_SIZE, height: CHECK_SIZE }}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
              draw={(cx, size) => {
                const path = getCheckPath();
                const w = size.width > 0 ? size.width : CHECK_SIZE;
                const h = size.height > 0 ? size.height : CHECK_SIZE;
                cx.save();
                cx.scale(w / CHECK_VIEWBOX, h / CHECK_VIEWBOX);
                cx.fillStyle = token("primary-foreground");
                cx.fill(path, "evenodd");
                cx.restore();
              }}
            />
          </If>
        }
        onChange={(event) => {
          writeBinding(valueProp(), event.checked);
        }}
      >
        <Text
          class={
            checkState().isInvalid
              ? "text-sm text-destructive"
              : "text-sm text-foreground"
          }
        >
          {labelText()}
        </Text>
      </Checkbox>
      <ValidationFeedback
        testId={`${props.testId}:checks`}
        results={checkState().results}
        ref={(el) => feedbackRef.set(el)}
      />
    </View>
  );
}
