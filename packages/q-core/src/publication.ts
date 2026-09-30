/*
 * An article as words, and as blocks — both ways.
 *
 * Moved here from apps/darkolive on 2026-09-24 so Q can use it: Write shows an
 * article as text a person can simply write, and turns it into the blocks a
 * page is made of. The same function imported the fifteen Dark Olive project
 * write-ups from their markdown; the reverse (`pageToText`) is new, and the
 * promise is that the two agree — text → blocks → text → blocks lands on the
 * same page address, checked against every page on the site.
 *
 * The text is markdown with a small header (frontmatter), because that is how
 * every Dark Olive article was already written and it reads the same in the
 * source as on the page:
 *
 *   title, subtitle, cover, coverAlt      → cover
 *   role, location, partner, date(Label)  → facts
 *   logo, logoAlt, standfirst             → standfirst
 *   the body                              → heading, text, quote, figure,
 *                                           embed, note, and groups for
 *                                           pairs, trios, asides, profiles
 *   video, videoTitle, videoAuthor        → the feature film
 *   summary, date, hashtags, mentions,
 *   draft                                 → the page's head
 *
 * Pictures are content addresses in blocks and site paths in text; the two
 * lookups are handed in, so this knows nothing about any particular site.
 *
 * Pure.
 */
import type { Block } from './blocks';
import type { Fixed, Head, Page } from './pages';

/** Flat `key: value` pairs between two `---` lines. */
export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
	if (!match) return { data: {}, body: raw };
	const data: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const i = line.indexOf(':');
		if (i < 0) continue;
		const key = line.slice(0, i).trim();
		let value = line.slice(i + 1).trim();
		if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
		data[key] = value;
	}
	return { data, body: match[2] };
}

/** Month and year, as the site's credits band shows a date. */
export function formatMonthYear(iso: string): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export interface Imported {
	called: string;
	blocks: Block[];
	head: Head;
}

export type AddressOf = (sitePath: string) => string;

const MEDIA = /^(youtube|dailymotion|soundcloud|vimeo):(.+)$/i;
const IMAGE_LINE = /^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)$/;
const MARKER = /^<!--\s*(aside|\/aside|profile)\s*-->$/;

export function importArticle(raw: string, addressOf: AddressOf): Imported {
	const { data, body } = parseFrontmatter(raw);
	let n = 0;
	const id = (kind: string) => `${kind}-${++n}`;
	const blocks: Block[] = [];

	blocks.push({
		kind: 'cover',
		id: id('cover'),
		settings: tidy({
			'q:block/says': data.title ?? 'Untitled',
			'q:block/under': data.subtitle,
			'q:block/at': data.cover ? addressOf(data.cover) : undefined,
			'q:block/alt': data.coverAlt
		})
	});

	/* Only a project has a credits band. A post's date is in its masthead. */
	const credited = !!(data.role || data.location || data.partner || data.dateLabel);
	const facts = [
		['Role', data.role],
		['Location', data.location],
		['With', data.partner],
		['Date', data.dateLabel || (data.date ? formatMonthYear(data.date) : '')]
	]
		.filter(([, v]) => v)
		.map(([k, v]) => `${k}: ${v}`);
	if (credited && facts.length) blocks.push({ kind: 'facts', id: id('facts'), settings: { 'q:block/facts': facts.join('\n') } });

	if (data.standfirst || data.logo) {
		blocks.push({
			kind: 'standfirst',
			id: id('standfirst'),
			settings: tidy({
				'q:block/says': data.standfirst,
				'q:block/at': data.logo ? addressOf(data.logo) : undefined,
				'q:block/alt': data.logoAlt
			})
		});
	}

	blocks.push(...bodyBlocks(body, addressOf, id));

	if (data.video) {
		const m = MEDIA.exec(data.video);
		blocks.push({
			kind: 'embed',
			id: id('embed'),
			settings: tidy({
				'q:block/provider': m ? m[1].toLowerCase() : 'youtube',
				'q:block/media': m ? m[2] : data.video,
				'q:block/says': data.videoTitle,
				'q:block/caption': data.videoAuthor,
				'q:block/size': 'feature'
			})
		});
	}

	return {
		called: data.title ?? 'Untitled',
		blocks,
		head: tidy({
			description: data.summary,
			published: data.date,
			imageAlt: data.coverAlt,
			tags: data.hashtags,
			mentions: data.mentions,
			draft: data.draft === 'true' ? 'yes' : undefined
		}) as Head
	};
}

