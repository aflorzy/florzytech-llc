<script lang="ts">
  type Part = {
    id: string;
    name: string;
    sku?: string | null;
    partNumber?: string | null;
    quantity: number;
    unitCostCents?: number | null;
    notes?: string | null;
    url?: string | null;
  };
  let { data } = $props<{ data: { parts: Part[] } }>();
  let open = $state(false);
</script>

<h1 class="text-2xl font-semibold mb-4">Parts</h1>

<button class="mb-4 px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (open = !open)}>
  {open ? 'Close' : 'Add Part'}
</button>

{#if open}
  <form method="post" action="?/create" class="grid gap-3 md:grid-cols-3 p-4 border rounded mb-6">
    <div>
      <label class="block text-sm" for="name">Name</label>
      <input id="name" name="name" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" required />
    </div>
    <div>
      <label class="block text-sm" for="sku">SKU (optional)</label>
      <input id="sku" name="sku" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="partNumber">Part # (optional)</label>
      <input id="partNumber" name="partNumber" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div class="md:col-span-3">
      <label class="block text-sm" for="url">Purchase URL (optional)</label>
      <input id="url" name="url" type="url" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" placeholder="https://..." />
      <p class="text-xs text-zinc-500 mt-1">Link to the product page to quickly reorder.</p>
    </div>
    <div>
      <label class="block text-sm" for="quantity">Quantity</label>
      <input id="quantity" name="quantity" type="number" step="1" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={0} />
    </div>
    <div>
      <label class="block text-sm" for="unitCost">Unit Cost (USD, optional)</label>
      <input id="unitCost" name="unitCost" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div class="md:col-span-3">
      <label class="block text-sm" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900"></textarea>
    </div>
    <div class="md:col-span-3">
      <button class="px-3 py-2 rounded bg-green-600 text-white">Save Part</button>
    </div>
  </form>
{/if}

<table class="w-full text-sm border divide-y">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">Name</th>
      <th class="p-2">SKU</th>
      <th class="p-2">Part #</th>
      <th class="p-2">Qty</th>
      <th class="p-2">Unit Cost</th>
      <th class="p-2">Link</th>
      <th class="p-2">Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.parts as p}
      <tr class="divide-x">
        <td class="p-2">{p.name}</td>
        <td class="p-2">{p.sku || '-'}</td>
        <td class="p-2">{p.partNumber || '-'}</td>
        <td class="p-2">{p.quantity}</td>
        <td class="p-2">{p.unitCostCents != null ? `$${(p.unitCostCents/100).toFixed(2)}` : '-'}</td>
        <td class="p-2">
          {#if p.url}
            <a class="text-blue-600 hover:underline" href={p.url} target="_blank" rel="noopener noreferrer">Open</a>
          {:else}-{/if}
        </td>
        <td class="p-2">
          <form method="post" action="?/adjust" class="inline">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="delta" value={-1} />
            <button class="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700">-1</button>
          </form>
          <form method="post" action="?/adjust" class="inline ml-2">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="delta" value={1} />
            <button class="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700">+1</button>
          </form>
        </td>
      </tr>
    {/each}
  </tbody>
</table>


