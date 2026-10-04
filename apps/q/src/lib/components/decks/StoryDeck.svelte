<script lang="ts">
	/*
	 * A story deck (4 October 2026): one self-contained component.
	 *
	 * Darren: "On the main page is the animations. And in the footer is the
	 * slides as slides, and underneath that a Skeleton slider so that the time
	 * frame, you can slide to which slide, which time … a really good way of
	 * skimming through … and next to it, I got it, so it disappears, because
	 * they do take up space … once you understand, you want it out the way."
	 *
	 *   the animation   the deck's pictures, moving, with the scene's words
	 *   the slides      every scene as a still card; press one to go there
	 *   the slider      the whole timeline, to the tenth of a second, with a
	 *                   marker per scene: drag to skim, frame by frame
	 *   got it          folds the deck to one line, remembered on this device
	 *
	 * Plays once when it comes on screen, then stops; never loops at anyone.
	 * Anyone who asked for less motion gets no autoplay and no movement: each
	 * scene appears whole. Read aloud reads the scene shown. Every scene's
	 * words are in the page, in order, for screen readers.
	 *
	 * A deck brings only its words (`scenes`) and its pictures (one SVG
	 * snippet drawn from a Frame), so each can go out on its own as a short
	 * advert at /stories/<id>.
	 */
	import type { Snippet } from 'svelte';
	import { Slider } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { frameAt, stillOf, type DeckScene, type Frame } from './frame';

	interface Props {
		/** Remembers "got it" for this deck only. */
		id: string;
		title: string;
		scenes: DeckScene[];
		pictures: Snippet<[Frame]>;
		/** Seconds per scene. */
		seconds?: number;
		/** Offer "Got it" to fold it away. */
		hideable?: boolean;
	}
	let { id, title, scenes, pictures, seconds = 6, hideable = true }: Props = $props();

	const N = $derived(scenes.length);
	const total = $derived(N * seconds);
	let t = $state(0);
	let playing = $state(false);
	let root = $state<HTMLElement | null>(null);
	let started = false;
	const still = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const frame = $derived(frameAt(t, N, seconds, !still()));
	const scene = $derived(frame.scene);

	/* Folded away ("got it"), remembered on this device. */
	const KEY = 'q.decks.hidden';
	function readHidden(): Record<string, boolean> {
		try {
			return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
		} catch {
			return {};
		}
	}
	let hidden = $state(false);
	$effect(() => {
		hidden = hideable && !!readHidden()[id];
	});
	function setHidden(h: boolean) {
		hidden = h;
		if (h) {
			playing = false;
			stopVoice();
		}
		try {
			const all = readHidden();
			if (h) all[id] = true;
			else delete all[id];
			localStorage.setItem(KEY, JSON.stringify(all));
		} catch {
			/* not remembered, which is fine */
		}
	}

	/* Play once, the first time it's properly on screen. */
	$effect(() => {
		if (!root || hidden) return;
		const seen = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting && !started && !still()) {
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
		let last = performance.now();
		let raf = requestAnimationFrame(function step(now) {
			t = Math.min(total, t + (now - last) / 1000);
			last = now;
			if (t >= total) playing = false;
			else raf = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(raf);
	});

	/* Keep the current slide in view in the strip, without moving the page. */
	let strip = $state<HTMLElement | null>(null);
	$effect(() => {
		const li = strip?.children[scene - 1] as HTMLElement | undefined;
		if (!strip || !li) return;
		const left = li.offsetLeft - strip.offsetLeft;
		if (left < strip.scrollLeft || left + li.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: left - 8, behavior: still() ? 'auto' : 'smooth' });
	});

	/* A link to a scene (#<id>-<n>, from a story manual's index) opens it here. */
	$effect(() => {
		const open = () => {
			const m = new RegExp(`^#${id}-(\\d+)$`).exec(location.hash);
			if (!m) return;
			hidden = false;
			playing = false;
			t = (Math.min(N, Math.max(1, Number(m[1]))) - 1) * seconds;
			requestAnimationFrame(() => root?.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' }));
		};
		open();
		addEventListener('hashchange', open);
		return () => removeEventListener('hashchange', open);
	});

	function go(n: number) {
		stopVoice();
		t = (Math.min(N, Math.max(1, n)) - 1) * seconds;
	}
	function toggle() {
		if (!playing && t >= total - 0.05) t = 0;
		playing = !playing;
	}
	const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

	/* Read the scene shown aloud, with the browser's own voice. */
	let speaking = $state(false);
	function stopVoice() {
		if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
		speaking = false;
	}
	function readAloud() {
		if (typeof speechSynthesis === 'undefined') return;
		if (speaking) return stopVoice();
		const s = scenes[scene - 1];
		const u = new SpeechSynthesisUtterance(`${s.title}. ${s.says}`);
		u.lang = document.documentElement.lang || 'en-GB';
		u.onend = u.onerror = () => (speaking = false);
		playing = false;
		speaking = true;
		speechSynthesis.speak(u);
	}
</script>

{#if hidden}
	<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => setHidden(false)}>
		<Icon name="play" size={16} /> Show the story: {title}
	</button>
{:else}
	<section bind:this={root} class="scroll-mt-24 card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-5 w-full max-w-3xl min-w-0" aria-roledescription="carousel" aria-label={title}>
		<header class="flex flex-wrap items-center gap-3">
			<h2 class="h4 flex-1 min-w-0">{title}</h2>
			<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label={speaking ? 'Stop reading' : 'Read this scene aloud'} aria-pressed={speaking} onclick={readAloud}>
				<Icon name="speaker" size={18} />
			</button>
			{#if hideable}
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => setHidden(true)}><Icon name="check" size={16} /> Got it</button>
			{/if}
		</header>

		<!-- The animation. -->
		<div class="rounded-container overflow-hidden bg-surface-100-900">
			{@render pictures(frame)}
		</div>

		<!-- The words: all in the page, in order; only the current scene's shown. -->
		<div class="min-h-24 text-center" aria-live={playing ? 'off' : 'polite'}>
			{#each scenes as s, i (i)}
				<div class={i + 1 === scene ? '' : 'sr-only'} role="group" aria-roledescription="slide" aria-label="Scene {i + 1} of {N}">
					<p class="h4">{s.title}</p>
					<p class="text-surface-700-300 text-balance max-w-2xl mx-auto">{s.says}</p>
				</div>
			{/each}
		</div>

		<!-- The slides: each scene as a still; press one to go there. -->
		<ol bind:this={strip} class="flex gap-3 overflow-x-auto pb-2 snap-x" aria-label="Slides">
			{#each scenes as s, i (i)}
				<li class="snap-start shrink-0"><button
					type="button"
					class="w-20 sm:w-24 h-full text-left card p-1 flex flex-col gap-1 transition-colors {i + 1 === scene ? 'preset-outlined-primary-500 bg-primary-50-950' : 'preset-outlined-surface-200-800 hover:preset-tonal'}"
					aria-current={i + 1 === scene ? 'step' : undefined}
					aria-label="Go to scene {i + 1}: {s.title}"
					onclick={() => go(i + 1)}
				>
					<span class="rounded-base overflow-hidden bg-surface-100-900 pointer-events-none" aria-hidden="true">{@render pictures(stillOf(i + 1, N))}</span>
					<span class="text-[0.65rem] font-semibold leading-tight line-clamp-1" title={s.title}>{i + 1}. {s.title}</span>
				</button></li>
			{/each}
		</ol>

		<!-- The timeline: drag to skim, a tenth of a second at a time; a marker per scene. -->
		<div class="flex items-center gap-3">
			<button type="button" class="btn-icon preset-filled-primary-500 shrink-0" aria-label={playing ? 'Pause' : t >= total - 0.05 ? 'Play again' : 'Play'} onclick={toggle}>
				<Icon name={playing ? 'pause' : t >= total - 0.05 ? 'replay' : 'play'} size={20} stroke={2.5} />
			</button>
			<Slider
				class="flex-1 min-w-0"
				value={[Math.round(t * 10)]}
				min={0}
				max={Math.round(total * 10)}
				step={1}
				aria-label={['Timeline']}
				onValueChange={(d) => {
					playing = false;
					stopVoice();
					t = Math.min(total, (d.value[0] ?? 0) / 10);
				}}
			>
				<Slider.Control>
					<Slider.Track>
						<Slider.Range />
					</Slider.Track>
					<Slider.Thumb index={0}><Slider.HiddenInput /></Slider.Thumb>
				</Slider.Control>
				<Slider.MarkerGroup>
					{#each scenes as _, i (i)}
						<Slider.Marker value={i * seconds * 10}>{i + 1}</Slider.Marker>
					{/each}
				</Slider.MarkerGroup>
			</Slider>
			<span class="text-xs tabular-nums opacity-70 shrink-0 w-20 text-right">{clock(t)} / {clock(total)}</span>
		</div>
	</section>
{/if}
