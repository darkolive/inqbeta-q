<script lang="ts">
	/*
	 * Build a page.
	 *
	 * WHAT THIS REPLACES. Until 20 September this page listed seven block names
	 * from ui-receipts.ts, let somebody click them into a list, and printed the
	 * name of each as text. Nothing rendered, nothing was checked, and `props`
	 * was Record<string, any> — so a block could carry anything.
	 *
	 * Now: the ten kinds from blocks.ts, each with settings declared as a
	 * QUESTION SET and drawn by the same AskSet that asks every other set in Q.
	 * Reorder, resize, preview against your own things, and publish — which
	 * merges the design into one self-contained page with one address.
	 *
	 * The preview is drawn by PageView, the same component that will draw the
	 * published page. A preview that uses a different renderer is a preview
	 * that lies, and it lies most convincingly about the thing you are about to
	 * share.
	 */
	import { Page, Section, Item, Status, Empty, PageView, Text } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import AskSet from '$lib/components/AskSet.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';
	import { BLOCKS, SETTINGS, settingsFor, holdsOthers, move, reparent, type Block, type BlockKind, type Width } from '@inqbeta/q-core/blocks';
	import { publish, type Page as Built } from '@inqbeta/q-core/pages';
	import { savePage, pageFrom } from '$lib/pages';
	import { compileStatic, type Compiled } from '$lib/static-page';
	import { addressesIn, inlineUrls, picturesIn, previewUrls } from '$lib/pictures';
	import PicturePicker from '$lib/components/PicturePicker.svelte';
	import SignSite from '$lib/components/SignSite.svelte';
	import { checkStatic, type StaticCheck } from '@inqbeta/q-core/static-page';
	import { download, saveLocked } from '@inqbeta/q-core/folder';
	import { answersFrom } from '$lib/answers';
	import { placeFrom } from '$lib/places';
	import { asking } from '@inqbeta/q-core/questions';
	import { ABOUT_YOU } from '$lib/questions/about-you';
	import { YOUR_PROFILE } from '$lib/questions/your-profile';

	let identity = $state<Identity | null>(null);
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchLedger((l) => (ledger = l)));

	let called = $state('My page');
	let blocks = $state<Block[]>([]);
	let editing = $state<string | null>(null);
	let saying = $state<{ tone: 'good' | 'bad'; says: string } | null>(null);
	let saved = $state<{ address: string; reads: string[] } | null>(null);

	/* Everything this page can draw with. Built here, from this person's own
	 * things — a renderer is handed a Supply and can reach nothing else. */
	const wording = new Map(
		[ABOUT_YOU, YOUR_PROFILE].flatMap((s) => s.questions.map((q) => [q.id, asking(q)] as const))
	);

	let supply = $state<Record<string, unknown>>({});
	const pictures = $derived(ledger ? picturesIn(ledger.items) : []);
	let pictureUrls = $state<Record<string, string>>({});

	$effect(() => {
		const found = ledger ? newestPerKey(ledger.found) : [];
		void (async () => {
			const answerSets = (await Promise.all(found.filter((f) => f.kind === 'answers').map((f) => answersFrom(f.item)))).filter(Boolean);
			const answers: Record<string, { label: string; value: string }> = {};
			for (const set of answerSets) {
				for (const [id, a] of Object.entries(set!.answers)) {
					answers[id] = { label: wording.get(id) ?? id, value: String(Array.isArray(a.value) ? a.value.join(', ') : a.value) };
				}
			}
			const placeList = (await Promise.all(found.filter((f) => f.kind === 'place').map((f) => placeFrom(f.item)))).filter(Boolean);
			pictureUrls = await previewUrls(pictures).catch(() => ({}));
			supply = {
				pictures: pictureUrls,
				answers,
				places: placeList.map((p) => ({ id: p!.id, called: p!.called, says: p!.proved ? 'Confirmed' : 'Not tried' })),
				receipts: found.slice(0, 20).map((f) => ({ id: f.key, title: f.title, at: f.at.slice(0, 10) })),
				contacts: [],
				federations: []
			};
		})();
	});

	const pages = $derived((ledger ? newestPerKey(ledger.found) : []).filter((f) => f.kind === 'page'));
	const older = $derived((ledger ? newestPerKey(ledger.found) : []).filter((f) => f.kind === 'page-old'));

	/* A published page, opened. Drawn by the same PageView as the preview and
	 * as anywhere else it is ever shown — one renderer, or a page means
	 * different things in different places. */
	let opened = $state<Built | null>(null);
	let openedName = $state('');

	async function open(entry: { item: Parameters<typeof pageFrom>[0]; title: string }) {
		opened = await pageFrom(entry.item);
		openedName = entry.title;
	}

	/*
	 * Making a published page public: drawn once into a static HTML file that
	 * carries its own receipt (q-core/static-page.ts). Kept in the vault, and
	 * handed over as a file anyone can open with no Q at all.
	 */
	let going = $state<string | null>(null);
	let made = $state<(Compiled & { url: string; title: string }) | null>(null);
	let refused = $state<{ title: string; says: string; wrong: string[] } | null>(null);

	async function makePublic(entry: { key: string; item: Parameters<typeof pageFrom>[0]; title: string }) {
		if (!identity) return;
		going = entry.key;
		refused = null;
		if (made) URL.revokeObjectURL(made.url);
		made = null;
		try {
			const page = await pageFrom(entry.item);
			if (!page) {
				refused = { title: entry.title, says: 'That page could not be read.', wrong: [] };
				return;
			}
			/* The pictures go inside the file, so it depends on nothing. */
			const inline = await inlineUrls(pictures, addressesIn(page.blocks));
			const out = await compileStatic(identity, page, { pictures: inline });
			if (!out.ok) {
				refused = { title: entry.title, says: out.says, wrong: out.wrong.map((w) => `${w.kind}: ${w.says}`) };
				return;
			}
			await saveLocked('public', out.name, out.file, 'text/html');
			const url = URL.createObjectURL(new Blob([out.file], { type: 'text/html' }));
			made = { ...out, url, title: entry.title };
			await refreshLedger();
		} catch (e) {
			refused = { title: entry.title, says: e instanceof Error ? e.message : String(e), wrong: [] };
		} finally {
			going = null;
		}
	}

	let checked = $state<(StaticCheck & { name: string }) | null>(null);
	async function checkFile(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const f = el.files?.[0];
		if (!f) return;
		checked = { ...(await checkStatic(await f.text())), name: f.name };
		el.value = '';
	}

	let preview = $state<Built | null>(null);
	$effect(() => {
		void publish(called || 'Untitled', blocks).then((out) => (preview = out.ok ? out.page : null));
	});

	/* Where a new block lands: inside the group being worked on, or on the page. */
	let inside = $state<string | null>(null);

	const add = (kind: BlockKind) => {
		const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
		const block: Block = { kind, id, width: 'full' };
		blocks = inside ? reparent([...blocks, block], id, inside, 0) : [...blocks, block];
		editing = id;
	};

	/* Flattened with its depth, so one list can show a tree without the
	 * template having to recurse. */
	type Row = { block: Block; depth: number; siblings: Block[]; at: number };
	function rows(list: Block[], depth = 0): Row[] {
		return list.flatMap((b, at) => [
			{ block: b, depth, siblings: list, at },
			...(b.children?.length ? rows(b.children, depth + 1) : [])
		]);
	}
	const flat = $derived(rows(blocks));

	function without(list: Block[], id: string): Block[] {
		return list
			.filter((b) => b.id !== id)
			.map((b) => (b.children?.length ? { ...b, children: without(b.children, id) } : b));
	}

	const drop = (id: string) => {
		blocks = without(blocks, id);
		if (editing === id) editing = null;
		if (inside === id) inside = null;
	};

	const shift = (row: Row, by: number) => {
		blocks = move(blocks, row.block.id, row.at + by);
	};

	/* The groups a block could be dragged into: every group that is not itself
	 * and not inside it. reparent refuses the rest anyway; this stops the
	 * builder offering a move that would silently do nothing. */
	function groupsFor(id: string): Block[] {
		const within = (b: Block): boolean => b.id === id || (b.children ?? []).some(within);
		return flat.map((r) => r.block).filter((b) => holdsOthers(b.kind) && !within(b));
	}

	/*
	 * Settings are edited in a draft and applied on Save.
	 *
	 * Bound straight to the block, every keystroke would recompile the preview
	 * and rewrite the page address — and a half-typed heading would be a
	 * different page from the one before it. A draft makes editing an edit and
	 * saving a save.
	 */
	let draft = $state<Record<string, unknown>>({});

	function openSettings(b: Block) {
		if (editing === b.id) {
			editing = null;
			return;
		}
		editing = b.id;
		draft = { ...(b.settings ?? {}), 'q:block/width': b.width ?? 'full' };
	}

	function applySettings(id: string) {
		const { 'q:block/width': width, ...rest } = draft;
		blocks = blocks.map((b) =>
			b.id === id
				? { ...b, width: (typeof width === 'string' ? width : 'full') as Width, settings: rest as Block['settings'] }
				: b
		);
		editing = null;
	}

	async function save() {
		if (!identity) return;
		saying = null;
		const out = await savePage(identity, called, blocks);
		if (!out.ok) {
			saying = { tone: 'bad', says: out.says };
			return;
		}
		saved = { address: out.address, reads: out.reads };
		saying = { tone: 'good', says: 'Published.' };
		await refreshLedger();
	}
