# a2ui-nsh

An [A2UI 1.0](https://a2ui.org/) renderer for [Native Shell (`nsh`)](https://github.com/longbridge/nsh). It turns declarative A2UI JSON messages into native TSX controls, so an agent can describe an interface without sending executable UI code.

The project includes a zero-dependency TypeScript protocol core, an `nsh` signal-store bridge, a TSX renderer, all 18 Basic Catalog v1 components, upstream conformance tests, and an ERP Customers example.

## Status

Version 0.1.0 implements A2UI 1.0 against `nsh` 0.7.2. Headless tests, the pinned Google A2UI C1–C6 conformance suites, and automated macOS, TUI, and Web/WASM checks pass. The conformance scope and documented skips are listed in [`docs/conformance.md`](docs/conformance.md).

Verification currently covers macOS AppKit, terminal TUI, and Web/WASM. Other platforms supported by `nsh` are not verified by this project.

## Basic Catalog components

All 18 A2UI Basic Catalog v1 components are implemented:

- Display and layout: `Text`, `Image`, `Icon`, `Row`, `Column`, `Card`, `Divider`
- Collections and navigation: `List`, `Tabs`, `Modal`
- Inputs and actions: `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `DateTimeInput`, `Slider`
- Media: `Video`, `AudioPlayer`

The protocol core also implements the 14 standard Basic Catalog functions and `@index`, data binding and expressions, validation, actions, renderer/agent function calls, and multiple catalogs.

## xlarge catalog components

xlarge, an ERP, sends its screens against its own A2UI 1.0 catalog
(`tech.yerly.xlarge/v1`). `src/catalog/xlarge/` draws 13 of its 22
components: the four its `crm.deals` screen uses (`Card`, `Field`, `Form`,
`Table`) and `Text`, `Toast`, `Refusal`, `Image`, `QrCode`, `Columns`,
`Detail`, `Metric`, and `ChequeLeaf`. Register them
with `registerXlargeCatalogComponents(registry, { translate })` and register
xlarge's catalog definition on the store. Coverage per catalog is in
[`docs/catalog-parity.md`](docs/catalog-parity.md).

## Targets and known limits

### macOS desktop

The ERP Customers example runs as a native AppKit application with `--target macos`. Its automated walk covers desktop and compact layouts, editing, validation, saving, deletion, and loading/empty/error states.

### Terminal TUI

The 18-component suite and ERP example run with `--target tui`. Terminal audio and video playback are unavailable, so `Video` and `AudioPlayer` show text fallback cards. Small canvas-based icons are omitted by the TUI renderer; icon-only buttons use their accessibility labels instead. `nsh` does not provide a TUI packaging target.

### Web/WASM

The component and ERP suites run in headless Chrome, Edge, or Chromium with `--target web`. The ERP example can also be packaged as a static site.

Known limits:

- `nsh test --target web` rejects the test-only `open(..., { host: { handlers } })` API with `ERR_NSH_TEST_UNSUPPORTED`. The Web and TUI suites therefore omit `host.handlers`; those assertions remain covered by the headless tests.
- The default manifests grant no network or audio capability. Remote media requires explicit `nsh` network/audio permissions, and packaged sites use a strict `connect-src 'self'` Content Security Policy. Denied media requests fail closed and `Video`/`AudioPlayer` render a fallback instead of crashing.
- Browser autoplay rules require a user gesture. Video starts paused and audio plays only after an explicit press.
- The packaged ERP example uses its local in-app agent; it does not include a backend transport.

## Install

Prerequisites:

- [`nsh` 0.7.2](https://github.com/longbridge/nsh)
- [`just`](https://github.com/casey/just) 1.29.0 or newer
- Git, to fetch the external A2UI conformance suites

No Node.js or npm packages are required.

Install the pinned `nsh` release on macOS or Linux using the official installer:

```bash
curl -fsSL https://nsh.dev/install.sh | NSH_VERSION=v0.7.2 sh
```

For TUI and Web development, install the corresponding runtimes once:

```bash
nsh component add tui
nsh component add web
```

`just test-tui` also requires `jq`. `just test-web` requires Chrome, Edge, or Chromium.

## Development tools

The project is built on tools that are not shipped with it. Their licenses are
compatible with this repository's Apache-2.0 license:

| Tool | Version | Role | License |
|---|---|---|---|
| [`nsh`](https://github.com/longbridge/nsh) | 0.7.2 (pinned) | Native runtime, TSX toolchain, and test runners | Apache-2.0 |
| [`just`](https://github.com/casey/just) | 1.29.0 or newer | Task recipes | CC0-1.0 |
| [`gitleaks`](https://github.com/gitleaks/gitleaks) | 8.30.1 (pinned) | Secret scanning through the pre-commit hook | MIT |
| [`jq`](https://github.com/jqlang/jq) | 1.8.2 (tested) | JSON checks in the TUI test recipe | MIT |

Licenses were verified from the license files shipped with the installed
releases. `gitleaks` runs from [`.pre-commit-config.yaml`](.pre-commit-config.yaml);
install `pre-commit` and run `pre-commit install` to enable the hook.

## Quick start

Clone the repository and run the headless checks:

```bash
git clone <repository-url> a2ui-nsh
cd a2ui-nsh
just check
just test
```

Fetch the upstream conformance checkout, then run the conformance suite:

```bash
git clone https://github.com/google/A2UI target/refs/google-A2UI
just conformance
```

`just conformance` requires the checkout at `target/refs/google-A2UI` to be at the commit pinned by `a2ui_conformance_pin` in the Justfile. On a mismatch it refuses and prints the `git fetch` and `git checkout` command that fixes it. From a git worktree with an empty `target/`, it falls back to the main checkout's `target/refs/google-A2UI`.

To use a different A2UI checkout, pass its path as `just conformance /path/to/google-A2UI` or set `A2UI_CONFORMANCE_ROOT`; an explicit path must also be at the pin.

## Run the ERP Customers example

The example in [`examples/erp-customers/`](examples/erp-customers/) is a searchable customer list and tabbed edit form driven by A2UI JSON. It includes live validation, a delete-confirmation modal, and loading, empty, and error states. Its records are invented and changes stay in the running app.

macOS:

```bash
nsh run examples/erp-customers --target macos
```

Terminal:

```bash
just run-tui
```

Web development server:

```bash
just run-web
```

Build the static Web/WASM site into `target/erp-web/`:

```bash
just package-web
```

See the [ERP Customers guide](examples/erp-customers/README.md) for manual walkthroughs and target-specific controls.

## Build and test

```bash
just check       # Type-check the library, tests, and examples
just test        # Run headless unit, component, and example tests
just conformance # Run the pinned upstream C1-C6 suites
just test-tui    # Run the component and ERP suites on the TUI target
just test-web    # Run the component and ERP suites in a headless browser
```

Additional verification commands:

```bash
just build       # Build release bytecode for the library and ERP example
just walk-macos  # Run the native macOS walk and save screenshots
just package-web # Package the static web example and verify its CSP
```

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow and
[`AGENTS.md`](AGENTS.md) for setup, code layout, and A2UI conformance rules.

## Documentation

- [Architecture](docs/architecture.md): module boundaries, catalog coverage, targets, and sandbox behavior
- [Conformance](docs/conformance.md): suite coverage, skips, manifests, and compatibility checks
- [ERP Customers](examples/erp-customers/README.md): example architecture and walkthroughs

## Acknowledgements

- [Native Shell (`longbridge/nsh`)](https://github.com/longbridge/nsh) provides the native runtime, reactive store, TSX components, and target hosts.
- The [A2UI specification](https://a2ui.org/) defines the agent-to-renderer protocol and Basic Catalog.
- [Google's A2UI conformance suite](https://github.com/google/A2UI) provides the language-independent YAML tests used by this project.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
