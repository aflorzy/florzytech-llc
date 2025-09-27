<script lang="ts">
  type DeviceListItem = {
    id: string;
    sku: string;
    make: string;
    model: string;
    serial?: string | null;
    status: string;
    createdAt: string | Date;
    source?: string | null;
    condition?: string | null;
    notes?: string | null;
    netCents: number;
  };
  let { data } = $props<{ data: { devices: DeviceListItem[] } }>();
  let formOpen = $state(false);
  let editingId = $state<string | null>(null);
  let editing = $derived((data.devices.find((d: DeviceListItem) => d.id === editingId) ?? null) as DeviceListItem | null);

  const deviceStatuses = [
    'PURCHASED',
    'AWAITING_SHIPMENT',
    'ARRIVED',
    'DIAGNOSING',
    'WAITING_PARTS',
    'REPAIRING',
    'READY',
    'LISTED',
    'SOLD',
    'SHIPPED',
    'DELIVERED'
  ] as const;
  type DeviceStatusType = typeof deviceStatuses[number];
</script>

<h1 class="text-2xl font-semibold mb-4">Devices</h1>

<button class="btn mb-4 px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (formOpen = !formOpen)}>
  {formOpen ? 'Close' : 'Add Device'}
</button>

{#if formOpen}
  <form method="post" action="?/create" class="grid gap-3 md:grid-cols-2 p-4 border rounded mb-6">
    <div>
      <label class="block text-sm" for="make">Make</label>
      <input id="make" name="make" required class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="model">Model</label>
      <input id="model" name="model" required class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="serial">Serial/IMEI</label>
      <input id="serial" name="serial" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="source">Source</label>
      <input id="source" name="source" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="condition">Condition</label>
      <input id="condition" name="condition" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    
    <div class="md:col-span-2">
      <label class="block text-sm" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900"></textarea>
    </div>
    <div class="md:col-span-2">
      <button type="submit" class="px-3 py-2 rounded bg-green-600 text-white">Save Device</button>
    </div>
  </form>
{/if}

<table class="w-full text-sm border divide-y">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">SKU</th>
      <th class="p-2">Make/Model</th>
      <th class="p-2">Serial</th>
      <th class="p-2">Net</th>
      <th class="p-2">Status</th>
      <th class="p-2">Created</th>
      <th class="p-2">Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.devices as d}
      <tr class="divide-x hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
        <td class="p-2"><a class="text-blue-600 hover:underline" href={`/devices/${d.id}`}>{d.sku}</a></td>
        <td class="p-2">{d.make} {d.model}</td>
        <td class="p-2">{d.serial || '-'}</td>
        <td class="p-2"><span class={d.netCents >= 0 ? 'text-green-600' : 'text-red-600'}>${(d.netCents/100).toFixed(2)}</span></td>
        <td class="p-2">
          <form method="post" action="?/update" class="inline">
            <input type="hidden" name="id" value={d.id} />
            <select name="status" class="h-8 px-2 py-1 border rounded bg-white dark:bg-zinc-900" onchange={(e) => { (e.currentTarget as HTMLSelectElement).form?.requestSubmit(); }}>
              {#each deviceStatuses as s}
                <option value={s} selected={d.status === s}>{s.split('_').join(' ')}</option>
              {/each}
            </select>
          </form>
        </td>
        <td class="p-2">{new Date(d.createdAt).toLocaleDateString()}</td>
        <td class="p-2">
          <div class="flex items-center gap-2">
            <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-yellow-600 text-white hover:opacity-90" title="Edit" aria-label="Edit" onclick={() => (editingId = d.id)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                <path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 2.121l-1.06 1.06-2.122-2.12 1.061-1.06ZM14.68 5.669 4.5 15.85V19.5h3.65L18.33 9.319l-3.65-3.65Z"/>
              </svg>
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(e) => { if (!confirm('Archive this device? Existing records will still reference it.')) { e.preventDefault(); } }}>
              <input type="hidden" name="id" value={d.id} />
              <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-orange-600 text-white hover:opacity-90" title="Archive" aria-label="Archive">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                  <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V7Zm1 4h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Zm5 2v2h6v-2H9Z"/>
                </svg>
              </button>
            </form>
          </div>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

{#if editing}
  <div class="fixed inset-0 z-20 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" role="button" tabindex="0" aria-label="Close edit dialog" onclick={() => (editingId = null)} onkeydown={(e) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ' || k === 'Escape') { editingId = null; } }}></div>
    <div class="relative z-30 w-full max-w-3xl mx-4 bg-white dark:bg-zinc-900 border rounded shadow p-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold">Edit Device — {editing.sku}</h2>
        <button class="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-800" aria-label="Close" onclick={() => (editingId = null)}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5"><path d="M6.225 4.811 4.811 6.225 9.586 11l-4.775 4.775 1.414 1.414L11 12.414l4.775 4.775 1.414-1.414L12.414 11l4.775-4.775-1.414-1.414L11 9.586 6.225 4.811Z"/></svg>
        </button>
      </div>
      <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
        <input type="hidden" name="id" value={editing.id} />
        <div>
          <label class="block text-sm" for={`make-${editing.id}`}>Make</label>
          <input id={`make-${editing.id}`} name="make" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={editing.make} required />
        </div>
        <div>
          <label class="block text-sm" for={`model-${editing.id}`}>Model</label>
          <input id={`model-${editing.id}`} name="model" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={editing.model} required />
        </div>
        <div>
          <label class="block text-sm" for={`status-${editing.id}`}>Status</label>
          <select id={`status-${editing.id}`} name="status" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">
            {#each deviceStatuses as s}
              <option value={s} selected={editing.status === s}>{s.split('_').join(' ')}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-sm" for={`serial-${editing.id}`}>Serial/IMEI</label>
          <input id={`serial-${editing.id}`} name="serial" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={editing.serial || ''} />
        </div>
        <div>
          <label class="block text-sm" for={`source-${editing.id}`}>Source</label>
          <input id={`source-${editing.id}`} name="source" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={editing.source || ''} />
        </div>
        <div>
          <label class="block text-sm" for={`condition-${editing.id}`}>Condition</label>
          <input id={`condition-${editing.id}`} name="condition" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={editing.condition || ''} />
        </div>
        
        <div class="md:col-span-3">
          <label class="block text-sm" for={`notes-${editing.id}`}>Notes</label>
          <textarea id={`notes-${editing.id}`} name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">{editing.notes || ''}</textarea>
        </div>
        <div class="md:col-span-3 flex gap-2 justify-end">
          <button class="px-3 py-2 rounded bg-zinc-300 dark:bg-zinc-700" onclick={(e) => { e.preventDefault(); editingId = null; }}>Cancel</button>
          <button class="px-3 py-2 rounded bg-green-600 text-white">Save</button>
        </div>
      </form>
    </div>
  </div>
{/if}