</script>

<svelte:head><title>Build a page — Q</title></svelte:head>

<Page title="Build a page" lead="Put what matters to you where you want it. Publishing merges it into one page with its own address.">
	{#if !identity}
		<SignIn />
	{:else}
		<Section title="What it is called">
			<input class="input" bind:value={called} />
		</Section>

		<Section title="Add something" description="Every one of these can be resized, titled and set up.">
			<div class="flex flex-wrap gap-2">
				{#each BLOCKS as b (b.kind)}
					<button class="btn btn-sm preset-tonal" onclick={() => add(b.kind)} title={b.holds}>{b.called}</button>
				{/each}
			</div>
		</Section>

		<Section title="On the page" description="Move things about. Nothing is published until you say so.">
			{#if !blocks.length}
				<Empty icon="info" title="Empty so far" description="Add something above and it appears here." />
			{:else}
				<div class="space-y-3">
					{#each flat as row (row.block.id)}
						{@const b = row.block}
						{@const spec = BLOCKS.find((x) => x.kind === b.kind)}
						<div style="margin-left: {row.depth * 1.5}rem">
						<Item title={spec?.called ?? b.kind} subtitle={String(b.settings?.['q:block/heading'] ?? '')} meta={b.width ?? 'full'}>
							{#snippet actions()}
								<button class="btn btn-sm preset-tonal" disabled={row.at === 0} onclick={() => shift(row, -1)} aria-label="Move up">↑</button>
								<button class="btn btn-sm preset-tonal" disabled={row.at === row.siblings.length - 1} onclick={() => shift(row, 1)} aria-label="Move down">↓</button>
								{#if holdsOthers(b.kind)}
									<button class="btn btn-sm {inside === b.id ? 'preset-filled' : 'preset-tonal'}" onclick={() => (inside = inside === b.id ? null : b.id)}>
										{inside === b.id ? 'Adding here' : 'Add into'}
									</button>
								{/if}
								{#if groupsFor(b.id).length}
									<select
										class="select select-sm"
										aria-label="Move into a group"
										onchange={(e) => {
											const to = e.currentTarget.value;
											if (to !== '__none') blocks = reparent(blocks, b.id, to === '' ? null : to, 0);
											e.currentTarget.value = '__none';
										}}
									>
										<option value="__none">Move into…</option>
										<option value="">The page itself</option>
										{#each groupsFor(b.id) as g (g.id)}
											<option value={g.id}>{String(g.settings?.['q:block/heading'] ?? 'A group')}</option>
										{/each}
									</select>
								{/if}
								<button class="btn btn-sm preset-tonal" onclick={() => openSettings(b)}>
									{editing === b.id ? 'Close' : 'Settings'}
								</button>
								<button class="btn btn-sm preset-tonal" onclick={() => drop(b.id)} aria-label="Remove">Remove</button>
							{/snippet}

							{#if editing === b.id}
								<!-- Pictures are chosen from the vault below, never typed as an address. -->
								<AskSet set={b.kind === 'image' || b.kind === 'hero' ? { ...SETTINGS[b.kind], questions: SETTINGS[b.kind].questions.filter((q) => q.id !== 'q:block/at') } : settingsFor({ ...b, settings: { ...b.settings, ...(draft as NonNullable<typeof b.settings>) } })} bind:values={draft} />
								{#if b.kind === 'image' || b.kind === 'hero'}
									<PicturePicker {pictures} urls={pictureUrls} bind:value={draft['q:block/at']} added={() => void refreshLedger()} />
								{/if}
								<div class="mt-2 flex gap-2">
									<button class="btn btn-sm preset-filled" onclick={() => applySettings(b.id)}>Save settings</button>
									<button class="btn btn-sm preset-tonal" onclick={() => (editing = null)}>Never mind</button>
								</div>
							{/if}
						</Item>
						</div>
					{/each}
				</div>
			{/if}
			{#if inside}
				<p class="hint mt-3">New blocks are going into that group. <button class="anchor" onclick={() => (inside = null)}>Put them on the page instead</button></p>
			{/if}
		</Section>

		{#if preview?.blocks.length}
			<Section title="What it will look like" description="Drawn by the same thing that draws the published page.">
				<PageView page={preview} supply={supply} />
			</Section>
		{/if}

		<Section title="Publish">
			{#if saying}
				<Status tone={saying.tone}>{saying.tone === 'good' ? 'Published' : 'Not published'}</Status>
				<p class="mt-2 text-sm">{saying.says}</p>
			{/if}
			{#if saved}
				<p class="mt-2 text-sm">
					<Text role="token">{saved.address}</Text>
				</p>
				<p class="mt-2 text-sm text-surface-700-300">
					{#if saved.reads.length}
						This page reads {saved.reads.length} of your answers: {saved.reads.join(', ')}. It names them; it does not carry them, so it follows what you say as you change it.
					{:else}
						This page reads none of your answers.
					{/if}
				</p>
			{/if}
			<button class="btn preset-filled mt-3" disabled={!blocks.length} onclick={save}>Publish this page</button>
		</Section>

		<Section title="Pages you have published">
			{#if !pages.length}
				<Empty icon="info" title="None yet" description="Published pages appear here." />
			{:else}
				<div class="space-y-3">
					{#each pages as p (p.key)}
						<Item title={p.title} meta={p.at.slice(0, 10)} description={p.description}>
							{#snippet status()}
								{#if p.checked?.whose === 'broken'}
									<Status tone="bad">Does not hold up</Status>
								{:else if p.checked?.whose === 'theirs'}
									<Status tone="waiting">Somebody else's</Status>
								{:else}
									<Status tone="good">Yours</Status>
								{/if}
							{/snippet}
							{#snippet actions()}
								<button class="btn btn-sm preset-tonal" onclick={() => open(p)}>Open</button>
								<button class="btn btn-sm preset-outlined-primary-500" disabled={going !== null} onclick={() => void makePublic(p)}>
									{going === p.key ? 'Making…' : 'Make it public'}
								</button>
							{/snippet}
							{#if p.checked?.whose === 'broken'}
								<p class="text-error-600-400 text-sm">{p.checked.says}</p>
							{/if}
						</Item>
					{/each}
				</div>
			{/if}

			{#if older.length}
				<div class="mt-4">
					<Text role="meta">
						Made before pages could be drawn. Kept exactly as they were written — a receipt
						already signed is not rewritten to a newer taste.
					</Text>
					{#each older as p (p.key)}
						<Item title={p.title} meta={p.at.slice(0, 10)} description={p.description} />
					{/each}
				</div>
			{/if}
		</Section>

		{#if made || refused}
			<Section title="Public page" description="One HTML file: the page, only the styles it uses, and its receipt inside it. Nothing in it runs.">
				{#if refused}
					<Status tone="bad">Not made public</Status>
					<p class="mt-2 text-sm"><strong>{refused.title}</strong>: {refused.says}</p>
					{#if refused.wrong.length}
						<ul class="mt-2 list-disc pl-5 text-sm">{#each refused.wrong as w (w)}<li>{w}</li>{/each}</ul>
					{/if}
				{:else if made}
					<Status tone={made.checked.ok ? 'good' : 'bad'}>{made.checked.ok ? 'Signed, and it checks out' : 'Does not hold up'}</Status>
					<p class="mt-2 text-sm">{made.checked.says}</p>
					<div class="field-list mt-3">
						<div class="field-row"><span class="field-label">File</span><span class="field-value">{made.name} · {Math.ceil(made.bytes / 1024)} KB</span></div>
						<div class="field-row"><span class="field-label">Built from</span><span class="field-value"><Text role="token">{made.page}</Text></span></div>
						<div class="field-row"><span class="field-label">Its own address</span><span class="field-value"><Text role="token">{made.html}</Text></span></div>
					</div>
					<div class="actions mt-3">
						<a class="btn btn-sm preset-filled-primary-500" href={made.url} target="_blank" rel="noopener">Open it on its own</a>
						<button class="btn btn-sm preset-outlined-surface-500" onclick={() => made && download(made.name, made.file, 'text/html')}>Save the file</button>
					</div>
					<p class="hint mt-2">A copy is in your vault under “public”. The same page drawn by the same renderer always makes the same address.</p>
				{/if}
			</Section>
		{/if}

		<SignSite {identity} />

		<Section title="Check a public page" description="Any Q static page carries its own receipt. Choose one to see whether it is exactly what was signed.">
			<label class="btn btn-sm preset-outlined-surface-500 cursor-pointer">
				<input type="file" class="sr-only" accept=".html,text/html" onchange={(e) => void checkFile(e)} />
				Choose a page
			</label>
			{#if checked}
				<div class="mt-3">
					<Status tone={checked.ok ? 'good' : 'bad'}>{checked.ok ? 'Holds up' : 'Does not hold up'}</Status>
					<p class="mt-2 text-sm"><strong>{checked.name}</strong>: {checked.says}</p>
					{#if checked.receipt}<p class="mt-1 text-sm">Signed by <Text role="token">{checked.receipt.did}</Text> at {checked.receipt.signedAt}</p>{/if}
				</div>
			{/if}
		</Section>

		{#if opened}
			<Section title={openedName} description="As anyone you gave it to would see it.">
				<PageView page={opened} supply={supply} />
				<button class="btn btn-sm preset-tonal mt-4" onclick={() => (opened = null)}>Close</button>
			</Section>
		{/if}
	{/if}
</Page>
