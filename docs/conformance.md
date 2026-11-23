# Conformance & Compatibility

`a2ui-nsh` validates its protocol core and TSX adapter directly against upstream [`google/A2UI`](https://github.com/google/A2UI) language-agnostic YAML conformance suites (`conformance/core/*.yaml`, `conformance/adapter/markdown_subset.yaml`, `conformance/e2e/*.yaml`) at commit `496df0e76e2ad9aba4cc2a12abe066f43d4f171d` (Apache-2.0).

No upstream YAML suite files are copied into this repository; `just conformance` reads them from `A2UI_CONFORMANCE_ROOT` (default `target/refs/google-A2UI`) via `tests/conformance/` and a zero-dependency TypeScript YAML parser (`tests/conformance/yaml.ts`).

## Running Conformance Locally

Fetch the pinned upstream `google/A2UI` repository into `target/refs/google-A2UI` (the default path expected by the `conformance` recipe), then run `just conformance`:

```bash
# Fetch the pinned upstream google/A2UI conformance suites
git clone https://github.com/google/A2UI target/refs/google-A2UI && git -C target/refs/google-A2UI checkout 496df0e

# Uses target/refs/google-A2UI by default
just conformance

# Or point at another checkout of google/A2UI
just conformance /path/to/google-A2UI
```

`just conformance` writes an executed-case manifest in JSON Lines format to `target/conformance-manifest.jsonl` matching upstream `executed_case_manifest.schema.json`. Every skip list is strictly enforced: any stale skip entry fails the suite.

## Stage Coverage (C1–C6)

Measured on `nsh 0.6.1 (2f51d86)` against `google/A2UI` `496df0e`: **27/27 test suites pass** (`705` upstream cases passed, `0` failed, `51` documented skips across 29 YAML files, `0` adapter conformance skips, plus capability-sandbox denial tests).

| Stage | Runner file | Upstream suites |
|---|---|---|
| C1 — Foundations | `tests/conformance/c1_data_model.suite.ts`, `c1_expressions.suite.ts` | `core/data_model.yaml`, `core/data_model_pointers.yaml`, `core/data_deletion.yaml`, `core/data_context.yaml`, `core/expressions.yaml`, `core/reserved_keys.yaml` |
| C2 — Catalogs & schemas | `tests/conformance/c2_catalog.suite.ts` | `core/catalog.yaml`, `core/common_types.yaml`, `core/agent_to_renderer.yaml`, `core/composition_constraints.yaml` |
| C3 — Validation & processor | `tests/conformance/c3_processor.suite.ts` | `core/validator_v1_0.yaml`, `core/message_processor_v1_0.yaml`, `core/error_responses.yaml`, `core/multi_catalog.yaml` |
| C4 — Functions, actions & RPC | `tests/conformance/c4_functions.suite.ts`, `c4_actions_rpc.suite.ts` | `core/functions.yaml`, `core/index_function.yaml`, `core/validation_result.yaml`, `core/actions.yaml`, `core/rpc_functions.yaml`, `core/agent_function_routing.yaml` |
| C5 — Node resolution & scaling | `tests/conformance/c5_resolver_scaling.suite.ts` | `core/node_resolution.yaml`, `core/message_processor_scaling.yaml` |
| C6 — Adapter, a11y, markdown, e2e & sandbox | `tests/conformance/c6_adapter_a11y_e2e.suite.ts`, `c6_sandbox.suite.ts` | `core/adapter_conformance.yaml`, `core/accessibility.yaml`, `adapter/markdown_subset.yaml`, `e2e/*.yaml` (4 v1.0 scenarios), plus `ERR_ACCESS_DENIED` sandbox checks |

## Documented Skip List (51 Cases)

- **50 pre-1.0 protocol cases (`v0.8`, `v0.9`, `v0.9.1`):** Out of scope; `a2ui-nsh` targets A2UI v1.0 only (Spec 001 §Not doing).
- **1 equal-value rewrite case in `core/agent_function_routing.yaml`:** `DataModel` suppresses no-op equal-value notifications (matching `google/A2UI` Swift's documented divergence); unrelated-change re-dispatch is verified in core tests.
- **0 adapter conformance skips:** All 18/18 Basic Catalog v1 components (including `Slider`, `Video`, and `AudioPlayer`) pass `22/22` cases in `core/adapter_conformance.yaml`.

## Real-Target Verification (TUI & Web/WASM)

Beyond headless C1–C6 conformance, Spec 002 adds target-compatible suites (omitting `host.handlers`, which `nsh test --target tui|web` rejects with `ERR_NSH_TEST_UNSUPPORTED`) to verify all 18 Basic Catalog v1 components and `examples/erp-customers/` on real `nsh` targets:

| Target & recipe | Test / build scope | Prerequisites & notes |
|---|---|---|
| 18-component target suite (`tests/targets/catalog.target.test.tsx`) | Exercises all 18 Basic Catalog v1 components without `host.handlers` | Runs identically headless, on `--target tui`, and on `--target web` |
| xlarge target check (`tests/targets/xlarge.target.test.tsx`) | Reorders xlarge's `Arrange` items with Tab and Enter alone, then saves the new order | Runs on `--target tui` and `--target web` (part of `just test-tui` and `just test-web`) |
| SVG data URI probe (`tests/targets/svg.target.test.tsx`, app `SvgProbe.tsx`) | Whether `<Image>` draws the `data:image/svg+xml` URI xlarge's `QrCode` makes, with a PNG data URI as the control | Headless (part of `just test`), `--target tui` and `--target web`; Web loads it, headless and TUI load no picture at all |
| TUI (`just test-tui`, `just run-tui`) | Runs `tests/targets/catalog.target.test.tsx` + `tests/targets/xlarge.target.test.tsx` + `tests/targets/svg.target.test.tsx` + `examples/erp-customers/tui.test.tsx` at `120×40` (`desktop`) and `80×24` (`compact`) cells; writes `nsh-tui-cells` JSON and `*.txt` renders to `target/walk-tui/` | Requires `nsh component add tui` and `jq`; runs headless on Linux/macOS via in-memory ratatui terminal (no `nsh package` target for TUI) |
| Web/WASM tests (`just test-web`, `just run-web`) | Runs `tests/targets/catalog.target.test.tsx` + `tests/targets/xlarge.target.test.tsx` + `tests/targets/svg.target.test.tsx` + `examples/erp-customers/web.test.tsx` in headless Chrome/Edge/Chromium at `1280×800` (`desktop`) and `390×844` (`compact`); writes PNGs to `target/walk-web/` | Requires `nsh component add web` and a Chrome, Edge, or Chromium binary; supported browsers: Safari 16.4+, Chrome/Edge 97+, Firefox 108+ |
| Web/WASM packaging (`just package-web`) | Runs `nsh package examples/erp-customers --target web --out target/erp-web` and verifies `target/erp-web/ERP Customers/index.html`, `manifest.webmanifest`, and strict `connect-src 'self'` CSP meta tag | Requires `nsh component add web` (no browser required); packages the in-app local A2UI agent without a `web.host` backend bridge |

**Documented Web target limitations (Spec 002 T6):**
- Automated `--target web` tests require Chrome, Edge, or Chromium on the host; runners without a compatible browser skip `just test-web` while still running `just package-web`.
- Packaged static sites enforce strict CSP (`connect-src 'self'`, compatible with `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; base-uri 'none'`); under default `"capabilities": { "host": ["a2ui.*"] }`, outbound network and media requests fail closed and `Video` / `AudioPlayer` degrade gracefully.
- Browser autoplay policies block unmuted `<video>` autoplay and reject `AudioPlayer.play()` with `"not-allowed"` before a user gesture (`BasicVideo` starts paused; `BasicAudioPlayer` plays only on press).

## Weekly `nsh` Latest-Release Compatibility Check

Because `nsh` is pre-1.0 (`0.6.x`), `.github/workflows/nsh-weekly.yml` runs every Thursday at `06:00 UTC` (and on `workflow_dispatch`) on `ubuntu-24.04` with `permissions: contents: read` and no secrets:

1. Checks out `a2ui-nsh` and the pinned `google/A2UI` conformance suites (`actions/checkout` pinned by commit SHA).
2. Installs `just` via pinned `astral-sh/setup-uv` and downloads the latest `longbridge/nsh` Linux x86_64 release with SHA-256 verification.
3. Runs `just check`, `just test`, `just conformance`, and `just build` (both the library and `examples/erp-customers/`).
4. Installs the matching `tui` and `web` runtimes (`nsh component add tui`, `nsh component add web`) and runs target checks supported on `ubuntu-24.04`:
   - `just test-tui` (always runs via `nsh-tui-host`'s in-memory ratatui terminal and `jq`).
   - `just package-web` (always runs; verifies static site output and strict `connect-src 'self'` CSP without needing a browser).
   - `just test-web` (runs when Chrome, Edge, or Chromium is detected on the runner; explicitly skipped with a reason if no browser binary is installed).
   - `just walk-macos` (`--target macos`) is explicitly skipped in this workflow because AppKit requires a macOS runner.
5. Publishes a Markdown summary (including per-target outcomes and skip reasons) to `$GITHUB_STEP_SUMMARY`, uploads logs (`target/nsh-weekly/`), `target/conformance-manifest.jsonl`, and target walk snapshots (`target/walk-tui/`, `target/walk-web/`) as an artifact, and fails the run if any supported check regressed.

To run the headless check locally against the latest published `nsh` release without modifying your global `nsh` installation:

```bash
just nsh-check-latest
```
