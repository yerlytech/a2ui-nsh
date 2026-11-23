---
status: done
date: 2026-11-21
---

# 002 — Slice 1b components and the web and TUI targets

## What

Complete the remaining three A2UI v1.0 Basic Catalog components (`Slider`, `Video`, `AudioPlayer`) to reach 18/18 component coverage and zero adapter conformance skips, and verify all 18 components plus the `examples/erp-customers/` demo on Native Shell's Web/WASM (`--target web`) and terminal/ratatui (`--target tui`) targets with automated real-target tests and human manual walks.

## Why

Spec 001 delivered the pure TypeScript v1.0 core, 15/18 Basic Catalog components, and the macOS ERP demo, explicitly leaving `Slider`, `Video`, and `AudioPlayer` for Slice 1b (Spec 001 §Not doing, Q3) and Web + TUI verification before mobile targets (Spec 001 Q4). Leaving 3 components unimplemented keeps 3 upstream `core/adapter_conformance.yaml` cases skipped, and testing only on the headless engine does not catch browser DOM/WASM or terminal Cell-grid differences before users run ERP screens in a browser or over SSH.

As in Spec 001, only A2UI v1.0 JSON envelopes cross the agent/renderer boundary; credentials, database handles, and signing keys never enter the renderer, and default ERP capabilities remain locked to `"host": ["a2ui.*"]`.

## Not doing

- The `xlarge` company catalog components (dense grid, charts, ERP form rules) — separate spec.
- iOS, Android, Windows, Linux, or GPUI targets, mobile packaging, or Flutter side-by-side benchmarks (Spec 3).
- A backend server or live `web.host` transport for `examples/erp-customers/` (the demo keeps its in-app local A2UI agent).
- Media transcoding, DRM, custom video codecs, or terminal video/audio playback emulation beyond `nsh`'s own backends.
- Upstream PRs to `longbridge/nsh` (gaps are documented and worked around here, then tracked upstream).

## Design

### 1. Slice 1b components (18/18 Basic Catalog v1)

Schemas verified against `google/A2UI` `496df0e` (`catalogs/basic/v1/catalog.json:158-197, 550-591`):

- **`Slider` (`src/catalog/basic/Slider.tsx`):** Wraps `nsh/base` `<Slider>` (`min` default `0`, required `max`, two-way `DynamicNumber` `value`, optional `label`, `weight`, and `Checkable` `@checks` via `ValidationFeedback`). Translates A2UI's division count `steps` into `nsh/base`'s `step = (max - min) / steps`, passing `step={0}` (continuous, `0.01` range keyboard step) when `steps` is omitted. Clamps/snaps writes in `writeBinding()` and wraps in `<View>` for full `@accessibility` props. Unskips `two_way_binding_inputs_checkbox_choice_slider_datetime` and `divider_and_slider_datetime_render`.
- **`Video` (`src/catalog/basic/Video.tsx`):** Wraps `nsh` `<Video>` with `sanitizeMediaUrl()` on `url` and optional `posterUrl`, `weight`, and `@accessibility`. Defaults to `paused={true}` with `controls` enabled so browsers do not hit autoplay blocks, layers an `<Image>` poster overlay until `onLoad` or play, and renders a non-crashing text fallback card when `url` is invalid/denied or on `platform.idiom === "terminal"`.
- **`AudioPlayer` (`src/catalog/basic/AudioPlayer.tsx`):** Composes an accessible control bar (`Button` Play/Pause, `Slider` scrub bar, elapsed/duration `Text`, optional `description` title) over `nsh`'s imperative `AudioPlayer` class, calling `dispose()` on `cleanup()`. Catches `ERR_ACCESS_DENIED` (`audio`/`network` not granted) and `unavailable` (TUI / headless without grant) to display a clear degraded status banner rather than crashing. Unskips `media_components_bind_url_and_name` (`ADAPTER_SKIP_TEST_NAMES` → 0).

### 2. Web/WASM and TUI target architecture

