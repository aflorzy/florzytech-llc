<script lang="ts">
  import { previewAllocation, type AllocationMethod } from '$lib/allocation';
  type Category = { id: string; name: string };
  type Vendor = { id: string; name: string };
  type PaymentMethod = { id: string; name: string };
  type DeviceRef = { id: string; sku: string; make: string; model: string };
  type ExpenseLine = {
    id: string;
    date: string | Date;
    amountCents: number;
    notes?: string | null;
    category?: Category | null;
    vendor?: Vendor | null;
    paymentMethod?: PaymentMethod | null;
    device?: DeviceRef | null;
    categoryId: string;
    vendorId?: string | null;
    paymentMethodId?: string | null;
    deviceId?: string | null;
    subtotalCents: number;
    taxCents: number;
    shippingCents: number;
    otherFeesCents: number;
  };
  let { data } = $props<{
    data: {
      groupId: string;
      header?: { date: string | Date; vendorId: string | null; paymentMethodId: string | null; allocationMethod: string | null };
      lines: ExpenseLine[];
      totals: { tax: number; shipping: number; fees: number };
      categories: Category[];
      vendors: Vendor[];
      paymentMethods: PaymentMethod[];
      devices: DeviceRef[];
    };
  }>();

  let date = $state<string>(new Date(data.header?.date || new Date()).toISOString().slice(0, 10));
  let vendorId = $state<string | null>(data.header?.vendorId || null);
  let paymentMethodId = $state<string | null>(data.header?.paymentMethodId || null);
  let vendorOrderNumber = $state<string>(data.header?.vendorOrderNumber || '');
  let allocationMethod = $state<AllocationMethod>((data.header?.allocationMethod as AllocationMethod) || 'PROPORTIONAL_SUBTOTAL');
  let totals = $state({ totalTaxCents: data.totals.tax || 0, totalShippingCents: data.totals.shipping || 0, totalOtherFeesCents: data.totals.fees || 0 });
  type EditableLine = {
    id?: string;
    categoryId: string;
    deviceId?: string | null;
    notes?: string | null;
    subtotalCents: number;
    taxCents: number;
    shippingCents: number;
    otherFeesCents: number;
  };
  let lines = $state<EditableLine[]>(data.lines.map((l: ExpenseLine) => ({
    id: l.id,
    categoryId: l.categoryId,
    deviceId: l.deviceId || null,
    notes: l.notes || '',
    subtotalCents: l.subtotalCents || 0,
    taxCents: l.taxCents || 0,
    shippingCents: l.shippingCents || 0,
    otherFeesCents: l.otherFeesCents || 0
  })));

  // Receipt-level notes: prefill from common line notes if all equal; otherwise empty
  let receiptNotes = $state<string>('');
  const uniqueNotes = Array.from(new Set(lines.map((l) => (l.notes || '').trim())));
  receiptNotes = uniqueNotes.length === 1 ? (uniqueNotes[0] || '') : '';
  let applyNotesToAll = $state(false);

  function usdToCents(v: string): number { const n = parseFloat(v); return Math.round((n || 0) * 100); }
  function centsToUsd(n: number): string { return ((n || 0) / 100).toFixed(2); }

  function addLine() {
    const firstCat = data.categories[0]?.id || '';
    lines = [...lines, { categoryId: firstCat, deviceId: null, notes: '', subtotalCents: 0, taxCents: 0, shippingCents: 0, otherFeesCents: 0 }];
    reallocateFromState();
  }
  function removeLine(idx: number) {
    lines = lines.filter((_, i) => i !== idx);
    reallocateFromState();
  }

  function reallocateFromState() {
    if (allocationMethod === 'MANUAL') return;
    const preview = previewAllocation(allocationMethod, lines.map(l => ({ subtotalCents: l.subtotalCents })), totals);
    lines = lines.map((ln, i) => ({
      ...ln,
      taxCents: preview[i]?.taxCents || 0,
      shippingCents: preview[i]?.shippingCents || 0,
      otherFeesCents: preview[i]?.otherFeesCents || 0
    }));
  }

  function grandTotalCents(): number {
    if (allocationMethod === 'MANUAL') {
      return lines.reduce((s, l) => s + l.subtotalCents + l.taxCents + l.shippingCents + l.otherFeesCents, 0);
    }
    const prev = previewAllocation(allocationMethod, lines.map(l => ({ subtotalCents: l.subtotalCents })), totals);
    return prev.reduce((s, p) => s + p.loadedTotalCents, 0);
  }

  async function save() {
    const payload = {
      date,
      vendorId: vendorId || null,
      paymentMethodId: paymentMethodId || null,
      vendorOrderNumber: vendorOrderNumber || null,
      allocationMethod,
      totals,
      lines: lines.map((ln) => {
        const note = (receiptNotes || '').trim();
        const current = (ln.notes || '').trim();
        const finalNotes = applyNotesToAll ? note : (current || note);
        return { ...ln, notes: finalNotes };
      })
    };
    const res = await fetch(`/expenses/receipt/${data.groupId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) {
      alert(j.error || 'Failed to save receipt');
      return;
    }
    // Navigate back to expenses list
    window.location.href = '/expenses';
  }
</script>

<h1 class="text-2xl font-semibold mb-4">Edit Receipt</h1>

<div class="grid gap-3 md:grid-cols-4 mb-4">
  <div>
    <label class="block text-sm" for="date">Date</label>
    <input id="date" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={date} />
  </div>
  <div>
    <label class="block text-sm" for="vendor">Vendor</label>
    <select id="vendor" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={vendorId}>
      <option value={null}>-</option>
      {#each data.vendors as v}
        <option value={v.id}>{v.name}</option>
      {/each}
    </select>
  </div>
  <div>
    <label class="block text-sm" for="pm">Payment Method</label>
    <select id="pm" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={paymentMethodId}>
      <option value={null}>-</option>
      {#each data.paymentMethods as m}
        <option value={m.id}>{m.name}</option>
      {/each}
    </select>
  </div>
  <div>
    <label class="block text-sm" for="vendor-order">Vendor Order #</label>
    <input id="vendor-order" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={vendorOrderNumber} />
  </div>
  <div>
    <label class="block text-sm" for="method">Allocation Method</label>
    <select id="method" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={allocationMethod} onchange={() => reallocateFromState()}>
      <option value="PROPORTIONAL_SUBTOTAL">Proportional by Subtotal</option>
      <option value="EVEN">Even Split</option>
      <option value="MANUAL">Manual</option>
    </select>
  </div>
</div>

<div class="grid gap-3 md:grid-cols-4 mb-4">
  <div>
    <label class="block text-sm" for="tax">Invoice Tax (USD)</label>
    <input id="tax" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(totals.totalTaxCents)} onchange={(e) => { totals = { ...totals, totalTaxCents: usdToCents((e.target as HTMLInputElement).value) }; reallocateFromState(); }} />
  </div>
  <div>
    <label class="block text-sm" for="ship">Invoice Shipping (USD)</label>
    <input id="ship" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(totals.totalShippingCents)} onchange={(e) => { totals = { ...totals, totalShippingCents: usdToCents((e.target as HTMLInputElement).value) }; reallocateFromState(); }} />
  </div>
  <div>
    <label class="block text-sm" for="fees">Other Fees (USD)</label>
    <input id="fees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(totals.totalOtherFeesCents)} onchange={(e) => { totals = { ...totals, totalOtherFeesCents: usdToCents((e.target as HTMLInputElement).value) }; reallocateFromState(); }} />
  </div>
  <div class="flex items-end">
    <div class="w-full px-3 py-2 border rounded bg-zinc-50 dark:bg-zinc-800">
      <div class="text-xs text-zinc-500">Grand Total</div>
      <div class="text-lg font-semibold">${centsToUsd(grandTotalCents())}</div>
    </div>
  </div>
</div>

<div class="mb-4">
  <label class="block text-sm" for="receipt-notes">Receipt Notes</label>
  <input id="receipt-notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" bind:value={receiptNotes} />
  <label class="mt-2 inline-flex items-center gap-2 text-sm">
    <input type="checkbox" bind:checked={applyNotesToAll} />
    <span>Apply receipt notes to all line notes on save</span>
  </label>
  <p class="text-xs text-zinc-500 mt-1">If checked, all line items will use these notes on save (overwriting blank or existing notes).</p>
</div>

<div class="overflow-auto border rounded">
  <table class="w-full text-sm border divide-y table-fixed">
    <thead>
      <tr class="bg-zinc-50 dark:bg-zinc-800 text-left">
        <th class="p-2">Category</th>
        <th class="p-2">Device</th>
        <th class="p-2">Notes</th>
        <th class="p-2">Subtotal (USD)</th>
        <th class="p-2">Tax (USD)</th>
        <th class="p-2">Shipping (USD)</th>
        <th class="p-2">Fees (USD)</th>
        <th class="p-2">Loaded Total</th>
        <th class="p-2">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each lines as ln, i}
        <tr class="divide-x">
          <td class="p-2">
            <select class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={ln.categoryId}>
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
          <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={ln.notes} /></td>
          <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(ln.subtotalCents)} onchange={(e) => { ln.subtotalCents = usdToCents((e.target as HTMLInputElement).value); lines = [...lines]; reallocateFromState(); }} /></td>
          <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(ln.taxCents)} disabled={allocationMethod !== 'MANUAL'} onchange={(e) => { ln.taxCents = usdToCents((e.target as HTMLInputElement).value); lines = [...lines]; }} /></td>
          <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(ln.shippingCents)} disabled={allocationMethod !== 'MANUAL'} onchange={(e) => { ln.shippingCents = usdToCents((e.target as HTMLInputElement).value); lines = [...lines]; }} /></td>
          <td class="p-2"><input class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" value={centsToUsd(ln.otherFeesCents)} disabled={allocationMethod !== 'MANUAL'} onchange={(e) => { ln.otherFeesCents = usdToCents((e.target as HTMLInputElement).value); lines = [...lines]; }} /></td>
          <td class="p-2">{allocationMethod === 'MANUAL' ? centsToUsd(ln.subtotalCents + ln.taxCents + ln.shippingCents + ln.otherFeesCents) : (() => { const p = previewAllocation(allocationMethod, lines.map(l => ({ subtotalCents: l.subtotalCents })), totals); return centsToUsd(p[i]?.loadedTotalCents || 0); })()}</td>
          <td class="p-2"><button class="px-2 py-1 rounded bg-red-600 text-white" onclick={() => removeLine(i)}>Remove</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<div class="mt-3 flex items-center justify-between">
  <button class="px-2 py-1 rounded bg-blue-600 text-white" onclick={() => addLine()}>Add Line</button>
  <div class="flex items-center gap-2">
    <a href="/expenses" class="px-3 py-2 rounded bg-zinc-300 dark:bg-zinc-700">Cancel</a>
    <button class="px-3 py-2 rounded bg-green-600 text-white" onclick={save}>Save Changes</button>
  </div>
</div>
