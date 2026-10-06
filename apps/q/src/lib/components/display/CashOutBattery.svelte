<script lang="ts">
	/*
	 * What you can cash out, as the battery (5 October 2026), Q's health
	 * indicator from @inqbeta/q-ui. Darren: "make the battery cells full when
	 * it is twice whatever committed is. And it is empty when it equals
	 * committed. So you can never spend or take out more than that amount."
	 *
	 * What's committed to agreements not yet settled isn't charge you can
	 * use. Holding exactly that is empty; holding twice it is full. With
	 * nothing committed, any credit free is full.
	 */
	import { Battery, enoughLevel } from '@inqbeta/q-ui';

	interface Props {
		/** Credits you hold and haven't already asked to cash out. */
		held: number;
		/** Credits committed to agreements not yet settled. */
		committed: number;
		/** The mint's currency: one credit cashes out for one unit of it. */
		currency: string;
		/** Just the battery, small, for a dashboard; the words become its tooltip. */
		compact?: boolean;
	}
	let { held, committed, currency, compact = false }: Props = $props();

	/* Below a quarter: running low. */
	const LOW = 0.25;

	const free = $derived(Math.max(0, held - committed));
	const locked = $derived(Math.min(held, committed));
	const level = $derived(enoughLevel(held, committed));

	const count = (n: number) => Math.round(n).toLocaleString('en-GB');
	const credits = (n: number) => `${count(n)} credit${Math.round(n) === 1 ? '' : 's'}`;
	/* Credits as money: one credit is one unit of the currency, so whole credits need no pence. */
	const plain = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(n) ? 0 : undefined }).format(n);
	/* What full means, said once, plainly. */
	const full = $derived(committed > 0 ? ` ${level >= 1 ? 'That’s enough. ' : ''}Full is holding twice what’s committed: ${credits(committed * 2)}.` : '');
	const lockedSays = $derived(locked ? ` ${credits(locked)} ${locked === 1 ? 'is' : 'are'} committed to agreements, so ${locked === 1 ? 'it stays' : 'they stay'} put.` : '');
	const why = $derived(
		held <= 0
			? 'Empty: you don’t hold any credits, so there’s nothing to cash out.'
			: !free
				? `Empty: all ${credits(held)} you hold ${held === 1 ? 'is' : 'are'} committed to agreements. Settle or end one, or get more credits, to charge it back up.${full}`
				: `${level >= 1 ? 'Full: ' : level < LOW ? 'Running low: ' : ''}${credits(free)} free to cash out, ${plain(free)}.${lockedSays}${full}`
	);
</script>

{#if compact}
	<Battery {level} says={why} size="sm" present={held > 0} />
{:else}
	<figure class="flex flex-col gap-3">
		<div class="flex items-center gap-4 flex-wrap">
			<Battery {level} says={why} present={held > 0} />
			<!-- the answer, big -->
			<div>
				<p class="h3 tabular-nums">{plain(free)}</p>
				<p class="text-sm text-surface-700-300">{free ? 'you can cash out' : 'nothing to cash out'}</p>
			</div>
		</div>
		<p class="text-sm">{why}</p>
	</figure>
{/if}
