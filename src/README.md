# `src/`

Product source code for `a2ui-nsh` (pure TypeScript / TSX, zero runtime npm dependencies).

- `src/index.ts` — Public library barrel exporting the core, store, renderer, and Basic Catalog v1.
- `src/core/` — Pure TypeScript A2UI v1.0 protocol core (zero `nsh` or I/O imports).
- `src/store/` — Reactive `nsh` `signal()` store bridging `MessageProcessor` to TSX views.
- `src/renderer/` — `<A2uiSurface>`, `ComponentRegistry`, accessibility helpers, and capability sandbox probe.
- `src/catalog/basic/` — all 18 Basic Catalog v1 TSX components with per-component `*.test.tsx`.
- `src/catalog/xlarge/` — renderers for xlarge's own catalog (`tech.yerly.xlarge/v1`): `Card`, `Field`, `Form`, `Table` (spec 003, `docs/catalog-parity.md`).

See [`docs/architecture.md`](../docs/architecture.md) for boundaries, seams, and measured `nsh 0.6.1` gaps.
