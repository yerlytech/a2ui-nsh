/**
 * A2UI Basic Catalog v1 `Modal` overlay component on Native Shell (`nsh 0.7.2`).
 *
 * Mounts only its `trigger` initially; activating the trigger opens an `nsh/base`
 * `<Dialog>` containing `content` with a backdrop, Escape dismissal, an accessible
 * Close button, keyboard focus containment, and focus return on close.
 *
 * Measured on `nsh 0.7.2` (2026-11-27): presses reach only the innermost
 * pressable view (headless, a press on a `<View onPress>` or `nsh/base`
 * `<Button>` inside a `<View onPress>` leaves the outer handler at 0 calls;
 * `measured/press_innermost.test.tsx`), so `Modal` provides
 * `ModalTriggerContext` so pressable triggers
 * (such as Basic `Button` in T11 or custom catalog triggers) can open the enclosing
 * modal alongside their own `action`, while non-pressable triggers (`Text`, `Card`,
 * `Row`) activate via the trigger wrapper's `onPress` and keyboard focus stop.
 */

import {
  Canvas,
  Path2D,
  View,
  computed,
  context,
  effect,
  signal,
  token,
  type JSX,
  type ViewRef,
} from "nsh";
import { Button, Dialog } from "nsh/base";
import { isComponentNode, type ComponentNode } from "../../core/resolver";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import { BASIC_ICON_PATHS } from "./icon_paths";

/** Controller exposed via `ModalTriggerContext` to pressable descendants of a `Modal.trigger`. */
export interface ModalTriggerController {
  /** Opens the enclosing `Modal` unless its trigger's `@checks` currently fail. */
  readonly openModal: () => void;
  /** Whether the enclosing `Modal` is currently open. */
  readonly isOpen: () => boolean;
}

/**
 * Context provided to a `Modal`'s `trigger` subtree (and cleared inside `content`)
 * so pressable triggers can open their enclosing modal; measured on `nsh 0.7.2`
 * (2026-11-27), presses do not bubble past the innermost pressable view.
 */
export const ModalTriggerContext = context<ModalTriggerController | undefined>(
  undefined,
);

const CLOSE_ICON_VIEWBOX = 24;
const CLOSE_ICON_SIZE = 16;
let cachedClosePath: Path2D | undefined;

function getCloseIconPath(): Path2D {
  if (!cachedClosePath) {
    cachedClosePath = new Path2D(BASIC_ICON_PATHS["close"]!);
  }
  return cachedClosePath;
}

export function BasicModal(props: A2uiComponentProps): JSX.Element {
  const triggerProp = props.bridge.prop("trigger");
  const contentProp = props.bridge.prop("content");
  const weightProp = props.bridge.prop<number | undefined>("weight");

  const triggerNode = computed<ComponentNode | undefined>(() => {
    const candidate = triggerProp();
    return isComponentNode(candidate) ? candidate : undefined;
  });
  const contentNode = computed<ComponentNode | undefined>(() => {
    const candidate = contentProp();
    return isComponentNode(candidate) ? candidate : undefined;
  });

  const isOpen = signal(false);
  let triggerRef: ViewRef | undefined;

  const isTriggerValid = (): boolean => {
    const trig = triggerNode();
    return trig === undefined || trig.props["isValid"] !== false;
  };

  const restoreTriggerFocus = (): void => {
    triggerRef?.focus();
  };

  const openModal = (): void => {
    if (!isTriggerValid()) {
      return;
    }
    isOpen.set(true);
  };

  const closeModal = (): void => {
    if (!isOpen()) {
      return;
    }
    isOpen.set(false);
    restoreTriggerFocus();
  };

  const triggerController: ModalTriggerController = {
    openModal,
    isOpen,
  };

  const triggerHasOwnFocusStop = computed(
    () => triggerNode()?.type === "Button",
  );

  const a11y = computed(() => normalizeAccessibility(props.bridge.accessibility()));
  const dialogRole = computed<"dialog" | "alertdialog">(() =>
    a11y().live === "assertive" ? "alertdialog" : "dialog",
  );
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "dialog",
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
    <View
      testID={props.testId}
      style={weightStyle(weightProp())}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
    >
      <ModalTriggerContext.Provider value={triggerController}>
        <View
          ref={(el) => {
            triggerRef = el;
          }}
          testID={`${props.testId}:trigger`}
          onPress={openModal}
          focusable={triggerHasOwnFocusStop() ? false : undefined}
          accessibilityState={{ expanded: isOpen(), hasPopup: true }}
        >
          <Each
            of={triggerNode() ? [triggerNode()!] : []}
            key={(child) => child.id}
          >
            {(child) => props.renderNode(child())}
          </Each>
        </View>
      </ModalTriggerContext.Provider>

      <Dialog
        testID={`${props.testId}:dialog`}
        open={isOpen()}
        animation="fade"
        closeOnEscape={true}
        closeOnBackdropPress={true}
        backdropClass="bg-black/40"
        backdropTestID={`${props.testId}:backdrop`}
        role={dialogRole()}
        accessibilityLabel={a11y().label}
        accessibilityDescription={a11y().description}
        onOpenChange={(e) => {
          isOpen.set(e.open);
          if (!e.open) {
            restoreTriggerFocus();
          }
        }}
        class="m-auto w-full max-w-md gap-3 rounded-(--radius) border border-border bg-card p-5"
      >
        <ModalTriggerContext.Provider value={undefined}>
          <View class="flex-row justify-end">
            <Button
              testID={`${props.testId}:close`}
              accessibilityLabel="Close"
              onPress={closeModal}
              class="h-11 w-11 items-center justify-center rounded-(--radius) hover:bg-muted active:opacity-70 focus-visible:outline-2"
            >
              <Canvas
                style={{ width: CLOSE_ICON_SIZE, height: CLOSE_ICON_SIZE }}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
                draw={(cx, size) => {
                  const path = getCloseIconPath();
                  const w = size.width > 0 ? size.width : CLOSE_ICON_SIZE;
                  const h = size.height > 0 ? size.height : CLOSE_ICON_SIZE;
                  cx.save();
                  cx.scale(w / CLOSE_ICON_VIEWBOX, h / CLOSE_ICON_VIEWBOX);
                  cx.fillStyle = token("foreground");
                  cx.fill(path, "evenodd");
                  cx.restore();
                }}
              />
            </Button>
          </View>
          <View testID={`${props.testId}:content`}>
            <Each
              of={isOpen() && contentNode() ? [contentNode()!] : []}
              key={(child) => child.id}
            >
              {(child) => props.renderNode(child())}
            </Each>
          </View>
        </ModalTriggerContext.Provider>
      </Dialog>
    </View>
  );
}
