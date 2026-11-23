/**
 * The ask `Button` (with `confirm`), `Confirm`, and `Preview` (with `confirm`)
 * share: a question with a yes and a cancel button. Only yes sends; the step
 * logic is `askStep` in `model.ts`. Also the one way these send an xlarge
 * action: an A2UI 1.0 `{ event: { name, context } }` through the node's
 * dispatcher, context literals escaped by `eventPayload`.
 */

import { Text, View, type JSX } from "nsh";
import { Button } from "nsh/base";
import type { A2uiComponentProps } from "../../renderer/A2uiSurface";
import { eventPayload, type ButtonVariant } from "./model";

export const BUTTON_CLASS: Readonly<Record<ButtonVariant, string>> = {
  primary:
    "min-h-[44px] flex-row items-center justify-center gap-2 rounded-(--radius) bg-primary px-4 py-2 hover:opacity-90 active:opacity-80 disabled:opacity-50 focus-visible:outline-2",
  secondary:
    "min-h-[44px] flex-row items-center justify-center gap-2 rounded-(--radius) border border-border bg-secondary px-4 py-2 hover:bg-muted active:opacity-80 disabled:opacity-50 focus-visible:outline-2",
  // The theme has no `destructive-foreground`, so danger is a destructive outline.
  danger:
    "min-h-[44px] flex-row items-center justify-center gap-2 rounded-(--radius) border border-destructive bg-card px-4 py-2 hover:bg-muted active:opacity-80 disabled:opacity-50 focus-visible:outline-2",
};

export const BUTTON_TEXT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  primary: "text-sm font-medium text-primary-foreground",
  secondary: "text-sm text-secondary-foreground",
  danger: "text-sm font-medium text-destructive",
};

/** The token an icon on a button of `variant` is filled with. */
export const BUTTON_FOREGROUND: Readonly<
  Record<ButtonVariant, "primary-foreground" | "secondary-foreground" | "destructive">
> = {
  primary: "primary-foreground",
  secondary: "secondary-foreground",
  danger: "destructive",
};

/**
 * Sends the xlarge action `name` with the literal `context` from the node
 * `props` draws. Resolves to true when the action went out as an event.
 */
export async function sendXlargeAction(
  props: A2uiComponentProps,
  name: string,
  context: Readonly<Record<string, unknown>>,
): Promise<boolean> {
  try {
    const result = await props.store.resolver.dispatchNodeAction(
      props.node,
      eventPayload(name, context),
      { userActivation: true },
    );
    return result.kind === "event";
  } catch {
    return false;
  }
}

export interface AskPanelProps {
  /** Test ID prefix; the panel is `<testId>`, its buttons `:yes` and `:cancel`. */
  readonly testId: string;
  readonly question: string;
  readonly yesLabel: string;
  readonly cancelLabel: string;
  /** Draws yes as a danger button. */
  readonly danger?: boolean;
  readonly busy?: boolean;
  readonly onYes: () => void;
  readonly onCancel: () => void;
}

/** A question with a yes and a cancel button, announced as an alert dialog. */
export function AskPanel(props: AskPanelProps): JSX.Element {
  const yes: ButtonVariant = props.danger === true ? "danger" : "primary";
  return (
    <View
      testID={props.testId}
      role="alertdialog"
      accessibilityLabel={props.question}
      class="gap-3 rounded-(--radius) border border-border bg-card p-4"
    >
      <Text testID={`${props.testId}:question`} class="text-sm font-medium text-foreground">
        {props.question}
      </Text>
      <View class="flex-row flex-wrap gap-2">
        <Button
          testID={`${props.testId}:yes`}
          accessibilityLabel={props.yesLabel}
          disabled={props.busy === true}
          class={BUTTON_CLASS[yes]}
          onPress={props.onYes}
        >
          <Text class={BUTTON_TEXT_CLASS[yes]}>{props.yesLabel}</Text>
        </Button>
        <Button
          testID={`${props.testId}:cancel`}
          accessibilityLabel={props.cancelLabel}
          disabled={props.busy === true}
          class={BUTTON_CLASS.secondary}
          onPress={props.onCancel}
        >
          <Text class={BUTTON_TEXT_CLASS.secondary}>{props.cancelLabel}</Text>
        </Button>
      </View>
    </View>
  );
}
