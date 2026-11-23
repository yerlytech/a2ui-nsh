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

## xlarge catalog v1: 4 of 22

Before spec 003: 0 of 22. The four drawn now are the ones xlarge's
`crm.deals` screen uses.

| Component | Drawn | Renderer | Used by `crm.deals` |
|---|---|---|---|
| Card | yes | `src/catalog/xlarge/Card.tsx` | yes (root) |
| Field | yes | `src/catalog/xlarge/Field.tsx` | yes (10) |
| Form | yes | `src/catalog/xlarge/Form.tsx` | yes (2) |
| Table | yes | `src/catalog/xlarge/Table.tsx` | yes (1) |
| Text, Button, Toast, Detail, Metric, Wizard, Confirm, Refusal, Columns, Image, QrCode, ChequeLeaf, Steps, Chart, Arrange, Preview, Conversation, Calendar | no | — | no |

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
