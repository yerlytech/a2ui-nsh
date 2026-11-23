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
| Preview | yes | `src/catalog/xlarge/Preview.tsx` (ask: `ask.tsx`) | `Preview.test.tsx`, `model.test.ts`, `actions_walk.test.tsx` | `preview-synthetic.json` (synthetic: no real xlarge screen yet) |
| Columns | yes | `src/catalog/xlarge/Columns.tsx` | `Columns.test.tsx`, `model.test.ts`, `display_walk.test.tsx` | `columns-synthetic.json` (synthetic: no real xlarge screen yet) |
| Detail | yes | `src/catalog/xlarge/Detail.tsx` | `Detail.test.tsx`, `model.test.ts`, `display_walk.test.tsx` | `detail-synthetic.json` (synthetic: no real xlarge screen yet) |
| Metric | yes | `src/catalog/xlarge/Metric.tsx` | `Metric.test.tsx`, `model.test.ts`, `display_walk.test.tsx` | `metric-synthetic.json` (synthetic: no real xlarge screen yet) |
| ChequeLeaf | yes | `src/catalog/xlarge/ChequeLeaf.tsx` | `ChequeLeaf.test.tsx`, `model.test.ts`, `display_walk.test.tsx` | `chequeleaf-synthetic.json` (synthetic: no real xlarge screen yet) |
| Wizard | yes | `src/catalog/xlarge/Wizard.tsx` (draft: `context.ts`, ask: `ask.tsx`) | `Wizard.test.tsx`, `model.test.ts`, `flows_walk.test.tsx` | `wizard-synthetic.json` (synthetic: no real xlarge screen yet) |
| Steps | yes | `src/catalog/xlarge/Steps.tsx` | `Steps.test.tsx`, `model.test.ts`, `flows_walk.test.tsx` | `steps-synthetic.json` (synthetic: no real xlarge screen yet) |
| Arrange | yes | `src/catalog/xlarge/Arrange.tsx` (ask: `ask.tsx`) | `Arrange.test.tsx`, `model.test.ts`, `flows_walk.test.tsx`, `tests/targets/xlarge.target.test.tsx` (keyboard, TUI and Web) | `arrange-synthetic.json` (synthetic: no real xlarge screen yet) |
| Chart | yes | `src/catalog/xlarge/Chart.tsx` | `Chart.test.tsx`, `model.test.ts`, `rich_walk.test.tsx` | `chart-synthetic.json` (synthetic: no real xlarge screen yet) |
| Calendar | yes | `src/catalog/xlarge/Calendar.tsx` | `Calendar.test.tsx`, `model.test.ts`, `rich_walk.test.tsx` | `calendar-synthetic.json` (synthetic: no real xlarge screen yet) |
| Conversation | yes | `src/catalog/xlarge/Conversation.tsx` | `Conversation.test.tsx`, `model.test.ts`, `rich_walk.test.tsx` | `conversation-synthetic.json` (synthetic: no real xlarge screen yet) |

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
| Table | `rows`, `columns` (`field`, `label`, `format`, `enumPrefix`, `grow`), `title`, `rowAction`, `rowOpens`, `search`, `searchAction`, `searchInput` | `board`, `boardFirst`, `build`, `card`, `cards`, `group*`, `listAction`, `listInput` (paging), `move`, `moveField`, `searchText`, `pageTitle`, `when`, `unless` |
| Text | `code` (i18n code; wins over `text`, as in xlarge's web client), `text` (shown as it is when there is no `code`), `params` (fills `{name}` placeholders as typed text), `tone` (`muted`, `strong`, `accent`, `danger` and their synonyms; unknown tones draw plain) | `pageTitle`, `when`, `unless` |
| Toast | `code`, `params`: shown once, passes after `toastMs` (host option, default 5000 ms; `0` keeps it), on swipe, or on its close button; the same message does not return while the component stays | `pageTitle` |
| Refusal | `code`, `hint` (codes), `back` (its button sends the event `screen:<back>` with an empty context), `backLabel` (code; default the host's `backLabel`, `"Back"`) | `pageTitle` |
| Image | `src` (data binding to an attachment id or a list of them: one picture per id; a value that already is a safe URL is drawn as it is, an id goes through the host's `fileUrl` option (xlarge serves `/api/v1/files/<id>` with the session) and the result is checked against unsafe schemes as in the Basic `Image`; without `fileUrl` a bare id draws the named placeholder), `label` (code, every picture's accessible name) | `pageTitle` |
| QrCode | `src` (data binding, wins: SVG markup the server drew, drawn as a `data:image/svg+xml` URI, or a safe picture URL), `link` (data binding, encoded by the pure encoder in `model.ts`, byte mode, level M, versions 1–40, when there is no `src` or its picture fails; an `otpauth:` link is offered as an "open in app" button, the host's `openInAppLabel`, when the host gives `openUrl`), `label` (code: the only accessible name and caption, default the host's `qrLabel`, `"QR code"`; the link text is never shown, since an `otpauth:` link carries a TOTP secret) | `pageTitle`, `when` |
| Button | `action` (the event name; without it the button is disabled), `label` (code) with `labelParams` (fills `{name}` as typed text), `icon` (a Basic Catalog icon name; other names draw no icon), `variant` (`secondary`/`quiet`/`ghost`/`plain`/`outline`, `danger`/`destructive`/`bad`; others primary), `confirm` (asks the host's `confirmQuestion` first, as `Confirm` does; only yes sends), `context` (sent as the literal event context; `@@` keys stand for literal `@` keys) | point-of-sale `add`, `cash`, `till`, `qty`, `product`, `queue`, `digest`, `away`, `version` (no captured screen uses them); `after`, `pageTitle`, `when`, `unless` |
| Confirm | `question` (code; default the host's `confirmQuestion`), `action` (sent with an empty context on yes only), `confirmLabel` (code; default the host's `confirmLabel`, `"Confirm"`), `cancel` (code of the cancel button; default the host's `cancelLabel`); either answer closes it | `confirm` (a `Confirm` always asks), `after`, `pageTitle` |
| Preview | `about` (code, heading), `draft` (one line per entry: `{ label, value, format, enumPrefix }` formatted as a table cell, amounts as typed text; plain entries as they came; other objects key by key), `action` (sent with an empty context on accept), `label` (code; default the host's `acceptLabel`, `"Accept"`), `confirm` (asks first, as `Confirm` does) | `pageTitle` |
| Columns | `children`, `widths` (each column's share: a positive number or its text, `2`, `"2fr"`, `"40%"`; missing entries share evenly). Side by side while Native Shell's `horizontalSizeClass` is `regular` (600pt and wider), stacked full-width while it is `compact` | `pageTitle` |
| Detail | `record` (data binding), `rows` (`Table.columns`-style entries: `field`, `label` code, `format`, `enumPrefix`; or bare field names; without `rows`, every plain value under its key), `skipEmpty`, `update` (an edit button, the host's `editLabel`, default `"Edit"`, sends `{ event: { name: update, context: { id } } }` with the record's `id`) | `pageTitle`, `when`, `unless` |
| Metric | `label`, `hint` (codes), `value` (data binding), `format` (`money`/`decimal`/`amount`, `percent`, `number`/`integer`/`count`; formatted from the text, never a float), `change` (data binding, signed and formatted as the value, with ▲/▼), `better` (`up`/`down` and synonyms: the better way in the primary colour, the other destructive, flat muted), `accent` (`Text.tone` words: the card's edge colour) | `icon`, `pageTitle` |
| ChequeLeaf | `rows` (data binding: the leaf's states, oldest first; each row's `state` as `translate(statePrefix + state)`, `date` or `at` as a date, `amount` formatted from its text, `party` or `partner`, `note`; the last row, the state now, drawn stronger), `statePrefix`. The row keys are this renderer's reading; no real xlarge screen confirms them yet | `pageTitle` |
| Wizard | `children` (one page each, shown one at a time with `n / total`, back and next — the host's `backLabel`, `nextLabel`), one draft for all pages (`FormDraftContext`; next refuses a page with an empty required field), `submit` (sent from the last page with the whole draft: defaults filled, blanks left out, amounts as typed text), `submitLabel` (code; default `action.save`), `confirm` (asks first), `after` (after a send, followed with `{}` as `Button.after`: a bare screen name as the event `screen:<after>`) | `pageTitle` |
| Steps | `answer` (the data-model key `/<answer>`: a list of steps or `{ steps, current }`; a step is a name code or `{ name, label, state/status/done/current }`; marked done, current or to do, named by the host's `stepStateLabels`) | `pageTitle` |
| Arrange | `items` (data binding), `field` (the key each item shows; plain items as they came), move up / move down buttons per item (keyboard: Tab, then Enter), `add` (code naming the new item's text box; turns adding on), `addLabel` (code of the add button; default the host's `addLabel`), `addItem` (the new item's key; default `field`, else the plain text), `save` (sends `{ items, version }`: every item in the new order), `version` (data binding, sent as it came), `reset` (the reset button restores the data model's order; with `reset` it also sends that action with `{ version }`), `confirm` (asks before a send) | `after`, `pageTitle` |
| Chart | `data` (data binding: rows of `label`/`name`/`key`/`x` and `value`/`amount`/`count`/`total`/`y`, or an object of label → value), `kind` (`bar`, the default; `line`/`area`/`trend`; `pie`/`donut`/`doughnut`; drawn on a `Canvas`), `format` (as `Metric.format`, from the text), `label` (code: the heading and accessible name), `labelFormat` (a `Table` column format), `labelPrefix` (i18n prefix, as `enumPrefix`), `sum` (an exact total, added as decimal text, under the host's `totalLabel`, default `"Total"`), `tones` (label → `Text.tone` word: the bar's or slice's colour; others take `chart-1`…`chart-5`). A legend lists every point; in a terminal (the `terminal` option, default `platform.idiom === "terminal"`) the points show as a table instead of the drawing. The row keys are this renderer's reading; no real xlarge screen confirms them yet | `pageTitle` |
| Calendar | `month` (data binding: `"YYYY-MM"` or a date in it, or `{ month \| start, days }` with `days` a list of `{ date, count \| label }` or an object of date → mark), `screen` (a day press sends `{ event: { name: "screen:<screen>", context: { date } } }`; without it the days are not buttons). Weeks start on Monday; the heading and weekday words are the host's `monthLabels` and `weekdayLabels` (English by default). The value's keys are this renderer's reading; no real xlarge screen confirms them yet | `pageTitle` |
| Conversation | `rows` (data binding: messages oldest first, `text`/`body`/`message`, `from`/`author`/`by`, `at`/`date`/`sentAt`, this side's when `mine` or `out` is true or `direction` is `out`/`outgoing`, drawn at the end), `kind` (code: the channel, in the heading), `called` (data binding: who the thread is with, in the heading and the author of the other side's unnamed messages), `around` (data binding: the `id` of the message the thread opens around, marked and reported selected), `screen` (a message press sends `{ event: { name: "screen:<screen>", context: { id } } }`). The readings of `rows`, `kind`, `called`, and `around` are this renderer's; no real xlarge screen confirms them yet | `pageTitle` |

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
