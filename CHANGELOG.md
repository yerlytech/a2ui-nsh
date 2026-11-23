# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- xlarge's `Chart` (bar, line, or pie on a `Canvas`, values and an exact
  `sum` from text; a table in a terminal), `Calendar` (a Monday-first month
  grid; a day press opens `screen` with its date), and `Conversation` (a
  message thread; a message press opens `screen` with its id) (spec 003,
  round 2), with the renderer options `terminal`, `totalLabel`,
  `weekdayLabels`, and `monthLabels`.
- `NodeResolver.dispatchNodeAction` to send an action payload on behalf of a
  node (spec 003).
- `docs/catalog-parity.md`: components drawn per catalog.
- `just test` also runs `tests/fixtures/`.

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
