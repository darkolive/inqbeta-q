<script lang="ts">
	/*
	 * Your data — everything in your Q folder, and only for you.
	 * (Ported from DoStudy's Data tab, 2026-09-16: the folder now belongs to Q.)
	 *
	 * Darren, 2026-09-16: "another tab next to Verify, which is your data… where
	 * you can see everything that is in that folder. So it's completely
	 * transparent, but only because you've signed in, which you can do offline."
	 *
	 * On the desktop the folder is a row of meaningless .dsv files. Here, signed
	 * in, it is the real thing: names, types, previews. Signed out it is locked,
	 * and says so rather than pretending to be empty.
	 *
	 * Plain files somebody put in the folder by hand are shown too, marked as
	 * NOT locked, with a button to lock them — being transparent about what is
	 * not protected matters as much as protecting the rest.
	 *
	 * 2026-09-17: shown as a directory tree of real names (FileTree), with the
	 * chosen file opened beside it. Receipts — signed records — are left to the
	 * Receipts page. In Safari the folder is kept inside the browser (folder.ts).
	 */
	import { untrack } from 'svelte';
	import {
		deleteItem,
		download,
		itemAsFile,
		listItems,
		lockItem,
		readItem,
		saveLocked,
		wakeFolder,
		watchFolder,
		openWithPicker,
		pickersSupported,
		saveWithPicker,
		type FolderItem,
		type FolderState,
		type PickedFile
	} from '@inqbeta/q-core/folder';
	import type { VaultMeta } from '@inqbeta/q-core/vault';
	import { unlock, watch as watchIdentity, type Identity } from '@inqbeta/q-core/passkey';
	import FolderPanel from './FolderPanel.svelte';
	import FileTree from './FileTree.svelte';
	import { Heading, Status } from '@inqbeta/q-ui';
	import { refreshLedger, watchLedger } from '$lib/ledger';

	let folder = $state<FolderState>({ kind: 'checking' });
	let identity = $state<Identity | null>(null);
	let items = $state<FolderItem[]>([]);
	let loading = $state(false);
	let says = $state('');
	let working = $state(false);

	const active = () => true;

	async function load() {
		if (folder.kind !== 'ready') {
			items = [];
			return;
		}
		loading = true;
		items = await listItems().catch(() => []);
		loading = false;
		void refreshLedger();
	}

	/* Which files are receipts — from the ledger, which reads them. */
	let receiptPaths = $state<Set<string>>(new Set());
	$effect(() => watchLedger((l) => (receiptPaths = l.receiptPaths)));

	$effect(() =>
		watchFolder((s) =>
			untrack(() => {
				folder = s;
				void load();
			})
		)
	);
	$effect(() =>
		watchIdentity((id) =>
			untrack(() => {
				identity = id;
				preview = null;
				void load();
			})
		)
	);
	/* Coming back to the tab: the folder may have changed in Finder. */
	$effect(() => {
		if (active()) untrack(() => void load());
	});

	const plain = $derived(items.filter((i) => !i.locked));
	const unreadable = $derived(items.filter((i) => i.locked && !i.meta));
	const files = $derived(items.filter((i) => !receiptPaths.has(i.diskPath)));
	const receiptCount = $derived(items.length - files.length);

	/* ---------------- adding ---------------- */

	let over = $state(false);

	async function add(files: FileList | File[] | null | undefined) {
		if (!files?.length) return;
		says = '';
		working = true;
		let n = 0;
		for (const f of Array.from(files)) {
			try {
				await saveLocked('files', f.name, await f.arrayBuffer(), f.type);
				n++;
			} catch {
				says = `${f.name} could not be added.`;
			}
		}
		working = false;
		if (n) says = `${n} file${n === 1 ? '' : 's'} added, locked to your passkey.`;
		await load();
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		over = false;
		if (folder.kind === 'ready' && identity) void add(e.dataTransfer?.files);
	}

	/* A drop that misses the box must not make the browser open the file. */
	function guard(e: DragEvent) {
		if (active()) e.preventDefault();
	}

	/* ---------------- looking ---------------- */

	/*
	 * What is open for a look. `item` is set when it came from the folder list;
	 * `picked` when it came through the Open dialog — possibly from outside the
	 * folder, possibly not locked, in which case it can be locked in.
	 */
	type Shown = { meta: VaultMeta; item: FolderItem | null; picked: PickedFile | null; data: Uint8Array<ArrayBuffer> };
	let preview = $state<
		| (Shown & { kind: 'image'; url: string })
		| (Shown & { kind: 'text'; text: string })
		| (Shown & { kind: 'json'; text: string })
		| (Shown & { kind: 'none' })
		| null
	>(null);

	$effect(() => {
		const p = preview;
		return () => {
			if (p?.kind === 'image') URL.revokeObjectURL(p.url);
		};
	});

	const TEXTY = /\.(md|markdown|txt|csv|tsv|html?|css|js|ts|svelte|xml|yml|yaml|log)$/i;

	function show(meta: VaultMeta, data: Uint8Array<ArrayBuffer>, item: FolderItem | null, picked: PickedFile | null) {
		const base: Shown = { meta, item, picked, data };
		const name = meta.name.toLowerCase();
		if (meta.type.startsWith('image/')) {
			preview = { ...base, kind: 'image', url: URL.createObjectURL(new Blob([data], { type: meta.type })) };
		} else if (name.endsWith('.json')) {
			try {
				preview = { ...base, kind: 'json', text: JSON.stringify(JSON.parse(new TextDecoder().decode(data)), null, 2) };
			} catch {
				preview = { ...base, kind: 'text', text: new TextDecoder().decode(data) };
			}
		} else if (meta.type.startsWith('text/') || TEXTY.test(name)) {
			preview = { ...base, kind: 'text', text: new TextDecoder().decode(data) };
		} else {
			preview = { ...base, kind: 'none' };
		}
	}

	async function look(item: FolderItem) {
		says = '';
		try {
			const { meta, data } = await readItem(item);
			show(meta, data, item, null);
		} catch {
			says = 'That file would not open.';
		}
	}

	/* The system's Open dialog, starting in the folder. Anything, from anywhere. */
	async function openFromDisk() {
		says = '';
		try {
			const [p] = await openWithPicker({ from: 'folder' });
			if (!p) return;
			show(p.meta, p.data, null, p);
			if (!p.inFolder) says = `${p.meta.name} is not in your ${folder.kind === 'ready' ? folder.name : 'Q'} folder.`;
		} catch (e) {
			says = e instanceof Error ? e.message : 'That file would not open.';
		}
	}

	/* Adding through the system's Open dialog, starting in Downloads. */
	async function addFromDisk() {
		try {
			const picked = await openWithPicker({ from: 'downloads', multiple: true });
			await add(picked.map((p) => new File([p.data], p.meta.name, { type: p.meta.type })));
		} catch (e) {
			says = e instanceof Error ? e.message : String(e);
		}
	}

	/* Lock a file opened from elsewhere into the folder — the Save dialog chooses where. */
	async function lockInAs(p: Shown) {
		says = '';
		try {
			const r = await saveWithPicker(p.meta.name, p.data, p.meta.type);
			if (!r) return;
			says = r.inFolder
				? `Locked into your folder as ${r.where}.`
				: `Locked and saved as ${r.where} — outside your Q folder, so it will not appear in this list.`;
			await load();
		} catch (e) {
			says = e instanceof Error ? e.message : String(e);
		}
	}

	async function copyOut(item: FolderItem) {
		const { meta, data } = await readItem(item);
		download(meta.name, data, meta.type || 'application/octet-stream');
	}

	async function lock(item: FolderItem) {
		working = true;
		try {
			await lockItem(item);
		} catch {
			says = `${item.meta?.name} could not be locked.`;
		}
		working = false;
		await load();
	}

	async function lockAll() {
		working = true;
		for (const i of plain) {
			try {
				await lockItem(i);
			} catch {
				says = `${i.meta?.name} could not be locked.`;
			}
		}
		working = false;
		await load();
	}

	let confirming = $state<string | null>(null);

	async function remove(item: FolderItem) {
		confirming = null;
		try {
			await deleteItem(item);
			if (preview?.item?.diskPath === item.diskPath) preview = null;
		} catch {
			says = 'That file could not be deleted.';
		}
		await load();
	}

	async function signIn() {
		says = '';
		const out = await unlock();
		if (!out.ok) says = out.says;
	}

	const size = (n: number) =>
		n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
	const when = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<svelte:window ondragover={guard} ondrop={guard} />

