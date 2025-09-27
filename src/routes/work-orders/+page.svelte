<script lang="ts">
  type Customer = { id: string; name: string };
  type WorkOrder = { id: string; code: string; status: string; targetAction: string; notes?: string | null; customer?: Customer | null };
  let { data } = $props<{ data: { orders: WorkOrder[]; customers: Customer[] } }>();
  let formOpen = $state(false);
  let editingId = $state<string | null>(null);
  let editing = $derived((data.orders.find((o: WorkOrder) => o.id === editingId) ?? null) as WorkOrder | null);
</script>

<h1 class="text-2xl font-semibold mb-4">Work Orders</h1>

<div class="flex items-center gap-2 mb-4">
  <button class="px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (formOpen = !formOpen)}>
    {formOpen ? 'Close' : 'New Work Order'}
  </button>
</div>

{#if formOpen}
  <form method="post" action="?/create" class="grid gap-3 md:grid-cols-3 p-4 border rounded mb-6">
    <div>
      <label class="block text-sm" for="targetAction">Target Action</label>
      <select id="targetAction" name="targetAction" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="RETURN_TO_CUSTOMER">Return to Customer</option>
        <option value="SELL">Sell</option>
      </select>
    </div>
    <div>
      <label class="block text-sm" for="customerId">Customer</label>
      <select id="customerId" name="customerId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.customers as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </div>
    <div class="md:col-span-3">
      <label class="block text-sm" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900"></textarea>
    </div>
    <div class="md:col-span-3">
      <button type="submit" class="px-3 py-2 rounded bg-green-600 text-white">Create Work Order</button>
    </div>
  </form>
{/if}

<table class="w-full text-sm border divide-y">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">Code</th>
      <th class="p-2">Status</th>
      <th class="p-2">Target</th>
      <th class="p-2">Customer</th>
      <th class="p-2">Notes</th>
      <th class="p-2">Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.orders as o}
      <tr class="divide-x">
        <td class="p-2"><a class="text-blue-600 hover:underline" href={`/work-orders/${o.id}`}>{o.code}</a></td>
        <td class="p-2">{o.status}</td>
        <td class="p-2">{o.targetAction}</td>
        <td class="p-2">{o.customer?.name || '-'}</td>
        <td class="p-2">{o.notes || '-'}</td>
        <td class="p-2">
          <div class="flex items-center gap-2">
            <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-yellow-600 text-white hover:opacity-90" title="Edit" aria-label="Edit" onclick={() => (editingId = o.id)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4"><path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 2.121l-1.06 1.06-2.122-2.12 1.061-1.06ZM14.68 5.669 4.5 15.85V19.5h3.65L18.33 9.319l-3.65-3.65Z"/></svg>
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(e) => { if (!confirm('Archive this work order?')) { e.preventDefault(); } }}>
              <input type="hidden" name="id" value={o.id} />
              <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-orange-600 text-white hover:opacity-90" title="Archive" aria-label="Archive">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V7Zm1 4h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Zm5 2v2h6v-2H9Z"/></svg>
              </button>
            </form>
          </div>
        </td>
      </tr>
      {#if editingId === o.id}
        <tr class="bg-zinc-50/50 dark:bg-zinc-800/30">
          <td colspan="6" class="p-3">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={o.id} />
              <div>
                <label class="block text-sm" for={`status-${o.id}`}>Status</label>
                <select id={`status-${o.id}`} name="status" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="OPEN" selected={o.status === 'OPEN'}>Open</option>
                  <option value="WAITING_PARTS" selected={o.status === 'WAITING_PARTS'}>Waiting Parts</option>
                  <option value="IN_PROGRESS" selected={o.status === 'IN_PROGRESS'}>In Progress</option>
                  <option value="READY" selected={o.status === 'READY'}>Ready</option>
                  <option value="DELIVERED" selected={o.status === 'DELIVERED'}>Delivered</option>
                  <option value="CANCELLED" selected={o.status === 'CANCELLED'}>Cancelled</option>
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`target-${o.id}`}>Target Action</label>
                <select id={`target-${o.id}`} name="targetAction" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="RETURN_TO_CUSTOMER" selected={o.targetAction === 'RETURN_TO_CUSTOMER'}>Return to Customer</option>
                  <option value="SELL" selected={o.targetAction === 'SELL'}>Sell</option>
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`customerId-${o.id}`}>Customer</label>
                <select id={`customerId-${o.id}`} name="customerId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!o.customer}>-</option>
                  {#each data.customers as c}
                    <option value={c.id} selected={o.customer?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div class="md:col-span-3">
                <label class="block text-sm" for={`notes-${o.id}`}>Notes</label>
                <textarea id={`notes-${o.id}`} name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">{o.notes || ''}</textarea>
              </div>
              <div class="md:col-span-3 flex gap-2">
                <button class="px-3 py-2 rounded bg-green-600 text-white">Save</button>
                <button class="px-3 py-2 rounded bg-zinc-300 dark:bg-zinc-700" onclick={(ev) => { ev.preventDefault(); editingId = null; }}>Cancel</button>
              </div>
            </form>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
