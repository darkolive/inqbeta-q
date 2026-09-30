<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
</script>

<svelte:head><title>{t('legal.title')} — Q</title></svelte:head>

<h1 class="h2">{t('legal.title')}</h1>
<ul>
	<li><a href="/legal/privacy">Privacy notice</a> — what Q keeps (almost nothing), and your rights.</li>
	<li><a href="/legal/terms">Terms of use</a> — plain terms for a free beta.</li>
	<li><a href="/legal/accessibility">Accessibility statement</a> — what Q does for access, and how to tell us about a barrier.</li>
	<li><a href="/legal/licences">Licences</a> — Q is open source; what that covers and what it does not.</li>
</ul>