<div class="stack">


	{#if folder.kind === 'checking'}
		<p class="hint">Looking…</p>
	{:else if folder.kind === 'unsupported'}
		<div class="panel-note">
			<p>This browser cannot keep files — try Safari, Chrome or Edge.</p>
		</div>
	{:else if !identity}
		<div class="panel stack">
			<Heading role="section-title">Locked</Heading>
			<p class="text-surface-900-100">
				{#if folder.kind === 'ready'}
					{folder.inBrowser ? 'Your folder in this browser' : `Your ${folder.name} folder`} holds {items.length} file{items.length === 1 ? '' : 's'}. What they are
					is locked to your passkey.
				{:else}
					Your data is locked to your passkey.
				{/if}
			</p>
			<div class="actions">
				<button type="button" class="btn preset-filled-primary-500" onclick={() => void signIn()}>
					Sign in with my passkey
				</button>
			</div>
		</div>
	{:else if folder.kind === 'asleep'}
		<div class="panel stack">
			<p class="text-surface-900-100">The browser needs you to allow your {folder.name} folder again.</p>
			<div class="actions">
				<button type="button" class="btn preset-filled-primary-500" onclick={() => void wakeFolder()}>
					Allow {folder.name}
				</button>
			</div>
		</div>
	{:else if folder.kind !== 'ready'}
		<FolderPanel />
	{:else}
		<div class="panel stack">
			<div class="field-list">
				<div class="field-row">
					<span class="field-label">{folder.inBrowser ? 'Where' : 'Folder'}</span>
					<span class="field-value">{folder.name}</span>
				</div>
				<div class="field-row">
					<span class="field-label">Files</span>
					<span class="field-value">
						{loading ? '…' : files.length}{!loading && receiptCount ? ` (and ${receiptCount} receipt${receiptCount === 1 ? '' : 's'})` : ''}
						{#if !loading && items.length}
							· {plain.length ? `${items.length - plain.length} locked, ${plain.length} not` : 'all locked to your passkey'}
						{/if}
					</span>
				</div>
			</div>

			{#if plain.length}
				<div class="panel-warn">
					<p>
						{plain.length} file{plain.length === 1 ? ' was' : 's were'} put in the folder without being
						locked. Anyone who opens the folder can read {plain.length === 1 ? 'it' : 'them'}.
					</p>
					<div class="actions mt-3">
						<button type="button" class="btn btn-sm preset-filled-primary-500" disabled={working} onclick={() => void lockAll()}>
							Lock {plain.length === 1 ? 'it' : 'them all'}
						</button>
					</div>
				</div>
			{/if}

			{#if unreadable.length}
				<div class="panel-bad">
					<p>
						{unreadable.length} locked file{unreadable.length === 1 ? '' : 's'} would not open with this
						passkey. {unreadable.length === 1 ? 'It was' : 'They were'} locked with another, or
						damaged — there is no way to tell which.
					</p>
				</div>
			{/if}

			<div
				role="presentation"
				ondragover={(e) => {
					e.preventDefault();
					over = true;
				}}
				ondragleave={() => (over = false)}
				ondrop={drop}
				class="rounded-base border-2 border-dashed p-6 text-center {over
					? 'border-primary-500 bg-primary-500/5'
					: 'border-surface-200-800'}"
			>
				{#if pickersSupported()}
					<div class="actions justify-center">
						<button type="button" class="btn preset-filled-primary-500" disabled={working} onclick={() => void addFromDisk()}>
							{working ? 'Locking…' : 'Add files'}
						</button>
						<button type="button" class="btn preset-outlined-surface-500" onclick={() => void openFromDisk()}>Open a file…</button>
					</div>
				{:else}
				<label class="cursor-pointer">
					<span class="btn preset-filled-primary-500">{working ? 'Locking…' : 'Add files'}</span>
					<input
						type="file"
						multiple
						class="sr-only"
						disabled={working}
						onchange={(e) => {
							void add(e.currentTarget.files);
							e.currentTarget.value = '';
						}}
					/>
				</label>
				{/if}
				<p class="hint mt-2">
					Or drag them here. Images, notes, anything — each is locked as it goes in.
					{#if pickersSupported()}“Open a file…” opens your folder in the system's own dialog, and reads locked files with your passkey.{/if}
				</p>
			</div>

			{#if says}
				<p class="text-sm text-surface-900-100" aria-live="polite">{says}</p>
			{/if}
		</div>

		{#if !loading && !files.length}
			<p class="hint">
				{receiptCount
					? `No files yet — just ${receiptCount} receipt${receiptCount === 1 ? '' : 's'}, which are on the Receipts page.`
					: 'Nothing here yet. What sites save through Q, and anything you add above, appears here.'}
			</p>
		{:else if files.length}
			<div class="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
				<nav class="panel-quiet self-start overflow-auto lg:max-h-[75vh]" aria-label="Folders and files">
					<FileTree items={files} selected={preview?.item?.diskPath ?? null} onselect={(i) => void look(i)} />
					{#if receiptCount}
						<p class="hint mt-3"><a class="anchor" href="/receipts">{receiptCount} receipt{receiptCount === 1 ? '' : 's'}</a> are kept apart, under Receipts.</p>
					{/if}
				</nav>

				<div class="stack-tight">
					{#if preview}
						<div class="panel stack" aria-live="polite">
							<div class="flex items-start justify-between gap-4">
								<div>
									<Heading role="title">{preview.meta.name}</Heading>
									<p class="hint">
										{preview.meta.type || 'unknown type'} · {size(preview.meta.size)}
										{#if preview.item}· {when(preview.meta.saved)}{/if}
										{preview.picked ? ` · ${preview.picked.locked ? 'locked' : 'not locked'}${preview.picked.inFolder ? ` · ${preview.picked.inFolder}` : ' · from outside your folder'}` : ''}
									</p>
									{#if preview.item}
										<p class="role-meta mt-1" data-role="meta">
											{#if preview.item.intact === false}
												<Status tone="bad">Damaged</Status>
											{:else}
												<Status tone={preview.item.locked ? 'good' : 'needs-you'}>{preview.item.locked ? 'Locked' : 'Not locked'}</Status>
											{/if}
											<span class="role-token ml-2" data-role="token">{folder.kind === 'ready' && folder.inBrowser ? 'stored as' : 'on disk'}: {preview.item.diskPath}</span>
										</p>
									{/if}
								</div>
								<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => (preview = null)}>Close</button>
							</div>
							{#if preview.kind === 'image'}
								<img src={preview.url} alt={preview.meta.name} class="max-h-[60vh] w-auto rounded-base" />
							{:else if preview.kind === 'text'}
								<pre class="max-h-[60vh] overflow-auto rounded-base bg-surface-100-900 p-4 text-sm whitespace-pre-wrap text-surface-950-50">{preview.text}</pre>
							{:else if preview.kind === 'json'}
								<pre class="max-h-[60vh] overflow-auto rounded-base bg-surface-100-900 p-4 text-xs whitespace-pre-wrap text-surface-950-50">{preview.text}</pre>
							{:else}
								<p class="text-surface-900-100">No preview for this kind of file. Save a readable copy to open it.</p>
							{/if}
							{#if preview.item}
								{@const item = preview.item}
								<div class="actions">
									<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => void copyOut(item)}>Save a readable copy</button>
									{#if !item.locked}
										<button type="button" class="btn btn-sm preset-filled-primary-500" disabled={working} onclick={() => void lock(item)}>Lock it</button>
									{/if}
									{#if confirming === item.diskPath}
										<span class="text-sm text-surface-950-50">Delete for good?</span>
										<button type="button" class="btn btn-sm preset-filled-error-500" onclick={() => void remove(item)}>Delete</button>
										<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => (confirming = null)}>Keep it</button>
									{:else}
										<button type="button" class="btn btn-sm preset-outlined-surface-500" onclick={() => (confirming = item.diskPath)}>Delete</button>
									{/if}
								</div>
							{/if}
							{#if preview.picked && (!preview.picked.locked || !preview.picked.inFolder)}
								<div class="actions">
									<button type="button" class="btn btn-sm preset-filled-primary-500" onclick={() => preview && void lockInAs(preview)}>
										Lock into my folder…
									</button>
								</div>
								<p class="hint">
									The save dialog opens in your folder with a meaningless name suggested. A name you type there
									will show on the desktop; the real name stays inside the lock either way.
								</p>
							{/if}
						</div>
					{:else}
						<div class="panel-quiet">
							<p class="text-surface-900-100">Choose a file in the tree to open it here.</p>
							<p class="hint">Arrow keys move through the tree; Enter opens.</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<details class="panel-quiet">
			<summary class="cursor-pointer text-surface-900-100">What the lock does, and does not do</summary>
			<ul class="stack-tight mt-3 list-disc pl-5 text-sm text-surface-900-100">
				<li>Every file's contents, name and type are encrypted with a key only your passkey can rebuild. On the desktop they are just .dsv files.</li>
				<li>Anyone who opens the folder can still see how many files there are, how big, and when they changed — and could delete them. Back the folder up like anything else.</li>
				<li>Without your passkey nobody can open them — not Dark Olive, and not you. Keep a readable copy of anything you cannot afford to lose.</li>
				<li>A different passkey, including one made in another browser, cannot open this folder.</li>
			</ul>
		</details>
	{/if}
</div>
