// Customer prices on work order lines. Everything here is integer maths: money in cents,
// markup in basis points (3000 = 30%). This is the one place the rounding rule lives.

export const DEFAULT_PARTS_MARKUP_BPS = 3000;
export const MAX_PARTS_MARKUP_BPS = 100000; // 1000%
const MAX_PRICE_CENTS = 1_000_000_000; // $10,000,000.00

// Default price of one unit of a part: cost plus the markup, rounded to the cent with
// half a cent going up. A line's price is this times its quantity, never the other way round,
// so an invoice line always reads "2 x $19.50".
export function defaultUnitPriceCents(unitCostCents: number, markupBps: number): number {
  const cost = Math.max(0, Math.trunc(unitCostCents || 0));
  const bps = Math.max(0, Math.trunc(markupBps || 0));
  return Math.floor((cost * (10000 + bps) + 5000) / 10000);
}

// Whole-percent markup a price works out to over its cost (negative below cost), rounded
// half away from zero. Null when there is no cost to compare with.
export function impliedMarkupPercent(unitCostCents: number, unitPriceCents: number): number | null {
  const cost = Math.trunc(unitCostCents || 0);
  if (cost <= 0) return null;
  const diff = Math.trunc(unitPriceCents || 0) - cost;
  const magnitude = Math.floor((Math.abs(diff) * 200 + cost) / (2 * cost));
  return diff < 0 && magnitude > 0 ? -magnitude : magnitude;
}

export type PartLinePrice = {
  // 'unpriced': a default line on a work order invoiced before prices existed
  source: 'manual' | 'default' | 'unpriced';
  unitPriceCents: number | null;
  priceCents: number | null;
  // Only for a manual price; a default line is at the work order's markup
  markupPercent: number | null;
  // A default line whose part has no cost comes out at $0 and needs a price typing in
  needsManualPrice: boolean;
};

// Price of a PART line. `markupBps` is the markup in force for the work order, or null when
// the work order was invoiced before prices existed and its default lines stay unpriced.
export function partLinePrice(line: {
  quantity: number | null | undefined;
  unitCostCents: number | null | undefined;
  manualUnitPriceCents: number | null | undefined;
  markupBps: number | null;
}): PartLinePrice {
  const quantity = Math.max(0, Math.trunc(line.quantity || 0));
  const cost = Math.max(0, Math.trunc(line.unitCostCents || 0));
  if (line.manualUnitPriceCents != null) {
    const unit = line.manualUnitPriceCents;
    return { source: 'manual', unitPriceCents: unit, priceCents: unit * quantity, markupPercent: impliedMarkupPercent(cost, unit), needsManualPrice: false };
  }
  if (line.markupBps == null) {
    return { source: 'unpriced', unitPriceCents: null, priceCents: null, markupPercent: null, needsManualPrice: false };
  }
  const unit = defaultUnitPriceCents(cost, line.markupBps);
  return { source: 'default', unitPriceCents: unit, priceCents: unit * quantity, markupPercent: null, needsManualPrice: cost === 0 };
}

// A device line carries a price unless it is the customer's own device going back to them.
export function devicePriceApplies(role: string, targetAction: string): boolean {
  return !(role === 'PRIMARY' && targetAction === 'RETURN_TO_CUSTOMER');
}

function clean(input: string | null | undefined, strip: RegExp): string {
  return (input ?? '').replace(strip, '').trim();
}

// "19.5" or "$1,234.50" to cents, read digit by digit so no float is involved.
// Null for anything that is not a plain non-negative amount with at most two decimals.
export function parseUsdToCents(input: string | null | undefined): number | null {
  const m = /^(\d*)(?:\.(\d{1,2}))?$/.exec(clean(input, /[$,\s]/g));
  if (!m || (m[1] === '' && m[2] === undefined)) return null;
  const cents = Number(m[1] || '0') * 100 + Number((m[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= MAX_PRICE_CENTS ? cents : null;
}

// "30" or "12.5%" to basis points. Null outside 0% to 1000% or with more than two decimals.
export function parsePercentToBps(input: string | null | undefined): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?%?$/.exec(clean(input, /\s/g));
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(bps) && bps <= MAX_PARTS_MARKUP_BPS ? bps : null;
}

/** 3000 to "30%", 1250 to "12.5%". */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const hundredths = Math.abs(bps % 100);
  const decimals = hundredths === 0 ? '' : `.${String(hundredths).padStart(2, '0').replace(/0$/, '')}`;
  return `${whole}${decimals}%`;
}
