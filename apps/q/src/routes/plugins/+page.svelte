<script lang="ts">
	/*
	 * Installed plugins (3 October 2026): what this copy of Q can do beyond its
	 * core. Federations and the Market are plugins; so are Publishing and
	 * DoStudy. Drawn from the same list as the menu (lib/nav.ts), so the two
	 * never disagree.
	 */
	import { Page, Icon } from '@inqbeta/q-ui';
	import { INSTALLED } from '$lib/nav';
</script>

<svelte:head><title>Installed plugins — Q</title></svelte:head>

<Page title="Installed plugins" lead="What this Q can do beyond the core. Find more in the Marketplace.">
	<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden max-w-3xl">
		{#each INSTALLED as g (g.id)}
			<li class="flex items-center gap-4 p-4">
				<span class="size-11 shrink-0 rounded-base preset-tonal-primary flex items-center justify-center"><Icon name={g.icon} /></span>
				<span class="flex-1 min-w-0">
					<span class="block font-semibold">{g.label}</span>
					<span class="block text-sm text-surface-700-300">{g.about}</span>
				</span>
				<a class="btn btn-sm preset-tonal min-h-11" href={g.links[0].href}>Open</a>
			</li>
		{/each}
	</ul>
	<a class="btn preset-filled-primary-500 mt-6 min-h-11" href="/marketplace"><Icon name="search" size={18} /> Find more plugins</a>
</Page>
