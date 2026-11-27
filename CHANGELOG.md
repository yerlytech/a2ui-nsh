# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `examples/xl-phones/` draws three fictional XL screens (the ERP Customers list and edit form, an xlarge registration `Form`, and an xlarge `Card` summary) on the iOS simulator and the Android emulator. `just run-ios` / `just run-android` boot a device when needed and shut it down after; `phone_walk.test.tsx` covers touch, typing, a single Save tap and a touch scroll, with small screenshots in `docs/assets/phones/`.
- `MessageProcessor.addCatalog(catalog)`, as A2UI 1.0 defines it
  (google/A2UI #3304): a catalog added after the processor is built serves
  later `createSurface` messages only; a surface keeps the catalogs it was
  created with, and an ID the processor already holds is refused with
  `A2uiCatalogError`. `just conformance` now runs `core/add_catalog.yaml`
  (28/28 suites, 715 cases passed).

### Fixed

- The phone app pads for the safe area (notch and home indicator), and the form `Scroll`s set `keyboardShouldPersistTaps="handled"` so the first Save tap after typing is not swallowed. xlarge `Detail` clamps a long value to one line with an ellipsis instead of breaking an address mid-word (`src/catalog/xlarge/Detail.tsx`).
- A `createSurface` `metadata`, `callRendererFunction` `callFunction.args`,
  and an `agentFunctionResponse` `value` are now held to the global depth
  limit (50) counted from the message root, as A2UI 1.0 does (metadata and
  the response value sit at depth 2, `args` at depth 3). One container past
  the limit is refused with `RECURSION_LIMIT_EXCEEDED`; scalars are never
  refused. Before, they carried no JSON depth check of their own. Nested
  `@call`s in `args` now meet this limit before the RPC call depth (32).

### Changed

- Runs on `nsh` 0.7.2 (was 0.7.1): every pin, the install line, and CI
  move to 0.7.2. The measured `nsh` gaps in `docs/architecture.md` are
  re-checked on 0.7.2; the two changes expected for this move (a `Video`
  `poster`, #3398, and component hosts taking the view accessibility props,
  #3408) are not in the installed v0.7.2 build, so `BasicVideo` keeps its
  `<Image>` poster overlay and the accessibility wrapper stays, now pinned
  by `src/catalog/basic/measured/host_a11y.test.tsx`. Headless `just test`
  (1241 tests) and `just build` pass; `just lint` (TypeScript 7 download),
  `just conformance` (absent `google/A2UI` checkout), and the `tui` / `web`
  suites (runtimes not installed) could not run in the measuring environment,
  as recorded in `docs/conformance.md`.
- The `tui` and `web` real-target suites run green on `nsh` 0.7.2
  (`just test-tui`, `just test-web`). Steps on a real target cost real
  display frames, so the catalog forms test and the ERP TUI walk steps take a
  90 s timeout instead of the 30 s default; no step or check changed. Gaps 10,
  11, 14, 15 and 16 in `docs/architecture.md` record what 0.7.2 shows on
  those targets.
- The conformance harness reads the upstream suites and writes the
  executed-case manifest from the `nsh test` VM itself, with its own
  `fs/promises` and `process.env`; the headless `platform: "macos"` bridge
  app (`tests/conformance/App.tsx`) and its `conformance.*` host grant are
  removed. `just conformance` passes the same cases and writes the same
  manifest records.
- The `nsh` notes measured only on 0.6.1 are re-measured headless on 0.7.1
  (2026-11-27). Presses still reach only the innermost pressable view,
  `DatePicker` / `TimeField` still drop `""` and timezone suffixes, and
  `<List horizontal>` still needs a fixed height; each now has a regression
  test under `src/catalog/basic/measured/`. The outer `nsh test` VM is no
  longer `Os::Web` (it reports `ios` and reads granted files itself); the
  conformance bridge app stays until a separate change removes it. The TUI
  `List` clipping note is not re-measured (no 0.7.1 `tui` runtime here).
- Follows `google/A2UI` `36725ee` (was `496df0e`, measured 2026-11-27):
  the pin, CI, and the clone line move; `just conformance` passes 712 cases
  (was 705), 51 documented skips. Nested function calls no longer have a
  depth limit of their own (`ValidationConfig.maxFunctionCallDepth` is
  removed); the global depth limit of 50 bounds them, counted from the
  message root for components. `callRendererFunction` now rejects, with
  `INVALID_FUNCTION_CALL`, a call whose nested `@call` or `${...}` template
  reaches a `rendererOnly` function or one that needs a user gesture, and
  checks static nested calls before any argument runs.
  `MessageProcessor.addCatalog` (`core/add_catalog.yaml`) is known and not
  yet followed (`docs/conformance.md`).

- Runs on `nsh` 0.7.1 (was 0.7.0): every pin, the install line, and CI move
  to 0.7.1. None of its 23 commits changes what `a2ui-nsh` draws: no `List`
  or table is kept under `display: none` (#3193), and the web part gates
  (#3238), nshm reading (#3225, #3232), and macOS scroll-indicator (#3192)
  and nested run-loop (#3191) fixes reach no code here. The measured `nsh`
  gaps in `docs/architecture.md` are re-checked on 0.7.1; none moves.
- Runs on `nsh` 0.7.0 (was 0.6.1): every pin, the install line, and CI move
  to 0.7.0, and the measured `nsh` gaps in `docs/architecture.md` are
  re-measured.
- Live regions use `nsh` 0.7's plain `accessibilityLiveRegion` prop, which
  the screen reader reads on Android, macOS, Windows, Linux, and the web;
  `useLiveRegionAnnouncement` announces only where the platform does not
  (iOS, the terminal), so nothing is heard twice. New exports
  `mapNativeLiveRegion`, `liveRegionReadingFor`, `NativeLiveRegion`, and
  `LiveRegionReading`; `mapAndroidLiveRegion` is deprecated.
- `just conformance` runs its suites one at a time (`nsh test --jobs 1`), so
  the executed-case manifest keeps every suite's records.

### Added

- Renderers for xlarge's own A2UI 1.0 catalog (`tech.yerly.xlarge/v1`):
  `Card`, `Field`, `Form`, and `Table`, enough to draw its `crm.deals` screen,
  with a `translate` seam for its i18n codes (spec 003).
- xlarge's `Text`, `Toast`, `Refusal`, `Image`, and `QrCode` (spec 003,
  round 2), with renderer options `toastMs`, `backLabel`, `dismissLabel`, and
  a pure QR encoder (`encodeQr`, no new dependency).
- xlarge's `Columns` (side by side when wide, stacked when narrow), `Detail`
  (its `update` sends the edit action), `Metric` (value and change formatted
  from text, coloured by `better`), and `ChequeLeaf` (states through
  `translate`) (spec 003, round 2), with the renderer option `editLabel`.
- xlarge's `Chart` (a sparkline, line, bars, or donut on a `Canvas`, values
  and an exact `sum` from text; a table in a terminal), `Calendar` (the month
  `calendar.month` answers, its items opening their own screens), and
  `Conversation` (a record's talk: write, tell, react, take back) (spec 003,
  round 2), read as xlarge's screens and server send them, with the renderer
  options `terminal`, `weekdayLabels`, and `monthLabels`.
- `NodeResolver.dispatchNodeAction` to send an action payload on behalf of a
  node (spec 003).
- `docs/catalog-parity.md`: components drawn per catalog.
- `just test` also runs `tests/fixtures/`.
- Tests for `nsh` 0.7: the deepest tree the validator allows stays under the
  1024 view limit, Modal's backdrop closes on a press at its corner, and Card's
  label and description read through `app.accessibility()`.

## [0.1.0] - 2026-11-23

First release.

### Added

- A2UI 1.0 protocol core in zero-dependency TypeScript: data model and RFC 6901
  pointers, expressions, catalog registry, message processor, validator, all 14
  Basic Catalog functions plus `@index`, actions, and renderer/agent function
  routing (spec 001).
- An `nsh` signal-store bridge, a TSX renderer, and all 18 Basic Catalog v1
  components, including `Slider`, `Video`, and `AudioPlayer` (specs 001 and 002).
- Upstream YAML conformance harness for the pinned `google/A2UI` C1-C6 suites,
  with an executed-case manifest and a documented skip list (specs 001 and 002).
- 18-component real-target suites for headless, macOS AppKit, TUI, and Web/WASM,
  plus a static Web package for the ERP example (spec 002).
- ERP Customers example driven by A2UI JSON, with search, tabbed edit form,
  validation, delete confirmation, and loading, empty, and error states
  (spec 001).
- Weekly compatibility build against the latest `nsh` release (spec 001).
- `MessageProcessor` seam for a future Rust core (specs 001 and 002).
