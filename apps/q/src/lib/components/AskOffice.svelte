<script lang="ts">
	/*
	 * Ask an office, not a person (ADR-Q-037): the question is sealed to
	 * whoever holds it now and waits on their desk. With nobody in the office,
	 * the caretaker answers: the link to them instead.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { askOffice } from '$lib/messages';
	import { refreshLedger } from '$lib/ledger';
	import { officeHref } from '$lib/office-post';
	import { hoursInWords, inHours, type OfficeHours } from '@inqbeta/q-core/offices';

	let { federation, office, called, of, holders = [], fallbackHref }: { federation: string; office: string; called: string; of: string; holders?: { holder: string; inbox: string; hours?: OfficeHours; officeKey?: string }[]; fallbackHref: string } = $props();

	/* Out of hours, said before sending: the message waits for them. */
	const outOfHours = $derived(!!holders.length && holders.every((h) => !inHours(h.hours)));

	let open = $state(false);
	let text = $state('');
	let busy = $state(false);
	let said = $state<{ good: boolean; text: string } | null>(null);
	async function send() {
		busy = true;
		said = null;
		const out = await askOffice(holders, { federation, office }, text);
		busy = false;
		said = out.ok ? { good: true, text: `${outOfHours ? 'Left' : 'Sent'} for the ${called.toLowerCase()} of ${of}. The answer comes to your messages.` } : { good: false, text: out.says };
		if (out.ok) {
			text = '';
			open = false;
			await refreshLedger();
		}
	}
</script>

<div class="flex flex-col items-end gap-1">
	{#if holders.length}
		<button type="button" class="btn preset-tonal-primary min-h-11" aria-expanded={open} onclick={() => (open = !open)}><Icon name="message" size={18} /> Ask the {called.toLowerCase()}</button>
	{:else}
		<a class="btn preset-tonal-primary min-h-11" href={fallbackHref}><Icon name="message" size={18} /> Ask the {called.toLowerCase()}</a>
	{/if}
	<span class="text-xs opacity-70">of {of}, whoever holds it now{holders.length ? '' : ' (the caretaker, until it’s filled)'}</span>
	{#if open}
		<div class="card preset-tonal-surface p-3 mt-2 w-full max-w-md flex flex-col gap-2">
			{#if outOfHours}<p class="card preset-tonal-warning p-2 text-sm">Out of hours. Their hours are {hoursInWords(holders[0].hours!)}. Leave your message: it’ll be waiting for them.</p>{/if}
			<p class="text-xs opacity-70">This goes to the office’s records: whoever holds the office, now or later, can read it.</p>
			<label class="label"><span class="label-text">Your question</span><textarea class="textarea" rows="3" bind:value={text}></textarea></label>
			<button type="button" class="btn preset-filled-primary-500 min-h-11 self-end" disabled={busy || !text.trim()} onclick={() => void send()}>{busy ? 'Sending…' : 'Send'}</button>
		</div>
	{/if}
	{#if said}<p class="text-sm card p-2 {said.good ? 'preset-tonal-success' : 'preset-tonal-error'}" aria-live="polite">{said.text}{#if said.good} <a class="anchor" href={officeHref({ federation, office })}>See the conversation</a>{/if}</p>{/if}
</div>
