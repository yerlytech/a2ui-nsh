import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";
import { resolveVideoPresentationState } from "./Video";

const HARNESS = "../../renderer/test_harness.tsx";
const SAMPLE_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("Basic Catalog Video", () => {
  test("pure presentation resolver covers terminal fallback, invalid URL, access denied, and poster gating", () => {
    expect(
      resolveVideoPresentationState({
        isTerminal: true,
        safeUrl: "https://example.com/demo.mp4",
        safePosterUrl: SAMPLE_PNG_DATA_URI,
        posterFailed: false,
        hasLoaded: false,
        hasStartedPlaying: false,
        hasError: false,
        title: "Product Tour",
      }),
    ).toEqual({
      mode: "terminal",
      title: "Product Tour",
      statusText: "Video playback is unavailable in terminal.",
      showPosterOverlay: false,
    });

    expect(
      resolveVideoPresentationState({
        isTerminal: false,
        safeUrl: undefined,
        safePosterUrl: undefined,
        posterFailed: false,
        hasLoaded: false,
        hasStartedPlaying: false,
        hasError: false,
      }),
    ).toEqual({
      mode: "invalid-url",
      title: "Video",
      statusText: "Video unavailable: invalid or unsupported URL.",
      showPosterOverlay: false,
    });

    expect(
      resolveVideoPresentationState({
        isTerminal: false,
        safeUrl: "https://example.com/demo.mp4",
        safePosterUrl: undefined,
        posterFailed: false,
        hasLoaded: false,
        hasStartedPlaying: false,
        hasError: true,
        errorCode: "ERR_ACCESS_DENIED",
        title: "Onboarding",
      }),
    ).toEqual({
      mode: "error",
      title: "Onboarding",
      statusText: "Video unavailable: network capability not granted.",
      showPosterOverlay: false,
    });

    // Poster shows before load/play, then hides once loaded or started.
    expect(
      resolveVideoPresentationState({
        isTerminal: false,
        safeUrl: "asset:/intro.mp4",
        safePosterUrl: SAMPLE_PNG_DATA_URI,
        posterFailed: false,
        hasLoaded: false,
        hasStartedPlaying: false,
        hasError: false,
        title: "Intro",
      }).showPosterOverlay,
    ).toBe(true);

    expect(
      resolveVideoPresentationState({
        isTerminal: false,
        safeUrl: "asset:/intro.mp4",
        safePosterUrl: SAMPLE_PNG_DATA_URI,
        posterFailed: false,
        hasLoaded: true,
        hasStartedPlaying: false,
        hasError: false,
        title: "Intro",
      }).showPosterOverlay,
    ).toBe(false);

    expect(
      resolveVideoPresentationState({
        isTerminal: false,
        safeUrl: "asset:/intro.mp4",
        safePosterUrl: SAMPLE_PNG_DATA_URI,
        posterFailed: false,
        hasLoaded: false,
        hasStartedPlaying: true,
        hasError: false,
        title: "Intro",
      }).showPosterOverlay,
    ).toBe(false);
  });

  test("renders paused video with poster overlay and dismisses poster when Play is pressed", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_vid",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  videoUrl: "asset:/demo.mp4",
                  posterUrl: SAMPLE_PNG_DATA_URI,
                },
                components: [
                  {
                    id: "root",
                    component: "Video",
                    url: { "@path": "/videoUrl" },
                    posterUrl: { "@path": "/posterUrl" },
                    "@accessibility": {
                      label: "Product Overview",
                      description: "Two-minute walkthrough video",
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

    expect(app.shows("id:s_vid:root")).toBe(true);
    expect(app.shows("id:s_vid:root:player")).toBe(true);
    expect(app.shows("id:s_vid:root:poster")).toBe(true);
    expect(app.shows("id:s_vid:root:poster-play")).toBe(true);
    expect(app.shows("label:Product Overview")).toBe(true);

    // Pressing Play over the poster dismisses the poster overlay and begins playback.
    await app.press("id:s_vid:root:poster-play");
    expect(app.shows("id:s_vid:root:poster-overlay")).toBe(false);
    expect(app.shows("id:s_vid:root:player")).toBe(true);

    // Reactive URL update resets playback state and restores poster overlay.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_vid",
        path: "/videoUrl",
        value: "asset:/demo-v2.mp4",
      },
    });
    expect(app.shows("id:s_vid:root:poster-overlay")).toBe(true);

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
      label: "Product Overview",
      description: "Two-minute walkthrough video",
      hidden: false,
      role: "region",
    });
  });

  test("renders non-crashing text fallback card for unsafe URLs and survives denied remote URLs", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_vid_fallback",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["unsafe_vid", "remote_vid"],
                  },
                  {
                    id: "unsafe_vid",
                    component: "Video",
                    url: "javascript:alert(1)",
                    "@accessibility": {
                      label: "Blocked Clip",
                    },
                  },
                  {
                    id: "remote_vid",
                    component: "Video",
                    url: "https://cdn.example.com/clip.mp4",
                    "@accessibility": {
                      label: "Remote Clip",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    // Unsafe URL renders fallback card with accessible title & status, no <Video>.
    expect(app.shows("id:s_vid_fallback:unsafe_vid")).toBe(true);
    expect(app.shows("id:s_vid_fallback:unsafe_vid:player")).toBe(false);
    expect(app.shows("text:Blocked Clip")).toBe(true);
    expect(
      app.shows("text:Video unavailable: invalid or unsupported URL."),
    ).toBe(true);

    // Remote URL under host-only capabilities stays mounted without crashing.
    expect(app.shows("id:s_vid_fallback:remote_vid")).toBe(true);
    expect(app.shows("label:Remote Clip")).toBe(true);
  });
});
