<script lang="ts">
	/*
	 * Draws a library component from its pin and a block's answers — ADR-Q-006.
	 *
	 * The manifest says which answers exist; each one is handed to the code as a
	 * prop named after the part of the question id past the component's own id
	 * (`q:sign-in/title` → `title`). Nothing else reaches the code.
	 */
	import { findComponent } from '@inqbeta/q-core/components';
	import { CODE } from '$lib/component-library';

	let { pin, settings = {} }: { pin: string; settings?: Record<string, unknown> } = $props();

	const manifest = $derived(findComponent(pin));
	const Code = $derived(manifest ? CODE[manifest.id] : undefined);
	const props = $derived(
		manifest
			? Object.fromEntries(
					manifest.settings.questions
						.filter((q) => settings[q.id] !== undefined && settings[q.id] !== '')
						.map((q) => [q.id.slice(manifest.id.length + 1), settings[q.id]])
				)
			: {}
	);
</script>

{#if Code}
	<Code {...props} />
{:else}
	<p class="card preset-tonal-warning p-4" role="status">
		There is no component “{pin}” here. It may be a newer version than this copy of Q has.
	</p>
{/if}
