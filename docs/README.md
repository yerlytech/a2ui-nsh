# Documentation

Public documentation for `a2ui-nsh` (English, kept in sync with `src/`, `tests/conformance/`, and `examples/`).

| Document | Purpose |
|---|---|
| [`architecture.md`](architecture.md) | Layer boundaries (`src/core/`, `src/store/`, `src/renderer/`, `src/catalog/basic/`), multi-catalog & Rust-core seams, capability sandbox, and measured `nsh 0.6.1` gaps |
| [`catalog-parity.md`](catalog-parity.md) | Components drawn per catalog: Basic Catalog v1 (18/18) and xlarge's `tech.yerly.xlarge/v1` (19/22), with the properties read |
| [`conformance.md`](conformance.md) | C1–C6 upstream `google/A2UI` YAML conformance harness, executed-case manifest, documented skip list, and weekly `nsh` compatibility CI |
| [`upstream.toml`](upstream.toml) | Pinned upstream versions (`longbridge/nsh`, `google/A2UI`, `gitleaks`) watched by `just upstream` |
| [`specs/001-a2ui-nsh-core-and-desktop.md`](specs/001-a2ui-nsh-core-and-desktop.md) | Spec 001: reference evaluation, design decisions, measured `nsh 0.6.1` findings, and Slice 1 task log |
| [`specs/003-xlarge-crm-components.md`](specs/003-xlarge-crm-components.md) | Spec 003 (approved): xlarge's catalog components, round 1 (`crm.deals`) and round 2 |
| [`../examples/erp-customers/README.md`](../examples/erp-customers/README.md) | ERP Customers A2UI v1.0 demo and manual macOS AppKit walkthrough |

## Folders

| Folder | Convention |
|---|---|
| `specs/` | One-page specs written before implementation (`just spec <name>`). |
| `adr/` | Architecture Decision Records, numbered from `0001` (`just adr <name>`), added when needed. |
