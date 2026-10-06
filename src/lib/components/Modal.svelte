<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let { title, onclose, size = 'md', children, footer } = $props<{
    title: string;
    onclose: () => void;
    size?: 'md' | 'lg' | 'xl';
    children: Snippet;
    /** Right-aligned action row pinned under the body. */
    footer?: Snippet;
  }>();

  const widths = { md: 'max-w-3xl', lg: 'max-w-5xl', xl: 'max-w-6xl' };
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
  tabindex="-1"
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
>
  <div class="modal-panel w-full {widths[size as keyof typeof widths]} rounded-modal border border-line bg-surface shadow-pop" role="document">
    <div class="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
      <h2 id={titleId} class="text-xl font-semibold">{title}</h2>
      <button type="button" class="icon-btn" aria-label="Close" title="Close" onclick={onclose}>
        <Icon name="close" class="h-5 w-5" />
      </button>
    </div>
    <div class="px-6 py-5">
      {@render children()}
    </div>
    {#if footer}
      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
        {@render footer()}
      </div>
    {/if}
  </div>
</div>
