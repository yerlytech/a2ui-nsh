/**
 * xlarge catalog `Button` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Shows the translation of `label` with `{name}` placeholders filled from
 * `labelParams`, an optional `icon` (a Basic Catalog icon name; others are not
 * drawn), and draws by `variant`. Pressing sends the A2UI 1.0 event `action`
 * with the literal `context` (or `{}`). With `confirm` it asks first, the way
 * `Confirm` does (`AskPanel`, `askStep`): only yes sends.
 *
 * The point-of-sale properties (`add`, `cash`, `till`, `qty`, `product`,
 * `queue`, `digest`, `away`, `after`, `version`) are not read yet: no captured
 * xlarge screen uses them.
 */

import { Canvas, Path2D, Text, View, computed, signal, token, type JSX } from "nsh";
import { Button } from "nsh/base";
import {
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { BASIC_ICON_PATHS } from "../basic/icon_paths";
import {
  AskPanel,
  BUTTON_CLASS,
  BUTTON_FOREGROUND,
  BUTTON_TEXT_CLASS,
  sendXlargeAction,
} from "./ask";
import type { ResolvedXlargeOptions } from "./context";
import { askStep, buttonVariant, literalContext, messageText } from "./model";

const ICON_SIZE = 18;
const ICON_VIEWBOX = 24;

export function createXlargeButton(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeButton(props: A2uiComponentProps): JSX.Element {
    const actionProp = props.bridge.prop("action");
    const labelProp = props.bridge.prop("label");
    const labelParamsProp = props.bridge.prop("labelParams");
    const iconProp = props.bridge.prop("icon");
    const variantProp = props.bridge.prop("variant");
    const confirmProp = props.bridge.prop("confirm");
    const contextProp = props.bridge.prop("context");

    const action = computed(() => unwrapOptionalString(actionProp()));
    const label = computed(() => {
      const code = unwrapOptionalString(labelProp());
      return code !== undefined ? messageText(code, labelParamsProp(), options.translate) : "";
    });
    const iconPath = computed(() => {
      const name = unwrapOptionalString(iconProp());
      return name !== undefined ? BASIC_ICON_PATHS[name] : undefined;
    });
    const variant = computed(() => buttonVariant(variantProp()));
    const asking = signal(false);
    const sending = signal(false);

    const step = (which: "press" | "yes" | "cancel"): void => {
      const next = askStep(which, confirmProp() === true);
      asking.set(next.asking);
      const name = action();
      if (!next.send || name === undefined || sending()) {
        return;
      }
      sending.set(true);
      void sendXlargeAction(props, name, literalContext(contextProp())).finally(() =>
        sending.set(false),
      );
    };

    return (
      <View testID={`${props.testId}:wrap`} class="gap-2">
        <View class="flex-row">
          <Button
            testID={props.testId}
            accessibilityLabel={label()}
            disabled={action() === undefined || sending() || asking()}
            class={BUTTON_CLASS[variant()]}
            onPress={() => step("press")}
          >
            <If when={iconPath() !== undefined}>
              <Canvas
                testID={`${props.testId}:icon`}
                style={{ width: ICON_SIZE, height: ICON_SIZE }}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
                draw={(cx, size) => {
                  const data = iconPath();
                  if (data === undefined) {
                    return;
                  }
                  const width = size.width > 0 ? size.width : ICON_SIZE;
                  const height = size.height > 0 ? size.height : ICON_SIZE;
                  cx.save();
                  cx.scale(width / ICON_VIEWBOX, height / ICON_VIEWBOX);
                  cx.fillStyle = token(BUTTON_FOREGROUND[variant()]);
                  cx.fill(new Path2D(data), "evenodd");
                  cx.restore();
                }}
              />
            </If>
            <Text class={BUTTON_TEXT_CLASS[variant()]}>{label()}</Text>
          </Button>
        </View>
        <If when={asking()}>
          <AskPanel
            testId={`${props.testId}:ask`}
            question={options.confirmQuestion}
            yesLabel={label()}
            cancelLabel={options.cancelLabel}
            danger={variant() === "danger"}
            busy={sending()}
            onYes={() => step("yes")}
            onCancel={() => step("cancel")}
          />
        </If>
      </View>
    );
  };
}
