/**
 * xlarge catalog `Image` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Draws the picture at `src` (a data binding, `{"@path": "/logo"}`), checked
 * against unsafe URL schemes as the Basic Catalog `Image` checks it. `label`
 * (a code) is its accessible name. A missing, refused, or failed picture
 * leaves a placeholder of the same size with the same name.
 */

import { Image, View, computed, signal, type ImageStyle, type JSX } from "nsh";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import { sanitizeMediaUrl } from "../basic/media_url";
import type { ResolvedXlargeOptions } from "./context";

const IMAGE_STYLE: ImageStyle = {
  width: "100%",
  maxWidth: 480,
  height: 240,
  borderRadius: 8,
  objectFit: "contain",
};

export function createXlargeImage(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeImage(props: A2uiComponentProps): JSX.Element {
    const srcProp = props.bridge.prop("src");
    const labelProp = props.bridge.prop("label");

    const url = computed(() => sanitizeMediaUrl(unwrapBinding(srcProp())));
    const label = computed(() => {
      const code = unwrapOptionalString(labelProp());
      return code !== undefined ? options.translate(code) : undefined;
    });
    const failedUrl = signal<string | undefined>(undefined);
    const canDraw = computed(() => url() !== undefined && failedUrl() !== url());

    return (
      <If
        when={canDraw()}
        else={
          <View
            testID={props.testId}
            role="image"
            accessibilityLabel={label()}
            class="items-center justify-center border border-border bg-muted"
            style={IMAGE_STYLE}
          />
        }
      >
        <Image
          testID={props.testId}
          src={url()}
          role="image"
          accessibilityLabel={label()}
          style={IMAGE_STYLE}
          onError={() => failedUrl.set(url())}
        />
      </If>
    );
  };
}
