import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";
import { classifyAudioError, formatAudioTime } from "./AudioPlayer";

const DENIED_HARNESS = "../../renderer/test_harness.tsx";
const GRANTED_HARNESS = "../../renderer/media_test_harness/App.tsx";

describe("Basic Catalog AudioPlayer", () => {
  test("pure helpers format timestamps and classify access/platform errors safely", () => {
    expect(formatAudioTime(0)).toBe("0:00");
    expect(formatAudioTime(5)).toBe("0:05");
    expect(formatAudioTime(65)).toBe("1:05");
    expect(formatAudioTime(3661)).toBe("1:01:01");
    expect(formatAudioTime(Number.POSITIVE_INFINITY)).toBe("LIVE");
    expect(formatAudioTime(Number.NaN)).toBe("0:00");
    expect(formatAudioTime(-10)).toBe("0:00");

    expect(
      classifyAudioError({ code: "ERR_ACCESS_DENIED", permission: "audio" }),
    ).toEqual({
      kind: "denied-audio",
      message: "Audio unavailable: audio capability not granted.",
    });

    expect(
      classifyAudioError({ code: "ERR_ACCESS_DENIED", permission: "network" }),
    ).toEqual({
      kind: "denied-network",
      message: "Audio unavailable: network capability not granted.",
    });

    expect(
      classifyAudioError({ code: "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM" }),
    ).toEqual({
      kind: "unavailable",
      message: "Audio playback is unavailable on this platform.",
    });

    expect(classifyAudioError({ code: "unavailable" })).toEqual({
      kind: "unavailable",
      message: "Audio playback is unavailable on this platform.",
    });

    expect(
      classifyAudioError({
        code: "not-allowed",
        message: "requires user gesture",
      }),
    ).toEqual({
      kind: "autoplay-blocked",
      message: "Press Play to start audio playback.",
    });
  });

  test("degrades gracefully without crashing under default host-only capabilities (audio denied)", async () => {
    const app = await open(DENIED_HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_aud_denied",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "AudioPlayer",
                    url: "asset:/episode1.mp3",
                    description: "Quarterly Earnings Call",
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("id:s_aud_denied:root")).toBe(true);
    expect(app.shows("text:Quarterly Earnings Call")).toBe(true);
    expect(
      app.shows("text:Audio unavailable: audio capability not granted."),
    ).toBe(true);
    expect(app.enabled("id:s_aud_denied:root:toggle")).toBe(false);
    expect(app.audio()).toEqual([]);

    const snap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(
      (snap?.data as { snapshot?: Record<string, unknown> })?.snapshot,
    ).toEqual({
      label: "Quarterly Earnings Call",
      hidden: false,
      role: "region",
    });
  });

  test("plays, pauses, seeks, handles endAudio, and disposes on cleanup when audio capability is granted", async () => {
    const app = await open(GRANTED_HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_aud_ok",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  trackUrl: "asset:/clip.mp3",
                  title: "Release Briefing",
                },
                components: [
                  {
                    id: "root",
                    component: "AudioPlayer",
                    url: { "@path": "/trackUrl" },
                    description: { "@path": "/title" },
                    "@accessibility": {
                      label: "Briefing Audio Player",
                      description: "Plays the recorded release briefing",
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("id:s_aud_ok:root")).toBe(true);
    expect(app.shows("text:Release Briefing")).toBe(true);
    expect(app.shows("text:Play")).toBe(true);
    expect(app.shows("id:s_aud_ok:root:status")).toBe(false);
    expect(app.enabled("id:s_aud_ok:root:toggle")).toBe(true);
    expect(app.shows("label:Briefing Audio Player")).toBe(true);

    // Must not autoplay before an explicit Play button press.
    expect(
      app.audio().some((call) => call.command === "resume"),
    ).toBe(false);

    // Press Play -> headless AudioPlayer loads 60s duration and plays.
    await app.press("id:s_aud_ok:root:toggle");
    await app.waitFor("text:Pause");
    expect(app.shows("text:0:00 / 1:00")).toBe(true);
    expect(
      app.audio().some((c) => c.command === "open" && c.src === "asset:/clip.mp3"),
    ).toBe(true);

    // Scrub via drag on the scrub slider -> issues seek command.
    await app.drag("label:Seek Release Briefing", { x: 100 });
    expect(
      app.audio().some((c) => c.command === "seek" && (c.position ?? 0) > 0),
    ).toBe(true);

    // Press Pause -> pauses playback and switches button back to Play.
    await app.press("id:s_aud_ok:root:toggle");
    await app.waitFor("text:Play");
    expect(app.audio().some((c) => c.command === "pause")).toBe(true);

    // Resume and finish playback via app.endAudio().
    await app.press("id:s_aud_ok:root:toggle");
    await app.waitFor("text:Pause");
    await app.endAudio();
    await app.waitFor("text:Play");
    expect(app.shows("text:1:00 / 1:00")).toBe(true);

    // Verify @accessibility snapshot override.
    const snap = app.host
      .posts()
      .find(
        (p) =>
          p.name === "a2ui.a11y" &&
          (p.data as { componentId?: string }).componentId === "root",
      );
    expect(
      (snap?.data as { snapshot?: Record<string, unknown> })?.snapshot,
    ).toEqual({
      label: "Briefing Audio Player",
      description: "Plays the recorded release briefing",
      hidden: false,
      role: "region",
    });

    // Deleting the surface runs cleanup() and disposes the AudioPlayer.
    await app.host.send("a2ui.message", {
      version: "1.0",
      deleteSurface: { surfaceId: "s_aud_ok" },
    });
    await app.waitUntil(() =>
      app.audio().some((c) => c.command === "close" && c.src === "asset:/clip.mp3"),
    );
    expect(
      app.audio().some((c) => c.command === "close" && c.src === "asset:/clip.mp3"),
    ).toBe(true);
  });

  test("catches network capability denial and rejects unsafe schemes cleanly", async () => {
    const app = await open(GRANTED_HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_aud_net",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["blocked_remote", "unsafe_audio"],
                  },
                  {
                    id: "blocked_remote",
                    component: "AudioPlayer",
                    url: "https://unlisted.example.org/podcast.mp3",
                    description: "Unlisted Host Audio",
                  },
                  {
                    id: "unsafe_audio",
                    component: "AudioPlayer",
                    url: "javascript:alert(1)",
                    description: "Unsafe Audio",
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(app.shows("text:Unlisted Host Audio")).toBe(true);
    expect(
      app.shows("text:Audio unavailable: network capability not granted."),
    ).toBe(true);
    expect(app.enabled("id:s_aud_net:blocked_remote:toggle")).toBe(false);

    expect(app.shows("text:Unsafe Audio")).toBe(true);
    expect(
      app.shows("text:Audio unavailable: invalid or unsupported URL."),
    ).toBe(true);
    expect(app.enabled("id:s_aud_net:unsafe_audio:toggle")).toBe(false);
  });
});
