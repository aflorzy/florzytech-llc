import { describe, expect, it } from 'vitest';
import { allocateEven, allocateProportional, previewAllocation } from '../../src/lib/allocation';

describe('allocation utilities', () => {
  it('allocateProportional preserves total allocations exactly', () => {
    const rows = allocateProportional(
      [{ subtotalCents: 1000 }, { subtotalCents: 2000 }, { subtotalCents: 3000 }],
      { totalTaxCents: 101, totalShippingCents: 99, totalOtherFeesCents: 17 }
    );

    expect(rows.reduce((s, r) => s + r.taxCents, 0)).toBe(101);
    expect(rows.reduce((s, r) => s + r.shippingCents, 0)).toBe(99);
    expect(rows.reduce((s, r) => s + r.otherFeesCents, 0)).toBe(17);
  });

  it('allocateEven distributes remainder while preserving totals', () => {
    const rows = allocateEven(
      [{ subtotalCents: 0 }, { subtotalCents: 0 }, { subtotalCents: 0 }],
      { totalTaxCents: 2, totalShippingCents: 2, totalOtherFeesCents: 2 }
    );

    expect(rows.map((r) => r.taxCents).sort((a, b) => b - a)).toEqual([1, 1, 0]);
    expect(rows.reduce((s, r) => s + r.taxCents, 0)).toBe(2);
    expect(rows.reduce((s, r) => s + r.shippingCents, 0)).toBe(2);
    expect(rows.reduce((s, r) => s + r.otherFeesCents, 0)).toBe(2);
  });

  it('previewAllocation uses proportional logic for MANUAL preview fallback', () => {
    const rows = previewAllocation(
      'MANUAL',
      [{ subtotalCents: 100 }, { subtotalCents: 100 }],
      { totalTaxCents: 10, totalShippingCents: 0, totalOtherFeesCents: 0 }
    );

    expect(rows[0].taxCents + rows[1].taxCents).toBe(10);
  });
});
