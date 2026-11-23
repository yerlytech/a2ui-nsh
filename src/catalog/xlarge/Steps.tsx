/**
 * xlarge catalog `Steps` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * What an agent did for a request (xlarge spec 033), drawn from the answer
 * the action above it got back, never from the data model: the host's
 * `answer()` record, its list under `answer` (default `"steps"`), plus the
 * model's last words (`words`) and why it stopped (`stopped`, a code). Each
 * step `{ action, input, outcome, code?, opens? }` shows its name
 * (`stepName`) and how it ended: done, refused (its `code`), or waiting, with
 * a take button that asks first and then sends the A2UI 1.0 event
 * `{ name: action, context: input }`. `opens` is a button that sends
 * `{ name: opens.screen, context: opensContext(opens.about) }`. Without an
 * answer holding that list it draws nothing.
 */

import { Text, View, computed, signal, type JSX } from "nsh";
import { Button } from "nsh/base";
import { unwrapOptionalString, type A2uiComponentProps } from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { AskPanel, BUTTON_CLASS, BUTTON_TEXT_CLASS, sendXlargeAction } from "./ask";
import type { ResolvedXlargeOptions } from "./context";
import { opensContext, stepName, stepsAnswer, type AgentStep } from "./model";

const BADGE = "rounded-(--radius) border px-2 py-0.5 text-xs font-medium";
const BADGE_CLASS = {
  success: `${BADGE} border-primary text-primary`,
  danger: `${BADGE} border-destructive text-destructive`,
  warning: `${BADGE} border-border text-muted-foreground`,
} as const;

export function createXlargeSteps(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeSteps(props: A2uiComponentProps): JSX.Element {
    const answerProp = props.bridge.prop("answer");
    const t = options.translate;

    const raw = computed(() => options.answer?.() ?? null);
    const answered = computed(() => stepsAnswer(raw(), unwrapOptionalString(answerProp())));
    const steps = computed(() =>
      (answered()?.steps ?? []).map((step, index) => ({ ...step, index, name: stepName(step.action, t) })),
    );
    // Which waiting steps were taken, for the answer on display only: a new
    // answer starts with none taken.
    const taken = signal<{ readonly of: unknown; readonly at: ReadonlySet<number> }>({
      of: null,
      at: new Set(),
    });
    const isTaken = (index: number): boolean => taken().of === raw() && taken().at.has(index);
    const asking = signal<number | null>(null);
    const sending = signal(false);

    const take = async (index: number, step: AgentStep): Promise<void> => {
      asking.set(null);
      if (sending()) {
        return;
      }
      sending.set(true);
      const of = raw();
      try {
        if (await sendXlargeAction(props, step.action, step.input)) {
          const before = taken().of === of ? taken().at : new Set<number>();
          taken.set({ of, at: new Set(before).add(index) });
        }
      } finally {
        sending.set(false);
      }
    };

    return (
      <If when={answered() !== undefined}>
        <View testID={props.testId} class="gap-3">
          <If when={answered()?.words !== undefined}>
            <Text testID={`${props.testId}:words`} class="text-sm text-foreground">
              {answered()?.words ?? ""}
            </Text>
          </If>
          <If when={answered()?.stopped !== undefined}>
            <Text testID={`${props.testId}:stopped`} role="alert" class="text-sm text-destructive">
              {t(answered()?.stopped ?? "")}
            </Text>
          </If>
          <If
            when={steps().length > 0}
            else={
              <Text testID={`${props.testId}:none`} class="text-sm text-muted-foreground">
                {t("agents.step.none")}
              </Text>
            }
          >
            <View role="list" accessibilityLabel={t("agents.steps")} class="gap-2">
              <Each of={steps()} key="index">
                {(step) => (
                  <View
                    testID={`${props.testId}:step:${step().index}`}
                    class="gap-2 rounded-(--radius) border border-border px-3 py-2"
                  >
                    <View class="flex-row flex-wrap items-center gap-2">
                      <Text class="min-w-0 flex-1 text-sm text-foreground">{step().name}</Text>
                      <If when={step().outcome === "done"}>
                        <Text testID={`${props.testId}:step:${step().index}:outcome`} class={BADGE_CLASS.success}>
                          {t("agents.outcome.done")}
                        </Text>
                      </If>
                      <If when={step().outcome === "refused"}>
                        <Text testID={`${props.testId}:step:${step().index}:outcome`} class={BADGE_CLASS.danger}>
                          {t(step().code ?? "agents.outcome.refused")}
                        </Text>
                      </If>
                      <If when={step().outcome === "waiting" && isTaken(step().index)}>
                        <Text testID={`${props.testId}:step:${step().index}:outcome`} class={BADGE_CLASS.success}>
                          {t("agents.outcome.taken")}
                        </Text>
                      </If>
                      <If when={step().outcome === "waiting" && !isTaken(step().index)}>
                        <Text testID={`${props.testId}:step:${step().index}:outcome`} class={BADGE_CLASS.warning}>
                          {t("agents.outcome.waiting")}
                        </Text>
                        <Button
                          testID={`${props.testId}:step:${step().index}:take`}
                          accessibilityLabel={`${t("agents.action.take")}: ${step().name}`}
                          disabled={sending() || asking() !== null}
                          class={BUTTON_CLASS.secondary}
                          onPress={() => asking.set(step().index)}
                        >
                          <Text class={BUTTON_TEXT_CLASS.secondary}>{t("agents.action.take")}</Text>
                        </Button>
                      </If>
                      <If when={step().opens !== undefined}>
                        <Button
                          testID={`${props.testId}:step:${step().index}:open`}
                          accessibilityLabel={`${t("agents.action.open")}: ${step().name}`}
                          class={BUTTON_CLASS.secondary}
                          onPress={() => {
                            const opens = step().opens;
                            if (opens !== undefined) {
                              void sendXlargeAction(props, opens.screen, opensContext(opens.about));
                            }
                          }}
                        >
                          <Text class={BUTTON_TEXT_CLASS.secondary}>{t("agents.action.open")}</Text>
                        </Button>
                      </If>
                    </View>
                    <If when={asking() === step().index}>
                      <AskPanel
                        testId={`${props.testId}:step:${step().index}:ask`}
                        question={`${t("action.confirm")} — ${step().name}`}
                        yesLabel={t("action.yes_go_ahead")}
                        cancelLabel={options.cancelLabel}
                        danger={true}
                        busy={sending()}
                        onYes={() => {
                          void take(step().index, step());
                        }}
                        onCancel={() => asking.set(null)}
                      />
                    </If>
                  </View>
                )}
              </Each>
            </View>
          </If>
        </View>
      </If>
    );
  };
}
