<script lang="ts">
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
    platformFeesCents: number;
    paymentFeesCents: number;
    shippingRevenueCents: number;
    shippingCostCents: number;
    taxCollectedCents: number;
  };
  let { data } = $props<{ data: { device: Device | null; summary?: Summary; expenses?: ExpenseRow[]; incomes?: IncomeRow[] } }>();
</script>

{#if !data.device}
  <p>Device not found.</p>
{:else}
  <h1 class="text-2xl font-semibold mb-2">{data.device.make} {data.device.model}</h1>
  <p class="text-sm mb-4">SKU: <strong>{data.device.sku}</strong></p>

  <div class="grid md:grid-cols-2 gap-4 mb-6">
    <div class="p-4 border rounded">
      <h2 class="font-semibold mb-2">Details</h2>
      <ul class="text-sm space-y-1">
        <li><strong>Serial/IMEI:</strong> {data.device.serial || '-'}</li>
        <li><strong>Source:</strong> {data.device.source || '-'}</li>
        <li><strong>Condition:</strong> {data.device.condition || '-'}</li>
        <li><strong>Status:</strong> {data.device.status}</li>
        <li><strong>Notes:</strong> {data.device.notes || '-'}</li>
      </ul>
    </div>
    <div class="p-4 border rounded">
      <h2 class="font-semibold mb-2">Summary</h2>
      {#if data.summary}
        <ul class="text-sm space-y-1">
          <li><strong>Total Income:</strong> ${(data.summary.income/100).toFixed(2)}</li>
          <li><strong>Total Expenses:</strong> ${(data.summary.expenses/100).toFixed(2)}</li>
          <li><strong>Fees:</strong> ${(data.summary.fees/100).toFixed(2)}</li>
          <li><strong>Shipping Net:</strong> ${(data.summary.shippingNet/100).toFixed(2)}</li>
          <li><strong>Tax Collected:</strong> ${(data.summary.taxCollected/100).toFixed(2)}</li>
          <li class="font-semibold"><strong>Net Profit:</strong> ${(data.summary.netProfitCents/100).toFixed(2)}</li>
        </ul>
      {/if}
    </div>
  </div>

  <div class="grid md:grid-cols-2 gap-4">
    <div class="p-4 border rounded overflow-auto">
      <h2 class="font-semibold mb-2">Expenses</h2>
      {#if data.expenses && data.expenses.length > 0}
        <table class="w-full text-sm border divide-y">
          <thead>
            <tr class="bg-zinc-50 dark:bg-zinc-800 text-left">
              <th class="p-2">Date</th>
              <th class="p-2">Category</th>
              <th class="p-2">Vendor</th>
              <th class="p-2">Payment</th>
              <th class="p-2">Amount</th>
              <th class="p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {#each data.expenses as e}
              <tr class="divide-x">
                <td class="p-2">{new Date(e.date).toLocaleDateString()}</td>
                <td class="p-2">{e.category?.name || '-'}</td>
                <td class="p-2">{e.vendor?.name || '-'}</td>
                <td class="p-2">{e.paymentMethod?.name || '-'}</td>
                <td class="p-2">${(e.amountCents/100).toFixed(2)}</td>
                <td class="p-2">{e.notes || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="text-sm text-zinc-500">No expenses linked to this device.</p>
      {/if}
    </div>
    <div class="p-4 border rounded overflow-auto">
      <h2 class="font-semibold mb-2">Income</h2>
      {#if data.incomes && data.incomes.length > 0}
        <table class="w-full text-sm border divide-y">
          <thead>
            <tr class="bg-zinc-50 dark:bg-zinc-800 text-left">
              <th class="p-2">Date</th>
              <th class="p-2">Channel</th>
              <th class="p-2">Category</th>
              <th class="p-2">Amount</th>
              <th class="p-2">Fees</th>
              <th class="p-2">Shipping Net</th>
              <th class="p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {#each data.incomes as inc}
              <tr class="divide-x">
                <td class="p-2">{new Date(inc.date).toLocaleDateString()}</td>
                <td class="p-2">{inc.channel?.name || '-'}</td>
                <td class="p-2">{inc.category?.name || '-'}</td>
                <td class="p-2">${(inc.amountCents/100).toFixed(2)}</td>
                <td class="p-2">${(((inc.platformFeesCents||0)+(inc.paymentFeesCents||0))/100).toFixed(2)}</td>
                <td class="p-2">${(((inc.shippingRevenueCents||0)-(inc.shippingCostCents||0))/100).toFixed(2)}</td>
                <td class="p-2">{inc.notes || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="text-sm text-zinc-500">No income linked to this device.</p>
      {/if}
    </div>
  </div>
{/if}
