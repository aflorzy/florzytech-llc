<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SkuTag from '$lib/components/SkuTag.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { humanizeEnum } from '$lib/format';
  import Icon from '$lib/components/Icon.svelte';
  type Customer = { id: string; name: string };
  type WorkOrder = { id: string; code: string; status: string; targetAction: string; notes?: string | null; customer?: Customer | null };
  let { data } = $props<{ data: { orders: WorkOrder[]; customers: Customer[] } }>();
  let formOpen = $state(false);
  let editingId = $state<string | null>(null);
  let editing = $derived((data.orders.find((o: WorkOrder) => o.id === editingId) ?? null) as WorkOrder | null);
</script>

<PageHeader title="Work Orders">
  {#snippet actions()}
    <button data-testid="work-orders-toggle-form" class="btn {formOpen ? 'btn-secondary' : 'btn-primary'}" onclick={() => (formOpen = !formOpen)}>
      {formOpen ? 'Close' : 'New Work Order'}
    </button>
  {/snippet}
</PageHeader>

{#if formOpen}
  <form method="post" action="?/create" class="form-panel md:grid-cols-3">
    <div>
      <label class="label" for="targetAction">Target Action</label>
      <select id="targetAction" name="targetAction" class="input">
        <option value="RETURN_TO_CUSTOMER">Return to Customer</option>
        <option value="SELL">Sell</option>
      </select>
    </div>
    <div>
      <label class="label" for="customerId">Customer</label>
      <select id="customerId" name="customerId" class="input">
        <option value="">-</option>
        {#each data.customers as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </div>
    <div class="md:col-span-3">
      <label class="label" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="input"></textarea>
    </div>
    <div class="md:col-span-3">
      <button data-testid="work-orders-create-work-order" type="submit" class="btn btn-primary">Create Work Order</button>
    </div>
  </form>
{/if}

<div class="table-wrap">
<table class="data-table">
  <thead>
    <tr>
      <th>Code</th>
      <th>Status</th>
      <th>Target</th>
      <th>Customer</th>
      <th>Notes</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.orders as o}
      <tr>
        <td><SkuTag code={o.code} href={`/work-orders/${o.id}`} /></td>
        <td><StatusBadge status={o.status} /></td>
        <td>{humanizeEnum(o.targetAction)}</td>
        <td>{o.customer?.name || '-'}</td>
        <td>{o.notes || '-'}</td>
        <td>
          <div class="flex items-center gap-2">
            <button class="icon-btn" title="Edit" aria-label="Edit" onclick={() => (editingId = o.id)}>
              <Icon name="edit" />
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(e) => { if (!confirm('Archive this work order?')) { e.preventDefault(); } }}>
              <input type="hidden" name="id" value={o.id} />
              <button class="icon-btn icon-btn-danger" title="Archive" aria-label="Archive">
                <Icon name="archive" />
              </button>
            </form>
          </div>
        </td>
      </tr>
      {#if editingId === o.id}
        <tr class="edit-row">
          <td colspan="6">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={o.id} />
              <div>
                <label class="label" for={`status-${o.id}`}>Status</label>
                <select id={`status-${o.id}`} name="status" class="input">
                  <option value="OPEN" selected={o.status === 'OPEN'}>Open</option>
                  <option value="WAITING_PARTS" selected={o.status === 'WAITING_PARTS'}>Waiting Parts</option>
                  <option value="IN_PROGRESS" selected={o.status === 'IN_PROGRESS'}>In Progress</option>
                  <option value="READY" selected={o.status === 'READY'}>Ready</option>
                  <option value="DELIVERED" selected={o.status === 'DELIVERED'}>Delivered</option>
                  <option value="CANCELLED" selected={o.status === 'CANCELLED'}>Cancelled</option>
                </select>
              </div>
              <div>
                <label class="label" for={`target-${o.id}`}>Target Action</label>
                <select id={`target-${o.id}`} name="targetAction" class="input">
                  <option value="RETURN_TO_CUSTOMER" selected={o.targetAction === 'RETURN_TO_CUSTOMER'}>Return to Customer</option>
                  <option value="SELL" selected={o.targetAction === 'SELL'}>Sell</option>
                </select>
              </div>
              <div>
                <label class="label" for={`customerId-${o.id}`}>Customer</label>
                <select id={`customerId-${o.id}`} name="customerId" class="input">
                  <option value="" selected={!o.customer}>-</option>
                  {#each data.customers as c}
                    <option value={c.id} selected={o.customer?.id === c.id}>{c.name}</option>
                  {/each}
                </select>
              </div>
              <div class="md:col-span-3">
                <label class="label" for={`notes-${o.id}`}>Notes</label>
                <textarea id={`notes-${o.id}`} name="notes" class="input">{o.notes || ''}</textarea>
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
      <tr><td colspan="6" class="empty-cell">No work orders yet.</td></tr>
    {/each}
  </tbody>
</table>
</div>
