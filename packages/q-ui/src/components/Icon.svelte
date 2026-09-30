<script lang="ts">
	import { icons, ICON_ATTRS, type IconName } from '../icons';

	/* `stroke` thickens the line — 2 is Lucide's own; 2.5–3 reads as bold at large sizes. */
	let { name, size = 20, stroke = 2, class: klass = '' }: { name: IconName; size?: number; stroke?: number; class?: string } = $props();
</script>

<!-- {@html} is safe: the markup comes from the local icon table only. -->
<svg {...ICON_ATTRS} stroke-width={stroke} width={size} height={size} class={klass} aria-hidden="true" focusable="false">{@html icons[name]}</svg>
