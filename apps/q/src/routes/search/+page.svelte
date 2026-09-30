<script lang="ts">
	/*
	 * Search Page - Live results as you search
	 */
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { FaIcon } from '@inqbeta/q-ui';
	
	// Get query from URL
	let query = $derived(page.url.searchParams.get('q') || '');
	
	interface SearchResult {
		type: 'navigation' | 'data' | 'suggestion';
		label: string;
		description: string;
		icon: string;
		action?: string;
	}
	
	let results = $derived<SearchResult[]>([]);
	let history = $state<{role: 'user' | 'ai', text: string}[]>([]);
	
	// Generate results based on query
	$effect(() => {
		if (query) {
			const q = query.toLowerCase();
			
			// Navigation results
			const navResults: SearchResult[] = [];
			if (q.includes('key')) navResults.push({type: 'navigation', label: 'Keys', description: 'Manage your passkeys', icon: 'key', action: '/keys'});
			if (q.includes('file') || q.includes('folder')) navResults.push({type: 'navigation', label: 'Files', description: 'Your data folder', icon: 'folder', action: '/data'});
			if (q.includes('fed') || q.includes('member')) navResults.push({type: 'navigation', label: 'Federations', description: 'Manage federations', icon: 'users', action: '/federations'});
			if (q.includes('page')) navResults.push({type: 'navigation', label: 'My Pages', description: 'Custom page layouts', icon: 'layout', action: '/my-pages'});
			if (q.includes('receipt')) navResults.push({type: 'navigation', label: 'Receipts', description: 'View all receipts', icon: 'receipt', action: '/receipts'});
			if (q.includes('contact')) navResults.push({type: 'navigation', label: 'Contacts', description: 'Your address book', icon: 'contact', action: '/contacts'});
			if (q.includes('device')) navResults.push({type: 'navigation', label: 'Devices', description: 'Linked devices', icon: 'device', action: '/devices'});
			if (q.includes('bal') || q.includes('wallet')) navResults.push({type: 'navigation', label: 'Balance', description: 'Your balance', icon: 'wallet', action: '/balance'});
			if (q.includes('exchan')) navResults.push({type: 'navigation', label: 'Exchanges', description: 'Value transfers', icon: 'exchange', action: '/exchanges'});
			if (q.includes('node')) navResults.push({type: 'navigation', label: 'Nodes', description: 'Copy locations', icon: 'node', action: '/nodes'});
			if (q.includes('setting')) navResults.push({type: 'navigation', label: 'Settings', description: 'App settings', icon: 'settings', action: '/settings'});
			
			// Data results (mock)
			const dataResults: SearchResult[] = [
				{type: 'data', label: 'Recent receipt', description: 'Created 2 hours ago', icon: 'receipt'},
				{type: 'data', label: 'Federation invite', description: 'From Dark Olive', icon: 'users'},
			];
			
			// Suggestions
			const suggestions: SearchResult[] = [
				{type: 'suggestion', label: `Show me my ${query}`, description: 'View items matching your search', icon: 'search'},
				{type: 'suggestion', label: `What's new about ${query}?`, description: 'Get AI summary', icon: 'sparkles'},
			];
			
			results = [...navResults, ...dataResults, ...suggestions];
		} else {
			results = [];
		}
	});
	
	function handleResult(result: SearchResult) {
		if (result.action) {
			goto(result.action);
		}
	}
</script>

<svelte:head><title>Search{query ? ` - ${query}` : ''} — Q</title></svelte:head>

<div class="min-h-screen p-6">
	<h1 class="h2 mb-6">
		{#if query}
			Results for "{query}"
		{:else}
			Search
		{/if}
	</h1>
	
	{#if query && results.length > 0}
		<!-- Results Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
			{#each results as result}
				<button
					type="button"
					onclick={() => handleResult(result)}
					class="flex items-start gap-4 p-4 rounded-container preset-tonal hover:preset-tonal-primary text-left transition-colors border border-surface-200-800"
				>
					<div class="p-2 rounded-container bg-surface-200-800 shrink-0">
						<FaIcon name={result.icon} class="w-5 h-5" />
					</div>
					<div>
						<div class="font-medium">{result.label}</div>
						<div class="text-sm opacity-60">{result.description}</div>
					</div>
				</button>
			{/each}
		</div>
		
		<!-- Continuation -->
		<div class="border-t border-surface-200-800 pt-6">
			<h3 class="text-sm font-medium opacity-50 mb-3">CONTINUE CONVERSATION</h3>
			<div class="flex flex-wrap gap-2">
				<button type="button" class="chip preset-tonal hover:preset-filled-primary-500">
					Show me more
				</button>
				<button type="button" class="chip preset-tonal hover:preset-filled-primary-500">
					Find related
				</button>
				<button type="button" class="chip preset-tonal hover:preset-filled-primary-500">
					Tell me more
				</button>
			</div>
		</div>
	{:else if query}
		<p class="text-center opacity-50 py-8">No results found for "{query}"</p>
	{:else}
		<p class="text-center opacity-50 py-8">Type in the search bar to find what you're looking for</p>
	{/if}
</div>
