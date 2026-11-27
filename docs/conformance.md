# Conformance & Compatibility

`a2ui-nsh` validates its protocol core and TSX adapter directly against upstream [`google/A2UI`](https://github.com/google/A2UI) language-agnostic YAML conformance suites (`conformance/core/*.yaml`, `conformance/adapter/markdown_subset.yaml`, `conformance/e2e/*.yaml`) at commit `36725eee042da90c526f469f94246f96e16fdc35` (Apache-2.0).

No upstream YAML suite files are copied into this repository; `just conformance` reads them from `A2UI_CONFORMANCE_ROOT` (default `target/refs/google-A2UI`) via `tests/conformance/` and a zero-dependency TypeScript YAML parser (`tests/conformance/yaml.ts`).

## Running Conformance Locally

Fetch the pinned upstream `google/A2UI` repository into `target/refs/google-A2UI` (the default path expected by the `conformance` recipe), then run `just conformance`:

```bash
# Fetch the pinned upstream google/A2UI conformance suites
git clone https://github.com/google/A2UI target/refs/google-A2UI && git -C target/refs/google-A2UI checkout 36725ee

# Uses target/refs/google-A2UI by default
just conformance

# Or point at another checkout of google/A2UI
just conformance /path/to/google-A2UI
```

`just conformance` writes an executed-case manifest in JSON Lines format to `target/conformance-manifest.jsonl` matching upstream `executed_case_manifest.schema.json`. Every skip list is strictly enforced: any stale skip entry fails the suite.

## Stage Coverage (C1–C6)

Measured on `nsh 0.7.1 (f78eace)` against `google/A2UI` `36725ee` (2026-11-27): **27/27 test suites pass** (`712` upstream cases passed, `0` failed, `51` documented skips across 29 YAML files, `0` adapter conformance skips, plus capability-sandbox denial tests). Against the previous pin `496df0e` the same run passed `705` cases; the 7 new ones are in `core/rpc_functions.yaml` (33 → 40). See [`google/A2UI` `36725ee`](#googlea2ui-36725ee-measured-2026-11-27).

## Results on `nsh 0.7.1` (2026-11-26, macOS arm64)

| Check | Result |
|---|---|
| `just lint` (`just check`) | Pass |
| `just test` | Pass: 101 test files, 1164 tests (1159 passed, 0 failed, 5 skipped), re-run 2026-11-27 |
| `just conformance` | Pass: 27/27 suites, 712 cases passed, 51 documented skips, 29 YAML files (`google/A2UI` `36725ee`, 2026-11-27) |
| `just build` | Pass: library and `examples/erp-customers/` bytecode bundles |
| `just walk-macos` | Pass: 16/16 tests, 24 screenshots in `target/walk-macos/` |
| `just test-tui` | Not run: the 0.7.1 `tui` runtime is not installed (`nsh component add tui`) |
| `just test-web`, `just package-web` | Not run: the 0.7.1 `web` runtime is not installed (`nsh component add web`) |

On `nsh 0.7.0` (2026-11-25) the same checks passed with 86 test files and 759 tests; the TUI and Web runs were not run either.

`just conformance` runs `nsh test --jobs 1`: `nsh` 0.7 runs test files in parallel by default (#2809), and every suite rewrites the one executed-case manifest, so parallel suites dropped each other's records.

### `google/A2UI` `36725ee` (measured 2026-11-27)

The pin moved from `496df0e` to `36725ee` (upstream `main` on 2026-11-26, 40 commits). Seven of them touch the v1.0 specification, `catalogs/basic/v1/`, or the conformance suites; `catalogs/basic/v1/` itself does not change.

| `just conformance` | `496df0e` | `36725ee`, before the fixes | `36725ee`, after |
|---|---|---|---|
| Suites | 27/27 | 25/27 | 27/27 |
| Cases passed | 705 | 701 (11 failed) | 712 |
| Documented skips | 51 | 51 | 51 |
| `core/validator_v1_0.yaml` | 50/50 | 47/50 | 50/50 |
| `core/rpc_functions.yaml` | 33/33 | 32/40 | 40/40 |

| Upstream change | a2ui-nsh |
|---|---|
| Nested function calls no longer have a depth limit of 5; only the global depth limit (50, counted from the message) bounds them (#4296) | Followed: `ValidationConfig.maxFunctionCallDepth` is gone, and a component's JSON depth counts from its message root (the component sits at depth 3). Tests: `src/core/validator.test.ts`. |
| `callRendererFunction` checks every nested `@call` and `${...}` template call against the agent's caller boundary: `rendererOnly`, or `requiresUserActivation` without a gesture, rejects the call with `INVALID_FUNCTION_CALL`; `agentOnly` is allowed; static `@call`s are checked before any argument runs (#4336) | Followed in `src/core/rpc.ts` and `src/core/functions/evaluator.ts`. A boundary error wins over another error in the same template. A template call made for the agent finds a function by its registered implementation, as the agent's own call does. Tests: `src/core/rpc_agent_boundary.test.ts`, `src/core/functions/evaluator.test.ts`. |
| `core/rpc_functions.yaml` names new test doubles (`renderTemplate`, `tagValue`, `secretRendererOnly`, `agentSecret`) and a per-function `catalogId` | Followed in the harness (`tests/conformance/c4_actions_rpc.suite.ts`), with the behavior upstream's harnesses give them. |
| `MessageProcessor.addCatalog` and `core/add_catalog.yaml` (#3304) | Known, not yet followed: a new processor feature, not a correction. The harness does not run `core/add_catalog.yaml`. |
| The global depth limit counts from the message root for every value | Known, not yet followed outside components: a `createSurface` `dataModel` and an `updateDataModel` `value` still count their depth from the value itself, so they allow two levels more than upstream. No upstream case pins this yet. |
| Agent-side suites (`conformance/agent/*`, Express and Direct JSON), `core/validator_v0_9.yaml`, v0.9.1 schema `$id`s (#3975), and doc wording | Not applicable: `a2ui-nsh` is a v1.0 renderer; the harness reads none of them. |

### `nsh 0.7.1` changes

0.7.1 is a patch release (23 commits after v0.7.0). Each commit that can reach `a2ui-nsh`:

| Change | a2ui-nsh |
|---|---|
| `List` and `DataTable` rows kept under `display: none` (#3193) | Not touched: no `List` or table is ever kept mounted under `display: none`. `BasicList` renders `<List viewport="parent">` (graphical) or a plain column (TUI); `Tabs` mounts only the active panel; every `when`/`If` guard unmounts what it hides; the `display: none` placeholders in `A2uiSurface` have no children. xlarge `Table` uses `nsh/base` `Table`/`TableBody`/`TableRow` views, not `DataTable`. `List.test.tsx`, `Table.test.tsx`, and `tests/targets/` pass unchanged. |
| Web runtime drops unused `nsh/base` part gates (#3238) | Not touched: it applies only to a Rust-root app that calls JS through wasm-bindgen; `a2ui-nsh` is a TSX app on the prebuilt runtime. |
| nshm build error names the nshm built for another `nsh` (#3225); nshm inherited version and `nsh-core` requirement (#3232) | Not touched: no `nsh.json` names an nshm and the repository has no Rust code. |
| macOS scroll-view indicator placed again on a size change (#3192) | Not asserted: it places the indicator of a `Scroll` or `List` whose frame changes size (a layout animation or a live resize). `a2ui-nsh` sets no layout animation, no test reads the indicator, and `just walk-macos` passes. |
| macOS: no batch applied from a frame inside a nested run loop (#3191) | Not touched: the reported path is a window zoom (`SetMode(Maximized)`); `a2ui-nsh` sets no window mode. `just walk-macos` passes. |
| Linux, Windows, canvas, media-linking, docs, and skills commits | Not touched: no API `a2ui-nsh` calls changes (`git diff --stat v0.7.0..v0.7.1` changes no `.d.ts` file). |

### `nsh 0.7.0` breaking changes

| Change | a2ui-nsh |
|---|---|
| Desktop windows close independently; `quitMode` (#2307) | Not touched: one window, no `Window` or quit API. Every root now gets an implicit main window, which logs an `"application"` warning on macOS and Windows under host-only capabilities (harmless). |
| Pointer press no longer moves focus on macOS and iOS (#2783); Escape order with `Popover`/`Sheet` (#2794) | Not touched: `Modal` uses `Dialog` and restores the trigger's focus with `ref.focus()`; no `Popover`, `Sheet`, or `captureKeys`. Modal, Tabs, and keyboard tests pass. |
| `clickCount: 0` for keyboard presses (#2509) | Not touched: no handler reads `clickCount`. |
| `Clipboard.writeText` results, `Storage.setItem` rejection | Not touched: neither API is used. |
| RichEditor / Tiptap changes | Not touched: not used. |
| 1024 view depth limit (#2614) | Checked: `src/renderer/depth.test.tsx` renders the deepest tree the validator allows (50) for six containers. |
| Rust struct literals need `..Default::default()` | Not touched: no Rust code. |
| `Bundle.links`, Speech moved to `nsh-extra` (#2947) | Not touched: neither is used. |
| `LiveRegion` type removed; `accessibilityLiveRegion` on every platform (#2816) | Touched and fixed: `just check` failed (TS2305); see [architecture gap 2](architecture.md#measured-nsh-071-gaps--mitigations). |

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
| xlarge target check (`tests/targets/xlarge.target.test.tsx`) | Reorders and hides xlarge's `Arrange` items with Tab, Enter and Space alone, then saves them under `field` with `version` | Runs on `--target tui` and `--target web` (part of `just test-tui` and `just test-web`) |
| SVG data URI probe (`tests/targets/svg.target.test.tsx`, app `SvgProbe.tsx`) | Whether `<Image>` draws the `data:image/svg+xml` URI xlarge's `QrCode` makes, with a PNG data URI as the control | Headless (part of `just test`), `--target tui` and `--target web`; Web loads it, headless and TUI load no picture at all |
| TUI (`just test-tui`, `just run-tui`) | Runs `tests/targets/catalog.target.test.tsx` + `tests/targets/xlarge.target.test.tsx` + `tests/targets/svg.target.test.tsx` + `examples/erp-customers/tui.test.tsx` at `120×40` (`desktop`) and `80×24` (`compact`) cells; writes `nsh-tui-cells` JSON and `*.txt` renders to `target/walk-tui/` | Requires `nsh component add tui` and `jq`; runs headless on Linux/macOS via in-memory ratatui terminal (no `nsh package` target for TUI) |
| Web/WASM tests (`just test-web`, `just run-web`) | Runs `tests/targets/catalog.target.test.tsx` + `tests/targets/xlarge.target.test.tsx` + `tests/targets/svg.target.test.tsx` + `examples/erp-customers/web.test.tsx` in headless Chrome/Edge/Chromium at `1280×800` (`desktop`) and `390×844` (`compact`); writes PNGs to `target/walk-web/` | Requires `nsh component add web` and a Chrome, Edge, or Chromium binary; supported browsers: Safari 16.4+, Chrome/Edge 97+, Firefox 108+ |
| Web/WASM packaging (`just package-web`) | Runs `nsh package examples/erp-customers --target web --out target/erp-web` and verifies `target/erp-web/ERP Customers/index.html`, `manifest.webmanifest`, and strict `connect-src 'self'` CSP meta tag | Requires `nsh component add web` (no browser required); packages the in-app local A2UI agent without a `web.host` backend bridge |

**Documented Web target limitations (Spec 002 T6):**
- Automated `--target web` tests require Chrome, Edge, or Chromium on the host; runners without a compatible browser skip `just test-web` while still running `just package-web`.
- Packaged static sites enforce strict CSP (`connect-src 'self'`, compatible with `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; base-uri 'none'`); under default `"capabilities": { "host": ["a2ui.*"] }`, outbound network and media requests fail closed and `Video` / `AudioPlayer` degrade gracefully.
- Browser autoplay policies block unmuted `<video>` autoplay and reject `AudioPlayer.play()` with `"not-allowed"` before a user gesture (`BasicVideo` starts paused; `BasicAudioPlayer` plays only on press).

## Weekly `nsh` Latest-Release Compatibility Check

Because `nsh` is pre-1.0 (`0.7.x`), `.github/workflows/nsh-weekly.yml` runs every Thursday at `06:00 UTC` (and on `workflow_dispatch`) on `ubuntu-24.04` with `permissions: contents: read` and no secrets:

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
