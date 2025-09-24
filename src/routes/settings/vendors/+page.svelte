<script lang="ts">
  type Vendor = { id: string; name: string; type?: string | null; active: boolean };
  let { data } = $props<{ data: { vendors: Vendor[] } }>();
  let open = $state(false);
  let editingId = $state<string | null>(null);
</script>

<h1 class="text-2xl font-semibold mb-4">Vendors</h1>

<button class="mb-4 px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (open = !open)}>
  {open ? 'Close' : 'Add Vendor'}
</button>

{#if open}
  <form method="post" action="?/create" class="grid gap-3 md:grid-cols-3 p-4 border rounded mb-6">
    <div>
      <label class="block text-sm" for="name">Name</label>
      <input id="name" name="name" required class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Example: Amazon, eBay, Local Shop</p>
    </div>
    <div>
      <label class="block text-sm" for="type">Type (optional)</label>
      <input id="type" name="type" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">e.g., marketplace, local_store, supplier</p>
    </div>
    <div class="md:col-span-3">
      <button class="px-3 py-2 rounded bg-green-600 text-white">Save Vendor</button>
    </div>
  </form>
{/if}

<table class="w-full text-sm border divide-y">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">Name</th>
      <th class="p-2">Type</th>
      <th class="p-2">Active</th>
      <th class="p-2">Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.vendors as v}
      <tr class="divide-x">
        <td class="p-2">{v.name}</td>
        <td class="p-2">{v.type || '-'}</td>
        <td class="p-2">{v.active ? 'Yes' : 'No'}</td>
        <td class="p-2">
          <form method="post" action="?/toggle" class="inline">
            <input type="hidden" name="id" value={v.id} />
            <button class="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700">
              {v.active ? 'Deactivate' : 'Activate'}
            </button>
          </form>
          <button class="ml-2 px-2 py-1 rounded bg-yellow-600 text-white" onclick={() => (editingId = editingId === v.id ? null : v.id)}>Edit</button>
          <form method="post" action="?/delete" class="inline ml-2" onsubmit={(e) => { if (!confirm('Archive this vendor? Existing records will still reference it.')) { e.preventDefault(); } }}>
            <input type="hidden" name="id" value={v.id} />
            <button class="px-2 py-1 rounded bg-orange-600 text-white">Archive</button>
          </form>
        </td>
      </tr>
      {#if editingId === v.id}
        <tr class="bg-zinc-50/50 dark:bg-zinc-800/30">
          <td colspan="4" class="p-3">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={v.id} />
              <div>
                <label class="block text-sm" for={`name-${v.id}`}>Name</label>
                <input id={`name-${v.id}`} name="name" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={v.name} required />
              </div>
              <div>
                <label class="block text-sm" for={`type-${v.id}`}>Type</label>
                <input id={`type-${v.id}`} name="type" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={v.type || ''} />
              </div>
              <div class="md:col-span-3 flex gap-2">
                <button class="px-3 py-2 rounded bg-green-600 text-white">Save</button>
                <button class="px-3 py-2 rounded bg-zinc-300 dark:bg-zinc-700" onclick={(e) => { e.preventDefault(); editingId = null; }}>Cancel</button>
              </div>
            </form>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
