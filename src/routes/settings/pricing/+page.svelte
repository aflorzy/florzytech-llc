<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { formatUsd } from '$lib/format';
  import { defaultUnitPriceCents, formatBps, parsePercentToBps } from '$lib/pricing';

  let { data, form } = $props<{ data: { partsMarkupBps: number }; form?: { success?: boolean; error?: string } | null }>();
  const saved = $derived(formatBps(data.partsMarkupBps).replace('%', ''));
  // What is in the box right now, for the worked example under it
  let typed = $state<string | null>(null);
  const typedBps = $derived(parsePercentToBps(typed ?? saved));
  const exampleCostCents = 1500;
</script>

<PageHeader title="Pricing" subtitle="What customers are charged for parts used on work orders." back={{ href: '/settings', label: 'Settings' }} />

<form method="post" action="?/save" class="form-panel max-w-xl">
  {#if form?.error}
    <div class="alert-error" role="alert">{form.error}</div>
  {/if}
  <div>
    <label class="label" for="partsMarkup">Default parts markup (%)</label>
    <input id="partsMarkup" name="partsMarkup" inputmode="decimal" autocomplete="off" required class="input max-w-[10rem]" value={saved} oninput={(e) => (typed = e.currentTarget.value)} />
    <p class="hint">
      {#if typedBps !== null}
        A part that cost {formatUsd(exampleCostCents)} is priced at {formatUsd(defaultUnitPriceCents(exampleCostCents, typedBps))} each.
      {:else}
        Enter a percentage from 0 to 1000, with at most two decimals.
      {/if}
    </p>
  </div>
  <ul class="list-disc space-y-1 pl-5 text-sm text-muted">
    <li>The price is worked out per unit, rounded to the cent, then multiplied by the quantity.</li>
    <li>A change applies to new work orders and to work orders that are not invoiced yet.</li>
    <li>An invoiced work order keeps the percentage it was invoiced at.</li>
    <li>A price typed on a line is never changed by this setting.</li>
  </ul>
  <div class="flex items-center gap-3">
    <button class="btn btn-primary">Save</button>
    {#if form?.success}
      <span class="text-sm text-gain" role="status">Saved.</span>
    {/if}
  </div>
</form>
