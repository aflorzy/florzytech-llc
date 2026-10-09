<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import SkuTag from '$lib/components/SkuTag.svelte';
  import Badge from '$lib/components/Badge.svelte';
  import { formatUsd, humanizeEnum } from '$lib/format';
  import { formatBps, type PartLinePrice } from '$lib/pricing';
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
  type Customer = { id: string; name: string };
  type Device = { id: string; sku: string; make: string; model: string };
  type Part = { id: string; name: string; averageCostCents?: number | null; unitCostCents?: number | null };
  type WorkOrderDevice = {
    id: string;
    role: string;
    device: Device;
    includeDeviceCost: boolean;
    expensesCents: number;
    harvestedCents: number;
    costCountedOn: { id: string; code: string } | null;
    // False for the customer's own device being returned: it has no price
    priceApplies: boolean;
    priceCents: number | null;
  };
  type WorkOrderItem = {
    id: string;
    type: 'LABOR' | 'NOTE' | 'PART';
    description?: string | null;
    amountCents?: number | null;
    part?: Part | null;
    device?: Device | null;
    quantity?: number | null;
    unitCostCentsSnapshot?: number | null;
    // PART lines only
    partPrice: PartLinePrice | null;
    // What the customer is charged for the line; null when it has no price
    priceCents: number | null;
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
    invoice: {
      partsPriceCents: number;
      laborPriceCents: number;
      devicesPriceCents: number;
      invoiceTotalCents: number;
      totalCostCents: number;
      expectedProfitCents: number;
      receivedCents: number;
      balanceDueCents: number;
      unpricedPartLines: number;
    };
  };
  type Pricing = {
    // Markup on default-priced part lines; null when invoiced before prices existed
    markupBps: number | null;
    markupSource: 'setting' | 'invoice' | 'unpriced';
    settingMarkupBps: number;
    invoicedAt: string | Date | null;
  };
  let { data, form } = $props<{
    data: { workOrder: WorkOrder | null; customers: Customer[]; devices: Device[]; parts: Part[]; summary: Summary; pricing: Pricing };
    form?: { error?: string } | null;
  }>();
  const invoice = $derived(data.summary.invoice as Summary['invoice']);
  const pricing = $derived(data.pricing as Pricing);
  // Cents as a plain amount for a price input
  const amountOf = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2));
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
  const totalCostsCents = $derived((data.summary.partsCostCents || 0) + (data.summary.deviceExpensesCents || 0));

  // Progressive enhancement for Items form: intercept result and show errors (no full reload)
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
  <PageHeader title="Work order not found" back={{ href: '/work-orders', label: 'Work Orders' }} />
{:else}
  <PageHeader title={w.code} back={{ href: '/work-orders', label: 'Work Orders' }}>
    {#snippet meta()}
      <StatusBadge status={w.status} />
      <span class="text-sm text-muted">{humanizeEnum(w.targetAction)}{w.customer ? ` for ${w.customer.name}` : ''}</span>
      {#if pricing.invoicedAt}
        <Badge tone="info">Invoiced {new Date(pricing.invoicedAt).toLocaleDateString()}</Badge>
      {:else}
        <Badge>Not invoiced</Badge>
      {/if}
    {/snippet}
    {#snippet actions()}
      {#if pricing.invoicedAt}
        <form method="post" action="?/unmark_invoiced" onsubmit={(e) => { if (!confirm(`Undo invoiced? Parts on the default price will follow the current markup (${formatBps(pricing.settingMarkupBps)}).`)) { e.preventDefault(); } }}>
          <button class="btn btn-ghost">Undo invoiced</button>
        </form>
      {:else}
        <form method="post" action="?/mark_invoiced">
          <button class="btn btn-secondary">Mark invoiced</button>
        </form>
      {/if}
    {/snippet}
  </PageHeader>

  {#if form?.error}
    <div class="alert-error mb-4" role="alert">{form.error}</div>
  {/if}

  <h2 class="mb-2 text-sm font-medium text-muted">Invoice</h2>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard
      size="sm"
      label="Invoice Total"
      testid="wo-invoice-total"
      cents={invoice.invoiceTotalCents}
      hint={`Parts ${formatUsd(invoice.partsPriceCents)}, labor ${formatUsd(invoice.laborPriceCents)}, devices ${formatUsd(invoice.devicesPriceCents)}`}
    />
    <StatCard
      size="sm"
      label="Expected Profit"
      testid="wo-expected-profit"
      cents={invoice.expectedProfitCents}
      tone="auto"
      hint={`Invoice total minus total cost of ${formatUsd(invoice.totalCostCents)}`}
    />
    <StatCard size="sm" label="Received" testid="wo-received" cents={invoice.receivedCents} hint="Paid on every income tied to this work order, before fees" />
    <StatCard
      size="sm"
      label="Balance Due"
      testid="wo-balance-due"
      cents={invoice.balanceDueCents}
      hint={invoice.balanceDueCents < 0 ? `Paid ${formatUsd(-invoice.balanceDueCents)} over the invoice total` : 'Invoice total minus received'}
    />
  </div>
  <p class="hint mb-6 mt-2">
    {#if pricing.markupSource === 'setting'}
      Parts are priced at cost plus {formatBps(pricing.settingMarkupBps)}, the default in <a class="link" href="/settings/pricing">Settings</a>, unless you type a price. Invoicing fixes that percentage for this work order.
    {:else if pricing.markupSource === 'invoice'}
      Invoiced: parts stay at cost plus {formatBps(pricing.markupBps ?? 0)}, the markup when it was invoiced{pricing.settingMarkupBps !== pricing.markupBps ? ` (the default is now ${formatBps(pricing.settingMarkupBps)})` : ''}, unless you type a price.
    {:else}
      Invoiced before line prices existed, so parts are not priced unless you type a price.
    {/if}
    {#if invoice.unpricedPartLines > 0}
      <span class="text-accent-ink">{invoice.unpricedPartLines} part {invoice.unpricedPartLines === 1 ? 'line has' : 'lines have'} no price yet.</span>
    {/if}
  </p>

  <h2 class="mb-2 text-sm font-medium text-muted">Actual so far</h2>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
    <StatCard size="sm" label="Gross Revenue" cents={data.summary.income.grossCents || 0} />
    <StatCard
      size="sm"
      label="Net Revenue"
      cents={data.summary.income.netRevenueCents || 0}
      hint={`Platform fees ${formatUsd(data.summary.income.platformFeesCents)}, payment fees ${formatUsd(data.summary.income.paymentFeesCents)}, shipping charged ${formatUsd(data.summary.income.shippingRevenueCents)}, shipping cost ${formatUsd(data.summary.income.shippingCostCents)}`}
    />
    <StatCard
      size="sm"
      label="Total Costs"
      cents={totalCostsCents}
      hint={`Parts ${formatUsd(data.summary.partsCostCents)}, device expenses ${formatUsd(data.summary.deviceExpensesCents)}`}
    />
    <StatCard size="sm" label="Profit" cents={data.summary.profitCents || 0} tone="auto" hint="Net revenue minus total costs" />
  </div>

  <div class="card mb-6 grid gap-x-4 gap-y-3 md:grid-cols-3">
    <form method="post" action="?/update_header" class="contents">
      <div class="min-w-0">
        <label class="label" for="status">Status</label>
        <select id="status" name="status" class="input">
          <option value="OPEN" selected={w.status === 'OPEN'}>Open</option>
          <option value="WAITING_PARTS" selected={w.status === 'WAITING_PARTS'}>Waiting Parts</option>
          <option value="IN_PROGRESS" selected={w.status === 'IN_PROGRESS'}>In Progress</option>
          <option value="READY" selected={w.status === 'READY'}>Ready</option>
          <option value="DELIVERED" selected={w.status === 'DELIVERED'}>Delivered</option>
          <option value="CANCELLED" selected={w.status === 'CANCELLED'}>Cancelled</option>
        </select>
      </div>
      <div>
        <label class="label" for="targetAction">Target Action</label>
        <select id="targetAction" name="targetAction" class="input">
          <option value="RETURN_TO_CUSTOMER" selected={w.targetAction === 'RETURN_TO_CUSTOMER'}>Return to Customer</option>
          <option value="SELL" selected={w.targetAction === 'SELL'}>Sell</option>
        </select>
      </div>
      <div>
        <label class="label" for="customerId">Customer</label>
        <select id="customerId" name="customerId" class="input">
          <option value="" selected={!w.customer}>-</option>
          {#each data.customers as c}
            <option value={c.id} selected={w.customer?.id === c.id}>{c.name}</option>
          {/each}
        </select>
      </div>
      <div class="md:col-span-3">
        <label class="label" for="notes">Notes</label>
        <textarea id="notes" name="notes" class="input">{w.notes || ''}</textarea>
      </div>
      <div class="md:col-span-3">
        <button class="btn btn-primary">Save Header</button>
      </div>
    </form>
  </div>

  <div class="grid grid-cols-1 gap-4 items-start mb-6">
    <div class="card space-y-4 min-w-0">
      <h2 class="text-lg font-semibold">Devices</h2>
      <form method="post" action="?/add_device" class="grid gap-2 md:grid-cols-12 w-full">
        <select name="deviceId" class="input input-sm md:col-span-6 col-span-12" required>
          <option value="" selected>- Select Device -</option>
          {#each data.devices as d}
            <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
          {/each}
        </select>
        <select name="role" class="input input-sm md:col-span-3 col-span-6">
          <option value="PRIMARY">Primary</option>
          <option value="DONOR">Donor</option>
          <option value="ACCESSORY">Accessory</option>
        </select>
        <div class="md:col-span-3 col-span-6 flex md:justify-end"><button class="btn btn-secondary w-full md:w-auto">Add</button></div>
      </form>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Device</th><th>Role</th><th>Device cost</th><th>Price</th><th>Actions</th></tr></thead>
          <tbody>
            {#each w.devices as od}
              <tr>
                <td><SkuTag code={od.device.sku} href={`/devices/${od.device.id}`} /> <span class="text-muted">{od.device.make} {od.device.model}</span></td>
                <td><StatusBadge status={od.role} /></td>
                <td>
                  {#if od.role === 'DONOR'}
                    <span class="text-muted">Recouped through its parts</span>
                  {:else if od.includeDeviceCost}
                    {formatUsd(od.expensesCents)}
                    {#if od.harvestedCents > 0}
                      <div class="text-xs text-muted">after {formatUsd(od.harvestedCents)} harvested to parts stock</div>
                    {/if}
                  {:else}
                    <span class="text-muted">Not counted</span>
                    {#if od.costCountedOn}
                      <div class="text-xs text-muted">Counted on <a class="link" href={`/work-orders/${od.costCountedOn.id}`}>{od.costCountedOn.code}</a></div>
                    {/if}
                  {/if}
                </td>
                <td>
                  {#if od.priceApplies}
                    <form method="post" action="?/set_device_price" class="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={od.id} />
                      <input name="price" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label={`Price for ${od.device.sku}`} class="input input-sm w-24" value={amountOf(od.priceCents)} />
                      <button class="btn btn-secondary btn-sm">Save</button>
                    </form>
                    {#if od.priceCents == null}
                      <div class="mt-1 text-xs text-muted">Not priced</div>
                    {/if}
                  {:else}
                    <span class="text-muted">Customer's device</span>
                  {/if}
                </td>
                <td>
                  {#if od.role !== 'DONOR'}
                    <form method="post" action="?/set_device_cost" class="inline">
                      <input type="hidden" name="id" value={od.id} />
                      <input type="hidden" name="include" value={od.includeDeviceCost ? 'false' : 'true'} />
                      <button class="btn btn-secondary btn-sm">{od.includeDeviceCost ? 'Exclude cost' : 'Count cost here'}</button>
                    </form>
                  {/if}
                  <form method="post" action="?/remove_device" class="inline" onsubmit={(e) => { if (!confirm('Remove this device from the work order?')) { e.preventDefault(); } }}>
                    <input type="hidden" name="id" value={od.id} />
                    <button class="btn btn-danger btn-sm">Remove</button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="hint">A device's purchase and other expenses count against one work order. When it comes back for another job, its cost stays on the original one. A donor's cost is never counted on a work order: it is charged where the parts taken from it are used. Price is what the customer is charged for the device on this work order; leave it empty to charge nothing.</p>
    </div>

    <div class="card space-y-4 min-w-0">
      <h2 class="text-lg font-semibold">Items</h2>
      {#if itemError}
        <div class="alert-error" role="alert">{itemError}</div>
      {/if}
      <form method="post" action="?/add_item" class="grid gap-3 md:grid-cols-12 items-end min-w-0" use:enhance={addItemEnhancer}>
        <select name="type" class="input input-sm col-span-12 md:col-span-3 md:min-w-[10rem]" bind:value={itemType}>
          <option value="LABOR">Labor</option>
          <option value="NOTE">Note</option>
          <option value="PART">Part</option>
        </select>
        {#if itemType === 'PART'}
          <select name="partId" class="input input-sm col-span-12 md:col-span-7" bind:value={itemPartId} required>
            <option value="">- Select Part -</option>
            {#each data.parts as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
          <input name="quantity" type="number" step="1" min="1" placeholder="Qty" class="input input-sm col-span-6 md:col-span-2" bind:value={itemQuantity} />
          <select name="deviceId" class="input input-sm col-span-12 md:col-span-8" bind:value={itemDeviceId}>
            <option value="">- Device (optional) -</option>
            {#each data.devices as d}
              <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
            {/each}
          </select>
          <div class="col-span-12 md:col-span-8 -mt-2">
            <p class="text-xs text-muted">Optionally link this part usage to a specific device on this work order. Helpful when multiple devices are attached.</p>
          </div>
          <div class="col-span-12 md:col-span-4 flex md:justify-end"><button class="btn btn-secondary w-full md:w-auto" disabled={itemSubmitting}>Add Part</button></div>
        {:else if itemType === 'LABOR'}
          <div class="col-span-12">
            <label class="label" for="labor-desc">Description</label>
            <input id="labor-desc" name="description" placeholder="What work was performed?" class="input input-sm" bind:value={itemDescription} />
          </div>
          <div class="col-span-12">
            <label class="label" for="labor-amount">Amount (USD)</label>
            <input id="labor-amount" name="amount" type="number" step="0.01" min="0" placeholder="0.00" class="input input-sm" bind:value={itemAmountUsd} />
            <p class="hint">Charge to the customer for this labor item.</p>
          </div>
          <div class="col-span-12 flex md:justify-end"><button class="btn btn-secondary w-full md:w-auto" disabled={itemSubmitting}>Add Labor</button></div>
        {:else}
          <div class="col-span-12 md:col-span-8">
            <label class="label" for="note-desc">Note</label>
            <input id="note-desc" name="description" placeholder="Internal note" required class="input input-sm" bind:value={itemDescription} />
          </div>
          <div class="col-span-12 md:col-span-4 flex md:justify-end self-end"><button class="btn btn-secondary w-full md:w-auto" disabled={itemSubmitting}>Add Note</button></div>
        {/if}
      </form>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Type</th><th>Details</th><th>Cost</th><th>Price</th><th>Actions</th></tr></thead>
          <tbody>
            {#each w.items as it}
              <tr>
                <td><StatusBadge status={it.type} /></td>
                <td>
                  {#if it.type === 'PART'}
                    {#if it.part}
                      {it.part.name} {it.quantity ? `× ${it.quantity}` : ''}
                      {#if it.device}
                        <div class="text-xs text-muted">{it.device.sku} — {it.device.make} {it.device.model}</div>
                      {/if}
                    {:else}
                      Part
                    {/if}
                  {:else}
                    {it.description || '-'}
                  {/if}
                </td>
                <td>
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
                    -
                  {/if}
                </td>
                <td>
                  {#if it.type === 'PART' && it.partPrice}
                    {@const pp = it.partPrice}
                    <div class="flex flex-wrap items-center gap-1.5">
                      <form method="post" action="?/set_item_price" class="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={it.id} />
                        <input
                          name="price"
                          inputmode="decimal"
                          autocomplete="off"
                          aria-label={`Price each for ${it.part?.name ?? 'part'}`}
                          class="input input-sm w-24"
                          placeholder={pp.source === 'default' && !pp.needsManualPrice ? amountOf(pp.unitPriceCents) : '0.00'}
                          value={pp.source === 'manual' ? amountOf(pp.unitPriceCents) : ''}
                        />
                        <span class="text-xs text-muted">each</span>
                        <button class="btn btn-secondary btn-sm">Save</button>
                      </form>
                      {#if pp.source === 'manual'}
                        <form method="post" action="?/clear_item_price">
                          <input type="hidden" name="id" value={it.id} />
                          <button class="btn btn-ghost btn-sm">Use default</button>
                        </form>
                      {/if}
                    </div>
                    <div class="mt-1 text-xs text-muted">
                      {#if pp.source === 'unpriced'}
                        Not priced
                      {:else if pp.needsManualPrice}
                        <Badge tone="accent">Needs a price</Badge> No cost to mark up
                      {:else}
                        {(it.quantity || 0) > 1 ? `${it.quantity} × ${formatUsd(pp.unitPriceCents)} = ` : ''}<span class="font-medium text-ink">{formatUsd(pp.priceCents)}</span>{#if pp.source === 'manual'}{pp.markupPercent !== null ? `, ${pp.markupPercent}%` : ''} (manual){:else}, {formatBps(pricing.markupBps ?? 0)} markup{/if}
                      {/if}
                    </div>
                  {:else if it.type === 'LABOR'}
                    <form method="post" action="?/set_item_price" class="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={it.id} />
                      <input name="price" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label={`Price for ${it.description || 'labor'}`} class="input input-sm w-24" value={amountOf(it.amountCents || 0)} />
                      <button class="btn btn-secondary btn-sm">Save</button>
                    </form>
                  {:else}
                    -
                  {/if}
                </td>
                <td>
                  <form method="post" action="?/delete_item" class="inline" onsubmit={(e) => { if (!confirm('Delete this item?')) { e.preventDefault(); } }}>
                    <input type="hidden" name="id" value={it.id} />
                    <button class="btn btn-danger btn-sm">Delete</button>
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