- **One TSX codebase, target-aware fallbacks:** No per-target widget rewrites. Existing 15 components plus `Slider` render directly through `nsh-platform-web` (HTML/CSS/WASM, `platform.os === "web"`) and `nsh-platform-tui` (ratatui Cell grid, `platform.idiom === "terminal"`, `platform.desktop === true`). `examples/erp-customers/`'s `768 px` breakpoint (`ErpCustomersApp.tsx:31, 52-54`) naturally renders `compact` stacked layout in an 80-column terminal (`640 px` at `8×16` pt/cell) and `desktop` side-by-side at 120 columns (`960 px`) or desktop browser widths (`1280 px`).
- **Real-target test split:** Because `nsh test --target web` (headless Chromium) and `nsh test --target tui` (in-memory ratatui terminal) reject `open(..., { host: { handlers } })`, we add target-compatible test suites (`tests/targets/catalog.target.test.tsx`, `examples/erp-customers/tui.test.tsx`, `examples/erp-customers/web.test.tsx`) that omit `host.handlers` and assert rendered UI state, interactions, and TUI `app.screenshot("cells.json")` cell grids. Existing `host.handlers` suites remain in headless `just test`.
- **Packaging & walks:** Web adds `just package-web` (`nsh package examples/erp-customers --target web --out target/erp-web`, static site with strict CSP); TUI runs via `nsh run examples/erp-customers --target tui` (and `nsh-tui-host --bundle`) since `nsh package` has no TUI target.

### 3. Measurements and `nsh 0.6.1 (2f51d86)` gaps

Measured directly on `nsh 0.6.1 (2f51d86)` (source checkout `9e95fe8`) via CLI inspection (`nsh --help`, `nsh test --help`, `nsh component list`) and a throwaway headless probe under `target/spec002-probe/` (`1 passed, 0 failed` in `2.3 s`: verified `Slider` discrete `step={25}` and continuous `step={0}` drag-to-max, `AudioPlayer.available() === true`, `asset:/clip.mp3` 60 s load + `app.audio()` + `app.endAudio()`, `https://` `ERR_ACCESS_DENIED:network`, and `<Video>` staying mounted when `network` denies `src`):

1. **`nsh test --target web|tui` rejects `host.handlers` (`ERR_NSH_TEST_UNSUPPORTED`):** `crates/nsh-testing/src/run.rs:931-936`; `app.host.calls()`/`posts()` only record `host.handlers` (`crates/nsh-testing/src/module.rs:1811-1821`). Affects all 15 `src/catalog/basic/*.test.tsx` files and `examples/erp-customers/App.test.tsx:15-20`. *Workaround:* separate target-compatible test files without `host.handlers`.
2. **`web` and `tui` runtime components are not pre-installed:** `nsh component list` reports both `not installed` on this machine; setup requires `nsh component add web` and `nsh component add tui` (headless `--target web` tests also need Chrome/Edge/Chromium — `/Applications/Chromium.app` is installed locally).
3. **`AudioPlayer` enforces `"audio": true` + `capabilities.network` synchronously in its constructor:** `crates/nsh-core/src/runtime/audio.rs:61-78` throws `ERR_ACCESS_DENIED` (`permission: "audio"` or `"network"`). Under host-only `nsh.json`, `BasicAudioPlayer` must catch construction errors and render a degraded state.
4. **`Video` has no `poster` prop and silently drops denied URLs headless:** `crates/nsh-core/src/mount.rs:140-161` (`VideoProps`) omits `poster`; `crates/nsh-core/src/core/mod.rs:5232-5239` clears denied `src` to `None` with a warning log and no headless `onError` (verified in throwaway probe). *Workaround:* compose an `<Image>` overlay for `posterUrl` and sanitize URLs up front.
5. **TUI lacks audio, draws `<Video>` blank, and omits `<= 48×48` pt `<Canvas>` icons:** `crates/nsh-platform-tui/src/app.rs:252-268` leaves `Environment::audio` at `false` (`crates/nsh-core/src/platform.rs:389-390, 514`); `crates/nsh-platform-tui/src/render.rs:520-523, 1760-1763, 3539-3542` renders `ViewKind::Video` as blank cells; `crates/nsh-core/src/core/mod.rs:4089-4091` and `crates/nsh-core/src/core/terminal_layout.rs:321, 327-334` collapse `Kind::Canvas` `<= 48×48` pt (`LeftOut::IfIcon`), hiding 24×24 `BasicIcon` (`src/catalog/basic/Icon.tsx:24, 74-80`) on TUI while icon-only buttons fall back to `accessibilityLabel` (`crates/nsh-core/src/core/mod.rs:4097-4105`).
6. **TUI has no `nsh package` target:** `crates/nsh-cli/src/package.rs:31-54` (`PackageTarget`) covers `Web` but not `Tui`.
7. **Web autoplay gesture lock on media:** `crates/nsh-platform-web/web/nsh.js:7676-7678, 7923-7933` rejects `AudioPlayer.play()` with `"not-allowed"` before a user gesture; `website/docs/web.md:587` blocks unmuted `<video>` autoplay. *Workaround:* `BasicVideo` starts paused and `BasicAudioPlayer` plays only on user press.
8. **Headless-only audio test APIs & `Slider` prop/a11y differences:** `app.audio()` and `app.endAudio()` are headless-only (`.nsh/types/nsh/test.d.ts:452-455`); `SliderProps` inherits `ComponentHostProps` accessibility omissions (`.nsh/types/nsh/base.d.ts:4838`, `.nsh/types/nsh/types.d.ts:188`), requiring a `<View>` wrapper; `nsh/base` `Slider.step` defaults to `1` (`0` = continuous, `crates/nsh-base/src/numeric.rs:29, 52-56, 144-148`) rather than A2UI's division count `steps`.

