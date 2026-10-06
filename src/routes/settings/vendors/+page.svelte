<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Badge from '$lib/components/Badge.svelte';
  type Vendor = { id: string; name: string; type?: string | null; active: boolean };
  let { data } = $props<{ data: { vendors: Vendor[] } }>();
  let open = $state(false);
  let editingId = $state<string | null>(null);
</script>

<PageHeader title="Vendors" back={{ href: '/settings', label: 'Settings' }}>
  {#snippet actions()}
    <button class="btn {open ? 'btn-secondary' : 'btn-primary'}" onclick={() => (open = !open)}>
      {open ? 'Close' : 'Add Vendor'}
    </button>
  {/snippet}
</PageHeader>

{#if open}
  <form method="post" action="?/create" class="form-panel md:grid-cols-3">
    <div>
      <label class="label" for="name">Name</label>
      <input id="name" name="name" required class="input" />
      <p class="hint">Example: Amazon, eBay, Local Shop</p>
    </div>
    <div>
      <label class="label" for="type">Type (optional)</label>
      <input id="type" name="type" class="input" />
      <p class="hint">e.g., marketplace, local_store, supplier</p>
    </div>
    <div class="md:col-span-3">
      <button class="btn btn-primary">Save Vendor</button>
    </div>
  </form>
{/if}

<div class="table-wrap">
<table class="data-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Type</th>
      <th>Active</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.vendors as v}
      <tr>
        <td>{v.name}</td>
        <td>{v.type || '-'}</td>
        <td><Badge tone={v.active ? 'gain' : 'neutral'}>{v.active ? 'Active' : 'Inactive'}</Badge></td>
        <td><div class="flex items-center gap-1.5">
          <form method="post" action="?/toggle" class="inline">
            <input type="hidden" name="id" value={v.id} />
            <button class="btn btn-secondary btn-sm">
              {v.active ? 'Deactivate' : 'Activate'}
            </button>
          </form>
          <button class="icon-btn" title="Edit" aria-label="Edit" onclick={() => (editingId = editingId === v.id ? null : v.id)}><Icon name="edit" /></button>
          <form method="post" action="?/delete" class="inline" onsubmit={(e) => { if (!confirm('Archive this vendor? Existing records will still reference it.')) { e.preventDefault(); } }}>
            <input type="hidden" name="id" value={v.id} />
            <button class="icon-btn icon-btn-danger" title="Archive" aria-label="Archive"><Icon name="archive" /></button>
          </form>
        </div></td>
      </tr>
      {#if editingId === v.id}
        <tr class="edit-row">
          <td colspan="4">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={v.id} />
              <div>
                <label class="label" for={`name-${v.id}`}>Name</label>
                <input id={`name-${v.id}`} name="name" class="input" value={v.name} required />
              </div>
              <div>
                <label class="label" for={`type-${v.id}`}>Type</label>
                <input id={`type-${v.id}`} name="type" class="input" value={v.type || ''} />
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
      <tr><td colspan="4" class="empty-cell">No vendors yet.</td></tr>
    {/each}
  </tbody>
</table>
</div>
