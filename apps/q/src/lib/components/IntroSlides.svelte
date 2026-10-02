<script lang="ts">
	/*
	 * What this page is, in slides (Darren, 2 October 2026): "each dashboard
	 * page, starting with a closable panel that runs through what this section
	 * is that you're looking at, how it works, why, what you can do, and doing
	 * it in slides … in the same styling throughout."
	 *
	 * One panel, used the same way on every page: a few short slides, Back and
	 * Next, dots for where you are, read aloud, and close. Closed, it stays
	 * closed on this device for this person, and "What is this page?" brings it
	 * back. Nothing moves on its own.
	 */
	import { Icon } from '@inqbeta/q-ui';

	let {
		id,
		section,
		slides
	}: {
		/** Which page this is, so closing it is remembered for this page only. */
		id: string;
		/** The page's name, said at the top: "About Members". */
		section: string;
		slides: { title: string; says: string }[];
	} = $props();

	const KEY = 'q.intro.closed';
	function readClosed(): Record<string, boolean> {
		try {
			return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
		} catch {
			return {};
		}
	}
	function remember(closed: boolean) {
		try {
			const all = readClosed();
			if (closed) all[id] = true;
			else delete all[id];
			localStorage.setItem(KEY, JSON.stringify(all));
		} catch {
			/* not remembered, which is fine */
		}
	}

	let closed = $state(false);
	let at = $state(0);
	$effect(() => {
		closed = !!readClosed()[id];
		at = 0;
	});
	const slide = $derived(slides[Math.min(at, slides.length - 1)]);
	const last = $derived(at >= slides.length - 1);

	function close() {
		stopVoice();
		closed = true;
		remember(true);
	}
	function open() {
		at = 0;
		closed = false;
		remember(false);
	}
	function next() {
		stopVoice();
		if (last) close();
		else at += 1;
	}
	function back() {
		stopVoice();
		at = Math.max(0, at - 1);
	}

	/* Read this slide aloud with the browser's voice. */
	let speaking = $state(false);
	function stopVoice() {
		if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
		speaking = false;
	}
	function readAloud() {
		if (typeof speechSynthesis === 'undefined' || !slide) return;
		if (speaking) return stopVoice();
		const u = new SpeechSynthesisUtterance(`${slide.title}. ${slide.says}`);
		u.lang = document.documentElement.lang;
		u.onend = u.onerror = () => (speaking = false);
		speaking = true;
		speechSynthesis.speak(u);
	}
</script>

{#if !slides.length}
	<!-- nothing to say -->
{:else if closed}
	<button type="button" class="btn btn-sm preset-tonal min-h-11 mb-6" onclick={open}>
		<Icon name="info" size={16} /> What is this page?
	</button>
{:else}
	<section class="card preset-outlined-primary-500 bg-surface-50-950 p-5 sm:p-6 mb-6 flex flex-col gap-4" aria-label="About {section}" aria-roledescription="slides">
		<div class="flex items-center gap-3">
			<span class="text-xs font-bold uppercase tracking-wider text-primary-700-300">About {section} · {at + 1} of {slides.length}</span>
			<span class="flex-1"></span>
			<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label={speaking ? 'Stop reading' : 'Read this aloud'} aria-pressed={speaking} onclick={readAloud}>
				<Icon name="speaker" size={18} />
			</button>
			<button type="button" class="btn-icon preset-tonal min-h-11 min-w-11" aria-label="Close this panel" onclick={close}>
				<Icon name="close" size={18} />
			</button>
		</div>
		<div aria-live="polite">
			<h2 class="h4 mb-2">{slide.title}</h2>
			<p class="text-lg max-w-3xl">{slide.says}</p>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<button type="button" class="btn preset-tonal min-h-11" disabled={at === 0} onclick={back}>Back</button>
			<span class="flex gap-1.5" aria-hidden="true">
				{#each slides as _, n (n)}
					<span class="size-2.5 rounded-full {n === at ? 'bg-primary-500' : 'bg-surface-300-700'}"></span>
				{/each}
			</span>
			<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={next}>{last ? 'Got it' : 'Next'}</button>
		</div>
	</section>
{/if}
