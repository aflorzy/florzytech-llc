<script lang="ts">
  type DeviceRef = { id: string; sku: string; make: string; model: string };
  type Channel = { id: string; name: string };
  type IncomeRow = {
    id: string;
    date: string | Date;
    type: 'SALE' | 'SERVICE' | 'DEPOSIT';
    amountCents: number;
    notes?: string | null;
    channel?: Channel | null;
    device?: DeviceRef | null;
  };
  let { data } = $props<{ data: { income: IncomeRow[]; channels: Channel[]; devices: DeviceRef[] } }>();

  function todayLocal(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  let open = $state(false);
  let editingId = $state<string | null>(null);
</script>

<h1 class="text-2xl font-semibold mb-4">Income</h1>

<button class="mb-4 px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (open = !open)}>
  {open ? 'Close' : 'Add Income'}
</button>

{#if open}
  <form method="post" action="?/create" class="grid gap-3 md:grid-cols-3 p-4 border rounded mb-6">
    <div>
      <label class="block text-sm" for="date">Date</label>
      <input id="date" name="date" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={todayLocal()} />
    </div>
    <div>
      <label class="block text-sm" for="type">Type</label>
      <select id="type" name="type" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="SALE">Sale</option>
        <option value="SERVICE">Service</option>
        <option value="DEPOSIT">Deposit</option>
      </select>
      <p class="text-xs text-zinc-500 mt-1">Select the kind of income. Use Sale for product/device sales, Service for repair services, and Deposit for miscellaneous income.</p>
    </div>
    <div>
      <label class="block text-sm" for="amount">Amount (USD)</label>
      <input id="amount" name="amount" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" required />
      <p class="text-xs text-zinc-500 mt-1">Item or service price before fees and tax. Do not include shipping or tax here — use the fields below.</p>
    </div>
    <div>
      <label class="block text-sm" for="deviceId">Device</label>
      <select id="deviceId" name="deviceId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.devices as d}
          <option value={d.id}>{d.sku} — {d.make} {d.model}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Optional. Attach the income to a device so it’s reflected in that device’s profit summary.</p>
    </div>
    <div>
      <label class="block text-sm" for="channelId">Channel</label>
      <select id="channelId" name="channelId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
        <option value="">-</option>
        {#each data.channels as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <p class="text-xs text-zinc-500 mt-1">Where the sale happened (e.g., eBay, Facebook Marketplace, in-person).</p>
    </div>
    <div>
      <label class="block text-sm" for="platformFees">Platform Fees</label>
      <input id="platformFees" name="platformFees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Marketplace fees (e.g., eBay/Shopify) taken from the sale.</p>
    </div>
    <div>
      <label class="block text-sm" for="paymentFees">Payment Fees</label>
      <input id="paymentFees" name="paymentFees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Processor fees (e.g., PayPal, Stripe) for the transaction.</p>
    </div>
    <div>
      <label class="block text-sm" for="shippingRevenue">Shipping Revenue</label>
      <input id="shippingRevenue" name="shippingRevenue" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Amount you collected from the buyer for shipping.</p>
    </div>
    <div>
      <label class="block text-sm" for="shippingCost">Shipping Cost</label>
      <input id="shippingCost" name="shippingCost" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Your actual shipping label cost.</p>
    </div>
    <div>
      <label class="block text-sm" for="taxCollected">Tax Collected</label>
      <input id="taxCollected" name="taxCollected" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
      <p class="text-xs text-zinc-500 mt-1">Sales tax collected (not included in profit).</p>
    </div>
    <div class="md:col-span-3">
      <label class="block text-sm" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900"></textarea>
    </div>
    <div class="md:col-span-3">
      <button class="px-3 py-2 rounded bg-green-600 text-white">Save Income</button>
    </div>
  </form>
{/if}

<table class="w-full text-sm border divide-y">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">Date</th>
      <th class="p-2">Type</th>
      <th class="p-2">Amount</th>
      <th class="p-2">Device</th>
      <th class="p-2">Channel</th>
      <th class="p-2">Notes</th>
      <th class="p-2">Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.income as r}
      <tr class="divide-x">
        <td class="p-2">{new Date(r.date).toLocaleDateString()}</td>
        <td class="p-2">{r.type}</td>
        <td class="p-2">${(r.amountCents/100).toFixed(2)}</td>
        <td class="p-2">{r.device ? `${r.device.sku} — ${r.device.make} ${r.device.model}` : '-'}</td>
        <td class="p-2">{r.channel?.name || '-'}</td>
        <td class="p-2">{r.notes || '-'}</td>
        <td class="p-2">
          <div class="flex items-center gap-2">
            <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-yellow-600 text-white hover:opacity-90" title="Edit" aria-label="Edit" onclick={() => (editingId = editingId === r.id ? null : r.id)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                <path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 2.121l-1.06 1.06-2.122-2.12 1.061-1.06ZM14.68 5.669 4.5 15.85V19.5h3.65L18.33 9.319l-3.65-3.65Z"/>
              </svg>
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(ev) => { if (!confirm('Archive this income entry? You can restore it later via the database.')) { ev.preventDefault(); } }}>
              <input type="hidden" name="id" value={r.id} />
              <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-orange-600 text-white hover:opacity-90" title="Archive" aria-label="Archive">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                  <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V7Zm1 4h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Zm5 2v2h6v-2H9Z"/>
                </svg>
              </button>
            </form>
          </div>
        </td>
      </tr>
      {#if editingId === r.id}
        <tr class="bg-zinc-50/50 dark:bg-zinc-800/30">
          <td colspan="7" class="p-3">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={r.id} />
              <div>
                <label class="block text-sm" for={`date-${r.id}`}>Date</label>
                <input id={`date-${r.id}`} name="date" type="date" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={new Date(r.date).toISOString().slice(0,10)} />
              </div>
              <div>
                <label class="block text-sm" for={`type-${r.id}`}>Type</label>
                <select id={`type-${r.id}`} name="type" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="SALE" selected={r.type === 'SALE'}>Sale</option>
                  <option value="SERVICE" selected={r.type === 'SERVICE'}>Service</option>
                  <option value="DEPOSIT" selected={r.type === 'DEPOSIT'}>Deposit</option>
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`amount-${r.id}`}>Amount (USD)</label>
                <input id={`amount-${r.id}`} name="amount" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={(r.amountCents/100).toFixed(2)} />
              </div>
              <div>
                <label class="block text-sm" for={`deviceId-${r.id}`}>Device</label>
                <select id={`deviceId-${r.id}`} name="deviceId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!r.device}>-</option>
                  {#each data.devices as d}
                    <option value={d.id} selected={r.device?.id === d.id}>{d.sku} — {d.make} {d.model}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`channelId-${r.id}`}>Channel</label>
                <select id={`channelId-${r.id}`} name="channelId" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
                  <option value="" selected={!r.channel}>-</option>
                  {#each data.channels as c}
                    <option value={c.id} selected={r.channel?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-sm" for={`platformFees-${r.id}`}>Platform Fees</label>
                <input id={`platformFees-${r.id}`} name="platformFees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div>
                <label class="block text-sm" for={`paymentFees-${r.id}`}>Payment Fees</label>
                <input id={`paymentFees-${r.id}`} name="paymentFees" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div>
                <label class="block text-sm" for={`shippingRevenue-${r.id}`}>Shipping Revenue</label>
                <input id={`shippingRevenue-${r.id}`} name="shippingRevenue" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div>
                <label class="block text-sm" for={`shippingCost-${r.id}`}>Shipping Cost</label>
                <input id={`shippingCost-${r.id}`} name="shippingCost" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div>
                <label class="block text-sm" for={`taxCollected-${r.id}`}>Tax Collected</label>
                <input id={`taxCollected-${r.id}`} name="taxCollected" type="number" step="0.01" min="0" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
              </div>
              <div class="md:col-span-3">
                <label class="block text-sm" for={`notes-${r.id}`}>Notes</label>
                <textarea id={`notes-${r.id}`} name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">{r.notes || ''}</textarea>
              </div>
              <div class="md:col-span-3 flex gap-2">
                <button class="px-3 py-2 rounded bg-green-600 text-white">Save</button>
                <button class="px-3 py-2 rounded bg-zinc-300 dark:bg-zinc-700" onclick={(ev) => { ev.preventDefault(); editingId = null; }}>Cancel</button>
              </div>
            </form>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
