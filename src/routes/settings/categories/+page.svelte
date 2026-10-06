<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Badge from '$lib/components/Badge.svelte';
  type Category = { id: string; name: string; active: boolean };
  type Data = { expenseCategories: Category[]; incomeCategories: Category[] };
  let { data } = $props<{ data: Data }>();

  let openExpense = $state(false);
  let openIncome = $state(false);
  let editingId = $state<string | null>(null);
</script>

<PageHeader title="Categories" subtitle="Manage categories for expenses and income." back={{ href: '/settings', label: 'Settings' }} />

<div class="grid gap-6 md:grid-cols-2">
  <section class="card min-w-0">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold">Expense Categories</h2>
      <button class="btn btn-secondary btn-sm" onclick={() => (openExpense = !openExpense)}>{openExpense ? 'Close' : 'Add'}</button>
    </div>
    {#if openExpense}
      <form method="post" action="?/create" class="flex gap-2 mb-3">
        <input type="hidden" name="kind" value="expense" />
        <input name="name" class="input flex-1" placeholder="New expense category name" required />
        <button class="btn btn-primary">Save</button>
      </form>
    {/if}
    <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Active</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each data.expenseCategories as c}
          <tr>
            <td>{c.name}</td>
            <td><Badge tone={c.active ? 'gain' : 'neutral'}>{c.active ? 'Active' : 'Inactive'}</Badge></td>
            <td><div class="flex items-center gap-1.5">
              <form method="post" action="?/toggle" class="inline">
                <input type="hidden" name="id" value={c.id} />
                <button class="btn btn-secondary btn-sm">{c.active ? 'Deactivate' : 'Activate'}</button>
              </form>
              <button class="icon-btn" title="Edit" aria-label="Edit" onclick={() => (editingId = editingId === c.id ? null : c.id)}><Icon name="edit" /></button>
            </div></td>
          </tr>
          {#if editingId === c.id}
            <tr class="edit-row">
              <td colspan="3">
                <form method="post" action="?/update" class="flex gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" class="input flex-1" value={c.name} required />
                  <button class="btn btn-primary">Save</button>
                  <button class="btn btn-secondary" onclick={(e) => { e.preventDefault(); editingId = null; }}>Cancel</button>
                </form>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
    </div>
  </section>

  <section class="card min-w-0">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-semibold">Income Categories</h2>
      <button class="btn btn-secondary btn-sm" onclick={() => (openIncome = !openIncome)}>{openIncome ? 'Close' : 'Add'}</button>
    </div>
    {#if openIncome}
      <form method="post" action="?/create" class="flex gap-2 mb-3">
        <input type="hidden" name="kind" value="income" />
        <input name="name" class="input flex-1" placeholder="New income category name" required />
        <button class="btn btn-primary">Save</button>
      </form>
    {/if}
    <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Active</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each data.incomeCategories as c}
          <tr>
            <td>{c.name}</td>
            <td><Badge tone={c.active ? 'gain' : 'neutral'}>{c.active ? 'Active' : 'Inactive'}</Badge></td>
            <td><div class="flex items-center gap-1.5">
              <form method="post" action="?/toggle" class="inline">
                <input type="hidden" name="id" value={c.id} />
                <button class="btn btn-secondary btn-sm">{c.active ? 'Deactivate' : 'Activate'}</button>
              </form>
              <button class="icon-btn" title="Edit" aria-label="Edit" onclick={() => (editingId = editingId === c.id ? null : c.id)}><Icon name="edit" /></button>
            </div></td>
          </tr>
          {#if editingId === c.id}
            <tr class="edit-row">
              <td colspan="3">
                <form method="post" action="?/update" class="flex gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" class="input flex-1" value={c.name} required />
                  <button class="btn btn-primary">Save</button>
                  <button class="btn btn-secondary" onclick={(e) => { e.preventDefault(); editingId = null; }}>Cancel</button>
                </form>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
    </div>
  </section>
</div>
