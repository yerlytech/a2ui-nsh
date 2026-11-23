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

- The other 18 xlarge components (`Text`, `Button`, `Detail`, `Chart`, ...)
  (round 1; round 2 below draws 15 of them).
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

## Round 2 (night spec 028)

Owner-approved 2026-11-23 (night spec 028, task 4). Same Design as above,
five more components of `tech.yerly.xlarge/v1`, drawn in this commit:

- **`Text`**: the translation of `code` with `{name}` placeholders filled
  from `params` as typed text or, without `code`, `text` (data, shown as it
  is); `code` wins when both are set, as in xlarge's web client. `tone`
  picks colour and weight, unknown tones draw plain.
- **`Toast`**: the translated `code` + `params`, shown once. It passes after
  the host's `toastMs` (default 5000 ms, `0` keeps it), on swipe, or on its
  close button; the same message does not return.
- **`Refusal`**: the translated `code` and `hint`; with `back`, a button
  (`backLabel` code, or the host's word) sends `back` with `{}`: as it came
  when it holds a `:` (an action name), else `screen:<back>`, the action
  xlarge opens screens with (`screenAction`).
- **`Image`**: `src` binds to an attachment id or a list of them, as xlarge's
  data model holds them (xlarge serves `/api/v1/files/<id>` with the
  session). One picture per id: a value that already is a safe URL is drawn
  as it is; an id goes through the host's `fileUrl(id)` and the result is
  checked against unsafe schemes. Each is named by the translated `label`; a
  bare id without `fileUrl`, or a missing or failed picture, leaves a named
  placeholder.
- **`QrCode`**: `src` binds to the SVG markup xlarge's server drew; it is
  drawn as a `data:image/svg+xml;charset=utf-8,<encoded svg>` picture (a safe
  picture URL is drawn as it is). Without a drawing, or when it fails, `link`
  is encoded by a pure QR encoder in `model.ts` (Native Shell 0.6.1 has no QR
  primitive; no dependency added) and drawn on a `Canvas`, dark on light with
  a four-module quiet zone. The accessible name and caption are only the
  translated `label` (default the host's `qrLabel`, "QR code"): the `link`
  text is never shown, since an `otpauth:` link carries the TOTP secret. Such
  a link is offered as an "open in app" button (`openInAppLabel`) when the
  host gives `openUrl`. Measured on nsh 0.6.1 by
  `tests/targets/svg.target.test.tsx`: Web loads the SVG data URI (232×232);
  headless and TUI report no load for any picture, PNG included.

`when`/`unless` stay not read. No real xlarge capture of these components
was available, so each has a synthetic fixture
(`tests/fixtures/xlarge/<component>-synthetic.json`, `source` says so),
walked by `src/catalog/xlarge/text_walk.test.tsx`.

A second commit of round 2 draws three components that send actions:

- **`Button`**: the translated `label` filled from `labelParams`, an optional
  Basic Catalog `icon`, drawn by `variant` as xlarge's web client draws it:
  only `primary` is primary, `danger`/`destructive` danger, anything else
  plain. Pressing sends `{ event: { name: action, context } }`: context values
  that are data bindings (`{ "path" }` or `{ "@path" }`) are read from the
  data model, others stay literal, and a `version` binding adds `version`
  (`actionContext`). Once sent it follows `after`. With `confirm` it asks
  first; only yes sends. The point-of-sale properties stay not read: no
  captured screen uses them.
- **`Confirm`**: asks the translated `question` with a yes (`confirmLabel`)
  and a cancel (the host's `cancelLabel`) button. Yes sends `action` with the
  literal `context` (or `{}`) and follows `after`. `cancel` is an action name
  (`cancel = "screen:imports.jobs"`), sent with `{}` on cancel when set.
  Either answer closes it.

`after` and `back` follow one rule (`screenAction`): a value holding a `:`
is an action name, sent as it came; a bare screen name is sent as
`screen:<name>`; `back` means go back, and the client sends nothing extra.
- **`Preview`**: the translated `about` and one line per `draft` entry
  (amounts as typed text); its accept button (`label`) sends `action` with
  `{}`, asking first with `confirm`.

The three share one ask (`ask.tsx`: `AskPanel`, `sendXlargeAction`; the pure
step logic is `askStep` in `model.ts`). New host words: `confirmQuestion`,
`confirmLabel`, `acceptLabel`. A literal context key the server escapes as
`@@` is unescaped once (`literalContext`) and escaped again once when sent.
Synthetic fixtures again, walked by `src/catalog/xlarge/actions_walk.test.tsx`.

A third commit of round 2 draws four display components:

- **`Columns`**: `children` side by side while Native Shell's
  `horizontalSizeClass` is `regular` (600pt and wider), each taking its share
  of `widths` (`2`, `"2fr"`, `"40%"`; missing entries share evenly), and
  stacked full-width while it is `compact`.
- **`Detail`**: the `record`'s labelled values by `rows` (`Table.columns`
  entries or field names; without `rows`, every plain value), `skipEmpty`
  leaving out empty ones; with `update`, an edit button (the host's
  `editLabel`) sends `{ event: { name: <update>, context: { id } } }`.
- **`Metric`**: the translated `label`, `value` formatted by `format` from
  its text (never a float), and `change` as xlarge draws it whatever
  `format` is: ▲/▼ and a whole-number percent, rounded half away from zero
  on the text, then the host's `againstBeforeLabel` ("vs before"); coloured
  by `better` (`up`/`down`); `accent` colours its edge, `hint` (a code)
  shows under it. `icon` stays not read.
- **`ChequeLeaf`**: the physical leaves of a prenumbered cheque book, one
  per row of `rows`: the leaf's `number` (with
  `translate(statePrefix + state)` beside it only when the leaf is `void`),
  `date`, `payee`, `amount` (from text), `amountWords` and `memo`, then its
  `stub` when it has one. xlarge prints each field at the row's `layout`
  (millimetres); this renderer stacks them in a readable card and does not
  read `layout`.

`Table`, `Detail` and `Preview` share one cell format (`formatCell`); it
also reads xlarge's `kurus` (whole minor units as major units, from the
text: `"1250"` → `"12.50"`), `number` (grouped thousands) and `month_day`
(`MM-DD`). An unknown format shows the value as it came.
`when`/`unless` stay not read. These too have synthetic fixtures (no real
capture was readable), walked by `src/catalog/xlarge/display_walk.test.tsx`.

