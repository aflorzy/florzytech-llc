// Cost per unit used to value stock: the running average once the part has been received
// through a receipt, otherwise the unit cost entered by hand on the Parts page.
export function effectiveUnitCostCents(part: { averageCostCents?: number | null; unitCostCents?: number | null }): number {
  const average = part.averageCostCents ?? 0;
  if (average > 0) return average;
  return Math.max(0, part.unitCostCents ?? 0);
}
