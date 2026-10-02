<script lang="ts">
	/*
	 * Signed out, opening a card someone shared (2 October 2026): nothing of
	 * theirs is shown — not their name, not their picture. Just that someone
	 * wants to connect, and the passkey sign-in right there. Once you're in,
	 * the card opens for you, and only you (the first to open it keeps it).
	 */
	import SignInBlock from '$lib/components/SignInBlock.svelte';
</script>

<div class="py-8">
	<SignInBlock title="Someone wants to connect with you" line="Sign in to see who. Their card opens only for you: once you’ve opened it, nobody else can." stay />
</div>
