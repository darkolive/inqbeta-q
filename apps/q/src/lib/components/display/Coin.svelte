<script lang="ts">
	/*
	 * A coin (5 October 2026, ADR-Q-035): every minted credit shows as a coin
	 * carrying its QR code. Darren: "every coin has this … you see a coin, you
	 * can scan it, and you can verify it straight away as being a legitimate
	 * minted coin and the state of its reserves and reputation."
	 *
	 * Its bank designs it (CoinDesign, signed into the publication): a shape —
	 * a plain circle like an old Chinese coin, a square, a hexagon, a shield, or
	 * a skull and crossbones, or its own picture (its logo) — a colour, the
	 * code's own colour and what's behind it, and a mark in the middle. A
	 * picture with a shape is laid inside the shape. With a mark, the code is
	 * made with the strongest error correction, so it still reads with the
	 * middle covered.
	 *
	 * The code opens /verify/<mint> on the host that minted it: the mint's
	 * live books, as on DoStudy's verify page. Tapping the coin goes there too.
	 */
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
	import { page } from '$app/state';
	import { DEFAULT_COIN, type CoinDesign } from '@inqbeta/q-core/money';

	let { mint, size = 'md', name = '', design = DEFAULT_COIN }: { mint: string; size?: 'sm' | 'md' | 'lg'; name?: string; design?: CoinDesign } = $props();

	/* Where the coin's code leads: the verify page for this mint, on the host that made it. */
	const href = $derived(`/verify/${encodeURIComponent(mint)}`);
	/* A DID's characters are all safe in a path, so the code carries it as it is: fewer characters, an easier code to read. */
	const url = $derived(`${page.url.origin}/verify/${/^[A-Za-z0-9:._-]+$/.test(mint) ? mint : encodeURIComponent(mint)}`);
	const DIAMETER = { sm: 'size-20', md: 'size-32', lg: 'size-56' } as const;

	/* Each shape in a 100 × 100 space, with the square its code sits in (x, y, side, as percentages). */
	const SHAPES = {
		circle: { d: 'M50 0a50 50 0 1 1 0 100a50 50 0 1 1 0-100z', box: [18.5, 18.5, 63] },
		square: { d: 'M16 0h68a16 16 0 0 1 16 16v68a16 16 0 0 1-16 16h-68a16 16 0 0 1-16-16v-68a16 16 0 0 1 16-16z', box: [12, 12, 76] },
		hexagon: { d: 'M50 0L93.3 25V75L50 100L6.7 75V25Z', box: [20, 20, 60] },
		shield: { d: 'M50 0L94 14V48C94 76 74 92 50 100C26 92 6 76 6 48V14Z', box: [21, 14, 58] },
		/* The bank's own picture as the coin: the code in the middle. */
		picture: { d: '', box: [22, 22, 56] },
		skull: {
			d: 'M50 2C28 2 14 17 14 37c0 11 5 19 11 24v9c0 3 2 5 5 5h4v-6h6v6h7v-6h6v6h7v-6h6v6h4c3 0 5-2 5-5v-9c6-5 11-13 11-24C86 17 72 2 50 2z',
			box: [28, 10, 44]
		}
	} as const;
	const shape = $derived(SHAPES[design.shape] ?? SHAPES.circle);
	/* A paint, as CSS: a theme colour by name, the page's surface (light behind, dark on top, flipping with the mode), black, white, none, or its own. */
	function paint(c: string, on: 'ground' | 'ink'): string {
		if (c.startsWith('#')) return c;
		if (c === 'none') return 'transparent';
		if (c === 'black') return '#111111';
		if (c === 'white') return '#ffffff';
		if (c === 'surface') return on === 'ground' ? 'var(--color-surface-950-50)' : 'var(--color-surface-50-950)';
		return `var(--color-${c}-500)`;
	}
	const fill = $derived(paint(design.colour, 'ground'));
	const plate = $derived(paint(design.plate ?? 'none', 'ground'));
	/* The code in its colour; left as the page's own on a colour of the bank's own, whichever of black or white reads best on it. */
	const ink = $derived.by(() => {
		const ground = design.plate && design.plate !== 'none' ? design.plate : design.colour;
		if ((design.ink ?? 'surface') !== 'surface' || !ground.startsWith('#')) return paint(design.ink ?? 'surface', 'ink');
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16) / 255);
		return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#111111' : '#ffffff';
	});
	const uid = $props.id();
</script>

<a
	{href}
	class="relative inline-block shrink-0 {DIAMETER[size]}"
	aria-label="{name ? `A ${name} coin` : 'A minted coin'}: scan or tap to check it"
	title="Scan or tap to check this coin"
>
	{#if design.shape === 'picture' && design.image}
		<!-- the bank's own picture, as the coin -->
		<img src={design.image} alt="" class="absolute inset-0 size-full object-contain" />
	{:else}
	<svg viewBox="0 0 100 100" class="absolute inset-0 size-full" aria-hidden="true">
		{#if design.shape === 'skull'}
			<!-- the crossbones, behind -->
			<g stroke={fill} stroke-width="7" stroke-linecap="round">
				<line x1="12" y1="60" x2="88" y2="92" />
				<line x1="88" y1="60" x2="12" y2="92" />
			</g>
			<!-- the knuckles at each end of the bones -->
			<g fill={fill}>
				<circle cx="13.8" cy="55.9" r="5" /><circle cx="10.2" cy="64.1" r="5" />
				<circle cx="89.8" cy="87.9" r="5" /><circle cx="86.2" cy="96.1" r="5" />
				<circle cx="86.2" cy="55.9" r="5" /><circle cx="89.8" cy="64.1" r="5" />
				<circle cx="10.2" cy="87.9" r="5" /><circle cx="13.8" cy="96.1" r="5" />
			</g>
		{/if}
		<path d={shape.d} fill={fill} />
		{#if design.image}
			<!-- the bank's own picture, laid inside the shape -->
			<defs><clipPath id="coin-{uid}"><path d={shape.d} /></clipPath></defs>
			<image href={design.image} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" clip-path="url(#coin-{uid})" />
		{/if}
	</svg>
	{/if}
	<!-- the code, straight on the shape; Skeleton's own frame ground and pattern colour are set here instead (qr-code.css) -->
	<span class="absolute grid place-items-center rounded-[6%]" style="left: {shape.box[0]}%; top: {shape.box[1]}%; width: {shape.box[2]}%; height: {shape.box[2]}%; background-color: {plate}; padding: {plate === 'transparent' ? '0' : '4%'};">
		<QrCode value={url} encoding={design.mark ? { ecc: 'H' } : undefined} class="size-full grid place-items-center">
			<QrCode.Frame class="size-full" aria-hidden="true" style="background-color: transparent">
				<QrCode.Pattern style="fill: {ink}" />
			</QrCode.Frame>
			{#if design.mark}
				<QrCode.Overlay class="grid place-items-center rounded-full font-bold leading-none" style="background-color: {plate === 'transparent' ? fill : plate}; color: {ink}; width: 26%; height: 26%; font-size: {size === 'lg' ? '1.6rem' : size === 'md' ? '0.95rem' : '0.6rem'};">
					{design.mark}
				</QrCode.Overlay>
			{/if}
		</QrCode>
	</span>
</a>
