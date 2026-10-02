<script lang="ts">
	/*
	 * Communication (3 October 2026): the home for talking to people, under
	 * You. Messages and video calls open from here; each has its own picture
	 * story. A story about why it's all encrypted is the next to add here.
	 */
	import { Page, Tile } from '@inqbeta/q-ui';
</script>

<svelte:head><title>Communication — Q</title></svelte:head>

<Page title="Communication" lead="Messages and calls with the people you know. Sealed so only the two of you can read or hear them.">
	<div class="grid gap-4 sm:grid-cols-2 max-w-3xl">
		<Tile href="/messages" icon="message" title="Messages" meta="Write to someone, or leave a voice message. You both keep a signed copy." />
		<Tile href="/call" icon="video" title="Video call" meta="Face to face, straight from your device to theirs." />
	</div>
</Page>
