<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import Icon, { type IconName } from '$lib/components/Icon.svelte';

  let { children } = $props();
  let open = $state(false);
  afterNavigate(() => (open = false));

  type NavItem = { href: string; label: string; icon: IconName };
  const groups: { label: string | null; items: NavItem[] }[] = [
    { label: null, items: [{ href: '/', label: 'Dashboard', icon: 'dashboard' }] },
    {
      label: 'Bench',
      items: [
        { href: '/devices', label: 'Devices', icon: 'device' },
        { href: '/work-orders', label: 'Work Orders', icon: 'workorder' },
        { href: '/parts', label: 'Parts', icon: 'parts' },
        { href: '/customers', label: 'Customers', icon: 'customers' }
      ]
    },
    {
      label: 'Ledger',
      items: [
        { href: '/income', label: 'Income', icon: 'income' },
        { href: '/expenses', label: 'Expenses', icon: 'expense' }
      ]
    },
    { label: null, items: [{ href: '/settings', label: 'Settings', icon: 'settings' }] }
  ];

  const isActive = (href: string) =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<div class="min-h-dvh md:grid md:grid-cols-[14.5rem_minmax(0,1fr)]">
  <aside class="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r">
    <div class="flex h-14 items-center justify-between px-4 md:h-16">
      <a href="/" class="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
        <span class="grid h-8 w-8 place-items-center rounded-control bg-accent text-sm font-semibold text-on-accent" aria-hidden="true">FZ</span>
        FlorzyTech Tracker
      </a>
      <button
        class="icon-btn md:hidden"
        onclick={() => (open = !open)}
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls="main-nav"
      >
        <Icon name={open ? 'close' : 'menu'} class="h-5 w-5" />
      </button>
    </div>

    <nav id="main-nav" aria-label="Main" class="{open ? 'block' : 'hidden'} px-3 pb-4 md:block">
      {#each groups as group}
        <div class="mt-4 first:mt-1">
          {#if group.label}
            <div class="mb-1 px-3 text-xs font-medium text-muted">{group.label}</div>
          {/if}
          <ul class="space-y-0.5">
            {#each group.items as item}
              {@const active = isActive(item.href)}
              <li>
                <a
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  class="flex items-center gap-3 rounded-control px-3 py-2 text-[0.9375rem] font-medium transition-colors
                    {active ? 'bg-accent/15 text-accent-ink' : 'text-muted hover:bg-raised hover:text-ink'}"
                >
                  <Icon name={item.icon} class="h-[1.125rem] w-[1.125rem] shrink-0" />
                  {item.label}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </nav>
  </aside>

  <main class="min-w-0 px-4 py-6 md:px-8 md:py-8">
    <div class="mx-auto max-w-7xl">
      {@render children()}
    </div>
  </main>
</div>
