<script lang="ts">
	/*
	 * "Back up now" — the one thing a browser-kept vault asks of anybody.
	 *
	 * Darren, 2026-09-23: "all it needs is a button saying backup now and that's
	 * it… everything else uninterrupted just works." So: shown only where the
	 * work lives in the browser, one tap, no dialog of our own. A dot says there
	 * is something new since the last one; the title says when that was.
	 */
	import { backupNow, unexported, watchBackup, watchFolder } from '@inqbeta/q-core/folder';
	import { watch } from '@inqbeta/q-core/passkey';
	import { watchLedger } from '$lib/ledger';

	let inBrowser = $state(false);
	let signedIn = $state(false);
	let at = $state(0);
	let waiting = $state(0);
	let working = $state(false);
	let done = $state(false);
	let says = $state('');

	$effect(() => watchFolder((s) => (inBrowser = s.kind === 'ready' && !!s.inBrowser)));
	$effect(() => watch((id) => (signedIn = !!id)));
	/* A channel that holds everything counts as a backup too (autosync), so
	 * recount whenever a backup is noted, not only when the ledger moves. */
	$effect(() =>
		watchBackup((t) => {
			at = t;
			void unexported().then((n) => (waiting = n)).catch(() => {});
		})
	);
	/* Recount when the ledger settles — it is already reading the folder, so
	 * this is a directory listing, not another pass over every file. */
	$effect(() =>
		watchLedger((l) => {
			if (l.state === 'ready' || l.state === 'locked') void unexported().then((n) => (waiting = n)).catch(() => {});
		})
	);

	const days = $derived(at ? Math.floor((Date.now() - at) / 86_400_000) : null);
	const title = $derived(
		days === null ? 'Not backed up yet' : days === 0 ? 'Last backed up today' : `Last backed up ${days} day${days === 1 ? '' : 's'} ago`
	);
	/* Quiet until it matters: a dot for anything new, colour only past five days. */
	const overdue = $derived(waiting > 0 && (days === null || days >= 5));

	async function go() {
		working = true;
		says = '';
		const out = await backupNow();
		working = false;
		if (out.ok) {
			waiting = 0;
			done = true;
			setTimeout(() => (done = false), 2500);
		} else if (!out.cancelled) says = out.says;
	}
</script>

{#if inBrowser && signedIn}
	<button
		type="button"
		{title}
		aria-label="Back up now. {title}{waiting ? `, ${waiting} new since` : ''}"
		disabled={working}
		onclick={() => void go()}
		class="relative btn btn-sm {overdue ? 'preset-filled-warning-500' : 'preset-outlined-surface-500'}"
	>
		{working ? 'Backing up…' : done ? 'Backed up' : 'Back up now'}
		{#if waiting > 0 && !done && !working}
			<span class="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary-500" aria-hidden="true"></span>
		{/if}
	</button>
	<!-- Visible, not only announced: a sighted person whose backup failed must see it (audit 2026-09-25). -->
	{#if says}<span class="text-xs text-error-600-400" role="alert">{says}</span>{/if}
{/if}
