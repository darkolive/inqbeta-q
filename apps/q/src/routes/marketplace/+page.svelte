<script lang="ts">
	/*
	 * The Marketplace (3 October 2026): where plugins are found. Not open yet.
	 * Plugins will be listed the way hosts are (ADR-Q-021, ADR-Q-019 §5): a
	 * signed listing, checked before it's installed.
	 */
	import { Page, Empty } from '@inqbeta/q-ui';
</script>

<svelte:head><title>Marketplace — Q</title></svelte:head>

<Page title="Marketplace" lead="Plugins that add to what Q can do.">
	<Empty
		icon="search"
		title="Opening soon"
		description="Plugins made by others will be listed here, each one signed by its maker and checked before you add it. Until then, see what you already have under Installed."
	/>
	<a class="btn preset-tonal mt-4 min-h-11" href="/plugins">See installed plugins</a>
</Page>
