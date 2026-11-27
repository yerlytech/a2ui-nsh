# Architecture

`a2ui-nsh` renders A2UI v1.0 JSON envelopes on Native Shell (`longbridge/nsh`, measured on `0.7.1`) with zero runtime npm dependencies. Every boundary keeps the protocol core pure and isolates platform UI and I/O at the edges.

## Layer Boundaries

```text
Agent (A2UI v1.0 JSON envelopes over host channel)
  │
  ▼
src/core/          Pure TypeScript (zero nsh, DOM, or I/O imports)
  ├── pointer.ts          RFC 6901 JSON Pointer parsing, encoding, scope resolution, limits
  ├── data_model.ts       Structural-sharing DataModel, DataContext, touched-path change sets
  ├── expression.ts       ${...} template parser, @@ unescaping, UAX #31 identifier checks
  ├── json_schema.ts      Self-contained JSON Schema Draft 2020-12 validator
  ├── v1_0_schemas.ts     Embedded A2UI v1.0 protocol & Basic Catalog v1 schemas
  ├── catalog.ts          Catalog loader/deriver, CatalogRegistry, composition constraints
  ├── validator.ts        PayloadValidator (strict/permissive), depth/cycle/topology checks
  ├── processor.ts        MessageProcessor (surface lifecycle, out-of-order buffering, errors)
  ├── functions/          14 Basic Catalog v1 functions + @index, safe regex dialect, CLDR pluralize, TR35 formatDate
  ├── rpc.ts              RpcManager (callRendererFunction / callAgentFunction, caching, cancellation)
  ├── actions.ts          Dispatch-time context/userMessage evaluation, action metadata checks
  └── resolver.ts         Reactive NodeResolver, ComponentNode graph, template identity preservation
  │
  ▼
src/store/         Native Shell reactive bridge
  └── surface_store.ts    A2uiStore & SurfaceSignalStore wrapping nsh signal() graph
  │
  ▼
src/renderer/      Framework shell & catalog dispatch
  ├── A2uiSurface.tsx     Root surface component, node dispatcher, binding unwrappers
  ├── registry.ts         ComponentRegistry (catalogId + componentType -> TSX renderer)
  └── accessibility.ts    @accessibility.{label,description,live,hidden} normalization, live regions & announcements
  │
  ▼
src/catalog/basic/ Basic Catalog v1 TSX components (all 18 of 18)
  ├── Display & layout:   Text (+ markdown.ts, optional @metadata.extensions truncation),
  │                       Image (+ media_url.ts), Icon (+ icon_paths.ts, 59 named icons),
  │                       Row, Column (+ layout_helpers.ts), Card, Divider
  ├── Collections & nav:  List, Tabs, Modal
  ├── Interactive inputs: Button, TextField, CheckBox, ChoicePicker, DateTimeInput (+ datetime_helpers.ts,
  │                       validation_feedback.tsx), Slider
  └── Media:              Video, AudioPlayer (paused-by-default / user-gesture playback, degraded fallbacks)
  │
src/catalog/xlarge/ xlarge's own catalog (tech.yerly.xlarge/v1): Card, Field, Form, Table, Text, Toast, Refusal, Image, QrCode, Button, Confirm, Preview, Columns, Detail, Metric, ChequeLeaf, Wizard, Steps, Arrange, Chart, Calendar, Conversation (22 of 22, spec 003)
  ├── model.ts            pure helpers: field controls, options, held values, cell formats, event payloads
  └── context.ts          renderer options (translate seam) and the Form draft context
```

### Key Seams

