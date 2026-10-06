<script lang="ts">
  // GET form that filters a ledger page by ?from=&to=. `clearHref` is the unfiltered page.
  let { from, to, clearHref } = $props<{ from: string | null; to: string | null; clearHref: string }>();
</script>

<form method="get" class="mb-5 flex flex-wrap items-end gap-3">
  <div>
    <label class="label" for="from">From</label>
    <input id="from" name="from" type="date" class="input" value={from || ''} />
  </div>
  <div>
    <label class="label" for="to">To</label>
    <input id="to" name="to" type="date" class="input" value={to || ''} />
  </div>
  <button class="btn btn-secondary" type="submit">Apply</button>
  {#if from || to}
    <a class="btn btn-ghost" href={clearHref}>Clear</a>
  {/if}
</form>
