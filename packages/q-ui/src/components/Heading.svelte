<script lang="ts">
	/*
	 * A heading that knows what it IS (role → look) and where it SITS
	 * (outline → h1–h6). See ../styles/roles.css and ../levels.ts.
	 */
	import type { Snippet } from 'svelte';
	import { ROLES, type HeadingRole } from '../roles';
	import { currentLevel } from '../levels';

	let {
		role = 'title',
		level,
		id,
		class: klass = '',
		children
	}: { role?: HeadingRole; level?: number; id?: string; class?: string; children: Snippet } = $props();

	const inherited = currentLevel();
	const tag = $derived(`h${Math.min(6, Math.max(1, level ?? inherited))}`);
</script>

<svelte:element this={tag} {id} class="{ROLES[role].className} {klass}" data-role={role}>
	{@render children()}
</svelte:element>
