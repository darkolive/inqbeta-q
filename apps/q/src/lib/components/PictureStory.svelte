<script lang="ts">
	/*
	 * The picture story, once (3 October 2026). ReceiptStory, FederationStory,
	 * MessageStory and CallStory were four copies of the same player; this is
	 * that player, and each story now brings only its pictures and its words.
	 *
	 * Words: `<prefix>.label` and `<prefix>.<n>.t` / `.d` for each scene, in
	 * every language book. Pictures: one inline SVG, passed as the `pictures`
	 * snippet, coloured only with Skeleton's colour tokens so it follows light,
	 * dark and the theme. The snippet is given `on(a, b)` — the opacity class
	 * for something shown from scene a to scene b (b defaults to the last) —
	 * and `fade`, the transition class to put beside it.
	 *
	 * Plays on its own once it is on screen, every 5.5 seconds, and stops at
	 * the end — it does not loop at anyone. With read aloud on it waits for the
	 * voice instead, turning to each scene as its words are read. Pauses while
	 * the pointer or keyboard focus is on it. Everyone can step through by
	 * hand. Anyone who asked for less motion gets no autoplay and no movement:
	 * the scenes simply change when they press Next. Every caption is in the
	 * page (the inactive ones for screen readers only), so read-aloud and
	 * screen readers get the whole story in order.
	 */
	import type { Snippet } from 'svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { t, type Key } from '$lib/i18n/index.svelte';
	import { speech } from '$lib/settings.svelte';

	interface Props {
		/** The words' key prefix, e.g. `story`, `keystory`. */
		prefix: string;
		/** How many scenes. */
		scenes?: number;
		/** The SVG, given `on(a, b)` and `fade`. */
		pictures: Snippet<[(a: number, b?: number) => string, string]>;
	}
	let { prefix, scenes = 6, pictures }: Props = $props();

	const SCENES = $derived(scenes);
	const EVERY_MS = 5500;

	let scene = $state(1);
	let playing = $state(false);
	let held = $state(false);
	let started = false;
	let root = $state<HTMLElement | null>(null);

	const still = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* Start once, the first time it is properly on screen. */
	$effect(() => {
		if (!root) return;
		const seen = new IntersectionObserver(
			([e]) => {
				/* With read aloud on, the voice turns the scenes instead (below). */
				if (e.isIntersecting && !started && !still() && !speech.on) {
					started = true;
					playing = true;
				}
			},
			{ threshold: 0.5 }
		);
		seen.observe(root);
		return () => seen.disconnect();
	});

	$effect(() => {
		if (!playing) return;
		const tick = setInterval(() => {
			if (held) return;
			if (scene < SCENES) scene++;
			else playing = false;
		}, EVERY_MS);
		return () => clearInterval(tick);
	});

	/*
	 * Read aloud leads: no scene changes on its own while the voice is reading,
	 * and each scene appears as the voice reaches its words — so the story never
	 * runs ahead of the line above it being read.
	 */
	$effect(() => {
		if (speech.on) playing = false;
	});
	$effect(() => {
		const r = speech.reading ?? '';
		if (!r.startsWith(`${prefix}.`)) return;
		const n = /^[^.]+\.(\d+)\./.exec(r)?.[1];
		if (n) scene = Number(n);
	});

	function go(n: number) {
		scene = Math.min(SCENES, Math.max(1, n));
	}
	function toggle() {
		if (!playing && scene === SCENES) scene = 1;
		playing = !playing;
	}

	/* Shown from scene `a` to scene `b`. */
	const on = (a: number, b = SCENES) => (scene >= a && scene <= b ? 'opacity-100' : 'opacity-0');
	const fade = 'transition-opacity duration-700 motion-reduce:transition-none';
	const cap = (n: number, part: 't' | 'd') => t(`${prefix}.${n}.${part}` as Key);
</script>


<section
	bind:this={root}
	class="w-full max-w-3xl space-y-4"
	aria-roledescription="carousel"
	aria-label={t(`${prefix}.label` as Key)}
	onmouseenter={() => (held = true)}
	onmouseleave={() => (held = false)}
	onfocusin={() => (held = true)}
	onfocusout={() => (held = false)}
>
	{@render pictures(on, fade)}

	<!-- The words. All in the page, in order; only the current one is shown. -->
	<div class="min-h-24 text-center" aria-live={playing ? 'off' : 'polite'}>
		{#each Array.from({ length: SCENES }, (_, i) => i + 1) as n (n)}
			<div
				class={n === scene ? '' : 'sr-only'}
				role="group"
				aria-roledescription="slide"
				aria-label={t('story.step').replace('{n}', String(n)).replace('{total}', String(SCENES))}
			>
				<p class="h4" data-read={`${prefix}.${n}.t`}>{cap(n, 't')}</p>
				<p class="text-surface-700-300 text-balance" data-read={`${prefix}.${n}.d`}>{cap(n, 'd')}</p>
			</div>
		{/each}
	</div>

	<!-- Controls: back, play or pause (play again at the end), forward, and one dot per scene. -->
	<div class="flex items-center justify-center gap-3">
		<button type="button" class="btn-icon preset-tonal" aria-label={t('story.prev')} disabled={scene === 1} onclick={() => go(scene - 1)}>
			<Icon name="chevronLeft" size={20} stroke={2.5} />
		</button>
		<button
			type="button"
			class="btn-icon preset-filled-primary-500"
			aria-label={playing ? t('story.pause') : scene === SCENES ? t('story.replay') : t('story.play')}
			onclick={toggle}
		>
			<Icon name={playing ? 'pause' : scene === SCENES ? 'replay' : 'play'} size={20} stroke={2.5} />
		</button>
		<button type="button" class="btn-icon preset-tonal" aria-label={t('story.next')} disabled={scene === SCENES} onclick={() => go(scene + 1)}>
			<Icon name="chevronRight" size={20} stroke={2.5} />
		</button>
		<div class="flex items-center ms-1">
			{#each Array.from({ length: SCENES }, (_, i) => i + 1) as n (n)}
				<!-- A small dot, a finger-sized target. -->
				<button
					type="button"
					class="p-2 rounded-full cursor-pointer"
					aria-label={t('story.step').replace('{n}', String(n)).replace('{total}', String(SCENES))}
					aria-current={n === scene ? 'step' : undefined}
					onclick={() => go(n)}
				>
					<span class="block size-3 rounded-full transition-colors {n === scene ? 'bg-primary-500' : 'bg-surface-400-600'}"></span>
				</button>
			{/each}
		</div>
	</div>
</section>
