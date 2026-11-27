# a2ui-nsh commands.

# Default path to the read-only google-A2UI reference checkout.
a2ui_conformance_root := env("A2UI_CONFORMANCE_ROOT", "target/refs/google-A2UI")

# Type-check the library, conformance harness, and examples with nsh check (TypeScript 7).
[group('build')]
check:
    #!/usr/bin/env bash
    set -euo pipefail
    nsh check .
    if [ -f tests/conformance/tsconfig.json ]; then
      nsh check tests/conformance
    fi
    if [ -f tests/targets/tsconfig.json ]; then
      nsh check tests/targets
    fi
    if [ -f examples/erp-customers/tsconfig.json ]; then
      nsh check examples/erp-customers
    fi

# Pre-commit lint hook entry point.
[group('build')]
lint: check

# Run unit and component tests under src/, tests/fixtures/, the headless SVG probe (and examples/ when present) with nsh test.
[group('test')]
test:
    #!/usr/bin/env bash
    set -euo pipefail
    files=()
    while IFS= read -r file; do
      files+=("$file")
    done < <(find src -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort)
    if [ ${#files[@]} -eq 0 ]; then
      echo "No test files found under src/" >&2
      exit 1
    fi
    failed=0
    for file in "${files[@]}"; do
      if ! nsh test "$file"; then
        failed=$((failed + 1))
      fi
    done
    if [ -d tests/fixtures ]; then
      while IFS= read -r file; do
        if ! nsh test "$file"; then
          failed=$((failed + 1))
        fi
      done < <(find tests/fixtures -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort)
    fi
    if ! nsh test tests/targets/svg.target.test.tsx; then
      failed=$((failed + 1))
    fi
    if [ -f tests/conformance/yaml.test.ts ]; then
      if ! nsh test tests/conformance/yaml.test.ts; then
        failed=$((failed + 1))
      fi
    fi
    if [ -d examples/erp-customers ]; then
      while IFS= read -r file; do
        if ! nsh test "$file"; then
          failed=$((failed + 1))
        fi
      done < <(find examples/erp-customers -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) ! -name '*.macos.test.tsx' ! -name 'tui.test.tsx' ! -name 'web.test.tsx' | sort)
    fi
    if [ "$failed" -ne 0 ]; then
      echo "$failed test target(s) failed" >&2
      exit 1
    fi

# Run one test file `times` times in a row and stop at the first failure (flake check).
[group('test')]
test-repeat file times="30":
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p target
    for i in $(seq 1 {{times}}); do
      if ! nsh test "{{file}}" > target/test-repeat.log 2>&1; then
        cat target/test-repeat.log
        echo "run $i of {{times}} failed: {{file}}" >&2
        exit 1
      fi
    done
    tail -n 3 target/test-repeat.log
    echo "{{times}} of {{times}} runs passed: {{file}}"

# Run one test file `times` times while `just test` loads the machine in parallel.
[group('test')]
test-repeat-loaded file times="10":
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p target
    just test > target/test-load.log 2>&1 &
    load=$!
    status=0
    just test-repeat "{{file}}" "{{times}}" || status=$?
    load_status=0
    wait "$load" || load_status=$?
    tail -n 2 target/test-load.log
    echo "background just test exit: $load_status"
    exit "$status"

# Run the native macOS AppKit walk test for examples/erp-customers and list saved PNG screenshots.
[group('test')]
walk-macos:
    #!/usr/bin/env bash
    set -euo pipefail
    rm -rf target/walk-macos
    mkdir -p target/walk-macos
    nsh test examples/erp-customers/walk.macos.test.tsx --target macos
    ls -lh target/walk-macos/*.png

# Run the real-target TUI suites (18-component catalog + xlarge Arrange keyboard check + SVG data URI probe + ERP walk) and render target/walk-tui/*.txt.
[group('test')]
test-tui:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! nsh component list 2>&1 | grep -Eq '^tui[[:space:]]+installed'; then
      echo "nsh 'tui' runtime is not installed. Run: nsh component add tui" >&2
      exit 1
    fi
    if ! command -v jq >/dev/null 2>&1; then
      echo "jq is required to render target/walk-tui/*.txt cell grids." >&2
      exit 1
    fi
    rm -rf target/walk-tui
    mkdir -p target/walk-tui
    nsh test tests/targets/catalog.target.test.tsx --target tui
    nsh test tests/targets/xlarge.target.test.tsx --target tui
    nsh test tests/targets/svg.target.test.tsx --target tui
    nsh test examples/erp-customers/tui.test.tsx --target tui
    for json in target/walk-tui/*.json; do
      [ -f "$json" ] || continue
      jq -r '.rows[] | map(.symbol) | join("") | sub(" +$"; "")' "$json" > "${json%.json}.txt"
    done
    ls -lh target/walk-tui/*.json target/walk-tui/*.txt

# Launch examples/erp-customers interactively in the terminal (--target tui).
[group('run')]
run-tui:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! nsh component list 2>&1 | grep -Eq '^tui[[:space:]]+installed'; then
      echo "nsh 'tui' runtime is not installed. Run: nsh component add tui" >&2
      exit 1
    fi
    nsh run examples/erp-customers --target tui

# Run the real-target Web/WASM suites (18-component catalog + xlarge Arrange keyboard check + SVG data URI probe + ERP walk in headless Chromium) and list target/walk-web/*.png.
[group('test')]
test-web:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! nsh component list 2>&1 | grep -Eq '^web[[:space:]]+installed'; then
      echo "nsh 'web' runtime is not installed. Run: nsh component add web" >&2
      exit 1
    fi
    rm -rf target/walk-web
    mkdir -p target/walk-web
    nsh test tests/targets/catalog.target.test.tsx --target web
    nsh test tests/targets/xlarge.target.test.tsx --target web
    nsh test tests/targets/svg.target.test.tsx --target web
    nsh test examples/erp-customers/web.test.tsx --target web
    ls -lh target/walk-web/*.png

# Launch examples/erp-customers interactively in a browser (--target web dev server).
[group('run')]
run-web:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! nsh component list 2>&1 | grep -Eq '^web[[:space:]]+installed'; then
      echo "nsh 'web' runtime is not installed. Run: nsh component add web" >&2
      exit 1
    fi
    nsh run examples/erp-customers --target web

# Package examples/erp-customers as a static Web/WASM site into target/erp-web/ and verify bundle + CSP output.
[group('build')]
package-web:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! nsh component list 2>&1 | grep -Eq '^web[[:space:]]+installed'; then
      echo "nsh 'web' runtime is not installed. Run: nsh component add web" >&2
      exit 1
    fi
    rm -rf target/erp-web
    mkdir -p target/erp-web
    nsh package examples/erp-customers --target web --out target/erp-web
    bundle_dir="target/erp-web/ERP Customers"
    if [ ! -f "${bundle_dir}/index.html" ] || [ ! -f "${bundle_dir}/manifest.webmanifest" ]; then
      echo "Expected packaged web site under ${bundle_dir}/" >&2
      exit 1
    fi
    if ! grep -q "connect-src 'self'" "${bundle_dir}/index.html"; then
      echo "Expected strict connect-src 'self' CSP meta tag in ${bundle_dir}/index.html" >&2
      exit 1
    fi
    ls -lh "${bundle_dir}"

# Run upstream google-A2UI YAML conformance suites via nsh test.
[group('test')]
[positional-arguments]
conformance ref_dir=a2ui_conformance_root:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d tests/conformance ]; then
      echo "No conformance harness under tests/conformance yet."
      exit 0
    fi
    ref_arg="$1"
    if [ ! -d "$ref_arg" ]; then
      echo "A2UI conformance root not found: $ref_arg" >&2
      exit 1
    fi
    ref_abs="$(cd "$ref_arg" && pwd -P)"
    mkdir -p target/conformance-run
    target_abs="$(cd target && pwd -P)"
    manifest_abs="$target_abs/conformance-manifest.jsonl"
    rm -f target/conformance-run/*.test.ts
    printf '{\n  "name": "a2ui-nsh Conformance Runner",\n  "id": "dev.a2ui.nsh.conformance",\n  "version": "0.1.0",\n  "build": 1,\n  "capabilities": {\n    "fs": {\n      "read": ["%s", "%s"],\n      "write": ["%s"]\n    },\n    "process": {\n      "env": ["A2UI_CONFORMANCE_ROOT", "A2UI_CONFORMANCE_MANIFEST", "PWD"]\n    }\n  }\n}\n' \
      "$ref_abs" "$target_abs" "$target_abs" > target/conformance-run/nsh.json
    # `nsh test` runs a directory only beside an entry; no suite opens it.
    printf '// Entry for nsh test; the suites read through tests/conformance/harness.ts.\nexport {};\n' > target/conformance-run/App.tsx
    for suite in tests/conformance/*.suite.ts; do
      [ -f "$suite" ] || continue
      base="$(basename "$suite" .suite.ts)"
      printf 'import "../../%s";\n' "${suite%.ts}" > "target/conformance-run/${base}.test.ts"
    done
    # nsh 0.7 runs test files in parallel by default (#2809); every suite
    # read-modify-writes the one manifest file, so they run one at a time.
    A2UI_CONFORMANCE_ROOT="$ref_abs" \
    A2UI_CONFORMANCE_MANIFEST="$manifest_abs" \
    nsh test --jobs 1 target/conformance-run

# Build release QuickJS bytecode bundles into target/nsh-out (and target/erp-release).
[group('build')]
build:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p target/nsh-out
    nsh build . --release --out target/nsh-out
    if [ -f examples/erp-customers/App.tsx ]; then
      mkdir -p target/erp-release
      nsh build examples/erp-customers --release --out target/erp-release
    fi

# Download the latest nsh release into target/nsh-latest/ and run check, test, conformance, and build against it.
[group('test')]
nsh-check-latest ref_dir=a2ui_conformance_root:
    #!/usr/bin/env bash
    set -euo pipefail
    os="$(uname -s)"
    arch="$(uname -m)"
    if [ "$os" = "Darwin" ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
      arch="arm64"
    fi
    case "${os}/${arch}" in
      Darwin/arm64)           platform="macos-arm64" ;;
      Darwin/x86_64)          platform="macos-x86_64" ;;
      Linux/x86_64|Linux/amd64) platform="linux-x86_64" ;;
      Linux/aarch64|Linux/arm64) platform="linux-arm64" ;;
      *) echo "Unsupported platform for nsh-check-latest: ${os}/${arch}" >&2; exit 1 ;;
    esac
    asset="nsh-${platform}.tar.gz"
    base_url="https://github.com/longbridge/nsh/releases/latest/download"
    work="target/nsh-latest"
    rm -rf "$work"
    mkdir -p "$work"
    curl -fsSL "${base_url}/${asset}" -o "${work}/${asset}"
    curl -fsSL "${base_url}/${asset}.sha256" -o "${work}/${asset}.sha256"
    if command -v shasum >/dev/null 2>&1; then
      (cd "$work" && shasum -a 256 -c "${asset}.sha256")
    else
      (cd "$work" && sha256sum -c "${asset}.sha256")
    fi
    tar -xzf "${work}/${asset}" -C "$work"
    nsh_bin="$(cd "$work/nsh/bin" && pwd -P)"
    export PATH="${nsh_bin}:${PATH}"
    echo "Testing against $(nsh --version)"
    just check
    just test
    just conformance "{{ref_dir}}"
    just build
