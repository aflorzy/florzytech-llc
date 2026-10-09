<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { figures, scenarios } from '$lib/guide';
</script>

<PageHeader title="Guide" subtitle="How to record each kind of job, and how the figures are worked out. This describes what the app does today." />

<div class="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
  <nav aria-label="Guide contents" class="card text-sm lg:sticky lg:top-8">
    <div class="mb-1 text-xs font-medium text-muted">Scenarios</div>
    <ul class="mb-4 space-y-1">
      {#each scenarios as s}
        <li><a class="link" href={`#${s.id}`}>{s.title}</a></li>
      {/each}
    </ul>
    <div class="mb-1 text-xs font-medium text-muted">Figures</div>
    <ul class="space-y-1">
      {#each figures as f}
        <li><a class="link" href={`#${f.id}`}>{f.name}</a></li>
      {/each}
    </ul>
  </nav>

  <div class="min-w-0 space-y-10">
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Scenarios</h2>
      {#each scenarios as s}
        <article id={s.id} class="card scroll-mt-8">
          <h3 class="card-title mb-1">{s.title}</h3>
          <p class="mb-4 text-sm text-muted">{s.when}</p>

          <ol class="mb-4 space-y-2 text-sm">
            {#each s.steps as step, i}
              <li class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
                <span class="figure text-muted">{i + 1}</span>
                <span>
                  {#if step.href}<a class="link font-medium" href={step.href}>{step.where}</a>{:else}<span class="font-medium">{step.where}</span>{/if}<span class="text-muted">:</span>
                  {step.action}
                </span>
              </li>
            {/each}
          </ol>

          <h4 class="mb-1 text-sm font-semibold">What the numbers do</h4>
          <ul class="list-disc space-y-1 pl-5 text-sm">
            {#each s.numbers as n}
              <li>{n}</li>
            {/each}
          </ul>

          {#if s.watchOut && s.watchOut.length > 0}
            <h4 class="mb-1 mt-4 text-sm font-semibold">Watch out</h4>
            <ul class="list-disc space-y-1 pl-5 text-sm">
              {#each s.watchOut as w}
                <li>{w}</li>
              {/each}
            </ul>
          {/if}
        </article>
      {/each}
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">How the figures are worked out</h2>
      {#each figures as f}
        <article id={f.id} class="card scroll-mt-8">
          <h3 class="card-title mb-1">{f.name}</h3>
          <p class="mb-3 text-sm text-muted">Shown on: {f.where}</p>
          <p class="total-box mb-4 text-sm font-medium">{f.formula}</p>
          <ul class="list-disc space-y-1 pl-5 text-sm">
            {#each f.notes as n}
              <li>{n}</li>
            {/each}
          </ul>
        </article>
      {/each}
    </section>
  </div>
</div>
