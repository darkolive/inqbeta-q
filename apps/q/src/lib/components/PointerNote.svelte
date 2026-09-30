<script lang="ts">
	/*
	 * What your passkey said about your vault, straight after signing in.
	 *
	 * Read at the same touch as the sign-in, with no network (q-core/pointer.ts,
	 * ADR-Q-012). Says three things at most: when and where the vault was last
	 * noted, where copies went, and whether THIS copy matches — so a person
	 * opening Q somewhere new knows at once whether to fetch the newer one first.
	 * Says nothing when there is no note.
	 */
	import { watchPointer, comparePointer, type PointerRead } from '@inqbeta/q-core/pointer';
	import { vaultHead, watchFolder } from '@inqbeta/q-core/folder';
	import { Icon } from '@inqbeta/q-ui';

	let read = $state<PointerRead>({ pointer: null, carried: null });
	let here = $state<{ head: string; files: number; lastChange: number } | null>(null);

	$effect(() => watchPointer((r) => (read = r)));
	$effect(() =>
		watchFolder((s) => {
			if (s.kind === 'ready') void vaultHead().then((h) => (here = h)).catch(() => {});
		})
	);

	const p = $derived(read.pointer);
	const state = $derived(here ? comparePointer(p, here) : 'none');
	const when = $derived(
		p ? new Date(p.at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
	);
</script>

{#if p}
	<div
		class="card p-4 flex items-start gap-3 {state === 'behind' ? 'preset-tonal-warning' : 'preset-tonal'}"
		role="status"
		aria-live="polite"
	>
		<Icon name="key" class="size-6 shrink-0 {state === 'behind' ? 'text-warning-500' : 'text-primary-600-400'}" stroke={2} />
		<div class="text-sm space-y-1">
			<p class="font-semibold">
				Your passkey noted your vault {when}, from {p.from}{p.copies.length ? ` — copies in ${p.copies.join(', ')}` : ''}.
			</p>
			{#if state === 'same'}
				<p>This copy is that one: the same {p.files} files.</p>
			{:else if state === 'behind'}
				<p>
					This copy is behind it. The newer one is {p.copies.length ? `in ${p.copies.join(' or ')}` : `on ${p.from}`} —
					open that first, so nothing is worked on twice.
				</p>
			{:else if state === 'ahead'}
				<p>This copy has changes since then. Sync or sign out to note them.</p>
			{/if}
		</div>
	</div>
{/if}
