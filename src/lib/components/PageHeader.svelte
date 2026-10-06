<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, subtitle, back, meta, actions } = $props<{
    title: string;
    subtitle?: string;
    /** Parent page link shown above the title on detail pages. */
    back?: { href: string; label: string };
    meta?: Snippet;
    actions?: Snippet;
  }>();
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
  <div class="min-w-0">
    {#if back}
      <a href={back.href} class="mb-1 inline-block text-sm text-muted hover:text-ink">{back.label}</a>
    {/if}
    <h1 class="text-3xl font-semibold tracking-tight">{title}</h1>
    {#if subtitle}
      <p class="mt-1 max-w-prose text-sm text-muted">{subtitle}</p>
    {/if}
    {#if meta}
      <div class="mt-2 flex flex-wrap items-center gap-2">{@render meta()}</div>
    {/if}
  </div>
  {#if actions}
    <div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</header>
