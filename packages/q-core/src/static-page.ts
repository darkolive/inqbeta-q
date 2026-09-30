/*
 * A published page, compiled to one static HTML file that carries its own
 * receipt.
 *
 * Darren, 2026-09-23: "when you look at that as a completed bundle becomes its
 * own receipt. That one receipt is the static."
 *
 * DRAFT AND LIVE ARE DIFFERENT THINGS, ON PURPOSE.
 *
 *   Draft   — blocks, each with its settings, assembled in the builder and
 *             published as an inqbeta.page/1 design (pages.ts). It names what
 *             it reads and fills in live. Nothing is baked in.
 *   Live    — this. The design drawn ONCE, by the same renderer that draws the
 *             preview, into finished HTML: the words, the CSS it needs, and
 *             nothing that runs. What a search engine, a browser with no Q, or
 *             a static host is given.
 *
 * Because a static page is public and frozen, it may only hold what its
 * author put there. Blocks that draw from a person's vault at the moment of
 * opening — answers, cards, places, receipts, people — are refused, not
 * baked. Baking them would hand over values, which pages.ts exists to prevent.
 *
 * ONE FILE, ONE RECEIPT, INSIDE IT. The HTML is written with a marker where
 * the receipt goes. The receipt signs the address of the HTML-with-the-marker,
 * then replaces the marker. To check, put the marker back and hash again. So
 * the file needs nothing beside it to be checked, and it is the same bytes a
 * static host serves.
 *
 * THE SAME PAGE COMPILES TO THE SAME BYTES. No timestamps in the HTML, a fixed
 * order everywhere; the receipt's `signedAt` is the only clock, and it sits in
 * the receipt. Same design, same renderer → same `html` address, which is what
 * lets anyone rebuild a page and see that it is the one that was signed.
 *
 * The receipt is a <script type="application/json">: data, never run. The page
 * carries nothing that runs, same as the design it came from.
 *
 * Pure: strings in, strings out. The drawing happens in the app, which is the
 * only place with a renderer.
 */
import { checkReceipt, sealWith, type ReceiptCheck, type SealedReceipt } from './seal';
import { contentAddress } from './vault';
import type { Fixed, Page } from './pages';
import type { Identity } from './passkey';
import { plainText } from './inline';
import { findComponent } from './components';

export const STATIC_SCHEMA = 'inqbeta.static/1';
export const RECEIPT_MARK = '<!--q:receipt-->';
const RECEIPT_TAG = /<script type="application\/json" id="q-receipt">([\s\S]*?)<\/script>/;

/**
 * Blocks that draw from somebody's vault when the page is opened. A static
 * page is public and frozen, so these cannot be in one — they would either
 * show nothing, or show somebody's values to everyone for ever.
 */
export const LIVE_KINDS = ['answers', 'card', 'places', 'receipts', 'contacts', 'federations', 'table', 'blog', 'header', 'menu', 'drawer'] as const;

export interface StaticRefusal {
	ok: false;
	says: string;
	wrong: { id: string; kind: string; says: string }[];
}

const every = (list: Fixed[]): Fixed[] => list.flatMap((f) => [f, ...every(f.children ?? [])]);

/**
 * Whether a design can become a static page, and if not, which blocks stop it.
 *
 * `pictures` is the set of content addresses the compiler can actually put in
 * the file. A picture it cannot carry is refused rather than drawn as a gap.
 */
