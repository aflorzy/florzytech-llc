<script lang="ts">
  import type { Snippet } from 'svelte';
  import { formatUsd, toneOf, toneClass, type Tone } from '$lib/format';

  let { label, cents, value, tone = 'neutral', size = 'md', hint, testid, children } = $props<{
    label: string;
    /** Money amount in integer cents. Use `value` instead for counts or preformatted text. */
    cents?: number;
    value?: string | number;
    /** 'auto' colours by sign. */
    tone?: Tone | 'auto';
    size?: 'sm' | 'md';
    hint?: string;
    testid?: string;
    /** Extra content under the figure (links, badges). */
    children?: Snippet;
  }>();

  const resolved = $derived<Tone>(tone === 'auto' ? toneOf(cents) : tone);
</script>

<div class="card {size === 'sm' ? 'p-4' : ''}">
  <div class="text-sm text-muted">{label}</div>
  <div data-testid={testid} class="figure mt-1 {size === 'sm' ? 'text-xl' : 'text-2xl'} {toneClass[resolved]}">
    {cents !== undefined ? formatUsd(cents) : value}
  </div>
  {#if hint}
    <p class="hint">{hint}</p>
  {/if}
  {#if children}
    <div class="mt-2 text-sm">{@render children()}</div>
  {/if}
</div>
