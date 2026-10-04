<script lang="ts">
	/*
	 * One thing a message carries, drawn the way it arrives (4 October 2026):
	 * a picture you can open big, a file with its name, size and Save, a link
	 * with its address plain to see, a place with a map link, a card to add.
	 * The same drawing in the message you're writing and the one you receive.
	 */
	import { Icon } from '@inqbeta/q-ui';
	import { sizeText, mapLink, type Attachment } from '@inqbeta/q-core/attachments';
	import { attachmentUrl, saveAttachment, addCardToAddressBook } from '$lib/attachments';
	import { refreshLedger } from '$lib/ledger';

	let { a, compact = false, mine = false, known = false }: { a: Attachment; compact?: boolean; mine?: boolean; known?: boolean } = $props();

	let url = $state<string | null>(null);
	let waiting = $state(false);
	$effect(() => {
		if (a.kind !== 'picture' && a.kind !== 'file') return;
		void attachmentUrl(a).then((u) => {
			url = u;
			waiting = !u;
		});
	});

	let big = $state<HTMLDialogElement | null>(null);
	let saved = $state('');
	async function save() {
		saved = (await saveAttachment(a)) ? 'Saved.' : 'Still arriving: its pieces aren’t all here yet.';
	}
	let added = $state(false);
	async function addCard() {
		added = await addCardToAddressBook(a);
		await refreshLedger();
	}
	const host = (u: string) => {
		try {
			return new URL(u).host;
		} catch {
			return u;
		}
	};
	const cardName = $derived(a.card?.['q:person/called'] || [a.card?.['q:person/first'], a.card?.['q:person/last']].filter(Boolean).join(' ') || 'Someone');
	const cover = $derived(!compact ? (a.card?.['q:person/cover'] ?? '') : '');
	const iconFor = (type = '') => (type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'mic' : type.startsWith('video/') ? 'video' : 'file');
</script>

{#if a.kind === 'picture'}
	{#if url}
		<button type="button" class="block w-full overflow-hidden rounded-base {compact ? 'aspect-square' : ''}" aria-label="Open {a.name} big" onclick={() => big?.showModal()}>
			<img src={url} alt={a.name ?? 'A picture'} class="w-full {compact ? 'h-full object-cover' : 'h-auto max-h-80 object-cover'}" loading="lazy" />
		</button>
		<dialog bind:this={big} class="m-auto max-w-[95vw] max-h-[95vh] rounded-container bg-surface-50-950 p-3 backdrop:bg-black/70">
			<img src={url} alt={a.name ?? 'A picture'} class="max-w-[90vw] max-h-[80vh] object-contain" />
			<div class="flex gap-2 justify-end mt-3">
				<button type="button" class="btn preset-tonal min-h-11" onclick={() => void save()}><Icon name="download" size={18} /> Save</button>
				<button type="button" class="btn preset-filled-primary-500 min-h-11" onclick={() => big?.close()}>Close</button>
			</div>
		</dialog>
	{:else}
		<div class="aspect-square rounded-base preset-tonal-surface flex flex-col items-center justify-center gap-1 p-2 text-center">
			<Icon name="image" size={24} /><span class="text-xs">{waiting ? 'Arriving…' : ''}</span>
		</div>
	{/if}
{:else if a.kind === 'file'}
	<div class="card {mine ? 'preset-tonal-primary' : 'preset-outlined-surface-200-800 bg-surface-50-950'} p-3 flex items-center gap-3">
		<span class="rounded-full preset-filled-primary-500 size-11 shrink-0 flex items-center justify-center" aria-hidden="true"><Icon name={iconFor(a.type)} size={22} /></span>
		<span class="flex-1 min-w-0">
			<span class="block font-semibold truncate">{a.name}</span>
			<span class="block text-xs opacity-70">{sizeText(a.bytes ?? 0)}{a.pieces ? ` · ${compact ? 'goes' : mine ? 'went' : 'came'} in ${a.pieces} pieces` : ''}{waiting && !compact ? ' · arriving…' : ''}</span>
		</span>
		{#if !compact}
			<button type="button" class="btn btn-sm preset-tonal min-h-11" disabled={!url} onclick={() => void save()}><Icon name="download" size={16} /> Save</button>
		{/if}
	</div>
	{#if saved}<p class="text-xs mt-1">{saved}</p>{/if}
{:else if a.kind === 'link' && a.url}
	<a class="card {mine ? 'preset-tonal-primary' : 'preset-outlined-surface-200-800 bg-surface-50-950'} p-3 flex items-center gap-3 hover:preset-tonal" href={a.url} target="_blank" rel="noopener noreferrer nofollow">
		<span class="rounded-full preset-filled-secondary-500 size-11 shrink-0 flex items-center justify-center" aria-hidden="true"><Icon name="link" size={22} /></span>
		<span class="flex-1 min-w-0">
			<span class="block font-semibold truncate">{a.title || host(a.url)}</span>
			<span class="block text-xs opacity-70 truncate">{a.url}</span>
		</span>
	</a>
{:else if a.kind === 'place'}
	<a class="card {mine ? 'preset-tonal-primary' : 'preset-outlined-surface-200-800 bg-surface-50-950'} p-3 flex items-center gap-3 hover:preset-tonal" href={mapLink(a)} target="_blank" rel="noopener noreferrer">
		<span class="rounded-full preset-filled-success-500 size-11 shrink-0 flex items-center justify-center" aria-hidden="true"><Icon name="map" size={22} /></span>
		<span class="flex-1 min-w-0">
			<span class="block font-semibold">{a.label || 'A place'}</span>
			<span class="block text-xs opacity-70">{typeof a.lat === 'number' ? `Pinned at ${a.lat}, ${a.lng} · ` : ''}Open the map</span>
		</span>
	</a>
{:else if a.kind === 'card' && a.card}
	<div class="card {mine ? 'preset-tonal-primary' : 'preset-outlined-surface-200-800 bg-surface-50-950'} overflow-hidden">
		{#if cover}<img src={cover} alt="" class="w-full h-16 object-cover" />{/if}
		<div class="p-3 flex flex-wrap items-center gap-3 {cover ? '-mt-8' : ''}">
			<span class="size-14 shrink-0 rounded-full overflow-hidden border-4 border-surface-50-950 bg-surface-100-900 flex items-center justify-center">
				{#if a.card['q:person/picture']}<img src={a.card['q:person/picture']} alt="" class="size-full object-cover" />{:else}<span class="font-bold opacity-70">{cardName.slice(0, 1)}</span>{/if}
			</span>
			<span class="flex-1 min-w-32">
				<span class="block font-semibold truncate">{cardName}</span>
				<span class="block text-xs opacity-70">A card, passed on</span>
			</span>
			{#if !compact && !mine}
				{#if known || added}
					<span class="badge preset-tonal-success">In your address book</span>
				{:else}
					<button type="button" class="btn btn-sm preset-filled-primary-500 min-h-11" onclick={() => void addCard()}><Icon name="plus" size={16} /> Add</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}
