<script lang="ts">
	/*
	 * A face for a DID, drawn from the DID.
	 *
	 * Nothing is uploaded and nothing is stored: the same identity draws the
	 * same emblem on every device, for ever, because it is a function of the
	 * key rather than a file somebody has to keep. That is the same argument as
	 * the rest of Q — derived on the spot, held nowhere.
	 *
	 * NOT A WAY TO CHECK WHO SOMEBODY IS. A few thousand visual patterns is not
	 * a few thousand identities, and two DIDs will eventually look alike. Use
	 * the fingerprint for comparing people by eye. This is for recognising your
	 * own, at a glance, among your own things.
	 *
	 * A plain synchronous hash, because this is decoration and the good hash is
	 * asynchronous. Symmetric on the vertical, which is what makes a grid of
	 * squares read as a thing rather than as noise.
	 */
	let {
		did,
		size = 48,
		label
	}: { did: string; size?: number; label?: string } = $props();

	/* FNV-1a. Not a secure hash; see above. */
	function seedOf(text: string): number {
		let h = 0x811c9dc5;
		for (let i = 0; i < text.length; i++) {
			h ^= text.charCodeAt(i);
			h = Math.imul(h, 0x01000193) >>> 0;
		}
		return h >>> 0;
	}

	const seed = $derived(seedOf(did || 'did:key:nobody'));

	/* A second stream, so colour and shape are not the same number twice. */
	const tone = $derived(seedOf(`${did}:tone`));

	const hue = $derived(seed % 360);
	/* Kept off the extremes so it stays legible against light and dark alike. */
	const ink = $derived(`hsl(${hue} 62% 46%)`);
	const paper = $derived(`hsl(${(hue + 28) % 360} 58% 92%)`);
	const accent = $derived(`hsl(${(hue + 190) % 360} 55% 40%)`);

	/*
	 * Five columns, mirrored, so only three are decided: 3 × 5 = 15 bits out of
	 * two 32-bit streams, and a sixteenth deciding which cells take the accent.
	 */
	const cells = $derived.by(() => {
		const out: { x: number; y: number; accent: boolean }[] = [];
		for (let col = 0; col < 3; col++) {
			for (let row = 0; row < 5; row++) {
				const bit = col * 5 + row;
				if (!((seed >>> bit) & 1)) continue;
				const isAccent = ((tone >>> bit) & 1) === 1;
				out.push({ x: col, y: row, accent: isAccent });
				if (col < 2) out.push({ x: 4 - col, y: row, accent: isAccent });
			}
		}
		return out;
	});

	const title = $derived(label ?? 'Your emblem, drawn from your identity');
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 7 7"
	role="img"
	aria-label={title}
	style="display:block;border-radius:22%;flex:none"
>
	<title>{title}</title>
	<rect width="7" height="7" fill={paper} />
	{#each cells as c (`${c.x}-${c.y}`)}
		<rect x={c.x + 1} y={c.y + 1} width="1" height="1" fill={c.accent ? accent : ink} rx="0.28" />
	{/each}
</svg>
