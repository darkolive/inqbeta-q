<script lang="ts">
	/* Sets the heading level for what is inside it. See q-ui/levels.ts. */
	import type { Snippet } from 'svelte';
	import { provideLevel } from '@inqbeta/q-ui';

	let { n, children }: { n: number; children: Snippet } = $props();
	/* Context is set once, when the component is made — which is what a level is. */
	// svelte-ignore state_referenced_locally
	provideLevel(n);
</script>

{@render children()}
