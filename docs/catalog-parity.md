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

## xlarge catalog v1: 12 of 22

Before spec 003: 0 of 22. Spec 003 drew the four xlarge's `crm.deals`
screen uses; its round 2 (night spec 028) added `Text`, `Toast`, `Refusal`,
`Image`, `QrCode`, `Button`, `Confirm`, and `Preview`.

| Component | Drawn | Renderer | Tests | Fixture |
|---|---|---|---|---|
| Card | yes | `src/catalog/xlarge/Card.tsx` | `Card.test.tsx`, `crm_deals.test.tsx` | `crm-deals.json` (real, root) |
| Field | yes | `src/catalog/xlarge/Field.tsx` | `Field.test.tsx`, `crm_deals.test.tsx` | `crm-deals.json` (real, 10) |
| Form | yes | `src/catalog/xlarge/Form.tsx` | `Form.test.tsx`, `crm_deals.test.tsx` | `crm-deals.json` (real, 2) |
| Table | yes | `src/catalog/xlarge/Table.tsx` | `Table.test.tsx`, `crm_deals.test.tsx` | `crm-deals.json` (real, 1) |
| Text | yes | `src/catalog/xlarge/Text.tsx` | `Text.test.tsx`, `text_walk.test.tsx` | `text-synthetic.json` (synthetic: no real xlarge screen yet) |
| Toast | yes | `src/catalog/xlarge/Toast.tsx` | `Toast.test.tsx`, `text_walk.test.tsx` | `toast-synthetic.json` (synthetic: no real xlarge screen yet) |
| Refusal | yes | `src/catalog/xlarge/Refusal.tsx` | `Refusal.test.tsx`, `text_walk.test.tsx` | `refusal-synthetic.json` (synthetic: no real xlarge screen yet) |
| Image | yes | `src/catalog/xlarge/Image.tsx` | `Image.test.tsx`, `text_walk.test.tsx` | `image-synthetic.json` (synthetic: no real xlarge screen yet) |
| QrCode | yes | `src/catalog/xlarge/QrCode.tsx` | `QrCode.test.tsx`, `model.test.ts` (encoder), `text_walk.test.tsx` | `qrcode-synthetic.json` (synthetic: no real xlarge screen yet) |
| Button | yes | `src/catalog/xlarge/Button.tsx` (ask: `ask.tsx`) | `Button.test.tsx`, `model.test.ts`, `actions_walk.test.tsx` | `button-synthetic.json` (synthetic: no real xlarge screen yet) |
| Confirm | yes | `src/catalog/xlarge/Confirm.tsx` (ask: `ask.tsx`) | `Confirm.test.tsx`, `model.test.ts`, `actions_walk.test.tsx` | `confirm-synthetic.json` (synthetic: no real xlarge screen yet) |
| Preview | yes | `src/catalog/xlarge/Preview.tsx` (ask: `ask.tsx`) | `Preview.test.tsx`, `model.test.ts`, `actions_walk.test.tsx` | `preview-synthetic.json` (synthetic: no real xlarge screen yet) |
| Detail, Metric, Wizard, Columns, ChequeLeaf, Steps, Chart, Arrange, Conversation, Calendar | no | — | — | — |

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
| Text | `text` (shown as it is, wins), `code` (i18n code), `params` (fills `{name}` placeholders as typed text), `tone` (`muted`, `strong`, `accent`, `danger` and their synonyms; unknown tones draw plain) | `pageTitle`, `when`, `unless` |
| Toast | `code`, `params`: shown once, passes after `toastMs` (host option, default 5000 ms; `0` keeps it), on swipe, or on its close button; the same message does not return while the component stays | `pageTitle` |
| Refusal | `code`, `hint` (codes), `back` (its button sends the event `screen:<back>` with an empty context), `backLabel` (code; default the host's `backLabel`, `"Back"`) | `pageTitle` |
| Image | `src` (data binding; unsafe schemes refused as in the Basic `Image`), `label` (code, the accessible name) | `pageTitle` |
| QrCode | `src` (data binding, wins), `link` (data binding, encoded by the pure encoder in `model.ts`: byte mode, level M, versions 1–40), `label` (code: accessible name and caption; without it the link names the code) | `pageTitle`, `when` |
| Button | `action` (the event name; without it the button is disabled), `label` (code) with `labelParams` (fills `{name}` as typed text), `icon` (a Basic Catalog icon name; other names draw no icon), `variant` (`secondary`/`quiet`/`ghost`/`plain`/`outline`, `danger`/`destructive`/`bad`; others primary), `confirm` (asks the host's `confirmQuestion` first, as `Confirm` does; only yes sends), `context` (sent as the literal event context; `@@` keys stand for literal `@` keys) | point-of-sale `add`, `cash`, `till`, `qty`, `product`, `queue`, `digest`, `away`, `version` (no captured screen uses them); `after`, `pageTitle`, `when`, `unless` |
| Confirm | `question` (code; default the host's `confirmQuestion`), `action` (sent with an empty context on yes only), `confirmLabel` (code; default the host's `confirmLabel`, `"Confirm"`), `cancel` (code of the cancel button; default the host's `cancelLabel`); either answer closes it | `confirm` (a `Confirm` always asks), `after`, `pageTitle` |
| Preview | `about` (code, heading), `draft` (one line per entry: `{ label, value, format, enumPrefix }` formatted as a table cell, amounts as typed text; plain entries as they came; other objects key by key), `action` (sent with an empty context on accept), `label` (code; default the host's `acceptLabel`, `"Accept"`), `confirm` (asks first, as `Confirm` does) | `pageTitle` |

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
