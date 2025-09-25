# Expense Allocation Plan (Tax, Shipping, Fees)

Status: Draft for review
Owner: Cascade

## Goals
- Provide item-only (pretax) and fully loaded (pretax + allocated tax + allocated shipping + allocated other fees) cost views.
- Support invoices/receipts with multiple items and a single total for tax/shipping/fees.
- Keep UX fast and simple inside the existing Expenses area.
- Preserve soft-delete behavior, avoid breaking existing data.

## Non-Goals (initial scope)
- File uploads / OCR of receipts.
- Multi-currency.
- Returns/exchanges workflow (handled later as negative expenses or credits).

---

## Approach Summary
We will implement a lightweight "Split Receipt" workflow within Expenses:
- Enter invoice-level totals (tax, shipping, other fees) and multiple item lines with pretax amounts.
- Allocate invoice totals to each line using a selectable method:
  - Proportional by pretax subtotal (default).
  - Even split.
  - Manual override (directly edit per-line allocations).
- Save as multiple Expense rows, grouped by a shared `splitGroupId` and storing per-line allocation fields.
- Reporting and tables can show either item-only or fully loaded amounts.

This approach minimizes schema and UX changes while covering the common case. If we outgrow this, we can evolve to a full Receipts/ReceiptLines model later without losing work.

---

## Data Model (Prisma) – Proposed
Add to `Expense`:
- `subtotalCents Int?` – Pretax amount for this line.
- `taxCents Int?` – Allocated tax for this line.
- `shippingCents Int?` – Allocated shipping for this line.
- `otherFeesCents Int?` – Allocated other fees for this line (e.g., handling).
- `splitGroupId String?` – ID shared by items that belong to the same invoice/receipt.
- `allocationMethod` enum? – `PROPORTIONAL_SUBTOTAL | EVEN | MANUAL` (optional per line; lines in a group typically share method).

Notes:
- Existing rows remain valid. For them, `subtotalCents` can equal `amountCents` (backfill logic described below), and the other fields remain null/0.
- Keep existing `amountCents` as-is. It represents the current total paid; post-migration we will ensure `amountCents = subtotalCents + taxCents + shippingCents + otherFeesCents` for new entries.
- Soft-delete via `archivedAt` remains unchanged.

Migration/backfill strategy:
- Add nullable fields above so migration is non-breaking.
- Optional backfill: for existing expenses, set `subtotalCents = amountCents` and others to 0. Not required immediately; can be done via a one-off script.

---

## Allocation Engine
- Inputs (per receipt):
  - Item lines: `{ subtotalCents, categoryId, deviceId?, notes? }`
  - Invoice totals: `totalTaxCents`, `totalShippingCents`, `totalOtherFeesCents`
  - Method: `PROPORTIONAL_SUBTOTAL | EVEN | MANUAL`

- Proportional by subtotal (default):
  - `share_i = subtotal_i / sum(subtotals)`
  - `tax_i = round(share_i * totalTax)`; same for shipping/fees
  - Balance any rounding differences on the last line (or distribute least-significant remainders to top-N lines deterministically).

- Even split:
  - `tax_i = round(totalTax / N)`; same for shipping/fees
  - Balance cents on last line(s) to keep totals exact.

- Manual:
  - User directly edits `tax_i`, `shipping_i`, `fees_i` per line; UI shows remaining/unallocated delta to reach invoice totals.

Validation rules:
- Sum of allocated `tax_i` equals `totalTax`; likewise for shipping and fees.
- `subtotal_i >= 0`, totals >= 0.
- If `sum(subtotals) = 0` and method is proportional, block or force even/manual.

---

## UX Design

### Split Receipt Modal (from Expenses page)
- Header fields (applied to all lines):
  - `vendor`, `date`, `paymentMethod` (optional), `notes` (optional for whole receipt)
- Line items table (add/remove rows):
  - `description/notes`, `category`, `device` (optional), `pretax amount (subtotal)`
- Invoice totals section:
  - `Tax`, `Shipping`, `Other fees`
  - `Allocation method` selector with helper text
- Allocation preview:
  - Shows per-line: `subtotal`, `tax`, `shipping`, `fees`, `loaded total`
  - Shows group totals and any rounding adjustments; enables manual edits when method = Manual
- Save:
  - Creates one Expense per line with shared `splitGroupId` and allocation fields.

### Expenses Table
- Keep current columns; adjust Amount to show fully loaded by default.
- Tooltip on Amount (or info icon) showing breakdown: `subtotal + tax + shipping + fees`.
- Optional table controls:
  - Toggle: "Show item-only amounts" vs "Show loaded amounts".
  - Filter by `splitGroupId` and a quick "View Receipt" expansion grouping (optional phase 2).

### Device Profit & Dashboard
- Device Profit: use loaded totals (more accurate real cost), but allow a toggle for item-only if desired.
- Dashboard: add Money Out (Loaded) and Money Out (Item-only) summary cards and deltas.

Accessibility:
- Keyboard navigable modal, labeled form inputs, ARIA for allocation method description.

---

## Server/API Changes
- New action: `?/split` on Expenses
  - Accepts shared header fields, lines array, invoice totals, and allocation method.
  - Validates inputs and re-computes allocation server-side (trust but verify client preview).
  - Creates multiple expenses in a single transaction for atomicity.
- Existing `create` and `update` remain for single-line entries.
- Types: define typed payload interfaces (no `any`), strict field validation, descriptive error messages.

---

## Reporting Changes
- Dashboard load:
  - Compute Money Out (Loaded) = sum of `amountCents` for non-device purchases.
  - Compute Money Out (Item-only) = sum of `subtotalCents` for non-device purchases.
- Device summary:
  - Use per-line loaded totals for expenses tied to the device.

---

## Testing Plan
- Unit tests for allocation engine:
  - Proportional rounding across edge cases (1–N lines, residual balancing).
  - Even split with remainder distribution.
  - Manual entry constraints and error paths.
- Integration tests:
  - Split save creates N expenses with exact totals.
  - Editing a line in Manual keeps group totals consistent (or shows delta).
- UI tests:
  - Modal interactions, keyboard support, tooltips, toggles.

---

## Rollout & Safety
- Feature flag: show "Split receipt" button only when enabled.
- Migration is additive and non-breaking.
- Soft-delete continues to work; split groups are independent of archive state of a single line.

---

## Open Questions (for confirmation)
1. Default allocation method = Proportional by subtotal? (recommended)
2. Show loaded amounts by default in tables? Add a quick toggle at top? (recommended)
3. Do you want `otherFeesCents` as a separate bucket from shipping + tax? (recommended yes)
4. Need a grouped receipt view (expand rows by `splitGroupId`) in v1, or can that be phase 2?
5. Should device profit always use loaded costs, with an optional item-only toggle?

---

## Implementation Steps (once approved)
1. Prisma schema update and migration for new Expense fields and enum.
2. Server:
   - Allocation utilities with exhaustive tests.
   - New `?/split` action: validation + transaction create.
3. UI:
   - Split Receipt modal with allocation preview and manual override.
   - Expenses table: amount breakdown tooltip; optional amount toggle.
4. Dashboard/Device summary toggles and metrics.

## Acceptance Criteria
- Can enter a multi-item receipt with invoice-level tax/shipping/fees.
- Allocation preview and save produce exact totals with correct rounding.
- Expenses list shows loaded amounts and breakdown tooltip.
- Device profit includes allocated costs when tied to a device.
- Dashboard can show both Money Out (Item-only) and Money Out (Loaded).
- No TypeScript `any`; linters clean; migrations included.
