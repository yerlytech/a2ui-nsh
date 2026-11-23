/**
 * xlarge catalog `Image` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * `src` binds (`{"@path": "/logo"}`) to what xlarge's data model holds: an
 * attachment id or a list of them, which xlarge serves at
 * `/api/v1/files/<id>` with the session. One picture is drawn per id, side by
 * side. A value that already is a safe URL is used as it is; an id goes
 * through the host's `fileUrl`, and what comes back is still checked against
 * unsafe URL schemes as the Basic Catalog `Image` checks it. `label` (a code)
 * is every picture's accessible name. A bare id without `fileUrl`, a refused
 * URL, or a picture that fails leaves a placeholder of the same size with the
 * same name; nothing bound leaves one placeholder.
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

/** One picture to draw: its place in the list and its checked URL, if any. */
export interface PictureSource {
  readonly index: number;
  readonly url: string | undefined;
}

/**
 * The pictures `value` names: one per non-empty string (a single string or a
 * list of them). A safe URL stays as it is; anything else is an attachment id
 * turned into a URL by `fileUrl`, then checked. Nothing usable gives one
 * source without a URL, so the placeholder still shows.
 */
export function pictureSources(
  value: unknown,
  fileUrl: ((id: string) => string | undefined) | undefined,
): PictureSource[] {
  const raw = Array.isArray(value) ? value : [value];
  const ids = raw.filter((id): id is string => typeof id === "string" && id.trim() !== "");
  if (ids.length === 0) {
    return [{ index: 0, url: undefined }];
  }
  return ids.map((id, index) => {
    const direct = sanitizeMediaUrl(id);
    if (direct !== undefined) {
      return { index, url: direct };
    }
    return { index, url: fileUrl !== undefined ? sanitizeMediaUrl(fileUrl(id.trim())) : undefined };
  });
}

export function createXlargeImage(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeImage(props: A2uiComponentProps): JSX.Element {
    const srcProp = props.bridge.prop("src");
    const labelProp = props.bridge.prop("label");

    const sources = computed(() => pictureSources(unwrapBinding(srcProp()), options.fileUrl));
    const label = computed(() => {
      const code = unwrapOptionalString(labelProp());
      return code !== undefined ? options.translate(code) : undefined;
    });
    const failed = signal<ReadonlySet<string>>(new Set());
    const one = computed(() => sources().length === 1);

    const picture = (source: PictureSource): JSX.Element => {
      const testID = one() ? props.testId : `${props.testId}:${source.index}`;
      const url = source.url;
      return (
        <If
          when={url !== undefined && !failed().has(url)}
          else={
            <View
              testID={testID}
              role="image"
              accessibilityLabel={label()}
              class="items-center justify-center border border-border bg-muted"
              style={IMAGE_STYLE}
            />
          }
        >
          <Image
            testID={testID}
            src={url}
            role="image"
            accessibilityLabel={label()}
            style={IMAGE_STYLE}
            onError={() => {
              if (url !== undefined) {
                failed.update((prev) => new Set(prev).add(url));
              }
            }}
          />
        </If>
      );
    };

    return (
      <If
        when={one()}
        else={
          <View testID={`${props.testId}:pictures`} class="flex-row flex-wrap gap-3">
            <Each of={sources()} key={(source) => `${source.index}:${source.url ?? ""}`}>
              {(source) => picture(source())}
            </Each>
          </View>
        }
      >
        {picture(sources()[0]!)}
      </If>
    );
  };
}
