<script lang="ts">
	/*
	 * Installed plugins (3 October 2026). Switch one off and it leaves the menu;
	 * switch it on and it comes back. Drag to set the order the menu shows them
	 * in (or use the arrows: the same thing, for keyboards). Kept with your
	 * settings, in this browser and your vault.
	 */
	import { Page, Icon, Status } from '@inqbeta/q-ui';
	import { plugins, ordered, setOn, setOrder, move } from '$lib/plugins.svelte';

	const list = $derived(ordered(plugins.prefs));
	const isOn = (id: string) => !plugins.prefs.off.includes(id);

	let dragging = $state<string | null>(null);
	let over = $state<string | null>(null);
	function drop(target: string) {
		if (!dragging || dragging === target) return;
		const ids = list.map((g) => g.id).filter((id) => id !== dragging);
		ids.splice(ids.indexOf(target), 0, dragging);
		setOrder(ids);
		dragging = over = null;
	}
</script>

<svelte:head><title>Installed plugins — Q</title></svelte:head>

<Page title="Installed plugins" lead="Switch a plugin off and it leaves your menu. Drag them into the order you want them in your menu.">
	<ul class="card preset-outlined-surface-200-800 bg-surface-50-950 divide-y divide-surface-200-800 overflow-hidden max-w-3xl" aria-label="Installed plugins, in menu order">
		{#each list as g, i (g.id)}
			<li
				class="flex items-center gap-3 p-4 transition-colors {over === g.id && dragging !== g.id ? 'bg-primary-50-950' : ''} {dragging === g.id ? 'opacity-50' : ''}"
				draggable="true"
				ondragstart={(e) => {
					dragging = g.id;
					e.dataTransfer?.setData('text/plain', g.id);
				}}
				ondragover={(e) => {
					e.preventDefault();
					over = g.id;
				}}
				ondragleave={() => over === g.id && (over = null)}
				ondrop={(e) => {
					e.preventDefault();
					drop(g.id);
				}}
				ondragend={() => (dragging = over = null)}
			>
				<span class="cursor-grab text-surface-500 select-none" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
				<span class="size-11 shrink-0 rounded-base preset-tonal-primary flex items-center justify-center {isOn(g.id) ? '' : 'opacity-50'}"><Icon name={g.icon} /></span>
				<span class="flex-1 min-w-0">
					<span class="flex items-center gap-2 font-semibold">{g.label} {#if !isOn(g.id)}<Status tone="plain">Off</Status>{/if}</span>
					<span class="block text-sm text-surface-700-300">{g.about}</span>
				</span>
				<span class="flex flex-col">
					<button type="button" class="btn-icon btn-icon-sm preset-tonal" aria-label="Move {g.label} up" disabled={i === 0} onclick={() => move(g.id, -1)}><Icon name="chevronDown" size={16} class="rotate-180" /></button>
					<button type="button" class="btn-icon btn-icon-sm preset-tonal mt-1" aria-label="Move {g.label} down" disabled={i === list.length - 1} onclick={() => move(g.id, 1)}><Icon name="chevronDown" size={16} /></button>
				</span>
				<div class="flex gap-1" role="radiogroup" aria-label="{g.label} in your menu">
					<button type="button" role="radio" aria-checked={isOn(g.id)} class="btn btn-sm min-h-11 {isOn(g.id) ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => setOn(g.id, true)}>On</button>
					<button type="button" role="radio" aria-checked={!isOn(g.id)} class="btn btn-sm min-h-11 {!isOn(g.id) ? 'preset-filled-surface-500' : 'preset-tonal'}" onclick={() => setOn(g.id, false)}>Off</button>
				</div>
				{#if isOn(g.id)}<a class="btn btn-sm preset-tonal min-h-11 hidden sm:inline-flex" href={g.links[0].href}>Open</a>{/if}
			</li>
		{/each}
	</ul>
	<a class="btn preset-filled-primary-500 mt-6 min-h-11" href="/marketplace"><Icon name="search" size={18} /> Find more plugins</a>
</Page>
