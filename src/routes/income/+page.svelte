<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import DateRangeFilter from '$lib/components/DateRangeFilter.svelte';
  import SkuTag from '$lib/components/SkuTag.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatUsd } from '$lib/format';
  import Icon from '$lib/components/Icon.svelte';
  type DeviceRef = { id: string; sku: string; make: string; model: string };
  type Channel = { id: string; name: string };
  type Category = { id: string; name: string };
  type WorkOrderRef = { id: string; code: string };
  type PartRef = { id: string; name: string };
  type CustomerRef = { id: string; name: string };
  type IncomeRow = {
    id: string;
    date: string | Date;
    type: 'SALE' | 'SERVICE' | 'DEPOSIT';
    amountCents: number;
    notes?: string | null;
    channel?: Channel | null;
    device?: DeviceRef | null;
    lineDevices: DeviceRef[];
    category?: Category | null;
    customer?: CustomerRef | null;
    workOrder?: WorkOrderRef | null;
  };
  type Filters = { from: string | null; to: string | null };
  let { data } = $props<{ data: { income: IncomeRow[]; channels: Channel[]; devices: DeviceRef[]; categories: Category[]; customers: CustomerRef[]; workOrders: WorkOrderRef[]; parts: PartRef[]; filters: Filters } }>();

  function todayLocal(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  let open = $state(false);
  let editingId = $state<string | null>(null);

  // Stage C: Income Builder modal state
  let builderOpen = $state(false);
  type BuilderLine = {
    type: 'DEVICE' | 'PART' | 'LABOR' | 'OTHER';
    amountCents: number;
    description?: string;
    deviceId?: string | null;
    partId?: string | null;
    quantity?: number | null;
    workOrderId?: string | null;
  };
  let builderDate = $state<string>(todayLocal());
  let builderType = $state<'SALE' | 'SERVICE' | 'DEPOSIT'>('SALE');
  let builderChannelId = $state<string | null>(null);
  let builderCategoryId = $state<string | null>(null);
  let builderCustomerId = $state<string | null>(null);
  let builderWorkOrderId = $state<string | null>(null);
  let builderNotes = $state<string>('');
  let builderPlatformFeesCents = $state<number>(0);
  let builderPaymentFeesCents = $state<number>(0);
  let builderShippingRevenueCents = $state<number>(0);
  let builderShippingCostCents = $state<number>(0);
  let builderTaxCollectedCents = $state<number>(0);
  let builderLines = $state<BuilderLine[]>([]);

  // builderDate is initialized above

  function usdToCents(v: string): number { const n = parseFloat(v); return Math.round((n || 0) * 100); }
  function usdNumToCents(n: number): number { return Math.round((n || 0) * 100); }
  function centsToUsd(n: number): string { return ((n || 0) / 100).toFixed(2); }
  function addBuilderLine() {
    builderLines = [...builderLines, { type: 'OTHER', amountCents: 0, description: '' }];
  }
  function removeBuilderLine(idx: number) {
    builderLines = builderLines.filter((_, i) => i !== idx);
  }
  function builderTotalCents(): number {
    return builderLines.reduce((s, l) => s + Math.floor(l.amountCents || 0), 0);
  }
  async function submitBuilder() {
    const payload = {
      date: builderDate,
      type: builderType,
      channelId: builderChannelId || null,
      categoryId: builderCategoryId || null,
      customerId: builderCustomerId || null,
      workOrderId: builderWorkOrderId || null,
      notes: builderNotes || null,
      platformFeesCents: usdNumToCents(builderPlatformFeesCents),
      paymentFeesCents: usdNumToCents(builderPaymentFeesCents),
      shippingRevenueCents: usdNumToCents(builderShippingRevenueCents),
      shippingCostCents: usdNumToCents(builderShippingCostCents),
      taxCollectedCents: usdNumToCents(builderTaxCollectedCents),
      lines: builderLines
    };
    const res = await fetch('/income/create-lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) {
      alert(j.error || 'Failed to save income with lines');
      return;
    }
    builderOpen = false;
    location.reload();
  }
</script>

<PageHeader title="Income">
  {#snippet actions()}
    <button data-testid="income-open-sale-builder" class="btn btn-secondary" title="Record one sale made of several devices, parts or labor lines" onclick={() => { builderOpen = true; if (builderLines.length === 0) addBuilderLine(); }}>
      Sale Builder
    </button>
    <button data-testid="income-toggle-form" class="btn {open ? 'btn-secondary' : 'btn-primary'}" onclick={() => (open = !open)}>
      {open ? 'Close' : 'Add Income'}
    </button>
  {/snippet}
</PageHeader>

<DateRangeFilter from={data.filters.from} to={data.filters.to} clearHref="/income" />

{#if open}
  <form method="post" action="?/create" class="form-panel md:grid-cols-3">
    <div>
      <label class="label" for="date">Date</label>
      <input id="date" name="date" type="date" class="input" value={todayLocal()} />
    </div>
    <div>
      <label class="label" for="type">Type</label>
      <select id="type" name="type" class="input">
        <option value="SALE">Sale</option>
        <option value="SERVICE">Service</option>
        <option value="DEPOSIT">Deposit</option>
      </select>
      <p class="hint">Select the kind of income. Use Sale for product/device sales, Service for repair services, and Deposit for miscellaneous income.</p>
    </div>
    <div>
      <label class="label" for="amount">Amount (USD)</label>
      <input id="amount" name="amount" type="number" step="0.01" min="0" class="input" required />
      <p class="hint">Item or service price before fees and tax. Do not include shipping or tax here — use the fields below.</p>
    </div>
    <div>
      <label class="label" for="deviceId">Device</label>
      <select id="deviceId" name="deviceId" class="input">
        <option value="">-</option>
        {#each data.devices as d}
          <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
        {/each}
      </select>
      <p class="hint">Optional. Attach the income to a device so it’s reflected in that device’s profit summary.</p>
    </div>
    <div>
      <label class="label" for="categoryId">Category</label>
      <select id="categoryId" name="categoryId" class="input">
        <option value="">-</option>
        {#each data.categories as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <p class="hint">Optional. Tag the income with a category for reporting.</p>
    </div>
    <div>
      <label class="label" for="channelId">Channel</label>
      <select id="channelId" name="channelId" class="input">
        <option value="">-</option>
        {#each data.channels as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <p class="hint">Where the sale happened (e.g., eBay, Facebook Marketplace, in-person).</p>
    </div>
    <div>
      <label class="label" for="customerId">Customer</label>
      <select id="customerId" name="customerId" class="input">
        <option value="">-</option>
        {#each data.customers as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <p class="hint">Optional. Select the customer for this income.</p>
    </div>
    <div>
      <label class="label" for="workOrderId">Work Order</label>
      <select id="workOrderId" name="workOrderId" class="input">
        <option value="">-</option>
        {#each data.workOrders as w}
          <option value={w.id}>{w.code}</option>
        {/each}
      </select>
      <p class="hint">Optional. Link this income to a work order.</p>
    </div>
    <div>
      <label class="label" for="platformFees">Platform Fees (USD)</label>
      <input id="platformFees" name="platformFees" type="number" step="0.01" min="0" class="input" />
      <p class="hint">Marketplace fees (e.g., eBay/Shopify) taken from the sale.</p>
    </div>
    <div>
      <label class="label" for="paymentFees">Payment Fees (USD)</label>
      <input id="paymentFees" name="paymentFees" type="number" step="0.01" min="0" class="input" />
      <p class="hint">Processor fees (e.g., PayPal, Stripe) for the transaction.</p>
    </div>
    <div>
      <label class="label" for="shippingRevenue">Shipping Revenue (USD)</label>
      <input id="shippingRevenue" name="shippingRevenue" type="number" step="0.01" min="0" class="input" />
      <p class="hint">Amount you collected from the buyer for shipping.</p>
    </div>
    <div>
      <label class="label" for="shippingCost">Shipping Cost (USD)</label>
      <input id="shippingCost" name="shippingCost" type="number" step="0.01" min="0" class="input" />
      <p class="hint">Your actual shipping label cost.</p>
    </div>
    <div>
      <label class="label" for="taxCollected">Tax Collected (USD)</label>
      <input id="taxCollected" name="taxCollected" type="number" step="0.01" min="0" class="input" />
      <p class="hint">Sales tax collected (not included in profit).</p>
    </div>
    <div class="md:col-span-3">
      <label class="label" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="input"></textarea>
    </div>
    <div class="md:col-span-3">
      <button data-testid="income-save-income" class="btn btn-primary">Save Income</button>
    </div>
  </form>
{/if}

{#if builderOpen}
  <Modal title="Sale Builder" size="xl" onclose={() => (builderOpen = false)}>
      <div class="grid gap-x-4 gap-y-3 md:grid-cols-4">
        <div>
          <label class="label" for="bld-date">Date</label>
          <input id="bld-date" type="date" class="input" bind:value={builderDate} />
        </div>
        <div>
          <label class="label" for="bld-type">Type</label>
          <select id="bld-type" class="input" bind:value={builderType}>
            <option value="SALE">Sale</option>
            <option value="SERVICE">Service</option>
            <option value="DEPOSIT">Deposit</option>
          </select>
        </div>
        <div>
          <label class="label" for="bld-channel">Channel</label>
          <select id="bld-channel" class="input" bind:value={builderChannelId}>
            <option value={null}>-</option>
            {#each data.channels as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label" for="bld-category">Category</label>
          <select id="bld-category" class="input" bind:value={builderCategoryId}>
            <option value={null}>-</option>
            {#each data.categories as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label" for="bld-customer">Customer</label>
          <select id="bld-customer" class="input" bind:value={builderCustomerId}>
            <option value={null}>-</option>
            {#each data.customers as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label" for="bld-wo">Work Order</label>
          <select id="bld-wo" class="input" bind:value={builderWorkOrderId}>
            <option value={null}>-</option>
            {#each data.workOrders as w}
              <option value={w.id}>{w.code}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label" for="bld-platform">Platform Fees (USD)</label>
          <input id="bld-platform" type="number" step="0.01" min="0" class="input" bind:value={builderPlatformFeesCents} />
        </div>
        <div>
          <label class="label" for="bld-payment">Payment Fees (USD)</label>
          <input id="bld-payment" type="number" step="0.01" min="0" class="input" bind:value={builderPaymentFeesCents} />
        </div>
        <div>
          <label class="label" for="bld-ship-rev">Shipping Revenue (USD)</label>
          <input id="bld-ship-rev" type="number" step="0.01" min="0" class="input" bind:value={builderShippingRevenueCents} />
        </div>
        <div>
          <label class="label" for="bld-ship-cost">Shipping Cost (USD)</label>
          <input id="bld-ship-cost" type="number" step="0.01" min="0" class="input" bind:value={builderShippingCostCents} />
        </div>
        <div>
          <label class="label" for="bld-tax">Tax Collected (USD)</label>
          <input id="bld-tax" type="number" step="0.01" min="0" class="input" bind:value={builderTaxCollectedCents} />
        </div>
        <div class="md:col-span-2">
          <label class="label" for="bld-notes">Notes</label>
          <input id="bld-notes" class="input" bind:value={builderNotes} />
        </div>
        <div class="md:col-span-2 flex items-end">
          <div class="total-box">
            <div class="text-xs text-muted">Lines Total</div>
            <div class="figure text-xl">${centsToUsd(builderTotalCents())}</div>
          </div>
        </div>
      </div>
      <div class="mt-6">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-lg font-semibold">Lines</h3>
          <button class="btn btn-secondary btn-sm" onclick={() => addBuilderLine()}>Add Line</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Device</th>
                <th>Part</th>
                <th>Qty</th>
                <th>Description</th>
                <th>Amount (USD)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each builderLines as ln, i}
                <tr>
                  <td>
                    <select class="input input-sm" bind:value={ln.type}>
                      <option value="DEVICE">Device</option>
                      <option value="PART">Part</option>
                      <option value="LABOR">Labor</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </td>
                  <td>
                    <select class="input input-sm" bind:value={ln.deviceId} disabled={ln.type !== 'DEVICE'}>
                      <option value={null}>-</option>
                      {#each data.devices as d}
                        <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
                      {/each}
                    </select>
                  </td>
                  <td>
                    <select class="input input-sm" bind:value={ln.partId} disabled={ln.type !== 'PART'}>
                      <option value={null}>-</option>
                      {#each data.parts as p}
                        <option value={p.id}>{p.name}</option>
                      {/each}
                    </select>
                  </td>
                  <td>
                    <input class="input input-sm" type="number" min="0" step="1" bind:value={ln.quantity} disabled={ln.type !== 'PART'} />
                  </td>
                  <td><input class="input input-sm" bind:value={ln.description} /></td>
                  <td><input class="input input-sm" value={centsToUsd(ln.amountCents)} onchange={(e) => { ln.amountCents = usdToCents((e.target as HTMLInputElement).value); builderLines = [...builderLines]; }} /></td>
                  <td><button class="btn btn-danger btn-sm" onclick={() => removeBuilderLine(i)}>Remove</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
      {#snippet footer()}
        <button data-testid="income-save-sale-builder" class="btn btn-primary" onclick={submitBuilder}>Save Income</button>
      {/snippet}
  </Modal>
{/if}

<div class="table-wrap">
<table class="data-table">
  <thead>
    <tr>
      <th>Date</th>
      <th>Type</th>
      <th>Amount</th>
      <th>Device</th>
      <th>Category</th>
      <th>Channel</th>
      <th>Notes</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.income as r}
      <tr>
        <td>{new Date(r.date).toLocaleDateString()}</td>
        <td><StatusBadge status={r.type} /></td>
        <td>{formatUsd(r.amountCents)}</td>
        <td>
          {#each (r.lineDevices.length > 0 ? r.lineDevices : r.device ? [r.device] : []) as d}
            <div><SkuTag code={d.sku} href={`/devices/${d.id}`} /> <span class="text-muted">{d.make} {d.model}</span></div>
          {:else}
            -
          {/each}
        </td>
        <td>{r.category?.name || '-'}</td>
        <td>{r.channel?.name || '-'}</td>
        <td>{r.notes || '-'}</td>
        <td>
          <div class="flex items-center gap-2">
            <button class="icon-btn" title="Edit" aria-label="Edit" onclick={() => (editingId = editingId === r.id ? null : r.id)}>
              <Icon name="edit" />
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(ev) => { if (!confirm('Archive this income entry? You can restore it later via the database.')) { ev.preventDefault(); } }}>
              <input type="hidden" name="id" value={r.id} />
              <button class="icon-btn icon-btn-danger" title="Archive" aria-label="Archive">
                <Icon name="archive" />
              </button>
            </form>
          </div>
        </td>
      </tr>
      {#if editingId === r.id}
        <tr class="edit-row">
          <td colspan="8">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={r.id} />
              <div>
                <label class="label" for={`date-${r.id}`}>Date</label>
                <input id={`date-${r.id}`} name="date" type="date" class="input" value={new Date(r.date).toISOString().slice(0,10)} />
              </div>
              <div>
                <label class="label" for={`type-${r.id}`}>Type</label>
                <select id={`type-${r.id}`} name="type" class="input">
                  <option value="SALE" selected={r.type === 'SALE'}>Sale</option>
                  <option value="SERVICE" selected={r.type === 'SERVICE'}>Service</option>
                  <option value="DEPOSIT" selected={r.type === 'DEPOSIT'}>Deposit</option>
                </select>
              </div>
              <div>
                <label class="label" for={`amount-${r.id}`}>Amount (USD)</label>
                <input id={`amount-${r.id}`} name="amount" type="number" step="0.01" min="0" class="input" value={(r.amountCents/100).toFixed(2)} />
              </div>
              <div>
                <label class="label" for={`deviceId-${r.id}`}>Device</label>
                <select id={`deviceId-${r.id}`} name="deviceId" class="input">
                  <option value="" selected={!r.device}>-</option>
                  {#each data.devices as d}
                    <option value={d.id} selected={r.device?.id === d.id}>{d.sku} — {d.make} {d.model}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="label" for={`categoryId-${r.id}`}>Category</label>
                <select id={`categoryId-${r.id}`} name="categoryId" class="input">
                  <option value="" selected={!r.category}>-</option>
                  {#each data.categories as c}
                    <option value={c.id} selected={r.category?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="label" for={`channelId-${r.id}`}>Channel</label>
                <select id={`channelId-${r.id}`} name="channelId" class="input">
                  <option value="" selected={!r.channel}>-</option>
                  {#each data.channels as c}
                    <option value={c.id} selected={r.channel?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="label" for={`customerId-${r.id}`}>Customer</label>
                <select id={`customerId-${r.id}`} name="customerId" class="input">
                  <option value="" selected={!r.customer}>-</option>
                  {#each data.customers as c}
                    <option value={c.id} selected={r.customer?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="label" for={`workOrderId-${r.id}`}>Work Order</label>
                <select id={`workOrderId-${r.id}`} name="workOrderId" class="input">
                  <option value="" selected={!r.workOrder}>-</option>
                  {#each data.workOrders as w}
                    <option value={w.id} selected={r.workOrder?.id === w.id}>{w.code}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="label" for={`platformFees-${r.id}`}>Platform Fees</label>
                <input id={`platformFees-${r.id}`} name="platformFees" type="number" step="0.01" min="0" class="input" />
              </div>
              <div>
                <label class="label" for={`paymentFees-${r.id}`}>Payment Fees</label>
                <input id={`paymentFees-${r.id}`} name="paymentFees" type="number" step="0.01" min="0" class="input" />
              </div>
              <div>
                <label class="label" for={`shippingRevenue-${r.id}`}>Shipping Revenue</label>
                <input id={`shippingRevenue-${r.id}`} name="shippingRevenue" type="number" step="0.01" min="0" class="input" />
              </div>
              <div>
                <label class="label" for={`shippingCost-${r.id}`}>Shipping Cost</label>
                <input id={`shippingCost-${r.id}`} name="shippingCost" type="number" step="0.01" min="0" class="input" />
              </div>
              <div>
                <label class="label" for={`taxCollected-${r.id}`}>Tax Collected</label>
                <input id={`taxCollected-${r.id}`} name="taxCollected" type="number" step="0.01" min="0" class="input" />
              </div>
              <div class="md:col-span-3">
                <label class="label" for={`notes-${r.id}`}>Notes</label>
                <textarea id={`notes-${r.id}`} name="notes" class="input">{r.notes || ''}</textarea>
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
      <tr><td colspan="8" class="empty-cell">No income{data.filters.from || data.filters.to ? ' in this date range' : ' yet'}.</td></tr>
    {/each}
  </tbody>
</table>
</div>
