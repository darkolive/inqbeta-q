<script lang="ts">
	/*
	 * A coin (5 October 2026, ADR-Q-035): every minted credit shows as a coin
	 * carrying its QR code. Darren: "every coin has this … you see a coin, you
	 * can scan it, and you can verify it straight away as being a legitimate
	 * minted coin and the state of its reserves and reputation."
	 *
	 * Drawn plainly, like an old Chinese coin: a circle of brand orange
	 * (secondary-500) with the code straight on it, in the page's own surface
	 * colour — light on orange in light mode, dark on orange in dark mode.
	 *
	 * The code opens /verify/<mint> on the host that minted it: the mint's
	 * live books, read from the mint itself, as on DoStudy's verify page —
	 * nothing to sign in to, nothing uploaded. Tapping the coin goes there too.
	 */
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
	import { page } from '$app/state';

	let { mint, size = 'md', name = '' }: { mint: string; size?: 'sm' | 'md' | 'lg'; name?: string } = $props();

	/* Where the coin's code leads: the verify page for this mint, on the host that made it. */
	const href = $derived(`/verify/${encodeURIComponent(mint)}`);
	/* A DID's characters are all safe in a path, so the code carries it as it is: fewer characters, an easier code to read. */
	const url = $derived(`${page.url.origin}/verify/${/^[A-Za-z0-9:._-]+$/.test(mint) ? mint : encodeURIComponent(mint)}`);
	const DIAMETER = { sm: 'size-20', md: 'size-32', lg: 'size-56' } as const;
</script>

<a
	{href}
	class="relative inline-grid place-items-center rounded-full shrink-0 bg-secondary-500 {DIAMETER[size]}"
	aria-label="{name ? `A ${name} coin` : 'A minted coin'}: scan or tap to check it"
	title="Scan or tap to check this coin"
>
	<!-- the code straight on the orange, drawn in the page's own surface colour -->
	<QrCode value={url} class="w-[63%] aspect-square grid place-items-center">
		<!-- Skeleton gives the frame a light ground and the pattern a dark fill (qr-code.css); both are set here instead, so the code sits on the orange itself. -->
		<QrCode.Frame class="size-full" aria-hidden="true" style="background-color: transparent">
			<QrCode.Pattern style="fill: var(--color-surface-50-950)" />
		</QrCode.Frame>
	</QrCode>
</a>
