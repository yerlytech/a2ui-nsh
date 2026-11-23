/**
 * xlarge catalog `QrCode` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * With `src` (a data binding to a ready picture) it draws that picture: `src`
 * wins. Otherwise it encodes `link` (a data binding) as a QR code with the
 * pure encoder in `model.ts` and draws its modules on a `Canvas`, dark on
 * light with the four-module quiet zone scanners need. `label` (a code) is the
 * accessible name and the caption; without it the link names the code.
 */

import { Canvas, Image, Text, View, computed, type JSX } from "nsh";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { sanitizeMediaUrl } from "../basic/media_url";
import type { ResolvedXlargeOptions } from "./context";
import { encodeQr } from "./model";

/** The side of a drawn code, in points. */
const QR_SIDE = 176;
/** Light modules around the code (ISO/IEC 18004 asks for four). */
const QUIET_ZONE = 4;

export function createXlargeQrCode(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeQrCode(props: A2uiComponentProps): JSX.Element {
    const srcProp = props.bridge.prop("src");
    const linkProp = props.bridge.prop("link");
    const labelProp = props.bridge.prop("label");

    const src = computed(() => sanitizeMediaUrl(unwrapBinding(srcProp())));
    const link = computed(() => unwrapOptionalString(linkProp()));
    const matrix = computed(() => {
      const text = link();
      return src() === undefined && text !== undefined ? encodeQr(text) : undefined;
    });
    const caption = computed(() => {
      const code = unwrapOptionalString(labelProp());
      return code !== undefined ? options.translate(code) : undefined;
    });
    const name = computed(() => caption() ?? link());

    return (
      <View testID={`${props.testId}:container`} class="items-start gap-2">
        <If when={src() !== undefined}>
          <Image
            testID={props.testId}
            src={src()}
            role="image"
            accessibilityLabel={name()}
            style={{ width: QR_SIDE, height: QR_SIDE, objectFit: "contain" }}
          />
        </If>
        <If when={matrix() !== undefined}>
          <Canvas
            testID={props.testId}
            role="image"
            accessibilityLabel={name()}
            style={{ width: QR_SIDE, height: QR_SIDE }}
            draw={(cx, size) => {
              const qr = matrix();
              if (qr === undefined) {
                return;
              }
              const side = Math.min(size.width, size.height) > 0 ? Math.min(size.width, size.height) : QR_SIDE;
              const cell = side / (qr.size + QUIET_ZONE * 2);
              cx.fillStyle = "#ffffff";
              cx.fillRect(0, 0, side, side);
              cx.fillStyle = "#000000";
              qr.rows.forEach((row, y) => {
                row.forEach((dark, x) => {
                  if (dark) {
                    cx.fillRect((x + QUIET_ZONE) * cell, (y + QUIET_ZONE) * cell, cell, cell);
                  }
                });
              });
            }}
          />
        </If>
        <If when={src() === undefined && matrix() === undefined}>
          <View
            testID={props.testId}
            role="image"
            accessibilityLabel={name()}
            class="border border-border bg-muted"
            style={{ width: QR_SIDE, height: QR_SIDE }}
          />
        </If>
        <If when={caption() !== undefined}>
          <Text testID={`${props.testId}:label`} class="text-sm text-muted-foreground">
            {caption() ?? ""}
          </Text>
        </If>
      </View>
    );
  };
}
