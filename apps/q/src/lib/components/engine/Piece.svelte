<svelte:options namespace="svg" />

<script lang="ts">
	/*
	 * One picture piece, centred on (x, y) and drawn `size` across (about), for
	 * a made story's slide (the story engine, ADR-Q-033 Part 2: "icon + words").
	 * The story pieces (lib/components/story) are the same ones Q's own stories
	 * are drawn with, so a made book belongs to the same family; the rest are
	 * Q's own icons, drawn in the olive.
	 */
	import type { Piece } from '@inqbeta/q-core/storybook';
	import { icons, ICON_ATTRS } from '@inqbeta/q-ui/icons';
	import { Key, Tick, Cross, Folder, Cloud, Phone, Screen, Laptop, Card, Padlock, Envelope, Coin } from '../story';

	/* `other`: a second person on the same stage, in the olive, so two people are told apart at a glance. */
	let { piece, x, y, size = 120, other = false }: { piece: Piece; x: number; y: number; size?: number; other?: boolean } = $props();

	/* Each piece's own width, and where its middle is from the point it's drawn at. */
	const SHAPE: Record<string, { w: number; dx: number; dy: number }> = {
		phone: { w: 70, dx: -30, dy: -52 },
		laptop: { w: 200, dx: -80, dy: -62 },
		screen: { w: 150, dx: -75, dy: -65 },
		cloud: { w: 140, dx: -10, dy: -10 },
		folder: { w: 60, dx: -30, dy: -22 },
		key: { w: 72, dx: -20, dy: 0 },
		padlock: { w: 40, dx: 0, dy: -8 },
		envelope: { w: 70, dx: -35, dy: -24 },
		card: { w: 200, dx: -100, dy: -62 },
		coin: { w: 30, dx: 0, dy: 0 },
		tick: { w: 26, dx: 0, dy: 0 },
		cross: { w: 30, dx: 0, dy: 0 },
		person: { w: 80, dx: 0, dy: 0 }
	};
	const ICON: Record<string, keyof typeof icons> = { heart: 'heart', map: 'map', sun: 'sun', message: 'message', search: 'search', home: 'home', bell: 'bell', image: 'image' };
	const shape = $derived(SHAPE[piece]);
	const k = $derived(shape ? size / shape.w : 1);
</script>

{#if shape}
	<g transform="translate({x} {y}) scale({k})">
		{#if piece === 'phone'}<Phone x={shape.dx} y={shape.dy} />
		{:else if piece === 'laptop'}<Laptop x={shape.dx} y={shape.dy} />
		{:else if piece === 'screen'}<Screen x={shape.dx} y={shape.dy} />
		{:else if piece === 'cloud'}<Cloud x={shape.dx} y={shape.dy} />
		{:else if piece === 'folder'}<Folder x={shape.dx} y={shape.dy} />
		{:else if piece === 'key'}<Key x={shape.dx} y={shape.dy} />
		{:else if piece === 'padlock'}<Padlock x={shape.dx} y={shape.dy} />
		{:else if piece === 'envelope'}<Envelope x={shape.dx} y={shape.dy} open />
		{:else if piece === 'card'}<Card x={shape.dx} y={shape.dy} />
		{:else if piece === 'coin'}<Coin x={0} y={0} />
		{:else if piece === 'tick'}<Tick x={0} y={0} />
		{:else if piece === 'cross'}<Cross x={0} y={0} />
		{:else if piece === 'person'}
			<!-- Someone: a head and shoulders, in the orange. -->
			<circle cx="0" cy="-16" r="16" class={other ? 'fill-primary-500' : 'fill-secondary-500'} />
			<path d="M-30 34a30 30 0 0 1 60 0z" class={other ? 'fill-primary-500' : 'fill-secondary-500'} />
		{/if}
	</g>
{:else if ICON[piece]}
	<!-- {@html} is safe: the markup comes from Q's own icon table only. -->
	<svg {...ICON_ATTRS} x={x - size / 2} y={y - size / 2} width={size} height={size} stroke-width="1.5" class="stroke-primary-500">{@html icons[ICON[piece]]}</svg>
{/if}
