<script lang="ts">
	/*
	 * A link to hand to someone: copy it, or let them scan it.
	 *
	 * The packet lives in the #fragment, which browsers never send to a server,
	 * so the link can travel by message, email or a phone held up to a screen.
	 * Copying follows Skeleton's clipboard cookbook (navigator.clipboard).
	 */
	import { QrCode } from '@skeletonlabs/skeleton-svelte';

	let { link, label = 'Link', note = '' }: { link: string; label?: string; note?: string } = $props();

	/* A link made on a dev server points at this computer: a phone can't open it. */
	/* A QR code holds about 2,900 characters; past that, only the link works. */
	const scannable = $derived(link.length <= 2800);
	const local = $derived(/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(link));

	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 2500);
		} catch {
			copied = false;
		}
	}
</script>

<div class="card preset-outlined-surface-200-800 p-4 flex flex-col gap-4 sm:flex-row sm:items-start">
	{#if scannable}
		<div class="shrink-0 bg-surface-50 p-2 rounded-container self-center sm:self-start">
			<QrCode value={link}>
				<QrCode.Frame class="size-48">
					<QrCode.Pattern />
				</QrCode.Frame>
			</QrCode>
		</div>
	{/if}
	<div class="flex flex-col gap-3 min-w-0">
		<p class="font-bold">{label}</p>
		{#if note}<p class="text-sm">{note}</p>{/if}
		{#if !scannable}<p class="text-sm">Too much to fit in a code to scan (it carries a picture) — copy the link instead.</p>{/if}
		{#if local}
			<p class="text-sm card preset-tonal-warning p-2">
				This link points at this computer (localhost), so a phone can’t open it. Make it on inqbeta.dev to share it.
			</p>
		{/if}
		<input class="input text-xs" type="text" readonly value={link} aria-label={label} onfocus={(e) => e.currentTarget.select()} />
		<div class="flex flex-wrap gap-3">
			<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={copy}>
				{copied ? 'Copied' : 'Copy link'}
			</button>
		</div>
	</div>
</div>
