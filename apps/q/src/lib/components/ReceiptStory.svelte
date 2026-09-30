<script lang="ts">
	/*
	 * How Q works, as a short picture story — "visual explanation is much
	 * easier" (Darren, 29 September). Two people, two computers, one receipt:
	 * something happens, Q writes it down, both sign, each keeps a copy, and
	 * the proof holds.
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
		const n = /^story\.(\d+)\./.exec(speech.reading ?? '')?.[1];
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
	const cap = (n: number, part: 't' | 'd') => t(`story.${n}.${part}` as Key);
</script>

<section
	bind:this={root}
	class="w-full max-w-3xl space-y-4"
	aria-roledescription="carousel"
	aria-label={t('story.label')}
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
			<path d="M58 196v-18h14l5 5h24v13z" class="fill-secondary-200-800" />
			<text x="125" y="276" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ana')}</text>
		</g>
		<!-- Ben: his computer, his folder -->
		<g>
			<circle cx="515" cy="72" r="22" class="fill-primary-500" />
			<text x="515" y="80" text-anchor="middle" class="fill-surface-50 text-xl font-bold">B</text>
			<rect x="430" y="110" width="170" height="110" rx="10" class="fill-surface-50-950 stroke-surface-400-600" stroke-width="3" />
			<path d="M410 232h210l-16 14H426z" class="fill-surface-300-700" />
			<path d="M448 196v-18h14l5 5h24v13z" class="fill-primary-200-800" />
			<text x="515" y="276" text-anchor="middle" class="fill-surface-950-50 text-lg font-semibold">{t('story.ben')}</text>
		</g>

		<!-- 1: nothing in the middle -->
		<g class="{fade} {on(1, 1)}">
			<line x1="230" y1="165" x2="410" y2="165" class="stroke-surface-400-600" stroke-width="3" stroke-dasharray="6 10" />
		</g>

		<!-- 2: something happens, Ana → Ben -->
		<g class="{fade} {on(2, 2)}">
			<path d="M215 150C290 95 350 95 425 150" fill="none" class="stroke-secondary-500" stroke-width="5" stroke-linecap="round" />
			<path d="M425 150l-18-2 9-14z" class="fill-secondary-500" />
		</g>

		<!-- 3–4: the receipt, signed by Ana, then by Ben -->
		<g class="{fade} {on(3, 4)}">
			<rect x="270" y="90" width="100" height="140" rx="8" class="fill-surface-50-950 stroke-surface-500" stroke-width="3" />
			<rect x="286" y="110" width="68" height="8" rx="4" class="fill-surface-300-700" />
			<rect x="286" y="128" width="54" height="8" rx="4" class="fill-surface-300-700" />
			<rect x="286" y="146" width="62" height="8" rx="4" class="fill-surface-300-700" />
			<rect x="286" y="164" width="40" height="8" rx="4" class="fill-surface-300-700" />
			<circle cx="300" cy="204" r="14" class="fill-secondary-500" />
			<text x="300" y="209" text-anchor="middle" class="fill-surface-50 text-sm font-bold">A</text>
		</g>
		<g class="{fade} {on(4, 4)}">
			<circle cx="340" cy="204" r="14" class="fill-primary-500" />
			<text x="340" y="209" text-anchor="middle" class="fill-surface-50 text-sm font-bold">B</text>
		</g>

		<!-- 5–6: a copy each, in each folder -->
		{#each [125, 515] as x (x)}
			<g class="{fade} {on(5)}">
				<rect x={x - 5} y="122" width="56" height="74" rx="5" class="fill-surface-50-950 stroke-surface-500" stroke-width="2.5" />
				<rect x={x + 4} y="134" width="36" height="5" rx="2.5" class="fill-surface-300-700" />
				<rect x={x + 4} y="145" width="28" height="5" rx="2.5" class="fill-surface-300-700" />
				<circle cx={x + 12} cy="180" r="7" class="fill-secondary-500" />
				<circle cx={x + 32} cy="180" r="7" class="fill-primary-500" />
			</g>
			<!-- 6: both still check -->
			<g class="{fade} {on(6)}">
				<circle cx={x + 50} cy="124" r="15" class="fill-success-500" />
				<path d="M{x + 43} 124l5 5 10-10" fill="none" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
			</g>
		{/each}

		<!-- 6: a changed copy does not -->
		<g class="{fade} {on(6)}">
			<rect x="292" y="120" width="56" height="74" rx="5" class="fill-surface-50-950 stroke-error-500" stroke-width="2.5" stroke-dasharray="5 4" />
			<rect x="301" y="132" width="36" height="5" rx="2.5" class="fill-error-500" />
			<rect x="301" y="143" width="28" height="5" rx="2.5" class="fill-surface-300-700" />
			<circle cx="342" cy="122" r="15" class="fill-error-500" />
			<path d="M336 116l12 12M348 116l-12 12" class="stroke-surface-50" stroke-width="3.5" stroke-linecap="round" />
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
				<p class="h4" data-read={`story.${n}.t`}>{cap(n, 't')}</p>
				<p class="text-surface-700-300 text-balance" data-read={`story.${n}.d`}>{cap(n, 'd')}</p>
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
