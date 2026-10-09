import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARTS_MARKUP_BPS,
  defaultUnitPriceCents,
  devicePriceApplies,
  formatBps,
  impliedMarkupPercent,
  parsePercentToBps,
  parseUsdToCents,
  partLinePrice
} from '../../src/lib/pricing';

describe('defaultUnitPriceCents', () => {
  it('starts from a 30% default', () => {
    expect(DEFAULT_PARTS_MARKUP_BPS).toBe(3000);
  });

  it('adds the markup to the unit cost', () => {
    expect(defaultUnitPriceCents(1500, 3000)).toBe(1950);
    expect(defaultUnitPriceCents(10000, 3000)).toBe(13000);
    expect(defaultUnitPriceCents(1500, 0)).toBe(1500);
    expect(defaultUnitPriceCents(1500, 10000)).toBe(3000);
  });

  it('rounds half a cent up and anything below it down', () => {
    // 15 x 1.3 = 19.5
    expect(defaultUnitPriceCents(15, 3000)).toBe(20);
    // 5 x 1.3 = 6.5
    expect(defaultUnitPriceCents(5, 3000)).toBe(7);
    // 50 x 1.25 = 62.5
    expect(defaultUnitPriceCents(50, 2500)).toBe(63);
    // 3 x 1.3 = 3.9
    expect(defaultUnitPriceCents(3, 3000)).toBe(4);
    // 1 x 1.3 = 1.3
    expect(defaultUnitPriceCents(1, 3000)).toBe(1);
    // 8 x 1.3 = 10.4
    expect(defaultUnitPriceCents(8, 3000)).toBe(10);
    // 25 x 1.125 = 28.125
    expect(defaultUnitPriceCents(25, 1250)).toBe(28);
    // 33 x 1.3333 = 43.9989
    expect(defaultUnitPriceCents(33, 3333)).toBe(44);
    // 1 x 1.4999 just under the half
    expect(defaultUnitPriceCents(1, 4999)).toBe(1);
    expect(defaultUnitPriceCents(1, 5000)).toBe(2);
  });

  it('always returns whole cents, including for amounts that are inexact as floats', () => {
    // 1.15 * 100 and 0.07 * 1.3 are classic float traps
    expect(defaultUnitPriceCents(115, 3000)).toBe(150); // 149.5
    expect(defaultUnitPriceCents(7, 3000)).toBe(9); // 9.1
    expect(defaultUnitPriceCents(99999999, 3000)).toBe(129999999); // 129999998.7
    for (let cost = 0; cost <= 2000; cost++) {
      for (const bps of [0, 1, 999, 1250, 3000, 3333, 10000, 43333]) {
        const price = defaultUnitPriceCents(cost, bps);
        expect(Number.isInteger(price)).toBe(true);
        // Within half a cent of the exact value, with the half going up
        expect(price * 10000 - cost * (10000 + bps)).toBeGreaterThan(-5000);
        expect(price * 10000 - cost * (10000 + bps)).toBeLessThanOrEqual(5000);
      }
    }
  });

  it('prices a part with no cost at $0', () => {
    expect(defaultUnitPriceCents(0, 3000)).toBe(0);
    expect(defaultUnitPriceCents(-500, 3000)).toBe(0);
  });
});

