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
  type CustomerRef = { id: string; name: string };
  type IncomeRow = {
    id: string;
    date: string | Date;
    type: 'SALE' | 'SERVICE' | 'DEPOSIT';
    amountCents: number;
    notes?: string | null;
    channel?: Channel | null;
    platformFeesCents: number;
    paymentFeesCents: number;
    shippingRevenueCents: number;
    shippingCostCents: number;
    taxCollectedCents: number;
    device?: DeviceRef | null;
    category?: Category | null;
    customer?: CustomerRef | null;
    workOrder?: WorkOrderRef | null;
  };
  type Filters = { from: string | null; to: string | null };
  let { data } = $props<{ data: { income: IncomeRow[]; channels: Channel[]; devices: DeviceRef[]; categories: Category[]; customers: CustomerRef[]; workOrders: WorkOrderRef[]; filters: Filters } }>();

  function todayLocal(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  let open = $state(false);
  let editingId = $state<string | null>(null);

  // Money inputs show a blank instead of 0.00 so an untouched fee stays visibly empty
  const usd = (cents: number) => (cents ? (cents / 100).toFixed(2) : '');
</script>

<PageHeader title="Income">
  {#snippet actions()}
    <button data-testid="income-toggle-form" class="btn btn-primary" onclick={() => (open = true)}>Add Income</button>
  {/snippet}
</PageHeader>

<DateRangeFilter from={data.filters.from} to={data.filters.to} clearHref="/income" />

{#if open}
  <Modal title="Add Income" size="lg" onclose={() => (open = false)}>
  <form id="income-form" method="post" action="?/create" class="grid gap-x-4 gap-y-3 md:grid-cols-3">
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
      <input id="amount" name="amount" type="number" step="0.01" class="input" required />
      <p class="hint">What was paid for the item or service, before fees and tax. Shipping and tax go in the fields below. Use a negative amount for a refund you paid out.</p>
    </div>
    <div>
      <label class="label" for="deviceId">Device</label>
      <select id="deviceId" name="deviceId" class="input">
        <option value="">-</option>
        {#each data.devices as d}
          <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
        {/each}
      </select>
      <p class="hint">Optional. The device this money is for. It counts toward that device’s net.</p>
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
      <p class="hint">Optional. The job this pays for. The work order holds the breakdown of what was sold; the first payment marks it invoiced.</p>
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
  </form>
  {#snippet footer()}
    <button type="button" class="btn btn-secondary" onclick={() => (open = false)}>Cancel</button>
    <button data-testid="income-save-income" form="income-form" class="btn btn-primary">Save Income</button>
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
      <th>Work Order</th>
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
          {#if r.workOrder}
            <a class="link" href={`/work-orders/${r.workOrder.id}`}>{r.workOrder.code}</a>
          {:else}
            -
          {/if}
        </td>
        <td>
          {#if r.device}
            <SkuTag code={r.device.sku} href={`/devices/${r.device.id}`} /> <span class="text-muted">{r.device.make} {r.device.model}</span>
          {:else}
            -
          {/if}
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
          <td colspan="9">
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
                <input id={`amount-${r.id}`} name="amount" type="number" step="0.01" class="input" value={(r.amountCents/100).toFixed(2)} />
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
                <input id={`platformFees-${r.id}`} name="platformFees" type="number" step="0.01" min="0" class="input" value={usd(r.platformFeesCents)} />
              </div>
              <div>
                <label class="label" for={`paymentFees-${r.id}`}>Payment Fees</label>
                <input id={`paymentFees-${r.id}`} name="paymentFees" type="number" step="0.01" min="0" class="input" value={usd(r.paymentFeesCents)} />
              </div>
              <div>
                <label class="label" for={`shippingRevenue-${r.id}`}>Shipping Revenue</label>
                <input id={`shippingRevenue-${r.id}`} name="shippingRevenue" type="number" step="0.01" min="0" class="input" value={usd(r.shippingRevenueCents)} />
              </div>
              <div>
                <label class="label" for={`shippingCost-${r.id}`}>Shipping Cost</label>
                <input id={`shippingCost-${r.id}`} name="shippingCost" type="number" step="0.01" min="0" class="input" value={usd(r.shippingCostCents)} />
              </div>
              <div>
                <label class="label" for={`taxCollected-${r.id}`}>Tax Collected</label>
                <input id={`taxCollected-${r.id}`} name="taxCollected" type="number" step="0.01" min="0" class="input" value={usd(r.taxCollectedCents)} />
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
      <tr><td colspan="9" class="empty-cell">No income{data.filters.from || data.filters.to ? ' in this date range' : ' yet'}.</td></tr>
    {/each}
  </tbody>
</table>
</div>
