/**
 * xlarge catalog `Preview` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * A page drawn from what is typed and not yet kept (xlarge spec 038). `draft`
 * lists draft field names, read from the enclosing `Form`'s draft; `about`
 * names the draft field holding the record the draft is about; `action` is
 * xlarge's export name (`export:<screen>?shape=...`). It is never sent as an
 * A2UI event: once every named field holds a value, and `previewPauseMs`
 * after the last change, the host's `preview` option is asked with `action`
 * and `{ draft, about }` (`previewBody`) and the
 * page it answers is shown, the last one staying until the next arrives; a
 * rejection says `preview.failed` under it. Without that option the named
 * draft values are listed as typed (amounts as text, never through a float).
 * `label` (a code, default `preview.title`) names the page. It has no accept
 * button: xlarge's client has none.
 */

import { Image, Text, View, computed, effect, signal, type ImageStyle, type JSX } from "nsh";
import { Button } from "nsh/base";
import {
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { sanitizeMediaUrl } from "../basic/media_url";
import { BUTTON_CLASS, BUTTON_TEXT_CLASS } from "./ask";
import { FormDraftContext, type ResolvedXlargeOptions } from "./context";
import { draftLines, draftNames, previewBody } from "./model";

// A printed page, upright, as tall as a window comfortably shows.
const PAGE_STYLE: ImageStyle = {
  width: "100%",
  height: 560,
  borderRadius: 8,
  objectFit: "contain",
};

export function createXlargePreview(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargePreview(props: A2uiComponentProps): JSX.Element {
    const draft = FormDraftContext();
    const aboutProp = props.bridge.prop("about");
    const actionProp = props.bridge.prop("action");
    const labelProp = props.bridge.prop("label");
    const draftProp = props.bridge.prop("draft");
    const t = options.translate;

    const title = computed(() => t(unwrapOptionalString(labelProp()) ?? "preview.title"));
    const names = computed(() => draftNames(draftProp()));
    const values = computed(() => draft?.values() ?? {});
    const lines = computed(() => draftLines(names(), values()));
    const action = computed(() => unwrapOptionalString(actionProp()));
    // What the page is drawn from, as one string: a change that changed
    // nothing asks nothing again.
    const asked = computed(() => {
      const body = previewBody(names(), aboutProp(), values());
      const name = action();
      return body === undefined || name === undefined ? null : JSON.stringify({ name, body });
    });

    const address = signal<string | undefined>(undefined);
    const drawing = signal(false);
    const failed = signal(false);

    const draw = options.preview;
    if (draw !== undefined) {
      // Asked a moment after the last change (`previewPauseMs`), as xlarge
      // does, so typing does not ask once per key; an answer a later change
      // overtook is dropped.
      effect(() => {
        const key = asked();
        if (key === null) {
          return;
        }
        const { name, body } = JSON.parse(key) as { name: string; body: Parameters<typeof draw>[1] };
        let gone = false;
        const pause = setTimeout(() => {
          drawing.set(true);
          void draw(name, body)
            .then((made) => {
              if (gone) {
                return;
              }
              failed.set(false);
              const safe = made !== undefined ? sanitizeMediaUrl(made) : undefined;
              if (safe !== undefined) {
                address.set(safe);
              }
            })
            .catch(() => {
              if (!gone) {
                failed.set(true);
              }
            })
            .finally(() => {
              if (!gone) {
                drawing.set(false);
              }
            });
        }, options.previewPauseMs);
        return () => {
          gone = true;
          clearTimeout(pause);
        };
      });
    }

    return (
      <View testID={props.testId} role="group" accessibilityLabel={title()} class="gap-2">
        <If
          when={draw !== undefined}
          else={
            <View class="gap-1">
              <Each of={lines()} key={(line) => line.field}>
                {(line) => (
                  <View testID={`${props.testId}:line:${line().field}`} class="flex-row flex-wrap gap-2">
                    <Text class="text-sm text-muted-foreground">{line().field}</Text>
                    <Text class="text-sm text-foreground">{line().value === "" ? "—" : line().value}</Text>
                  </View>
                )}
              </Each>
            </View>
          }
        >
          <View class="flex-row flex-wrap items-center gap-3">
            <If when={drawing()}>
              <Text testID={`${props.testId}:drawing`} class="text-xs text-muted-foreground">
                {t("preview.drawing")}
              </Text>
            </If>
            <View class="flex-1" />
            <If when={address() !== undefined && options.openUrl !== undefined}>
              <Button
                testID={`${props.testId}:open`}
                accessibilityLabel={t("preview.open")}
                class={BUTTON_CLASS.secondary}
                onPress={() => {
                  const url = address();
                  if (url !== undefined) {
                    options.openUrl?.(url);
                  }
                }}
              >
                <Text class={BUTTON_TEXT_CLASS.secondary}>{t("preview.open")}</Text>
              </Button>
            </If>
          </View>
          <If when={failed()}>
            <Text testID={`${props.testId}:failed`} role="alert" class="text-sm text-destructive">
              {t("preview.failed")}
            </Text>
          </If>
          <If
            when={address() !== undefined}
            else={
              <View
                testID={`${props.testId}:waiting`}
                class="items-center justify-center rounded-(--radius) border border-dashed border-border p-6"
              >
                <Text class="text-sm text-muted-foreground">{t("preview.drawing")}</Text>
              </View>
            }
          >
            <Image
              testID={`${props.testId}:page`}
              src={address()}
              role="image"
              accessibilityLabel={title()}
              style={PAGE_STYLE}
            />
          </If>
        </If>
      </View>
    );
  };
}
