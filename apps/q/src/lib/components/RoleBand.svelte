<script lang="ts">
	/*
	 * The band across every page while you're in role (ADR-Q-038 §3), so you
	 * never forget which hat you're wearing.
	 */
	import { role, officeName } from '$lib/role.svelte';
	const a = $derived(role.acting);
</script>

{#if a}
	<div class="sticky top-0 z-30 preset-filled-secondary-500 px-4 py-2 flex flex-wrap items-center gap-3 text-sm" role="status">
		<span>Acting as <a class="anchor text-inherit" href="/federations/one?id={encodeURIComponent(a.federation)}">{officeName(a.office)} of {a.name}</a>{a.interest ? ' · interest declared' : ' · no conflict declared'}</span>
		<button type="button" class="btn btn-sm preset-tonal ml-auto" onclick={() => void role.setDown()}>Set it down</button>
	</div>
{/if}
