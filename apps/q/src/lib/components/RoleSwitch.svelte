<script lang="ts">
	/*
	 * The role switch (ADR-Q-038): "Acting as: Me ⟷ Caretaker of Green Space".
	 * Turning it on says you're here for the federation, not for yourself;
	 * the page then shows what the office may do. Shown only where you hold
	 * an office; with none, the page says so once and nothing changes.
	 */
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { role, officeName } from '$lib/role.svelte';

	let { federation, name, offices }: { federation: string; name: string; offices: string[] } = $props();

	const office = $derived(offices[0] ?? '');
	const on = $derived(role.isActing(federation));
	const actingElsewhere = $derived(!!role.acting && role.acting.federation !== federation);
</script>

{#if office}
	<div class="card {on ? 'preset-filled-secondary-500' : 'preset-outlined-surface-200-800'} p-4 flex flex-wrap items-center gap-4">
		<Switch checked={on} onCheckedChange={(d) => (d.checked ? role.takeUp(federation, name, office) : role.setDown())}>
			<Switch.Control class="w-12 h-7"><Switch.Thumb /></Switch.Control>
			<Switch.Label class="sr-only">Acting as {officeName(office)} of {name}</Switch.Label>
			<Switch.HiddenInput />
		</Switch>
		<div class="flex-1 min-w-56">
			<p><span class="opacity-80">Acting as:</span> {on ? `${officeName(office)} of ${name}` : 'Me'}</p>
			<p class="text-sm {on ? '' : 'opacity-70'}">
				{#if on}
					You’re here for {name}, not for yourself. What you sign, you sign in its name, under the rules you agreed when you joined.
				{:else if actingElsewhere}
					You’re acting as {officeName(role.acting!.office)} of {role.acting!.name}. Turning this on sets that down first.
				{:else}
					You hold an office here: {officeName(office)}. Take it up to look after {name}; set it down to be just you.
				{/if}
			</p>
		</div>
	</div>
{/if}
