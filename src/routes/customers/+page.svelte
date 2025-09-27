<script lang="ts">
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

<h1 class="text-2xl font-semibold mb-4">Customers</h1>

<button class="btn mb-4 px-3 py-2 rounded bg-blue-600 text-white" onclick={() => (formOpen = !formOpen)}>
  {formOpen ? 'Close' : 'Add Customer'}
</button>

{#if formOpen}
  <form method="post" action="?/create" class="grid gap-3 md:grid-cols-3 p-4 border rounded mb-6">
    <div>
      <label class="block text-sm" for="name">Name</label>
      <input id="name" name="name" required class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="email">Email</label>
      <input id="email" name="email" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="phone">Phone</label>
      <input id="phone" name="phone" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="addressLine1">Address Line 1</label>
      <input id="addressLine1" name="addressLine1" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="addressLine2">Address Line 2</label>
      <input id="addressLine2" name="addressLine2" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="city">City</label>
      <input id="city" name="city" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="state">State</label>
      <input id="state" name="state" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div>
      <label class="block text-sm" for="postalCode">Postal Code</label>
      <input id="postalCode" name="postalCode" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" />
    </div>
    <div class="md:col-span-3">
      <label class="block text-sm" for="notes">Notes</label>
      <textarea id="notes" name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900"></textarea>
    </div>
    <div class="md:col-span-3">
      <button type="submit" class="px-3 py-2 rounded bg-green-600 text-white">Save Customer</button>
    </div>
  </form>
{/if}

<table class="w-full text-sm border divide-y">
  <thead>
    <tr class="text-left bg-zinc-50 dark:bg-zinc-800">
      <th class="p-2">Name</th>
      <th class="p-2">Email</th>
      <th class="p-2">Phone</th>
      <th class="p-2">City</th>
      <th class="p-2">State</th>
      <th class="p-2">Actions</th>
    </tr>
  </thead>
  <tbody>
    {#each data.customers as c}
      <tr class="divide-x">
        <td class="p-2">{c.name}</td>
        <td class="p-2">{c.email || '-'}</td>
        <td class="p-2">{c.phone || '-'}</td>
        <td class="p-2">{c.city || '-'}</td>
        <td class="p-2">{c.state || '-'}</td>
        <td class="p-2">
          <div class="flex items-center gap-2">
            <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-yellow-600 text-white hover:opacity-90" title="Edit" aria-label="Edit" onclick={() => (editingId = c.id)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4"><path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 2.121l-1.06 1.06-2.122-2.12 1.061-1.06ZM14.68 5.669 4.5 15.85V19.5h3.65L18.33 9.319l-3.65-3.65Z"/></svg>
            </button>
            <form method="post" action="?/delete" class="inline" onsubmit={(e) => { if (!confirm('Archive this customer?')) { e.preventDefault(); } }}>
              <input type="hidden" name="id" value={c.id} />
              <button class="h-8 w-8 inline-flex items-center justify-center rounded bg-orange-600 text-white hover:opacity-90" title="Archive" aria-label="Archive">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V7Zm1 4h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Zm5 2v2h6v-2H9Z"/></svg>
              </button>
            </form>
          </div>
        </td>
      </tr>
      {#if editingId === c.id}
        <tr class="bg-zinc-50/50 dark:bg-zinc-800/30">
          <td colspan="6" class="p-3">
            <form method="post" action="?/update" class="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={c.id} />
              <div>
                <label class="block text-sm" for={`name-${c.id}`}>Name</label>
                <input id={`name-${c.id}`} name="name" required class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.name} />
              </div>
              <div>
                <label class="block text-sm" for={`email-${c.id}`}>Email</label>
                <input id={`email-${c.id}`} name="email" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.email || ''} />
              </div>
              <div>
                <label class="block text-sm" for={`phone-${c.id}`}>Phone</label>
                <input id={`phone-${c.id}`} name="phone" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.phone || ''} />
              </div>
              <div>
                <label class="block text-sm" for={`addressLine1-${c.id}`}>Address Line 1</label>
                <input id={`addressLine1-${c.id}`} name="addressLine1" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.addressLine1 || ''} />
              </div>
              <div>
                <label class="block text-sm" for={`addressLine2-${c.id}`}>Address Line 2</label>
                <input id={`addressLine2-${c.id}`} name="addressLine2" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.addressLine2 || ''} />
              </div>
              <div>
                <label class="block text-sm" for={`city-${c.id}`}>City</label>
                <input id={`city-${c.id}`} name="city" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.city || ''} />
              </div>
              <div>
                <label class="block text-sm" for={`state-${c.id}`}>State</label>
                <input id={`state-${c.id}`} name="state" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.state || ''} />
              </div>
              <div>
                <label class="block text-sm" for={`postalCode-${c.id}`}>Postal Code</label>
                <input id={`postalCode-${c.id}`} name="postalCode" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900" value={c.postalCode || ''} />
              </div>
              <div class="md:col-span-3">
                <label class="block text-sm" for={`notes-${c.id}`}>Notes</label>
                <textarea id={`notes-${c.id}`} name="notes" class="w-full px-3 py-2 border rounded bg-white dark:bg-zinc-900">{c.notes || ''}</textarea>
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
