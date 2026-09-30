<script lang="ts">
	/*
	 * Touch to carry on.
	 *
	 * The keys are never written down — they are rebuilt from the passkey and
	 * held for the life of the tab, so a reload loses them by design. The one
	 * thing kept is the public DID, which is enough to say who was here and
	 * offer the touch that brings the keys back.
	 *
	 * A browser will only ask for a passkey off a real press, so this cannot
	 * resume on its own, and should not: the touch is the gate.
	 */
	import { unlock, keyPlace, remembered } from '@inqbeta/q-core/passkey';
	import { Icon } from '@inqbeta/q-ui';

	let { did }: { did: string } = $props();

	let working = $state(false);
	let says = $state('');

	const short = $derived(did.length > 20 ? `${did.slice(0, 12)}…${did.slice(-6)}` : did);

	async function carryOn() {
		says = '';
		working = true;
		const out = await unlock(keyPlace());
		working = false;
		if (!out.ok) says = out.says;
	}
</script>

<div class="card preset-outlined-primary-500 mb-6 flex flex-wrap items-center gap-4 p-4">
	<span class="text-primary-600-400"><Icon name="fingerprint" size={24} /></span>
	<div class="min-w-48 flex-1">
		<p class="font-medium">Your keys are not in this tab yet</p>
		<p class="text-sm opacity-70">
			Signed in before as <span class="role-token text-xs">{short}</span>. Your keys are
			rebuilt from your passkey, never stored, so one touch brings them back.
		</p>
	</div>
	<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void carryOn()}>
		{working ? 'Waiting for your passkey…' : 'Touch to carry on'}
	</button>
	{#if says}
		<p class="w-full text-sm text-warning-700-300" aria-live="polite">{says}</p>
	{/if}
</div>
