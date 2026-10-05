<script lang="ts">
	/*
	 * Say it instead of typing it (Darren, 5 October 2026: "explain with an
	 * audio mic"). The words appear in the field as they're heard, after
	 * whatever was there, so they can be read back and fixed. Uses the
	 * browser's own speech recognition (as the search bar does); where there
	 * is none, the button isn't shown. Press again to stop.
	 */
	import { Icon } from '@inqbeta/q-ui';
	let { value = $bindable(''), label = 'Say it', onheard }: { value?: string; label?: string; onheard?: () => void } = $props();

	type Rec = { start(): void; stop(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null };
	let can = $state(false);
	let listening = $state(false);
	let said = $state('');
	let rec: Rec | null = null;
	let base = '';
	$effect(() => {
		const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
		can = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
		return () => stop();
	});
	function start() {
		const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
		const R = w.SpeechRecognition || w.webkitSpeechRecognition;
		if (!R) return;
		rec = new R();
		rec.continuous = true;
		rec.interimResults = true;
		rec.lang = 'en-GB';
		base = value.trim();
		said = '';
		rec.onresult = (e) => {
			const heard = Array.from(e.results, (r) => r[0].transcript).join('').trim();
			value = base ? `${base} ${heard}` : heard;
			onheard?.();
		};
		rec.onend = () => {
			if (listening) {
				/* Browsers stop after a pause: carry on from what's there until the person presses stop. */
				base = value.trim();
				try {
					rec?.start();
				} catch {
					listening = false;
				}
			}
		};
		rec.onerror = (e) => {
			listening = false;
			said = e.error === 'not-allowed' ? 'The microphone isn’t allowed for this site. Allow it in the browser, or type instead.' : e.error === 'no-speech' ? '' : 'The microphone stopped. Press to try again.';
		};
		listening = true;
		try {
			rec.start();
		} catch {
			listening = false;
		}
	}
	function stop() {
		listening = false;
		try {
			rec?.stop();
		} catch {
			/* already stopped */
		}
		rec = null;
	}
</script>

{#if can}
	<span class="inline-flex flex-col gap-1">
		<button type="button" class="btn min-h-11 {listening ? 'preset-filled-secondary-500' : 'preset-tonal'}" aria-pressed={listening} onclick={() => (listening ? stop() : start())}>
			<Icon name={listening ? 'mic-off' : 'mic'} size={18} />
			{listening ? 'Stop listening' : label}
		</button>
		{#if listening}<span class="text-xs text-secondary-700-300" aria-live="polite">Listening… speak, then press stop.</span>{/if}
		{#if said}<span class="text-xs text-error-700-300" role="alert">{said}</span>{/if}
	</span>
{/if}
