<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Icon, { type IconName } from '$lib/components/Icon.svelte';

  const links: { href: string; title: string; description: string; icon: IconName }[] = [
    { href: '/settings/vendors', title: 'Vendors', description: 'Where you buy devices, parts and supplies.', icon: 'vendor' },
    { href: '/settings/categories', title: 'Categories', description: 'Expense and income categories used for reporting.', icon: 'list' },
    { href: '/settings/pricing', title: 'Pricing', description: 'Default markup on parts used on work orders.', icon: 'percent' },
    { href: '/customers', title: 'Customers', description: 'People you repair for or sell to.', icon: 'customers' },
    { href: '/work-orders', title: 'Work orders', description: 'Repair jobs and what went into them.', icon: 'workorder' }
  ];
  const planned = ['Service fee templates', 'Invoice settings', 'SKU prefix'];
</script>

<PageHeader title="Settings" subtitle="Manage app configuration and reference data." />

<ul class="grid gap-4 sm:grid-cols-2">
  {#each links as l}
    <li>
      <a href={l.href} class="card flex items-center gap-4 transition-colors hover:border-accent">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-accent/15 text-accent-ink">
          <Icon name={l.icon} class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-display text-lg font-semibold">{l.title}</span>
          <span class="block text-sm text-muted">{l.description}</span>
        </span>
        <Icon name="chevron" class="h-4 w-4 shrink-0 text-faint" />
      </a>
    </li>
  {/each}
</ul>

<h2 class="mb-2 mt-8 text-lg font-semibold">Not built yet</h2>
<ul class="space-y-1 text-sm text-muted">
  {#each planned as p}
    <li>{p}</li>
  {/each}
</ul>
