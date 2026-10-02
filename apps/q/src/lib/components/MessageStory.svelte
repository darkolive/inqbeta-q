<script lang="ts">
	/*
	 * How a message gets from one person to another, as a short picture story
	 * (2 October 2026), the same family as ReceiptStory and FederationStory.
	 * Plain steps, one at a time: choose who, write it, Q seals it, it waits in
	 * storage while the bellboy rings their bell (ADR-Q-014), they open it, and
	 * you both keep a signed copy.
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
		const n = /^msgstory\.(\d+)\./.exec(speech.reading ?? '')?.[1];
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
	const cap = (n: number, part: 't' | 'd') => t(`msgstory.${n}.${part}` as Key);
</script>

<section
	bind:this={root}
	class="w-full max-w-3xl space-y-4"
	aria-roledescription="carousel"
	aria-label={t('msgstory.label')}
	onmouseenter={() => (held = true)}
	onmouseleave={() => (held = false)}
	onfocusin={() => (held = true)}
	onfocusout={() => (held = false)}
>
	<svg viewBox="0 0 640 320" class="w-full h-auto" aria-hidden="true">
		<!-- Ana: her computer, her folder -->
		<g>
			<circle cx="125" cy="72" r="22" class="fill-secondary-500" />
			<text x="125" y="80" text-anchor="middle" class="fill-surface-50 text-xl font-bold">A</text>
			<rect x="40" y="110" width="170" height="110" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
			<path d="M20 232h210l-16 14H36z" class="fill-surface-300-700" />
			<text x="125" y="276" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ana')}</text>
		</g>
		<!-- Ben: his computer, his folder -->
		<g>
			<circle cx="515" cy="72" r="22" class="fill-primary-500" />
			<text x="515" y="80" text-anchor="middle" class="fill-surface-50 text-xl font-bold">B</text>
			<rect x="430" y="110" width="170" height="110" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
			<path d="M410 232h210l-16 14H426z" class="fill-surface-300-700" />
			<text x="515" y="276" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ben')}</text>
		</g>

		<!-- 1: choose who — Ana's people, Ben picked out -->
		<g class="{fade} {on(1, 1)}">
			<rect x="52" y="152" width="146" height="28" rx="14" fill="none" class="stroke-secondary-500" stroke-width="3" />
			{#each [{ y: 132, c: 'fill-tertiary-500' }, { y: 166, c: 'fill-primary-500' }, { y: 200, c: 'fill-surface-400-600' }] as r (r.y)}
				<circle cx="70" cy={r.y} r="9" class={r.c} />
				<rect x="88" y={r.y - 4} width="80" height="8" rx="4" class="fill-surface-300-700" />
			{/each}
			<line x1="230" y1="165" x2="410" y2="165" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 10" />
		</g>

		<!-- 2: write it -->
		<g class="{fade} {on(2, 2)}">
			<path d="M60 124h130a8 8 0 0 1 8 8v50a8 8 0 0 1-8 8H96l-14 14v-14H60a8 8 0 0 1-8-8v-50a8 8 0 0 1 8-8z" class="fill-secondary-100-900 stroke-secondary-500" stroke-width="2.5" />
			<rect x="68" y="138" width="100" height="8" rx="4" class="fill-surface-400-600" />
			<rect x="68" y="154" width="80" height="8" rx="4" class="fill-surface-400-600" />
			<rect x="68" y="170" width="56" height="8" rx="4" class="fill-surface-400-600" />
		</g>

		<!-- 3–4: sealed — an envelope with a lock, from Ana -->
		<g class="{fade} {on(3, 4)}">
			<path d="M215 152C238 142 252 142 268 148" fill="none" class="stroke-secondary-500" stroke-width="4" stroke-linecap="round" />
			<rect x="275" y="112" width="90" height="62" rx="6" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
			<path d="M277 116l43 30 43-30" fill="none" class="stroke-surface-500" stroke-width="3" stroke-linejoin="round" />
			<path d="M311 160v-7a9 9 0 0 1 18 0v7" fill="none" class="stroke-primary-500" stroke-width="4" />
			<rect x="303" y="158" width="34" height="26" rx="5" class="fill-primary-500" />
			<circle cx="320" cy="170" r="3.5" class="fill-surface-50" />
		</g>

		<!-- 4: it waits in storage; the bellboy rings Ben's bell -->
		<g class="{fade} {on(4, 4)}">
			<rect x="262" y="196" width="116" height="40" rx="6" class="fill-surface-200-800 stroke-surface-400-600" stroke-width="3" />
			<rect x="300" y="212" width="40" height="8" rx="4" class="fill-surface-400-600" />
			<path d="M368 130C430 70 510 40 556 52" fill="none" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="4 8" stroke-linecap="round" />
			<path d="M562 80h28l-5-7V61a9 9 0 0 0-18 0v12z" class="fill-secondary-500" />
			<circle cx="576" cy="84" r="4" class="fill-secondary-500" />
			<circle cx="592" cy="50" r="10" class="fill-error-500" />
			<text x="592" y="55" text-anchor="middle" class="fill-surface-50 text-sm font-bold">1</text>
		</g>

		<!-- 5: Ben opens it, on his computer -->
		<g class="{fade} {on(5, 5)}">
			<path d="M372 152C390 142 404 142 422 148" fill="none" class="stroke-primary-500" stroke-width="4" stroke-linecap="round" />
			<path d="M450 124h130a8 8 0 0 1 8 8v50a8 8 0 0 1-8 8H564v14l-14-14H450a8 8 0 0 1-8-8v-50a8 8 0 0 1 8-8z" class="fill-primary-100-900 stroke-primary-500" stroke-width="2.5" />
			<rect x="458" y="138" width="100" height="8" rx="4" class="fill-surface-400-600" />
			<rect x="458" y="154" width="80" height="8" rx="4" class="fill-surface-400-600" />
			<rect x="458" y="170" width="56" height="8" rx="4" class="fill-surface-400-600" />
			<circle cx="582" cy="124" r="15" class="fill-success-500" />
			<path d="M575 124l5 5 10-10" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
		</g>

		<!-- 6: a signed copy each, in each folder, and both check -->
		{#each [{ x: 100, f: 'fill-secondary-200-800' }, { x: 490, f: 'fill-primary-200-800' }] as d (d.x)}
			<g class="{fade} {on(6)}">
				<path d="M{d.x - 42} 196v-18h14l5 5h24v13z" class={d.f} />
				<rect x={d.x} y="122" width="56" height="74" rx="5" class="fill-surface-50-950 stroke-surface-500" stroke-width="2.5" />
				<rect x={d.x + 9} y="134" width="36" height="5" rx="2.5" class="fill-surface-300-700" />
				<rect x={d.x + 9} y="145" width="28" height="5" rx="2.5" class="fill-surface-300-700" />
				<circle cx={d.x + 17} cy="180" r="7" class="fill-secondary-500" />
				<circle cx={d.x + 37} cy="180" r="7" class="fill-primary-500" />
				<circle cx={d.x + 55} cy="124" r="15" class="fill-success-500" />
				<path d="M{d.x + 48} 124l5 5 10-10" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
			</g>
		{/each}
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
				<p class="h4" data-read={`msgstory.${n}.t`}>{cap(n, 't')}</p>
				<p class="text-surface-700-300 text-balance" data-read={`msgstory.${n}.d`}>{cap(n, 'd')}</p>
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