export function staticCheck(page: Page, pictures: Iterable<string> = []): { ok: true } | StaticRefusal {
	const have = new Set(pictures);
	const wrong: StaticRefusal['wrong'] = [];
	for (const b of every(page.blocks)) {
		if (b.kind === 'note') continue;
		if (b.kind === 'component') {
			/* ADR-Q-006: a static page is frozen and public. A component that runs
			 * only in Q (sign-in, keys, the vault) can never be in one; one made for
			 * sites waits for pinned, sandboxed code (steps 4 and 5). */
			const m = findComponent(b.settings['q:block/component']);
			wrong.push({
				id: b.id,
				kind: b.kind,
				says: m && !m.runsOn.includes('site')
					? `${m.called} is part of Q itself. A public page cannot carry it — people do this in Q.`
					: 'Components on public pages are not ready yet: their code has to be pinned and sandboxed first.'
			});
			continue;
		}
		if ((LIVE_KINDS as readonly string[]).includes(b.kind)) {
			wrong.push({ id: b.id, kind: b.kind, says: 'This shows things from your vault as the page is opened. A public page cannot carry them.' });
			continue;
		}
		if (b.kind === 'hero' && b.settings['q:block/card']) {
			wrong.push({ id: b.id, kind: b.kind, says: 'This hero hands over a card. Take the card off to make it public.' });
		}
		if (['figure', 'cover', 'standfirst'].includes(b.kind)) {
			const at = String(b.settings['q:block/at'] ?? '');
			if (at && !have.has(at)) wrong.push({ id: b.id, kind: b.kind, says: 'That picture is not in this vault, so it cannot go into the page.' });
		}
		if (b.kind === 'image' || (b.kind === 'hero' && b.settings['q:block/at'])) {
			const at = String(b.settings['q:block/at'] ?? '');
			if (b.kind === 'image' && !at) wrong.push({ id: b.id, kind: b.kind, says: 'No picture has been chosen.' });
			else if (at && !have.has(at)) wrong.push({ id: b.id, kind: b.kind, says: 'That picture is not in this vault, so it cannot go into the page.' });
			if (b.kind === 'image' && !b.heading) wrong.push({ id: b.id, kind: b.kind, says: 'A public picture needs a title — it is what a screen reader says instead.' });
		}
	}
	if (!wrong.length) return { ok: true };
	return {
		ok: false,
		says: `${wrong.length === 1 ? 'One block stops' : `${wrong.length} blocks stop`} this becoming a public page.`,
		wrong
	};
}

/** What goes in the <head>: said once, from the page, never typed twice. */
export interface Described {
	title: string;
	description: string;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

function clip(s: string, n: number): string {
	if (s.length <= n) return s;
	const cut = s.slice(0, n - 1);
	const at = cut.lastIndexOf(' ');
	return `${(at > n * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

/** Title and description, from the page itself — the first words, or the hero's. */
export function describe(page: Page): Described {
	if (page.head?.description) return { title: squash(page.called), description: clip(squash(page.head.description), 160) };
	const blocks = every(page.blocks);
	const text = blocks.find((b) => (b.kind === 'text' || b.kind === 'standfirst') && squash(String(b.settings['q:block/says'] ?? '')));
	const hero = blocks.find((b) => b.kind === 'hero');
	const from = text
		? plainText(String(text.settings['q:block/says']))
		: hero
			? String(hero.settings['q:block/under'] ?? hero.settings['q:block/says'] ?? '')
			: '';
	return { title: squash(page.called), description: clip(squash(from) || squash(page.called), 160) };
}

export const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* JSON inside a <script>: nothing in it may close the tag or start a comment. */
const safeJson = (v: unknown) =>
	JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export interface DocumentParts {
	page: Page;
	/** The page design's own address (pages.ts). Recorded, so the file says what it was built from. */
	pageAddress: string;
	/** The drawn body — PageView's output. */
	body: string;
	/** Only the CSS the body uses, already with fonts and pictures inside it. */
	css: string;
	/** Where it will live, if known. Search engines want it; nothing else needs it. */
	url?: string;
	lang?: string;
}

/** The whole file, before it is signed. Deterministic: same parts, same bytes. */
export function htmlDocument(p: DocumentParts): string {
	const { title, description } = describe(p.page);
	const lang = p.lang ?? 'en-GB';
	const ld = {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		name: title,
		description,
		inLanguage: lang,
		identifier: p.pageAddress,
		...(p.url ? { url: p.url } : {})
	};
	const head = [
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${escapeHtml(title)}</title>`,
		`<meta name="description" content="${escapeHtml(description)}">`,
		'<meta name="color-scheme" content="light dark">',
		`<meta name="generator" content="Q ${STATIC_SCHEMA}">`,
		`<meta name="inqbeta:page" content="${escapeHtml(p.pageAddress)}">`,
		...(p.url ? [`<link rel="canonical" href="${escapeHtml(p.url)}">`] : []),
		`<meta property="og:type" content="website">`,
		`<meta property="og:title" content="${escapeHtml(title)}">`,
		`<meta property="og:description" content="${escapeHtml(description)}">`,
		...(p.url ? [`<meta property="og:url" content="${escapeHtml(p.url)}">`] : []),
		`<meta name="twitter:card" content="summary">`,
		`<script type="application/ld+json">${safeJson(ld)}</script>`,
		`<style>${p.css.replace(/<\/style/gi, '<\\/style')}</style>`
	];
	return `<!doctype html>\n<html lang="${escapeHtml(lang)}" data-theme="dark-olive">\n<head>\n${head.join('\n')}\n</head>\n<body>\n${p.body}\n${RECEIPT_MARK}\n</body>\n</html>\n`;
}

