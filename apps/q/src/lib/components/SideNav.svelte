<script lang="ts">
	/*
	 * The side menu: sections, then plugins (lib/nav.ts).
	 *
	 * OPEN: every group is a heading that folds. The group you are in is open;
	 * the others stay as you left them.
	 * FOLDED: one icon per group. Click one and its pages open beside it; the
	 * group you are in is marked.
	 *
	 * Both choices are remembered in this browser — a convenience, so losing
	 * them costs nothing.
	 */
	import { page } from '$app/state';
	import { Icon } from '@inqbeta/q-ui';
	import { SECTIONS, PLUGIN_MANAGER, groupOf, isHere, isHereLink, type NavGroup, type NavLink } from '$lib/nav';
	import { plugins as mine, active } from '$lib/plugins.svelte';

	let { folded = $bindable(false) }: { folded?: boolean } = $props();

	const KEY = 'q-nav-open';
	let open = $state<Record<string, boolean>>({});
	let flyout = $state<string | null>(null);

	$effect(() => {
		try {
			open = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		} catch {
			open = {};
		}
	});

	const path = $derived(page.url.pathname);
	const current = $derived(groupOf(path));

	/* Arriving somewhere opens the group it is in. */
	$effect(() => {
		const g = current;
		if (g && !open[g.id]) open = { ...open, [g.id]: true };
	});
	/* Navigating closes a flyout. */
	$effect(() => {
		void path;
		flyout = null;
	});

	function toggle(g: NavGroup) {
		open = { ...open, [g.id]: !open[g.id] };
		try {
			localStorage.setItem(KEY, JSON.stringify(open));
		} catch {
			/* remembered for this visit only */
		}
	}

	const sections = SECTIONS;
	/* The plugins you switched on, in your order (the Installed page), then Plugins itself. */
	const plugins = $derived(active(mine.prefs));

	function outside(e: MouseEvent) {
		if (flyout && !(e.target as HTMLElement).closest('[data-nav-group]')) flyout = null;
	}
</script>

<svelte:window onclick={outside} onkeydown={(e) => e.key === 'Escape' && (flyout = null)} />

{#snippet link(l: NavLink)}
	<a
		href={l.href}
		aria-current={isHereLink(l, path) ? 'page' : undefined}
		class="flex items-center gap-3 rounded-base px-3 py-2 text-sm transition-colors hover:bg-surface-200-800 {isHereLink(l, path) ? 'preset-tonal-primary font-semibold' : ''}"
	>
		<Icon name={l.icon} class="size-4 shrink-0" />
		<span>{l.label}</span>
	</a>
{/snippet}

{#snippet group(g: NavGroup)}
	{#if folded}
		<div class="relative" data-nav-group>
			<button
				type="button"
				class="flex h-11 w-11 items-center justify-center rounded-container transition-colors hover:bg-surface-200-800 {current?.id === g.id ? 'preset-tonal-primary' : ''} {flyout === g.id ? 'bg-surface-200-800' : ''}"
				title={g.label}
				aria-label={g.label}
				aria-expanded={flyout === g.id}
				onclick={() => (flyout = flyout === g.id ? null : g.id)}
			>
				<Icon name={g.icon} class="size-5" />
			</button>
			{#if flyout === g.id}
				<div class="absolute left-full top-0 z-50 ml-2 w-60 rounded-container border border-surface-200-800 bg-surface-50-950 p-2 shadow-xl">
					<p class="px-3 pt-1 text-xs font-semibold uppercase tracking-wider opacity-60">{g.label}</p>
					<p class="px-3 pb-2 text-xs opacity-60">{g.about}</p>
					{#each g.links as l (l.href)}{@render link(l)}{/each}
				</div>
			{/if}
		</div>
	{:else}
		<div>
			<button
				type="button"
				class="flex w-full items-center gap-3 rounded-base px-3 py-2 text-left transition-colors hover:bg-surface-200-800 {current?.id === g.id ? 'text-primary-700-300' : ''}"
				aria-expanded={!!open[g.id]}
				onclick={() => toggle(g)}
			>
				<Icon name={g.icon} class="size-5 shrink-0" />
				<span class="flex-1 text-xs font-semibold uppercase tracking-wider">{g.label}</span>
				<span class="text-xs opacity-60 transition-transform {open[g.id] ? 'rotate-90' : ''}" aria-hidden="true">›</span>
			</button>
			{#if open[g.id]}
				<div class="ml-4 border-l border-surface-200-800 pl-2">
					{#each g.links as l (l.href)}{@render link(l)}{/each}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<nav
	aria-label="Q"
	class="relative z-30 hidden h-full flex-col border-r border-surface-200-800 md:flex {folded ? 'w-[4.25rem] items-center' : 'w-64'}"
>
	<div class="border-b border-surface-200-800 p-3 {folded ? '' : 'w-full'}">
		<button
			type="button"
			class="btn btn-sm preset-tonal flex w-full items-center justify-center gap-2"
			aria-label={folded ? 'Open the menu out' : 'Fold the menu to icons'}
			title={folded ? 'Open the menu out' : 'Fold the menu to icons'}
			onclick={() => (folded = !folded)}
		>
			<Icon name={folded ? 'expandRight' : 'expandLeft'} class="size-4" />
			{#if !folded}<span class="text-xs">Fold to icons</span>{/if}
		</button>
	</div>

	<!-- Folded, nothing scrolls, so a group's pages can open out beside it
	     rather than being clipped by the menu's own edge. -->
	<div class="flex-1 space-y-1 p-2 {folded ? 'flex flex-col items-center' : 'w-full overflow-y-auto'}">
		{#each sections as g (g.id)}{@render group(g)}{/each}
		<div class="my-2 {folded ? 'w-8' : 'mx-3'} border-t border-surface-200-800"></div>
		{#each plugins as g (g.id)}{@render group(g)}{/each}
		{@render group(PLUGIN_MANAGER)}
	</div>

	<div class="border-t border-surface-200-800 p-2 {folded ? '' : 'w-full'}">
		{#if folded}
			<a href="/settings" class="flex h-11 w-11 items-center justify-center rounded-container hover:bg-surface-200-800 {isHere('/settings', path) ? 'preset-tonal-primary' : ''}" title="Settings" aria-label="Settings">
				<Icon name="settings" class="size-5" />
			</a>
		{:else}
			{@render link({ href: '/settings', label: 'Settings', icon: 'settings' })}
		{/if}
	</div>
</nav>