A fourth commit of round 2 draws three flow components:

- **`Wizard`**: each of `children` is a page, shown one at a time with back
  and next. All pages share one draft (`FormDraftContext`, as `Form`); next
  refuses a page whose required field holds nothing. On the last page the
  button is `submitLabel` and sends `submit` with the whole draft (defaults
  filled, blanks left out, amounts as typed text), asking first with
  `confirm`. After a send the draft empties and page one shows; with
  `after`, it is followed with `{}` (`screenAction`: `screen:<after>` for a
  bare screen name).
- **`Steps`**: a progress list of named steps read from the data model at
  `/<answer>` (a list, or `{ steps, current }`); each step's translated name
  is marked done, current or to do (`stepsList` in `model.ts`). Sends nothing.
- **`Arrange`**: the `items` binding, read as xlarge's lab-report layout
  blocks (`items = "/layout/blocks"`, `field = "blocks"`): `{ key?, kind,
  label, shown, kept?, removable?, text?, fields? }`, a missing `key` being
  `kind` (`kind-<n>` when removable). Each row shows its translated `label`
  with a move-up and a move-down button, a shown toggle (not for `kept`), a
  remove button when `removable`, and a text box when it has `text`, so Tab,
  Enter and Space work it on every target, the terminal included
  (`tests/targets/xlarge.target.test.tsx` runs on `--target tui` and
  `--target web`). After a move or an add the new place is announced
  (`announce()`, the host's `movedText`). `add` is the new item's `kind`,
  labelled `addItem ?? addLabel`: `{ kind, label, shown: true, removable:
  true, text: "" }`. `field` is the key the list is sent under: save sends
  `save` with `{ [field]: items, version }`; reset restores the data
  model's list and, with `reset`, also sends that action with `{ version }`;
  both then follow `after` as `Button` does. `confirm` asks before a send;
  new items from the data model replace the local list. `fields` inside an
  item is not read (sent back as it came).

New host words: `nextLabel`, `addLabel`, `resetLabel`, `moveUpLabel`,
`moveDownLabel`, `shownLabel`, `removeLabel`, `movedText`,
`stepStateLabels`, and the `announce` seam. The xlarge catalog definition names
these properties without describing them, so `after` (Wizard) and the shape
of `answer` are read as written above; a real xlarge capture should confirm
them. `Arrange` follows xlarge's web renderer and its lab-report layout
surface (`lab_reports/surfaces/layout.toml`). Synthetic fixtures again, walked
by `src/catalog/xlarge/flows_walk.test.tsx`.
A further commit of round 2 draws three richer components:

- **`Chart`**: the bound `data` (rows of label and value, or an object of
  label → value) as `kind` says: bars (default), a line, or a pie. Native
  Shell 0.6.1 has no chart primitive, so the shapes are drawn on its
  `Canvas`; no chart library is added. Values are formatted by `format`
  from their text; only the geometry reads them as numbers. `labelFormat`
  and `labelPrefix` shape the labels, `tones` colours a label's bar or
  slice, and `sum` adds the values exactly as decimal text (`sumDecimals`).
  A legend lists every point; in a terminal (the host's `terminal` option,
  default `platform.idiom === "terminal"`) the points show as a table
  instead, which is also what screen readers read.
- **`Calendar`**: the bound `month` as a Monday-first grid, days marked by
  their count or label; a day press sends `{ event: { name:
  "screen:<screen>", context: { date } } }`. The heading and weekday words
  are the host's (`monthLabels`, `weekdayLabels`).
- **`Conversation`**: the bound `rows` as a message thread, this side's
  messages at the end; the heading is the translated `kind` and the bound
  `called`; the message whose `id` is the bound `around` is marked; a
  message press sends `{ event: { name: "screen:<screen>", context: { id }
  } }`.

New host options: `terminal`, `totalLabel`, `weekdayLabels`, `monthLabels`,
and `againstBeforeLabel` (the words after a `Metric`'s change).
The data keys these three read are this renderer's reading; no real xlarge
capture was readable, so the fixtures are synthetic, walked by
`src/catalog/xlarge/rich_walk.test.tsx`.
