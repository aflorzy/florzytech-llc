export type AllocationMethod = 'PROPORTIONAL_SUBTOTAL' | 'EVEN' | 'MANUAL';

export interface SplitLineInput {
  subtotalCents: number; // pretax amount
}

export interface SplitTotalsInput {
  totalTaxCents: number;
  totalShippingCents: number;
  totalOtherFeesCents: number;
}

export interface AllocatedLine extends SplitLineInput {
  taxCents: number;
  shippingCents: number;
  otherFeesCents: number;
  loadedTotalCents: number;
}

function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function distributeRemainder(parts: number[], targetSum: number): number[] {
  // Ensure sum(parts) == targetSum by adding 1 to the first k items if needed.
  const result = parts.slice();
  let diff = targetSum - result.reduce((a, b) => a + b, 0);
  let i = 0;
  while (diff !== 0 && result.length > 0) {
    const step = diff > 0 ? 1 : -1;
    result[i] += step;
    diff -= step;
    i = (i + 1) % result.length;
  }
  return result;
}

export function allocateProportional(lines: SplitLineInput[], totals: SplitTotalsInput): AllocatedLine[] {
  const subs = lines.map((l) => clampNonNeg(l.subtotalCents));
  const sumSub = subs.reduce((a, b) => a + b, 0);
  if (sumSub === 0) {
    // fallback to even split if all zeros
    return allocateEven(lines, totals);
  }

  const shares = subs.map((s) => s / sumSub);
  const taxParts = shares.map((sh) => Math.round(sh * clampNonNeg(totals.totalTaxCents)));
  const shipParts = shares.map((sh) => Math.round(sh * clampNonNeg(totals.totalShippingCents)));
  const feeParts = shares.map((sh) => Math.round(sh * clampNonNeg(totals.totalOtherFeesCents)));

  const adjTax = distributeRemainder(taxParts, clampNonNeg(totals.totalTaxCents));
  const adjShip = distributeRemainder(shipParts, clampNonNeg(totals.totalShippingCents));
  const adjFees = distributeRemainder(feeParts, clampNonNeg(totals.totalOtherFeesCents));

  return subs.map((subtotalCents, i) => {
    const taxCents = adjTax[i] || 0;
    const shippingCents = adjShip[i] || 0;
    const otherFeesCents = adjFees[i] || 0;
    const loadedTotalCents = subtotalCents + taxCents + shippingCents + otherFeesCents;
    return { subtotalCents, taxCents, shippingCents, otherFeesCents, loadedTotalCents };
  });
}

export function allocateEven(lines: SplitLineInput[], totals: SplitTotalsInput): AllocatedLine[] {
  const n = Math.max(1, lines.length);
  const subs = lines.map((l) => clampNonNeg(l.subtotalCents));
  const sumSub = subs.reduce((a, b) => a + b, 0);

  const baseTax = Math.floor(clampNonNeg(totals.totalTaxCents) / n);
  const baseShip = Math.floor(clampNonNeg(totals.totalShippingCents) / n);
  const baseFees = Math.floor(clampNonNeg(totals.totalOtherFeesCents) / n);

  const taxParts = Array(n).fill(baseTax);
  const shipParts = Array(n).fill(baseShip);
  const feeParts = Array(n).fill(baseFees);

  const adjTax = distributeRemainder(taxParts, clampNonNeg(totals.totalTaxCents));
  const adjShip = distributeRemainder(shipParts, clampNonNeg(totals.totalShippingCents));
  const adjFees = distributeRemainder(feeParts, clampNonNeg(totals.totalOtherFeesCents));

  return subs.map((subtotalCents, i) => {
    const taxCents = adjTax[i] || 0;
    const shippingCents = adjShip[i] || 0;
    const otherFeesCents = adjFees[i] || 0;
    const loadedTotalCents = subtotalCents + taxCents + shippingCents + otherFeesCents;
    return { subtotalCents, taxCents, shippingCents, otherFeesCents, loadedTotalCents };
  });
}

export function previewAllocation(
  method: AllocationMethod,
  lines: SplitLineInput[],
  totals: SplitTotalsInput
): AllocatedLine[] {
  if (method === 'PROPORTIONAL_SUBTOTAL') return allocateProportional(lines, totals);
  if (method === 'EVEN') return allocateEven(lines, totals);
  // For MANUAL, the UI will provide per-line values; preview here mirrors proportional as a neutral default
  return allocateProportional(lines, totals);
}
