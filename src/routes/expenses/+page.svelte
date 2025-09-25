<script lang="ts">
  type Category = { id: string; name: string };
  type Vendor = { id: string; name: string };
  type PaymentMethod = { id: string; name: string };
  type DeviceRef = { id: string; sku: string; make: string; model: string };
  type ExpenseItem = {
    id: string;
    date: string | Date;
    amountCents: number;
    notes?: string | null;
    category?: Category | null;
    vendor?: Vendor | null;
    paymentMethod?: PaymentMethod | null;
    device?: DeviceRef | null;
  };
  let { data } = $props<{
    data: {
      expenses: ExpenseItem[];
      categories: Category[];
      vendors: Vendor[];
      paymentMethods: PaymentMethod[];
      devices: DeviceRef[];
    };
  }>();

  function todayLocal(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  let open = $state(false);
  let editingId = $state<string | null>(null);
</script>

<h1 class="text-2xl font-semibold mb-4">Expenses</h1>

<button class="mb-4 px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (open = !open)}>
  {open ? 'Close' : 'Add Expense'}
</button>

{#if open}
  <form method="post" action="?/create" class="grid gap-3 md:grid-cols-3 p-4 border rounded mb-6">
    <div>
      <label class="block text-sm" for="date">Date</label>
      <input id="date" name="date" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={todayLocal()} />
    </div>
    <div>
      <label class="block text-sm" for="amount">Amount (USD)</label>
      <input id="amount" name="amount" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" required />
      <p class="text-xs text-zinc-500 mt-1">Total expense amount in USD. Use this for parts, tools, shipping supplies, or other non-fee costs. Link a device below to attribute the cost to a device.</p>
    </div>
    <div>
      <label class="block text-sm" for="categoryId">Category</label>
      <select id="categoryId" name="categoryId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" required>
        {#each data.categories as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Choose the expense category (e.g., Parts, Tools/Consumables, Shipping Supplies). Device purchases should typically be entered on the Devices page via Purchase Price.</p>
    </div>
    <div>
      <label class="block text-sm" for="vendorId">Vendor</label>
      <select id="vendorId" name="vendorId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.vendors as v}
          <option value={v.id}>{v.name}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Optional. Where you purchased from.</p>
    </div>
    <div>
      <label class="block text-sm" for="paymentMethodId">Payment Method</label>
      <select id="paymentMethodId" name="paymentMethodId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.paymentMethods as m}
          <option value={m.id}>{m.name}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Optional. How you paid for the expense.</p>
    </div>
    <div>
      <label class="block text-sm" for="deviceId">Device</label>
      <select id="deviceId" name="deviceId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.devices as d}
          <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Optional. Attach this expense to a device to include it in that device’s profit calculation.</p>
    </div>
    <div class="md:col-span-3">
      <label class="block text-sm" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900"></textarea>
    </div>
    <div class="md:col-span-3">
      <button class="px-3 py-2 rounded bg-green-600 text-white">Save Expense</button>
    </div>
  </form>
{/if}

<table class="w-full text-sm border divide-y table-fixed">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">Date</th>
      <th class="p-2">Amount</th>
      <th class="p-2">Category</th>
      <th class="p-2">Vendor</th>
      <th class="p-2 w-64">Device</th>
      <th class="p-2 w-80">Notes</th>
      <th class="p-2">Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.expenses as e}
      <tr class="divide-x">
        <td class="p-2">{new Date(e.date).toLocaleDateString()}</td>
        <td class="p-2">${(e.amountCents/100).toFixed(2)}</td>
        <td class="p-2">{e.category?.name}</td>
        <td class="p-2">{e.vendor?.name || '-'}</td>
        <td class="p-2 align-top">
          {#if e.device}
            {#key e.device.id}
              <div class="truncate" title={`${e.device.sku} — ${e.device.make} ${e.device.model}`}>
                {e.device.sku} — {e.device.make} {e.device.model}
              </div>
            {/key}
          {:else}
            -
          {/if}
        </td>
        <td class="p-2 align-top">
          <div class="truncate" title={e.notes || ''}>{e.notes || '-'}</div>
        </td>
        <td class="p-2">
          <div class="flex items-center gap-2">
            <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-yellow-600 text-white hover:opacity-90" title="Edit" aria-label="Edit" onclick={() => (editingId = editingId === e.id ? null : e.id)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                <path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 2.121l-1.06 1.06-2.122-2.12 1.061-1.06ZM14.68 5.669 4.5 15.85V19.5h3.65L18.33 9.319l-3.65-3.65Z"/>
              </svg>
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(ev) => { if (!confirm('Archive this expense? You can restore it later via the database.')) { ev.preventDefault(); } }}>
              <input type="hidden" name="id" value={e.id} />
              <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-orange-600 text-white hover:opacity-90" title="Archive" aria-label="Archive">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                  <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V7Zm1 4h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Zm5 2v2h6v-2H9Z"/>
                </svg>
              </button>
            </form>
          </div>
        </td>
      </tr>
      {#if editingId === e.id}
        <tr class="bg-zinc-50/50 dark:bg-zinc-800/30">
          <td colspan="7" class="p-3">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={e.id} />
              <div>
                <label class="block text-sm" for={`date-${e.id}`}>Date</label>
                <input id={`date-${e.id}`} name="date" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={new Date(e.date).toISOString().slice(0,10)} />
              </div>
              <div>
                <label class="block text-sm" for={`amount-${e.id}`}>Amount (USD)</label>
                <input id={`amount-${e.id}`} name="amount" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={(e.amountCents/100).toFixed(2)} />
              </div>
              <div>
                <label class="block text-sm" for={`categoryId-${e.id}`}>Category</label>
                <select id={`categoryId-${e.id}`} name="categoryId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  {#each data.categories as c}
                    <option value={c.id} selected={e.category?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`vendorId-${e.id}`}>Vendor</label>
                <select id={`vendorId-${e.id}`} name="vendorId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!e.vendor}>-</option>
                  {#each data.vendors as v}
                    <option value={v.id} selected={e.vendor?.id === v.id}>{v.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`paymentMethodId-${e.id}`}>Payment Method</label>
                <select id={`paymentMethodId-${e.id}`} name="paymentMethodId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!e.paymentMethod}>-</option>
                  {#each data.paymentMethods as m}
                    <option value={m.id} selected={e.paymentMethod?.id === m.id}>{m.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`deviceId-${e.id}`}>Device</label>
                <select id={`deviceId-${e.id}`} name="deviceId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!e.device}>-</option>
                  {#each data.devices as d}
                    <option value={d.id} selected={e.device?.id === d.id}>{d.sku} — {d.make} {d.model}</option>
                  {/each}
                </select>
              </div>
              <div class="md:col-span-3">
                <label class="block text-sm" for={`notes-${e.id}`}>Notes</label>
                <textarea id={`notes-${e.id}`} name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">{e.notes || ''}</textarea>
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


