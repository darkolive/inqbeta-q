<script lang="ts">
	/*
	 * Write — articles on your sites, as words.
	 *
	 * An article is written as text: a small header, then the body, the way
	 * every Dark Olive article already was. Beside it, the site draws it in its
	 * own templates as you type. Saving signs a version (q-core/articles.ts)
	 * into your vault; publishing hands that signed version to the site's
	 * source folder on this computer, which takes it only if it checks out.
	 *
	 * Nothing here reaches the live website. That is still build → site map →
	 * sign → deploy, done when you choose.
	 */
	import { Page, Section, Item, Status, Empty, Text } from '@inqbeta/q-ui';
	import SignIn from '$lib/components/SignIn.svelte';
	import { watch, type Identity } from '@inqbeta/q-core/passkey';
	import { watchFolder, saveLocked, type FolderState } from '@inqbeta/q-core/folder';
	import { watchLedger, refreshLedger, type Ledger } from '$lib/ledger';
	import { newestPerKey } from '$lib/features/dostudy';
	import { grantOf, siteFrom, type SiteRecord } from '$lib/sites';
	import { canonicalIds, importArticle, pageToText } from '@inqbeta/q-core/publication';
	import { publish, type Page as Built } from '@inqbeta/q-core/pages';
	import { pageAddress, slugOf, writeVersion, isVersion, type Section as Where, type VersionContent } from '@inqbeta/q-core/articles';
	import { readItem } from '@inqbeta/q-core/folder';
	import { joinArticle, splitArticle, type ArticleForm } from '@inqbeta/q-core/article-form';
	import type { Head } from '@inqbeta/q-core/pages';
	import BlockList from '$lib/write/BlockList.svelte';
	import Palette from '$lib/write/Palette.svelte';
	import { addFromPalette, dnd } from '$lib/write/drag.svelte';
	import { carrierFrom, releaseSite, type Step } from '$lib/releases';
	import ArticleHeader from '$lib/write/ArticleHeader.svelte';
	import type { EditBlock, SitePicture } from '$lib/write/types';

	let identity = $state<Identity | null>(null);
	let folder = $state<FolderState>({ kind: 'checking' });
	let ledger = $state<Ledger | null>(null);
	$effect(() => watch((id) => (identity = id)));
	$effect(() => watchFolder((s) => (folder = s)));
	$effect(() => watchLedger((l) => (ledger = l)));

	/* ---------------- the site ---------------- */

	let sites = $state<SiteRecord[]>([]);
	let site = $state<SiteRecord | null>(null);
	$effect(() => {
		const all = ledger ? newestPerKey(ledger.found) : [];
		const aside = new Set(all.filter((f) => f.kind === 'site-set-aside').map((f) => f.key));
		const found = all.filter((f) => f.kind === 'site' && !aside.has(f.key));
		void Promise.all(found.map((f) => siteFrom(f.item))).then((rs) => {
			sites = rs.filter((r): r is SiteRecord => !!r);
			if (!site || !sites.some((s) => s.founding.site === site!.founding.site)) site = sites[0] ?? null;
		});
	});

	type Source = {
		preview: string;
		routes: Record<string, string>;
		articles: { section: Where; slug: string; page: Built }[];
		media: Record<string, string[]>;
		pictures: SitePicture[];
	};
	let source = $state<Source | null>(null);
	let sourceSays = $state('');

	async function loadSource(domain: string) {
		sourceSays = '';
		try {
			const r = await fetch(`/api/local-site?domain=${encodeURIComponent(domain)}`);
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? `${r.status}`);
			source = await r.json();
		} catch (e) {
			source = null;
			const why = e instanceof Error ? e.message : String(e);
			sourceSays = /no source for/.test(why)
				? `This site was founded as ${domain}, and this computer has the files for a site by another name (darkolive.co.uk). Found the site again under Sites with its own domain, and set this one aside.`
				: `Write works on the site's files on this computer. Start Q and the site together (pnpm dev) and open this page again. (${why})`;
		}
	}
	$effect(() => {
		if (site) void loadSource(site.founding.domain);
	});

	const byPath = $derived.by(() => {
		const m = new Map<string, string>();
		for (const [a, paths] of Object.entries(source?.media ?? {})) for (const p of paths) m.set(p, a);
		return m;
	});
	const pathOf = (slug: string) => (a: string) => {
		const paths = source?.media[a] ?? [];
		return paths.find((p) => p.includes(`/${slug}/`) || p.endsWith(`/${slug}.webp`)) ?? paths[0] ?? a;
	};

	/* ---------------- the article ---------------- */

	let open = $state<{ section: Where; slug: string } | null>(null);
	let text = $state('');
	let baseline = $state<string | null>(null);

	/*
	 * Two ways to work on the same article. BLOCKS (the default): a form for
	 * the header, and the body as blocks you write into. TEXT: the whole
	 * article as words, for the odd moment that is quicker. They convert both
	 * ways without losing anything (tested on every page of the site).
	 */
	let mode = $state<'blocks' | 'text'>('blocks');
	/*
	 * Darren, 2026-09-24: "if we're in a write mode, we should get full screen
	 * … a toggle at the top that says layout or preview."
	 *
	 * LAYOUT is the page as blocks you arrange, with the palette where the
	 * menu was. PREVIEW is the site drawing it in its own templates. The
	 * preview frame stays loaded behind the layout, so flipping is instant.
	 */
	let view = $state<'layout' | 'preview'>('layout');
	let paletteOpen = $state(false);

	/* The dashboard stays where it was underneath; it just does not scroll. */
	$effect(() => {
		if (!open) return;
		const was = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = was;
		};
	});
	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			/* ⌘/Ctrl + . flips between layout and preview. */
			if ((e.metaKey || e.ctrlKey) && e.key === '.') {
				e.preventDefault();
				view = view === 'layout' ? 'preview' : 'layout';
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
	const EMPTY_FORM: ArticleForm = { title: '', subtitle: '', cover: '', coverAlt: '', role: '', location: '', partner: '', dateShown: '', logo: '', logoAlt: '', standfirst: '' };
	let form = $state<ArticleForm>({ ...EMPTY_FORM });
	let body = $state<EditBlock[]>([]);
	let ids = $state<Record<string, string>>({});
	/* The page's head, kept whole so fields the form does not show survive. */
	let head = $state<Head>({});

	function loadBlocks(page: Built) {
		const parts = splitArticle(structuredClone($state.snapshot(page)).blocks as never);
		form = parts.form;
		body = parts.body.map((b) => ({ ...b, settings: { ...(b.settings ?? {}) } })) as EditBlock[];
		ids = parts.ids;
		head = { ...(page.head ?? {}) };
	}

	function openArticle(a: { section: Where; slug: string; page: Built }) {
		open = { section: a.section, slug: a.slug };
		view = 'layout';
		dnd.here = null;
		text = pageToText(a.page, pathOf(a.slug));
		loadBlocks(a.page);
		void pageAddress(a.page).then((x) => (baseline = x));
		saying = null;
	}

	/* Empty paragraphs are where the next words go, not part of the page. */
	function withoutEmpty(list: EditBlock[]): EditBlock[] {
		return list
			.map((b) => (b.children ? { ...b, children: withoutEmpty(b.children) } : b))
			.filter((b) => {
				if (['text', 'quote', 'note', 'heading'].includes(b.kind)) return String(b.settings['q:block/says'] ?? '').trim() !== '';
				/* A picture nobody has chosen yet is a gap waiting to be filled, not a page error. */
				if (b.kind === 'figure') return !!b.settings['q:block/at'];
				if (b.kind === 'section') return (b.children?.length ?? 0) > 0;
				return true;
			});
	}

	function switchTo(next: 'blocks' | 'text') {
		if (next === mode) return;
		if (!built) {
			saying = { tone: 'bad', text: 'Fix what is listed first — the article has to hold together to change view.' };
			return;
		}
		if (next === 'text' && open) text = pageToText(built.page, pathOf(open.slug));
		if (next === 'blocks') loadBlocks(built.page);
		mode = next;
	}

	let newSection = $state<Where>('posts');
	let newTitle = $state('');
	function startNew() {
		const slug = slugOf(newTitle);
		if (source?.articles.some((a) => a.section === newSection && a.slug === slug)) {
			saying = { tone: 'bad', text: `There is already ${newSection}/${slug}. Open it instead, or choose another title.` };
			return;
		}
		open = { section: newSection, slug };
		view = 'layout';
		dnd.here = null;
		baseline = null;
		const today = new Date().toISOString().slice(0, 10);
		form = { ...EMPTY_FORM, title: newTitle.trim() };
		body = [{ kind: 'text', id: `text-${Date.now().toString(36)}`, settings: { 'q:block/says': '' } }];
		ids = {};
		head = { published: today, draft: 'yes' };
		text = `---\ntitle: ${newTitle.trim()}\nsubtitle: \nsummary: \ndate: ${today}\ndraft: true\n---\n\nStart writing here. A blank line starts a new paragraph.\n\n## A heading\n\nWords can be **bold**, *italic*, or [a link](https://darkolive.co.uk).\n`;
		newTitle = '';
		saying = null;
	}

	/* The text, turned into a page — or the reasons it cannot be yet. */
	let built = $state<{ page: Built; address: string } | null>(null);
	let problems = $state<string[]>([]);
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const o = open;
		const m = mode;
		const t = text;
		const snap = $state.snapshot({ form, body, ids, head });
		clearTimeout(timer);
		if (!o) return;
		timer = setTimeout(async () => {
			const missing: string[] = [];
			let called: string;
			let blocks: never[];
			let headOut: Head;
			if (m === 'blocks') {
				blocks = joinArticle(snap.form, withoutEmpty(snap.body as EditBlock[]), snap.ids, snap.head.published) as never[];
				called = snap.form.title.trim() || o.slug;
				headOut = { ...snap.head, imageAlt: snap.form.coverAlt || undefined };
			} else {
				const imported = importArticle(t, (p) => {
					const a = byPath.get(p);
					if (!a) missing.push(p);
					return a ?? `content://sha256/${'0'.repeat(64)}`;
				});
				blocks = imported.blocks as never[];
				called = imported.called;
				headOut = imported.head;
			}
			/* Blocks numbered the importer's way, so the same article has the same
			 * address whichever view it was written in (publication.ts). */
			const out = await publish(called, canonicalIds(blocks as never) as never, [], headOut);
			problems = [
				...missing.map((p) => `No picture on the site at ${p}.`),
				...(out.ok ? [] : [out.says, ...out.wrong.map((w) => (w.at ? `Block ${w.at}: ${w.says}` : w.says))])
			];
			built = out.ok && !missing.length ? { page: out.page, address: out.address } : null;
			if (built) sendPreview();
		}, 250);
	});

	/* ---------------- the preview, in the site's own templates ---------------- */

	let frame = $state<HTMLIFrameElement | null>(null);
	let frameReady = $state(false);
	function sendPreview() {
		if (!frame?.contentWindow || !built || !open || !source) return;
		frame.contentWindow.postMessage({ page: $state.snapshot(built.page), slug: open.slug, section: open.section }, source.preview);
	}
	$effect(() => {
		const onMessage = (e: MessageEvent) => {
			if (source && e.origin === source.preview && e.data?.ready) {
				frameReady = true;
				sendPreview();
			}
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	/* ---------------- versions ---------------- */

	const versionsKey = $derived(site && open ? `${site.founding.site}/${open.section}/${open.slug}` : '');
	const versions = $derived(
		(ledger?.found ?? []).filter((f) => f.kind === 'article-version' && f.key === versionsKey).sort((a, b) => b.at.localeCompare(a.at))
	);

	async function latestSaved(): Promise<VersionContent | null> {
		const top = versions[0];
		if (!top) return null;
		try {
			const json = JSON.parse(new TextDecoder().decode((await readItem(top.item)).data));
			return isVersion(json) ? json.content : null;
		} catch {
			return null;
		}
	}

	let saying = $state<{ tone: 'good' | 'bad'; text: string; view?: string; log?: string } | null>(null);
	let working = $state(false);
	/* Where a release has got to — shown in the top bar while it runs. */
	let step = $state<Step | null>(null);
	const STEP_WORDS: Record<Step, string> = {
		build: 'Building the site…',
		sign: 'Signing the release with the site’s key…',
		carry: 'Sending it to Vercel and checking the live copy…',
		done: 'Done'
	};

	async function save(andPublish: boolean) {
		if (!identity || !site || !open || !built) return;
		working = true;
		saying = null;
		try {
			const last = await latestSaved();
			const parent = last?.address ?? baseline;
			let receipt;
			if (last && last.address === built.address) {
				/* Nothing changed since the last save: publish that one rather than signing a twin. */
				const top = versions[0];
				receipt = JSON.parse(new TextDecoder().decode((await readItem(top.item)).data));
			} else {
				receipt = await writeVersion(identity, {
					site: site.founding.site,
					domain: site.founding.domain,
					section: open.section,
					slug: open.slug,
					page: $state.snapshot(built.page) as Built,
					parent,
					grants: [await grantOf(site)]
				});
				await saveLocked(`sites/${site.founding.domain}/${open.section}`, `${open.slug}.json`, JSON.stringify(receipt, null, 2), 'application/json');
			}
			if (!andPublish) {
				saying = { tone: 'good', text: 'Saved — a signed version in your vault. The site has not changed yet.' };
			} else {
				const r = await fetch(`/api/local-site?domain=${encodeURIComponent(site.founding.domain)}`, {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ version: receipt, founding: site.founding })
				});
				const out = await r.json().catch(() => ({ ok: false, says: `${r.status}` }));
				if (!r.ok || !out.ok) throw new Error(out.says ?? out.message ?? `${r.status}`);
				baseline = built.address;
				await loadSource(site.founding.domain);
				/* And on to the live site: build, sign under the site key, carry, check. */
				const carrierItem = (ledger?.found ?? [])
					.filter((f) => f.kind === 'site-carrier' && f.key === `${site!.founding.site}/vercel`)
					.sort((a, b) => b.at.localeCompare(a.at))[0];
				const carrier = carrierItem ? await carrierFrom(carrierItem.item) : null;
				const released = await releaseSite(identity, site!, carrier, (s) => (step = s));
				saying = released.ok
					? { tone: released.checked ? 'good' : 'bad', text: released.says, view: released.at + (route || '/') }
					: { tone: 'bad', text: `Saved and in the site's source, but not live yet: ${released.says}`, log: released.log };
			}
			await refreshLedger();
		} catch (e) {
			saying = { tone: 'bad', text: e instanceof Error ? e.message : String(e) };
		} finally {
			working = false;
			step = null;
		}
	}

	const unchanged = $derived(!!built && built.address === baseline);
	const route = $derived(open && source ? source.routes[open.section] + open.slug : '');
</script>

<svelte:head><title>Write — Q</title></svelte:head>

<Page title="Write" lead="Articles on your sites, written as words and signed as versions. Nothing here reaches the live website until you release it.">
	{#if !identity}
		<SignIn />
	{:else if folder.kind !== 'ready'}
		<Empty icon="files" title="No folder yet" description="Versions are kept in your folder. Set it up under Copy locations." />
	{:else if !sites.length}
		<Empty icon="network" title="No site yet" description="Found your site under Sites first — Write signs as someone the site allows to edit it." />
		<a class="btn preset-filled-primary-500 mt-3" href="/sites">Go to Sites</a>
	{:else}
		<Section title="Site">
			<div class="flex flex-wrap items-center gap-3">
				<select class="select w-auto" onchange={(e) => (site = sites.find((s) => s.founding.site === e.currentTarget.value) ?? null)}>
					{#each sites as s (s.founding.site)}
						<option value={s.founding.site} selected={s.founding.site === site?.founding.site}>{s.founding.name} — {s.founding.domain}</option>
					{/each}
				</select>
				{#if source}<Text role="meta">{source.articles.length} articles in its source</Text>{/if}
			</div>
			{#if sourceSays}<p class="mt-2 text-sm">{sourceSays}</p>{/if}
		</Section>

		{#if source && !open}
			<Section title="Start something new">
				<div class="flex flex-wrap items-end gap-3">
					<label class="label w-auto"><span class="label-text">Where</span>
						<select class="select" bind:value={newSection}>
							<option value="posts">Blog post</option>
							<option value="projects">Project (Our work)</option>
						</select>
					</label>
					<label class="label min-w-64 flex-1"><span class="label-text">Title</span><input class="input" bind:value={newTitle} placeholder="Ten years, and the part that comes next" /></label>
					<button class="btn preset-filled-primary-500" disabled={!newTitle.trim()} onclick={startNew}>Start writing</button>
				</div>
				{#if newTitle.trim()}<p class="hint mt-2">Its address will be <Text role="token">{(newSection === 'posts' ? '/blog/' : '/our-work/') + slugOf(newTitle)}</Text></p>{/if}
			</Section>

			{#each ['posts', 'projects'] as const as sec (sec)}
				<Section title={sec === 'posts' ? 'Blog posts' : 'Projects'}>
					<div class="space-y-2">
						{#each source.articles.filter((a) => a.section === sec) as a (a.slug)}
							<Item title={a.page.called} meta={a.slug} description={a.page.head?.draft === 'yes' ? 'Draft' : undefined}>
								{#snippet actions()}<button class="btn btn-sm preset-tonal" onclick={() => openArticle(a)}>Open</button>{/snippet}
							</Item>
						{/each}
					</div>
				</Section>
			{/each}
		{/if}

		{#if open && source}
			<!-- Writing takes the whole screen: nothing of the dashboard shows through. -->
			<div class="fixed inset-0 z-[60] flex flex-col bg-surface-50-950" role="dialog" aria-modal="true" aria-label="Writing {built?.page.called ?? open.slug}">
				<header class="flex flex-wrap items-center gap-2 border-b border-surface-200-800 px-3 py-2">
					<button class="btn btn-sm preset-tonal" onclick={() => (open = null)} title="Back to all articles">← Articles</button>
					<div class="min-w-0 flex-1 px-2">
						<p class="truncate font-semibold leading-tight">{built?.page.called ?? (form.title || open.slug)}</p>
						<p class="truncate text-xs opacity-60">{route || `${open.section}/${open.slug}`}{head.draft === 'yes' ? ' · draft' : ''}</p>
					</div>
					<div class="flex overflow-hidden rounded-full border border-surface-300-700" role="group" aria-label="Layout or preview">
						<button class="btn btn-sm rounded-none px-4 {view === 'layout' ? 'preset-filled-primary-500' : ''}" aria-pressed={view === 'layout'} onclick={() => (view = 'layout')}>Layout</button>
						<button class="btn btn-sm rounded-none px-4 {view === 'preview' ? 'preset-filled-primary-500' : ''}" aria-pressed={view === 'preview'} onclick={() => (view = 'preview')}>Preview</button>
					</div>
					<div class="flex flex-1 flex-wrap items-center justify-end gap-2">
						{#if view === 'layout'}
							<button class="btn btn-sm {mode === 'text' ? 'preset-filled' : 'preset-tonal'}" title="The whole article as words, for the odd moment that is quicker" onclick={() => switchTo(mode === 'text' ? 'blocks' : 'text')}>
								{mode === 'text' ? 'Back to blocks' : 'As text'}
							</button>
						{/if}
						<button class="btn btn-sm preset-outlined-surface-500" disabled={working || !built} onclick={() => void save(false)}>Save a version</button>
						<button class="btn btn-sm preset-filled-primary-500" disabled={working || !built} title="Save, build the site, sign the release with the site's key, and send it live" onclick={() => void save(true)}>
							{step ? 'Publishing…' : unchanged ? 'Send live again' : 'Publish'}
						</button>
					</div>
				</header>
				{#if step}
					<div class="flex items-center gap-3 border-b border-surface-200-800 bg-primary-500/10 px-4 py-2 text-sm" role="status" aria-live="polite">
						<span class="inline-block size-3 animate-pulse rounded-full bg-primary-500" aria-hidden="true"></span>
						{STEP_WORDS[step]}
						<span class="opacity-60">— this takes a minute or two.</span>
					</div>
				{/if}
				{#if saying || problems.length}
					<div class="border-b border-surface-200-800 px-4 py-2 text-sm">
						{#if saying}
							<p><Status tone={saying.tone}>{saying.tone === 'good' ? 'Done' : 'Not done'}</Status> {saying.text}
								{#if saying.view}<a class="anchor" href={saying.view} target="_blank" rel="noopener">See it on the site</a>{/if}</p>
							{#if saying.log}<pre class="mt-2 max-h-40 overflow-auto rounded-base bg-surface-100-900 p-2 text-xs">{saying.log}</pre>{/if}
						{/if}
						{#if problems.length}
							<ul class="list-disc pl-5 text-error-600-400">{#each problems as p (p)}<li>{p}</li>{/each}</ul>
						{/if}
					</div>
				{/if}

				<div class="relative min-h-0 flex-1">
					<!-- Preview: always loaded, shown on the toggle. -->
					<iframe
						bind:this={frame}
						title="How it will look on the site"
						src={source.preview + '/preview'}
						class="absolute inset-0 h-full w-full bg-surface-50 {view === 'preview' ? '' : 'invisible'}"
						onload={() => { frameReady = false; }}
					></iframe>
					{#if view === 'preview' && !frameReady}
						<p class="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-base bg-surface-50-950 px-3 py-1 text-xs shadow">Waiting for the site to draw it — is it running?</p>
					{/if}

					{#if view === 'layout'}
						<div class="absolute inset-0 grid md:grid-cols-[16rem_1fr]">
							{#if mode === 'blocks'}
								<aside class="hidden overflow-y-auto border-r border-surface-300-700 bg-surface-200-800 p-3 md:block {paletteOpen ? '!block absolute inset-y-0 left-0 z-10 w-72 shadow-xl' : ''}">
									<Palette onadd={(k) => { addFromPalette(k, body); paletteOpen = false; }} />
								</aside>
							{:else}
								<aside class="hidden border-r border-surface-200-800 p-4 text-sm md:block">
									<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">How to write</h3>
									<ul class="list-disc space-y-1 pl-4 text-xs">
										<li>Between the <code>---</code> lines: title, subtitle, summary, date, <code>draft: true</code>.</li>
										<li>A blank line starts a paragraph. <code>## </code> starts a heading.</li>
										<li><code>**bold**</code>, <code>*italic*</code>, <code>[words](https://…)</code>.</li>
										<li>A picture: <code>![what is in it](/images/…webp "credit")</code>.</li>
										<li>A film: <code>![title](youtube:ID "who made it")</code>.</li>
										<li><code>&lt;!-- a note --&gt;</code> is never shown.</li>
									</ul>
								</aside>
							{/if}
							<!-- Three tones: the palette, the desk, and the page on it. -->
							<main class="min-h-0 overflow-y-auto bg-surface-100-900">
								{#if mode === 'blocks'}
									<button class="btn btn-sm preset-tonal fixed bottom-4 left-4 z-20 md:hidden" onclick={() => (paletteOpen = !paletteOpen)}>{paletteOpen ? 'Close blocks' : '+ Blocks'}</button>
									<div class="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
										<ArticleHeader bind:form ctx={{ pictures: source.pictures ?? [], origin: '' }} project={open.section === 'projects'} />
										<div class="grid gap-3 rounded-container bg-surface-50-950 p-3 shadow ring-1 ring-surface-300-700 sm:grid-cols-[1fr_auto]">
											<label class="label">
												<span class="label-text">Summary <span class="opacity-60">— for search results and link previews, not shown on the page</span></span>
												<textarea class="textarea text-sm" rows="2" value={head.description ?? ''} oninput={(e) => (head.description = e.currentTarget.value)}></textarea>
											</label>
											<div class="space-y-2">
												<label class="label"><span class="label-text">Date</span><input type="date" class="input input-sm" value={head.published ?? ''} oninput={(e) => (head.published = e.currentTarget.value)} /></label>
												<label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox" checked={head.draft === 'yes'} onchange={(e) => (head.draft = e.currentTarget.checked ? 'yes' : undefined)} /> Still a draft</label>
											</div>
											<details class="sm:col-span-2">
												<summary class="cursor-pointer text-sm">For sharing</summary>
												<div class="mt-2 grid gap-2 sm:grid-cols-2">
													<label class="label"><span class="label-text text-xs">Hashtags</span><input class="input input-sm" value={head.tags ?? ''} oninput={(e) => (head.tags = e.currentTarget.value)} /></label>
													<label class="label"><span class="label-text text-xs">Who to mention</span><input class="input input-sm" value={head.mentions ?? ''} oninput={(e) => (head.mentions = e.currentTarget.value)} /></label>
												</div>
											</details>
										</div>
										<div class="rounded-container bg-surface-50-950 p-3 shadow-lg ring-1 ring-surface-300-700">
											<BlockList bind:blocks={body} ctx={{ pictures: source.pictures ?? [], origin: '' }} />
										</div>
										{#if versions.length}<p class="hint text-center">{versions.length} saved {versions.length === 1 ? 'version' : 'versions'} · last {versions[0].at.slice(0, 16).replace('T', ' ')}</p>{/if}
									</div>
								{:else}
									<div class="mx-auto h-full max-w-3xl p-4 md:p-8">
										<textarea class="textarea h-full min-h-[70vh] font-mono text-sm leading-relaxed" spellcheck="true" bind:value={text}></textarea>
									</div>
								{/if}
							</main>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</Page>