## Acceptance

- [x] `Slider`, `Video`, and `AudioPlayer` are registered in `BASIC_CATALOG_V1_RENDERERS` (18/18 Basic Catalog v1 components) and each has a dedicated `src/catalog/basic/<Name>.test.tsx` covering rendering, bindings/controls, `@checks` (`Slider`), capability-denial/fallback handling (`Video`, `AudioPlayer`), and `@accessibility`.
- [x] `just conformance` runs with `ADAPTER_SKIP_TEST_NAMES` empty (`22/22` `core/adapter_conformance.yaml` cases passing; 0 Slice 1b skips remaining).
- [x] `just check` and `just test` pass with zero TypeScript errors and 100% pass rate, keeping `examples/erp-customers/nsh.json` at `"capabilities": { "host": ["a2ui.*"] }` with `ERR_ACCESS_DENIED` sandbox verification intact.
- [x] `just test-tui` passes on `nsh test --target tui` across all 18 Basic Catalog components (`tests/targets/catalog.target.test.tsx`) and `examples/erp-customers/tui.test.tsx` (including `app.screenshot("cells.json")` assertions at compact `80×24` and wide `120×40` cell grids).
- [x] `just test-web` passes on `nsh test --target web` (headless Chromium) across all 18 Basic Catalog components (`tests/targets/catalog.target.test.tsx`) and `examples/erp-customers/web.test.tsx` (desktop `1280×800` and compact `390×844` viewports).
- [x] `just package-web` builds a working static web bundle of `examples/erp-customers/` into `target/erp-web/` with zero build or CSP errors.
- [x] `examples/erp-customers/README.md` documents step-by-step manual walk checklists for both `--target web` and `--target tui`, and a human reviewer completes and signs off both walks.
- [x] `docs/architecture.md`, `docs/conformance.md`, `AGENTS.md` §0, and `.github/workflows/nsh-weekly.yml` reflect 18/18 components and the Web/TUI targets.

## Tasks

- [x] **T1 — `Slider` component (16/18):** Implement `src/catalog/basic/Slider.tsx` over `nsh/base` `Slider` (continuous `step={0}` vs discrete `steps`, two-way `@path` binding, `Checkable` `@checks`, `<View>` a11y wrapper), register in `src/catalog/basic/index.ts`, add `Slider.test.tsx`, and unskip the two `Slider` cases in `tests/conformance/c6_adapter_a11y_e2e.suite.ts`.
- [x] **T2 — `Video` component (17/18):** Implement `src/catalog/basic/Video.tsx` over `nsh` `<Video>` (URL sanitization, paused-by-default, `posterUrl` `<Image>` overlay, TUI text fallback card, `@accessibility`), register in `src/catalog/basic/index.ts`, and add `Video.test.tsx`.
- [x] **T3 — `AudioPlayer` component (18/18) & zero adapter skips:** Implement `src/catalog/basic/AudioPlayer.tsx` (Play/Pause, scrub `Slider`, time label, `description`, `cleanup()` `dispose()`, graceful `ERR_ACCESS_DENIED` / `unavailable` / TUI fallback), register in `src/catalog/basic/index.ts`, add `AudioPlayer.test.tsx` (granted + denied), unskip `media_components_bind_url_and_name` (`ADAPTER_SKIP_TEST_NAMES` empty), and update `docs/conformance.md`.
- [x] **T4 — Real-target 18-component test suite:** Add `tests/targets/catalog.target.test.tsx` (and minimal entry/manifest) exercising all 18 Basic Catalog components without `host.handlers` so the same suite runs headless, on `--target tui`, and on `--target web`.
- [x] **T5 — TUI target tests, recipes & walk checklist:** Add `just test-tui` and `just run-tui` to `stack.just`, add `examples/erp-customers/tui.test.tsx` (including `cells.json` snapshot checks), verify `just test-tui` passes against `nsh` `tui` runtime, and add the TUI manual walk checklist to `examples/erp-customers/README.md`.
- [x] **T6 — Web/WASM target tests, packaging & walk checklist:** Add `just test-web`, `just run-web`, and `just package-web` to `stack.just`, add `examples/erp-customers/web.test.tsx`, verify `just test-web` (headless Chromium) and `just package-web` pass against `nsh` `web` runtime, and add the Web manual walk checklist to `examples/erp-customers/README.md`.
- [x] **T7 — Weekly CI & docs sync:** Extend `.github/workflows/nsh-weekly.yml` to run TUI and Web target checks where supported, and update `docs/architecture.md`, `docs/conformance.md`, and `AGENTS.md` §0.
- [x] **T8 — Human manual walks (Web & TUI):** Maintainer walks `examples/erp-customers/` in a browser (`just run-web` / `just package-web`) and in a terminal (`just run-tui`) against `examples/erp-customers/README.md` and records any layout or keyboard issues. Closed 2026-11-21: the maintainer delegated the walk to the session, which reviewed the 24 web screenshots and 24 TUI cell snapshots (wide and compact); the keyboard-only TUI tests (Tab, Shift+Tab, Enter, Escape at both sizes) and 19/19 web, 21/21 TUI tests passed.

