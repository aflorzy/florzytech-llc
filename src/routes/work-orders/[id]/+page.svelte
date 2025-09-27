<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import type { ActionResult } from '@sveltejs/kit';
  type Customer = { id: string; name: string };
  type Device = { id: string; sku: string; make: string; model: string };
  type Part = { id: string; name: string; averageCostCents?: number | null; unitCostCents?: number | null };
  type WorkOrderDevice = { id: string; role: string; device: Device };
  type WorkOrderItem = {
    id: string;
    type: 'LABOR' | 'NOTE' | 'PART';
    description?: string | null;
    amountCents?: number | null;
    part?: Part | null;
    device?: Device | null;
    quantity?: number | null;
    unitCostCentsSnapshot?: number | null;
  };
  type WorkOrder = {
    id: string;
    code: string;
    status: 'OPEN' | 'WAITING_PARTS' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELLED';
    targetAction: 'RETURN_TO_CUSTOMER' | 'SELL';
    notes?: string | null;
    customer?: Customer | null;
    devices: WorkOrderDevice[];
    items: WorkOrderItem[];
  };
  type Summary = {
    partsCostCents: number;
    laborPlannedCents: number;
    income: {
      grossCents: number;
      platformFeesCents: number;
      paymentFeesCents: number;
      shippingRevenueCents: number;
      shippingCostCents: number;
      netRevenueCents: number;
    };
    deviceExpensesCents: number;
    profitCents: number;
  };
  let { data } = $props<{ data: { workOrder: WorkOrder | null; customers: Customer[]; devices: Device[]; parts: Part[]; summary: Summary } }>();
  let w = $derived(data.workOrder as WorkOrder | null);
  let itemType = $state<'LABOR' | 'NOTE' | 'PART'>('LABOR');
  let itemTypeLoaded = $state(false);
  onMount(() => {
    try {
      const t = localStorage.getItem('wo_item_type');
      if (t === 'LABOR' || t === 'NOTE' || t === 'PART') itemType = t;
    } catch {}
    itemTypeLoaded = true;
  });
  $effect(() => {
    if (!itemTypeLoaded) return;
    try { localStorage.setItem('wo_item_type', itemType); } catch {}
  });
  let itemDescription = $state('');
  let itemAmountUsd = $state('');
  let itemPartId = $state<string>('');
  let itemDeviceId = $state<string>('');
  let itemQuantity = $state<number>(1);
  let itemSubmitting = $state(false);
  let itemError = $state('');

  // Formatting helpers
  const fmtUsd = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;
  const totalCostsCents = $derived((data.summary.partsCostCents || 0) + (data.summary.deviceExpensesCents || 0));

  // Progressive enhancement for Items form: intercept result and show errors (no full reload)
  import type { SubmitFunction } from '$app/forms';
  type ResultFailure = { type: 'failure'; status: number; data?: { error?: string } };
  type ResultError = { type: 'error'; error: Error };
  type ResultSuccess = { type: 'success'; status: number; data?: { success?: boolean; error?: string } };
  type ResultRedirect = { type: 'redirect' };
  type Result = ResultFailure | ResultError | ResultSuccess | ResultRedirect;

  const addItemEnhancer: SubmitFunction = () => {
    return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
      itemSubmitting = true;
      try {
        itemError = '';
        const r = result as Result;
        if (r?.type === 'failure') {
          const err = r.data?.error || 'Failed to add item';
          itemError = err;
          alert(err);
          return;
        }
        if (r?.type === 'error') {
          const err = r.error?.message || 'Failed to add item';
          itemError = err;
          alert(err);
          return;
        }
        const data = (r as ResultSuccess | undefined)?.data;
        if (data && data.success === false) {
          const err = data.error || 'Failed to add item';
          itemError = err;
          alert(err);
          return;
        }
        const prevType = itemType;
        try { localStorage.setItem('wo_item_type', prevType); } catch {}
        await update();
        // Force-restore previously selected type so it doesn't reset to default
        try {
          const persisted = localStorage.getItem('wo_item_type');
          if (persisted === 'LABOR' || persisted === 'NOTE' || persisted === 'PART') {
            itemType = persisted;
          } else {
            itemType = prevType;
          }
        } catch {
          itemType = prevType;
        }
        // Clear fields but keep the Type selection
        if (itemType === 'PART') {
          itemPartId = '';
          itemDeviceId = '';
          itemQuantity = 1;
        } else if (itemType === 'LABOR') {
          itemDescription = '';
          itemAmountUsd = '';
        } else {
          itemDescription = '';
        }
      } finally {
        itemSubmitting = false;
      }
    };
  };
