<script lang="ts">
	/*
	 * What a federation is, as a short picture story (2 October 2026), made the
	 * same way as the home page's ReceiptStory so the two read as one family:
	 * people agree, write it down, someone founds it with the federation's own
	 * key, others join one step at a time, the federation vouches for what's made
	 * in it, and federations vouch for each other. Anyone can leave.
	 *
	 * Six scenes, one line each. Plays on its own once it is on screen, every
	 * 5.5 seconds, and stops at the end — it does not loop at anyone. With read
	 * aloud on it waits for the voice instead, turning to each scene as its
	 * words are read. Pauses
	 * while the pointer or keyboard focus is on it. Everyone can step through
	 * by hand. Anyone who asked for less motion gets no autoplay and no
	 * movement: the scenes simply change when they press Next.
	 *
	 * The pictures are one inline SVG coloured only with Skeleton's colour
	 * tokens, so it follows light and dark and the theme. Every caption is in
	 * the page (the inactive ones for screen readers only), so read-aloud and
	 * screen readers get the whole story in order.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { t, type Key } from '$lib/i18n/index.svelte';
	import { speech } from '$lib/settings.svelte';

	const SCENES = 6;
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
		const n = /^fedstory\.(\d+)\./.exec(speech.reading ?? '')?.[1];
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
	const cap = (n: number, part: 't' | 'd') => t(`fedstory.${n}.${part}` as Key);
</script>

<section
	bind:this={root}
	class="w-full max-w-3xl space-y-4"
	aria-roledescription="carousel"
	aria-label={t('fedstory.label')}
	onmouseenter={() => (held = true)}
	onmouseleave={() => (held = false)}
	onfocusin={() => (held = true)}
	onfocusout={() => (held = false)}
>
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<!-- The people: always there -->
		{#each [{ x: 110, y: 230, l: 'A', c: 'fill-secondary-500' }, { x: 240, y: 268, l: 'B', c: 'fill-primary-500' }, { x: 400, y: 268, l: 'C', c: 'fill-tertiary-500' }, { x: 530, y: 230, l: 'D', c: 'fill-primary-700' }] as p (p.l)}
			<g>
				<circle cx={p.x} cy={p.y} r="22" class={p.c} />
				<text x={p.x} y={p.y + 8} text-anchor="middle" class="fill-surface-50 text-xl font-bold">{p.l}</text>
			</g>
		{/each}

		<!-- 1: people who want to do something together -->
		<g class="{fade} {on(1, 1)}">
			<ellipse cx="320" cy="245" rx="270" ry="62" fill="none" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 10" />
		</g>

		<!-- 2 on: the agreement, written down -->
		<g class="{fade} {on(2)}">
			<rect x="270" y="40" width="100" height="136" rx="8" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
			<rect x="286" y="60" width="68" height="8" rx="4" class="fill-surface-300-700" />
			<rect x="286" y="78" width="54" height="8" rx="4" class="fill-surface-300-700" />
			<rect x="286" y="96" width="62" height="8" rx="4" class="fill-surface-300-700" />
			<rect x="286" y="114" width="40" height="8" rx="4" class="fill-surface-300-700" />
		</g>

		<!-- 3 on: founded — the founder and the federation's own key both sign -->
		<g class="{fade} {on(3)}">
			<path d="M128 210C170 150 220 120 268 120" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" />
			<circle cx="298" cy="152" r="13" class="fill-secondary-500" />
			<text x="298" y="157" text-anchor="middle" class="fill-surface-50 text-sm font-bold">A</text>
			<path d="M342 138l13 7v14l-13 7-13-7v-14z" class="fill-primary-500" />
			<path d="M336 152l4 4 8-8" fill="none" class="stroke-surface-50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
		</g>

		<!-- 4 on: others join, each signing for themselves -->
		<g class="{fade} {on(4)}">
			<path d="M246 246C258 210 282 190 300 178" fill="none" class="stroke-primary-500" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" />
			<path d="M394 246C382 210 358 190 340 178" fill="none" class="stroke-tertiary-500" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" />
			<path d="M512 212C470 160 420 140 372 132" fill="none" class="stroke-primary-700" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" />
			{#each [{ x: 262, y: 236 }, { x: 418, y: 236 }, { x: 552, y: 200 }] as s (s.x)}
				<circle cx={s.x} cy={s.y} r="10" class="fill-success-500" />
				<path d="M{s.x - 5} {s.y}l3.5 3.5 7-7" fill="none" class="stroke-surface-50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
			{/each}
		</g>

		<!-- 5: the federation vouches — a member's receipt carries its stamp -->
		<g class="{fade} {on(5, 5)}">
			<rect x="430" y="70" width="64" height="84" rx="6" class="fill-surface-50-950 stroke-surface-500" stroke-width="2.5" />
			<rect x="441" y="84" width="40" height="6" rx="3" class="fill-surface-300-700" />
			<rect x="441" y="97" width="30" height="6" rx="3" class="fill-surface-300-700" />
			<path d="M462 116l11 6v12l-11 6-11-6v-12z" class="fill-primary-500" />
			<circle cx="492" cy="72" r="14" class="fill-success-500" />
			<path d="M485 72l5 5 9-9" fill="none" class="stroke-surface-50" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
		</g>

		<!-- 6: federations vouch for each other -->
		<g class="{fade} {on(6)}">
			<path d="M372 96C430 70 480 66 540 72" fill="none" class="stroke-primary-500" stroke-width="3.5" stroke-linecap="round" />
			<path d="M576 48l26 14v28l-26 14-26-14v-28z" class="fill-tertiary-500" />
			<path d="M564 76l8 8 16-16" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
			<path d="M64 76l26 14v28l-26 14-26-14v-28z" class="fill-surface-300-700" />
			<path d="M90 104C150 104 210 100 268 96" fill="none" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 8" />
		</g>
	</svg>

	<!-- The words. All in the page, in order; only the current one is shown. -->
	<div class="min-h-24 text-center" aria-live={playing ? 'off' : 'polite'}>
		{#each Array.from({ length: SCENES }, (_, i) => i + 1) as n (n)}
			<div
				class={n === scene ? '' : 'sr-only'}
				role="group"
				aria-roledescription="slide"
				aria-label={t('story.step').replace('{n}', String(n)).replace('{total}', String(SCENES))}
			>
				<p class="h4" data-read={`fedstory.${n}.t`}>{cap(n, 't')}</p>
				<p class="text-surface-700-300 text-balance" data-read={`fedstory.${n}.d`}>{cap(n, 'd')}</p>
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
