<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SkuTag from '$lib/components/SkuTag.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatUsd, toneOf, toneClass } from '$lib/format';
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
  };
  type PartUsedRow = {
    id: string;
    quantity: number | null;
    unitCostCentsSnapshot: number | null;
    totalCostCents: number;
    part?: { name: string } | null;
    workOrder: { id: string; code: string };
  };
  let { data } = $props<{ data: { device: Device | null; summary?: Summary; expenses?: ExpenseRow[]; incomes?: IncomeRow[]; partsUsed?: PartUsedRow[] } }>();
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
