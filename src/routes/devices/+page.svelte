<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SkuTag from '$lib/components/SkuTag.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { formatUsd, toneOf, toneClass, humanizeEnum } from '$lib/format';
  import Icon from '$lib/components/Icon.svelte';
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
  type VendorRef = { id: string; name: string };
  let { data } = $props<{ data: { devices: DeviceListItem[]; vendors: VendorRef[] } }>();
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
    'DELIVERED',
    'DONOR'
  ] as const;
  type DeviceStatusType = typeof deviceStatuses[number];
</script>

<PageHeader title="Devices">
  {#snippet actions()}
    <button data-testid="devices-toggle-form" class="btn {formOpen ? 'btn-secondary' : 'btn-primary'}" onclick={() => (formOpen = !formOpen)}>
      {formOpen ? 'Close' : 'Add Device'}
    </button>
  {/snippet}
</PageHeader>

{#if formOpen}
  <form method="post" action="?/create" class="form-panel md:grid-cols-2">
    <div>
      <label class="label" for="make">Make</label>
      <input id="make" name="make" required class="input" />
    </div>
    <div>
      <label class="label" for="model">Model</label>
      <input id="model" name="model" required class="input" />
    </div>
    <div>
      <label class="label" for="serial">Serial/IMEI</label>
      <input id="serial" name="serial" class="input" />
    </div>
    <div>
      <label class="label" for="vendorId">Vendor</label>
      <select id="vendorId" name="vendorId" class="input">
        <option value="">-</option>
        {#each data.vendors as v}
          <option value={v.id}>{v.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="label" for="condition">Condition</label>
      <input id="condition" name="condition" class="input" />
    </div>
    
    <div class="md:col-span-2">
      <label class="label" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="input"></textarea>
    </div>
    <div class="md:col-span-2">
      <button data-testid="devices-save-device" type="submit" class="btn btn-primary">Save Device</button>
    </div>
  </form>
{/if}

<div class="table-wrap">
<table class="data-table">
  <thead>
    <tr>
      <th>SKU</th>
      <th>Make/Model</th>
      <th>Serial</th>
      <th>Net</th>
      <th>Status</th>
      <th>Created</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.devices as d}
      <tr>
        <td><SkuTag code={d.sku} href={`/devices/${d.id}`} /></td>
        <td>{d.make} {d.model}</td>
        <td>{d.serial || '-'}</td>
        <td><span class={toneClass[toneOf(d.netCents)]}>{formatUsd(d.netCents)}</span></td>
        <td>
          <form method="post" action="?/update" class="inline">
            <input type="hidden" name="id" value={d.id} />
            <select name="status" class="input input-sm w-auto" onchange={(e) => { (e.currentTarget as HTMLSelectElement).form?.requestSubmit(); }}>
              {#each deviceStatuses as s}
                <option value={s} selected={d.status === s}>{humanizeEnum(s)}</option>
              {/each}
            </select>
          </form>
        </td>
        <td>{new Date(d.createdAt).toLocaleDateString()}</td>
        <td>
          <div class="flex items-center gap-2">
            <button class="icon-btn" title="Edit" aria-label="Edit" onclick={() => (editingId = d.id)}>
              <Icon name="edit" />
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(e) => { if (!confirm('Archive this device? Existing records will still reference it.')) { e.preventDefault(); } }}>
              <input type="hidden" name="id" value={d.id} />
              <button class="icon-btn icon-btn-danger" title="Archive" aria-label="Archive">
                <Icon name="archive" />
              </button>
            </form>
          </div>
        </td>
      </tr>
    {:else}
      <tr><td colspan="7" class="empty-cell">No devices yet. Add the first one to start tracking it.</td></tr>
    {/each}
  </tbody>
</table>
</div>

{#if editing}
  <Modal title={`Edit device ${editing.sku}`} onclose={() => (editingId = null)}>
      <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
        <input type="hidden" name="id" value={editing.id} />
        <div>
          <label class="label" for={`make-${editing.id}`}>Make</label>
          <input id={`make-${editing.id}`} name="make" class="input" value={editing.make} required />
        </div>
        <div>
          <label class="label" for={`model-${editing.id}`}>Model</label>
          <input id={`model-${editing.id}`} name="model" class="input" value={editing.model} required />
        </div>
        <div>
          <label class="label" for={`status-${editing.id}`}>Status</label>
          <select id={`status-${editing.id}`} name="status" class="input">
            {#each deviceStatuses as s}
              <option value={s} selected={editing.status === s}>{humanizeEnum(s)}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label" for={`serial-${editing.id}`}>Serial/IMEI</label>
          <input id={`serial-${editing.id}`} name="serial" class="input" value={editing.serial || ''} />
        </div>
        <div>
          <label class="label" for={`vendorId-${editing.id}`}>Vendor</label>
          <select id={`vendorId-${editing.id}`} name="vendorId" class="input">
            <option value="" selected={!editing.source}>-</option>
            {#each data.vendors as v}
              <option value={v.id} selected={editing.source === v.name}>{v.name}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="label" for={`condition-${editing.id}`}>Condition</label>
          <input id={`condition-${editing.id}`} name="condition" class="input" value={editing.condition || ''} />
        </div>
        
        <div class="md:col-span-3">
          <label class="label" for={`notes-${editing.id}`}>Notes</label>
          <textarea id={`notes-${editing.id}`} name="notes" class="input">{editing.notes || ''}</textarea>
        </div>
        <div class="md:col-span-3 flex gap-2 justify-end">
          <button class="btn btn-secondary" onclick={(e) => { e.preventDefault(); editingId = null; }}>Cancel</button>
          <button class="btn btn-primary">Save</button>
        </div>
      </form>
  </Modal>
{/if}

