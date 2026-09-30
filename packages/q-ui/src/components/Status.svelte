<script lang="ts">
	/*
	 * A state, in words. The tone only confirms what the words say — colour is
	 * never the message.
	 */
	import type { Snippet } from 'svelte';
	import { TONES, type Tone } from '../tones';

	let { tone = 'plain', children }: { tone?: Tone; children: Snippet } = $props();
</script>

<span class="{TONES[tone]} role-status" data-role="status">{@render children()}</span>
