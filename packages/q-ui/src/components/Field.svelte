<script lang="ts">
	/* A label and its value, on the fixed label column (blocks.css field-row). */
	import type { Snippet } from 'svelte';
	let { label, token = false, children }: { label: string; token?: boolean; children: Snippet } = $props();
</script>

<div class="field-row">
	<dt class="role-label" data-role="label">{label}</dt>
	<dd class={token ? 'role-token' : 'role-value'} data-role={token ? 'token' : 'value'}>{@render children()}</dd>
</div>
