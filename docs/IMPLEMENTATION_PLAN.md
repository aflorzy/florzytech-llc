# Work Orders, Customers, Parts Costing, and Multi-Item Sales

This document tracks the plan, decisions, and progress for rolling out Work Orders, Customers, inventory costing for Parts (average cost), and multi-item Sales (Income Lines) at FlorzyTech.

All deletions are soft deletes via `archivedAt`, in line with repository conventions and user preferences.

## Decisions (Confirmed)

- **Work Order Linking:** Income is independent; Income records can optionally link to a Work Order (Option B).
- **Customers:** Single `Customer` entity with required `name`. Non-unique names allowed; unique IDs.
- **Parts in Split Receipts:** Add a Part selector on split lines; if chosen, quantity is required; treat line as inventory receipt.
- **Inline Part Creation:** Allow quick-add of a `Part` from the split UI when none exists.
- **Average Cost:** Average-cost per unit maintained on `Part`; include tax, shipping, and other fees in per-line cost used for averaging.
- **Work Order Statuses:** `OPEN`, `WAITING_PARTS`, `IN_PROGRESS`, `READY`, `DELIVERED`, `CANCELLED`.
- **Labor Capture:** Simple amount + description lines (no time tracking for v1).
- **Pricing Constraints:** Devices can only be sold once; warn if already sold. Auto-mark devices as SOLD when included on a completed work order (respecting that `SOLD`, `SHIPPED`, `DELIVERED` imply sold).
- **Tools:** Treated as assets (no SKUs), tracked via Expenses; not inventoried.

## High-Level Phases

- **Stage A (Minimal Viable Features):**
  - Customers CRUD and optional link in Income/Work Orders.
  - Work Orders minimal (create/list/detail; link devices; simple LABOR/NOTE items).
  - Add `Expense.vendorOrderNumber` and expose it in create/split/edit UIs.
- **Stage B (Inventory & Costing):**
  - Split Receipt lines support quantity and Part selection; inline new Part creation.
  - Inventory receipt movements created; update `Part.quantity` and `Part.averageCostCents` (weighted average including tax/shipping/fees allocations).
  - Work Order Part consumption movements with cost snapshots (COGS) and `quantity` decrements.
- **Stage C (Multi-Item Sales):**
  - Income builder with `IncomeLine` for devices, parts, labor, other.
  - Optional links: `Income.workOrderId`, `Income.customerId`.
  - Allocate/attribute fees, shipping, tax to lines where relevant; set `device.status = SOLD` on completion.

## Schema Changes (Completed and migrated through Stage B)

- **New Enums:** `WorkOrderStatus`, `WorkOrderTargetAction`, `WorkOrderDeviceRole`, `WorkOrderItemType`.
- **Customer:** Basic contact info and notes; relations to Work Orders and Incomes.
- **WorkOrder:** Core entity; code, status, targetAction, notes; optional `customerId`; relations to devices, items, incomes.
- **WorkOrderDevice:** Joins devices to a work order; role (PRIMARY/DONOR/ACCESSORY).
- **WorkOrderItem:** PART/LABOR/NOTE items; supports part/device refs, quantity for PART, unitCost snapshot, amount/description for LABOR/NOTE.
 - **Expense:** Added `vendorOrderNumber String?`.
 - **Income:** Added optional `workOrderId` and `customerId`.
 - **Device / Part:** Added back-relations for Work Order participation (`workOrderDevices`, `workOrderItems`).
 - **Stage B (Inventory):** Added `Part.averageCostCents` and `PartInventoryMovement` (RECEIPT/CONSUME/ADJUSTMENT) with `archivedAt`. Receipt movements created from split receipts; consumption movements created from Work Order PART items.

## Rollout Plan

- **Step 1: Run DB Migration (Stage A)**
  - Command: `npx prisma migrate dev --name work_orders_customers_stage_a`
  - Command: `npx prisma generate`
  - Back up your database before migrating.

- **Step 2: Implement Customers UI**
  - `src/routes/customers/` list/create/edit/archive.
  - Add optional `customerId` select on Income (head) and Work Order (header).

- **Step 3: Implement Work Orders (Minimal)**
  - `src/routes/work-orders/` list and create.
  - `src/routes/work-orders/[id]/` detail page with:
    - header (code, status, targetAction, customer, notes)
    - devices linked (add/remove devices; role selection)
    - items tab for LABOR/NOTE lines

- **Step 4: Expense vendorOrderNumber**
  - Add field to Expense create/split/edit UIs.

- **Step 5: Stage B Migration (Inventory & Average Cost) — Completed**
  - `Part.averageCostCents` and `PartInventoryMovement` added; transactional updates implemented.
  - Split receipt UI supports Part selection and quantity; receipt movements created on save; average costs updated.
  - Work Order PART consumption implemented with stock decrements and cost snapshots (COGS).

- **Step 6: Stage C Migration (Income Lines)**
  - Add `IncomeLine` and `IncomeLineType` (DEVICE/PART/LABOR/OTHER); relate `Income.lines`.
  - Implement Income Builder UI to enter multiple lines with per-line amounts, optional device/part/work order links.
  - Allocate platform/payment fees, shipping revenue/cost, and tax across lines (proportional by subtotal initially).
  - On save, update `Device.status = SOLD` for DEVICE lines (with safety: warn/skip if already SOLD/SHIPPED/DELIVERED).
  - [Optional] Backfill: create one IncomeLine per existing Income.

## Constraints & Validations

- **Soft Deletion:** Use `archivedAt` across all new models.
- **Inventory Safety:** Prevent consuming more parts than available; show actionable error.
- **Atomicity:** Use Prisma transactions for inventory/average updates.
- **Type Safety:** No `any`; explicit types in Svelte/TS.
- **Linting:** Fix Svelte/TS/Prisma lints as we go.

## Open Questions (None)

All key questions have been answered by the user. If new edge cases arise during implementation, they will be documented here and triaged.

## Status

- [x] Confirm requirements and decisions
- [x] Update schema for Stage A
- [x] Run Stage A migration (with DB backup)
- [x] Customers UI (list/create/edit/archive)
- [x] Work Orders minimal (list/create/detail; devices; LABOR/NOTE)
- [x] Expense vendorOrderNumber UI (create/split/edit)
- [x] Stage B migration & inventory features
- [ ] Stage C migration & sale builder (in progress)

---

Maintained by: Engineering
Last updated: 2025-09-26