/* Settings with nothing in them are left out, so an empty field is no field. */
function tidy<T extends Record<string, string | undefined>>(o: T): Record<string, string> {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as Record<string, string>;
}

/* The body in chunks: blank lines separate them, and a marker is always its own. */
function chunks(body: string): string[] {
	const out: string[] = [];
	for (const chunk of body.split(/\n\s*\n/)) {
		let cur: string[] = [];
		for (const line of chunk.split('\n')) {
			if (MARKER.test(line.trim())) {
				if (cur.length) out.push(cur.join('\n'));
				out.push(line.trim());
				cur = [];
			} else cur.push(line);
		}
		if (cur.join('').trim()) out.push(cur.join('\n'));
	}
	/* A comment can run across blank lines; put it back together. */
	const joined: string[] = [];
	for (const c of out.map((c) => c.replace(/^\n+|\s+$/g, '')).filter(Boolean)) {
		const last = joined[joined.length - 1];
		if (last !== undefined && last.startsWith('<!--') && !last.includes('-->')) joined[joined.length - 1] = `${last}\n\n${c}`;
		else joined.push(c);
	}
	return joined;
}

function pictureOrEmbed(line: string, addressOf: AddressOf, id: (k: string) => string): Block {
	const [, alt, href, title] = IMAGE_LINE.exec(line)!;
	const m = MEDIA.exec(href);
	if (m) {
		return {
			kind: 'embed',
			id: id('embed'),
			settings: tidy({
				'q:block/provider': m[1].toLowerCase(),
				'q:block/media': m[2],
				'q:block/says': alt,
				'q:block/caption': title
			})
		};
	}
	return {
		kind: 'figure',
		id: id('figure'),
		settings: tidy({ 'q:block/at': addressOf(href), 'q:block/alt': alt, 'q:block/caption': title })
	};
}

