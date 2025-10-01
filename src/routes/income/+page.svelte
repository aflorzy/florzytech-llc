<script lang="ts">
  type DeviceRef = { id: string; sku: string; make: string; model: string };
  type Channel = { id: string; name: string };
  type Category = { id: string; name: string };
  type WorkOrderRef = { id: string; code: string };
  type PartRef = { id: string; name: string };
  type CustomerRef = { id: string; name: string };
  type IncomeRow = {
    id: string;
    date: string | Date;
    type: 'SALE' | 'SERVICE' | 'DEPOSIT';
    amountCents: number;
    notes?: string | null;
    channel?: Channel | null;
    device?: DeviceRef | null;
    category?: Category | null;
    customer?: CustomerRef | null;
    workOrder?: WorkOrderRef | null;
  };
  type Filters = { from: string | null; to: string | null };
  let { data } = $props<{ data: { income: IncomeRow[]; channels: Channel[]; devices: DeviceRef[]; categories: Category[]; customers: CustomerRef[]; workOrders: WorkOrderRef[]; parts: PartRef[]; filters: Filters } }>();

  function todayLocal(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  let open = $state(false);
  let editingId = $state<string | null>(null);

  // Stage C: Income Builder modal state
  let builderOpen = $state(false);
  type BuilderLine = {
    type: 'DEVICE' | 'PART' | 'LABOR' | 'OTHER';
    amountCents: number;
    description?: string;
    deviceId?: string | null;
    partId?: string | null;
    quantity?: number | null;
    workOrderId?: string | null;
  };
  let builderDate = $state<string>(todayLocal());
  let builderType = $state<'SALE' | 'SERVICE' | 'DEPOSIT'>('SALE');
  let builderChannelId = $state<string | null>(null);
  let builderCustomerId = $state<string | null>(null);
  let builderWorkOrderId = $state<string | null>(null);
  let builderNotes = $state<string>('');
  let builderPlatformFeesCents = $state<number>(0);
  let builderPaymentFeesCents = $state<number>(0);
  let builderShippingRevenueCents = $state<number>(0);
  let builderShippingCostCents = $state<number>(0);
  let builderTaxCollectedCents = $state<number>(0);
  let builderLines = $state<BuilderLine[]>([]);

  // builderDate is initialized above

  function usdToCents(v: string): number { const n = parseFloat(v); return Math.round((n || 0) * 100); }
  function usdNumToCents(n: number): number { return Math.round((n || 0) * 100); }
  function centsToUsd(n: number): string { return ((n || 0) / 100).toFixed(2); }
  function addBuilderLine() {
    builderLines = [...builderLines, { type: 'OTHER', amountCents: 0, description: '' }];
  }
  function removeBuilderLine(idx: number) {
    builderLines = builderLines.filter((_, i) => i !== idx);
  }
  function builderTotalCents(): number {
    return builderLines.reduce((s, l) => s + Math.floor(l.amountCents || 0), 0);
  }
  async function submitBuilder() {
    const payload = {
      date: builderDate,
      type: builderType,
      channelId: builderChannelId || null,
      customerId: builderCustomerId || null,
      workOrderId: builderWorkOrderId || null,
      notes: builderNotes || null,
      platformFeesCents: usdNumToCents(builderPlatformFeesCents),
      paymentFeesCents: usdNumToCents(builderPaymentFeesCents),
      shippingRevenueCents: usdNumToCents(builderShippingRevenueCents),
      shippingCostCents: usdNumToCents(builderShippingCostCents),
      taxCollectedCents: usdNumToCents(builderTaxCollectedCents),
      lines: builderLines
    };
    const res = await fetch('/income/create-lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) {
      alert(j.error || 'Failed to save income with lines');
      return;
    }
    builderOpen = false;
    location.reload();
  }
</script>

<h1 class="text-2xl font-semibold mb-4">Income</h1>

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
      <a class="px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-800" href="/income">Clear</a>
    {/if}
  </div>
  <div class="ml-auto text-xs text-zinc-500">Filter to view transactions behind dashboard metrics</div>
  <div class="w-full h-px bg-zinc-200 dark:bg-zinc-800"></div>
</form>

<div class="flex items-center gap-2 mb-4">
  <button class="px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (open = !open)}>
    {open ? 'Close' : 'Add Income'}
  </button>
  <button class="px-3 py-2 rounded bg-purple-700 text-white" onclick={() => { builderOpen = true; if (builderLines.length === 0) addBuilderLine(); }}>
    Sale Builder
  </button>
</div>

{#if open}
  <form method="post" action="?/create" class="grid gap-3 md:grid-cols-3 p-4 border rounded mb-6">
    <div>
      <label class="block text-sm" for="date">Date</label>
      <input id="date" name="date" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={todayLocal()} />
    </div>
    <div>
      <label class="block text-sm" for="type">Type</label>
      <select id="type" name="type" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="SALE">Sale</option>
        <option value="SERVICE">Service</option>
        <option value="DEPOSIT">Deposit</option>
      </select>
      <p class="text-xs text-zinc-500 mt-1">Select the kind of income. Use Sale for product/device sales, Service for repair services, and Deposit for miscellaneous income.</p>
    </div>
    <div>
      <label class="block text-sm" for="amount">Amount (USD)</label>
      <input id="amount" name="amount" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" required />
      <p class="text-xs text-zinc-500 mt-1">Item or service price before fees and tax. Do not include shipping or tax here — use the fields below.</p>
    </div>
    <div>
      <label class="block text-sm" for="deviceId">Device</label>
      <select id="deviceId" name="deviceId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.devices as d}
          <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Optional. Attach the income to a device so it’s reflected in that device’s profit summary.</p>
    </div>
    <div>
      <label class="block text-sm" for="categoryId">Category</label>
      <select id="categoryId" name="categoryId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.categories as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Optional. Tag the income with a category for reporting.</p>
    </div>
    <div>
      <label class="block text-sm" for="channelId">Channel</label>
      <select id="channelId" name="channelId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.channels as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Where the sale happened (e.g., eBay, Facebook Marketplace, in-person).</p>
    </div>
    <div>
      <label class="block text-sm" for="customerId">Customer</label>
      <select id="customerId" name="customerId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.customers as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Optional. Select the customer for this income.</p>
    </div>
    <div>
      <label class="block text-sm" for="workOrderId">Work Order</label>
      <select id="workOrderId" name="workOrderId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.workOrders as w}
          <option value={w.id}>{w.code}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Optional. Link this income to a work order.</p>
    </div>
    <div>
      <label class="block text-sm" for="platformFees">Platform Fees (USD)</label>
      <input id="platformFees" name="platformFees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Marketplace fees (e.g., eBay/Shopify) taken from the sale.</p>
    </div>
    <div>
      <label class="block text-sm" for="paymentFees">Payment Fees (USD)</label>
      <input id="paymentFees" name="paymentFees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Processor fees (e.g., PayPal, Stripe) for the transaction.</p>
    </div>
    <div>
      <label class="block text-sm" for="shippingRevenue">Shipping Revenue (USD)</label>
      <input id="shippingRevenue" name="shippingRevenue" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Amount you collected from the buyer for shipping.</p>
    </div>
    <div>
      <label class="block text-sm" for="shippingCost">Shipping Cost (USD)</label>
      <input id="shippingCost" name="shippingCost" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Your actual shipping label cost.</p>
    </div>
    <div>
      <label class="block text-sm" for="taxCollected">Tax Collected (USD)</label>
      <input id="taxCollected" name="taxCollected" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Sales tax collected (not included in profit).</p>
    </div>
    <div class="md:col-span-3">
      <label class="block text-sm" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900"></textarea>
    </div>
    <div class="md:col-span-3">
      <button class="px-3 py-2 rounded bg-green-600 text-white">Save Income</button>
    </div>
  </form>
{/if}

{#if builderOpen}
  <div class="fixed inset-0 bg-black/60 z-40" role="button" tabindex="0" aria-label="Close sale builder" onclick={() => (builderOpen = false)} onkeydown={(e) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ' || k === 'Escape') { builderOpen = false; } }}></div>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="w-full max-w-6xl bg-white dark:bg-zinc-900 border rounded shadow-lg" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="p-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold">Sale Builder</h2>
        <button class="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700" onclick={() => (builderOpen = false)}>Close</button>
      </div>
      <div class="p-4 grid gap-3 md:grid-cols-4">
        <div>
          <label class="block text-sm" for="bld-date">Date</label>
          <input id="bld-date" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderDate} />
        </div>
        <div>
          <label class="block text-sm" for="bld-type">Type</label>
          <select id="bld-type" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderType}>
            <option value="SALE">Sale</option>
            <option value="SERVICE">Service</option>
            <option value="DEPOSIT">Deposit</option>
          </select>
        </div>
        <div>
          <label class="block text-sm" for="bld-channel">Channel</label>
          <select id="bld-channel" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderChannelId}>
            <option value={null}>-</option>
            {#each data.channels as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-sm" for="bld-customer">Customer</label>
          <select id="bld-customer" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderCustomerId}>
            <option value={null}>-</option>
            {#each data.customers as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-sm" for="bld-wo">Work Order</label>
          <select id="bld-wo" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderWorkOrderId}>
            <option value={null}>-</option>
            {#each data.workOrders as w}
              <option value={w.id}>{w.code}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-sm" for="bld-platform">Platform Fees (USD)</label>
          <input id="bld-platform" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderPlatformFeesCents} />
        </div>
        <div>
          <label class="block text-sm" for="bld-payment">Payment Fees (USD)</label>
          <input id="bld-payment" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderPaymentFeesCents} />
        </div>
        <div>
          <label class="block text-sm" for="bld-ship-rev">Shipping Revenue (USD)</label>
          <input id="bld-ship-rev" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderShippingRevenueCents} />
        </div>
        <div>
          <label class="block text-sm" for="bld-ship-cost">Shipping Cost (USD)</label>
          <input id="bld-ship-cost" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderShippingCostCents} />
        </div>
        <div>
          <label class="block text-sm" for="bld-tax">Tax Collected (USD)</label>
          <input id="bld-tax" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderTaxCollectedCents} />
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm" for="bld-notes">Notes</label>
          <input id="bld-notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={builderNotes} />
        </div>
        <div class="md:col-span-2 flex items-end">
          <div class="w-full px-3 py-2 border rounded bg-zinc-50 dark:bg-zinc-800">
            <div class="text-xs text-zinc-500">Lines Total</div>
            <div class="text-lg font-semibold">${centsToUsd(builderTotalCents())}</div>
          </div>
        </div>
      </div>
      <div class="p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-semibold">Lines</h3>
          <button class="px-2 py-1 rounded bg-blue-600 text-white" onclick={() => addBuilderLine()}>Add Line</button>
        </div>
        <div class="overflow-auto border rounded">
          <table class="w-full text-sm border divide-y table-fixed">
            <thead>
              <tr class="bg-zinc-50 dark:bg-zinc-800 text-left">
                <th class="p-2">Type</th>
                <th class="p-2">Device</th>
                <th class="p-2">Part</th>
                <th class="p-2">Qty</th>
                <th class="p-2">Description</th>
                <th class="p-2">Amount (USD)</th>
                <th class="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each builderLines as ln, i}
                <tr class="divide-x">
                  <td class="p-2">
                    <select class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={ln.type}>
                      <option value="DEVICE">Device</option>
                      <option value="PART">Part</option>
                      <option value="LABOR">Labor</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </td>
                  <td class="p-2">
                    <select class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={ln.deviceId} disabled={ln.type !== 'DEVICE'}>
                      <option value={null}>-</option>
                      {#each data.devices as d}
                        <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
                      {/each}
                    </select>
                  </td>
                  <td class="p-2">
                    <select class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={ln.partId} disabled={ln.type !== 'PART'}>
                      <option value={null}>-</option>
                      {#each data.parts as p}
                        <option value={p.id}>{p.name}</option>
                      {/each}
                    </select>
                  </td>
                  <td class="p-2">
                    <input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" type="number" min="0" step="1" bind:value={ln.quantity} disabled={ln.type !== 'PART'} />
                  </td>
                  <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={ln.description} /></td>
                  <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(ln.amountCents)} onchange={(e) => { ln.amountCents = usdToCents((e.target as HTMLInputElement).value); builderLines = [...builderLines]; }} /></td>
                  <td class="p-2"><button class="px-2 py-1 rounded bg-red-600 text-white" onclick={() => removeBuilderLine(i)}>Remove</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="mt-3 flex items-center justify-end gap-2">
          <button class="px-3 py-2 rounded bg-green-600 text-white" onclick={submitBuilder}>Save Income</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<table class="w-full text-sm border divide-y">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">Date</th>
      <th class="p-2">Type</th>
      <th class="p-2">Amount</th>
      <th class="p-2">Device</th>
      <th class="p-2">Category</th>
      <th class="p-2">Channel</th>
      <th class="p-2">Notes</th>
      <th class="p-2">Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.income as r}
      <tr class="divide-x">
        <td class="p-2">{new Date(r.date).toLocaleDateString()}</td>
        <td class="p-2">{r.type}</td>
        <td class="p-2">${(r.amountCents/100).toFixed(2)}</td>
        <td class="p-2">{r.device ? `${r.device.sku} — ${r.device.make} ${r.device.model}` : '-'}</td>
        <td class="p-2">{r.category?.name || '-'}</td>
        <td class="p-2">{r.channel?.name || '-'}</td>
        <td class="p-2">{r.notes || '-'}</td>
        <td class="p-2">
          <div class="flex items-center gap-2">
            <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-yellow-600 text-white hover:opacity-90" title="Edit" aria-label="Edit" onclick={() => (editingId = editingId === r.id ? null : r.id)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                <path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 2.121l-1.06 1.06-2.122-2.12 1.061-1.06ZM14.68 5.669 4.5 15.85V19.5h3.65L18.33 9.319l-3.65-3.65Z"/>
              </svg>
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(ev) => { if (!confirm('Archive this income entry? You can restore it later via the database.')) { ev.preventDefault(); } }}>
              <input type="hidden" name="id" value={r.id} />
              <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-orange-600 text-white hover:opacity-90" title="Archive" aria-label="Archive">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                  <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V7Zm1 4h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Zm5 2v2h6v-2H9Z"/>
                </svg>
              </button>
            </form>
          </div>
        </td>
      </tr>
      {#if editingId === r.id}
        <tr class="bg-zinc-50/50 dark:bg-zinc-800/30">
          <td colspan="8" class="p-3">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={r.id} />
              <div>
                <label class="block text-sm" for={`date-${r.id}`}>Date</label>
                <input id={`date-${r.id}`} name="date" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={new Date(r.date).toISOString().slice(0,10)} />
              </div>
              <div>
                <label class="block text-sm" for={`type-${r.id}`}>Type</label>
                <select id={`type-${r.id}`} name="type" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="SALE" selected={r.type === 'SALE'}>Sale</option>
                  <option value="SERVICE" selected={r.type === 'SERVICE'}>Service</option>
                  <option value="DEPOSIT" selected={r.type === 'DEPOSIT'}>Deposit</option>
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`amount-${r.id}`}>Amount (USD)</label>
                <input id={`amount-${r.id}`} name="amount" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={(r.amountCents/100).toFixed(2)} />
              </div>
              <div>
                <label class="block text-sm" for={`deviceId-${r.id}`}>Device</label>
                <select id={`deviceId-${r.id}`} name="deviceId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!r.device}>-</option>
                  {#each data.devices as d}
                    <option value={d.id} selected={r.device?.id === d.id}>{d.sku} — {d.make} {d.model}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`categoryId-${r.id}`}>Category</label>
                <select id={`categoryId-${r.id}`} name="categoryId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!r.category}>-</option>
                  {#each data.categories as c}
                    <option value={c.id} selected={r.category?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`channelId-${r.id}`}>Channel</label>
                <select id={`channelId-${r.id}`} name="channelId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!r.channel}>-</option>
                  {#each data.channels as c}
                    <option value={c.id} selected={r.channel?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`customerId-${r.id}`}>Customer</label>
                <select id={`customerId-${r.id}`} name="customerId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!r.customer}>-</option>
                  {#each data.customers as c}
                    <option value={c.id} selected={r.customer?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`workOrderId-${r.id}`}>Work Order</label>
                <select id={`workOrderId-${r.id}`} name="workOrderId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!r.workOrder}>-</option>
                  {#each data.workOrders as w}
                    <option value={w.id} selected={r.workOrder?.id === w.id}>{w.code}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`platformFees-${r.id}`}>Platform Fees</label>
                <input id={`platformFees-${r.id}`} name="platformFees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div>
                <label class="block text-sm" for={`paymentFees-${r.id}`}>Payment Fees</label>
                <input id={`paymentFees-${r.id}`} name="paymentFees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div>
                <label class="block text-sm" for={`shippingRevenue-${r.id}`}>Shipping Revenue</label>
                <input id={`shippingRevenue-${r.id}`} name="shippingRevenue" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div>
                <label class="block text-sm" for={`shippingCost-${r.id}`}>Shipping Cost</label>
                <input id={`shippingCost-${r.id}`} name="shippingCost" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div>
                <label class="block text-sm" for={`taxCollected-${r.id}`}>Tax Collected</label>
                <input id={`taxCollected-${r.id}`} name="taxCollected" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div class="md:col-span-3">
                <label class="block text-sm" for={`notes-${r.id}`}>Notes</label>
                <textarea id={`notes-${r.id}`} name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">{r.notes || ''}</textarea>
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
