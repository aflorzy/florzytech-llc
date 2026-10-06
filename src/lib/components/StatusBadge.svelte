<script lang="ts" module>
  import type { BadgeTone } from './Badge.svelte';

  // Device and work-order statuses share one vocabulary of tones:
  // waiting = neutral, on the bench = accent, ready/listed = info, money made or handed over = gain.
  const statusTones: Record<string, BadgeTone> = {
    PURCHASED: 'neutral',
    AWAITING_SHIPMENT: 'neutral',
    ARRIVED: 'neutral',
    OPEN: 'accent',
    DIAGNOSING: 'accent',
    WAITING_PARTS: 'accent',
    REPAIRING: 'accent',
    IN_PROGRESS: 'accent',
    READY: 'info',
    LISTED: 'info',
    SOLD: 'gain',
    SHIPPED: 'gain',
    DELIVERED: 'gain',
    CANCELLED: 'loss',
    // Work-order device roles and item types
    PRIMARY: 'accent',
    DONOR: 'neutral',
    ACCESSORY: 'neutral',
    PART: 'info',
    LABOR: 'accent',
    NOTE: 'neutral',
    // Income types
    SALE: 'gain',
    SERVICE: 'info',
    DEPOSIT: 'neutral'
  };
</script>

<script lang="ts">
  import Badge from './Badge.svelte';
  import { humanizeEnum } from '$lib/format';
  let { status } = $props<{ status: string }>();
</script>

<Badge tone={statusTones[status] ?? 'neutral'}>{humanizeEnum(status)}</Badge>
