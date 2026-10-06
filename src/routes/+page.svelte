<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import BalanceCard from '$lib/components/BalanceCard.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import Badge from '$lib/components/Badge.svelte';
  type Totals = {
    incomeGrossCents: number;
    moneyInNetCents: number;
    moneyOutCents: number;
    spendingPowerCents: number;
    taxesCollectedCents: number;
    feesCents: number;
    expensesCents: number;
    partsInventoryValueCents: number;
  };
  type Last30 = {
    moneyInNetCents: number;
    moneyOutCents: number;
    spendingPowerCents: number;
    taxesCollectedCents: number;
    feesCents: number;
    expensesCents: number;
    partsConsumedCents: number;
  };
  type DevicesCounts = { activeDevices: number; archivedDevices: number };
  type WorkOrderCounts = { open: number };
  let { data } = $props<{ data: { totals: Totals; last30: Last30; devices: DevicesCounts; workOrders: WorkOrderCounts } }>();


  // Quick date helpers for drill-down links
  const fmtDate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const today = new Date();
  const toStr = fmtDate(today);
  const from30 = new Date();
  from30.setDate(today.getDate() - 29); // include today = 30 days window
  const from30Str = fmtDate(from30);
</script>

<PageHeader title="Dashboard" />

<section class="mb-10">
  <BalanceCard
    label="Spending power"
    hint="Money in (net) minus money out, all time."
    balanceCents={data.totals.spendingPowerCents}
    inCents={data.totals.moneyInNetCents}
    outCents={data.totals.moneyOutCents}
    inHref="/income"
    outHref="/expenses"
    testidPrefix="dashboard"
  />
  <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
    <StatCard size="sm" label="Gross income" cents={data.totals.incomeGrossCents} hint="Before fees and shipping costs" />
    <StatCard size="sm" label="Fees (platform + payment)" cents={data.totals.feesCents} />
    <StatCard size="sm" label="Taxes collected" cents={data.totals.taxesCollectedCents} />
    <StatCard size="sm" label="Expenses" cents={data.totals.expensesCents} tone="loss" />
    <StatCard size="sm" label="Parts inventory value" cents={data.totals.partsInventoryValueCents} />
  </div>
</section>

<section class="mb-10">
  <h2 class="mb-3 text-xl font-semibold">Last 30 days</h2>
  <BalanceCard
    size="md"
    label="Spending power (30d)"
    balanceCents={data.last30.spendingPowerCents}
    inCents={data.last30.moneyInNetCents}
    outCents={data.last30.moneyOutCents}
    inHref={`/income?from=${from30Str}&to=${toStr}`}
    outHref={`/expenses?from=${from30Str}&to=${toStr}`}
  />
  <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard size="sm" label="Fees (30d)" cents={data.last30.feesCents} />
    <StatCard size="sm" label="Taxes collected (30d)" cents={data.last30.taxesCollectedCents} />
    <StatCard size="sm" label="Expenses (30d)" cents={data.last30.expensesCents} tone="loss" />
    <StatCard size="sm" label="Parts consumed (30d)" cents={data.last30.partsConsumedCents} />
  </div>
</section>

<section>
  <h2 class="mb-3 text-xl font-semibold">Inventory and work orders</h2>
  <div class="grid gap-4 sm:grid-cols-3">
    <StatCard label="Active devices" value={data.devices.activeDevices}>
      <Badge tone="gain">Active</Badge>
    </StatCard>
    <StatCard label="Archived devices" value={data.devices.archivedDevices}>
      <Badge>Archived</Badge>
    </StatCard>
    <StatCard label="Open work orders" value={data.workOrders.open}>
      <Badge tone="accent">Open</Badge>
    </StatCard>
  </div>
</section>
