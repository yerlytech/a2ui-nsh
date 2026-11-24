# Catalog parity

Which catalog components `a2ui-nsh` draws, measured against the catalog
definitions it renders. Two catalogs are in scope:

1. **A2UI Basic Catalog v1** (`https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json`),
   read from `google/A2UI` `496df0e` `catalogs/basic/v1/catalog.json` and
   reproduced in `src/core/v1_0_schemas.ts`.
2. **xlarge catalog v1** (`tech.yerly.xlarge/v1`), a custom A2UI 1.0 catalog
   that xlarge publishes (its `src/catalog/catalog.json`, spec 208). The copy
   used here travels in `tests/fixtures/xlarge/crm-deals.json`.

The A2UI Basic Catalog v1 has no `Field`, `Form`, or `Table` component. Its
nearest equivalents are `TextField`, `ChoicePicker`, `DateTimeInput`, and
`List`, and its `Card` takes one `child`. xlarge's `Field`, `Form`, `Table`,
and `Card` therefore belong to xlarge's own catalog, and `a2ui-nsh` draws them
from `src/catalog/xlarge/` (spec 003).

## A2UI Basic Catalog v1: 18 of 18

| Component | Drawn | Renderer | Tests |
|---|---|---|---|
| Text | yes | `src/catalog/basic/Text.tsx` | `Text.test.tsx`, adapter conformance |
| Image | yes | `Image.tsx` | `Image.test.tsx`, adapter conformance |
| Icon | yes | `Icon.tsx` | `Icon.test.tsx`, adapter conformance |
| Video | yes | `Video.tsx` | `Video.test.tsx`, adapter conformance |
| AudioPlayer | yes | `AudioPlayer.tsx` | `AudioPlayer.test.tsx`, adapter conformance |
| Row | yes | `Row.tsx` | `Row.test.tsx`, adapter conformance |
| Column | yes | `Column.tsx` | `Column.test.tsx`, adapter conformance |
| List | yes | `List.tsx` | `List.test.tsx`, adapter conformance |
| Card | yes | `Card.tsx` | `Card.test.tsx`, adapter conformance |
| Tabs | yes | `Tabs.tsx` | `Tabs.test.tsx`, adapter conformance |
| Modal | yes | `Modal.tsx` | `Modal.test.tsx`, adapter conformance |
| Divider | yes | `Divider.tsx` | `Divider.test.tsx`, adapter conformance |
| Button | yes | `Button.tsx` | `Button.test.tsx`, adapter conformance |
| TextField | yes | `TextField.tsx` | `TextField.test.tsx`, adapter conformance |
| CheckBox | yes | `CheckBox.tsx` | `CheckBox.test.tsx`, adapter conformance |
| ChoicePicker | yes | `ChoicePicker.tsx` | `ChoicePicker.test.tsx`, adapter conformance |
| Slider | yes | `Slider.tsx` | `Slider.test.tsx`, adapter conformance |
| DateTimeInput | yes | `DateTimeInput.tsx` | `DateTimeInput.test.tsx`, adapter conformance |

All 14 Basic Catalog functions are implemented as well (`docs/conformance.md`).

## xlarge catalog v1: 22 of 22

Before spec 003: 0 of 22. Spec 003 drew the four xlarge's `crm.deals`
screen uses; its round 2 (night spec 028) added `Text`, `Toast`, `Refusal`,
`Image`, `QrCode`, `Button`, `Confirm`, `Preview`, `Columns`, `Detail`,
`Metric`, `ChequeLeaf`, `Wizard`, `Steps`, `Arrange`, `Chart`, `Calendar`, and
`Conversation`.

