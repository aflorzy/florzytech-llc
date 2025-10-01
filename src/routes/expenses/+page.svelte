<script lang="ts">
  import { previewAllocation, type AllocationMethod } from '$lib/allocation';
  type Category = { id: string; name: string };
  type Vendor = { id: string; name: string };
  type PaymentMethod = { id: string; name: string };
  type DeviceRef = { id: string; sku: string; make: string; model: string };
  type PartRef = { id: string; name: string };
  type ExpenseItem = {
    id: string;
    date: string | Date;
    amountCents: number;
    notes?: string | null;
    category?: Category | null;
    vendor?: Vendor | null;
    paymentMethod?: PaymentMethod | null;
    device?: DeviceRef | null;
    splitGroupId?: string | null;
    vendorOrderNumber?: string | null;
  };
  type Filters = { from: string | null; to: string | null };
  let { data } = $props<{
    data: {
      expenses: ExpenseItem[];
      categories: Category[];
      vendors: Vendor[];
      paymentMethods: PaymentMethod[];
      devices: DeviceRef[];
      parts: PartRef[];
      filters: Filters;
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

  // Split Receipt modal state
  let splitOpen = $state(false);
  type SplitLine = {
    categoryId: string;
    deviceId?: string | null;
    notes?: string | null;
    subtotalCents: number;
    taxCents?: number;
    shippingCents?: number;
    otherFeesCents?: number;
    // Stage B
    partId?: string | null;
    newPartName?: string | null;
    quantity?: number;
  };
  let splitDate = $state<string>(todayLocal());
  let splitVendorId = $state<string | null>(null);
  let splitPaymentMethodId = $state<string | null>(null);
  let splitReceiptNotes = $state<string>('');
  let splitVendorOrderNumber = $state<string>('');
  let splitMethod = $state<AllocationMethod>('PROPORTIONAL_SUBTOTAL');
  let splitTotals = $state({ totalTaxCents: 0, totalShippingCents: 0, totalOtherFeesCents: 0 });
  let splitLines = $state<SplitLine[]>([]);

  function isPartsCategory(categoryId: string): boolean {
    const cat = data.categories.find((c: Category) => c.id === categoryId);
    return !!cat && /part/i.test(cat.name);
  }

  function usdToCents(v: string): number { const n = parseFloat(v); return Math.round((n || 0) * 100); }
  function centsToUsd(n: number): string { return ((n || 0) / 100).toFixed(2); }
  function addSplitLine() {
    const firstCat = data.categories[0]?.id || '';
    splitLines = [...splitLines, { categoryId: firstCat, deviceId: null, notes: '', subtotalCents: 0, partId: null, newPartName: '', quantity: 0 }];
  }
  function removeSplitLine(idx: number) {
    splitLines = splitLines.filter((_, i) => i !== idx);
  }
  const allocPreview = $derived(previewAllocation(splitMethod, splitLines.map(l => ({ subtotalCents: l.subtotalCents })), splitTotals));
  function splitGrandTotalCents(): number {
    if (splitMethod === 'MANUAL') {
      return splitLines.reduce((s, l) => s + l.subtotalCents + (l.taxCents||0) + (l.shippingCents||0) + (l.otherFeesCents||0), 0);
    }
    return allocPreview.reduce((s, a) => s + (a?.loadedTotalCents || 0), 0);
  }
  // splitDate is initialized above

  async function submitSplit() {
    const payload = {
      date: splitDate,
      vendorId: splitVendorId || null,
      paymentMethodId: splitPaymentMethodId || null,
      receiptNotes: splitReceiptNotes || null,
      vendorOrderNumber: splitVendorOrderNumber || null,
      allocationMethod: splitMethod,
      totals: splitTotals,
      lines: splitLines
    };
    const res = await fetch('/expenses/split', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) {
      alert(j.error || 'Failed to save split receipt');
      return;
    }
    splitOpen = false;
    location.reload();
  }
</script>

<h1 class="text-2xl font-semibold mb-4">Expenses</h1>

<form method="get" class="flex flex-wrap items-end gap-2 mb-4">
  <div>
    <label class="block text-sm" for="from">From</label>
    <input id="from" name="from" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={data.filters.from || ''} />
  </div>
  <div>
    <label class="block text-sm" for="to">To</label>
    <input id="to" name="to" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={data.filters.to || ''} />
  </div>
  <div class="flex items-end gap-2">
    <button class="px-3 py-2 rounded bg-zinc-200 dark:bg-zinc-700" type="submit">Apply</button>
    {#if data.filters.from || data.filters.to}
      <a class="px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-800" href="/expenses">Clear</a>
    {/if}
  </div>
  <div class="ml-auto text-xs text-zinc-500">Filter to view transactions behind dashboard metrics</div>
  <div class="w-full h-px bg-zinc-200 dark:bg-zinc-800"></div>
</form>

<div class="flex items-center gap-2 mb-4">
  <button class="px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (open = !open)}>
    {open ? 'Close' : 'Add Expense'}
  </button>
  <button class="px-3 py-2 rounded bg-purple-700 text-white" onclick={() => { splitOpen = true; if (splitLines.length === 0) addSplitLine(); }}>
    Split Receipt
  </button>
  <span class="text-xs text-zinc-500">Create multiple expenses from one invoice with allocated tax/shipping/fees.</span>
  </div>

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
      <p class="text-xs text-zinc-500 mt-1">Choose the expense category (e.g., Parts, Tools/Consumables, Shipping Supplies). To attribute a device's cost, select the Device below when saving this expense.</p>
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
      <label class="block text-sm" for="vendorOrderNumber">Vendor Order #</label>
      <input id="vendorOrderNumber" name="vendorOrderNumber" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Optional. Useful for matching receipts and purchase orders.</p>
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

{#if splitOpen}
  <div class="fixed inset-0 bg-black/60 z-40" role="button" tabindex="0" aria-label="Close split receipt dialog" onclick={() => (splitOpen = false)} onkeydown={(e) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ' || k === 'Escape') { splitOpen = false; } }}></div>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="w-full max-w-5xl bg-white dark:bg-zinc-900 border rounded shadow-lg" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="p-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold">Split Receipt</h2>
        <button class="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700" onclick={() => (splitOpen = false)}>Close</button>
      </div>
      <div class="p-4 grid gap-3 md:grid-cols-5">
        <div>
          <label class="block text-sm" for="split-date">Date</label>
          <input id="split-date" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={splitDate} />
        </div>
        <div>
          <label class="block text-sm" for="split-vendor">Vendor</label>
          <select id="split-vendor" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={splitVendorId}>
            <option value={null}>-</option>
            {#each data.vendors as v}
              <option value={v.id}>{v.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-sm" for="split-pm">Payment Method</label>
          <select id="split-pm" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={splitPaymentMethodId}>
            <option value={null}>-</option>
            {#each data.paymentMethods as m}
              <option value={m.id}>{m.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-sm" for="split-method">Allocation Method</label>
          <select id="split-method" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={splitMethod}>
            <option value="PROPORTIONAL_SUBTOTAL">Proportional by Subtotal</option>
            <option value="EVEN">Even Split</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>
        <div>
          <label class="block text-sm" for="split-vendor-order">Vendor Order #</label>
          <input id="split-vendor-order" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={splitVendorOrderNumber} />
        </div>
        <div class="md:col-span-4 grid gap-3 md:grid-cols-4">
          <div>
            <label class="block text-sm" for="split-tax">Invoice Tax (USD)</label>
            <input id="split-tax" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(splitTotals.totalTaxCents)} onchange={(e) => splitTotals = { ...splitTotals, totalTaxCents: usdToCents((e.target as HTMLInputElement).value) }} />
          </div>
          <div>
            <label class="block text-sm" for="split-ship">Invoice Shipping (USD)</label>
            <input id="split-ship" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(splitTotals.totalShippingCents)} onchange={(e) => splitTotals = { ...splitTotals, totalShippingCents: usdToCents((e.target as HTMLInputElement).value) }} />
          </div>
          <div>
            <label class="block text-sm" for="split-fees">Other Fees (USD)</label>
            <input id="split-fees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(splitTotals.totalOtherFeesCents)} onchange={(e) => splitTotals = { ...splitTotals, totalOtherFeesCents: usdToCents((e.target as HTMLInputElement).value) }} />
          </div>
          <div>
            <label class="block text-sm" for="split-notes">Receipt Notes</label>
            <input id="split-notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={splitReceiptNotes} />
          </div>
          <div class="md:col-span-4 flex items-end">
            <div class="w-full px-3 py-2 border rounded bg-zinc-50 dark:bg-zinc-800">
              <div class="text-xs text-zinc-500">Grand Total</div>
              <div class="text-lg font-semibold">${centsToUsd(splitGrandTotalCents())}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-semibold">Items</h3>
          <button class="px-2 py-1 rounded bg-blue-600 text-white" onclick={() => addSplitLine()}>Add Line</button>
        </div>
        <div class="overflow-auto border rounded">
          <table class="w-full text-sm border divide-y table-fixed">
            <thead>
              <tr class="bg-zinc-50 dark:bg-zinc-800 text-left">
                <th class="p-2">Category</th>
                <th class="p-2">Device</th>
                <th class="p-2">Part</th>
                <th class="p-2">New Part Name</th>
                <th class="p-2">Qty</th>
                <th class="p-2">Notes</th>
                <th class="p-2">Subtotal (USD)</th>
                {#if splitMethod === 'MANUAL'}
                  <th class="p-2">Tax (USD)</th>
                  <th class="p-2">Shipping (USD)</th>
                  <th class="p-2">Fees (USD)</th>
                {/if}
                <th class="p-2">Loaded Total</th>
                <th class="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each splitLines as ln, i}
                <tr class="divide-x">
                  <td class="p-2">
                    <select
                      class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900"
                      bind:value={ln.categoryId}
                      onchange={(e) => {
                        const id = (e.target as HTMLSelectElement).value;
                        ln.categoryId = id;
                        if (!isPartsCategory(id)) { ln.partId = null; ln.newPartName = ''; ln.quantity = 0; }
                        else { if (!ln.quantity || ln.quantity <= 0) ln.quantity = 1; }
                        splitLines = [...splitLines];
                      }}
                    >
                      {#each data.categories as c}
                        <option value={c.id}>{c.name}</option>
                      {/each}
                    </select>
                  </td>
                  <td class="p-2">
                    <select class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={ln.deviceId}>
                      <option value={null}>-</option>
                      {#each data.devices as d}
                        <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
                      {/each}
                    </select>
                  </td>
                  <td class="p-2">
                    <select
                      class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed dark:disabled:bg-zinc-800"
                      bind:value={ln.partId}
                      disabled={!isPartsCategory(ln.categoryId)}
                      onchange={(e) => {
                        const v = (e.target as HTMLSelectElement).value || null;
                        ln.partId = v as any;
                        if (ln.partId) ln.newPartName = '';
                        splitLines = [...splitLines];
                      }}
                    >
                      <option value={null}>-</option>
                      {#each data.parts as p}
                        <option value={p.id}>{p.name}</option>
                      {/each}
                    </select>
                  </td>
                  <td class="p-2">
                    <input
                      class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed dark:disabled:bg-zinc-800"
                      placeholder="New Part Name (optional)"
                      bind:value={ln.newPartName}
                      disabled={!isPartsCategory(ln.categoryId) || !!ln.partId}
                    />
                  </td>
                  <td class="p-2">
                    <input
                      class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed dark:disabled:bg-zinc-800"
                      type="number"
                      min={isPartsCategory(ln.categoryId) ? 1 : 0}
                      step="1"
                      bind:value={ln.quantity}
                      disabled={!isPartsCategory(ln.categoryId)}
                    />
                  </td>
                  <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={ln.notes} /></td>
                  <td class="p-2">
                    <input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(ln.subtotalCents)} onchange={(e) => { ln.subtotalCents = usdToCents((e.target as HTMLInputElement).value); splitLines = [...splitLines]; }} />
                  </td>
                  {#if splitMethod === 'MANUAL'}
                    <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(ln.taxCents || 0)} onchange={(e) => { ln.taxCents = usdToCents((e.target as HTMLInputElement).value); splitLines = [...splitLines]; }} /></td>
                    <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(ln.shippingCents || 0)} onchange={(e) => { ln.shippingCents = usdToCents((e.target as HTMLInputElement).value); splitLines = [...splitLines]; }} /></td>
                    <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(ln.otherFeesCents || 0)} onchange={(e) => { ln.otherFeesCents = usdToCents((e.target as HTMLInputElement).value); splitLines = [...splitLines]; }} /></td>
                  {/if}
                  <td class="p-2">
                    {#if splitMethod === 'MANUAL'}
                      {centsToUsd((ln.subtotalCents) + (ln.taxCents||0) + (ln.shippingCents||0) + (ln.otherFeesCents||0))}
                    {:else}
                      {centsToUsd(allocPreview[i]?.loadedTotalCents || 0)}
                    {/if}
                  </td>
                  <td class="p-2">
                    <button class="px-2 py-1 rounded bg-red-600 text-white" onclick={() => removeSplitLine(i)}>Remove</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="mt-3 flex items-center justify-end gap-2">
          <button class="px-3 py-2 rounded bg-green-600 text-white" onclick={submitSplit}>Save Split</button>
        </div>
      </div>
    </div>
  </div>
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
            {#if e.splitGroupId}
              <a class="h-8 w-8 inline-flex items-center justify-center rounded bg-purple-700 text-white hover:opacity-90" title="Edit Receipt" aria-label="Edit Receipt" href={`/expenses/receipt/${e.splitGroupId}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                  <path d="M6 2a2 2 0 0 0-2 2v16l3-2 3 2 3-2 3 2 3-2V4a2 2 0 0 0-2-2H6Zm2 5h8v2H8V7Zm0 4h8v2H8v-2Zm0 4h6v2H8v-2Z"/>
                </svg>
              </a>
            {/if}
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
                <label class="block text-sm" for={`vendorOrderNumber-${e.id}`}>Vendor Order #</label>
                <input id={`vendorOrderNumber-${e.id}`} name="vendorOrderNumber" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={e.vendorOrderNumber || ''} />
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


