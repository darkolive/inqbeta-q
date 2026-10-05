<script lang="ts">
	/*
	 * Open it with your passkey (5 October 2026): on a receipt page, when the
	 * receipt is sealed and you haven't signed in, only this — a thumbprint at
	 * the top. Darren: "the least amount of interruption visually." Touch it,
	 * and the page opens by itself if the receipt is yours.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { keyPlace, unlock } from '@inqbeta/q-core/passkey';

	let working = $state(false);
	let says = $state('');
	async function open() {
		working = true;
		says = '';
		const out = await unlock(keyPlace());
		working = false;
		if (!out.ok) says = out.says ?? 'That passkey didn’t open it.';
	}
</script>

<div class="flex flex-col items-center gap-2 py-6">
	<button type="button" class="btn-icon size-20 rounded-full preset-tonal-primary" aria-label="Open with your passkey" title="Open with your passkey" disabled={working} onclick={() => void open()}>
		<Icon name="fingerprint" size={40} />
	</button>
	{#if says}<p class="text-sm text-error-600-400" role="alert">{says}</p>{/if}
</div>