describe('impliedMarkupPercent', () => {
  it('works out the percentage a typed price is over cost', () => {
    expect(impliedMarkupPercent(1500, 8000)).toBe(433);
    expect(impliedMarkupPercent(1500, 1950)).toBe(30);
    expect(impliedMarkupPercent(1500, 1800)).toBe(20);
    expect(impliedMarkupPercent(1500, 1500)).toBe(0);
  });

  it('is negative when the price is below cost', () => {
    expect(impliedMarkupPercent(1500, 1000)).toBe(-33);
    expect(impliedMarkupPercent(1500, 0)).toBe(-100);
  });

  it('rounds to the nearest whole percent, halves away from zero', () => {
    expect(impliedMarkupPercent(200, 201)).toBe(1); // 0.5%
    expect(impliedMarkupPercent(200, 199)).toBe(-1); // -0.5%
    expect(impliedMarkupPercent(1000, 1004)).toBe(0); // 0.4%
    expect(impliedMarkupPercent(1000, 996)).toBe(0); // -0.4%
    expect(Object.is(impliedMarkupPercent(1000, 996), -0)).toBe(false);
  });

  it('has no percentage when there is no cost to compare with', () => {
    expect(impliedMarkupPercent(0, 5000)).toBeNull();
    expect(impliedMarkupPercent(0, 0)).toBeNull();
    expect(impliedMarkupPercent(-1, 100)).toBeNull();
  });
});

describe('partLinePrice', () => {
  it('uses the default markup per unit, then multiplies by quantity', () => {
    expect(partLinePrice({ quantity: 1, unitCostCents: 1500, manualUnitPriceCents: null, markupBps: 3000 })).toEqual({
      source: 'default',
      unitPriceCents: 1950,
      priceCents: 1950,
      markupPercent: null,
      needsManualPrice: false
    });
    expect(partLinePrice({ quantity: 2, unitCostCents: 1500, manualUnitPriceCents: null, markupBps: 3000 })).toMatchObject({ unitPriceCents: 1950, priceCents: 3900 });
    // 3 x round(19.5) = 60, not round(3 x 19.5) = 59
    expect(partLinePrice({ quantity: 3, unitCostCents: 15, manualUnitPriceCents: null, markupBps: 3000 })).toMatchObject({ unitPriceCents: 20, priceCents: 60 });
  });

  it('uses a manual price as typed, with the percentage it works out to', () => {
    expect(partLinePrice({ quantity: 1, unitCostCents: 1500, manualUnitPriceCents: 8000, markupBps: 3000 })).toEqual({
      source: 'manual',
      unitPriceCents: 8000,
      priceCents: 8000,
      markupPercent: 433,
      needsManualPrice: false
    });
    expect(partLinePrice({ quantity: 2, unitCostCents: 1500, manualUnitPriceCents: 1800, markupBps: 3000 })).toMatchObject({ priceCents: 3600, markupPercent: 20 });
    expect(partLinePrice({ quantity: 2, unitCostCents: 1500, manualUnitPriceCents: 1000, markupBps: 3000 })).toMatchObject({ priceCents: 2000, markupPercent: -33 });
  });

  it('keeps a manual price of $0 as a price, not as "no price"', () => {
    expect(partLinePrice({ quantity: 2, unitCostCents: 1500, manualUnitPriceCents: 0, markupBps: 3000 })).toEqual({
      source: 'manual',
      unitPriceCents: 0,
      priceCents: 0,
      markupPercent: -100,
      needsManualPrice: false
    });
  });

  it('asks for a manual price when the part has no cost', () => {
    expect(partLinePrice({ quantity: 2, unitCostCents: 0, manualUnitPriceCents: null, markupBps: 3000 })).toEqual({
      source: 'default',
      unitPriceCents: 0,
      priceCents: 0,
      markupPercent: null,
      needsManualPrice: true
    });
    expect(partLinePrice({ quantity: 2, unitCostCents: 0, manualUnitPriceCents: 2500, markupBps: 3000 })).toEqual({
      source: 'manual',
      unitPriceCents: 2500,
      priceCents: 5000,
      markupPercent: null,
      needsManualPrice: false
    });
  });

  it('leaves a default line unpriced when the work order was invoiced before prices existed', () => {
    expect(partLinePrice({ quantity: 2, unitCostCents: 1500, manualUnitPriceCents: null, markupBps: null })).toEqual({
      source: 'unpriced',
      unitPriceCents: null,
      priceCents: null,
      markupPercent: null,
      needsManualPrice: false
    });
    expect(partLinePrice({ quantity: 2, unitCostCents: 1500, manualUnitPriceCents: 4000, markupBps: null })).toMatchObject({ source: 'manual', priceCents: 8000, markupPercent: 167 });
  });

  it('treats a missing quantity as none', () => {
    expect(partLinePrice({ quantity: null, unitCostCents: 1500, manualUnitPriceCents: null, markupBps: 3000 })).toMatchObject({ unitPriceCents: 1950, priceCents: 0 });
    expect(partLinePrice({ quantity: 0, unitCostCents: null, manualUnitPriceCents: null, markupBps: 3000 })).toMatchObject({ priceCents: 0, needsManualPrice: true });
  });
});

