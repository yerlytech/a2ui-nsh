/**
 * A2UI Basic Catalog v1 `Button` component on Native Shell (`nsh 0.7.2`).
 *
 * Wraps `nsh/base` `<Button>` with `default` / `primary` / `borderless`
 * variants, `@checks` disabled-on-error semantics (warnings and info stay
 * enabled), dispatch-time `action.event` & `action.functionCall` execution
 * with `userActivation: true`, `ModalTriggerContext` integration for pressable
 * `Modal.trigger`s, implicit child-text label inference, and full `@accessibility`
 * metadata plumbing.
 */

import { View, computed, context, effect, type JSX } from "nsh";
import { Button } from "nsh/base";
import {
  isComponentNode,
  type ComponentNode,
  type NodeAction,
} from "../../core/resolver";
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
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import { ModalTriggerContext } from "./Modal";
import {
  ValidationFeedback,
  extractCheckableState,
} from "./validation_feedback";

/** Semantic foreground token propagated from a `Button` to its child subtree. */
export type ButtonForegroundTone = "primary-foreground" | "secondary-foreground";

/**
 * Context carrying the reactive foreground tone for descendants of a `Button`
 * (such as `BasicText` and `BasicIcon`), so a `primary` button's label uses
 * `primary-foreground` instead of default `foreground` in both light and dark
 * appearance.
 */
export const ButtonForegroundContext = context<
  (() => ButtonForegroundTone | undefined) | undefined
>(undefined);

const VARIANT_CLASSES: Readonly<Record<string, string>> = {
  default:
    "min-h-[44px] flex-row items-center justify-center rounded-(--radius) border border-border bg-secondary px-4 py-2 hover:bg-muted active:opacity-80 disabled:opacity-50 focus-visible:outline-2",
  primary:
    "min-h-[44px] flex-row items-center justify-center rounded-(--radius) bg-primary px-4 py-2 hover:opacity-90 active:opacity-80 disabled:opacity-50 focus-visible:outline-2",
  borderless:
    "min-h-[44px] flex-row items-center justify-center px-2 py-1 hover:opacity-80 active:opacity-60 disabled:opacity-50 focus-visible:outline-2",
};

export function BasicButton(props: A2uiComponentProps): JSX.Element {
  const childProp = props.bridge.prop("child");
  const variantProp = props.bridge.prop<string | undefined>("variant");
  const actionProp = props.bridge.prop<NodeAction | undefined>("action");
  const weightProp = props.bridge.prop<number | undefined>("weight");
  const isValidProp = props.bridge.prop<boolean | undefined>("isValid");
  const validationErrorsProp = props.bridge.prop("validationErrors");
  const validationResultsProp = props.bridge.prop("validationResults");

  const modalTrigger = ModalTriggerContext();

  const childNode = computed<ComponentNode | undefined>(() => {
    const candidate = childProp();
    return isComponentNode(candidate) ? candidate : undefined;
  });

  const inferredLabel = computed<string | undefined>(() => {
    const child = childNode();
    if (!child || child.type !== "Text") {
      return undefined;
    }
    const childText = props.store.nodeBridge(child).prop("text")();
    return unwrapOptionalString(childText);
  });

  const checkState = computed(() =>
    extractCheckableState(
      isValidProp(),
      validationErrorsProp(),
      validationResultsProp(),
    ),
  );
  const isDisabled = computed(() => checkState().isInvalid);

  const variantClass = computed(() => {
    const v = variantProp();
    return (v && VARIANT_CLASSES[v]) || VARIANT_CLASSES["default"]!;
  });

  const foregroundTone = computed<ButtonForegroundTone | undefined>(() => {
    const v = variantProp();
    if (v === "primary") {
      return "primary-foreground";
    }
    if (v === "borderless") {
      return undefined;
    }
    return "secondary-foreground";
  });

  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "button",
    fallbackLabel: inferredLabel(),
  }));
  const effectiveLabel = computed(() =>
    resolveEffectiveLabel(a11y(), inferredLabel()),
  );
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  useLiveRegionAnnouncement(a11y, () => effectiveLabel() ?? "");

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

  const handlePress = (): void => {
    if (isDisabled()) {
      return;
    }
    const action = actionProp();
    if (typeof action === "function") {
      void action({ userActivation: true }).catch(() => undefined);
    }
    modalTrigger?.openModal();
  };

  return (
    // Outer View carries `description`, `hidden`, the live region, and
    // `weight` that `nsh/base` `Button` omits from `ComponentHostProps` (Spec 001 §3 Gap #1).
    <View
      testID={`${props.testId}:container`}
      class="gap-1"
      style={weightStyle(weightProp())}
      accessibilityDescription={a11yProps().accessibilityDescription}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
    >
      <Button
        testID={props.testId}
        disabled={isDisabled()}
        role={a11yProps().role}
        accessibilityLabel={effectiveLabel()}
        onPress={handlePress}
        class={variantClass()}
      >
        <ButtonForegroundContext.Provider value={foregroundTone}>
          <Each
            of={childNode() ? [childNode()!] : []}
            key={(child) => child.id}
          >
            {(child) => props.renderNode(child())}
          </Each>
        </ButtonForegroundContext.Provider>
      </Button>
      <ValidationFeedback
        testId={`${props.testId}:checks`}
        results={checkState().results}
      />
    </View>
  );
}
