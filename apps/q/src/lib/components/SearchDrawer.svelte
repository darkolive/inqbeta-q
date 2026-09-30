<script lang="ts">
	/*
	 * SearchDrawer - Full-page search results only
	 * Shows results + continuation options
	 */
	import { onMount, onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import { FaIcon } from '@inqbeta/q-ui';
	import { goto } from '$app/navigation';
	
	let visible = $state(false);
	
	interface SearchResult {
		type: 'navigation' | 'suggestion';
		label: string;
		description?: string;
		icon?: string;
		action?: string;
	}
	
	let query = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let conversationHistory = $state<{role: 'user' | 'ai', text: string}[]>([]);
	
	// Continuation options
	let continuationOptions = $state<string[]>([
		'Show me more',
		'Find related items',
		'Tell me more',
		'Try a different search'
	]);
	
	function handleOpenSearch() {
		visible = true;
	}
	
	onMount(() => {
		if (typeof window !== 'undefined') {
			window.addEventListener('open-search', handleOpenSearch);
		}
	});
	
	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('open-search', handleOpenSearch);
		}
	});
	
	export function close() {
		visible = false;
	}
	
	function handleResult(result: SearchResult) {
		if (result.action) {
			goto(result.action);
			close();
		}
	}
	
	function handleContinuation(text: string) {
		conversationHistory = [...conversationHistory, {role: 'user', text}];
		// Simulate AI response
		conversationHistory = [...conversationHistory, {role: 'ai', text: `Processing "${text}"...`}];
	}
	
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visible}
	<!--
		Backdrop. A <button> rather than a <div> with a click handler: clicking
		away to close is an action, and an action a mouse can do and a keyboard
		cannot is a door only some people can use. Escape closes it too
		(handleKeydown above), so this is the pointer's version of that and not
		its only version.
	-->
	<button
		type="button"
		class="bg-surface-50-950/50 fixed inset-0 z-40 cursor-default"
		aria-label="Close search"
		onclick={close}
	></button>
	
	<!-- Drawer -->
	<div class="fixed left-0 right-0 top-[73px] md:top-[81px] bottom-0 z-50 flex">
		<!-- Spacer for sidebar -->
		<div class="hidden md:block md:w-64 shrink-0"></div>
		
		<!-- Content -->
		<div class="flex-1 bg-surface-50-950 border-t border-surface-200-800 shadow-2xl overflow-hidden flex flex-col" transition:fly={{ y: -20, duration: 200 }}>
			<!-- Close button -->
			<div class="flex justify-end p-4">
				<button onclick={close} aria-label="Close search" class="btn-icon hover:preset-tonal">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5" aria-hidden="true">
						<path d="M18 6L6 18M6 6l12 12"/>
					</svg>
				</button>
			</div>
			
			<!-- Main content area -->
			<div class="flex-1 overflow-y-auto p-6">
				<!-- Conversation History -->
				{#if conversationHistory.length > 0}
					<div class="space-y-3 mb-6 max-w-2xl">
						{#each conversationHistory as msg}
							<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
								<div class="max-w-[80%] px-4 py-3 rounded-container {msg.role === 'user' ? 'preset-filled-primary-500' : 'preset-tonal'}">
									<p class="text-sm">{msg.text}</p>
								</div>
							</div>
						{/each}
					</div>
				{/if}
				
				<!-- Results Grid -->
				{#if searchResults.length > 0}
					<div class="mb-6">
						<h3 class="text-sm font-medium opacity-50 mb-3">RESULTS</h3>
						<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl">
							{#each searchResults as result}
								<button
									type="button"
									onclick={() => handleResult(result)}
									class="flex items-start gap-4 p-4 rounded-container preset-tonal hover:preset-tonal-primary text-left transition-colors border border-surface-200-800"
								>
									{#if result.icon}
										<FaIcon name={result.icon} class="w-5 h-5 text-primary-500" />
									{/if}
									<div>
										<div class="font-medium">{result.label}</div>
										{#if result.description}
											<div class="text-sm opacity-60">{result.description}</div>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}
				
				<!-- Continuation Options -->
				<div>
					<h3 class="text-sm font-medium opacity-50 mb-3">CONTINUE CONVERSATION</h3>
					<div class="flex flex-wrap gap-2 max-w-2xl">
						{#each continuationOptions as option}
							<button
								type="button"
								onclick={() => handleContinuation(option)}
								class="chip preset-tonal hover:preset-filled-primary-500"
							>
								{option}
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

