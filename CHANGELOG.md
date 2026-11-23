# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
