<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SkuTag from '$lib/components/SkuTag.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatUsd, toneOf, toneClass, humanizeEnum } from '$lib/format';
  type Device = {
    id: string;
    sku: string;
    make: string;
    model: string;
    serial?: string | null;
    source?: string | null;
    condition?: string | null;
    status: string;
    notes?: string | null;
  };
  type Summary = {
    income: number;
    expenses: number;
    stockedExpenses: number;
    partsConsumed: number;
    harvested: number;
    unharvested: number;
    fees: number;
    shippingNet: number;
    taxCollected: number;
    netProfitCents: number;
  };
  type ExpenseRow = {
    id: string;
    date: string | Date;
    amountCents: number;
    notes?: string | null;
    receiptNotes?: string | null;
    stocked: boolean;
    category?: { name: string } | null;
    vendor?: { name: string } | null;
    paymentMethod?: { name: string } | null;
  };
  type IncomeRow = {
    id: string;
    date: string | Date;
    amountCents: number;
    notes?: string | null;
    category?: { name: string } | null;
    channel?: { name: string } | null;
    feesCents: number;
    shippingNetCents: number;
    workOrder?: { id: string; code: string } | null;
  };
  type WorkOrderRow = {
    id: string;
    role: string;
    includeDeviceCost: boolean;
    createdAt: string | Date;
    workOrder: { id: string; code: string; status: string; targetAction: string; customer?: { name: string } | null };
  };
  type PartUsedRow = {
    id: string;
    quantity: number | null;
    unitCostCentsSnapshot: number | null;
    totalCostCents: number;
    part?: { name: string } | null;
    workOrder: { id: string; code: string };
  };
  type HarvestRow = {
    id: string;
    createdAt: string | Date;
    quantity: number;
    unitCostCents: number;
    totalCostCents: number;
    part: { id: string; name: string };
  };
  let { data, form } = $props<{
    data: { device: Device | null; summary?: Summary; expenses?: ExpenseRow[]; incomes?: IncomeRow[]; partsUsed?: PartUsedRow[]; workOrders?: WorkOrderRow[]; harvested?: HarvestRow[]; parts?: { id: string; name: string }[] };
    form?: { error?: string } | null;
  }>();
  let harvestPartId = $state('');
</script>

