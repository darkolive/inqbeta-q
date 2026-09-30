<script lang="ts">
	/*
	 * The language, changeable from the front door without looking for it.
	 *
	 * Skeleton's Menu behind a bare button — no background, just the translate
	 * icon and the current language's two letters (EN, CY…). Each choice is named in its own
	 * language — someone who cannot
	 * read English can still find "Deutsch".
	 */
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { LANGS, language, t, type Lang } from '$lib/i18n/index.svelte';

	const now = $derived(LANGS.find((l) => l.code === language.current) ?? LANGS[0]);
</script>

<Menu onSelect={(d) => language.choose(d.value as Lang)}>
	<Menu.Trigger class="btn font-semibold min-h-11" aria-label="{t('lang.label')}: {now.name}">
		<Icon name="languages" size={20} stroke={2.5} /><span>{now.code.toUpperCase()}</span>
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content>
				{#each LANGS as l (l.code)}
					<Menu.Item value={l.code} lang={l.html}>
						<Menu.ItemText>{l.name}</Menu.ItemText>
						{#if l.code === language.current}<Icon name="check" size={18} stroke={2.5} />{/if}
					</Menu.Item>
				{/each}
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
