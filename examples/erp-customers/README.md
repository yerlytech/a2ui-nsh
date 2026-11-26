# ERP Customers Demo (`examples/erp-customers`)

Pure A2UI v1.0 JSON-driven ERP **Customer List + Tabbed Customer Edit Form** rendered natively on Native Shell (`nsh 0.7.1`). All customer records in `a2ui/seed_customers.json` are completely invented (no real companies or people).

## Architecture

- `a2ui/surface.json` — Strictly validated A2UI v1.0 `createSurface` payload using Basic Catalog v1 components (`Row`, `Column`, `List`, `Card`, `Tabs`, `Modal`, `Divider`, `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `DateTimeInput`, `Text`, `Icon`) and standard functions (`required`, `email`, `regex`, `length`, `numeric`, `and`, `formatString`, `formatCurrency`, `formatDate`).
- `agent.ts` — Pure zero-I/O TypeScript local ERP agent consuming outbound A2UI v1.0 `action` envelopes (`select_customer`, `new_customer`, `save_customer`, `delete_customer`, `cancel_delete`, `search_customers`, `clear_search`, `reload_customers`, `retry_load`, `dismiss_banner`) and emitting only `createSurface`, `updateComponents`, and `updateDataModel` messages.
- `ErpCustomersApp.tsx` / `App.tsx` — Thin `nsh` host shell enforcing `"capabilities": { "host": ["a2ui.*"] }` in `nsh.json`.

## Automated Verification

```bash
nsh check examples/erp-customers
nsh test examples/erp-customers
nsh build examples/erp-customers --release --out target/erp-release
```

## Manual macOS Walk (for a human reviewer)

Run the native macOS AppKit app:

```bash
nsh run examples/erp-customers --target macos
```

The window opens at `nsh`'s default size and is resized by hand (`examples/erp-customers/nsh.json` omits the `"window"` block so the app stays within strict `"capabilities": { "host": ["a2ui.*"] }` without granting `"application": true`).

Walk every item at desktop width (`1280 x 800`) and narrow/phone width (`390 x 640`):

1. **Master-detail & responsive layout:** Confirm the left Customer List and right Customer Edit Form sit side-by-side at `1280 px` (`desktop`) and stack vertically when resizing the window below `768 px` (`compact`).
2. **Search & empty search state:** Type `Alder` in **Search customers** and confirm only `Alder Creek Logistics` appears. Type `zzz-no-match` and confirm the empty-search card appears with **Clear Search**, then click **Clear Search** to restore all 5 customers.
3. **Selection & tabbed editing:** Click **Edit** on `Cobalt Harbor Supply` and confirm the form updates. Edit **Name**, **Email**, **Tax ID**, toggle **Segment** chips, **Active** checkbox, and **Notes** on **Details**; switch to **Billing** and verify formatted annual currency, formatted contract start date, **Payment Terms** radio group, **Contract Start** date picker, and **Annual Value (USD)**.
4. **Live `@checks` validation:** Enter an invalid email (`not-an-email`) or malformed Tax ID (`BAD-ID`) and confirm inline error messages appear and **Save Customer** disables; restore valid values and confirm **Save Customer** re-enables.
5. **Create & save:** Click **New Customer**, fill valid fields, click **Save Customer**, and confirm the new customer appears in the list with a save confirmation banner.
6. **Delete confirmation modal:** Select an existing customer, click **Delete**, confirm the modal names the customer and warns of permanent removal. Dismiss with **Cancel** or `Escape` (record stays), then reopen and click **Confirm Delete** (record is removed and modal closes).
7. **Loading & server error states:** Click **Reload** to see the loading skeleton transition back to the directory. Click **Simulate Error** to see the sync error banner, then click **Retry** to recover.

## Manual TUI Walk (for a human reviewer)

Install the terminal development host once if needed (`nsh component add tui`), then launch the terminal UI:

```bash
just run-tui
# or directly:
nsh run examples/erp-customers --target tui
# or run a prebuilt bundle:
just build && nsh-tui-host --bundle target/erp-release/bundle.js
```

Run the automated TUI suite (18-component catalog + ERP walk at `120 × 40` and `80 × 24` cells) and inspect the rendered cell-grid snapshots (`target/walk-tui/*.json` and plain-text `target/walk-tui/*.txt`):

```bash
just test-tui
```

Key terminal controls (`nsh` TUI): `Tab` / `Shift+Tab` move between controls, arrow keys move spatially (and scrub `Slider` when focused), `Enter` / `Space` activate buttons/checkboxes/tabs, `Escape` leaves a field or dismisses `Modal`, `C-h e` opens diagnostics, and `Ctrl+C` copies selection or quits.

Walk every item at a wide terminal (`120 × 40` cells = `960 × 640` pt → `desktop`) and a compact terminal (`80 × 24` cells = `640 × 384` pt → `compact`):

1. **Master-detail & responsive terminal grid:** Confirm `Showing 5 of 5 customers (desktop)` shows the Customer List and Edit Form side-by-side at `120 × 40`, and resizing the terminal to `80 × 24` switches to `Showing 5 of 5 customers (compact)` in a stacked column without clipped labels.
2. **Search & empty search state:** Focus **Search customers**, type `Alder`, and confirm only `Alder Creek Logistics` stays listed. Type `zzz-no-match` and confirm the empty-search card appears with **Clear Search**; activate **Clear Search** to restore all 5 customers.
3. **Selection & tabbed editing:** Select `Cobalt Harbor Supply` and edit **Name**, **Email**, **Tax ID**, **Segment** chips, **Active** (`[✓]` / `[ ]`), and **Notes** on **Details**; switch to **Billing** and verify `$34,800.00`, `Jan 10, 2026`, **Payment Terms** radio items (`(●)` / `( )`), **Contract Start** calendar popup, and **Annual Value (USD)**.
4. **Live `@checks` validation:** Enter `not-an-email` in **Email** or `BAD-ID` in **Tax ID** and confirm inline validation errors appear and **Save Customer** becomes disabled (faint); restore valid values and confirm **Save Customer** re-enables.
5. **Create & save:** Activate **New Customer**, fill valid **Name**, **Email**, and **Tax ID**, activate **Save Customer**, and confirm the new row and save confirmation banner appear.
6. **Delete confirmation modal:** Select an existing customer and activate **Delete**. Confirm the centered framed dialog names the customer and traps `Tab` focus; dismiss with **Cancel** and with `Escape` (record stays), then reopen and activate **Confirm Delete** (record is removed and dialog closes).
7. **Loading & server error states:** Activate **Reload** to see the loading skeleton transition back to the directory. Activate **Simulate Error** to see the sync error banner, then activate **Retry** to recover.
8. **Expected TUI differences:** Verify 24×24 decorative `Icon` views are omitted cleanly (`nsh` `LeftOut::IfIcon`), icon-only buttons display their `accessibilityLabel` as text, 1 pt `Divider` rules collapse cleanly into grid spacing, and `Video` / `AudioPlayer` surfaces render compact terminal fallback cards (`Video playback is unavailable in terminal.` / `Audio playback is unavailable in terminal.`) rather than blank boxes or crashes.

## Manual Web Walk (for a human reviewer)

Install the Web/WASM runtime once if needed (`nsh component add web`). Supported browsers: Safari 16.4+, Chrome/Edge 97+, Firefox 108+.

Run the live development server (`http://127.0.0.1:8790/`):

```bash
just run-web
# or directly:
nsh run examples/erp-customers --target web
```

Or package and serve the self-contained static site (`target/erp-web/ERP Customers/`, served on `http://127.0.0.1:4173/`, using the in-app local A2UI agent with no `web.host` backend bridge):

```bash
just package-web
# or package and serve immediately:
nsh package examples/erp-customers --target web --out target/erp-web --run
```

Run the automated headless Chromium suite (18-component catalog + ERP walk at desktop `1280 × 800` and phone `390 × 844`, saving PNG screenshots under `target/walk-web/`):

```bash
just test-web
```

Key browser controls (`nsh` Web): `Tab` / `Shift+Tab` move between pressables and inputs, `Return` / `Space` activate buttons/checkboxes/tabs, mouse wheel / trackpad scrolls the innermost scroll view, and `Escape` leaves a field or dismisses `Modal`.

Walk every item at desktop width (`1280 × 800`, `desktop`) and phone width (`390 × 844`, `compact`) in browser DevTools device emulation or by resizing the window:

1. **Master-detail & responsive layout:** Confirm `Showing 5 of 5 customers (desktop)` shows the Customer List and Customer Edit Form side-by-side at `1280 × 800`, and resizing below `768 px` (e.g. `390 × 844`) switches to `Showing 5 of 5 customers (compact)` stacked vertically. Confirm long customer e-mail addresses stay on a single line and ellipsize cleanly (`…`) instead of breaking mid-word.
2. **Search & empty search state:** Type `Alder` in **Search customers** and confirm only `Alder Creek Logistics` appears. Type `zzz-no-match` and confirm the empty-search card appears with **Clear Search**, then click **Clear Search** to restore all 5 customers.
3. **Selection & tabbed editing:** Click **Edit** on `Cobalt Harbor Supply` and confirm the form updates. Edit **Name**, **Email**, **Tax ID**, toggle **Segment** chips, **Active** checkbox, and **Notes** on **Details**; switch to **Billing** and verify `$34,800.00`, `Jan 10, 2026`, **Payment Terms** radio group, **Contract Start** date picker popup, and **Annual Value (USD)**.
4. **Live `@checks` validation:** Enter `not-an-email` in **Email** or `BAD-ID` in **Tax ID** and confirm inline error messages appear and **Save Customer** disables; restore valid values and confirm **Save Customer** re-enables.
5. **Create & save:** Click **New Customer**, fill valid **Name**, **Email**, and **Tax ID**, click **Save Customer**, and confirm the new customer row and save confirmation banner appear.
6. **Delete confirmation modal:** Select an existing customer, click **Delete**, and confirm the modal names the customer and dims the page behind it. Dismiss with **Cancel** and with `Escape` (record stays), then reopen and click **Confirm Delete** (record is removed and modal closes).
7. **Loading & server error states:** Click **Reload** to see the loading skeleton transition back to the directory. Click **Simulate Error** to see the sync error banner, then click **Retry** to recover.
8. **Static bundle, strict CSP & expected web target limits:** Open browser DevTools Console and Network while walking the packaged site (`target/erp-web/ERP Customers/`). Confirm zero uncaught JS errors and zero CSP violations (`index.html` enforces `connect-src 'self'`, and the site works under `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; base-uri 'none'`). Under default `"capabilities": { "host": ["a2ui.*"] }`, outbound network/media requests are blocked by both the `nsh` capability sandbox and CSP, and `AudioPlayer` degrades cleanly without crashing.
