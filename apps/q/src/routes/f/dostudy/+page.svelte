<script lang="ts">
	/*
	 * DoStudy's screen in Q: course evidence. Each course is an Item — its title
	 * is a `title` (Skeleton h5), its aim is a `description`, the small print is
	 * `meta` — so every course reads the same way, to the eye and out loud.
	 */
	import { Page, Section, Item, Status, Empty } from '@inqbeta/q-ui';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	const found = $derived(ledger ? newestPerKey(ledger.found.filter((f) => f.feature === 'dostudy')) : []);
	const courses = $derived(found.filter((f) => f.kind === 'course'));
	const reads = $derived(found.filter((f) => f.kind === 'read'));
	const notes = $derived(found.filter((f) => f.kind === 'note'));
</script>

<svelte:head><title>Courses — Q</title></svelte:head>

<Page title="Courses" lead="DoStudy's evidence: every course you have named, changed or sent, and what people said about them.">
	{#snippet actions()}
		<button type="button" class="btn preset-outlined-surface-500" onclick={() => void refreshLedger()}>Look again</button>
	{/snippet}

	{#if !identity}
		<Empty icon="lock" title="Locked" description="Sign in to see your courses." />
	{:else if ledger?.state === 'no-folder'}
		<Empty icon="files" title="No folder yet" description="Choose your folder on the Files page; courses saved from DoStudy appear here." />
	{:else}
		<Section title="Courses" description={`${courses.length} found`}>
			{#if !courses.length}
				<Empty icon="courses" title="No courses yet" description="Put your name to a course in DoStudy and save it to your folder." />
			{:else}
				<div class="stack-tight">
					{#each courses as c (c.key)}
						<Item icon="courses" title={c.title} description={c.description} meta={c.meta}>
							{#snippet status()}{#if c.status}<Status tone={c.status.tone}>{c.status.text}</Status>{/if}{/snippet}
						</Item>
					{/each}
				</div>
			{/if}
		</Section>

		{#if reads.length}
			<Section title="Reads" description="What colleagues and reviewers said.">
				<div class="stack-tight">
					{#each reads as r (r.key)}
						<Item icon="file" title={r.title} meta={r.meta} />
					{/each}
				</div>
			</Section>
		{/if}

		{#if notes.length}
			<Section title="Sealed notes">
				<div class="stack-tight">
					{#each notes as n (n.key)}
						<Item icon="lock" title={n.title} description={n.description} meta={n.meta}>
							{#snippet status()}<Status tone="plain">Sealed</Status>{/snippet}
						</Item>
					{/each}
				</div>
			</Section>
		{/if}
	{/if}
</Page>
