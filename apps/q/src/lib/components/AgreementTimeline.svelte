<script lang="ts">
	/*
	 * An agreement's steps (the Workhouse demonstrator's record of every offer,
	 * counter and acceptance), drawn by the exchange set's timeline (ADR-Q-029):
	 * this file says only how an agreement's steps are said, and their colours.
	 */
	import { sayStep, type AgreementReceipt, type Terms } from '@inqbeta/q-core/agreements';
	import type { Ledger } from '$lib/ledger';
	import type { Names } from '$lib/receipt-read';
	import ExchangeTimeline, { type TimelineStep } from './exchange/ExchangeTimeline.svelte';

	let { steps, terms, me, names, ledger, head }: { steps: AgreementReceipt[]; terms: Terms | null; me: string; names: Names; ledger: Ledger | null; head?: string } = $props();

	const nameOf = (d: string) => names.nameOf(d) ?? 'Someone';
	const TONE: Record<string, TimelineStep['tone']> = { proposed: 'offer', countered: 'offer', agreed: 'agreed', taken: 'agreed', done: 'agreed', settled: 'settled', declined: 'ended', withdrawn: 'ended' };
	const shown = $derived(
		steps.map((s) => ({
			contentHash: s.contentHash,
			content: { parent: s.content.parent, at: s.content.at },
			text: sayStep(s, me, nameOf, s.content.terms ?? terms),
			...(s.content.note ? { note: s.content.note } : {}),
			tone: TONE[s.content.step] ?? 'ended'
		}))
	);
</script>

<ExchangeTimeline steps={shown} {head} {names} {ledger} />
