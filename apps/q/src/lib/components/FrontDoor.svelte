<script lang="ts">
	/*
	 * The front door, as the app bar.
	 *
	 * Signed out on the home page, the app bar IS the sign-in: Skeleton's
	 * AppBar, filling the screen but for one row left for the page's arrow.
	 * Signed in, the same bar is the slim dashboard header. So the passkey is
	 * only ever touched in the one place no page content can reach — blocks
	 * and pages are content, and content can never draw a sign-in — and the
	 * settings sit in the same corner before and after (decided 29 September).
	 *
	 * Language, light/dark and read-aloud are in the trail from the first
	 * second, so the page can be set up before anything else is asked of you.
	 * It scrolls away with the page and does not come back: on the home page,
	 * below the fold is the page's own (decided 29 September).
	 */
	import { AppBar } from '@skeletonlabs/skeleton-svelte';
	import { thisBrowser } from '@inqbeta/q-core/browser';
	import ComponentBlock from './ComponentBlock.svelte';
	import LanguageMenu from './LanguageMenu.svelte';
	import ThemeSwitch from './ThemeSwitch.svelte';
	import SpeechSwitch from './SpeechSwitch.svelte';
	import SpeechNote from './SpeechNote.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { speech } from '$lib/settings.svelte';

	/* What this browser can be trusted with, said before anybody signs in. */
	let can = $state({ keep: true, read: true, backup: false, says: '', fix: '' });
	$effect(() => {
		can = thisBrowser();
	});

</script>

{#snippet settings()}
	<LanguageMenu />
	<ThemeSwitch />
	<SpeechSwitch />
{/snippet}

<a href="#more" class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 btn preset-filled-primary-500">
	{t('frontdoor.skip')}
</a>

<div>
	<AppBar class="min-h-[calc(100dvh-var(--spacing)*20)]">
		<!-- Inset to match the dashboard header (mx-24 from the edge: the bar's p-4 + mx-20). -->
		<AppBar.Toolbar class="mx-20 grid-cols-[1fr_auto]">
			<AppBar.Lead></AppBar.Lead>
			<AppBar.Trail class="items-center gap-4">{@render settings()}</AppBar.Trail>
		</AppBar.Toolbar>
		<!-- Under the switches, only when this page is missing audio (lib/settings: coverage). -->
		<div class="relative mx-20"><div class="absolute right-0 top-0 z-10"><SpeechNote /></div></div>

		<div class="flex flex-1 flex-col items-center justify-center gap-8 text-center">
			<!-- The front door is itself a block: the sign-in component, pinned (ADR-Q-006). -->
			<ComponentBlock pin="q:sign-in@1.0.0" />

			{#if !can.keep}
				<!-- Before anything is made: a person deciding whether to trust this page needs this first. -->
				<div class="card preset-tonal-warning p-4 text-left w-full max-w-md" role="status">
					<p class="font-medium">{t('home.cannotSave')}</p>
					<p class="text-sm mt-1">{can.says}</p>
					{#if can.fix}<p class="text-sm mt-1">{can.fix}</p>{/if}
				</div>
			{/if}

			<p class="text-sm opacity-50 max-w-lg" data-read="home.nothingStored">{t('home.nothingStored')}</p>

			<!-- Said whenever a recording is what you are hearing: whose voice it is. -->
			{#if speech.recorded}
				<p class="text-xs text-surface-700-300" aria-live="polite">
					{speech.recorded === "Darren's voice" ? t('voice.disclosure') : speech.recorded}
				</p>
			{/if}
		</div>
	</AppBar>
</div>
