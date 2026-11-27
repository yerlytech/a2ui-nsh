/**
 * A2UI Basic Catalog v1 `AudioPlayer` component on Native Shell (`nsh 0.7.2`).
 *
 * Composes an accessible control bar (`Button` Play/Pause, `Slider` scrub bar,
 * elapsed/duration `Text`, optional `description` title) over `nsh`'s
 * imperative `AudioPlayer` class, calling `dispose()` on `cleanup()` and on
 * source URL changes. Catches synchronous `ERR_ACCESS_DENIED` (`audio`/`network`
 * not granted) and `unavailable` errors, and renders a compact text fallback
 * card on terminal (`platform.idiom === "terminal"`) without crashing
 * (Spec 002 §1 & §3 Gaps #3, #5, #7).
 */

import {
  AudioPlayer as NshAudioPlayer,
  Text,
  View,
  cleanup,
  computed,
  effect,
  platform,
  signal,
  type AudioPlayerState,
  type JSX,
} from "nsh";
import { Button, Slider } from "nsh/base";
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

export type AudioDegradedKind =
  | "terminal"
  | "invalid-url"
  | "denied-audio"
  | "denied-network"
  | "unavailable"
  | "autoplay-blocked"
  | "error";

export interface ClassifiedAudioError {
  readonly kind: AudioDegradedKind;
  readonly message: string;
}

