<script lang="ts">
  type Category = { id: string; name: string; active: boolean };
  type Data = { expenseCategories: Category[]; incomeCategories: Category[] };
  let { data } = $props<{ data: Data }>();

  let openExpense = $state(false);
  let openIncome = $state(false);
  let editingId = $state<string | null>(null);
</script>

<h1 class="text-2xl font-semibold mb-4">Categories</h1>
<p class="text-sm text-zinc-600 dark:text-zinc-300 mb-4">Manage categories for expenses and income.</p>

<div class="grid gap-6 md:grid-cols-2">
  <section class="border rounded p-4">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-semibold">Expense Categories</h2>
      <button class="px-3 py-1 rounded bg-blue-600 text-white" onclick={() => (openExpense = !openExpense)}>{openExpense ? 'Close' : 'Add'}</button>
    </div>
    {#if openExpense}
      <form method="post" action="?/create" class="flex gap-2 mb-3">
        <input type="hidden" name="kind" value="expense" />
        <input name="name" class="flex-1 px-3 py-2 border rounded bg-white dark:bg-zinc-900" placeholder="New expense category name" required />
        <button class="px-3 py-2 rounded bg-green-600 text-white">Save</button>
      </form>
    {/if}
    <table class="w-full text-sm border divide-y">
      <thead>
        <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
          <th class="p-2">Name</th>
          <th class="p-2">Active</th>
          <th class="p-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each data.expenseCategories as c}
          <tr class="divide-x">
            <td class="p-2">{c.name}</td>
            <td class="p-2">{c.active ? 'Yes' : 'No'}</td>
            <td class="p-2">
              <form method="post" action="?/toggle" class="inline">
                <input type="hidden" name="id" value={c.id} />
                <button class="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700">{c.active ? 'Deactivate' : 'Activate'}</button>
              </form>
              <button class="ml-2 px-2 py-1 rounded bg-yellow-600 text-white" onclick={() => (editingId = editingId === c.id ? null : c.id)}>Edit</button>
            </td>
          </tr>
          {#if editingId === c.id}
            <tr class="bg-zinc-50/50 dark:bg-zinc-800/30">
              <td colspan="3" class="p-3">
                <form method="post" action="?/update" class="flex gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" class="flex-1 px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.name} required />
                  <button class="px-3 py-2 rounded bg-green-600 text-white">Save</button>
                  <button class="px-3 py-2 rounded bg-zinc-300 dark:bg-zinc-700" onclick={(e) => { e.preventDefault(); editingId = null; }}>Cancel</button>
                </form>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </section>

  <section class="border rounded p-4">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-semibold">Income Categories</h2>
      <button class="px-3 py-1 rounded bg-blue-600 text-white" onclick={() => (openIncome = !openIncome)}>{openIncome ? 'Close' : 'Add'}</button>
    </div>
    {#if openIncome}
      <form method="post" action="?/create" class="flex gap-2 mb-3">
        <input type="hidden" name="kind" value="income" />
        <input name="name" class="flex-1 px-3 py-2 border rounded bg-white dark:bg-zinc-900" placeholder="New income category name" required />
        <button class="px-3 py-2 rounded bg-green-600 text-white">Save</button>
      </form>
    {/if}
    <table class="w-full text-sm border divide-y">
      <thead>
        <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
          <th class="p-2">Name</th>
          <th class="p-2">Active</th>
          <th class="p-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each data.incomeCategories as c}
          <tr class="divide-x">
            <td class="p-2">{c.name}</td>
            <td class="p-2">{c.active ? 'Yes' : 'No'}</td>
            <td class="p-2">
              <form method="post" action="?/toggle" class="inline">
                <input type="hidden" name="id" value={c.id} />
                <button class="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700">{c.active ? 'Deactivate' : 'Activate'}</button>
              </form>
              <button class="ml-2 px-2 py-1 rounded bg-yellow-600 text-white" onclick={() => (editingId = editingId === c.id ? null : c.id)}>Edit</button>
            </td>
          </tr>
          {#if editingId === c.id}
            <tr class="bg-zinc-50/50 dark:bg-zinc-800/30">
              <td colspan="3" class="p-3">
                <form method="post" action="?/update" class="flex gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" class="flex-1 px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.name} required />
                  <button class="px-3 py-2 rounded bg-green-600 text-white">Save</button>
                  <button class="px-3 py-2 rounded bg-zinc-300 dark:bg-zinc-700" onclick={(e) => { e.preventDefault(); editingId = null; }}>Cancel</button>
                </form>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </section>
</div>
