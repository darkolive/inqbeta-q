<script lang="ts">
	/*
	 * Design your coin (5 October 2026, ADR-Q-035): when a bank makes its coin,
	 * it gives it a name and a look — a shape, a colour, a mark in the middle —
	 * and it always carries its QR code. Darren: "you could have a skull and
	 * crossbones as the background instead of a round coin … customize your
	 * own coin, but still be using the QR code."
	 *
	 * Its own picture too (a logo, as SVG, PNG, WebP or JPEG): as the coin
	 * itself, or laid inside a shape. And the code's own colours — its ink,
	 * and what's behind it — so it looks right and still reads. The design has
	 * a fingerprint, signed with the rest: what a register of coins would hold,
	 * one day, to keep a look unique (ADR-Q-035).
	 *
	 * Seen live as you choose, with a check that the code still reads. Saved
	 * on this computer as Q_COIN_NAME and Q_COIN_DESIGN in Money, each signed
	 * by you (setService), and signed into the publication when you go live.
	 */
	import { OFFICES } from '@inqbeta/q-core/offices';
	const CONTACTS = OFFICES.filter((o) => ['treasurer', 'secretary', 'chair', 'compliance', 'caretaker'].includes(o.id));
	import { Status } from '@inqbeta/q-ui';
	import type { Identity } from '@inqbeta/q-core/passkey';
	import { COIN_COLOURS, COIN_SHAPES, DEFAULT_COIN, coinDesignFingerprint, coinDesignFrom, coinDesignLine, type CoinDesign, type CoinPaint, type CoinShape } from '@inqbeta/q-core/money';
	import { keepCoinImage, setService } from '$lib/host-setup';
	import { readMint } from '$lib/money';
	import Coin from './display/Coin.svelte';

	let { identity, host, onChanged }: { identity: Identity; host: string; onChanged?: () => void } = $props();

	let mint = $state('');
	let design = $state<CoinDesign>({ ...DEFAULT_COIN });
	let name = $state('');
	/* Who answers for the coin (ADR-Q-037): an office, never a person. */
	let contact = $state('treasurer');
	let saved = $state('');
	$effect(() => {
		void readMint(true).then((m) => {
			mint = m.view?.mint ?? '';
			design = coinDesignFrom(m.view?.design ?? DEFAULT_COIN);
			name = m.view?.name ?? '';
			contact = m.view?.contact?.office ?? 'treasurer';
			saved = JSON.stringify({ design, name, contact });
		});
	});
	const changed = $derived(JSON.stringify({ design, name, contact }) !== saved);

	const SHAPE_SAYS: Record<CoinShape, string> = { circle: 'Circle', square: 'Square', hexagon: 'Hexagon', shield: 'Shield', skull: 'Skull and crossbones', picture: 'Your picture' };
	const SWATCH: Record<string, string> = {
		secondary: 'bg-secondary-500',
		primary: 'bg-primary-500',
		tertiary: 'bg-tertiary-500',
		success: 'bg-success-500',
		warning: 'bg-warning-500',
		error: 'bg-error-500',
		surface: 'bg-surface-950-50',
		black: 'bg-black',
		white: 'bg-white border border-surface-300-700',
		none: 'bg-transparent border-2 border-dashed border-surface-400-600'
	};
	/* The three colours you choose: the coin, the code, and what's behind the code. */
	const PAINTS = {
		colour: { says: 'The coin', options: [...COIN_COLOURS, 'black', 'white'] },
		ink: { says: 'The code', options: ['surface', 'black', 'white', ...COIN_COLOURS.filter((c) => c !== 'surface')] },
		plate: { says: 'Behind the code', options: ['none', 'surface', 'white', 'black', ...COIN_COLOURS.filter((c) => c !== 'surface')] }
	} as const;
	const ownOf = (k: keyof typeof PAINTS) => (design[k].startsWith('#') ? design[k] : '#d16900');
	const paintSays = (c: string) => (c === 'surface' ? 'the page’s own' : c === 'none' ? 'nothing: the coin shows through' : c);

	/* The bank's own picture: kept on this computer beside the logo, signed by you. */
	let picking = $state(false);
	async function pick(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		picking = true;
		says = null;
		const out = await keepCoinImage(identity, host, file);
		picking = false;
		if (!out.ok) return void (says = { good: false, text: out.says });
		design = { ...design, image: out.path, shape: design.shape === 'circle' ? 'picture' : design.shape };
	}

	/* The design's fingerprint: what a register of coins would hold, one day, to keep a look unique. */
	let print = $state('');
	$effect(() => void coinDesignFingerprint(design).then((f) => (print = f)));

	let busy = $state(false);
	let says = $state<{ good: boolean; text: string } | null>(null);
	async function save() {
		busy = true;
		says = null;
		const a = await setService(identity, host, 'money', 'Q_COIN_DESIGN', coinDesignLine(design));
		const b = a.ok && name.trim() ? await setService(identity, host, 'money', 'Q_COIN_NAME', name.trim()) : a;
		const c = b.ok ? await setService(identity, host, 'money', 'Q_COIN_CONTACT', contact) : b;
		busy = false;
		if (!a.ok || !b.ok || !c.ok) return void (says = { good: false, text: (!a.ok ? a : !b.ok ? (b as { says: string }) : (c as { says: string })).says });
		saved = JSON.stringify({ design, name, contact });
		says = { good: true, text: 'That’s your coin: saved on this computer and signed by you. Restart Q to see it everywhere; it’s signed into the publication when you go live. A picture goes live with your next release, beside your logo.' };
		onChanged?.();
	}
