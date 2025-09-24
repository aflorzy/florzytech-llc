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

<table class="w-full text-sm border divide-y">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">Date</th>
      <th class="p-2">Amount</th>
      <th class="p-2">Category</th>
      <th class="p-2">Vendor</th>
      <th class="p-2">Device</th>
      <th class="p-2">Notes</th>
    </tr>
  </thead>
  <tbody>
    {#each data.expenses as e}
      <tr class="divide-x">
        <td class="p-2">{new Date(e.date).toLocaleDateString()}</td>
        <td class="p-2">${(e.amountCents/100).toFixed(2)}</td>
        <td class="p-2">{e.category?.name}</td>
        <td class="p-2">{e.vendor?.name || '-'}</td>
        <td class="p-2">{e.device ? `${e.device.sku} — ${e.device.make} ${e.device.model}` : '-'}</td>
        <td class="p-2">{e.notes || '-'}</td>
      </tr>
    {/each}
  </tbody>
</table>


