<script lang="ts">
	/*
	 * Opening soon (ADR-Q-034 step 5): shown after sign-in to someone the
	 * door doesn't let in yet. Say it plainly, keep them in touch, and point
	 * them at the development site, where everything can be tried.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import BetaNews from './BetaNews.svelte';

	let { says }: { says: string } = $props();
</script>

<section class="card preset-outlined-primary-500 bg-surface-50-950 p-6 sm:p-8 max-w-2xl mx-auto flex flex-col gap-4" aria-labelledby="opening-soon">
	<p class="flex items-center gap-2 text-primary-700-300"><Icon name="lock" size={22} /> <span>Opening soon</span></p>
	<h1 id="opening-soon" class="h3">Q isn’t open to everyone yet</h1>
	<p>{says}</p>
	<p>You’re signed in, and your keys are yours, kept on this device. Nothing is lost by waiting: when Q opens, you carry straight on.</p>
	<div class="flex flex-wrap gap-2">
		<a class="btn preset-filled-primary-500 min-h-11" href="https://inqbeta.dev">Try the development site</a>
		<a class="btn preset-tonal min-h-11" href="/contact">Ask a question</a>
	</div>
	<p class="text-sm text-surface-700-300">The development site has everything working, for testing only. No real money moves there, and it can be wiped at any time.</p>
</section>
<div class="max-w-2xl mx-auto mt-6"><BetaNews /></div>
