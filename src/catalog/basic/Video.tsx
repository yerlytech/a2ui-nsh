/**
 * A2UI Basic Catalog v1 `Video` component on Native Shell (`nsh 0.7.2`).
 *
 * Wraps `nsh` `<Video>` with `sanitizeMediaUrl()` on `url` and optional
 * `posterUrl`, paused-by-default playback (`paused={true}`, `controls={true}`
 * to avoid web autoplay blocks), an `<Image>` poster overlay shown until
 * `onLoad` or explicit play, non-crashing text fallback cards for invalid/denied
 * URLs or terminal (`platform.idiom === "terminal"`), `weight`, and full
 * `@accessibility` plumbing (Spec 002 §1 & §3 Gaps #4, #5, #7).
 */

import {
  Image,
  Text,
  Video,
  View,
  computed,
  effect,
  platform,
  signal,
  type JSX,
} from "nsh";
import { Button } from "nsh/base";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  normalizeAccessibility,
  resolveEffectiveLabel,
  useLiveRegionAnnouncement,
  type AccessibilityOptions,
} from "../../renderer/accessibility";
import {
  unwrapOptionalString,
  weightStyle,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import { sanitizeMediaUrl } from "./media_url";

export type VideoPresentationMode =
  | "terminal"
  | "invalid-url"
  | "error"
  | "player";

export interface VideoPresentationInput {
  readonly isTerminal: boolean;
  readonly safeUrl: string | undefined;
  readonly safePosterUrl: string | undefined;
  readonly posterFailed: boolean;
  readonly hasLoaded: boolean;
  readonly hasStartedPlaying: boolean;
  readonly errorCode?: string;
  readonly hasError: boolean;
  readonly title?: string;
}

export interface VideoPresentationState {
  readonly mode: VideoPresentationMode;
  readonly title: string;
  readonly statusText: string;
  readonly showPosterOverlay: boolean;
}

/**
 * Pure presentation resolver for `BasicVideo` across terminal, invalid URL,
 * capability/load error, and active player states (with poster overlay gating).
 */
export function resolveVideoPresentationState(
  input: VideoPresentationInput,
): VideoPresentationState {
  const title =
    input.title && input.title.trim().length > 0 ? input.title.trim() : "Video";

  if (input.isTerminal) {
    return {
      mode: "terminal",
      title,
      statusText: "Video playback is unavailable in terminal.",
      showPosterOverlay: false,
    };
  }

  if (input.safeUrl === undefined) {
    return {
      mode: "invalid-url",
      title,
      statusText: "Video unavailable: invalid or unsupported URL.",
      showPosterOverlay: false,
    };
  }

  if (input.hasError) {
    const statusText =
      input.errorCode === "ERR_ACCESS_DENIED"
        ? "Video unavailable: network capability not granted."
        : "Video unavailable: unable to load source.";
    return {
      mode: "error",
      title,
      statusText,
      showPosterOverlay: false,
    };
  }

  const showPosterOverlay =
    input.safePosterUrl !== undefined &&
    !input.posterFailed &&
    !input.hasLoaded &&
    !input.hasStartedPlaying;

  return {
    mode: "player",
    title,
    statusText: "",
    showPosterOverlay,
  };
}

export function BasicVideo(props: A2uiComponentProps): JSX.Element {
  const urlProp = props.bridge.prop("url");
  const posterUrlProp = props.bridge.prop("posterUrl");
  const weightProp = props.bridge.prop<number | undefined>("weight");

  const paused = signal(true);
  const hasLoaded = signal(false);
  const hasStartedPlaying = signal(false);
  const errorState = signal<{ url: string; code?: string } | undefined>(
    undefined,
  );
  const posterFailedUrl = signal<string | undefined>(undefined);

  const safeUrl = computed(() =>
    sanitizeMediaUrl(unwrapOptionalString(urlProp())),
  );
  const safePosterUrl = computed(() =>
    sanitizeMediaUrl(unwrapOptionalString(posterUrlProp())),
  );

  // Reset playback and error state whenever the sanitized source URL changes.
  let lastSeenUrl: string | undefined = safeUrl();
  effect(() => {
    const current = safeUrl();
    if (current !== lastSeenUrl) {
      lastSeenUrl = current;
      paused.set(true);
      hasLoaded.set(false);
      hasStartedPlaying.set(false);
      errorState.set(undefined);
    }
  });

  const isTerminal = platform.idiom === "terminal";

  const a11y = computed(() =>
    normalizeAccessibility(props.bridge.accessibility()),
  );
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "region",
    fallbackLabel: "Video",
  }));
  const effectiveLabel = computed(() =>
    resolveEffectiveLabel(a11y(), a11yOptions().fallbackLabel),
  );
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  const presentation = computed(() => {
    const url = safeUrl();
    const poster = safePosterUrl();
    const err = errorState();
    const matchesCurrentError =
      url !== undefined && err !== undefined && err.url === url;
    return resolveVideoPresentationState({
      isTerminal,
      safeUrl: url,
      safePosterUrl: poster,
      posterFailed: poster !== undefined && posterFailedUrl() === poster,
      hasLoaded: hasLoaded(),
      hasStartedPlaying: hasStartedPlaying(),
      hasError: matchesCurrentError,
      errorCode: matchesCurrentError ? err.code : undefined,
      title: effectiveLabel(),
    });
  });

  useLiveRegionAnnouncement(a11y, () => {
    const state = presentation();
    return state.statusText.length > 0
      ? `${state.title}: ${state.statusText}`
      : state.title;
  });

  if (props.onAccessibilitySnapshot) {
    const report = props.onAccessibilitySnapshot;
    effect(() => {
      report(
        props.node.componentId,
        props.node.instanceId,
        buildAccessibilitySnapshot(a11y(), a11yOptions()),
      );
    });
  }

  return (
    <If
      when={presentation().mode === "player"}
      else={
        <View
          testID={props.testId}
          class="w-full gap-1 rounded-(--radius) border border-border bg-muted p-3"
          style={weightStyle(weightProp())}
          role={a11yProps().role}
          accessibilityLabel={a11yProps().accessibilityLabel}
          accessibilityDescription={a11yProps().accessibilityDescription}
          accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
          importantForAccessibility={a11yProps().importantForAccessibility}
          accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
        >
          <Text
            testID={`${props.testId}:fallback-title`}
            class="text-sm font-medium text-foreground"
          >
            {presentation().title}
          </Text>
          <Text
            testID={`${props.testId}:fallback-status`}
            class="text-xs text-muted-foreground"
          >
            {presentation().statusText}
          </Text>
        </View>
      }
    >
      <View
        testID={props.testId}
        class="relative w-full overflow-hidden rounded-(--radius) border border-border bg-black"
        style={{ minHeight: 200, ...weightStyle(weightProp()) }}
        role={a11yProps().role}
        accessibilityLabel={a11yProps().accessibilityLabel}
        accessibilityDescription={a11yProps().accessibilityDescription}
        accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
        importantForAccessibility={a11yProps().importantForAccessibility}
        accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
      >
        <Video
          testID={`${props.testId}:player`}
          src={safeUrl() ?? ""}
          paused={paused()}
          controls={true}
          class="h-full w-full"
          style={{ minHeight: 200 }}
          onLoad={() => {
            hasLoaded.set(true);
          }}
          onError={(event) => {
            const url = safeUrl();
            if (url !== undefined) {
              errorState.set({ url, code: event.code });
            }
          }}
          onEnd={() => {
            paused.set(true);
          }}
        />
        <If when={presentation().showPosterOverlay}>
          <View
            testID={`${props.testId}:poster-overlay`}
            class="absolute inset-0 items-center justify-center bg-muted"
          >
            <Image
              testID={`${props.testId}:poster`}
              src={safePosterUrl()}
              class="h-full w-full"
              style={{ objectFit: "cover" }}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
              onError={() => {
                const poster = safePosterUrl();
                if (poster !== undefined) {
                  posterFailedUrl.set(poster);
                }
              }}
            />
            <View class="absolute inset-0 items-center justify-center">
              <Button
                testID={`${props.testId}:poster-play`}
                accessibilityLabel={`Play ${presentation().title}`}
                class="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-primary px-4 py-2 focus-visible:outline-2"
                onPress={() => {
                  hasStartedPlaying.set(true);
                  paused.set(false);
                }}
              >
                <Text class="text-sm font-medium text-primary-foreground">
                  Play
                </Text>
              </Button>
            </View>
          </View>
        </If>
      </View>
    </If>
  );
}
