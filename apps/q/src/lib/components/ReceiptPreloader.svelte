<script lang="ts">
	import type { ReceiptState } from '@inqbeta/q-core/offline-queue';

	interface Props {
		/** Current download state */
		state?: ReceiptState;
		/** Download progress 0-100 */
		progress?: number;
		/** Content to show when ready */
		children?: import('svelte').Snippet;
	}

	let { state = 'pending', progress = 0, children }: Props = $props();

	// Map receipt state to UI state
	const uiState = $derived(() => {
		switch (state) {
			case 'pending':
				return 'waiting';
			case 'receiving':
				return 'loading';
			case 'received':
			case 'opened':
				return 'ready';
			case 'failed':
				return 'error';
			default:
				return 'waiting';
		}
	});

	const percent = $derived(Math.round(progress));
</script>

<!-- Skeleton only: tokens for colour, the native progress bar Skeleton styles, Tailwind's spin. -->
{#if uiState() === 'waiting'}
	<div class="flex min-h-48 flex-col items-center justify-center gap-4 p-8 text-surface-700-300" role="status" aria-live="polite">
		<div class="size-8 rounded-full border-4 border-current border-t-transparent motion-safe:animate-spin" aria-hidden="true"></div>
		<p>Waiting to receive…</p>
	</div>
{:else if uiState() === 'loading'}
	<div class="flex min-h-48 w-full flex-col items-center justify-center gap-4 p-8">
		<progress class="progress" value={percent} max="100" aria-label="Receiving"></progress>
		<p>Receiving… {percent}%</p>
	</div>
{:else if uiState() === 'error'}
	<div class="flex min-h-48 flex-col items-center justify-center gap-4 p-8 text-error-600-400" role="alert">
		<p>Failed to receive receipt</p>
		{#if progress > 0}
			<p class="text-sm opacity-70">Received {percent}% before failure</p>
		{/if}
	</div>
{:else if children}
	{@render children()}
{/if}
