<script lang="ts" module>
	/*
	 * One voice at a time, across every story on the page (4 October 2026:
	 * switching chapters left the last one talking under the next). Whichever
	 * story starts speaking quietens every other first.
	 */
	const voices = new Set<HTMLAudioElement>();
	/*
	 * One continuous flow (Darren, 4 October): when a chapter ends while
	 * playing, the book turns to the next and it carries straight on, with
	 * the sound as it was, unless someone intervenes. The page sets this just
	 * before it swaps the chapter; the next deck reads it once.
	 */
	let carry: { voice: boolean } | null = null;
	export function carryOnNext(voice: boolean) {
		carry = { voice };
	}
	export function quietAll(except?: HTMLAudioElement | null) {
		for (const a of voices) if (a !== except) a.pause();
		if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
	}
</script>

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
	import { untrack, type Snippet } from 'svelte';
	import { Slider } from '@skeletonlabs/skeleton-svelte';
	import { Icon } from '@inqbeta/q-ui';
	import { frameAt, sceneTimes, startsOf, type DeckScene, type Frame } from './frame';
	import ShareButton from '../ShareButton.svelte';
	import { DECK_WORDS } from './words';
	import { storyVoice, rememberedVoice, setStoryVoice } from './voice.svelte';
	import { speech } from '$lib/settings.svelte';
	import { wordAt, shown, estimate } from '$lib/voice/highlight';
	import { wordsOf } from '$lib/voice/words.js';

	interface Props {
		/** Remembers "got it" for this deck only. */
		id: string;
		title: string;
		scenes: DeckScene[];
		pictures: Snippet<[Frame]>;
		/** Offer "Got it" to fold it away. */
		hideable?: boolean;
		/** Offer Share for each scene (a made book being tried in the story engine has no page to share yet). */
		shareable?: boolean;
	}
	let { id, title, scenes, pictures, hideable = true, shareable = true }: Props = $props();

	/*
	 * Timed by the voice (4 October 2026). Each scene is recorded in Darren's
	 * voice as story.<deck>.<n> (scripts/build-voice.mjs), its words timed;
	 * a scene lasts as long as it takes to say, plus a breath, never less than
	 * its pictures need. Until a scene is recorded its length is estimated
	 * from its words, so the timeline is already uneven where the words are.
	 */
	type Told = { file: string; words?: [number, number][] };
	let told = $state<(Told | null)[]>([]);
	/* Whether the recordings list has been read: until then nobody speaks, so the browser's voice never jumps in ahead of a recording. */
	let toldReady = $state(false);
	$effect(() => {
		void fetch('/voice/en/manifest.json')
			.then((r) => (r.ok ? r.json() : null))
			.then((m: { items?: Record<string, Told> } | null) => {
				told = scenes.map((_, i) => m?.items?.[`story.${id}.${i + 1}`] ?? null);
				introTold = m?.items?.[`story.${id}.0`] ?? null;
				toldReady = true;
			})
			.catch(() => {
				told = [];
				toldReady = true;
			});
	});
	/* Each scene as long as its own telling. */
	const own = $derived(sceneTimes(scenes, told.map((x) => (x?.words?.length ? x.words.at(-1)![1] : null))));

	/*
	 * The chapter's title comes first (Darren, 4 October: "it's not reading
	 * out the chapter title before reading out the slides"): just its title,
	 * no "Chapter 3" (they may be episodes, decks, whatever a book calls them).
	 * Backing an idea…", recorded as story.<deck>.0, as long as it takes to
	 * say, then the scenes.
	 */
	const introText = $derived(title);
	let introTold = $state<Told | null>(null);
	const intro = $derived(Math.max(3, (introTold?.words?.length ? introTold.words.at(-1)![1] : introText.length / 14) + 1));

	const N = $derived(scenes.length);
	/*
	 * The story's title is part of the first scene (Darren, 4 October): said
	 * first, where it sits at the top beside the speaker, then the first
	 * scene's words, all while the first picture plays. So the first scene is
	 * as long as both tellings.
	 */
	const times = $derived(own.map((x, i) => (i === 0 ? x + intro : x)));
	const starts = $derived(startsOf(times));
	const total = $derived(times.reduce((a, b) => a + b, 0));
	let t = $state(0);
	let playing = $state(false);
	let root = $state<HTMLElement | null>(null);
	const still = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	/* Saying the title: the first moments of the first scene. */
	const inIntro = $derived(t < intro);
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

	/* Never plays by itself (Darren, 4 October): Play, or Sound on, starts it. */
	$effect(() => {
		if (!playing) return;
		let last = performance.now();
		let raf = requestAnimationFrame(function step(now) {
			t = Math.min(total, t + (now - last) / 1000);
			last = now;
			if (t >= total) {
				playing = false;
				/* The end of a chapter, reached by playing: the book may turn the page. */
				dispatchEvent(new CustomEvent('q-story-end', { detail: { id, voice: voiceOn } }));
			}
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
	let voiceOn = $state(false);
	/*
	 * Sound on is where it starts (Darren, 4 October): with it on, a story
	 * starts from the beginning, speaking, as soon as its chapter is opened.
	 * The header's read-aloud being on counts as sound on.
	 */
	$effect(() => {
		const remembered = rememberedVoice();
		const carried = carry;
		carry = null;
		voiceOn = carried?.voice || remembered || untrack(() => speech.on);
		untrack(() => (storyVoice.on = voiceOn));
		if (voiceOn || carried) {
			t = 0;
			playing = true;
		}
	});
	/* The header switched off while it had handed this story its turn: stop telling it. */
	$effect(() => {
		if (!speech.on && untrack(() => !!finished)) {
			finished = null;
			playing = false;
			stopVoice();
		}
	});
	/*
	 * The header reading the page aloud reaches this story (data-read-deck):
	 * it plays from the start with its voice, and says when it has finished,
	 * so the reading carries on after it.
	 */
	let finished: (() => void) | null = null;
	$effect(() => {
		if (!root) return;
		const tell = (e: Event) => {
			finished = (e as CustomEvent<{ done: () => void }>).detail.done;
			voiceOn = true;
			storyVoice.on = true;
			t = 0;
			playing = true;
		};
		root.addEventListener('q-tell', tell);
		return () => root?.removeEventListener('q-tell', tell);
	});
	$effect(() => {
		if (t >= total && total > 0 && finished) {
			const done = finished;
			finished = null;
			done();
		}
	});
	/* Sound on or off, from this story's speaker or the book's: one switch. */
	function setVoice(on: boolean) {
		setStoryVoice(on);
	}
	$effect(() => {
		const on = storyVoice.on;
		untrack(() => {
			if (on === voiceOn) return;
			voiceOn = on;
			if (on && !playing) toggle();
			if (!on) stopVoice();
		});
	});
	let audio: HTMLAudioElement | null = null;
	let spokenScene = -1;
	function stopVoice() {
		audio?.pause();
		if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
		spokenScene = -1;
	}
	/* Keep the voice with the picture: the right scene, at the right moment in it. */
	$effect(() => {
		if (!voiceOn || !playing || hidden) return void stopVoice();
		if (!toldReady) return;
		/* Segment 0 is the chapter's title; then each scene. */
		const n = inIntro ? 0 : scene;
		const into = inIntro ? t : t - (starts[n - 1] ?? 0) - (n === 1 ? intro : 0);
		const rec = inIntro ? introTold : told[n - 1];
		if (rec) {
			if (!audio) {
				audio = new Audio();
				voices.add(audio);
			}
			const src = new URL(rec.file, location.href).href;
			if (audio.src !== src) {
				quietAll(audio);
				audio.src = src;
				audio.currentTime = Math.max(0, into);
				void audio.play().catch(() => {});
			} else if (audio.paused && !audio.ended && into < audio.duration - 0.1) {
				quietAll(audio);
				audio.currentTime = Math.max(0, into);
				void audio.play().catch(() => {});
			} else if (!audio.paused && Math.abs(audio.currentTime - into) > 0.5) audio.currentTime = Math.max(0, into);
		} else if (spokenScene !== n && into < 0.5 && typeof speechSynthesis !== 'undefined') {
			quietAll();
			const u = new SpeechSynthesisUtterance(n === 0 ? introText : `${scenes[n - 1].title}. ${scenes[n - 1].says}`);
			u.lang = 'en-GB';
			speechSynthesis.speak(u);
		}
		spokenScene = n;
	});
	$effect(() => () => {
		stopVoice();
		if (audio) {
			audio.removeAttribute('src');
			audio.load();
			voices.delete(audio);
			audio = null;
		}
	});

	/*
	 * The word being said, lit as on the front door (lib/voice/highlight):
	 * from the recording's own word timings, or estimated from the words when
	 * the browser's voice is reading. Only while the story is being told.
	 */
	const sceneWords = $derived(scenes.map((s) => ({ title: wordsOf(s.title) as string[], says: wordsOf(s.says) as string[] })));
	const litWord = $derived.by(() => {
		if (!voiceOn || !playing || inIntro) return -1;
		const n = scene - 1;
		const into = t - (starts[n] ?? 0) - (n === 0 ? intro : 0);
		const onPage = sceneWords[n].title.length + sceneWords[n].says.length;
		const heard = told[n]?.words;
		if (heard?.length) return shown(wordAt(heard, into), heard.length, onPage);
		const s = scenes[n];
		return wordAt(estimate(`${s.title} ${s.says}`, (s.title.length + s.says.length) / 14), into);
	});
	const NOW = 'preset-filled-secondary-50-950 rounded-xs';
	const introWords = $derived(wordsOf(introText) as string[]);
	const introLit = $derived.by(() => {
		if (!voiceOn || !playing || !inIntro) return -1;
		const heard = introTold?.words;
		if (heard?.length) return shown(wordAt(heard, t), heard.length, introWords.length);
		return wordAt(estimate(introText, introText.length / 14), t);
	});
</script>

{#if hidden}
	<button type="button" class="btn preset-tonal min-h-11 self-start" onclick={() => setHidden(false)}>
		<Icon name="play" size={16} /> Show the story: {title}
	</button>
{:else}
	<section bind:this={root} data-read-deck={id} class="scroll-mt-24 card preset-outlined-surface-200-800 bg-surface-50-950 p-4 sm:p-6 flex flex-col gap-5 w-full max-w-3xl min-w-0" aria-roledescription="carousel" aria-label={title}>
		<header class="flex flex-wrap items-center gap-3 min-h-11">
			<h2 class="h5 font-normal flex-1 min-w-0">{#each introWords as word, k (k)}<span class="transition-colors {k === introLit ? NOW : ''}">{word}</span>{k < introWords.length - 1 ? ' ' : ''}{/each}</h2>
			{#if !storyVoice.inBook}<button type="button" class="btn-icon min-h-11 min-w-11 {voiceOn ? 'preset-filled-primary-500' : 'preset-tonal'}" aria-label={voiceOn ? 'Sound off' : 'Sound on: tell the story aloud'} title={voiceOn ? 'Sound off' : 'Sound on'} aria-pressed={voiceOn} onclick={() => setVoice(!voiceOn)}>
				<Icon name={voiceOn ? 'speaker' : 'speaker-off'} size={18} />
			</button>{/if}
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
				{@const w = sceneWords[i]}
				{@const lit = i + 1 === scene ? litWord : -1}
				<div class={i + 1 === scene ? '' : 'sr-only'} role="group" aria-roledescription="slide" aria-label="Scene {i + 1} of {N}">
					<p class="h4 font-normal">{#each w.title as word, k (k)}<span class="transition-colors {k === lit ? NOW : ''}">{word}</span>{k < w.title.length - 1 ? ' ' : ''}{/each}</p>
					<p class="text-surface-700-300 text-balance max-w-2xl mx-auto">{#each w.says as word, k (k)}<span class="transition-colors {w.title.length + k === lit ? NOW : ''}">{word}</span>{k < w.says.length - 1 ? ' ' : ''}{/each}</p>
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
						<Slider.Marker value={Math.round((starts[i] ?? 0) * 10)}><span class="block w-0.5 h-3 rounded-full {i + 1 <= scene ? 'bg-primary-500' : 'bg-surface-400-600'}" aria-hidden="true"></span><span class="sr-only">Scene {i + 1}</span></Slider.Marker>
					{/each}
				</Slider.MarkerGroup>
			</Slider>
			<span class="text-xs tabular-nums opacity-70 shrink-0 w-20 text-right">{clock(t)} / {clock(total)}</span>
			<!-- Share the scene shown: its link opens the story at this scene. -->
			{#if sceneLink && shareable}
				<ShareButton link={sceneLink} title="{title}: {scenes[scene - 1].title}" message={scenes[scene - 1].says} label="Share this scene" open={DECK_WORDS[id]?.open ?? false} />
			{/if}
		</div>
	</section>
{/if}
