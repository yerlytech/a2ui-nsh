---
status: approved
approved: 2026-11-23 (the owner: "Evet, spekleri onaylıyorum")
date: 2026-11-23
---

# 003 — xlarge's Card, Field, Form and Table

Built on branch `catalog-card-field-form-table` ahead of approval, at the
desk's request; not merged until the maintainer approves.

## What

Draw xlarge's `crm.deals` screen. xlarge sends its screens against its own
A2UI 1.0 catalog, `tech.yerly.xlarge/v1` (xlarge spec 208), and that screen
uses four of its 22 components: `Card`, `Field`, `Form`, and `Table`.
`src/catalog/xlarge/` adds renderers for those four, registered under
xlarge's catalog ID next to the Basic Catalog.

## Why

The A2UI Basic Catalog v1 (`google/A2UI` `496df0e`,
`catalogs/basic/v1/catalog.json`) has no `Field`, `Form`, or `Table`, and its
`Card` takes one `child`. A2UI lets an agent name its own catalog; a renderer
that draws xlarge's screens has to know that catalog's components. The
fixture `tests/fixtures/xlarge/crm-deals.json` is the real screen as xlarge's
server sent it, so the renderers are measured against what xlarge emits.

## Not doing

- The other 18 xlarge components (`Text`, `Button`, `Detail`, `Chart`, ...).
- Field inputs `records`, `flag`, `file`, `html`; `datetime` is a text box.
- List paging (`listAction`, `listInput`, `_more`), boards, grouping, moving
  rows, `confirm`, `pair`, matrix and variant forms, `when`/`unless`.
- Shipping xlarge's i18n dictionary: the host passes a `translate` function.
- Changing the A2UI protocol or the Basic Catalog.

## Design

- **Catalog boundary.** Renderers register under `tech.yerly.xlarge/v1`
  (`registerXlargeCatalogComponents`). The catalog definition is xlarge's and
  is registered on the store by the host (`Catalog.fromJson`).
- **Translation seam.** xlarge sends i18n codes (`crm.field.title`). Every
  renderer takes `translate(code)`; the default shows the code.
- **Form draft.** xlarge binds no field value to the data model, so a `Form`
  provides a renderer-side draft (`FormDraftContext`) that its `Field`s write.
  Nothing is written into the surface data model.
- **Actions.** xlarge names actions in plain string properties (`submit`,
  `rowAction`, `searchAction`). The renderers build an A2UI 1.0
  `{ event: { name, context } }` payload and send it through
  `NodeResolver.dispatchNodeAction`, the same dispatcher a resolved `Action`
  property uses (refactored out of `getOrCreateAction`, behaviour unchanged).
  Context values are literals; keys starting with `@` are escaped as `@@`.
- **Semantics follow xlarge's web client.** Required fields refuse the send
  with a message on the field; blank values are left out and defaults fill
  in; a `filters` form asks its table's `searchAction` with `searchInput`
  plus its values; a row press sends `{ id }`; the search box sends `query`.
  Amounts are sent as typed text and formatted without floats.

## Acceptance

- [x] `crm.deals` from the fixture draws with no errors under strict mode.
- [x] Each of the four components has its own `*.test.tsx`; pure helpers have
      `model.test.ts`.
- [x] A walk on the fixture: rows arrive by `updateDataModel`, a row press
      sends `screen:crm.deal`, the add dialog refuses empty required fields
      then sends `crm.open_deal`, the filter and the search ask `crm.deals`.
- [x] `just lint`, `just test`, and `just conformance` pass.
- [x] `docs/catalog-parity.md` lists coverage before and after.
- [ ] Maintainer approval.
