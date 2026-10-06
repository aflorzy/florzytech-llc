<script lang="ts" module>
  export type BadgeTone = 'neutral' | 'accent' | 'gain' | 'loss' | 'info';
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-raised text-muted',
    accent: 'bg-accent/15 text-accent-ink',
    gain: 'bg-gain/15 text-gain',
    loss: 'bg-loss/15 text-loss',
    info: 'bg-link/15 text-link'
  };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  let { tone = 'neutral', children } = $props<{ tone?: BadgeTone; children: Snippet }>();
</script>

<span class="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium {tones[tone as BadgeTone]}">
  {@render children()}
</span>