</script>

{#if !w}
  <p>Work Order not found.</p>
{:else}
  <h1 class="text-2xl font-semibold mb-4">Work Order — {w.code}</h1>

  <div class="grid gap-3 md:grid-cols-4 mb-6">
    <div class="border rounded p-3 bg-zinc-50 dark:bg-zinc-800">
      <div class="text-xs text-zinc-500">Gross Revenue</div>
      <div class="text-lg font-semibold">{fmtUsd(data.summary.income.grossCents || 0)}</div>
    </div>
    <div class="border rounded p-3 bg-zinc-50 dark:bg-zinc-800">
      <div class="text-xs text-zinc-500">Net Revenue</div>
      <div class="text-lg font-semibold">{fmtUsd(data.summary.income.netRevenueCents || 0)}</div>
      <div class="text-[11px] text-zinc-500 mt-1">- Platform {(data.summary.income.platformFeesCents/100).toFixed(2)} · - Payment {(data.summary.income.paymentFeesCents/100).toFixed(2)} · + Ship {(data.summary.income.shippingRevenueCents/100).toFixed(2)} · - ShipCost {(data.summary.income.shippingCostCents/100).toFixed(2)}</div>
    </div>
    <div class="border rounded p-3 bg-zinc-50 dark:bg-zinc-800">
      <div class="text-xs text-zinc-500">Total Costs</div>
      <div class="text-lg font-semibold">{fmtUsd(totalCostsCents)}</div>
      <div class="text-[11px] text-zinc-500 mt-1">Parts {(data.summary.partsCostCents/100).toFixed(2)} · Device Exp {(data.summary.deviceExpensesCents/100).toFixed(2)}</div>
    </div>
    <div class="border rounded p-3 bg-zinc-50 dark:bg-zinc-800">
      <div class="text-xs text-zinc-500">Profit</div>
      <div class="text-lg font-semibold {data.summary.profitCents > 0 ? 'text-green-600' : data.summary.profitCents < 0 ? 'text-red-600' : ''}">{fmtUsd(data.summary.profitCents || 0)}</div>
      <div class="text-[11px] text-zinc-500 mt-1">Net Rev {(data.summary.income.netRevenueCents/100).toFixed(2)} − Costs {(totalCostsCents/100).toFixed(2)}</div>
    </div>
  </div>

  <div class="border rounded p-4 mb-6 grid gap-3 md:grid-cols-3">
    <form method="post" action="?/update_header" class="contents">
      <div class="min-w-0">
        <label class="block text-sm" for="status">Status</label>
        <select id="status" name="status" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
          <option value="OPEN" selected={w.status === 'OPEN'}>Open</option>
          <option value="WAITING_PARTS" selected={w.status === 'WAITING_PARTS'}>Waiting Parts</option>
          <option value="IN_PROGRESS" selected={w.status === 'IN_PROGRESS'}>In Progress</option>
          <option value="READY" selected={w.status === 'READY'}>Ready</option>
          <option value="DELIVERED" selected={w.status === 'DELIVERED'}>Delivered</option>
          <option value="CANCELLED" selected={w.status === 'CANCELLED'}>Cancelled</option>
        </select>
      </div>
      <div>
        <label class="block text-sm" for="targetAction">Target Action</label>
        <select id="targetAction" name="targetAction" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
          <option value="RETURN_TO_CUSTOMER" selected={w.targetAction === 'RETURN_TO_CUSTOMER'}>Return to Customer</option>
          <option value="SELL" selected={w.targetAction === 'SELL'}>Sell</option>
        </select>
      </div>
      <div>
        <label class="block text-sm" for="customerId">Customer</label>
        <select id="customerId" name="customerId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
          <option value="" selected={!w.customer}>-</option>
          {#each data.customers as c}
            <option value={c.id} selected={w.customer?.id === c.id}>{c.name}</option>
          {/each}
        </select>
      </div>
      <div class="md:col-span-3">
        <label class="block text-sm" for="notes">Notes</label>
        <textarea id="notes" name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">{w.notes || ''}</textarea>
      </div>
      <div class="md:col-span-3">
        <button class="px-3 py-2 rounded bg-green-600 text-white">Save Header</button>
      </div>
    </form>
  </div>

  <div class="grid grid-cols-1 2xl:grid-cols-2 gap-10 items-start mb-6">
    <div class="border rounded p-3 space-y-3 overflow-hidden min-w-0">
      <h2 class="font-semibold">Devices</h2>
      <form method="post" action="?/add_device" class="grid gap-2 md:grid-cols-12 w-full">
        <select name="deviceId" class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900 md:col-span-6 col-span-12" required>
          <option value="" selected>- Select Device -</option>
          {#each data.devices as d}
            <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
          {/each}
        </select>
        <select name="role" class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900 md:col-span-3 col-span-6">
          <option value="PRIMARY">Primary</option>
          <option value="DONOR">Donor</option>
          <option value="ACCESSORY">Accessory</option>
        </select>
        <div class="md:col-span-3 col-span-6 flex md:justify-end"><button class="px-2 py-1 rounded bg-green-600 text-white w-full md:w-auto">Add</button></div>
      </form>
      <div class="border rounded overflow-hidden">
        <table class="w-full text-sm divide-y">
          <thead><tr class="bg-zinc-50 dark:bg-zinc-800 text-left"><th class="p-2">Device</th><th class="p-2">Role</th><th class="p-2">Actions</th></tr></thead>
          <tbody>
            {#each w.devices as od}
              <tr class="divide-x">
                <td class="p-2">{od.device.sku} — {od.device.make} {od.device.model}</td>
                <td class="p-2">{od.role}</td>
                <td class="p-2">
                  <form method="post" action="?/remove_device" class="inline" onsubmit={(e) => { if (!confirm('Remove this device from the work order?')) { e.preventDefault(); } }}>
                    <input type="hidden" name="id" value={od.id} />
                    <button class="px-2 py-1 rounded bg-red-600 text-white">Remove</button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div class="md:col-span-1 min-w-0 border rounded p-3 space-y-3 overflow-hidden">
      <h2 class="font-semibold">Items</h2>
      {#if itemError}
        <div class="px-2 py-1 rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800 text-sm">{itemError}</div>
      {/if}
      <form method="post" action="?/add_item" class="grid gap-3 md:grid-cols-12 items-end min-w-0" use:enhance={addItemEnhancer}>
        <select name="type" class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900 col-span-12 md:col-span-3 md:min-w-[10rem]" bind:value={itemType}>
          <option value="LABOR">Labor</option>
          <option value="NOTE">Note</option>
          <option value="PART">Part</option>
        </select>
        {#if itemType === 'PART'}
          <select name="partId" class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900 col-span-12 md:col-span-7" bind:value={itemPartId} required>
            <option value="">- Select Part -</option>
            {#each data.parts as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
          <input name="quantity" type="number" step="1" min="1" placeholder="Qty" class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900 col-span-6 md:col-span-2" bind:value={itemQuantity} />
          <select name="deviceId" class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900 col-span-12 md:col-span-8" bind:value={itemDeviceId}>
            <option value="">- Device (optional) -</option>
            {#each data.devices as d}
              <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
            {/each}
          </select>
          <div class="col-span-12 md:col-span-8 -mt-2">
            <p class="text-xs text-zinc-500">Optionally link this part usage to a specific device on this work order. Helpful when multiple devices are attached.</p>
          </div>
          <div class="col-span-12 md:col-span-4 flex md:justify-end"><button class="px-2 py-1 rounded bg-green-600 text-white w-full md:w-auto disabled:opacity-60" disabled={itemSubmitting}>Add Part</button></div>
        {:else if itemType === 'LABOR'}
          <div class="col-span-12">
            <label class="block text-sm" for="labor-desc">Description</label>
            <input id="labor-desc" name="description" placeholder="What work was performed?" class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={itemDescription} />
          </div>
          <div class="col-span-12">
            <label class="block text-sm" for="labor-amount">Amount (USD)</label>
            <input id="labor-amount" name="amount" type="number" step="0.01" min="0" placeholder="0.00" class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={itemAmountUsd} />
            <p class="text-xs text-zinc-500 mt-1">Charge to the customer for this labor item.</p>
          </div>
          <div class="col-span-12 flex md:justify-end"><button class="px-2 py-1 rounded bg-green-600 text-white w-full md:w-auto disabled:opacity-60" disabled={itemSubmitting}>Add Labor</button></div>
        {:else}
          <div class="col-span-12 md:col-span-8">
            <label class="block text-sm" for="note-desc">Note</label>
            <input id="note-desc" name="description" placeholder="Internal note" required class="w-full px-2 py-1 border rounded bg-white dark:bg-zinc-900" bind:value={itemDescription} />
          </div>
          <div class="col-span-12 md:col-span-4 flex md:justify-end self-end"><button class="px-2 py-1 rounded bg-green-600 text-white w-full md:w-auto disabled:opacity-60" disabled={itemSubmitting}>Add Note</button></div>
        {/if}
      </form>
      <div class="border rounded overflow-hidden">
        <table class="w-full text-sm divide-y">
          <thead><tr class="bg-zinc-50 dark:bg-zinc-800 text-left"><th class="p-2">Type</th><th class="p-2">Details</th><th class="p-2">Cost</th><th class="p-2">Actions</th></tr></thead>
          <tbody>
            {#each w.items as it}
              <tr class="divide-x">
                <td class="p-2">{it.type}</td>
                <td class="p-2">
                  {#if it.type === 'PART'}
                    {#if it.part}
                      {it.part.name} {it.quantity ? `× ${it.quantity}` : ''}
                      {#if it.device}
                        <div class="text-xs text-zinc-500">{it.device.sku} — {it.device.make} {it.device.model}</div>
                      {/if}
                    {:else}
                      Part
                    {/if}
                  {:else}
                    {it.description || '-'}
                  {/if}
                </td>
                <td class="p-2">
                  {#if it.type === 'PART'}
                    {#if (it.quantity || 0) > 0}
                      {#if (it.unitCostCentsSnapshot || 0) > 0}
                        ${(((it.unitCostCentsSnapshot||0) * (it.quantity||0))/100).toFixed(2)}
                      {:else}
                        {#if (it.part?.averageCostCents || 0) > 0}
                          ~${(((it.part?.averageCostCents||0) * (it.quantity||0))/100).toFixed(2)}
                        {:else if (it.part?.unitCostCents || 0) > 0}
                          ~${(((it.part?.unitCostCents||0) * (it.quantity||0))/100).toFixed(2)}
                        {:else}-{/if}
                      {/if}
                    {:else}-{/if}
                  {:else}
                    {(it.amountCents || 0) > 0 ? `$${((it.amountCents||0)/100).toFixed(2)}` : '-'}
                  {/if}
                </td>
                <td class="p-2">
                  <form method="post" action="?/delete_item" class="inline" onsubmit={(e) => { if (!confirm('Delete this item?')) { e.preventDefault(); } }}>
                    <input type="hidden" name="id" value={it.id} />
                    <button class="px-2 py-1 rounded bg-red-600 text-white">Delete</button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}