/** Formats audio elapsed/duration seconds as `M:SS` or `H:MM:SS` (`LIVE` for streams). */
export function formatAudioTime(seconds: number): string {
  if (seconds === Number.POSITIVE_INFINITY) {
    return "LIVE";
  }
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(secs)}`;
  }
  return `${minutes}:${pad2(secs)}`;
}

/**
 * Classifies synchronous `new AudioPlayer(...)`, `play()`, and `"error"` event
 * failures into user-safe degraded states without leaking host details.
 */
export function classifyAudioError(err: unknown): ClassifiedAudioError {
  const rec =
    err !== null && typeof err === "object"
      ? (err as { code?: unknown; permission?: unknown; message?: unknown })
      : undefined;
  const code = typeof rec?.code === "string" ? rec.code : "";
  const permission = typeof rec?.permission === "string" ? rec.permission : "";
  const rawMessage =
    typeof rec?.message === "string"
      ? rec.message
      : typeof err === "string"
        ? err
        : "";
  const lowerMsg = rawMessage.toLowerCase();

  if (code === "ERR_ACCESS_DENIED") {
    if (permission === "network" || lowerMsg.includes("network")) {
      return {
        kind: "denied-network",
        message: "Audio unavailable: network capability not granted.",
      };
    }
    return {
      kind: "denied-audio",
      message: "Audio unavailable: audio capability not granted.",
    };
  }

  if (code === "not-allowed") {
    if (lowerMsg.includes("network")) {
      return {
        kind: "denied-network",
        message: "Audio unavailable: network capability not granted.",
      };
    }
    if (
      lowerMsg.includes("gesture") ||
      lowerMsg.includes("user") ||
      lowerMsg.includes("autoplay")
    ) {
      return {
        kind: "autoplay-blocked",
        message: "Press Play to start audio playback.",
      };
    }
    return {
      kind: "denied-audio",
      message: "Audio unavailable: audio capability not granted.",
    };
  }

  if (
    code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM" ||
    code === "unavailable"
  ) {
    return {
      kind: "unavailable",
      message: "Audio playback is unavailable on this platform.",
    };
  }

  return {
    kind: "error",
    message: "Audio playback failed.",
  };
}

export function BasicAudioPlayer(props: A2uiComponentProps): JSX.Element {
  const urlProp = props.bridge.prop("url");
  const descriptionProp = props.bridge.prop("description");
  const weightProp = props.bridge.prop<number | undefined>("weight");

  const isTerminal = platform.idiom === "terminal";

  const playbackState = signal<AudioPlayerState>("idle");
  const currentTime = signal(0);
  const duration = signal(0);
  const platformUnavailable = signal(false);
  const degraded = signal<ClassifiedAudioError | undefined>(
    isTerminal
      ? {
          kind: "terminal",
          message: "Audio playback is unavailable in terminal.",
        }
      : undefined,
  );

  const safeUrl = computed(() =>
    sanitizeMediaUrl(unwrapOptionalString(urlProp())),
  );
  const descriptionText = computed(
    () => unwrapOptionalString(descriptionProp()) ?? "",
  );

  const a11y = computed(() =>
    normalizeAccessibility(props.bridge.accessibility()),
  );
  const a11yOptions = computed<AccessibilityOptions>(() => ({
    defaultRole: "region",
    fallbackLabel:
      descriptionText().length > 0 ? descriptionText() : "Audio Player",
  }));
  const effectiveLabel = computed(() =>
    resolveEffectiveLabel(a11y(), a11yOptions().fallbackLabel),
  );
  const a11yProps = computed(() =>
    buildViewAccessibilityProps(a11y(), a11yOptions()),
  );

  let player: NshAudioPlayer | null = null;
  let unsubs: Array<() => void> = [];
  let activePlayerUrl: string | undefined;
  let disposed = false;

  const disposePlayer = (): void => {
    for (let i = 0; i < unsubs.length; i += 1) {
      try {
        unsubs[i]!();
      } catch {
        // Ignore already-stopped listener handles.
      }
    }
    unsubs = [];
    if (player !== null) {
      const target = player;
      player = null;
      try {
        target.dispose();
      } catch {
        // Ignore already-disposed player.
      }
    }
    activePlayerUrl = undefined;
  };

  cleanup(() => {
    disposed = true;
    disposePlayer();
  });

  // Check platform audio availability once on non-terminal hosts.
  if (!isTerminal) {
    void NshAudioPlayer.available()
      .then((avail) => {
        if (disposed || avail) {
          return;
        }
        platformUnavailable.set(true);
        disposePlayer();
        degraded.set({
          kind: "unavailable",
          message: "Audio playback is unavailable on this platform.",
        });
      })
      .catch(() => {
        // Ignore availability probe errors; constructor/play errors still surface cleanly.
      });
  }

  // Re-initialize imperative AudioPlayer whenever the sanitized URL changes.
  effect(() => {
    const url = safeUrl();
    if (isTerminal) {
      return;
    }
    if (platformUnavailable()) {
      disposePlayer();
      degraded.set({
        kind: "unavailable",
        message: "Audio playback is unavailable on this platform.",
      });
      return;
    }
    if (url === activePlayerUrl && player !== null) {
      return;
    }

    disposePlayer();
    playbackState.set("idle");
    currentTime.set(0);
    duration.set(0);

    if (url === undefined) {
      degraded.set({
        kind: "invalid-url",
        message: "Audio unavailable: invalid or unsupported URL.",
      });
      return;
    }

    try {
      const nextPlayer = new NshAudioPlayer(url);
      player = nextPlayer;
      activePlayerUrl = url;
      degraded.set(undefined);

      unsubs = [
        nextPlayer.on("load", (ev) => {
          if (disposed || player !== nextPlayer) {
            return;
          }
          if (Number.isFinite(ev.duration) && ev.duration >= 0) {
            duration.set(ev.duration);
          } else if (ev.duration === Number.POSITIVE_INFINITY) {
            duration.set(ev.duration);
          }
        }),
        nextPlayer.on("progress", (ev) => {
          if (disposed || player !== nextPlayer) {
            return;
          }
          if (Number.isFinite(ev.currentTime) && ev.currentTime >= 0) {
            currentTime.set(ev.currentTime);
          }
          if (
            (Number.isFinite(ev.duration) && ev.duration > 0) ||
            ev.duration === Number.POSITIVE_INFINITY
          ) {
            duration.set(ev.duration);
          }
        }),
        nextPlayer.on("end", () => {
          if (disposed || player !== nextPlayer) {
            return;
          }
          playbackState.set("ended");
          const d = duration();
          if (Number.isFinite(d) && d > 0) {
            currentTime.set(d);
          }
        }),
        nextPlayer.on("error", (ev) => {
          if (disposed || player !== nextPlayer) {
            return;
          }
          playbackState.set("idle");
          degraded.set(classifyAudioError(ev));
        }),
      ];
    } catch (err) {
      player = null;
      activePlayerUrl = undefined;
      degraded.set(classifyAudioError(err));
    }
  });

  const isDegraded = computed(() => {
    const info = degraded();
    return info !== undefined && info.kind !== "autoplay-blocked";
  });

  const displayTitle = computed(() => {
    if (descriptionText().length > 0) {
      return descriptionText();
    }
    return effectiveLabel() ?? "Audio Player";
  });

  const isPlaying = computed(() => playbackState() === "playing");
  const canSeek = computed(() => {
    const d = duration();
    return !isDegraded() && Number.isFinite(d) && d > 0;
  });
  const scrubMax = computed(() => {
    const d = duration();
    return Number.isFinite(d) && d > 0 ? d : 1;
  });
  const scrubValue = computed(() => {
    const max = scrubMax();
    const t = currentTime();
    if (!Number.isFinite(t) || t < 0) {
      return 0;
    }
    return Math.min(max, t);
  });
  const timeLabel = computed(() => {
    const elapsed = formatAudioTime(currentTime());
    const d = duration();
    const total =
      d === Number.POSITIVE_INFINITY
        ? "LIVE"
        : Number.isFinite(d) && d > 0
          ? formatAudioTime(d)
          : "0:00";
    return `${elapsed} / ${total}`;
  });

  useLiveRegionAnnouncement(a11y, () => {
    const info = degraded();
    if (info !== undefined) {
      return `${displayTitle()}: ${info.message}`;
    }
    return `${displayTitle()} ${playbackState()}`;
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

  const handleTogglePlay = (): void => {
    if (player === null || isDegraded()) {
      return;
    }
    if (playbackState() === "playing") {
      player.pause();
      playbackState.set("paused");
      return;
    }
    if (playbackState() === "ended") {
      try {
        player.seek(0);
        currentTime.set(0);
      } catch {
        // Ignore seek failure before replay.
      }
    }
    if (degraded()?.kind === "autoplay-blocked") {
      degraded.set(undefined);
    }
    const activePlayer = player;
    playbackState.set("loading");
    void activePlayer
      .play()
      .then(() => {
        if (disposed || player !== activePlayer) {
          return;
        }
        playbackState.set("playing");
        if (Number.isFinite(activePlayer.duration) && activePlayer.duration > 0) {
          duration.set(activePlayer.duration);
        }
      })
      .catch((err) => {
        if (disposed || player !== activePlayer) {
          return;
        }
        playbackState.set("idle");
        degraded.set(classifyAudioError(err));
      });
  };

  if (isTerminal) {
    return (
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
          testID={`${props.testId}:description`}
          class="text-sm font-medium text-foreground"
        >
          {displayTitle()}
        </Text>
        <Text
          testID={`${props.testId}:status`}
          class="text-xs text-muted-foreground"
        >
          Audio playback is unavailable in terminal.
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={props.testId}
      class="w-full gap-2 rounded-(--radius) border border-border bg-card p-3"
      style={weightStyle(weightProp())}
      role={a11yProps().role}
      accessibilityLabel={a11yProps().accessibilityLabel}
      accessibilityDescription={a11yProps().accessibilityDescription}
      accessibilityElementsHidden={a11yProps().accessibilityElementsHidden}
      importantForAccessibility={a11yProps().importantForAccessibility}
      accessibilityLiveRegion={a11yProps().accessibilityLiveRegion}
    >
      <If when={descriptionText().length > 0}>
        <Text
          testID={`${props.testId}:description`}
          class="text-sm font-medium text-foreground"
        >
          {descriptionText()}
        </Text>
      </If>

      <View class="flex-row items-center gap-3">
        <Button
          testID={`${props.testId}:toggle`}
          disabled={isDegraded()}
          accessibilityLabel={
            isPlaying() ? `Pause ${displayTitle()}` : `Play ${displayTitle()}`
          }
          class="min-h-[44px] min-w-[72px] items-center justify-center rounded-(--radius) bg-primary px-3 py-2 disabled:opacity-50 focus-visible:outline-2"
          onPress={handleTogglePlay}
        >
          <Text class="text-sm font-medium text-primary-foreground">
            {isPlaying() ? "Pause" : "Play"}
          </Text>
        </Button>

        <View class="flex-1">
          <Slider
            testID={`${props.testId}:scrub`}
            min={0}
            max={scrubMax()}
            step={0}
            value={scrubValue()}
            disabled={!canSeek()}
            accessibilityLabel={`Seek ${displayTitle()}`}
            class="w-full"
            trackClass="h-10 w-full justify-center"
            indicatorClass="h-1.5 w-full rounded-full bg-muted"
            rangeClass="rounded-full bg-primary"
            thumbClass="size-4 rounded-full border-2 border-primary bg-background focus-visible:outline-2"
            onChange={(event) => {
              if (player === null || !canSeek()) {
                return;
              }
              const raw = Array.isArray(event.value)
                ? event.value[1]
                : event.value;
              const target = Math.max(
                0,
                Math.min(scrubMax(), Number.isFinite(raw) ? raw : 0),
              );
              currentTime.set(target);
              try {
                player.seek(target);
              } catch {
                // Ignore out-of-range seek on transient duration changes.
              }
            }}
          />
        </View>

        <Text
          testID={`${props.testId}:time`}
          class="text-xs text-muted-foreground"
        >
          {timeLabel()}
        </Text>
      </View>

      <If when={degraded() !== undefined}>
        <Text
          testID={`${props.testId}:status`}
          role="alert"
          class="text-xs text-destructive"
        >
          {degraded()?.message ?? ""}
        </Text>
      </If>
    </View>
  );
}
