<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Badge from '$lib/components/Badge.svelte';
  import { effectiveUnitCostCents } from '$lib/parts';
  import { formatUsd } from '$lib/format';

  type Part = {
    id: string;
    name: string;
    sku?: string | null;
    partNumber?: string | null;
    quantity: number;
    unitCostCents?: number | null;
    averageCostCents: number;
    notes?: string | null;
    url?: string | null;
  };
  let { data } = $props<{ data: { parts: Part[] } }>();
  let open = $state(false);
  let editingId = $state<string | null>(null);

  // Once a part has been received on a receipt its cost is the running average, not the hand-entered unit cost
  const isAveraged = (p: Part) => (p.averageCostCents || 0) > 0;
</script>

<PageHeader title="Parts">
  {#snippet actions()}
    <button class="btn {open ? 'btn-secondary' : 'btn-primary'}" onclick={() => (open = !open)}>
      {open ? 'Close' : 'Add Part'}
    </button>
  {/snippet}
</PageHeader>

{#if open}
  <form method="post" action="?/create" class="form-panel md:grid-cols-3">
    <div>
      <label class="label" for="name">Name</label>
      <input id="name" name="name" class="input" required />
    </div>
    <div>
      <label class="label" for="sku">SKU (optional)</label>
      <input id="sku" name="sku" class="input" />
    </div>
    <div>
      <label class="label" for="partNumber">Part # (optional)</label>
      <input id="partNumber" name="partNumber" class="input" />
    </div>
    <div class="md:col-span-3">
      <label class="label" for="url">Purchase URL (optional)</label>
      <input id="url" name="url" type="url" class="input" placeholder="https://..." />
      <p class="hint">Link to the product page to quickly reorder.</p>
    </div>
    <div>
      <label class="label" for="quantity">Quantity</label>
      <input id="quantity" name="quantity" type="number" step="1" min="0" class="input" value={0} />
    </div>
    <div>
      <label class="label" for="unitCost">Unit Cost (USD, optional)</label>
      <input id="unitCost" name="unitCost" type="number" step="0.01" min="0" class="input" />
      <p class="hint">Used until the part is bought on a split receipt. After that, the average cost from receipts replaces it.</p>
    </div>
    <div class="md:col-span-3">
      <label class="label" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="input"></textarea>
    </div>
    <div class="md:col-span-3">
      <button class="btn btn-primary">Save Part</button>
    </div>
  </form>
{/if}

<div class="table-wrap">
<table class="data-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>SKU</th>
      <th>Part #</th>
      <th>Qty</th>
      <th>Unit Cost</th>
      <th>Link</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.parts as p}
      <tr>
        <td>{p.name}</td>
        <td>{p.sku || '-'}</td>
        <td>{p.partNumber || '-'}</td>
        <td>{p.quantity}</td>
        <td>
          {#if isAveraged(p)}
            {formatUsd(p.averageCostCents)}
            <span class="ml-1" title="Average cost from receipts. It is recalculated on each new receipt and replaces any unit cost entered by hand."><Badge tone="info">avg</Badge></span>
          {:else if p.unitCostCents != null}
            {formatUsd(effectiveUnitCostCents(p))}
          {:else}
            -
          {/if}
        </td>
        <td>
          {#if p.url}
            <a class="link inline-flex items-center gap-1" href={p.url} target="_blank" rel="noopener noreferrer">Open <Icon name="external" class="h-3.5 w-3.5" /></a>
          {:else}-{/if}
        </td>
        <td><div class="flex items-center gap-1.5">
          <form method="post" action="?/adjust" class="inline">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="delta" value={-1} />
            <button class="btn btn-secondary btn-sm">-1</button>
          </form>
          <form method="post" action="?/adjust" class="inline">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="delta" value={1} />
            <button class="btn btn-secondary btn-sm">+1</button>
          </form>
          <button class="icon-btn" title="Edit" aria-label="Edit" onclick={() => (editingId = editingId === p.id ? null : p.id)}><Icon name="edit" /></button>
          <form method="post" action="?/delete" class="inline" onsubmit={(e) => { if (!confirm('Archive this part? You can restore it later via the database.')) { e.preventDefault(); } }}>
            <input type="hidden" name="id" value={p.id} />
            <button class="icon-btn icon-btn-danger" title="Archive" aria-label="Archive"><Icon name="archive" /></button>
          </form>
        </div></td>
      </tr>
      {#if editingId === p.id}
        <tr class="edit-row">
          <td colspan="7">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={p.id} />
              <div>
                <label class="label" for={`name-${p.id}`}>Name</label>
                <input id={`name-${p.id}`} name="name" class="input" value={p.name} required />
              </div>
              <div>
                <label class="label" for={`sku-${p.id}`}>SKU</label>
                <input id={`sku-${p.id}`} name="sku" class="input" value={p.sku || ''} />
              </div>
              <div>
                <label class="label" for={`partNumber-${p.id}`}>Part #</label>
                <input id={`partNumber-${p.id}`} name="partNumber" class="input" value={p.partNumber || ''} />
              </div>
              <div class="md:col-span-3">
                <label class="label" for={`url-${p.id}`}>Purchase URL</label>
                <input id={`url-${p.id}`} name="url" type="url" class="input" value={p.url || ''} />
              </div>
              <div>
                <label class="label" for={`quantity-${p.id}`}>Quantity</label>
                <input id={`quantity-${p.id}`} name="quantity" type="number" step="1" min="0" class="input" value={p.quantity} />
              </div>
              <div>
                <label class="label" for={`unitCost-${p.id}`}>Unit Cost (USD)</label>
                <input id={`unitCost-${p.id}`} name="unitCost" type="number" step="0.01" min="0" class="input" value={p.unitCostCents != null ? (p.unitCostCents/100) : ''} />
                {#if isAveraged(p)}
                  <p class="hint text-accent-ink">This part is costed at its receipt average of {formatUsd(p.averageCostCents)}. A unit cost entered here is saved but not used, and the average is recalculated on each new receipt.</p>
                {:else}
                  <p class="hint">Used until the part is bought on a split receipt. After that, the average cost from receipts replaces it.</p>
                {/if}
              </div>
              <div class="md:col-span-3">
                <label class="label" for={`notes-${p.id}`}>Notes</label>
                <textarea id={`notes-${p.id}`} name="notes" class="input">{p.notes || ''}</textarea>
              </div>
              <div class="md:col-span-3 flex gap-2">
                <button class="btn btn-primary">Save</button>
                <button class="btn btn-secondary" onclick={(e) => { e.preventDefault(); editingId = null; }}>Cancel</button>
              </div>
            </form>
          </td>
        </tr>
      {/if}
    {:else}
      <tr><td colspan="7" class="empty-cell">No parts in stock yet.</td></tr>
    {/each}
  </tbody>
</table>
</div>


