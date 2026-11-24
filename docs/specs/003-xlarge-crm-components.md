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
  Confirmed by capture 2026-11-24 (`lab-results-performance-captured.json`): `code` matches; xlarge binds `when` (`/performance/cut`), so `Text` and `Card` now read `when`/`unless` (`guardShown`).
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
- **`Preview`**: a page drawn from what is typed and not yet kept (xlarge's
  spec 038). `draft` lists draft field names, read from the enclosing
  `Form`'s draft; `about` names the draft field holding the record the draft
  is about; `action` is xlarge's export name (`export:<screen>?shape=...`),
  which xlarge fetches from its export route and which is never an A2UI
  event. Once every named field holds a value, and `previewPauseMs` (600 ms,
  as xlarge) after the last change, the host's `preview(action, { draft,
  about })` option is asked; the URL or data URI it answers is shown, the
  last page staying until the next arrives, and a rejection says
  `preview.failed`. Without that option the named draft values are listed as
  typed. There is no accept button: xlarge's client has none. xlarge's draft
  is the screen's; here a `Preview` reads the draft of the `Form` it sits in.

The first two share one ask (`ask.tsx`: `AskPanel`, `sendXlargeAction`; the
pure step logic is `askStep` in `model.ts`). New host words:
`confirmQuestion`, `confirmLabel`. A literal context key the server escapes as
`@@` is unescaped once (`literalContext`) and escaped again once when sent.
Synthetic fixtures again, walked by `src/catalog/xlarge/actions_walk.test.tsx`.

A third commit of round 2 draws four display components:

- **`Columns`**: `children` side by side while Native Shell's
  `horizontalSizeClass` is `regular` (600pt and wider), each taking its share
  of `widths` (`2`, `"2fr"`, `"40%"`; missing entries share evenly), and
  stacked full-width while it is `compact`.
- **`Detail`**: the `record`'s labelled values by `rows` (`Table.columns`
  entries or field names, as a list or a data binding; without `rows`, every
  plain value), an empty value read as `—`. Where the screen names `update`,
  a row with `edit` is corrected in place, as xlarge's client does (its spec
  009; no edit button): pressing the value opens a box holding the record's
  value under `edit.field` (default the row's `field`); save sends
  `{ event: { name: <update>, context: { id, version, [edit.field ?? field]:
  value } } }` (`detailEditContext`: `id` and `version` as the record holds
  them, an emptied box as `null`), an unchanged value sends nothing, and
  cancel puts it back. `skipEmpty` leaves out empty rows but keeps a
  correctable one, or there would be nowhere to fill it in. The box is a text
  box (a decimal keypad for amounts, multi-line for `note`); xlarge's own
  reuses its form field's picker and checks, which is not drawn here yet.
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
Confirmed by capture 2026-11-24 (`lab-samples-sample-captured.json`, `lab-results-performance-captured.json`, `bank-cheque-book-captured.json`, walked by `captured_display_walk.test.tsx`): Columns and Detail match; Metric's `accent` is a colour name (`rose`, now the destructive edge) and the capture sends no `change`; ChequeLeaf matches, its `amount` arriving written out (`"100 TRY"`, shown as it came; the synthetic fixture now has that shape); a `list` cell under `enumPrefix` is translated entry by entry; Detail and Table `unitField`, `tones`, `below` and `range` stay not read.

A fourth commit of round 2 draws three flow components:

- **`Wizard`**: each of `children` is a page, shown one at a time with back
  and next. All pages share one draft (`FormDraftContext`, as `Form`); next
  refuses a page whose required field holds nothing. On the last page the
  button is `submitLabel` and sends `submit` with the whole draft (defaults
  filled, blanks left out, amounts as typed text), asking first with
  `confirm`. After a send the draft empties and page one shows; with
  `after`, it is followed with `{}` (`screenAction`: `screen:<after>` for a
  bare screen name).
- **`Steps`**: what an agent did for a request (xlarge's spec 033), drawn
  from the answer the action above it got back, as xlarge's
  `answer()[answer ?? "steps"]`, not from the data model. An A2UI 1.0 event
  carries no answer back, so there is no protocol field for it: the host,
  which sends the event and reads the reply on its own transport, gives it
  through the renderer's `answer()` option (a signal's reader, so a new
  answer redraws). This needs no A2UI protocol decision; the seam sits
  beside `fileUrl` and `openUrl`. It shows the answer's `words` and `stopped`
  (a code), then each step `{ action, input, outcome, code?, opens? }`:
  named by `audit.action.<action>`, else as a look into the module's list
  (`stepName`); `done` and `refused` (its `code`) marked; `waiting` with a
  take button that asks first, then sends `{ event: { name: action,
  context: input } }` and marks the step taken; `opens` as a button sending
  `{ event: { name: opens.screen, context: opens.about } }` (an id as
  `{ id }`, since an event's context is an object).
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
`moveDownLabel`, `shownLabel`, `removeLabel`, `movedText`, and the `announce`
seam; `Steps` uses xlarge's own codes (`agents.outcome.*`,
`agents.action.take`, `agents.action.open`). The shape of `answer` is
xlarge's (`AgentStep` in its web renderer, read for this round). The xlarge
catalog definition names the other properties without describing them, so
`after` (Wizard) is read as written above; a real xlarge capture should
confirm them. `Arrange` follows xlarge's web renderer and its lab-report layout
surface (`lab_reports/surfaces/layout.toml`). Synthetic fixtures again, walked
by `src/catalog/xlarge/flows_walk.test.tsx`.
A further commit of round 2 draws three richer components:

These three were first written from the catalog schema's field names alone.
A review against xlarge's web renderer (`src/apps/web/src/renderer.tsx`,
`calendar.tsx`, `figures.ts`), its server (`src/platform/src/calendar.rs`,
`src/apps/server/src/talk.rs`), and the screens that use them changed them
to read what xlarge sends:

- **`Chart`** (`lab_samples/surfaces/figures.toml`): the bound `data` is a
  list of `{ label, value, caption? }` rows; `caption`, when it is text, is
  what is shown (money the server already wrote out), and a row whose value
  is not a plain decimal is left out. `kind` is `sparkline` (a small line
  beside a big figure: the last value, or with `sum` the exact total),
  `line`, `bars`, or anything else a donut, as xlarge's client draws it.
  `format` defaults to `number`. `labelPrefix` wins over `labelFormat`.
  `tones` take xlarge's tone words (`neutral`, `info`, `success`,
  `warning`, `danger`). Native Shell 0.6.1 has no chart primitive, so the
  shapes are drawn on its `Canvas`; no chart library is added. Only the
  geometry reads values as numbers; text and sums never do. Every chart but
  a sparkline lists its points with their values; in a terminal (the host's
  `terminal` option, default `platform.idiom === "terminal"`) the points
  show as a table instead. No points says `chart.nothing`.
- **`Calendar`** (`platform/surfaces/calendar.toml`): the bound `month` is
  what `calendar.month` answers, `{ month, first, last, previous, next,
  items, sources, missing }`. Weeks Monday first, each day with its items;
  an item press sends its own `screen` (`screen:work_orders.order`) with
  `{ id }`. Previous and next send `screen:<screen>` with `{ period:
  "between", from, to }`, the month's first and last day. A filter by
  `sources` (the client's own; nothing is sent), and a line per `missing`
  module (`calendar.could_not_read`).
- **`Conversation`** (`lab_samples/surfaces/sample.toml`): a record's
  conversation. `rows` is what `talk.on` answers, newest first (drawn
  oldest first): `{ id, by: { id, name }, text, takenBack, at, mine,
  reactions, myReaction }`. `around` is what `talk.about` answers, `{ talk,
  people, unread }`; the record's id is read from `talk` (`r_<kind>_<id>`).
  It sends `talk.write` `{ kind, id, screen, label, text, tell }`,
  `talk.react_on` `{ kind, id, message, emoji }`, `talk.take_back` `{ id }`
  after a yes, and `talk.seen` `{ id }` once when unread; after a write, a
  reaction or a take-back, `screen:<screen>` `{ id }` reads the screen
  again, as xlarge's client does. Its earlier page (`talk.earlier`) and mail
  templates (`mail.templates`) are not drawn: both need xlarge's paging and
  ask channels, which A2UI 1.0 does not carry.

Words are xlarge's own codes (`chart.*`, `calendar.*`, `talk.*`), translated.
Host options: `terminal`, `weekdayLabels`, `monthLabels`, and
`againstBeforeLabel` (the words after a `Metric`'s change). The fixtures are
built from those screens and the shapes their reads answer (not captured from
a running server), walked by `src/catalog/xlarge/rich_walk.test.tsx`.
Confirmed by capture 2026-11-24 (`lab-results-performance-captured.json`, `calendar-month-captured.json`, `lab-samples-sample-captured.json`, walked by `captured_display_walk.test.tsx`): Chart (`line`, `labelFormat = "date"`), Calendar and Conversation match.