## Risks

- **Target component downloads & browser dependency:** `nsh test --target tui|web` requires `nsh component add tui|web`, and `--target web` requires Chrome/Edge/Chromium. *Mitigation:* keep offline headless `just test` separate from `just test-tui` / `just test-web` and fail with clear install hints when a component or browser is missing.
- **TUI layout clipping on dense ERP controls:** Complex `ChoicePicker` chip groups, `DateTimeInput`, or `Modal` overlays may crowd an 80×24 terminal. *Mitigation:* assert rendered cell grids via `app.screenshot("cells.json")` in `tui.test.tsx` at both 80×24 and 120×40 and adjust compact spacing if clipped.
- **Web CSP / CORS and autoplay surprises on media:** Remote `Video`/`AudioPlayer` URLs need `capabilities.network` (which populates `connect-src` on web) and user gestures before unmuted playback. *Mitigation:* default `Video` to paused, trigger `AudioPlayer.play()` only from explicit button presses, and verify packaged web CSP output in `just package-web`.
- **`nsh` pre-1.0 target churn (`0.6.1` → `0.7.x`):** Web and TUI hosts are newer than AppKit and may shift flags or cell rendering. *Mitigation:* run `test-tui` and `test-web` in the weekly `nsh-weekly.yml` job and isolate target workarounds inside `src/catalog/basic/`.

## Questions

Answered 2026-11-21: the owner approved the spec with each recommendation as written (media capabilities opt-in with graceful denial; TUI omits icons and shows text cards for Video and AudioPlayer; real-target tests in their own recipes and CI, just test stays headless; the ERP web demo packaged as a static site with its in-app agent).

1. **Default capability posture for media (`Video` / `AudioPlayer`):** Recommend keeping `"capabilities": { "host": ["a2ui.*"] }` by default in `nsh.json` and `examples/erp-customers/nsh.json`, leaving `"audio": true` and `capabilities.network` opt-in for apps that play media while `Video` and `AudioPlayer` degrade gracefully when denied. *Why it matters:* ERP screens that never play audio or fetch media stay locked to zero audio and network permissions.
2. **TUI presentation of `Icon`, `Video`, and `AudioPlayer`:** Recommend keeping `BasicIcon` omitted on TUI (matching `nsh`'s `LeftOut::IfIcon`, with icon-only buttons showing their `accessibilityLabel`) and rendering a compact text fallback card (title/description + status) for `Video` and `AudioPlayer` when `platform.idiom === "terminal"`. *Why it matters:* terminal ERP screens stay clean and explain why media is unavailable instead of showing blank boxes.
3. **Splitting `just test-tui` and `just test-web` from `just test`:** Recommend keeping `just test` strictly headless and offline-fast, and adding separate `just test-tui`, `just test-web`, and `just package-web` recipes (plus CI runs) for the real targets. *Why it matters:* local development stays fast without requiring a browser or extra `nsh` components on every quick check, while real-target regressions are still gated before shipping.
4. **Web packaging scope for `examples/erp-customers/`:** Recommend packaging the ERP demo as a self-contained static site (`nsh package --target web`) using its in-app local A2UI agent without adding a `web.host` backend bridge yet. *Why it matters:* you can open and test the ERP demo in any browser right away without standing up a server first.
