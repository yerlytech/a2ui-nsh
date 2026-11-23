/**
 * xlarge catalog `Conversation` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * A record's conversation (xlarge spec 077), as `lab_samples.sample` puts it
 * on a sample: the bound `rows` are what `talk.on` answers, newest first, and
 * are drawn oldest at the top; the bound `around` is what `talk.about`
 * answers (`{ talk, people, unread }`). `kind` is the record's kind
 * (`sample`), `screen` the screen it is shown on, `called` (bound) what that
 * screen calls it (`S-0012`). The record's id is read from `around.talk`
 * (`r_<kind>_<id>`).
 *
 * Each message shows who wrote it (`talk.you` for one's own, `talk.former`
 * for a writer whose account is gone), when, and its words, or
 * `talk.taken_back_line` once taken back. Under it, the emojis a person may
 * put; one's own message can be taken back after a yes. A box to write in,
 * the colleagues to tell (`around.people`), and a send. Everything goes out
 * as an A2UI 1.0 event, with the context xlarge's server reads:
 *
 * - `talk.write` `{ kind, id, screen, label, text, tell }`
 * - `talk.react_on` `{ kind, id, message, emoji }`
 * - `talk.take_back` `{ id }` (the message's)
 * - `talk.seen` `{ id }` (the conversation's), once, when `around.unread`
 *
 * and after a write, a reaction or a take-back went out, the screen is read
 * again about the record: `screen:<screen>` with `{ id }`. Words are xlarge's
 * codes (`talk.*`), translated.
 */

import { Text, View, computed, effect, signal, type JSX } from "nsh";
import { Button, Checkbox, Input } from "nsh/base";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { AskPanel, BUTTON_CLASS, BUTTON_TEXT_CLASS, sendXlargeAction } from "./ask";
import type { ResolvedXlargeOptions } from "./context";
import {
  conversationAround,
  conversationMessages,
  eventPayload,
  fillParams,
  screenAction,
  type ConversationMessage,
} from "./model";

/** The longest message xlarge takes, in characters (`talk::LONGEST`). */
const LONGEST = 2000;

