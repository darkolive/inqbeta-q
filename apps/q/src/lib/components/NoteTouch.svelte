<script lang="ts">
	/*
	 * The touch that notes where your vault is — asked for honestly.
	 *
	 * Darren, 29 September: the browser's passkey box said "Sign in" while he
	 * was signing OUT. That box belongs to the browser and cannot be reworded
	 * by any site (on purpose: otherwise a fake site could make it say
	 * anything). So Q says what is happening itself, BEFORE the box appears,
	 * and names the mismatch: "Your browser will call this 'Sign in' — it's the
	 * same touch." And the touch is a choice, not a surprise: Skip is always
	 * there, and what you were doing carries on either way.
	 *
	 * Used by: signing out, Leave No Trace, Sync now. The backup box has the
	 * same step built in.
	 */
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { t, type Key } from '$lib/i18n/index.svelte';
	import { noteWhere } from '$lib/vault-pointer';
	import { pointerRead } from '@inqbeta/q-core/pointer';

	let {
		open = $bindable(false),
		title,
		also = [],
		onfinish
	}: {
		open?: boolean;
		/** The i18n key for what the person is doing, e.g. 'note.title.signout'. */
		title: Key;
		also?: string[];
		/** Called once, noted or not, when the person is done here. */
		onfinish: (noted: boolean) => void;
	} = $props();

	let stage = $state<'ask' | 'touching' | 'done' | 'failed'>('ask');
	let says = $state('');

	$effect(() => {
		if (open) {
			/* This passkey can't hold a note: don't ask for a touch that can't work. */
			if (pointerRead().carried === false) return finish(false);
			stage = 'ask';
			says = '';
		}
	});

	function finish(noted: boolean) {
		open = false;
		onfinish(noted);
	}

	async function touch() {
		stage = 'touching';
		const n = await noteWhere(also);
		if (n.ok) {
			stage = 'done';
			/* Long enough to read the one line, then carry on. */
			setTimeout(() => finish(true), 1200);
		} else if (n.cancelled || n.unsupported) finish(false);
		else {
			stage = 'failed';
			says = n.says;
		}
	}
</script>

<Dialog {open} onOpenChange={(e) => !e.open && stage !== 'touching' && finish(stage === 'done')}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content class="card bg-surface-100-900 w-full max-w-md p-6 space-y-4 shadow-xl">
				<div class="flex items-center gap-3">
					<Icon name="fingerprint" class="size-7 text-primary-600-400" stroke={2} />
					<Dialog.Title class="h4">{t(title)}</Dialog.Title>
				</div>
				{#if stage === 'done'}
					<Dialog.Description role="status">{t('note.done')}</Dialog.Description>
				{:else if stage === 'failed'}
					<Dialog.Description role="alert">{says}</Dialog.Description>
					<footer class="flex justify-end">
						<button type="button" class="btn preset-filled-primary-500" onclick={() => finish(false)}>{t('note.continue')}</button>
					</footer>
				{:else}
					<Dialog.Description>{t('note.why')}</Dialog.Description>
					<p class="text-sm text-surface-700-300">{t('note.browser')}</p>
					{#if stage === 'touching'}<p class="text-sm font-semibold" aria-live="polite">{t('note.waiting')}</p>{/if}
					<footer class="flex justify-end gap-3">
						<button type="button" class="btn preset-tonal" disabled={stage === 'touching'} onclick={() => finish(false)}>{t('note.skip')}</button>
						<button type="button" class="btn preset-filled-primary-500" disabled={stage === 'touching'} onclick={() => void touch()}>
							<Icon name="fingerprint" size={20} stroke={2.5} /><span>{t('note.touch')}</span>
						</button>
					</footer>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