| Component | Drawn | Renderer | Tests | Fixture |
|---|---|---|---|---|
| Card | yes | `src/catalog/xlarge/Card.tsx` | `Card.test.tsx`, `crm_deals.test.tsx` | `crm-deals.json` (real, root) |
| Field | yes | `src/catalog/xlarge/Field.tsx` | `Field.test.tsx`, `crm_deals.test.tsx` | `crm-deals.json` (real, 10) |
| Form | yes | `src/catalog/xlarge/Form.tsx` | `Form.test.tsx`, `crm_deals.test.tsx` | `crm-deals.json` (real, 2) |
| Table | yes | `src/catalog/xlarge/Table.tsx` | `Table.test.tsx`, `crm_deals.test.tsx` | `crm-deals.json` (real, 1) |
| Text | yes | `src/catalog/xlarge/Text.tsx` | `Text.test.tsx`, `text_walk.test.tsx` | `text-synthetic.json` (synthetic: no real xlarge screen yet) |
| Toast | yes | `src/catalog/xlarge/Toast.tsx` | `Toast.test.tsx`, `text_walk.test.tsx` | `toast-synthetic.json` (synthetic: no real xlarge screen yet) |
| Refusal | yes | `src/catalog/xlarge/Refusal.tsx` | `Refusal.test.tsx`, `text_walk.test.tsx` | `refusal-synthetic.json` (synthetic: no real xlarge screen yet) |
| Image | yes | `src/catalog/xlarge/Image.tsx` | `Image.test.tsx`, `text_walk.test.tsx` | `image-synthetic.json` (synthetic: no real xlarge screen yet; attachment ids as xlarge's data model holds them) |
| QrCode | yes | `src/catalog/xlarge/QrCode.tsx` | `QrCode.test.tsx`, `model.test.ts` (encoder), `text_walk.test.tsx`, `tests/targets/svg.target.test.tsx` (SVG data URI, headless, TUI and Web) | `qrcode-synthetic.json` (synthetic data in the shapes of xlarge's `sale.toml` `pay_qr` and `invoice.toml` `emv_qr`) |
| Button | yes | `src/catalog/xlarge/Button.tsx` (ask: `ask.tsx`) | `Button.test.tsx`, `model.test.ts`, `actions_walk.test.tsx` | `button-synthetic.json` (synthetic: no real xlarge screen yet) |
| Confirm | yes | `src/catalog/xlarge/Confirm.tsx` (ask: `ask.tsx`) | `Confirm.test.tsx`, `model.test.ts`, `actions_walk.test.tsx` | `confirm-synthetic.json` (synthetic: no real xlarge screen yet) |
| Preview | yes | `src/catalog/xlarge/Preview.tsx` (draft: `context.ts`) | `Preview.test.tsx`, `model.test.ts`, `actions_walk.test.tsx` | `preview-synthetic.json` (synthetic: no real xlarge screen yet; a `Form` holding the `Field`s the `Preview` names) |
| Columns | yes | `src/catalog/xlarge/Columns.tsx` | `Columns.test.tsx`, `model.test.ts`, `display_walk.test.tsx` | `columns-synthetic.json` (synthetic: no real xlarge screen yet) |
| Detail | yes | `src/catalog/xlarge/Detail.tsx` | `Detail.test.tsx`, `model.test.ts`, `display_walk.test.tsx` | `detail-synthetic.json` (synthetic: no real xlarge screen yet) |
| Metric | yes | `src/catalog/xlarge/Metric.tsx` | `Metric.test.tsx`, `model.test.ts`, `display_walk.test.tsx` | `metric-synthetic.json` (synthetic: no real xlarge screen yet) |
| ChequeLeaf | yes | `src/catalog/xlarge/ChequeLeaf.tsx` | `ChequeLeaf.test.tsx`, `model.test.ts`, `display_walk.test.tsx` | `chequeleaf-synthetic.json` (synthetic: no real xlarge screen yet) |
| Wizard | yes | `src/catalog/xlarge/Wizard.tsx` (draft: `context.ts`, ask: `ask.tsx`) | `Wizard.test.tsx`, `model.test.ts`, `flows_walk.test.tsx` | `wizard-synthetic.json` (synthetic: no real xlarge screen yet) |
| Steps | yes | `src/catalog/xlarge/Steps.tsx` (ask: `ask.tsx`) | `Steps.test.tsx`, `model.test.ts`, `flows_walk.test.tsx` | `steps-synthetic.json` (synthetic, in the shape of xlarge's `agents-assistant.toml`; its `answer` is what the host's `answer` option holds, not an A2UI message) |
| Arrange | yes | `src/catalog/xlarge/Arrange.tsx` (ask: `ask.tsx`) | `Arrange.test.tsx`, `model.test.ts`, `flows_walk.test.tsx`, `tests/targets/xlarge.target.test.tsx` (keyboard, TUI and Web) | `arrange-synthetic.json` (synthetic: no real xlarge screen yet) |
| Chart | yes | `src/catalog/xlarge/Chart.tsx` | `Chart.test.tsx`, `model.test.ts`, `rich_walk.test.tsx` | `lab-samples-figures.json` (built from xlarge's `lab_samples/surfaces/figures.toml`; not captured) |
| Calendar | yes | `src/catalog/xlarge/Calendar.tsx` | `Calendar.test.tsx`, `model.test.ts`, `rich_walk.test.tsx` | `calendar-month.json` (built from xlarge's `platform/surfaces/calendar.toml`; not captured) |
| Conversation | yes | `src/catalog/xlarge/Conversation.tsx` | `Conversation.test.tsx`, `model.test.ts`, `rich_walk.test.tsx` | `lab-samples-sample-talk.json` (built from the talk card of xlarge's `lab_samples/surfaces/sample.toml`; not captured) |

Fixtures live in `tests/fixtures/xlarge/`.

### Properties drawn

The xlarge catalog declares each component's properties. This table lists
which of them the renderers read; the rest are accepted by validation and
ignored when drawn.

| Component | Read | Not yet read |
|---|---|---|
| Card | `children`, `title` (i18n code), `heading`, `subtitle`, `plain` | `pageTitle`, `slot`, `sticky`, `state`, `tones`, `enumPrefix`, `headingPrefix`, `when`, `unless` |
| Field | `field`, `input`, `label`, `example`, `checks` (`required`), `default`, `options`, `optionPrefix`, `from`, `value`, `show` | `accept`, `article`, `autofill`, `draft`, `labelParams`, `links`, `optionsAt`, `pageTitle`, `retention`, `scan`, `searchInput`, `suggest`, `when` |
| Form | `children`, `title`, `submit`, `submitLabel`, `context`, `dialog`, `filters`, `row` | `after`, `answer`, `confirm`, `icon`, `import`, `matrix`, `matrixField`, `once`, `pair`, `variant*`, `version`, `pageTitle`, `when`, `unless` |
| Table | `rows`, `columns` (`field`, `label`, `format`, `enumPrefix`, `grow`; `format` is `date`, `datetime`, `month_day` (`MM-DD`), `money`/`decimal` (two decimals, grouped), `kurus` (whole minor units as major units, `"1250"` → `"12.50"`), `number` (grouped thousands), `flag` or `list`, all from the text, never a float; any other format shows the value as it came; `Detail` and `Preview` share it), `title`, `rowAction`, `rowOpens`, `search`, `searchAction`, `searchInput` | `board`, `boardFirst`, `build`, `card`, `cards`, `group*`, `listAction`, `listInput` (paging), `move`, `moveField`, `searchText`, `pageTitle`, `when`, `unless` |
| Text | `code` (i18n code; wins over `text`, as in xlarge's web client), `text` (shown as it is when there is no `code`), `params` (fills `{name}` placeholders as typed text), `tone` (`muted`, `strong`, `accent`, `danger` and their synonyms; unknown tones draw plain) | `pageTitle`, `when`, `unless` |
| Toast | `code`, `params`: shown once, passes after `toastMs` (host option, default 5000 ms; `0` keeps it; the wait is scheduled through the host's `timers` option, the core `TimerSeam`, default the global `setTimeout`, so tests advance a manual clock instead of sleeping), on swipe, or on its close button; the same message does not return while the component stays | `pageTitle` |
| Refusal | `code`, `hint` (codes), `back` (its button sends the event `screen:<back>` with an empty context), `backLabel` (code; default the host's `backLabel`, `"Back"`) | `pageTitle` |
| Image | `src` (data binding to an attachment id or a list of them: one picture per id; a value that already is a safe URL is drawn as it is, an id goes through the host's `fileUrl` option (xlarge serves `/api/v1/files/<id>` with the session) and the result is checked against unsafe schemes as in the Basic `Image`; without `fileUrl` a bare id draws the named placeholder), `label` (code, every picture's accessible name) | `pageTitle` |
| QrCode | `src` (data binding, wins: SVG markup the server drew, drawn as a `data:image/svg+xml` URI, or a safe picture URL), `link` (data binding, encoded by the pure encoder in `model.ts`, byte mode, level M, versions 1–40, when there is no `src` or its picture fails; an `otpauth:` link is offered as an "open in app" button, the host's `openInAppLabel`, when the host gives `openUrl`), `label` (code: the only accessible name and caption, default the host's `qrLabel`, `"QR code"`; the link text is never shown, since an `otpauth:` link carries a TOTP secret) | `pageTitle`, `when` |
| Button | `action` (the event name; without it the button is disabled), `label` (code) with `labelParams` (fills `{name}` as typed text), `icon` (a Basic Catalog icon name; other names draw no icon), `variant` (`secondary`/`quiet`/`ghost`/`plain`/`outline`, `danger`/`destructive`/`bad`; others primary), `confirm` (asks the host's `confirmQuestion` first, as `Confirm` does; only yes sends), `context` (sent as the literal event context; `@@` keys stand for literal `@` keys) | point-of-sale `add`, `cash`, `till`, `qty`, `product`, `queue`, `digest`, `away`, `version` (no captured screen uses them); `after`, `pageTitle`, `when`, `unless` |
| Confirm | `question` (code; default the host's `confirmQuestion`), `action` (sent with an empty context on yes only), `confirmLabel` (code; default the host's `confirmLabel`, `"Confirm"`), `cancel` (code of the cancel button; default the host's `cancelLabel`); either answer closes it | `confirm` (a `Confirm` always asks), `after`, `pageTitle` |
| Preview | `draft` (draft field names, read from the enclosing `Form`'s draft), `about` (the draft field holding the record the draft is about; sent when it is non-empty text), `action` (xlarge's export name, `export:<screen>?shape=...`; never sent as an A2UI event: once every named field holds a value, and `previewPauseMs` after the last change (host option, default 600 ms, as xlarge), the host's `preview(action, { draft, about })` option answers the URL or data URI of the drawn page, shown as a picture, checked against unsafe schemes, with an open button when the host gives `openUrl`; a rejection says `preview.failed`), `label` (code naming the page; default `preview.title`). Without `preview` the named draft values are listed as typed. No accept button: xlarge's client has none | `confirm`, `pageTitle`; outside a `Form` there is no draft to read (xlarge's draft is the screen's) |
| Columns | `children`, `widths` (each column's share: a positive number or its text, `2`, `"2fr"`, `"40%"`; missing entries share evenly). Side by side while Native Shell's `horizontalSizeClass` is `regular` (600pt and wider), stacked full-width while it is `compact` | `pageTitle` |
| Detail | `record` (data binding), `rows` (a list or a data binding to one: `Table.columns`-style entries: `field`, `label` code, `format`, `enumPrefix`, `edit`; or bare field names; without `rows`, every plain value under its key; an empty value reads `—`), `skipEmpty` (keeps an empty row that may be filled in), `update` (with it, a row with `edit` is corrected in place, as xlarge's spec 009: pressing the value opens a box holding the record's value under `edit.field` (default the row's `field`); save sends `{ event: { name: update, context: { id, version, [edit.field ?? field]: value } } }`, `id` and `version` as the record holds them, an emptied box as `null`; an unchanged value sends nothing; cancel puts it back. No edit button: xlarge has none) | `edit.input` beyond the keypad (the box is a text box: a number keypad for amounts, multi-line for `note`; xlarge reuses its form field's picker and checks), `pageTitle`, `when`, `unless` |
| Metric | `label`, `hint` (codes), `value` (data binding), `format` (`money`/`decimal`/`amount`, `percent`, `number`/`integer`/`count`; formatted from the text, never a float), `change` (data binding: always a whole-number percent with ▲/▼, whatever `format` is, rounded half away from zero on the text, then the host's `againstBeforeLabel`, default `"vs before"`; nothing when it is not a number), `better` (`up`/`down` and synonyms: the better way in the primary colour, the other destructive, flat muted), `accent` (`Text.tone` words: the card's edge colour) | `icon`, `pageTitle` |
| ChequeLeaf | `rows` (data binding: the physical leaves of a prenumbered cheque book, one leaf per row: its `number`, with `translate(statePrefix + state)` beside it in the destructive colour only when `state` is `void`; its `date`, `payee`, `amount` (formatted from its text, never a float), `amountWords` and `memo`; then its `stub` (`number`, `date`, `payee`, `amount`, `memo`) when the row has one), `statePrefix`. xlarge places each field at the row's `layout` (whole millimetres on a 210 × 99 mm printed leaf); Native Shell draws a screen, not a print, so here the fields stack in a readable card | `layout` (absolute millimetre positions), `pageTitle` |
| Wizard | `children` (one page each, shown one at a time with `n / total`, back and next — the host's `backLabel`, `nextLabel`), one draft for all pages (`FormDraftContext`; next refuses a page with an empty required field), `submit` (sent from the last page with the whole draft: defaults filled, blanks left out, amounts as typed text), `submitLabel` (code; default `action.save`), `confirm` (asks first), `after` (after a send, followed with `{}` as `Button.after`: a bare screen name as the event `screen:<after>`) | `pageTitle` |
| Steps | `answer` (the key of the steps in the answer the last action got back, default `steps`: read from the host's `answer()` option, never the data model, since an A2UI 1.0 event carries no answer back; also its `words` (the model's last words) and `stopped` (a code). A step `{ action, input, outcome, code?, opens? }` is named by `audit.action.<action>`, else `agents.step.looked_in` with the module's `<module>.nav.<module>`, else `agents.step.looked`; `done` and `refused` (its `code`) are marked; `waiting` has a take button (`agents.action.take`) that asks first, then sends `{ event: { name: action, context: input } }` and marks it `agents.outcome.taken`; `opens` is a button (`agents.action.open`) sending `{ event: { name: opens.screen, context: opens.about } }`, an id as `{ id }`. Without that list in the answer nothing is drawn; an empty list says `agents.step.none`) | `pageTitle` |
| Arrange | `items` (data binding: xlarge's lab-report layout blocks, `{ key?, kind, label, shown, kept?, removable?, text?, fields? }`; a missing `key` is `kind`, or `kind-<n>` when removable), per item its translated `label`, move up / move down buttons, a shown toggle (not for `kept`), a remove button (when `removable`) and a text box (when it has `text`) — keyboard: Tab, then Enter or Space; after a move or an add the new place is announced (`announce()`, the host's `movedText`, default `"{name} moved to {at} of {count}"`), `field` (the key the list is sent under; xlarge's layout uses `blocks`; `items` when missing), `add` (the new item's `kind`; turns the add button on), `addItem` (the new item's label code; default `addLabel`), `addLabel` (code of the add button; default the host's `addLabel`), new item `{ kind: add, label, shown: true, removable: true, text: "" }`, `save` (sends `{ [field]: items, version }`), `version` (data binding, sent as it came), `reset` (restores the data model's list; with `reset` it also sends that action with `{ version }`), `after` (followed after a send, as `Button.after`), `confirm` (asks before a send) | `fields` inside an item (kept and sent back as it came, not drawn), `pageTitle` |
| Chart | `data` (data binding: rows of `{ label, value, caption? }`, as `lab_samples.figures` answers; `caption`, when text, is shown instead of `value`; a row whose value is not a plain decimal is left out), `kind` (`sparkline`: a small line beside its big figure; `line`; `bars`; anything else a donut, as xlarge's client draws it; drawn on a `Canvas`), `format` (as `Metric.format`, from the text; default `number`), `label` (code: the title and accessible name), `labelPrefix` (i18n prefix, as `enumPrefix`; wins over `labelFormat`), `labelFormat` (a `Table` column format), `sum` (a sparkline's big figure is the exact total, added as decimal text, instead of the last value), `tones` (label → xlarge's tone word `neutral`/`info`/`success`/`warning`/`danger`: the bar's or slice's colour; others take `chart-1`…`chart-5`). Every chart but a sparkline lists its points; in a terminal (the `terminal` option, default `platform.idiom === "terminal"`) they show as a table instead of the drawing. No points says `chart.nothing` | `pageTitle` |
| Calendar | `month` (data binding: what `calendar.month` answers, `{ month, first, last, previous, next, items, sources, missing }`, each item `{ id, day, time?, title, screen, tone?, module, label }`), `screen` (previous and next send `{ event: { name: "screen:<screen>", context: { period: "between", from, to } } }` for that month). Weeks start on Monday, each day with its items; an item press sends its own `screen` with `{ id }`. A filter by `sources` (one module or `calendar.everything`; nothing is sent) and a `calendar.could_not_read` line per `missing` module. The heading and weekday words are the host's `monthLabels` and `weekdayLabels` (English by default) | `pageTitle` |
| Conversation | `rows` (data binding: what `talk.on` answers, newest first, drawn oldest first: `{ id, by: { id, name }, text, takenBack, at, mine, reactions: [{ emoji, count }], myReaction }`), `around` (data binding: what `talk.about` answers, `{ talk, people, unread }`; the record's id is read from `talk`, `r_<kind>_<id>`), `kind` (the record's kind), `screen` (the screen the record is shown on), `called` (data binding: what that screen calls the record). Sends `talk.write` `{ kind, id, screen, label, text, tell }`, `talk.react_on` `{ kind, id, message, emoji }`, `talk.take_back` `{ id }` (after a yes), and `talk.seen` `{ id }` once while unread; after a write, reaction or take-back, `screen:<screen>` `{ id }` reads the screen again. Earlier pages and mail templates are not drawn (xlarge's paging and ask channels) | `pageTitle` |

### Field inputs

| `input` | Control |
|---|---|
| `text` (and any unknown kind) | `Input` |
| `note` | multiline `Input` |
| `email`, `password` | `Input` with the email keyboard / masked |
| `number`, `decimal`, `money`, `kurus` | `Input` with a decimal keypad; the typed text is sent as a string, never a float |
| `date` | `DatePicker` (`YYYY-MM-DD`) |
| `datetime` | `Input` with a `YYYY-MM-DDTHH:MM` placeholder |
| `choice` | `Select` over `options` |
| `record` | `Select` over the rows under `/<from>` (`value` key sent, `show` key shown) |
| `records`, `flag`, `file`, `html` | not yet: drawn as text |
