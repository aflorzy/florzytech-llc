-- Retire the Sale Builder (#14). An income is money received, tied to a work order and/or
-- a device on the income itself. The lines the Sale Builder kept are folded into their
-- income and the table is dropped.
--
-- What each figure read before, and so what must hold for it not to move:
--   device net          the device's own lines (amount and allocated fees), else the income
--   work order revenue  the lines pointed at the work order, else the incomes on it; and
--                       once any line pointed at a work order, incomes without one were ignored
--   received            every line of an income on the work order
--   spending power      the income itself, never the lines
--
-- The rule, written for the Sale Builder incomes that exist:
--   * amount, fees, shipping, tax, date and work order stay as they are on the income
--   * lines naming one device: the income is tied to that device
--   * lines naming several devices: the income is split into one income per device, each
--     with that device's lines' amount, fees, shipping and tax, all on the income's work order
--     (decided on #14). The pieces add up to the income, so every device keeps its share and
--     the work order and spending power keep the whole. The income keeps its row for the
--     device it already named (else the largest line); the others are new rows. Every piece's
--     notes name the sale it came from and the split.
--   * no line took parts out of stock, so parts and their movements are not touched
--
-- Anything else stops the migration here, before any row is changed.
DO $$
DECLARE
  problems TEXT;
BEGIN
  WITH folded AS (
    SELECT
      h."id",
      h."archivedAt" IS NULL AS live,
      h."deviceId" AS head_device,
      h."workOrderId" AS head_work_order,
      COUNT(DISTINCT l."deviceId") AS devices,
      ARRAY_AGG(DISTINCT l."deviceId") FILTER (WHERE l."deviceId" IS NOT NULL) AS line_devices,
      BOOL_OR(l."archivedAt" IS NOT NULL) AS archived_line,
      BOOL_OR(l."type" = 'PART' AND COALESCE(l."quantity", 0) > 0) AS stock_line,
      BOOL_OR(l."workOrderId" IS NOT NULL AND l."workOrderId" IS DISTINCT FROM h."workOrderId") AS other_work_order,
      SUM(l."amountCents") <> h."amountCents" AS amount_differs,
      COUNT(*) FILTER (WHERE l."workOrderId" IS NOT NULL) > 0
        AND (
          COALESCE(SUM(l."amountCents") FILTER (WHERE l."workOrderId" IS NOT NULL), 0) <> h."amountCents"
          OR COALESCE(SUM(l."allocatedPlatformFeesCents") FILTER (WHERE l."workOrderId" IS NOT NULL), 0) <> h."platformFeesCents"
          OR COALESCE(SUM(l."allocatedPaymentFeesCents") FILTER (WHERE l."workOrderId" IS NOT NULL), 0) <> h."paymentFeesCents"
          OR COALESCE(SUM(l."allocatedShippingRevenueCents") FILTER (WHERE l."workOrderId" IS NOT NULL), 0) <> h."shippingRevenueCents"
          OR COALESCE(SUM(l."allocatedShippingCostCents") FILTER (WHERE l."workOrderId" IS NOT NULL), 0) <> h."shippingCostCents"
        ) AS work_order_lines_differ,
      COALESCE(SUM(l."amountCents") FILTER (WHERE l."deviceId" IS NOT NULL), 0) <> h."amountCents"
        OR COALESCE(SUM(l."allocatedPlatformFeesCents") FILTER (WHERE l."deviceId" IS NOT NULL), 0) <> h."platformFeesCents"
        OR COALESCE(SUM(l."allocatedPaymentFeesCents") FILTER (WHERE l."deviceId" IS NOT NULL), 0) <> h."paymentFeesCents"
        OR COALESCE(SUM(l."allocatedShippingRevenueCents") FILTER (WHERE l."deviceId" IS NOT NULL), 0) <> h."shippingRevenueCents"
        OR COALESCE(SUM(l."allocatedShippingCostCents") FILTER (WHERE l."deviceId" IS NOT NULL), 0) <> h."shippingCostCents"
        OR COALESCE(SUM(l."allocatedTaxCents") FILTER (WHERE l."deviceId" IS NOT NULL), 0) <> h."taxCollectedCents" AS device_lines_differ
    FROM "Income" h
    JOIN "IncomeLine" l ON l."incomeId" = h."id"
    GROUP BY h."id"
  ),
  problem AS (
    SELECT "id", 'has an archived line' AS reason FROM folded WHERE archived_line
    UNION ALL
    SELECT "id", 'has a part line with a quantity, which took the part out of stock itself' FROM folded WHERE stock_line
    UNION ALL
    SELECT "id", 'has a line on a different work order than the income' FROM folded WHERE other_work_order
    UNION ALL
    SELECT "id", 'names a device that none of its device lines name' FROM folded
      WHERE devices >= 1 AND head_device IS NOT NULL AND NOT (head_device = ANY (line_devices))
    UNION ALL
    SELECT "id", 'covers several devices and has no work order to tie the incomes to' FROM folded
      WHERE devices > 1 AND head_work_order IS NULL
    UNION ALL
    -- Archived ones too: the split replaces the income's own amounts with its lines'
    SELECT "id", 'covers several devices and its device lines do not add up to the income, so splitting it would change the money' FROM folded
      WHERE devices > 1 AND device_lines_differ
    UNION ALL
    SELECT "id", 'has device lines that do not add up to the income, so the device net would change' FROM folded
      WHERE live AND devices = 1 AND device_lines_differ
    UNION ALL
    SELECT "id", 'has work order lines that do not add up to the income, so the work order revenue would change' FROM folded
      WHERE live AND work_order_lines_differ
    UNION ALL
    SELECT "id", 'is on a work order and its lines do not add up to its amount, so the amount received would change' FROM folded
      WHERE live AND head_work_order IS NOT NULL AND amount_differs
    UNION ALL
    -- A plain income that is ignored today because another income has lines on its work order
    SELECT h."id", 'is left out of its work order''s revenue today because another income has lines on that work order' FROM "Income" h
      WHERE h."archivedAt" IS NULL
        AND h."workOrderId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "IncomeLine" l
          WHERE l."incomeId" = h."id" AND l."workOrderId" = h."workOrderId" AND l."archivedAt" IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM "IncomeLine" l
          JOIN "Income" o ON o."id" = l."incomeId"
          WHERE l."workOrderId" = h."workOrderId" AND l."archivedAt" IS NULL AND o."archivedAt" IS NULL
        )
  )
  SELECT string_agg('income ' || "id" || ' ' || reason, '; ' ORDER BY "id", reason) INTO problems FROM problem;

  IF problems IS NOT NULL THEN
    RAISE EXCEPTION 'retire_sale_builder: Sale Builder data this migration does not handle. Nothing was changed. %', problems;
  END IF;
END $$;

-- Several devices on one sale: what each device's lines carried, in the order the pieces
-- take. Piece 1 keeps the income's own row: the device the income already names, else the
-- largest line, then by SKU.
CREATE TEMP TABLE "_sale_builder_split" AS
SELECT * FROM (
  SELECT
    l."incomeId" AS income_id,
    l."deviceId" AS device_id,
    d."sku" AS sku,
    SUM(l."amountCents")::int AS amount,
    SUM(l."allocatedPlatformFeesCents")::int AS platform_fees,
    SUM(l."allocatedPaymentFeesCents")::int AS payment_fees,
    SUM(l."allocatedShippingRevenueCents")::int AS shipping_revenue,
    SUM(l."allocatedShippingCostCents")::int AS shipping_cost,
    SUM(l."allocatedTaxCents")::int AS tax,
    ROW_NUMBER() OVER (
      PARTITION BY l."incomeId"
      ORDER BY (l."deviceId" = h."deviceId") DESC NULLS LAST, SUM(l."amountCents") DESC, d."sku"
    ) AS n,
    COUNT(*) OVER (PARTITION BY l."incomeId") AS pieces
  FROM "IncomeLine" l
  JOIN "Income" h ON h."id" = l."incomeId"
  JOIN "Device" d ON d."id" = l."deviceId"
  GROUP BY l."incomeId", l."deviceId", d."sku", h."deviceId"
) s
WHERE pieces > 1;

CREATE TEMP TABLE "_sale_builder_split_note" AS
SELECT
  income_id,
  'Split from Sale Builder sale ' || income_id || ' into ' || COUNT(*) || ' incomes, one per device: ' || string_agg(
    sku || ' ' || to_char(amount / 100.0, 'FM999999990.00'),
    ', ' ORDER BY n
  ) AS note
FROM "_sale_builder_split"
GROUP BY income_id;

-- Pieces 2 and on: a new income for each other device, copied from the sale
INSERT INTO "Income" (
  "id", "createdAt", "updatedAt", "archivedAt", "date", "type", "amountCents", "deviceId", "channelId", "categoryId",
  "platformFeesCents", "paymentFeesCents", "shippingRevenueCents", "shippingCostCents", "taxCollectedCents",
  "notes", "workOrderId", "customerId"
)
SELECT
  gen_random_uuid()::text, h."createdAt", CURRENT_TIMESTAMP, h."archivedAt", h."date", h."type", s.amount, s.device_id, h."channelId", h."categoryId",
  s.platform_fees, s.payment_fees, s.shipping_revenue, s.shipping_cost, s.tax,
  CONCAT_WS(' | ', NULLIF(TRIM(h."notes"), ''), m.note), h."workOrderId", h."customerId"
FROM "_sale_builder_split" s
JOIN "Income" h ON h."id" = s.income_id
JOIN "_sale_builder_split_note" m ON m.income_id = s.income_id
WHERE s.n > 1;

-- Piece 1: the income itself, cut down to its one device
UPDATE "Income" h
SET
  "deviceId" = s.device_id,
  "amountCents" = s.amount,
  "platformFeesCents" = s.platform_fees,
  "paymentFeesCents" = s.payment_fees,
  "shippingRevenueCents" = s.shipping_revenue,
  "shippingCostCents" = s.shipping_cost,
  "taxCollectedCents" = s.tax,
  "notes" = CONCAT_WS(' | ', NULLIF(TRIM(h."notes"), ''), m.note)
FROM "_sale_builder_split" s
JOIN "_sale_builder_split_note" m ON m.income_id = s.income_id
WHERE h."id" = s.income_id AND s.n = 1;

DROP TABLE "_sale_builder_split_note";

DROP TABLE "_sale_builder_split";

-- One device on the sale: the income is tied to it.
UPDATE "Income" h
SET "deviceId" = s.device_id
FROM (
  SELECT "incomeId", MIN("deviceId") AS device_id
  FROM "IncomeLine" WHERE "deviceId" IS NOT NULL GROUP BY "incomeId" HAVING COUNT(DISTINCT "deviceId") = 1
) s
WHERE h."id" = s."incomeId" AND h."deviceId" IS NULL;

-- DropForeignKey
ALTER TABLE "IncomeLine" DROP CONSTRAINT "IncomeLine_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "IncomeLine" DROP CONSTRAINT "IncomeLine_incomeId_fkey";

-- DropForeignKey
ALTER TABLE "IncomeLine" DROP CONSTRAINT "IncomeLine_partId_fkey";

-- DropForeignKey
ALTER TABLE "IncomeLine" DROP CONSTRAINT "IncomeLine_workOrderId_fkey";

-- DropTable
DROP TABLE "IncomeLine";

-- DropEnum
DROP TYPE "IncomeLineType";
