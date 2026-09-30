<script lang="ts">
	/*
	 * Under the switches: how much of this page can be read aloud.
	 * Nothing at all is said on a page that is fully recorded — only when
	 * something is missing, so it is apparent rather than a silence to puzzle over.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { speech } from '$lib/settings.svelte';
	import { t } from '$lib/i18n/index.svelte';

	const show = $derived(speech.coverage === 'none' || (speech.coverage === 'partial' && speech.on));
</script>

{#if show}
	<p class="card preset-tonal-warning flex items-center gap-2 px-3 py-2 text-sm shadow-lg max-w-xs" role="status" aria-live="polite">
		<Icon name={speech.coverage === 'none' ? 'speaker-off' : 'speaker'} size={18} stroke={2.5} />
		<span>{speech.coverage === 'none' ? t('speech.none') : t('speech.partial')}</span>
	</p>
{/if}