export interface StaticContent {
	source: 'inqbeta:q/static';
	kind: 'static-page';
	schema: typeof STATIC_SCHEMA;
	called: string;
	/** The design it was drawn from. */
	page: string;
	/** The file itself, with the marker where this receipt sits. */
	html: string;
	/** What drew it. A different renderer may draw the same design differently. */
	renderer: string;
	bytes: number;
}

/** Sign the file and put its receipt inside it. */
export async function sealStatic(
	identity: Pick<Identity, 'did' | 'publicKey' | 'signing'>,
	html: string,
	meta: { called: string; page: string; renderer: string }
): Promise<{ file: string; receipt: SealedReceipt; content: StaticContent }> {
	if (html.split(RECEIPT_MARK).length !== 2) throw new Error('The page must have exactly one place for its receipt.');
	const runs = runsSomething(html);
	if (runs) throw new Error(`Something that runs got into the page (${runs}). It has not been signed.`);
	const bytes = new TextEncoder().encode(html);
	const content: StaticContent = {
		source: 'inqbeta:q/static',
		kind: 'static-page',
		schema: STATIC_SCHEMA,
		called: meta.called,
		page: meta.page,
		html: await contentAddress(bytes),
		renderer: meta.renderer,
		bytes: bytes.length
	};
	const receipt = await sealWith(identity, content);
	const file = html.replace(RECEIPT_MARK, `<script type="application/json" id="q-receipt">${safeJson(receipt)}</script>`);
	return { file, receipt, content };
}

export interface StaticCheck {
	ok: boolean;
	/** The HTML is byte for byte what was signed. */
	htmlMatches: boolean;
	receipt: SealedReceipt | null;
	check: ReceiptCheck | null;
	says: string;
}

/** Check a static page from its own bytes. Needs nothing beside the file. */
export async function checkStatic(file: string): Promise<StaticCheck> {
	const found = RECEIPT_TAG.exec(file);
	if (!found) return { ok: false, htmlMatches: false, receipt: null, check: null, says: 'This page carries no receipt.' };
	let receipt: SealedReceipt;
	try {
		receipt = JSON.parse(found[1]);
	} catch {
		return { ok: false, htmlMatches: false, receipt: null, check: null, says: 'The receipt in this page cannot be read.' };
	}
	const check = await checkReceipt(receipt);
	const content = receipt.content as Partial<StaticContent>;
	const unsigned = file.slice(0, found.index) + RECEIPT_MARK + file.slice(found.index + found[0].length);
	const htmlMatches = content?.html === (await contentAddress(new TextEncoder().encode(unsigned)));
	const ok = check.ok && htmlMatches && content?.schema === STATIC_SCHEMA;
	return {
		ok,
		htmlMatches,
		receipt,
		check,
		says: !check.ok
			? check.says
			: !htmlMatches
				? 'The receipt holds, but the page has been changed since it was signed.'
				: ok
					? 'This page is exactly what was signed, and the signature holds.'
					: 'The receipt holds, but it is not a receipt for a static page.'
	};
}

/**
 * Anything in the file a browser would execute. The only scripts allowed are
 * data: the JSON-LD for search engines and the receipt. Returns what was
 * found, or null.
 */
export function runsSomething(html: string): string | null {
	const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
	for (const tag of scripts) {
		if (!/type="application\/(ld\+)?json"/i.test(tag)) return tag;
	}
	const handler = /<[a-z][^>]*\son[a-z]+\s*=/i.exec(html);
	if (handler) return 'an event handler';
	if (/(href|src)\s*=\s*"\s*javascript:/i.test(html)) return 'a javascript: link';
	return null;
}