const SMALL_BUTTON =
  "min-h-[32px] flex-row items-center justify-center rounded-(--radius) px-2 py-1 hover:bg-muted active:opacity-80 focus-visible:outline-2";

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function createXlargeConversation(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeConversation(props: A2uiComponentProps): JSX.Element {
    const rowsProp = props.bridge.prop("rows");
    const kindProp = props.bridge.prop("kind");
    const aroundProp = props.bridge.prop("around");
    const calledProp = props.bridge.prop("called");
    const screenProp = props.bridge.prop("screen");

    const messages = computed(() => conversationMessages(unwrapBinding(rowsProp())));
    const around = computed(() => conversationAround(unwrapBinding(aroundProp())));
    const kind = computed(() => unwrapOptionalString(kindProp()) ?? "");
    const screen = computed(() => unwrapOptionalString(screenProp()) ?? "");
    const text = signal("");
    const tell = signal<readonly string[]>([]);
    const telling = signal(false);
    const sending = signal(false);
    const asking = signal("");

    // Seen while unread: read up to now, sent on its own, once per conversation.
    let seenFor = "";
    effect(() => {
      const { talk, unread } = around();
      if (!unread || talk === "" || talk === seenFor) {
        return;
      }
      seenFor = talk;
      void props.store.resolver
        .dispatchNodeAction(props.node, eventPayload("talk.seen", { id: talk }), {
          userActivation: false,
        })
        .catch(() => undefined);
    });

    const ready = (): boolean => kind() !== "" && around().record !== "";
    // Sends one action, then reads the screen again about the record.
    const send = async (name: string, context: Record<string, unknown>): Promise<boolean> => {
      if (sending()) {
        return false;
      }
      sending.set(true);
      try {
        const sent = await sendXlargeAction(props, name, context);
        const again = screenAction(screen());
        if (sent && again !== undefined && around().record !== "") {
          await sendXlargeAction(props, again, { id: around().record });
        }
        return sent;
      } finally {
        sending.set(false);
      }
    };

    const post = (): void => {
      if (!ready() || text().trim() === "") {
        return;
      }
      void send("talk.write", {
        kind: kind(),
        id: around().record,
        screen: screen(),
        label: scalar(unwrapBinding(calledProp())),
        text: text(),
        tell: [...tell()],
      }).then((sent) => {
        if (sent) {
          text.set("");
          tell.set([]);
          telling.set(false);
        }
      });
    };
    const react = (message: ConversationMessage, emoji: string): void => {
      if (ready()) {
        void send("talk.react_on", { kind: kind(), id: around().record, message: message.id, emoji });
      }
    };
    const takeBack = (message: ConversationMessage): void => {
      asking.set("");
      void send("talk.take_back", { id: message.id });
    };
    const toggle = (person: string): void => {
      const chosen = tell();
      tell.set(chosen.includes(person) ? chosen.filter((one) => one !== person) : [...chosen, person]);
    };

    const author = (message: ConversationMessage): string =>
      message.mine
        ? options.translate("talk.you")
        : message.by !== ""
          ? message.by
          : options.translate("talk.former");
    const words = (message: ConversationMessage): string =>
      message.takenBack ? options.translate("talk.taken_back_line") : message.text;

    return (
      <View testID={props.testId} class="gap-3">
        <If
          when={messages().length > 0}
          else={
            <Text testID={`${props.testId}:empty`} class="text-sm text-muted-foreground">
              {options.translate("talk.none")}
            </Text>
          }
        >
          <View testID={`${props.testId}:messages`} role="list" class="gap-3">
            <Each of={messages()} key={(message) => message.key}>
              {(message) => (
                <View
                  testID={`${props.testId}:message:${message().key}`}
                  class={`max-w-[85%] gap-1 ${message().mine ? "self-end items-end" : "self-start items-start"}`}
                  accessibilityLabel={`${author(message())}, ${message().at}, ${words(message())}`}
                >
                  <Text class="text-xs text-muted-foreground">{`${author(message())} · ${message().at}`}</Text>
                  <Text
                    class={`rounded-(--radius) px-3 py-2 text-sm ${
                      message().takenBack
                        ? "border border-dashed border-border italic text-muted-foreground"
                        : message().mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                    }`}
                  >
                    {words(message())}
                  </Text>
                  <If when={!message().takenBack}>
                    <View class="flex-row flex-wrap gap-1">
                      <Each of={message().reactions} key={(reaction) => reaction.emoji}>
                        {(reaction) => (
                          <Button
                            testID={`${props.testId}:message:${message().key}:react:${reaction().emoji}`}
                            accessibilityLabel={fillParams(options.translate("talk.react"), {
                              emoji: reaction().emoji,
                              count: String(reaction().count),
                            })}
                            selected={reaction().mine}
                            disabled={sending()}
                            class={`${SMALL_BUTTON} border ${reaction().mine ? "border-primary bg-secondary" : "border-border"}`}
                            onPress={() => react(message(), reaction().emoji)}
                          >
                            <Text class="text-xs text-foreground">
                              {reaction().count > 0 ? `${reaction().emoji} ${reaction().count}` : reaction().emoji}
                            </Text>
                          </Button>
                        )}
                      </Each>
                    </View>
                  </If>
                  <If when={message().mine && !message().takenBack}>
                    <If
                      when={asking() === message().id}
                      else={
                        <Button
                          testID={`${props.testId}:message:${message().key}:take_back`}
                          accessibilityLabel={options.translate("talk.take_back")}
                          disabled={sending()}
                          class={SMALL_BUTTON}
                          onPress={() => asking.set(message().id)}
                        >
                          <Text class="text-xs text-muted-foreground">{options.translate("talk.take_back")}</Text>
                        </Button>
                      }
                    >
                      <AskPanel
                        testId={`${props.testId}:message:${message().key}:ask`}
                        question={`${options.confirmQuestion} — ${options.translate("talk.take_back")}`}
                        yesLabel={options.confirmLabel}
                        cancelLabel={options.cancelLabel}
                        danger
                        busy={sending()}
                        onYes={() => takeBack(message())}
                        onCancel={() => asking.set("")}
                      />
                    </If>
                  </If>
                </View>
              )}
            </Each>
          </View>
        </If>

        <View testID={`${props.testId}:compose`} class="gap-2">
          <Input
            testID={`${props.testId}:text`}
            multiline
            maxLength={LONGEST}
            value={text()}
            placeholder={options.translate("talk.write_here")}
            accessibilityLabel={options.translate("talk.write_here")}
            class="min-h-20 rounded-(--radius) border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus-visible:outline-2"
            onChange={(event) => text.set(event.value)}
          />
          <View class="flex-row flex-wrap items-center gap-2">
            <If when={around().people.length > 0}>
              <Button
                testID={`${props.testId}:tell`}
                accessibilityLabel={options.translate("talk.tell")}
                class={BUTTON_CLASS.secondary}
                onPress={() => telling.set(!telling())}
              >
                <Text class={BUTTON_TEXT_CLASS.secondary}>
                  {tell().length > 0 ? `${options.translate("talk.tell")} (${tell().length})` : options.translate("talk.tell")}
                </Text>
              </Button>
            </If>
            <View class="flex-1" />
            <Button
              testID={`${props.testId}:send`}
              accessibilityLabel={options.translate("talk.send")}
              disabled={sending() || !ready() || text().trim() === ""}
              class={BUTTON_CLASS.primary}
              onPress={post}
            >
              <Text class={BUTTON_TEXT_CLASS.primary}>{options.translate("talk.send")}</Text>
            </Button>
          </View>
          <If when={telling()}>
            <View
              testID={`${props.testId}:people`}
              role="group"
              accessibilityLabel={options.translate("talk.tell_hint")}
              class="gap-1 rounded-(--radius) border border-border p-3"
            >
              <Text class="text-xs text-muted-foreground">{options.translate("talk.tell_hint")}</Text>
              <Each of={around().people} key={(person) => person.id}>
                {(person) => (
                  <Checkbox
                    testID={`${props.testId}:person:${person().id}`}
                    checked={tell().includes(person().id)}
                    accessibilityLabel={person().name}
                    class="min-h-[36px] flex-row items-center gap-2 focus-visible:outline-2"
                    indicatorClass="h-5 w-5 items-center justify-center rounded border border-input bg-background checked:border-primary checked:bg-primary"
                    onChange={() => toggle(person().id)}
                  >
                    <Text class="text-sm text-foreground">{person().name}</Text>
                  </Checkbox>
                )}
              </Each>
            </View>
          </If>
        </View>
      </View>
    );
  };
}
