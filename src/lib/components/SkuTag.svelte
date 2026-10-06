<script lang="ts">
  // A SKU or work-order code drawn like the label stuck on the device.
  let { code, href } = $props<{ code: string; href?: string }>();
  const base =
    'inline-block whitespace-nowrap rounded-md border border-dashed border-line-strong bg-raised px-1.5 py-0.5 font-display text-[0.8125rem] font-medium tracking-wide text-ink';
</script>

{#if href}<a {href} class="{base} transition-colors hover:border-accent hover:text-accent-ink">{code}</a>{:else}<span class={base}>{code}</span>{/if}
