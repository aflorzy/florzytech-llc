<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Icon from '$lib/components/Icon.svelte';
  type Customer = {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    notes?: string | null;
    createdAt?: string | Date;
  };
  let { data } = $props<{ data: { customers: Customer[] } }>();
  let formOpen = $state(false);
  let editingId = $state<string | null>(null);
  let editing = $derived((data.customers.find((c: Customer) => c.id === editingId) ?? null) as Customer | null);
</script>

<PageHeader title="Customers">
  {#snippet actions()}
    <button class="btn {formOpen ? 'btn-secondary' : 'btn-primary'}" onclick={() => (formOpen = !formOpen)}>
      {formOpen ? 'Close' : 'Add Customer'}
    </button>
  {/snippet}
</PageHeader>

{#if formOpen}
  <form method="post" action="?/create" class="form-panel md:grid-cols-3">
    <div>
      <label class="label" for="name">Name</label>
      <input id="name" name="name" required class="input" />
    </div>
    <div>
      <label class="label" for="email">Email</label>
      <input id="email" name="email" class="input" />
    </div>
    <div>
      <label class="label" for="phone">Phone</label>
      <input id="phone" name="phone" class="input" />
    </div>
    <div>
      <label class="label" for="addressLine1">Address Line 1</label>
      <input id="addressLine1" name="addressLine1" class="input" />
    </div>
    <div>
      <label class="label" for="addressLine2">Address Line 2</label>
      <input id="addressLine2" name="addressLine2" class="input" />
    </div>
    <div>
      <label class="label" for="city">City</label>
      <input id="city" name="city" class="input" />
    </div>
    <div>
      <label class="label" for="state">State</label>
      <input id="state" name="state" class="input" />
    </div>
    <div>
      <label class="label" for="postalCode">Postal Code</label>
      <input id="postalCode" name="postalCode" class="input" />
    </div>
    <div class="md:col-span-3">
      <label class="label" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="input"></textarea>
    </div>
    <div class="md:col-span-3">
      <button type="submit" class="btn btn-primary">Save Customer</button>
    </div>
  </form>
{/if}

<div class="table-wrap">
<table class="data-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Email</th>
      <th>Phone</th>
      <th>City</th>
      <th>State</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.customers as c}
      <tr>
        <td>{c.name}</td>
        <td>{c.email || '-'}</td>
        <td>{c.phone || '-'}</td>
        <td>{c.city || '-'}</td>
        <td>{c.state || '-'}</td>
        <td>
          <div class="flex items-center gap-2">
            <button class="icon-btn" title="Edit" aria-label="Edit" onclick={() => (editingId = c.id)}>
              <Icon name="edit" />
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(e) => { if (!confirm('Archive this customer?')) { e.preventDefault(); } }}>
              <input type="hidden" name="id" value={c.id} />
              <button class="icon-btn icon-btn-danger" title="Archive" aria-label="Archive">
                <Icon name="archive" />
              </button>
            </form>
          </div>
        </td>
      </tr>
      {#if editingId === c.id}
        <tr class="edit-row">
          <td colspan="6">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={c.id} />
              <div>
                <label class="label" for={`name-${c.id}`}>Name</label>
                <input id={`name-${c.id}`} name="name" required class="input" value={c.name} />
              </div>
              <div>
                <label class="label" for={`email-${c.id}`}>Email</label>
                <input id={`email-${c.id}`} name="email" class="input" value={c.email || ''} />
              </div>
              <div>
                <label class="label" for={`phone-${c.id}`}>Phone</label>
                <input id={`phone-${c.id}`} name="phone" class="input" value={c.phone || ''} />
              </div>
              <div>
                <label class="label" for={`addressLine1-${c.id}`}>Address Line 1</label>
                <input id={`addressLine1-${c.id}`} name="addressLine1" class="input" value={c.addressLine1 || ''} />
              </div>
              <div>
                <label class="label" for={`addressLine2-${c.id}`}>Address Line 2</label>
                <input id={`addressLine2-${c.id}`} name="addressLine2" class="input" value={c.addressLine2 || ''} />
              </div>
              <div>
                <label class="label" for={`city-${c.id}`}>City</label>
                <input id={`city-${c.id}`} name="city" class="input" value={c.city || ''} />
              </div>
              <div>
                <label class="label" for={`state-${c.id}`}>State</label>
                <input id={`state-${c.id}`} name="state" class="input" value={c.state || ''} />
              </div>
              <div>
                <label class="label" for={`postalCode-${c.id}`}>Postal Code</label>
                <input id={`postalCode-${c.id}`} name="postalCode" class="input" value={c.postalCode || ''} />
              </div>
              <div class="md:col-span-3">
                <label class="label" for={`notes-${c.id}`}>Notes</label>
                <textarea id={`notes-${c.id}`} name="notes" class="input">{c.notes || ''}</textarea>
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
      <tr><td colspan="6" class="empty-cell">No customers yet.</td></tr>
    {/each}
  </tbody>
</table>
</div>
