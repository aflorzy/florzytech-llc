<script lang="ts">
  type DeviceListItem = {
    id: string;
    sku: string;
    make: string;
    model: string;
    serial?: string | null;
    purchasePriceCents: number;
    status: string;
    createdAt: string | Date;
  };
  let { data } = $props<{ data: { devices: DeviceListItem[] } }>();
  let formOpen = $state(false);
</script>

<h1 class="text-2xl font-semibold mb-4">Devices</h1>

<button class="btn mb-4 px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (formOpen = !formOpen)}>
  {formOpen ? 'Close' : 'Add Device'}
</button>

{#if formOpen}
  <form method="post" action="?/create" class="grid gap-3 md:grid-cols-2 p-4 border rounded mb-6">
    <div>
      <label class="block text-sm" for="make">Make</label>
      <input id="make" name="make" required class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="model">Model</label>
      <input id="model" name="model" required class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="serial">Serial/IMEI</label>
      <input id="serial" name="serial" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="source">Source</label>
      <input id="source" name="source" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="condition">Condition</label>
      <input id="condition" name="condition" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="purchasePrice">Purchase Price (USD)</label>
      <input id="purchasePrice" name="purchasePrice" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Acquisition cost of the device. Use Expenses for parts, tools, and supplies.</p>
    </div>
    <div class="md:col-span-2">
      <label class="block text-sm" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900"></textarea>
    </div>
    <div class="md:col-span-2">
      <button type="submit" class="px-3 py-2 rounded bg-green-600 text-white">Save Device</button>
    </div>
  </form>
{/if}

<table class="w-full text-sm border divide-y">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">SKU</th>
      <th class="p-2">Make/Model</th>
      <th class="p-2">Serial</th>
      <th class="p-2">Purchase</th>
      <th class="p-2">Status</th>
      <th class="p-2">Created</th>
    </tr>
  </thead>
  <tbody>
    {#each data.devices as d}
      <tr class="divide-x hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        <td class="p-2"><a class="text-blue-600 hover:underline" href={`/devices/${d.id}`}>{d.sku}</a></td>
        <td class="p-2">{d.make} {d.model}</td>
        <td class="p-2">{d.serial || '-'}</td>
        <td class="p-2">${(d.purchasePriceCents / 100).toFixed(2)}</td>
        <td class="p-2">{d.status}</td>
        <td class="p-2">{new Date(d.createdAt).toLocaleDateString()}</td>
      </tr>
    {/each}
  </tbody>
</table>


