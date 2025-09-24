<script lang="ts">
  type Device = {
    id: string;
    sku: string;
    make: string;
    model: string;
    serial?: string | null;
    source?: string | null;
    condition?: string | null;
    purchasePriceCents: number;
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
  let { data } = $props<{ data: { device: Device | null; summary?: Summary } }>();
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
        <li><strong>Purchase Price:</strong> ${(data.device.purchasePriceCents/100).toFixed(2)}</li>
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
{/if}
