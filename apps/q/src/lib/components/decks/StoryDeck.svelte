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
	 *   (the slides strip was taken out on 4 October: "get rid of the frames,
 *   they just take up space"; the slider sits right under the words, with
 *   play, the clock and Share for the scene shown on the one line)
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
	import { frameAt, sceneTimes, startsOf, type DeckScene, type Frame } from './frame';
	import ShareButton from '../ShareButton.svelte';

	interface Props {
		/** Remembers "got it" for this deck only. */
		id: string;
		title: string;
		scenes: DeckScene[];
		pictures: Snippet<[Frame]>;
		/** Offer "Got it" to fold it away. */
		hideable?: boolean;
	}
	let { id, title, scenes, pictures, hideable = true }: Props = $props();

	/*
	 * Timed by the voice (4 October 2026). Each scene is recorded in Darren's
	 * voice as story.<deck>.<n> (scripts/build-voice.mjs), its words timed;
	 * a scene lasts as long as it takes to say, plus a breath, never less than
	 * its pictures need. Until a scene is recorded its length is estimated
	 * from its words, so the timeline is already uneven where the words are.
	 */
	type Told = { file: string; words?: [number, number][] };
	let told = $state<(Told | null)[]>([]);
	$effect(() => {
		void fetch('/voice/en/manifest.json')
			.then((r) => (r.ok ? r.json() : null))
			.then((m: { items?: Record<string, Told> } | null) => (told = scenes.map((_, i) => m?.items?.[`story.${id}.${i + 1}`] ?? null)))
			.catch(() => (told = []));
	});
	const times = $derived(sceneTimes(scenes, told.map((x) => (x?.words?.length ? x.words.at(-1)![1] : null))));
	const starts = $derived(startsOf(times));

	const N = $derived(scenes.length);
	const total = $derived(times.reduce((a, b) => a + b, 0));
	let t = $state(0);
	let playing = $state(false);
	let root = $state<HTMLElement | null>(null);
	let started = false;
	const still = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const frame = $derived(frameAt(t, times, !still()));
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

	/* A link to a scene (#<id>-<n>, from a story manual's index) opens it here. */
	$effect(() => {
		const open = () => {
			const m = new RegExp(`^#${id}-(\\d+)$`).exec(location.hash);
			if (!m) return;
			hidden = false;
			playing = false;
			t = starts[Math.min(N, Math.max(1, Number(m[1]))) - 1] ?? 0;
			requestAnimationFrame(() => root?.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' }));
		};
		open();
		addEventListener('hashchange', open);
		return () => removeEventListener('hashchange', open);
	});

	function go(n: number) {
		stopVoice();
		t = starts[Math.min(N, Math.max(1, n)) - 1] ?? 0;
	}
	function toggle() {
		if (!playing && t >= total - 0.05) t = 0;
		playing = !playing;
	}
	/* This scene's own link, to share: the story on its own page, opened at this scene. */
	let origin = $state('');
	$effect(() => void (origin = location.origin));
	const sceneLink = $derived(origin ? `${origin}/stories/${id}#${id}-${scene}` : '');
	const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

	/*
	 * The voice. Sound on, and the story is told as it plays: each scene's
	 * recording starts with its scene and keeps in step with the slider. A
	 * scene not yet recorded is read by the browser's own voice. On or off is
	 * remembered on this device (q.decks.voice).
	 */
	const VOICE_KEY = 'q.decks.voice';
	let voiceOn = $state(false);
	$effect(() => {
		try {
			voiceOn = localStorage.getItem(VOICE_KEY) === 'on';
		} catch {
			voiceOn = false;
		}
	});
	function setVoice(on: boolean) {
		voiceOn = on;
		try {
			localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
		} catch {
			/* not remembered, which is fine */
		}
		if (on && !playing) toggle();
		if (!on) stopVoice();
	}
	let audio: HTMLAudioElement | null = null;
	let spokenScene = 0;
	function stopVoice() {
		audio?.pause();
		if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
		spokenScene = 0;
	}
	/* Keep the voice with the picture: the right scene, at the right moment in it. */
	$effect(() => {
		if (!voiceOn || !playing || hidden) return void stopVoice();
		const n = scene;
		const into = t - (starts[n - 1] ?? 0);
		const rec = told[n - 1];
		if (rec) {
			audio ??= new Audio();
			const src = new URL(rec.file, location.href).href;
			if (audio.src !== src) {
				audio.src = src;
				audio.currentTime = Math.max(0, into);
				void audio.play().catch(() => {});
			} else if (audio.paused && !audio.ended && into < audio.duration - 0.1) {
				audio.currentTime = Math.max(0, into);
				void audio.play().catch(() => {});
			} else if (!audio.paused && Math.abs(audio.currentTime - into) > 0.5) audio.currentTime = Math.max(0, into);
		} else if (spokenScene !== n && into < 0.5 && typeof speechSynthesis !== 'undefined') {
			audio?.pause();
			speechSynthesis.cancel();
			const s = scenes[n - 1];
			const u = new SpeechSynthesisUtterance(`${s.title}. ${s.says}`);
			u.lang = 'en-GB';
			speechSynthesis.speak(u);
		}
		spokenScene = n;
	});
	$effect(() => () => stopVoice());
</script>

{#if hidden}
	<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => setHidden(false)}>
		<Icon name="play" size={16} /> Show the story: {title}
	</button>
{:else}
	<section bind:this={root} class="scroll-mt-24 card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-5 w-full max-w-3xl min-w-0" aria-roledescription="carousel" aria-label={title}>
		<header class="flex flex-wrap items-center gap-3">
			<h2 class="h4 flex-1 min-w-0">{title}</h2>
			<button type="button" class="btn-icon min-h-11 min-w-11 {voiceOn ? 'preset-filled-primary-500' : 'preset-tonal'}" aria-label={voiceOn ? 'Sound off' : 'Sound on: tell the story aloud'} title={voiceOn ? 'Sound off' : 'Sound on'} aria-pressed={voiceOn} onclick={() => setVoice(!voiceOn)}>
				<Icon name={voiceOn ? 'speaker' : 'speaker-off'} size={18} />
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
						<Slider.Marker value={Math.round((starts[i] ?? 0) * 10)}>{i + 1}</Slider.Marker>
					{/each}
				</Slider.MarkerGroup>
			</Slider>
			<span class="text-xs tabular-nums opacity-70 shrink-0 w-20 text-right">{clock(t)} / {clock(total)}</span>
			<!-- Share the scene shown: its link opens the story at this scene. -->
			{#if sceneLink}
				<ShareButton link={sceneLink} title="{title}: {scenes[scene - 1].title}" message={scenes[scene - 1].says} label="Share this scene" />
			{/if}
		</div>
	</section>
{/if}
