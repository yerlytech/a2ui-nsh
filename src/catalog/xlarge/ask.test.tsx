/**
 * Unit tests for the xlarge ask helpers: `sendXlargeAction`, `AskPanel` and the
 * button class tables. The file is also the app the panel tests open, because
 * `nsh test` opens an app entry: its top level declares tests in the runner and
 * mounts the panel in the app engine.
 */

import { Text, View, host, mount, type JSX } from "nsh";
import { Button } from "nsh/base";
import type { A2uiComponentProps } from "../../renderer/A2uiSurface";
import {
  AskPanel,
  BUTTON_CLASS,
  BUTTON_FOREGROUND,
  BUTTON_TEXT_CLASS,
  sendXlargeAction,
} from "./ask";
import type { ButtonVariant } from "./model";

const TEST_PAGE = "./ask.test.tsx";

let suite: typeof import("nsh/test") | null = null;
try {
  const testSpecifier = ["nsh", "test"].join("/");
  suite = await import(testSpecifier);
} catch {
  suite = null;
}

if (suite !== null) {
  const { describe, expect, open, test } = suite;

  type Opened = Awaited<ReturnType<typeof open>>;

  interface DispatchCall {
    readonly node: unknown;
    readonly payload: unknown;
    readonly options: unknown;
  }

  function fakeProps(result: unknown): {
    readonly props: A2uiComponentProps;
    readonly calls: DispatchCall[];
  } {
    const calls: DispatchCall[] = [];
    const node = { id: "node-1" };
    const props = {
      node,
      store: {
        resolver: {
          dispatchNodeAction: async (
            calledNode: unknown,
            payload: unknown,
            options: unknown,
          ): Promise<unknown> => {
            calls.push({ node: calledNode, payload, options });
            return result;
          },
        },
      },
    } as unknown as A2uiComponentProps;
    return { props, calls };
  }

  function openPanel(params: Record<string, unknown>): Promise<Opened> {
    return open(TEST_PAGE, {
      host: {
        params,
        handlers: { "a2ui.yes": null, "a2ui.cancel": null },
      },
    });
  }

  function pressed(app: Opened): string[] {
    return app.host
      .posts()
      .map((post) => post.name)
      .filter((name) => name === "a2ui.yes" || name === "a2ui.cancel");
  }

  describe("sendXlargeAction", () => {
    test("dispatches the event payload on the node with user activation and resolves true", async () => {
      const { props, calls } = fakeProps({ kind: "event", envelope: {} });
      const sent = await sendXlargeAction(props, "crm.delete", { id: "d1" });
      expect(sent).toBe(true);
      expect(calls).toEqual([
        {
          node: { id: "node-1" },
          payload: { event: { name: "crm.delete", context: { id: "d1" } } },
          options: { userActivation: true },
        },
      ]);
    });

    test("resolves false for every result kind but event", async () => {
      for (const result of [
        { kind: "functionCall", value: 1 },
        { kind: "cancelled" },
        { kind: "failed" },
      ]) {
        const { props } = fakeProps(result);
        expect(await sendXlargeAction(props, "crm.delete", {})).toBe(false);
      }
    });

    test("resolves false without throwing when the dispatcher rejects", async () => {
      const props = {
        node: { id: "node-1" },
        store: {
          resolver: {
            dispatchNodeAction: async (): Promise<never> => {
              throw new Error("refused");
            },
          },
        },
      } as unknown as A2uiComponentProps;
      await expect(sendXlargeAction(props, "crm.delete", {})).resolves.toBe(false);
    });

    test("escapes context literals that look like bindings or paths", async () => {
      const context = {
        id: "d1",
        "@path": "/deals",
        nested: { "@action": "go", list: [{ "@path": "/x" }] },
        literal: "$.name",
      };
      const { props, calls } = fakeProps({ kind: "event", envelope: {} });
      await sendXlargeAction(props, "crm.delete", context);
      expect(calls[0]!.payload).toEqual({
        event: {
          name: "crm.delete",
          context: {
            id: "d1",
            "@@path": "/deals",
            nested: { "@@action": "go", list: [{ "@@path": "/x" }] },
            literal: "$.name",
          },
        },
      });
    });
  });

  describe("AskPanel", () => {
    test("renders the question, yes and cancel under its test id, as an alert dialog", async () => {
      const app = await openPanel({
        testId: "ask",
        question: "Delete this deal?",
        yesLabel: "Delete",
        cancelLabel: "Keep",
      });
      expect(app.shows("id:ask")).toBe(true);
      expect(app.shows("id:ask:question")).toBe(true);
      expect(app.shows("id:ask:yes")).toBe(true);
      expect(app.shows("id:ask:cancel")).toBe(true);
      expect(app.shows("role:alertdialog")).toBe(true);
      expect(app.shows("label:Delete this deal?")).toBe(true);
      expect(app.texts()).toContain("Delete this deal?");
      expect(app.texts()).toContain("Delete");
      expect(app.texts()).toContain("Keep");
    });

    test("yes calls onYes only and cancel calls onCancel only", async () => {
      const params = {
        testId: "ask",
        question: "Delete this deal?",
        yesLabel: "Delete",
        cancelLabel: "Keep",
      };
      const yesApp = await openPanel(params);
      await yesApp.press("id:ask:yes");
      expect(pressed(yesApp)).toEqual(["a2ui.yes"]);

      const cancelApp = await openPanel(params);
      await cancelApp.press("id:ask:cancel");
      expect(pressed(cancelApp)).toEqual(["a2ui.cancel"]);
    });

    test("busy disables both buttons and a press calls nothing", async () => {
      const app = await openPanel({
        testId: "ask",
        question: "Delete this deal?",
        yesLabel: "Delete",
        cancelLabel: "Keep",
        busy: true,
      });
      expect(app.enabled("id:ask:yes")).toBe(false);
      expect(app.enabled("id:ask:cancel")).toBe(false);
      await expect(app.press("id:ask:yes")).rejects.toMatchObject({
        code: "ERR_NSH_TEST_DISABLED",
      });
      await expect(app.press("id:ask:cancel")).rejects.toMatchObject({
        code: "ERR_NSH_TEST_DISABLED",
      });
      expect(pressed(app)).toEqual([]);
    });

    test("danger draws yes as danger and otherwise primary, while cancel stays secondary", async () => {
      const danger = await openPanel({
        testId: "ask",
        question: "Delete this deal?",
        yesLabel: "Delete",
        cancelLabel: "Keep",
        danger: true,
      });
      expect(danger.viewStyle("id:ask:yes")).toEqual(danger.viewStyle("id:ref-danger"));
      expect(danger.spanStyle("id:ask:yes >> text:Delete")).toEqual(danger.spanStyle("id:ref-danger >> text:Danger reference"));
      expect(danger.viewStyle("id:ask:yes")).not.toEqual(danger.viewStyle("id:ref-primary"));
      expect(danger.viewStyle("id:ask:cancel")).toEqual(danger.viewStyle("id:ref-secondary"));
      expect(danger.spanStyle("id:ask:cancel >> text:Keep")).toEqual(danger.spanStyle("id:ref-secondary >> text:Secondary reference"));

      const plain = await openPanel({
        testId: "ask",
        question: "Delete this deal?",
        yesLabel: "Delete",
        cancelLabel: "Keep",
      });
      expect(plain.viewStyle("id:ask:yes")).toEqual(plain.viewStyle("id:ref-primary"));
      expect(plain.spanStyle("id:ask:yes >> text:Delete")).toEqual(plain.spanStyle("id:ref-primary >> text:Primary reference"));
      expect(plain.viewStyle("id:ask:cancel")).toEqual(plain.viewStyle("id:ref-secondary"));
      expect(plain.spanStyle("id:ask:cancel >> text:Keep")).toEqual(plain.spanStyle("id:ref-secondary >> text:Secondary reference"));
    });
  });

  describe("button class tables", () => {
    const variants: ButtonVariant[] = ["primary", "secondary", "danger"];

    test("every button variant has a class, a text class and a foreground", () => {
      for (const variant of variants) {
        expect(typeof BUTTON_CLASS[variant]).toBe("string");
        expect(BUTTON_CLASS[variant].length).toBeGreaterThan(0);
        expect(typeof BUTTON_TEXT_CLASS[variant]).toBe("string");
        expect(BUTTON_TEXT_CLASS[variant].length).toBeGreaterThan(0);
        expect(["primary-foreground", "secondary-foreground", "destructive"]).toContain(
          BUTTON_FOREGROUND[variant],
        );
      }
    });

    test("every button class keeps the 44px touch target", () => {
      for (const variant of variants) {
        expect(BUTTON_CLASS[variant]).toContain("min-h-[44px]");
      }
    });
  });
} else {

  function params(): Record<string, unknown> {
    const value = host.params;
    return value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  }

  function word(values: Record<string, unknown>, key: string, fallback: string): string {
    const value = values[key];
    return typeof value === "string" ? value : fallback;
  }

  function AskHarness(): JSX.Element {
    const values = params();
    const post = (name: string): void => {
      try {
        host.post(name, {});
      } catch {
        // The test host may not list the channel.
      }
    };
    return (
      <View class="gap-4 p-4">
        <AskPanel
          testId={word(values, "testId", "ask")}
          question={word(values, "question", "Question?")}
          yesLabel={word(values, "yesLabel", "Yes")}
          cancelLabel={word(values, "cancelLabel", "Cancel")}
          danger={values["danger"] === true}
          busy={values["busy"] === true}
          onYes={() => post("a2ui.yes")}
          onCancel={() => post("a2ui.cancel")}
        />
        <View class="flex-row flex-wrap gap-2">
          <Button testID="ref-primary" class={BUTTON_CLASS.primary} onPress={() => {}}>
            <Text class={BUTTON_TEXT_CLASS.primary}>Primary reference</Text>
          </Button>
          <Button testID="ref-secondary" class={BUTTON_CLASS.secondary} onPress={() => {}}>
            <Text class={BUTTON_TEXT_CLASS.secondary}>Secondary reference</Text>
          </Button>
          <Button testID="ref-danger" class={BUTTON_CLASS.danger} onPress={() => {}}>
            <Text class={BUTTON_TEXT_CLASS.danger}>Danger reference</Text>
          </Button>
        </View>
      </View>
    );
  }

  mount(AskHarness);
}
