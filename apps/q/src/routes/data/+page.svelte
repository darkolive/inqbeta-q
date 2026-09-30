<script lang="ts">
	import { Page } from '@inqbeta/q-ui';
	import DataView from '$lib/components/DataView.svelte';
</script>

<svelte:head><title>Files — Q</title></svelte:head>

<Page title="Files" lead="Everything in your folder. On the desktop it cannot be read; here, signed in, it can — offline too.">
	<DataView />
</Page>
