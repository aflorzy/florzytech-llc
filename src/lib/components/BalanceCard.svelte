<script lang="ts">
  import { formatUsd, toneOf, toneClass } from '$lib/format';

  // The headline of the ledger: what is left, and the money in / money out that produced it,
  // drawn as two bars on one scale so the gap between them is the balance.
  let { label, hint, balanceCents, inCents, outCents, inHref, outHref, size = 'lg', testidPrefix } = $props<{
    label: string;
    hint?: string;
    balanceCents: number;
    inCents: number;
    outCents: number;
    inHref?: string;
    outHref?: string;
    size?: 'lg' | 'md';
    testidPrefix?: string;
  }>();

  const scale = $derived(Math.max(Math.abs(inCents), Math.abs(outCents), 1));
  const pct = (cents: number) => `${Math.max((Math.abs(cents) / scale) * 100, cents ? 1.5 : 0)}%`;
  const tid = (name: string) => (testidPrefix ? `${testidPrefix}-${name}` : undefined);
</script>

<div class="card grid items-center gap-x-10 gap-y-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] {size === 'lg' ? 'md:p-7' : ''}">
  <div>
    <div class="text-sm text-muted">{label}</div>
    <div
      data-testid={tid('spending-power')}
      class="figure mt-1 {size === 'lg' ? 'text-5xl' : 'text-3xl'} {toneClass[toneOf(balanceCents)]}"
    >{formatUsd(balanceCents)}</div>
    {#if hint}
      <p class="hint mt-2">{hint}</p>
    {/if}
  </div>

  <dl class="space-y-3">
    {#each [{ name: 'Money in (net)', cents: inCents, href: inHref, bar: 'bg-gain', id: 'money-in-net' }, { name: 'Money out', cents: outCents, href: outHref, bar: 'bg-loss', id: 'money-out' }] as row}
      <div>
        <div class="mb-1 flex items-baseline justify-between gap-3 text-sm">
          <dt class="text-muted">
            {#if row.href}<a class="hover:text-ink hover:underline underline-offset-2" href={row.href}>{row.name}</a>{:else}{row.name}{/if}
          </dt>
          <dd data-testid={tid(row.id)} class="figure text-base">{formatUsd(row.cents)}</dd>
        </div>
        <div class="h-2.5 overflow-hidden rounded-full bg-raised">
          <div class="h-full rounded-full {row.bar}" style:width={pct(row.cents)}></div>
        </div>
      </div>
    {/each}
  </dl>
</div>
