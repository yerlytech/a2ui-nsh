/**
 * xlarge catalog `Steps` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * A progress list of named steps. `answer` names the data-model key the steps
 * sit under (`/<answer>`, as a `record` field's `from`); `stepsList` reads
 * them: a list of steps or `{ steps, current }`, each a name (a code) or an
 * object with its own state. Each step shows its translated name and is
 * marked done, current or to do; the words for the marks are the host's
 * (`stepStateLabels`). It sends nothing.
 */

import { Text, View, computed, type JSX } from "nsh";
import type { A2uiComponentProps } from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import { recordRowsPath, stepsList, type StepState } from "./model";

const MARK: Readonly<Record<StepState, string>> = {
  done: "✓",
  current: "●",
  todo: "○",
};

const MARK_CLASS: Readonly<Record<StepState, string>> = {
  done: "text-sm text-primary",
  current: "text-sm font-semibold text-foreground",
  todo: "text-sm text-muted-foreground",
};

const LABEL_CLASS: Readonly<Record<StepState, string>> = {
  done: "text-sm text-foreground",
  current: "text-sm font-semibold text-foreground",
  todo: "text-sm text-muted-foreground",
};

export function createXlargeSteps(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeSteps(props: A2uiComponentProps): JSX.Element {
    const answerProp = props.bridge.prop("answer");
    const path = computed(() => recordRowsPath(answerProp()));
    const steps = computed(() => {
      const at = path();
      const answer = at !== undefined ? props.store.dataSignal(at)() : undefined;
      return stepsList(answer, options.translate).map((step, index) => ({ ...step, index }));
    });

    return (
      <View testID={props.testId} role="group" class="gap-1">
        <Each of={steps()} key="index">
          {(step) => (
            <View
              testID={`${props.testId}:step:${step().index}`}
              accessibilityLabel={`${step().label}, ${options.stepStateLabels[step().state]}`}
              accessibilityState={step().state === "current" ? { selected: true } : undefined}
              class="min-h-[28px] flex-row items-center gap-2"
            >
              <Text testID={`${props.testId}:step:${step().index}:mark`} class={MARK_CLASS[step().state]}>
                {MARK[step().state]}
              </Text>
              <Text class={LABEL_CLASS[step().state]}>{step().label}</Text>
            </View>
          )}
        </Each>
      </View>
    );
  };
}