function bodyBlocks(body: string, addressOf: AddressOf, id: (k: string) => string): Block[] {
	const out: Block[] = [];
	/* Where blocks are going: the page, or an open aside/profile group. */
	let into: Block[] = out;
	let open: Block | null = null;
	let profileHeadings = 0;

	const close = () => {
		open = null;
		into = out;
	};

	for (const c of chunks(body)) {
		const marker = MARKER.exec(c);
		if (marker) {
			close();
			if (marker[1] === '/aside') continue;
			open = { kind: 'section', id: id('section'), settings: { 'q:block/arrange': marker[1] }, children: [] };
			out.push(open);
			into = open.children!;
			profileHeadings = 0;
			continue;
		}

		/* A block the words have no way to say — a styled one, a button, a
		 * gallery — travels whole, as JSON in a marked comment (pageToText). */
		const whole = /^<!--q:block (\{[\s\S]*\})-->$/.exec(c);
		if (whole) {
			try {
				const b = JSON.parse(whole[1]) as Block;
				into.push({ ...b, id: id(b.kind) });
				continue;
			} catch {
				/* not a block after all — kept as a note below */
			}
		}

		/* A comment in the markdown is the author talking to themselves. Kept as
		 * a note; the page never shows it — not even in its source. */
		const note = /^<!--([\s\S]*?)-->$/.exec(c);
		if (note) {
			into.push({ kind: 'note', id: id('note'), settings: { 'q:block/says': note[1].replace(/^\s*\n?|\s+$/g, '').replace(/^\s*/, '') } });
			continue;
		}

		const h = /^(#{2,6})\s+(.*)$/.exec(c);
		if (h && !c.includes('\n')) {
			/* A profile runs from its picture to the next h2. */
			if (open && open.settings?.['q:block/arrange'] === 'profile' && h[1] === '##' && ++profileHeadings > 1) close();
			const level = h[1].length;
			into.push({
				kind: 'heading',
				id: id('heading'),
				settings: {
					'q:block/says': h[2].trim(),
					'q:block/size': level === 2 ? 'large' : level === 3 ? 'medium' : 'small',
					...(level > 3 ? { 'q:block/level': level } : {})
				}
			});
			continue;
		}

		if (c.startsWith('>')) {
			const says = c
				.split('\n')
				.map((l) => l.replace(/^>\s?/, ''))
				.join('\n');
			into.push({ kind: 'quote', id: id('quote'), settings: { 'q:block/says': says } });
			continue;
		}

		const lines = c.split('\n').map((l) => l.trim());
		if (lines.every((l) => IMAGE_LINE.test(l))) {
			const items = lines.map((l) => pictureOrEmbed(l, addressOf, id));
			if (items.length === 1) into.push(items[0]);
			else into.push({ kind: 'section', id: id('section'), settings: { 'q:block/arrange': 'grid' }, children: items });
			continue;
		}

		into.push({ kind: 'text', id: id('text'), settings: { 'q:block/says': c } });
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * And back: a page as the words a person writes
 * ------------------------------------------------------------------ */

export type PathOf = (address: string) => string;

const set = (b: Fixed, k: string) => {
	const v = b.settings[`q:block/${k}`];
	return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
};

/* One figure or embed as a markdown image line. */
function pictureLine(b: Fixed, pathOf: PathOf): string {
	const caption = set(b, 'caption');
	const tail = caption ? ` "${caption}"` : '';
	if (b.kind === 'embed') return `![${set(b, 'says')}](${set(b, 'provider')}:${set(b, 'media')}${tail})`;
	return `![${set(b, 'alt')}](${pathOf(set(b, 'at'))}${tail})`;
}

/* Blocks the text form has no words for travel whole. Kinds and layouts the
 * importer reads from plain markdown are written as markdown; anything else —
 * a style token, a newer kind, a newer layout — as JSON in a marked comment,
 * so switching to the text view never loses a thing. */
const WORDED = new Set(['heading', 'text', 'quote', 'note', 'figure', 'embed', 'section']);
const WORDED_LAYOUTS = new Set(['grid', 'aside', 'profile']);

function needsWhole(b: Fixed): boolean {
	if (!WORDED.has(b.kind)) return true;
	if (Object.keys(b.settings).some((k) => k.startsWith('q:style/'))) return true;
	if (b.kind === 'section' && !WORDED_LAYOUTS.has(String(b.settings['q:block/arrange'] ?? 'grid'))) return true;
	if (b.kind === 'section' && (b.children ?? []).some(needsWhole)) return true;
	return false;
}

function wholeBlock(b: Fixed): string {
	const strip = (x: Fixed): Record<string, unknown> => {
		const { reads: _r, width, heading, ...rest } = x as Fixed & { reads?: unknown };
		return {
			...rest,
			/* A heading above a block is a setting when written; Fixed lifts it out. */
			...(heading ? { settings: { ...rest.settings, 'q:block/heading': heading } } : {}),
			...(width && width !== 'full' ? { width } : {}),
			...(x.children ? { children: x.children.map(strip) } : {})
		};
	};
	return `<!--q:block ${JSON.stringify(strip(b)).replace(/-->/g, '--\\u003e')}-->`;
}

function bodyText(blocks: Fixed[], pathOf: PathOf): string[] {
	const out: string[] = [];
	for (const b of blocks) {
		if (needsWhole(b)) {
			out.push(wholeBlock(b));
			continue;
		}
		switch (b.kind) {
			case 'heading': {
				const level = Number(b.settings['q:block/level']) || (set(b, 'size') === 'medium' ? 3 : set(b, 'size') === 'small' ? 4 : 2);
				out.push(`${'#'.repeat(level)} ${set(b, 'says')}`);
				break;
			}
			case 'text':
				out.push(set(b, 'says'));
				break;
			case 'quote':
				out.push(set(b, 'says').split('\n').map((l) => `> ${l}`).join('\n'));
				break;
			case 'note':
				out.push(`<!-- ${set(b, 'says')} -->`);
				break;
			case 'figure':
			case 'embed':
				out.push(pictureLine(b, pathOf));
				break;
			case 'section': {
				const arrange = set(b, 'arrange') || 'grid';
				const kids = b.children ?? [];
				if (arrange === 'aside') out.push('<!-- aside -->', ...bodyText(kids, pathOf), '<!-- /aside -->');
				else if (arrange === 'profile') out.push('<!-- profile -->', ...bodyText(kids, pathOf));
				else if (kids.every((k) => k.kind === 'figure' || k.kind === 'embed')) out.push(kids.map((k) => pictureLine(k, pathOf)).join('\n'));
				else out.push(...bodyText(kids, pathOf));
				break;
			}
		}
	}
	return out;
}

const PAGE_CHROME = new Set(['cover', 'facts', 'standfirst']);

/**
 * A page as the text that makes it: a header, then the body. Opening an
 * article in Write is this; saving it is `importArticle` on what was written.
 */
export function pageToText(page: Page, pathOf: PathOf): string {
	const find = (kind: string) => page.blocks.find((b) => b.kind === kind);
	const cover = find('cover');
	const standfirst = find('standfirst');
	const factsBlock = find('facts');
	const feature = page.blocks.find((b) => b.kind === 'embed' && set(b, 'size') === 'feature');
	const facts = new Map<string, string>();
	for (const line of (factsBlock ? set(factsBlock, 'facts') : '').split('\n')) {
		const at = line.indexOf(':');
		if (at > 0) facts.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
	}
	const h = page.head ?? {};
	const date = facts.get('Date') ?? '';
	const credited = facts.has('Role') || facts.has('Location') || facts.has('With');
	const dateLabel = date && (date !== formatMonthYear(h.published ?? '') || !credited) ? date : '';

	const fields: [string, string | undefined][] = [
		['title', cover ? set(cover, 'says') : page.called],
		['subtitle', cover ? set(cover, 'under') : ''],
		['summary', h.description],
		['date', h.published],
		['dateLabel', dateLabel],
		['location', facts.get('Location')],
		['role', facts.get('Role')],
		['partner', facts.get('With')],
		['cover', cover && set(cover, 'at') ? pathOf(set(cover, 'at')) : ''],
		['coverAlt', cover ? set(cover, 'alt') : ''],
		['logo', standfirst && set(standfirst, 'at') ? pathOf(set(standfirst, 'at')) : ''],
		['logoAlt', standfirst ? set(standfirst, 'alt') : ''],
		['video', feature ? `${set(feature, 'provider')}:${set(feature, 'media')}` : ''],
		['videoTitle', feature ? set(feature, 'says') : ''],
		['videoAuthor', feature ? set(feature, 'caption') : ''],
		['standfirst', standfirst ? set(standfirst, 'says') : ''],
		['mentions', h.mentions],
		['hashtags', h.tags],
		['draft', h.draft === 'yes' ? 'true' : '']
	];
	const header = fields.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
	const body = bodyText(page.blocks.filter((b) => !PAGE_CHROME.has(b.kind) && b !== feature), pathOf);
	return `---\n${header.join('\n')}\n---\n\n${body.join('\n\n')}\n`;
}

/*
 * Block names, as the importer gives them.
 *
 * A block's id only has to be unique within its page, but it is part of the
 * page, so it is part of the page's address. The importer numbers blocks in
 * the order it makes them; the block editor keeps whatever names blocks had
 * as they were moved about. Found 2026-09-24, after Darren's first edits in
 * Write: the same article, identical in every word, had two addresses
 * depending on which view saved it.
 *
 * So both views number blocks the importer's way before a page is made:
 * header blocks first, then the body in reading order — a row of pictures
 * names its pictures before itself, any other group itself before what is in
 * it — and the film at the end last. Same article, same address, whichever
 * way it was written.
 */
export function canonicalIds<T extends { kind: string; id: string; settings?: Record<string, unknown>; children?: T[] }>(blocks: T[]): T[] {
	let n = 0;
	const next = (kind: string) => `${kind}-${++n}`;
	const isPicture = (b: T) => b.kind === 'figure' || (b.kind === 'embed' && b.settings?.['q:block/size'] !== 'feature');
	const isFeature = (b: T) => b.kind === 'embed' && b.settings?.['q:block/size'] === 'feature';
	const walk = (b: T): T => {
		if (b.kind === 'section') {
			const kids = b.children ?? [];
			const row = (b.settings?.['q:block/arrange'] ?? 'grid') === 'grid' && kids.length > 0 && kids.every(isPicture);
			if (row) {
				const children = kids.map(walk);
				return { ...b, children, id: next('section') };
			}
			const id = next('section');
			return { ...b, id, children: kids.map(walk) };
		}
		return { ...b, id: next(b.kind) };
	};
	const top = blocks.filter((b) => !isFeature(b));
	const features = blocks.filter(isFeature);
	return [...top.map(walk), ...features.map(walk)];
}
