# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

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
