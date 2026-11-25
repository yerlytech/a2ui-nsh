# Contributing

Thank you for contributing to a2ui-nsh. Please keep changes focused and include enough information for a reviewer to reproduce and verify them.

## Development setup

Install the prerequisites listed in the [README](README.md#install): `nsh` 0.7.0, `just` 1.29.0 or newer, and Git. No Node.js or npm install is needed.

Run the initial checks from the repository root:

```bash
just check
just test
```

To run conformance tests, fetch the pinned Google A2UI checkout:

```bash
git clone https://github.com/google/A2UI target/refs/google-A2UI
git -C target/refs/google-A2UI checkout 496df0e76e2ad9aba4cc2a12abe066f43d4f171d
just conformance
```

## Build and test

Use the checks that cover your change:

```bash
just check       # Type-check all TypeScript and TSX projects
just test        # Run headless unit, component, and example tests
just conformance # Run the upstream A2UI C1-C6 suites
just test-tui    # Run the real-target terminal suites
just test-web    # Run the real-target browser suites
just build       # Build the release bundles
```

`just test-tui` requires the `nsh` TUI runtime and `jq`. `just test-web` requires the Web runtime and Chrome, Edge, or Chromium. See the [README](README.md#install) for setup commands.

Add or update tests for behavior changes. Protocol changes should include relevant conformance coverage; component changes should include rendering, interaction or binding, and accessibility coverage where applicable. Run the TUI or Web suites when a change affects those targets.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) with a concise English description:

```text
feat: add a catalog component
fix: preserve bindings after a surface update
test: cover compact terminal layout
docs: clarify web media permissions
```

Common types are `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, and `ci`. Keep unrelated changes in separate commits.

## Pull requests

A pull request should include:

- A clear description of the problem, the change, and any known limitations.
- The tests or checks run and their results.
- New or updated automated tests for behavior changes.
- Screenshots for UI changes, including compact layouts and each affected target where practical. TUI changes can include the generated cell-grid snapshots.
- Documentation updates when commands, behavior, or supported targets change.

Keep the change scoped and avoid unrelated refactoring. Do not include generated build output, credentials, customer data, or other secrets.

## Reporting issues

Open a GitHub issue with:

- A short description of the expected and actual behavior.
- Steps to reproduce, with a minimal A2UI payload or code example when possible.
- The `nsh` version, operating system, target (`headless`, `macos`, `tui`, or `web`), and browser/version when relevant.
- Relevant error messages or logs, with credentials and personal information removed.
- Screenshots or terminal snapshots for rendering problems.

For conformance failures, name the upstream suite and case. For UI issues, include the viewport size or terminal dimensions and say whether the problem also occurs in headless tests.