1. **Multi-catalog extension seam (for `xlarge` and other domain catalogs):**
   - `CatalogRegistry` registers JSON catalog definitions by `catalogId` and enforces A2UI v1.0 resolution order: explicit component `@catalogId` / function `catalogId` → surface `catalogId` → error (no implicit fallback).
   - `ComponentRegistry` maps `(catalogId, componentType)` to TSX component renderers; custom domain components render alongside Basic Catalog components on the same surface.
   - `NodeResolver.dispatchNodeAction(node, payload)` sends an A2UI action payload on behalf of a node, for catalogs whose components name their actions in plain string properties (xlarge's `submit`, `rowAction`); it is the same path a resolved `Action` property takes.
   - `FunctionRegistry` supports registering custom domain functions scoped by `catalogId`, `allowedCallers`, and `requiresUserActivation`.
2. **Future Rust core seam:**
   - `src/core/` has zero `nsh` imports and sits behind `MessageProcessor` and `NodeResolver`. Keeping the protocol core in pure TypeScript preserves stock `.nshpkg` OTA delivery, cross-platform stock hosts across all 8 `nsh` targets, and QuickJS heap/CPU/node sandboxing; a Rust core can still be swapped behind the same seam later without rewriting catalog components.
3. **Injected side-effect seams:**
   - Clock (`nowIso`), timers, URL opening (`openUrl` with `requiresUserActivation` enforcement), and agent transport enter through typed callbacks rather than ambient globals.

## Basic Catalog v1 Coverage

All **18 of 18** Basic Catalog v1 components are shipped (Spec 001 + Spec 002 Slice 1b), each with a dedicated `*.test.tsx` covering rendering, bindings/interactions, `@checks` validation (where `Checkable`), capability-denial/fallback handling (`Video`, `AudioPlayer`), and `@accessibility`:

- **Display & layout (7):** `Text`, `Image`, `Icon`, `Row`, `Column`, `Card`, `Divider`.
- **Collections & navigation (3):** `List`, `Tabs`, `Modal`.
- **Interactive inputs (6):** `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `DateTimeInput`, `Slider`.
- **Media (2):** `Video`, `AudioPlayer`.
- **Standard functions (14 + `@index`):** `required`, `regex`, `length`, `numeric`, `email`, `formatString`, `formatNumber`, `formatCurrency`, `formatDate`, `pluralize`, `openUrl`, `and`, `or`, `not`, plus system `@index`.

## Real Targets, Walks & Packaging (macOS, TUI, Web/WASM)

One TSX codebase renders across `nsh`'s headless engine, macOS AppKit (`--target macos`), terminal ratatui (`--target tui`, `platform.idiom === "terminal"`), and Web/WASM (`--target web`, `platform.os === "web"`) without per-target widget rewrites:

- **18-component real-target suite (`tests/targets/`):** `tests/targets/catalog.target.test.tsx` (with minimal `App.tsx`, `nsh.json`, and `tsconfig.json`) exercises all 18 Basic Catalog v1 components without `host.handlers`, so the exact same suite runs headless, on `--target tui`, and on `--target web`. The same `App.tsx` also registers the xlarge renderers and takes xlarge's catalog definition from `host.params.catalog`; `tests/targets/xlarge.target.test.tsx` reorders and hides xlarge `Arrange` items with the keyboard alone (Tab, Enter, Space) on both targets.
- **TUI target (`just test-tui`, `just run-tui`):** Requires `nsh component add tui` (and `jq` to render plain-text cell grids). `examples/erp-customers/tui.test.tsx` walks all 7 ERP flows plus Step 8 media showcase (`Slider`, `Video`, `AudioPlayer`) at wide (`120×40` cells = `960×640` pt → `desktop` side-by-side) and compact (`80×24` cells = `640×384` pt → `compact` stacked) terminal grids, asserting `nsh-tui-cells` JSON snapshots saved under `target/walk-tui/` (with `*.txt` renders). Because `nsh package` has no TUI target, prebuilt bundles run via `nsh-tui-host --bundle target/erp-release/bundle.js`.
- **Web/WASM target (`just test-web`, `just run-web`, `just package-web`):** Requires `nsh component add web` (supported browsers: Safari 16.4+, Chrome/Edge 97+, Firefox 108+).
  - `examples/erp-customers/web.test.tsx` runs in headless Chrome/Edge/Chromium at desktop (`1280×800`) and phone/compact (`390×844`) viewports across all 7 ERP flows plus Step 8 media showcase, saving PNG screenshots under `target/walk-web/`.
  - `just package-web` runs `nsh package examples/erp-customers --target web --out target/erp-web` to produce a self-contained static site under `target/erp-web/ERP Customers/` (`index.html`, `manifest.webmanifest`, WASM/JS assets) and verifies the strict `connect-src 'self'` CSP meta tag.
- **Web target limitations:**
  - `just test-web` (`nsh test --target web`) requires Chrome, Edge, or Chromium installed on the host.
  - The packaged ERP demo runs its in-app local A2UI agent with no `web.host` backend bridge yet.
  - Packaged web output enforces strict CSP (`connect-src 'self'`, compatible with `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; base-uri 'none'`). Under default `"capabilities": { "host": ["a2ui.*"] }`, outbound network and media requests are blocked by both the `nsh` capability sandbox and CSP, and `Video` / `AudioPlayer` degrade cleanly without crashing.
  - Browsers block unmuted `<video>` autoplay and reject `AudioPlayer.play()` with `"not-allowed"` prior to a user gesture; `BasicVideo` starts paused and `BasicAudioPlayer` plays only on explicit user press.
  - `nsh test --target web` (and `--target tui`) reject `open(..., { host: { handlers } })` with `ERR_NSH_TEST_UNSUPPORTED`, so real-target suites omit `host.handlers` while `host.handlers` assertions remain in headless `just test`.

## Security & Capability Sandbox

- **Fail-closed protocol guards:** Explicit caps on JSON nesting depth (counted from the message root, as A2UI 1.0 does), JSON Pointer array indices, expression length/depth, pending RPC count, and portable A2UI regex patterns (`<= 256` code points, rejecting backreferences, lookbehinds, named groups, `\p{...}`, and nested quantifiers before `RegExp` compilation).
- **Minimal `nsh` capabilities:** `nsh.json` and `examples/erp-customers/nsh.json` grant only `"capabilities": { "host": ["a2ui.*"] }`. `"audio": true` and `capabilities.network` remain opt-in (`src/renderer/media_test_harness/` isolates granted-media tests); unauthorized `fetch`, `fs`, `openUrl`, audio, and non-`a2ui.*` host messages fail closed with `ERR_ACCESS_DENIED` (verified by `src/renderer/sandbox.test.tsx`, `src/catalog/basic/AudioPlayer.test.tsx`, and `tests/conformance/c6_sandbox.suite.ts`), and `Video` / `AudioPlayer` render degraded status cards instead of crashing.
- **QuickJS hardening:** Release bytecode builds (`just build`) run inside `nsh`'s hardened QuickJS VM (`eval`/`Function` disabled, frozen prototypes, 256 MB heap, 2 s per-call CPU budget, 200,000 node limit).

## Measured `nsh 0.7.1` Gaps & Mitigations

First measured on `nsh 0.6.1 (2f51d86)` (full references in [`specs/001-a2ui-nsh-core-and-desktop.md`](specs/001-a2ui-nsh-core-and-desktop.md#3-core-choice-and-spike-findings) and [`specs/002-slice-1b-web-and-tui.md`](specs/002-slice-1b-web-and-tui.md#3-measurements-and-nsh-061-2f51d86-gaps)), re-measured on `nsh 0.7.0 (3f8ecd8)` against its generated types (`.nsh/types`) and the upstream source at tag `v0.7.0`, then checked on `nsh 0.7.1 (f78eace)` against `git log v0.7.0..v0.7.1` in the upstream source and the regenerated `.nsh/types`. 0.7.1 is a patch release: `git diff --stat v0.7.0..v0.7.1` changes no `.d.ts` file, no `nsh test` runner code, and no QuickJS code (`crates/nsh-engine` only in `shader.rs`), so no TSX type or headless test behavior below moves. Each item says whether 0.7.0 or 0.7.1 closes it and what shows it:

1. **`nsh/base` `ComponentHostProps` omits several accessibility props — still open.** 0.7.1 `ComponentHostProps` (`.nsh/types/nsh/types.d.ts`) still lists only class, style, test, tooltip, layout, pointer, file-drop, and `ref` props, so controls needing `accessibilityDescription`, `accessibilityElementsHidden`, or a live region (including `BasicSlider`) stay wrapped in a transparent `<View>` (`src/renderer/accessibility.ts`).
2. **`accessibilityLiveRegion` was Android-only in TSX — closed except on iOS and the terminal.** Since 0.7.0, `nsh` reads the plain `accessibilityLiveRegion` view prop on Android, macOS, Windows, Linux, and the web (#2816; the `nsh` 0.7 type no longer exports `LiveRegion`). `buildViewAccessibilityProps` emits the plain prop, and `useLiveRegionAnnouncement` calls `announce()` only where the platform does not read the region itself (iOS, `idiom === "terminal"`) or does not read an `assertive` alert as it appears (all but macOS and the web), so nothing is heard twice (`liveRegionReadingFor`, `src/renderer/accessibility.test.ts`). `assertive` still maps to `role="alert"`. 0.7.1 changes no live-region or `announce` code (`git diff v0.7.0..v0.7.1 -- crates` has no such line).
3. **`nsh/test` lacked accessibility-description and layout introspection — partly closed.** `app.accessibility()` now reports role, label, and description, and `app.layout()` reports geometry; `src/catalog/basic/Card.test.tsx` reads a Card's native label and description. Neither reports live regions or `accessibilityElementsHidden`, so adapter tests keep the `a2ui.a11y` snapshot mirror for those.
4. **QuickJS `Intl` lacks `Intl.PluralRules`, some locale date tables, and IANA timezones — still open.** 0.7.1 changes no QuickJS or `Intl` code. A headless probe on 0.7.0: `Intl.PluralRules` is `undefined`, `de-DE` month names format in English, and a named zone throws `RangeError` unless the app lists it in `nsh.json` `timeZones` (new in 0.7). `src/core/functions/locale.ts` and `date_format.ts` keep the deterministic CLDR plural rules and TR35 formatting.
5. **Startup warning under host-only capabilities — changed.** The `statusBar` warning is gone. Opening on macOS or Windows now logs `the application (...) is not granted` once, because since 0.7.0 every root gets an implicit main window whose desktop commands need `"application": true` (#2307); `just test` on 0.7.1 still logs it. iOS, Linux, and web opens log nothing. Harmless: the manifests stay host-only.
6. **Basic Catalog v1 defines 59 named icons — still open.** 0.7.1 ships no named icon component; `src/catalog/basic/icon_paths.ts` bundles all 59 SVG paths plus a fallback path rendered on `Canvas`/`Path2D`.
7. **`TextView` Markdown link/image disabling — mitigation kept.** Since 0.7.0, `MarkdownOptions.links` / `images: false` (#2999) show the text instead of a link for a Markdown string; `src/catalog/basic/markdown.ts` keeps its own A2UI-subset parser, which strips `link` and `image` nodes before rendering `<TextView document>`. Test harnesses still read `host.params` directly when no handlers are attached.
8. **Horizontal `List`, non-bubbling `Modal` trigger `onPress`, and center-only backdrop hit-testing — the last is closed.** `app.press(selector, { position })` now presses a point of a view, so `src/catalog/basic/Modal.test.tsx` closes the dialog by pressing the backdrop's corner (its center still rejects with `ERR_NSH_TEST_COVERED`). Re-measured headless on 0.7.1 (2026-11-27), so kept: a press on a `<View onPress>` or `nsh/base` `<Button>` inside a `<View onPress>` leaves the outer handler silent (`src/catalog/basic/measured/press_innermost.test.tsx`), so `BasicModal` exposes `ModalTriggerContext` for pressable triggers; a `<List horizontal>` of 40-high cells without a height lays out 0 high and mounts no cell, while `<Scroll horizontal>` grows to 40 (`measured/horizontal_list.test.tsx`), so horizontal `List` uses `<Scroll horizontal>`. Vertical `List` uses virtualized `<List viewport="parent">` on graphical targets and a plain column `<View>` on TUI; the TUI clipping is not re-measured (the 0.7.1 `tui` runtime is not installed here).
9. **`DatePicker` / `TimeField` ISO normalization, missing time bounds, and `AccessibilityRole` without `"textbox"` — partly closed.** `AccessibilityRole` now includes `"textbox"` and `"tabpanel"` (#2958, #2952), so `SnapshotAccessibilityRole` is plain `AccessibilityRole`; `BasicTextField` still leaves `role` unset on `<Input>` (headless `app.accessibility()` reports its label and no role). `TimeField` now has `min` / `max`; not adopted yet, so `src/catalog/basic/datetime_helpers.ts` still clamps time bounds and normalizes ISO 8601 strings. Re-measured headless on 0.7.1 (2026-11-27), the normalization is still needed: `DatePicker` and `TimeField` drop `""`, `Z`, and `+HH:MM` values with a `warn … expected …` line (no day selected; `00:00` shown), while `DatePicker` now also takes `YYYY-MM-DDTHH:MM` (`src/catalog/basic/measured/date_values.test.tsx`).
10. **`nsh.json` `"window"` requires `"application": true` — still open.** 0.7.1 `crates/nsh-core/src/core/mod.rs` still denies (its only 0.7.1 change is the `display: none` list skip, #3193) desktop commands on the main window without `application`; `examples/erp-customers/nsh.json` keeps strict host-only capabilities rather than widening privilege.
11. **`nsh test --target tui|web` rejects `host.handlers` (`ERR_NSH_TEST_UNSUPPORTED`) — still open.** The 0.7.0 `open()` docs list `host.handlers` among the options a target rejects, and 0.7.1 changes neither those docs nor the `nsh test` runner. Real-target suites (`tests/targets/catalog.target.test.tsx`, `examples/erp-customers/tui.test.tsx`, `examples/erp-customers/web.test.tsx`) omit `host.handlers`, while `host.handlers` suites remain in headless `just test`.
12. **`Slider` `step` semantics — still open.** 0.7.1 `SliderProps.step` still defaults to `1` (`0` = any value) rather than A2UI's division count `steps`; `BasicSlider` maps `steps` to `(max - min) / steps` (`0` when omitted) and clamps/snaps writes in `writeBinding()`.
13. **`Video` missing `poster` prop & silent headless denial; `AudioPlayer` synchronous capability check — `poster` still missing.** 0.7.1 types have no `poster` (`grep -rn poster .nsh/types` finds nothing); `BasicVideo` layers an `<Image>` poster overlay and validates URLs with `sanitizeMediaUrl()` up front; `BasicAudioPlayer` catches synchronous constructor `ERR_ACCESS_DENIED` / `unavailable` errors, renders a degraded banner, and calls `dispose()` in `cleanup()` (not re-measured).
14. **TUI media, icon, and packaging differences — packaging still open.** `nsh package --help` on 0.7.1 lists `ios`, `ios-simulator`, `android`, `linux`, `macos`, `windows`, and `web`, no TUI target; prebuilt bundles run via `nsh-tui-host`. Media and icon cells are not re-measured (the 0.7.1 `tui` runtime is not installed here): `BasicVideo` and `BasicAudioPlayer` render compact terminal fallback cards on `platform.idiom === "terminal"`, and icon-only buttons show their `accessibilityLabel`.
15. **Web autoplay gesture lock & single-line text truncation — kept, not re-measured.** Browsers block unmuted `<video>` autoplay and reject `AudioPlayer.play()` with `"not-allowed"` before a user gesture (`BasicVideo` defaults to `paused={true}`, `BasicAudioPlayer` plays only on press). `BasicText` supports optional `@metadata.extensions` (`nsh_numberOfLines`, `nsh_textOverflow`) so long single-line values such as customer e-mail addresses ellipsize (`…`) instead of breaking mid-word.
16. **`<Image>` and SVG data URIs — headless re-measured.** xlarge's `QrCode` draws its server's SVG as a `data:image/svg+xml` URI. `tests/targets/svg.target.test.tsx` passes in `just test` on 0.7.1; the TUI and Web runs await the 0.7.1 runtimes (on 0.6.1 Web loaded the SVG, 232×232, and TUI fired neither `onLoad` nor `onError`). `QrCode` falls back to its pure encoder on `onError` when `link` exists.
17. **The outer `nsh test` VM is `Os::Web` without native `fs/promises` — closed.** Re-measured headless on 0.7.1 (2026-11-27): the outer test VM reports `platform.os === "ios"` and its own `fs/promises` reads a file `capabilities.fs.read` grants, as apps opened with `platform: "macos"`, `"ios"`, or `"linux"` do; only an app opened with `platform: "web"` gets `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM`. The conformance harness no longer has its `platform: "macos"` bridge app (`tests/conformance/App.tsx` and its `conformance.*` host messages are removed): `ConformanceClient` (`tests/conformance/harness.ts`) reads the suites, lists `e2e/`, checks and rewrites the executed-case manifest with the test VM's own `fs/promises`, and takes `A2UI_CONFORMANCE_ROOT`, `A2UI_CONFORMANCE_MANIFEST`, and `PWD` from `process.env`. The runner `nsh.json` `just conformance` writes grants only `capabilities.fs.read` on the suite root and `target/`, `capabilities.fs.write` on `target/`, and those three `capabilities.process.env` names (an `fs` root must be a directory: a file path fails with `ENOTDIR`). `nsh test` and `nsh check` need an entry beside a directory's tests, so `tests/conformance/nsh.json` names `AdapterApp.tsx` as its `"entry"` and the runner gets an empty generated `App.tsx`.

### New in `nsh 0.7.0`

- **View depth limit (#2614):** an app whose views nest deeper than 1024 levels is stopped. The validator caps the component tree at `maxRecursionDepth` (50); `src/renderer/depth.test.tsx` renders 49 nested `Column`, `Row`, `Card`, `List`, `Button`, and `Tabs` containers around a leaf without reaching it.
- **Parallel test files (#2809):** `nsh test` runs test files at once by default; `just conformance` passes `--jobs 1` because every suite rewrites the one executed-case manifest.
