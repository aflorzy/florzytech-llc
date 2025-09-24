export function brandCode(make: string) {
  const cleaned = (make || '').trim().toUpperCase();
  if (!cleaned) return 'GEN';
  // Take consonants first, then vowels if needed
  const letters = cleaned.replace(/[^A-Z]/g, '');
  const consonants = letters.replace(/[AEIOU]/g, '');
  const base = (consonants + letters).slice(0, 3);
  return base.padEnd(3, 'X');
}

export function yyyymm(date = new Date()) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${y}${m}`;
}

export function buildSku(prefix: string, date: Date, make: string, seq: number) {
  const code = brandCode(make);
  const ym = yyyymm(date);
  const n = (seq || 1).toString().padStart(3, '0');
  const p = (prefix || 'FZ').toUpperCase();
  return `${p}-${ym}-${code}-${n}`;
}
