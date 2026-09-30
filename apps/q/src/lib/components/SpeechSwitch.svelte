<script lang="ts">
	/* Read this page aloud — Skeleton's Switch, a speaker riding on the thumb. */
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { speech } from '$lib/settings.svelte';
	import { t, language } from '$lib/i18n/index.svelte';

	/** Show the word beside the switch; in the header it is for screen readers only. */
	let { showLabel = false }: { showLabel?: boolean } = $props();

	/* Known only in the browser; until then the switch is offered. */
	let can = $state(true);
	$effect(() => {
		can = speech.available;
	});

	/* A change of language mid-read stops it: the next read is in the new one. */
	let heard = language.current;
	$effect(() => {
		const now = language.current;
		if (now !== heard && speech.on) speech.set(false);
		heard = now;
	});
</script>

<Switch checked={speech.on} disabled={!can} onCheckedChange={(d) => speech.set(d.checked)}>
	<!--
		No fill, just a thick border: brand orange when off, dark olive when on.
		The circle is bigger than the pill and stands just outside it at either
		end; its icon is the brand's light orange, as on a hovered passkey box.
	-->
	<Switch.Control class="w-12 h-6 p-0 items-center bg-transparent border-3 border-secondary-500 data-[state=checked]:border-primary-500">
		<Switch.Thumb
			class="size-7 shrink-0 -ml-1.5 bg-secondary-500 text-secondary-50 transition-transform duration-150
				data-[state=checked]:transform-none data-[state=checked]:translate-x-6.5 data-[state=checked]:bg-primary-500"
		>
			<Icon name={speech.on ? 'speaker' : 'speaker-off'} size={16} stroke={2.5} />
		</Switch.Thumb>
	</Switch.Control>
	<Switch.Label class={showLabel ? '' : 'sr-only'}>{t('settings.read')}</Switch.Label>
	<Switch.HiddenInput />
</Switch>
