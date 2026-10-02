<script lang="ts">
	/* Someone sent you their card, the whole of it in this link's #fragment (links made before 2 October 2026). */
	import { Page } from '@inqbeta/q-ui';
	import CardArrived from '$lib/components/CardArrived.svelte';
	import { openCardLink } from '$lib/cardlink';
</script>

<svelte:head><title>A card for you — Q</title></svelte:head>

<Page title="A card for you" lead="Someone sent you their card, signed by them.">
	<CardArrived open={() => openCardLink(location.hash)} />
</Page>
