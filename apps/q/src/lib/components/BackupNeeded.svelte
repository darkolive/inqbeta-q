<script lang="ts">
	/*
	 * The backup nudge — a vault icon that appears only when it is needed.
	 *
	 * Darren, 29 September: "if nothing has been backed up after five minutes,
	 * then show … if Google Drive is syncing every five minutes, then it won't
	 * appear. So it's not any noise you need to think about."
	 *
	 * So it stays away while everything is carried. Auto-sync (lib/autosync)
	 * brings every copy location level every five minutes, and a sync that
	 * holds everything counts as a backup — which resets the clock. The icon
	 * shows only when there is something new AND five minutes have passed
	 * with it not carried anywhere: no copy location, a copy location asleep,
	 * or offline. In the warning colour; it pulses gently (still, for anyone who asked for less
	 * motion). Pressing it ASKS first, in a Skeleton Dialog — a download can
 * happen without anyone noticing, so it says plainly where the copy is going
 * (your Downloads) and waits for a yes; then it says it is done, and where.
	 *
	 * Only where the vault lives in the browser — a folder on disk is already
	 * somewhere of its own.
	 */
	import { backupNow, unexported, watchBackup, watchFolder } from '@inqbeta/q-core/folder';
	import { watch } from '@inqbeta/q-core/passkey';
	import { Icon } from '@inqbeta/q-ui';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { watchLedger } from '$lib/ledger';
	import { t } from '$lib/i18n/index.svelte';
	import { noteWhere } from '$lib/vault-pointer';

	const WAIT_MS = 5 * 60 * 1000;

	let inBrowser = $state(false);
	let signedIn = $state(false);
	/** When the vault was last carried somewhere: Back up now, or a sync that holds everything. */
	let at = $state(0);
	/** How many files are not in any backup yet, and since when we have known. */
	let waiting = $state(0);
	let since = $state(0);
	let now = $state(Date.now());
	let working = $state(false);
	let says = $state('');
	/** The dialog: asking, then saying what happened. */
	let asking = $state(false);
	let saved = $state<string | null>(null);
	/** Noting where the copy is on the passkey, straight after (ADR-Q-012). */
	let noting = $state(false);
	let noted = $state<string | null>(null);
	let also: string[] = [];

	/* Asked, not sprung: the browser's box will say "Sign in", and Q says so first. */
	async function note() {
		noting = true;
		const n = await noteWhere(also);
		noting = false;
		/* A passkey that can't hold a note isn't news after a backup: say nothing. */
		noted = n.ok ? t('note.done') : n.cancelled || n.unsupported ? null : n.says;
	}

	function recount() {
		void unexported()
			.then((n) => {
				if (n > 0 && waiting === 0) since = Date.now();
				waiting = n;
			})
			.catch(() => {});
	}

	$effect(() => watchFolder((s) => (inBrowser = s.kind === 'ready' && !!s.inBrowser)));
	$effect(() => watch((id) => (signedIn = !!id)));
	$effect(() =>
		watchBackup((t0) => {
			at = t0;
			recount();
		})
	);
	$effect(() =>
		watchLedger((l) => {
			if (l.state === 'ready' || l.state === 'locked') recount();
		})
	);
	/* The clock the five minutes are measured on. */
	$effect(() => {
		const tick = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(tick);
	});

	const due = $derived(waiting > 0 && now - Math.max(at, since) >= WAIT_MS);

	function ask() {
		says = '';
		saved = null;
		noted = null;
		asking = true;
	}

	async function go() {
		working = true;
		says = '';
		const out = await backupNow();
		working = false;
		if (out.ok) {
			waiting = 0;
			saved = out.how === 'download' ? t('backup.ask.done').replace('{name}', out.name) : t('backup.ask.shared');
			/* Then OFFER one touch to note where this copy is (note()). */
			also = out.how === 'download' ? [t('backup.ask.downloads')] : [];
		} else if (out.cancelled) asking = false;
		else says = out.says;
	}
</script>

{#if inBrowser && signedIn && (due || working || asking)}
	<button
		type="button"
		class="btn py-0 relative text-warning-500 cursor-pointer
			focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500
			{working ? '' : 'motion-safe:animate-pulse'}"
		title={working ? t('backup.working') : t('backup.needed')}
		aria-label={working ? t('backup.working') : t('backup.needed')}
		disabled={working}
		onclick={ask}
	>
		<Icon name="database" class="size-7" stroke={2} />
	</button>
{/if}

<Dialog open={asking} onOpenChange={(e) => (asking = e.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content class="card bg-surface-100-900 w-full max-w-md p-6 space-y-4 shadow-xl">
				<div class="flex items-center gap-3">
					<Icon name="database" class="size-7 text-warning-500" stroke={2} />
					<Dialog.Title class="h4">{t('backup.ask.title')}</Dialog.Title>
				</div>
				{#if saved}
					<Dialog.Description role="status">{saved}</Dialog.Description>
					{#if noted}
						<p class="text-sm text-surface-700-300" aria-live="polite">{noted}</p>
						<footer class="flex justify-end">
							<button type="button" class="btn preset-filled-primary-500" onclick={() => (asking = false)}>{t('backup.ask.close')}</button>
						</footer>
					{:else}
						<p class="text-sm">{t('note.why')}</p>
						<p class="text-sm text-surface-700-300">{t('note.browser')}</p>
						{#if noting}<p class="text-sm font-semibold" aria-live="polite">{t('note.waiting')}</p>{/if}
						<footer class="flex justify-end gap-3">
							<button type="button" class="btn preset-tonal" disabled={noting} onclick={() => (asking = false)}>{t('note.skip')}</button>
							<button type="button" class="btn preset-filled-primary-500" disabled={noting} onclick={() => void note()}>
								<Icon name="fingerprint" size={20} stroke={2.5} /><span>{t('note.touch')}</span>
							</button>
						</footer>
					{/if}
				{:else}
					<Dialog.Description>{t('backup.ask.body')}</Dialog.Description>
					<!-- Visible, not only announced: a sighted person whose backup failed must see it. -->
					{#if says}<p class="card preset-tonal-error p-3 text-sm" role="alert">{says}</p>{/if}
					<footer class="flex justify-end gap-3">
						<button type="button" class="btn preset-tonal" disabled={working} onclick={() => (asking = false)}>{t('backup.ask.cancel')}</button>
						<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void go()}>
							{working ? t('backup.working') : t('backup.ask.go')}
						</button>
					</footer>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
