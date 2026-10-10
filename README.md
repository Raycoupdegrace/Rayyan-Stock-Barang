# thestock — Your inventory, simplified.

A real, working inventory management web app for small businesses. Track products,
available stock, incoming and outgoing goods, and a complete inventory history —
with a clean, premium SaaS interface.

Built with **HTML5 + CSS3 + vanilla JavaScript**. No build step, no dependencies,
no backend. Runs offline straight from `file://` and persists to `localStorage`.

---

## Quick start

1. Open the project folder.
2. Double-click `index.html` (or drag it into any modern browser).

That's it — no server, no install, no packages.

> Prefer a local server? `npx serve .` or `python -m http.server` both work, but are
> not required.

On first launch the app seeds a realistic demo dataset (coffee-shop style products
with ~24 movements) so every screen is populated. Use **Backup & Data → Reset demo
data** at any time, or **Delete everything** to start from a clean slate.

---

## Project structure

```
index.html        App shell: sidebar, 4 main views + Backup & Data, modals, toasts
style.css         Design system (tokens, layout, components, responsive rules)
script.js         All application logic (state, validation, transactions, import/export)
README.md         This file
tests/
  logic.test.js   Headless logic test suite (69 assertions, no dependencies)
```

---

## Features

**Dashboard** — total products, total available units, low-stock count, and movement
count, plus recent activity and a low-stock watchlist.

**Inventory** — full product CRUD with unique SKU enforcement (case-insensitive),
category and unit, current stock and minimum stock level. Live search, status filter
(all / low / out / healthy), and sorting. Low and out-of-stock rows are flagged.

**Stock In & Stock Out** — pick a product, choose direction, quantity, date and
optional notes. Stock In increases inventory, Stock Out decreases it, and outgoing
quantities are blocked when they exceed what's on hand.

**Reports** — every movement with date, product, SKU, type, quantity, resulting
balance and notes. Filter by free-text search, movement type, and a date range.
Export the current report to **CSV**.

**Backup & Data** — export a full **JSON** backup and restore it later, reset the demo
dataset, or erase everything. Storage usage is summarised in the sidebar.

**Throughout** — validation messages, helpful empty states, confirmation dialogs for
destructive actions, keyboard support (Esc closes dialogs), and toast notifications.

---

## How the data model stays consistent

The core rule: **`product.stock` is the authoritative balance, and it is only ever
changed by applying a transaction.** Every change writes a matching history entry, so
the balance and the movement history can never disagree.

- Creating a product with opening stock writes an `opening` transaction.
- Editing stock directly (from the product form) writes an `adjustment` transaction.
- Stock In / Stock Out write `movement` transactions.

A movement records the resulting balance at the time it happened, so the history
stays readable even after later changes.

Other guarantees:

- **No negative inventory** — outgoing quantities are validated against the current
  balance, both in the UI and in the underlying logic.
- **Unique IDs** for every product and transaction.
- **History is never silently deleted** — deleting a product keeps its movements in the
  report (shown against the product's last-known name/SKU) so the audit trail survives.
- **Safe parsing** — corrupted or tampered `localStorage` data is detected, backed up
  under a `thestock.corrupt.*` key, and replaced with a fresh state instead of crashing.
- **Strict numeric validation** — non-integer, negative, or oversized values are
  rejected with inline error messages.
- **No sensitive information** is stored or transmitted; everything lives in the
  browser's `localStorage` under the single key `thestock.v1`.

---

## Running the tests

The logic suite runs the real `script.js` inside a stubbed DOM using Node's `vm`
module — no test framework needed.

```bash
node tests/logic.test.js
```

Expected output ends with:

```
69 passed, 0 failed
```

It covers product creation, SKU uniqueness, opening stock, edits, adjustments, stock
in/out, the negative-stock guard, deletion, corrupted-storage recovery, and CSV
escaping.

---

## Manual test checklist

**Product creation**
- [ ] Inventory → **Add product**: create one with a new SKU and an opening stock.
- [ ] It appears in the table; the Dashboard product and unit counts increase.
- [ ] Create another with the *same SKU in different case* → rejected with a message.

**Stock in**
- [ ] Stock In & Out → Stock In → pick a product, quantity `10`, save.
- [ ] The product's stock rises by 10; a green `+10` entry appears in history.

**Stock out**
- [ ] Switch to Stock Out, quantity `4`, save.
- [ ] Stock drops by 4; a red `-4` entry appears, with the resulting balance.

**Insufficient stock**
- [ ] Try to stock out more than is on hand → blocked, with a clear error.
- [ ] Confirm the product's stock did **not** change.

**Low stock**
- [ ] Give a product a minimum stock level above its current stock.
- [ ] It is flagged in Inventory, counted on the Dashboard, and listed in the watchlist.

**Saving data**
- [ ] Refresh the page (F5) → products and movements are still there.
- [ ] Close the tab and reopen `index.html` → data persists.

**Export & backup**
- [ ] Reports → **Export CSV** → a `.csv` file downloads with the filtered rows.
- [ ] Backup & Data → **Export JSON** → a `.json` backup downloads.
- [ ] Make a change, then **Restore from file** → the backup is applied.
- [ ] Try importing a broken file → rejected, existing data untouched.

**Destructive actions**
- [ ] Delete a product → confirmation appears; cancel does nothing.
- [ ] Reset demo data and Delete everything → both require confirmation.

**Responsive**
- [ ] Narrow the window / open on a phone → sidebar collapses to a drawer.
- [ ] Tables scroll horizontally instead of breaking the layout.

---

## Tech notes

- **Persistence:** one `localStorage` key, `thestock.v1`, holding
  `{ schemaVersion, products[], transactions[] }`.
- **IDs:** time-based plus random suffix, so they stay unique across sessions.
- **Dates:** stored as `YYYY-MM-DD` and formatted without timezone drift.
- **Escaping:** all user text is HTML-escaped before rendering.
- **Accessibility:** labelled form fields, `aria-live` toasts, focus return on close,
  Esc-to-close dialogs, and reduced-motion support.

---

## Possible next steps

Backend + auth, multi-location stock, suppliers and purchase orders, barcode scanning,
costing and valuation, and role-based access. The data model was kept transaction-first
precisely so these can be layered on without rewriting the core.