</script>

<div class="card preset-outlined-surface-200-800 bg-surface-50-950 p-5 mt-4 max-w-2xl flex flex-col gap-5">
	<div>
		<p class="h5">Your coin</p>
		<p class="text-sm text-surface-700-300">Name it, and give it a look. Whatever its shape, it always carries its code, so anyone can scan it and check it.</p>
	</div>

	<div class="flex flex-wrap items-start gap-6">
		<!-- the coin, as it will be -->
		<div class="flex flex-col items-center gap-2">
			{#if mint}<Coin {mint} size="lg" name={name || 'Your coin'} {design} />{:else}<div class="size-56 rounded-full bg-surface-200-800 grid place-items-center text-sm opacity-70">Make the mint first</div>{/if}
			<p class="font-semibold">{name || 'Unnamed coin'}</p>
		</div>

		<div class="flex-1 min-w-60 flex flex-col gap-4">
			<label class="label">
				<span class="label-text">Its name</span>
				<input class="input" maxlength="40" bind:value={name} />
			</label>

			<fieldset class="flex flex-col gap-2">
				<legend class="label-text">Who answers for it</legend>
				<p class="text-sm">Questions about the coin go to an office, not a person: whoever holds it at the time.</p>
				<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Who answers for it">
					{#each CONTACTS as k (k.id)}
						<button type="button" role="radio" aria-checked={contact === k.id} class="btn btn-sm min-h-11 {contact === k.id ? 'preset-filled-primary-500' : 'preset-tonal'}" onclick={() => (contact = k.id)}>{k.called}</button>
					{/each}
				</div>
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="label-text">Its shape</legend>
				<div class="flex flex-wrap gap-2">
					{#each COIN_SHAPES as s (s)}
						<button type="button" class="btn btn-sm {design.shape === s ? 'preset-filled-primary-500' : 'preset-tonal'}" aria-pressed={design.shape === s} onclick={() => (design = { ...design, shape: s })}>{SHAPE_SAYS[s]}</button>
					{/each}
				</div>
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="label-text">Its own picture (a logo: SVG, PNG, WebP or JPEG)</legend>
				<div class="flex flex-wrap items-center gap-3">
					<label class="btn btn-sm preset-tonal cursor-pointer">
						{picking ? 'Keeping… touch your passkey' : design.image ? 'Choose another' : 'Choose a picture'}
						<input type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" class="sr-only" disabled={picking} onchange={pick} />
					</label>
					{#if design.image}
						<button type="button" class="btn btn-sm preset-tonal" onclick={() => (design = { ...design, image: '', shape: design.shape === 'picture' ? 'circle' : design.shape })}>Take it off</button>
						<span class="text-xs text-surface-700-300">{design.shape === 'picture' ? 'The picture is the coin.' : 'The picture is laid inside the shape.'}</span>
					{/if}
				</div>
			</fieldset>

			{#each Object.entries(PAINTS) as [k, p] (k)}
				{@const key = k as keyof typeof PAINTS}
				<fieldset class="flex flex-col gap-2">
					<legend class="label-text">{p.says}: <span class="opacity-70">{paintSays(design[key])}</span></legend>
					<div class="flex flex-wrap items-center gap-2">
						{#each p.options as c (c)}
							<button type="button" class="size-8 rounded-full {SWATCH[c]} {design[key] === c ? 'ring-4 ring-offset-2 ring-surface-950-50 ring-offset-surface-50-950' : ''}" aria-label="{p.says}: {paintSays(c)}" aria-pressed={design[key] === c} title={paintSays(c)} onclick={() => (design = { ...design, [key]: c as CoinPaint })}></button>
						{/each}
						<label class="flex items-center gap-2 text-sm">
								<input type="color" class="size-8 rounded-full cursor-pointer" value={ownOf(key)} oninput={(e) => (design = { ...design, [key]: (e.currentTarget as HTMLInputElement).value as CoinPaint })} />
								Its own
							</label>
					</div>
				</fieldset>
			{/each}

			<label class="label">
				<span class="label-text">A mark in the middle (a letter, a symbol or an emoji; leave empty for none)</span>
				<input class="input max-w-24 text-center text-lg" maxlength="4" placeholder="☠" bind:value={design.mark} oninput={() => (design = coinDesignFrom(design))} />
			</label>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<button type="button" class="btn preset-filled-primary-500 min-h-11" disabled={busy || !changed || !mint} onclick={() => void save()}>{busy ? 'Saving… touch your passkey' : 'Save your coin'}</button>
		{#if says}<p class="text-sm"><Status tone={says.good ? 'good' : 'bad'}>{says.good ? 'Saved' : 'Not saved'}</Status> {says.text}</p>{/if}
	</div>
	<p class="text-xs text-surface-700-300">Scan the coin above with your phone before you save: a pale colour, a busy picture or a big mark can make it harder to read. A plain colour behind the code helps.</p>
	{#if print}<p class="text-xs text-surface-700-300">This design’s fingerprint: <span class="role-token">{print.slice(0, 16)}…</span> Signed into your publication with its name, it’s what a register of coins would hold to keep your coin’s look your own.</p>{/if}
</div>