describe('devicePriceApplies', () => {
  it('prices every device line except a customer\'s own device being returned', () => {
    expect(devicePriceApplies('PRIMARY', 'SELL')).toBe(true);
    expect(devicePriceApplies('PRIMARY', 'RETURN_TO_CUSTOMER')).toBe(false);
    expect(devicePriceApplies('ACCESSORY', 'SELL')).toBe(true);
    expect(devicePriceApplies('ACCESSORY', 'RETURN_TO_CUSTOMER')).toBe(true);
    expect(devicePriceApplies('DONOR', 'SELL')).toBe(true);
    expect(devicePriceApplies('DONOR', 'RETURN_TO_CUSTOMER')).toBe(true);
  });
});

describe('parseUsdToCents', () => {
  it('reads dollars into whole cents without float error', () => {
    expect(parseUsdToCents('80')).toBe(8000);
    expect(parseUsdToCents('80.5')).toBe(8050);
    expect(parseUsdToCents('19.99')).toBe(1999);
    expect(parseUsdToCents('1.15')).toBe(115);
    expect(parseUsdToCents('0.07')).toBe(7);
    expect(parseUsdToCents('.5')).toBe(50);
    expect(parseUsdToCents('0')).toBe(0);
    expect(parseUsdToCents(' $1,234.50 ')).toBe(123450);
  });

  it('rejects anything that is not a plain non-negative amount', () => {
    for (const bad of ['', '   ', 'abc', '-5', '1.234', '1e3', '12.', '.', '1.2.3', 'NaN', '99999999999']) {
      expect(parseUsdToCents(bad)).toBeNull();
    }
    expect(parseUsdToCents(null)).toBeNull();
    expect(parseUsdToCents(undefined)).toBeNull();
  });
});

describe('parsePercentToBps', () => {
  it('reads a percentage into basis points', () => {
    expect(parsePercentToBps('30')).toBe(3000);
    expect(parsePercentToBps('30%')).toBe(3000);
    expect(parsePercentToBps('12.5')).toBe(1250);
    expect(parsePercentToBps('33.33')).toBe(3333);
    expect(parsePercentToBps('0')).toBe(0);
    expect(parsePercentToBps('1000')).toBe(100000);
  });

  it('rejects negatives, more than two decimals, more than 1000% and junk', () => {
    for (const bad of ['', '-5', '12.345', 'abc', '1000.01', '1e2', '30 %%']) {
      expect(parsePercentToBps(bad)).toBeNull();
    }
    expect(parsePercentToBps(null)).toBeNull();
  });
});

describe('formatBps', () => {
  it('shows whole percentages without decimals and others without trailing zeros', () => {
    expect(formatBps(3000)).toBe('30%');
    expect(formatBps(1250)).toBe('12.5%');
    expect(formatBps(3333)).toBe('33.33%');
    expect(formatBps(0)).toBe('0%');
    expect(formatBps(5)).toBe('0.05%');
  });

  it('round-trips with parsePercentToBps', () => {
    for (const bps of [0, 1, 50, 1250, 3000, 3333, 100000]) {
      expect(parsePercentToBps(formatBps(bps))).toBe(bps);
    }
  });
});
