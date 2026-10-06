<script lang="ts">
	/*
	 * Export as video (ADR-Q-033; 6 October 2026). Darren: "export … a video
	 * version of that story with the downloaded voice from ElevenLabs speaking
	 * it … a really nice promo piece then that you could put on social media."
	 *
	 * One question at a time: whose voice (kept with the book), what shape,
	 * whose name on the end card. Then the voice is recorded (cost agreed
	 * first; lines already recorded in that voice cost nothing), and the MP4
	 * is made here in the browser, frame by frame, to watch and save.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { tick } from 'svelte';
	import { finished, setVoice, type Book, type BookStep, type Story } from '@inqbeta/q-core/storybook';
	import { SHAPES, canExport, linesOf, makeVideo, missingLines, quoteVoice, recordLines, type Shape } from '$lib/video/export';
	let { book, steps, commit, story }: { book: Book; steps: BookStep[]; commit: (s: BookStep[]) => void; story: Story } = $props();
	const id = $props.id();

	let open = $state(false);
	let voices = $state<{ id: string; name: string; own: boolean; about: string }[] | null>(null);
	let house = $state<string | null>(null);
	let why = $state('');
	let shape = $state<Shape>('tall');
	let name = $state('');
	let missing = $state<string[] | null>(null);
	let upTo = $state<number | null>(null);
	let busy = $state(false);
	let stop = $state(false);
	let progress = $state<{ done: number; says: string } | null>(null);
	let said = $state('');
	let video = $state<{ url: string; file: string; opus?: boolean } | null>(null);

	const voice = $derived(book.voice?.id ?? house ?? '');
	async function start() {
		open = true;
		said = '';
		try {
			const r = await fetch('/api/voice');
			const out = (await r.json().catch(() => null)) as { ok?: boolean; voices?: typeof voices; house?: string | null; says?: string } | null;
			voices = out?.voices ?? [];
			house = out?.house ?? null;
			why = out?.ok ? '' : (out?.says ?? 'Recording needs the host’s own computer, with an ElevenLabs key.');
		} catch {
			voices = [];
			why = 'Recording needs the host’s own computer, with an ElevenLabs key.';
		}
		await check();
	}
	async function check() {
		upTo = null;
		missing = voice ? await missingLines(voice, linesOf(story)) : null;
		if (missing?.length && !why) upTo = await quoteVoice(missing).catch((e) => ((said = e.message), null));
	}
	async function choose(v: { id: string; name: string }) {
		commit(await setVoice(steps, book.id, v, 'Whose voice speaks the videos?'));
		await tick();
		await check();
	}
	async function record() {
		if (!missing?.length || upTo === null) return;
		busy = true;
		said = '';
		try {
			await recordLines(voice, missing, upTo);
			await check();
		} catch (e) {
			said = e instanceof Error ? e.message : String(e);
		}
		busy = false;
	}
	async function make() {
		busy = true;
		stop = false;
		said = '';
		if (video) URL.revokeObjectURL(video.url);
		video = null;
		try {
			const cant = await canExport(shape);
			if (cant) throw new Error(cant);
			const blob = await makeVideo(book, story, { shape, voice, name, onprogress: (p) => (progress = p), stop: () => stop });
			video = { opus: blob.type.includes('codecs'), url: URL.createObjectURL(blob), file: `${(story.title || 'story').replace(/[^\w\s-]/g, '').trim() || 'story'} (${shape}).mp4` };
		} catch (e) {
			said = e instanceof Error ? e.message : String(e);
		}
		progress = null;
		busy = false;
	}
</script>

<section class="card preset-outlined-surface-200-800 p-4 sm:p-6 flex flex-col gap-4 w-full max-w-3xl" aria-label="Export as video">
	<p class="h6 font-normal flex items-center gap-2"><Icon name="download" size={18} /> Export as video</p>
	{#if !open}
		<p class="text-surface-700-300">An MP4 of this story, spoken in a real voice, with its words lighting up as they’re said, ready for social media. {finished(story) ? 'It uses your final build.' : 'Make it final first for the best result.'}</p>
		<div><button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={start}>Make a video</button></div>
	{:else}
		<fieldset class="flex flex-col gap-2">
			<legend class="h6 font-normal mb-1">Whose voice?</legend>
			{#if why}
				<p class="text-surface-700-300">{why}</p>
			{:else if voices === null}
				<p class="text-surface-700-300">Finding the voices…</p>
			{:else}
				<div class="flex flex-col gap-1 max-h-64 overflow-y-auto">
					{#each voices as v (v.id)}
						<label class="flex items-center gap-3 min-h-11">
							<input type="radio" class="radio" name="{id}-voice" checked={voice === v.id} onchange={() => choose(v)} />
							<span>{v.name}{v.own ? ' (your own)' : ''}{v.id === house ? ' · Q’s voice' : ''}{#if v.about}<span class="block text-xs opacity-70">{v.about}</span>{/if}</span>
						</label>
					{/each}
				</div>
			{/if}
		</fieldset>

		<fieldset class="flex flex-col gap-2">
			<legend class="h6 font-normal mb-1">What shape?</legend>
			{#each Object.entries(SHAPES) as [k, s] (k)}
				<label class="flex items-center gap-3 min-h-11"><input type="radio" class="radio" name="{id}-shape" checked={shape === k} onchange={() => (shape = k as Shape)} /> <span>{s.name}<span class="block text-xs opacity-70">{s.for}</span></span></label>
			{/each}
		</fieldset>

		<label class="flex flex-col gap-1">
			<span class="h6 font-normal">Your name on the end card</span>
			<span class="text-sm text-surface-700-300">Leave it empty for none.</span>
			<input class="input text-lg max-w-md" maxlength="60" bind:value={name} />
		</label>

		{#if voice && missing?.length && upTo !== null}
			<div class="card preset-tonal p-3 flex flex-col gap-2">
				<p>{missing.length === linesOf(story).length ? 'The voice isn’t recorded yet.' : `${missing.length} ${missing.length === 1 ? 'line has' : 'lines have'} changed since it was recorded.`} Recording costs up to {upTo} credits, with the host’s ElevenLabs account. Recordings are kept, so the next video costs nothing.</p>
				<div><button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy} onclick={record}>{busy ? 'Recording…' : 'Agree, and record'}</button></div>
			</div>
		{:else if voice && missing && !missing.length}
			{#if progress}
				<p aria-live="polite">{progress.says}…</p>
				<div class="h-2 w-full rounded-full bg-surface-200-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.done * 100)} aria-label="Making the video"><div class="h-full bg-primary-500" style="width:{progress.done * 100}%"></div></div>
				<div><button type="button" class="btn preset-tonal min-h-11" disabled={stop} onclick={() => (stop = true)}>Stop</button></div>
			{:else}
				<div><button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy} onclick={make}><Icon name="play" size={18} /> Make the video</button></div>
			{/if}
		{/if}

		{#if video}
			<!-- svelte-ignore a11y_media_has_caption: the captions are in the picture, lighting as each word is said -->
			<video src={video.url} controls class="w-full max-h-[70vh] rounded-container bg-black"></video>
			<div class="flex flex-wrap gap-3">
				<a class="btn preset-filled-primary-500 min-h-11" href={video.url} download={video.file}><Icon name="download" size={18} /> Save the video</a>
			</div>
			{#if video.opus}<p class="text-sm text-surface-700-300">This browser can’t make the most common video format, so this one is VP9 or Opus inside: YouTube and most sites take it. For Instagram and TikTok, make it in Chrome or Edge on a Mac or Windows, or in Safari.</p>{/if}
		{/if}
		{#if said}<p class="text-error-700-300" role="alert">{said}</p>{/if}
	{/if}
</section>
