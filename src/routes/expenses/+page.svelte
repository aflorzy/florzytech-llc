<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import DateRangeFilter from '$lib/components/DateRangeFilter.svelte';
  import SkuTag from '$lib/components/SkuTag.svelte';
  import { formatUsd } from '$lib/format';
  import Icon from '$lib/components/Icon.svelte';
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
    receiptNotes?: string | null;
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

<PageHeader title="Expenses">
  {#snippet actions()}
    <button data-testid="expenses-open-split-receipt" class="btn btn-secondary" title="Create several expenses from one invoice, with tax, shipping and fees allocated across them" onclick={() => { splitOpen = true; if (splitLines.length === 0) addSplitLine(); }}>
      Split Receipt
    </button>
    <button data-testid="expenses-toggle-form" class="btn {open ? 'btn-secondary' : 'btn-primary'}" onclick={() => (open = !open)}>
      {open ? 'Close' : 'Add Expense'}
    </button>
  {/snippet}
</PageHeader>

<DateRangeFilter from={data.filters.from} to={data.filters.to} clearHref="/expenses" />

{#if open}
  <form method="post" action="?/create" class="form-panel md:grid-cols-3">
    <div>
      <label class="label" for="date">Date</label>
      <input id="date" name="date" type="date" class="input" value={todayLocal()} />
    </div>
    <div>
      <label class="label" for="amount">Amount (USD)</label>
      <input id="amount" name="amount" type="number" step="0.01" min="0" class="input" required />
      <p class="hint">Total expense amount in USD. Use this for parts, tools, shipping supplies, or other non-fee costs. Link a device below to attribute the cost to a device.</p>
    </div>
    <div>
      <label class="label" for="categoryId">Category</label>
      <select id="categoryId" name="categoryId" class="input" required>
        {#each data.categories as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <p class="hint">Choose the expense category (e.g., Parts, Tools/Consumables, Shipping Supplies). To attribute a device's cost, select the Device below when saving this expense.</p>
    </div>
    <div>
      <label class="label" for="vendorId">Vendor</label>
      <select id="vendorId" name="vendorId" class="input">
        <option value="">-</option>
        {#each data.vendors as v}
          <option value={v.id}>{v.name}</option>
        {/each}
      </select>
      <p class="hint">Optional. Where you purchased from.</p>
    </div>
    <div>
      <label class="label" for="paymentMethodId">Payment Method</label>
      <select id="paymentMethodId" name="paymentMethodId" class="input">
        <option value="">-</option>
        {#each data.paymentMethods as m}
          <option value={m.id}>{m.name}</option>
        {/each}
      </select>
      <p class="hint">Optional. How you paid for the expense.</p>
    </div>
    <div>
      <label class="label" for="vendorOrderNumber">Vendor Order #</label>
      <input id="vendorOrderNumber" name="vendorOrderNumber" class="input" />
      <p class="hint">Optional. Useful for matching receipts and purchase orders.</p>
    </div>
    <div>
      <label class="label" for="deviceId">Device</label>
      <select id="deviceId" name="deviceId" class="input">
        <option value="">-</option>
        {#each data.devices as d}
          <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
        {/each}
      </select>
      <p class="hint">Optional. Attach this expense to a device to include it in that device’s profit calculation.</p>
    </div>
    <div class="md:col-span-3">
      <label class="label" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="input"></textarea>
    </div>
    <div class="md:col-span-3">
      <button data-testid="expenses-save-expense" class="btn btn-primary">Save Expense</button>
    </div>
  </form>
{/if}

{#if splitOpen}
  <Modal title="Split Receipt" size="lg" onclose={() => (splitOpen = false)}>
      <div class="grid gap-x-4 gap-y-3 md:grid-cols-5">
        <div>
          <label class="label" for="split-date">Date</label>
          <input id="split-date" type="date" class="input" bind:value={splitDate} />
        </div>
        <div>
          <label class="label" for="split-vendor">Vendor</label>
          <select id="split-vendor" class="input" bind:value={splitVendorId}>
            <option value={null}>-</option>
            {#each data.vendors as v}
              <option value={v.id}>{v.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label" for="split-pm">Payment Method</label>
          <select id="split-pm" class="input" bind:value={splitPaymentMethodId}>
            <option value={null}>-</option>
            {#each data.paymentMethods as m}
              <option value={m.id}>{m.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label" for="split-method">Allocation Method</label>
          <select id="split-method" class="input" bind:value={splitMethod}>
            <option value="PROPORTIONAL_SUBTOTAL">Proportional by Subtotal</option>
            <option value="EVEN">Even Split</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>
        <div>
          <label class="label" for="split-vendor-order">Vendor Order #</label>
          <input id="split-vendor-order" class="input" bind:value={splitVendorOrderNumber} />
        </div>
        <div class="md:col-span-4 grid gap-3 md:grid-cols-4">
          <div>
            <label class="label" for="split-tax">Invoice Tax (USD)</label>
            <input id="split-tax" type="number" step="0.01" min="0" class="input" value={centsToUsd(splitTotals.totalTaxCents)} onchange={(e) => splitTotals = { ...splitTotals, totalTaxCents: usdToCents((e.target as HTMLInputElement).value) }} />
          </div>
          <div>
            <label class="label" for="split-ship">Invoice Shipping (USD)</label>
            <input id="split-ship" type="number" step="0.01" min="0" class="input" value={centsToUsd(splitTotals.totalShippingCents)} onchange={(e) => splitTotals = { ...splitTotals, totalShippingCents: usdToCents((e.target as HTMLInputElement).value) }} />
          </div>
          <div>
            <label class="label" for="split-fees">Other Fees (USD)</label>
            <input id="split-fees" type="number" step="0.01" min="0" class="input" value={centsToUsd(splitTotals.totalOtherFeesCents)} onchange={(e) => splitTotals = { ...splitTotals, totalOtherFeesCents: usdToCents((e.target as HTMLInputElement).value) }} />
          </div>
          <div>
            <label class="label" for="split-notes">Receipt Notes</label>
            <input id="split-notes" class="input" bind:value={splitReceiptNotes} />
          </div>
          <div class="md:col-span-4 flex items-end">
            <div class="total-box">
              <div class="text-xs text-muted">Grand Total</div>
              <div class="figure text-xl">${centsToUsd(splitGrandTotalCents())}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-6">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold">Items</h3>
          <button class="btn btn-secondary btn-sm" onclick={() => addSplitLine()}>Add Line</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Device</th>
                <th>Part</th>
                <th>New Part Name</th>
                <th>Qty</th>
                <th>Notes</th>
                <th>Subtotal (USD)</th>
                {#if splitMethod === 'MANUAL'}
                  <th>Tax (USD)</th>
                  <th>Shipping (USD)</th>
                  <th>Fees (USD)</th>
                {/if}
                <th>Loaded Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each splitLines as ln, i}
                <tr>
                  <td>
                    <select
                      class="input input-sm"
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
                  <td>
                    <select class="input input-sm" bind:value={ln.deviceId}>
                      <option value={null}>-</option>
                      {#each data.devices as d}
                        <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
                      {/each}
                    </select>
                  </td>
                  <td>
                    <select
                      class="input input-sm"
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
                  <td>
                    <input
                      class="input input-sm"
                      placeholder="New Part Name (optional)"
                      bind:value={ln.newPartName}
                      disabled={!isPartsCategory(ln.categoryId) || !!ln.partId}
                    />
                  </td>
                  <td>
                    <input
                      class="input input-sm"
                      type="number"
                      min={isPartsCategory(ln.categoryId) ? 1 : 0}
                      step="1"
                      bind:value={ln.quantity}
                      disabled={!isPartsCategory(ln.categoryId)}
                    />
                  </td>
                  <td><input class="input input-sm" bind:value={ln.notes} /></td>
                  <td>
                    <input class="input input-sm" value={centsToUsd(ln.subtotalCents)} onchange={(e) => { ln.subtotalCents = usdToCents((e.target as HTMLInputElement).value); splitLines = [...splitLines]; }} />
                  </td>
                  {#if splitMethod === 'MANUAL'}
                    <td><input class="input input-sm" value={centsToUsd(ln.taxCents || 0)} onchange={(e) => { ln.taxCents = usdToCents((e.target as HTMLInputElement).value); splitLines = [...splitLines]; }} /></td>
                    <td><input class="input input-sm" value={centsToUsd(ln.shippingCents || 0)} onchange={(e) => { ln.shippingCents = usdToCents((e.target as HTMLInputElement).value); splitLines = [...splitLines]; }} /></td>
                    <td><input class="input input-sm" value={centsToUsd(ln.otherFeesCents || 0)} onchange={(e) => { ln.otherFeesCents = usdToCents((e.target as HTMLInputElement).value); splitLines = [...splitLines]; }} /></td>
                  {/if}
                  <td>
                    {#if splitMethod === 'MANUAL'}
                      {centsToUsd((ln.subtotalCents) + (ln.taxCents||0) + (ln.shippingCents||0) + (ln.otherFeesCents||0))}
                    {:else}
                      {centsToUsd(allocPreview[i]?.loadedTotalCents || 0)}
                    {/if}
                  </td>
                  <td>
                    <button class="btn btn-danger btn-sm" onclick={() => removeSplitLine(i)}>Remove</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
      {#snippet footer()}
        <button data-testid="expenses-save-split-receipt" class="btn btn-primary" onclick={submitSplit}>Save Split</button>
      {/snippet}
  </Modal>
{/if}

<div class="table-wrap">
<table class="data-table">
  <thead>
    <tr>
      <th>Date</th>
      <th>Amount</th>
      <th>Category</th>
      <th>Vendor</th>
      <th class="w-64">Device</th>
      <th class="w-80">Notes</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.expenses as e}
      <tr>
        <td>{new Date(e.date).toLocaleDateString()}</td>
        <td>{formatUsd(e.amountCents)}</td>
        <td>{e.category?.name}</td>
        <td>{e.vendor?.name || '-'}</td>
        <td>
          {#if e.device}
            <div class="truncate" title={`${e.device.sku} — ${e.device.make} ${e.device.model}`}>
              <SkuTag code={e.device.sku} href={`/devices/${e.device.id}`} /> <span class="text-muted">{e.device.make} {e.device.model}</span>
            </div>
          {:else}
            -
          {/if}
        </td>
        <td>
          <div class="truncate" title={e.notes || e.receiptNotes || ''}>{e.notes || e.receiptNotes || '-'}</div>
        </td>
        <td>
          <div class="flex items-center gap-2">
            {#if e.splitGroupId}
              <a class="icon-btn" title="Edit Receipt" aria-label="Edit Receipt" href={`/expenses/receipt/${e.splitGroupId}`}>
                <Icon name="receipt" />
              </a>
            {/if}
            <button class="icon-btn" title="Edit" aria-label="Edit" onclick={() => (editingId = editingId === e.id ? null : e.id)}>
              <Icon name="edit" />
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(ev) => { if (!confirm('Archive this expense? You can restore it later via the database.')) { ev.preventDefault(); } }}>
              <input type="hidden" name="id" value={e.id} />
              <button class="icon-btn icon-btn-danger" title="Archive" aria-label="Archive">
                <Icon name="archive" />
              </button>
            </form>
          </div>
        </td>
      </tr>
      {#if editingId === e.id}
        <tr class="edit-row">
          <td colspan="7">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={e.id} />
              <div>
                <label class="label" for={`date-${e.id}`}>Date</label>
                <input id={`date-${e.id}`} name="date" type="date" class="input" value={new Date(e.date).toISOString().slice(0,10)} />
              </div>
              <div>
                <label class="label" for={`amount-${e.id}`}>Amount (USD)</label>
                <input id={`amount-${e.id}`} name="amount" type="number" step="0.01" min="0" class="input" value={(e.amountCents/100).toFixed(2)} />
              </div>
              <div>
                <label class="label" for={`categoryId-${e.id}`}>Category</label>
                <select id={`categoryId-${e.id}`} name="categoryId" class="input">
                  {#each data.categories as c}
                    <option value={c.id} selected={e.category?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="label" for={`vendorId-${e.id}`}>Vendor</label>
                <select id={`vendorId-${e.id}`} name="vendorId" class="input">
                  <option value="" selected={!e.vendor}>-</option>
                  {#each data.vendors as v}
                    <option value={v.id} selected={e.vendor?.id === v.id}>{v.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="label" for={`paymentMethodId-${e.id}`}>Payment Method</label>
                <select id={`paymentMethodId-${e.id}`} name="paymentMethodId" class="input">
                  <option value="" selected={!e.paymentMethod}>-</option>
                  {#each data.paymentMethods as m}
                    <option value={m.id} selected={e.paymentMethod?.id === m.id}>{m.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="label" for={`vendorOrderNumber-${e.id}`}>Vendor Order #</label>
                <input id={`vendorOrderNumber-${e.id}`} name="vendorOrderNumber" class="input" value={e.vendorOrderNumber || ''} />
              </div>
              <div>
                <label class="label" for={`deviceId-${e.id}`}>Device</label>
                <select id={`deviceId-${e.id}`} name="deviceId" class="input">
                  <option value="" selected={!e.device}>-</option>
                  {#each data.devices as d}
                    <option value={d.id} selected={e.device?.id === d.id}>{d.sku} — {d.make} {d.model}</option>
                  {/each}
                </select>
              </div>
              <div class="md:col-span-3">
                <label class="label" for={`notes-${e.id}`}>Notes</label>
                <textarea id={`notes-${e.id}`} name="notes" class="input">{e.notes || ''}</textarea>
              </div>
              <div class="md:col-span-3 flex gap-2">
                <button class="btn btn-primary">Save</button>
                <button class="btn btn-secondary" onclick={(ev) => { ev.preventDefault(); editingId = null; }}>Cancel</button>
              </div>
            </form>
          </td>
        </tr>
      {/if}
    {:else}
      <tr><td colspan="7" class="empty-cell">No expenses{data.filters.from || data.filters.to ? ' in this date range' : ' yet'}.</td></tr>
    {/each}
  </tbody>
</table>
</div>
