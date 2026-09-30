<script lang="ts">
	/* Q is in beta, said once, beside the mark — on the front door and in the header. */
	import { t } from '$lib/i18n/index.svelte';
</script>

<span class="badge preset-tonal-secondary text-xs uppercase tracking-wide" title={t('stage.betaHint')}>
	{t('stage.beta')}<span class="sr-only">: {t('stage.betaHint')}</span>
</span>
