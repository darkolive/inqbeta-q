<script lang="ts">
	/* Text that knows what it IS. See ../styles/roles.css. */
	import type { Snippet } from 'svelte';
	import { ROLES, type TextRole } from '../roles';

	let {
		role = 'description',
		as = 'p',
		class: klass = '',
		children
	}: { role?: TextRole; as?: string; class?: string; children: Snippet } = $props();
</script>

<svelte:element this={as} class="{ROLES[role].className} {klass}" data-role={role}>
	{@render children()}
</svelte:element>
