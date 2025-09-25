<script lang="ts">
  type Totals = {
    moneyInNetCents: number;
    moneyOutCents: number;
    spendingPowerCents: number;
    taxesCollectedCents: number;
    feesCents: number;
    expensesCents: number;
    devicePurchasesCents: number;
  };
  type Last30 = {
    moneyInNetCents: number;
    moneyOutCents: number;
    spendingPowerCents: number;
    taxesCollectedCents: number;
    feesCents: number;
    expensesCents: number;
    devicePurchasesCents: number;
  };
  type DevicesCounts = { activeDevices: number; archivedDevices: number };
  let { data } = $props<{ data: { totals: Totals; last30: Last30; devices: DevicesCounts } }>();

  const fmtUSD = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
      (cents || 0) / 100
    );
  const signClass = (cents: number) => (cents >= 0 ? 'text-green-600' : 'text-red-600');
</script>

<h1 class="text-3xl font-bold mb-6">Dashboard</h1>

<section class="grid gap-4 md:grid-cols-3 mb-6">
  <div class="border rounded p-4 bg-white dark:bg-zinc-900">
    <h2 class="text-zinc-500 text-sm mb-1">Spending Power</h2>
    <div class={`text-3xl font-extrabold ${signClass(data.totals.spendingPowerCents)}`}>{fmtUSD(data.totals.spendingPowerCents)}</div>
    <p class="text-xs text-zinc-500 mt-2">Money In (Net) - Money Out</p>
  </div>
  <div class="border rounded p-4 bg-white dark:bg-zinc-900">
    <h2 class="text-zinc-500 text-sm mb-1">Money In (Net)</h2>
    <div class="text-3xl font-extrabold text-green-600">{fmtUSD(data.totals.moneyInNetCents)}</div>
    <p class="text-xs text-zinc-500 mt-2">Sales/Service - fees - shipping costs + shipping revenue</p>
  </div>
  <div class="border rounded p-4 bg-white dark:bg-zinc-900">
    <h2 class="text-zinc-500 text-sm mb-1">Money Out</h2>
    <div class="text-3xl font-extrabold text-red-600">{fmtUSD(data.totals.moneyOutCents)}</div>
    <p class="text-xs text-zinc-500 mt-2">Expenses + Device purchases</p>
  </div>
</section>

<section class="grid gap-4 md:grid-cols-4 mb-8">
  <div class="border rounded p-4 bg-white dark:bg-zinc-900">
    <h3 class="text-zinc-500 text-sm mb-1">Fees (platform + payment)</h3>
    <div class="text-2xl font-bold">{fmtUSD(data.totals.feesCents)}</div>
  </div>
  <div class="border rounded p-4 bg-white dark:bg-zinc-900">
    <h3 class="text-zinc-500 text-sm mb-1">Taxes Collected</h3>
    <div class="text-2xl font-bold">{fmtUSD(data.totals.taxesCollectedCents)}</div>
  </div>
  <div class="border rounded p-4 bg-white dark:bg-zinc-900">
    <h3 class="text-zinc-500 text-sm mb-1">Expenses</h3>
    <div class="text-2xl font-bold text-red-600">{fmtUSD(data.totals.expensesCents)}</div>
  </div>
  <div class="border rounded p-4 bg-white dark:bg-zinc-900">
    <h3 class="text-zinc-500 text-sm mb-1">Device Purchases</h3>
    <div class="text-2xl font-bold text-red-600">{fmtUSD(data.totals.devicePurchasesCents)}</div>
  </div>
</section>

<section class="mb-8">
  <h2 class="text-xl font-semibold mb-3">Last 30 days</h2>
  <div class="grid gap-4 md:grid-cols-3 mb-4">
    <div class="border rounded p-4 bg-white dark:bg-zinc-900">
      <h3 class="text-zinc-500 text-sm mb-1">Spending Power (30d)</h3>
      <div class={`text-2xl font-extrabold ${signClass(data.last30.spendingPowerCents)}`}>{fmtUSD(data.last30.spendingPowerCents)}</div>
    </div>
    <div class="border rounded p-4 bg-white dark:bg-zinc-900">
      <h3 class="text-zinc-500 text-sm mb-1">Money In (Net, 30d)</h3>
      <div class="text-2xl font-extrabold text-green-600">{fmtUSD(data.last30.moneyInNetCents)}</div>
    </div>
    <div class="border rounded p-4 bg-white dark:bg-zinc-900">
      <h3 class="text-zinc-500 text-sm mb-1">Money Out (30d)</h3>
      <div class="text-2xl font-extrabold text-red-600">{fmtUSD(data.last30.moneyOutCents)}</div>
    </div>
  </div>
  <div class="grid gap-4 md:grid-cols-4">
    <div class="border rounded p-4 bg-white dark:bg-zinc-900">
      <h3 class="text-zinc-500 text-sm mb-1">Fees (30d)</h3>
      <div class="text-xl font-bold">{fmtUSD(data.last30.feesCents)}</div>
    </div>
    <div class="border rounded p-4 bg-white dark:bg-zinc-900">
      <h3 class="text-zinc-500 text-sm mb-1">Taxes Collected (30d)</h3>
      <div class="text-xl font-bold">{fmtUSD(data.last30.taxesCollectedCents)}</div>
    </div>
    <div class="border rounded p-4 bg-white dark:bg-zinc-900">
      <h3 class="text-zinc-500 text-sm mb-1">Expenses (30d)</h3>
      <div class="text-xl font-bold text-red-600">{fmtUSD(data.last30.expensesCents)}</div>
    </div>
    <div class="border rounded p-4 bg-white dark:bg-zinc-900">
      <h3 class="text-zinc-500 text-sm mb-1">Device Purchases (30d)</h3>
      <div class="text-xl font-bold text-red-600">{fmtUSD(data.last30.devicePurchasesCents)}</div>
    </div>
  </div>
</section>

<section>
  <h2 class="text-xl font-semibold mb-3">Inventory</h2>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="border rounded p-4 bg-white dark:bg-zinc-900 flex items-center justify-between">
      <div>
        <h3 class="text-zinc-500 text-sm">Active Devices</h3>
        <div class="text-3xl font-extrabold">{data.devices.activeDevices}</div>
      </div>
      <span class="inline-flex items-center justify-center px-3 py-1 rounded bg-green-600 text-white text-sm">Active</span>
    </div>
    <div class="border rounded p-4 bg-white dark:bg-zinc-900 flex items-center justify-between">
      <div>
        <h3 class="text-zinc-500 text-sm">Archived Devices</h3>
        <div class="text-3xl font-extrabold">{data.devices.archivedDevices}</div>
      </div>
      <span class="inline-flex items-center justify-center px-3 py-1 rounded bg-zinc-600 text-white text-sm">Archived</span>
    </div>
  </div>
</section>