{#if !data.device}
  <PageHeader title="Device not found" back={{ href: '/devices', label: 'Devices' }} />
{:else}
  <PageHeader title={`${data.device.make} ${data.device.model}`} back={{ href: '/devices', label: 'Devices' }}>
    {#snippet meta()}
      <SkuTag code={data.device.sku} />
      <StatusBadge status={data.device.status} />
    {/snippet}
  </PageHeader>

  <div class="grid md:grid-cols-2 gap-4 mb-6">
    <div class="card">
      <h2 class="card-title">Details</h2>
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">Serial/IMEI</dt><dd>{data.device.serial || '-'}</dd>
        <dt class="text-muted">Source</dt><dd>{data.device.source || '-'}</dd>
        <dt class="text-muted">Condition</dt><dd>{data.device.condition || '-'}</dd>
        <dt class="text-muted">Notes</dt><dd>{data.device.notes || '-'}</dd>
      </dl>
    </div>
    <div class="card">
      <h2 class="card-title">Summary</h2>
      {#if data.summary}
        <dl class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 text-sm tabular-nums">
          <dt class="text-muted">Total Income</dt><dd class="text-right">{formatUsd(data.summary.income)}</dd>
          <dt class="text-muted">Total Expenses</dt><dd class="text-right">{formatUsd(data.summary.expenses)}</dd>
          {#if data.summary.harvested > 0}
            <dt class="text-muted">Harvested to Parts Stock</dt><dd class="text-right">{formatUsd(-data.summary.harvested)}</dd>
          {/if}
          <dt class="text-muted">Parts Used</dt><dd class="text-right">{formatUsd(data.summary.partsConsumed)}</dd>
          <dt class="text-muted">Fees</dt><dd class="text-right">{formatUsd(data.summary.fees)}</dd>
          <dt class="text-muted">Shipping Net</dt><dd class="text-right">{formatUsd(data.summary.shippingNet)}</dd>
          <dt class="text-muted">Tax Collected</dt><dd class="text-right">{formatUsd(data.summary.taxCollected)}</dd>
          <dt class="mt-1 border-t border-line pt-3 font-medium">Net Profit</dt>
          <dd class="figure mt-1 border-t border-line pt-2 text-right text-xl {toneClass[toneOf(data.summary.netProfitCents)]}">{formatUsd(data.summary.netProfitCents)}</dd>
        </dl>
        {#if data.summary.stockedExpenses > 0}
          <p class="hint mt-3">{formatUsd(data.summary.stockedExpenses)} of linked expenses went into parts stock. They are left out of Total Expenses and counted under Parts Used when the parts are used on a work order.</p>
        {/if}
        {#if data.summary.harvested > 0}
          <p class="hint mt-3">Cost harvested into parts stock no longer counts against this device. It is charged to the work order each part is used on.</p>
        {/if}
      {/if}
    </div>
  </div>

  <div class="grid xl:grid-cols-2 gap-4">
    <div class="card min-w-0">
      <h2 class="card-title">Expenses</h2>
      {#if data.expenses && data.expenses.length > 0}
        <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Vendor</th>
              <th>Payment</th>
              <th>Amount</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {#each data.expenses as e}
              <tr>
                <td>{new Date(e.date).toLocaleDateString()}</td>
                <td>{e.category?.name || '-'}</td>
                <td>{e.vendor?.name || '-'}</td>
                <td>{e.paymentMethod?.name || '-'}</td>
                <td>{formatUsd(e.amountCents)}{#if e.stocked} <span class="text-xs text-muted" title="Received into parts stock; charged when used">(stock)</span>{/if}</td>
                <td>{e.notes || e.receiptNotes || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        </div>
      {:else}
        <p class="text-sm text-muted">No expenses linked to this device.</p>
      {/if}
    </div>
    <div class="card min-w-0">
      <h2 class="card-title">Income</h2>
      {#if data.incomes && data.incomes.length > 0}
        <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Channel</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Fees</th>
              <th>Shipping Net</th>
              <th>Work Order</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {#each data.incomes as inc}
              <tr>
                <td>{new Date(inc.date).toLocaleDateString()}</td>
                <td>{inc.channel?.name || '-'}</td>
                <td>{inc.category?.name || '-'}</td>
                <td>{formatUsd(inc.amountCents)}</td>
                <td>{formatUsd(inc.feesCents)}</td>
                <td>{formatUsd(inc.shippingNetCents)}</td>
                <td>{#if inc.workOrder}<SkuTag code={inc.workOrder.code} href={`/work-orders/${inc.workOrder.id}`} />{:else}-{/if}</td>
                <td>{inc.notes || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        </div>
      {:else}
        <p class="text-sm text-muted">No income linked to this device.</p>
      {/if}
    </div>
    <div class="card min-w-0 xl:col-span-2">
      <h2 class="card-title">Work Orders</h2>
      {#if data.workOrders && data.workOrders.length > 0}
        <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Work Order</th>
              <th>Added</th>
              <th>Status</th>
              <th>Target</th>
              <th>Customer</th>
              <th>Role</th>
              <th>Device cost</th>
            </tr>
          </thead>
          <tbody>
            {#each data.workOrders as wo}
              <tr>
                <td><SkuTag code={wo.workOrder.code} href={`/work-orders/${wo.workOrder.id}`} /></td>
                <td>{new Date(wo.createdAt).toLocaleDateString()}</td>
                <td><StatusBadge status={wo.workOrder.status} /></td>
                <td>{humanizeEnum(wo.workOrder.targetAction)}</td>
                <td>{wo.workOrder.customer?.name || '-'}</td>
                <td><StatusBadge status={wo.role} /></td>
                <td>{#if wo.includeDeviceCost}Counted here{:else}<span class="text-muted">Not counted</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        </div>
      {:else}
        <p class="text-sm text-muted">This device is not on any work order.</p>
      {/if}
    </div>
    {#if data.device.status === 'DONOR' || (data.harvested && data.harvested.length > 0)}
      <div class="card min-w-0 xl:col-span-2 space-y-4">
        <h2 class="card-title">Harvested Parts</h2>
        <p class="hint">Parts pulled from this donor go into parts stock at the value you give them, and that much of the donor's cost moves with them. Each work order that uses one is charged for it.{#if data.summary} {formatUsd(data.summary.unharvested)} of this device's cost is still on the device.{/if}</p>
        {#if form?.error}
          <div class="alert-error" role="alert">{form.error}</div>
        {/if}
        {#if data.device.status === 'DONOR'}
          <form method="post" action="?/harvest_part" class="grid gap-3 md:grid-cols-12 items-end">
            <div class="col-span-12 md:col-span-4">
              <label class="label" for="harvest-part">Part</label>
              <select id="harvest-part" name="partId" class="input input-sm" bind:value={harvestPartId}>
                <option value="">- New part -</option>
                {#each data.parts || [] as p}
                  <option value={p.id}>{p.name}</option>
                {/each}
              </select>
            </div>
            {#if !harvestPartId}
              <div class="col-span-12 md:col-span-3">
                <label class="label" for="harvest-new-part">New part name</label>
                <input id="harvest-new-part" name="newPartName" class="input input-sm" required />
              </div>
            {/if}
            <div class="col-span-6 md:col-span-1">
              <label class="label" for="harvest-qty">Qty</label>
              <input id="harvest-qty" name="quantity" type="number" step="1" min="1" value="1" class="input input-sm" required />
            </div>
            <div class="col-span-6 md:col-span-2">
              <label class="label" for="harvest-cost">Value each (USD)</label>
              <input id="harvest-cost" name="unitCost" type="number" step="0.01" min="0" placeholder="0.00" class="input input-sm" required />
            </div>
            <div class="col-span-12 md:col-span-2 flex md:justify-end"><button class="btn btn-secondary w-full md:w-auto">Add to Stock</button></div>
          </form>
        {/if}
        {#if data.harvested && data.harvested.length > 0}
          <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Part</th>
                <th>Qty</th>
                <th>Value Each</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each data.harvested as h}
                <tr>
                  <td>{new Date(h.createdAt).toLocaleDateString()}</td>
                  <td>{h.part.name}</td>
                  <td>{h.quantity}</td>
                  <td>{formatUsd(h.unitCostCents)}</td>
                  <td>{formatUsd(h.totalCostCents)}</td>
                  <td>
                    <form method="post" action="?/undo_harvest" class="inline" onsubmit={(e) => { if (!confirm('Take these parts back out of stock?')) { e.preventDefault(); } }}>
                      <input type="hidden" name="id" value={h.id} />
                      <button class="btn btn-danger btn-sm">Undo</button>
                    </form>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          </div>
        {:else}
          <p class="text-sm text-muted">No parts harvested from this device yet.</p>
        {/if}
      </div>
    {/if}
    <div class="card min-w-0 xl:col-span-2">
      <h2 class="card-title">Parts Used</h2>
      {#if data.partsUsed && data.partsUsed.length > 0}
        <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Work Order</th>
              <th>Part</th>
              <th>Qty</th>
              <th>Unit Cost</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {#each data.partsUsed as p}
              <tr>
                <td><SkuTag code={p.workOrder.code} href={`/work-orders/${p.workOrder.id}`} /></td>
                <td>{p.part?.name || '-'}</td>
                <td>{p.quantity || 0}</td>
                <td>{formatUsd(p.unitCostCentsSnapshot || 0)}</td>
                <td>{formatUsd(p.totalCostCents)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        </div>
      {:else}
        <p class="text-sm text-muted">No parts used on work orders for this device.</p>
      {/if}
    </div>
  </div>
{/if}
