<script lang="ts">
  import '../app.css';
  let { children } = $props();
  let open = $state(false);
</script>

<nav class="border-b bg-white/80 dark:bg-zinc-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-zinc-900/60">
  <div class="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
    <a href="/" class="font-semibold">FlorzyTech Tracker</a>

    <button class="sm:hidden p-2" onclick={() => (open = !open)} aria-label="Toggle navigation">
      ☰
    </button>

    <ul class="hidden sm:flex gap-4">
      <li><a href="/" class="hover:underline">Dashboard</a></li>
      <li><a href="/devices" class="hover:underline">Devices</a></li>
      <li><a href="/expenses" class="hover:underline">Expenses</a></li>
      <li><a href="/income" class="hover:underline">Income</a></li>
      <li><a href="/parts" class="hover:underline">Parts</a></li>
      <li><a href="/settings" class="hover:underline">Settings</a></li>
    </ul>
  </div>
  {#if open}
    <ul class="sm:hidden px-4 pb-3 space-y-2">
      <li><a href="/" class="block">Dashboard</a></li>
      <li><a href="/devices" class="block">Devices</a></li>
      <li><a href="/expenses" class="block">Expenses</a></li>
      <li><a href="/income" class="block">Income</a></li>
      <li><a href="/parts" class="block">Parts</a></li>
      <li><a href="/settings" class="block">Settings</a></li>
    </ul>
  {/if}
</nav>

<main class="mx-auto max-w-6xl px-4 py-6">
  {@render children()}
</main>
