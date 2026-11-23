# AGENTS.md

Guidance for contributors and AI agents working on a2ui-nsh. Read
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.

## Setup

Install `nsh` 0.6.1 (the version pinned in `docs/upstream.toml`) with the
official installer, plus `just` 1.29.0 or newer:

```bash
curl -fsSL https://nsh.dev/install.sh | NSH_VERSION=v0.6.1 sh
```

No Node.js or npm install is required. For the optional target checks, add the
runtimes once with `nsh component add tui` and `nsh component add web`.

## Test

Run these from the repository root:

```bash
just check
just test
```

`just test` is the required local test command. Use `just conformance` for the
upstream A2UI suites, and `just test-tui` or `just test-web` only when a change
affects those targets.

## Code layout

- `src/core/` — pure TypeScript A2UI 1.0 protocol core. No `nsh`, DOM, or I/O
  imports.
- `src/store/` — `nsh` signal store bridging processed messages to views.
- `src/renderer/` — `<A2uiSurface>`, component registry, accessibility, and
  sandbox seams.
- `src/catalog/basic/` — all 18 Basic Catalog v1 components and their tests.
- `src/catalog/xlarge/` — xlarge's own catalog (`tech.yerly.xlarge/v1`):
  `Card`, `Field`, `Form`, `Table`, `Text`, `Toast`, `Refusal`, `Image`,
  `QrCode`; xlarge's catalog definition is its own.
- `tests/fixtures/` — real messages from consumers (xlarge's `crm.deals`) and
  synthetic ones (`*-synthetic.json`) where no real screen is captured yet.
- `tests/conformance/` — upstream YAML conformance harness.
- `tests/targets/` — shared suite for the real TUI and Web targets.
- `examples/erp-customers/` — end-to-end demo application.

## A2UI conformance

- Target A2UI 1.0 and Basic Catalog v1; do not invent protocol fields or
  component props.
- Keep the core pure and deterministic: inject clocks, timers, URL opening,
  and transports through documented seams.
- Preserve JSON Pointer, data-binding, expression, validation, action, and
  surface-lifecycle semantics; add tests for every behavior change.
- Keep the runtime dependency-free; do not add npm packages.
- Run `just check` and `just test` before committing. Changes that touch the
  protocol must also keep `just conformance` green.
- Update `docs/` in the same change when commands, behavior, or supported
  targets change.
