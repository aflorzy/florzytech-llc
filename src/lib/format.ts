const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

/** Integer cents to "$1,234.56" (negatives as "-$1,234.56"). */
export function formatUsd(cents: number | null | undefined): string {
  return usd.format((cents || 0) / 100);
}

export type Tone = 'gain' | 'loss' | 'neutral';

/** Colour tone for a signed amount: zero stays neutral. */
export function toneOf(cents: number | null | undefined): Tone {
  const n = cents || 0;
  return n > 0 ? 'gain' : n < 0 ? 'loss' : 'neutral';
}

export const toneClass: Record<Tone, string> = {
  gain: 'text-gain',
  loss: 'text-loss',
  neutral: ''
};

/** "WAITING_PARTS" to "Waiting parts". */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '-';
  const s = value.split('_').join(' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
