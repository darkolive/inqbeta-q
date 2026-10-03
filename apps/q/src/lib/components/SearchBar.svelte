<script lang="ts">
	/*
	 * SearchBar - Live search in header
	 * As you type/speak, results appear on search page
	 */
	import { onDestroy } from 'svelte';
	import { FaIcon } from '@inqbeta/q-ui';
	import { goto } from '$app/navigation';
	
	let listening = $state(false);
	let query = $state('');
	let isFocused = $state(false);
	let inputEl: HTMLInputElement;
	let canvasEl: HTMLCanvasElement;
	
	// Debounced navigation to search page
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	
	function navigateToSearch() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			if (query.trim()) {
				// Navigate to search page with query
				goto(`/search?q=${encodeURIComponent(query.trim())}`);
			}
		}, 300); // 300ms delay
	}
	
	// Voice commands
	const voiceCommands: Record<string, string> = {
		'home': '/', 'overview': '/', 'keys': '/keys', 'files': '/data',
		'receipts': '/receipts', 'federations': '/federations', 'nodes': '/nodes',
		'devices': '/devices', 'contacts': '/contacts', 'exchanges': '/exchanges',
		'pages': '/my-pages', 'my pages': '/my-pages', 'balance': '/balance',
		'settings': '/settings',
	};
	
	let recognition: any = null;
	
	function initSpeech() {
		if (typeof window === 'undefined') return;
		const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SpeechRecognition) return;
		
		recognition = new SpeechRecognition();
		recognition.continuous = true;
		recognition.interimResults = true;
		
		recognition.onresult = (event: any) => {
			const transcript = Array.from(event.results)
				.map((r: any) => r[0].transcript).join('').toLowerCase().trim();
			
			// Check voice commands first
			for (const [cmd, path] of Object.entries(voiceCommands)) {
				if (transcript.includes(cmd)) {
					query = '';
					goto(path);
					stopListening();
					return;
				}
			}
			
			query = transcript;
			navigateToSearch();
		};
		
		recognition.onend = () => { if (listening) try { recognition?.start(); } catch {} };
		recognition.onerror = () => { listening = false; };
	}
	
	function startListening() {
		if (!recognition) initSpeech();
		listening = true;
		try { recognition?.start(); } catch (e) { console.error(e); }
	}
	
	function stopListening() {
		listening = false;
		try { recognition?.stop(); } catch {}
	}
	
	function toggleMic() {
		if (listening) stopListening(); else startListening();
	}
	
	function handleFocus() {
		isFocused = true;
	}
	
	function handleBlur() {
		isFocused = false;
	}
	
	function handleInput() {
		// Navigate to search page as you type
		navigateToSearch();
	}
	
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			query = '';
		} else if (e.key === 'Enter' && query.trim()) {
			goto(`/search?q=${encodeURIComponent(query.trim())}`);
		}
	}
	
	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
	});
</script>

<!-- On a phone it has its own row under the logo and switches (3 October 2026: the page slid sideways). -->
<div class="order-last basis-full md:order-none md:basis-auto md:flex-1 max-w-xl md:mx-4 min-w-0">
	<div class="flex items-center bg-surface-50-950 rounded-full border-2 border-surface-300-700 px-4 py-2.5 gap-3 {listening ? 'border-primary-500 ring-2 ring-primary-500/30' : ''}">
		<!-- Microphone -->
		<button type="button" onclick={toggleMic} class="shrink-0 p-2 rounded-full transition-colors {listening ? 'preset-filled-primary-500 animate-pulse' : 'hover:preset-tonal'}" aria-label={listening ? 'Stop' : 'Voice search'}>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
				<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3Z"/>
				<path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2Z"/>
			</svg>
		</button>
		
		<!-- Terminal icon -->
		{#if isFocused || !query}
			<span class="shrink-0 {isFocused ? 'animate-pulse' : ''}">
				<FaIcon name="terminal" class="text-surface-600-400" />
			</span>
		{/if}
		
		<!-- Input - navigates to search page as you type -->
		<input
			bind:this={inputEl}
			type="text"
			bind:value={query}
			onfocus={handleFocus}
			onblur={handleBlur}
			oninput={handleInput}
			onkeydown={handleKeydown}
			aria-label="Search"
			class="flex-1 bg-transparent border-none outline-none text-base text-surface-900-100 placeholder:text-surface-600-400"
		/>
		
		<!-- Search icon -->
		{#if query && !isFocused}
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5 text-surface-600-400 shrink-0">
				<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
			</svg>
		{/if}
	</div>
</div>
