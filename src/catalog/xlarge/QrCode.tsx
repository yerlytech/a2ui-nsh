/**
 * xlarge catalog `QrCode` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * `src` binds to the SVG markup xlarge's server drew (`<svg ...>`): it is
 * drawn as an `image/svg+xml` data URI picture, so nothing in it runs. A `src`
 * that already is a safe picture URL is drawn as it is. Without a drawing, or
 * when the drawing fails, `link` (a data binding) is encoded with the pure
 * encoder in `model.ts` and its modules are drawn on a `Canvas`, dark on light
 * with the four-module quiet zone scanners need.
 *
 * The accessible name and the caption are only the translated `label` (the
 * host's `qrLabel` without one): the `link` text is never shown, since an
 * `otpauth:` link carries a TOTP secret. Such a link is offered as an "open
 * in app" button when the host can open links (`openUrl`).
 */

import { Canvas, Image, Text, View, computed, signal, type JSX } from "nsh";
import { Button } from "nsh/base";
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

/**
 * The picture URL for a bound `src`: SVG markup becomes an
 * `image/svg+xml` data URI; anything else must already be a safe URL.
 */
export function qrPictureUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.includes("<svg")) {
    return sanitizeMediaUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(value.trim())}`);
  }
  return sanitizeMediaUrl(value);
}

export function createXlargeQrCode(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeQrCode(props: A2uiComponentProps): JSX.Element {
    const srcProp = props.bridge.prop("src");
    const linkProp = props.bridge.prop("link");
    const labelProp = props.bridge.prop("label");

    const failedSrc = signal<string | undefined>(undefined);
    const src = computed(() => {
      const url = qrPictureUrl(unwrapBinding(srcProp()));
      return url !== undefined && url !== failedSrc() ? url : undefined;
    });
    const link = computed(() => unwrapOptionalString(linkProp()));
    const appLink = computed(() => {
      const text = link()?.trim();
      return text !== undefined && text.startsWith("otpauth://") && options.openUrl !== undefined
        ? text
        : undefined;
    });
    const matrix = computed(() => {
      const text = link();
      return src() === undefined && text !== undefined ? encodeQr(text) : undefined;
    });
    const name = computed(() => {
      const code = unwrapOptionalString(labelProp());
      return code !== undefined ? options.translate(code) : options.qrLabel;
    });

    return (
      <View testID={`${props.testId}:container`} class="items-start gap-2">
        <If when={src() !== undefined}>
          <Image
            testID={props.testId}
            src={src()}
            role="image"
            accessibilityLabel={name()}
            style={{ width: QR_SIDE, height: QR_SIDE, objectFit: "contain" }}
            onError={() => failedSrc.set(src())}
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
        <Text testID={`${props.testId}:label`} class="text-sm text-muted-foreground">
          {name()}
        </Text>
        <If when={appLink() !== undefined}>
          <Button
            testID={`${props.testId}:open`}
            accessibilityLabel={options.openInAppLabel}
            class="min-h-[44px] flex-row items-center justify-center rounded-(--radius) border border-border bg-secondary px-4 py-2 hover:bg-muted active:opacity-80 focus-visible:outline-2"
            onPress={() => {
              const href = appLink();
              if (href !== undefined) {
                options.openUrl?.(href);
              }
            }}
          >
            <Text class="text-sm text-secondary-foreground">{options.openInAppLabel}</Text>
          </Button>
        </If>
      </View>
    );
  };
}
