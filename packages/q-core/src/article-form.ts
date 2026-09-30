/*
 * An article's header as a form, over its blocks.
 *
 * The top of a Dark Olive article — title, subtitle, cover, credits, the
 * partner's mark and what was done — is three blocks (cover, facts,
 * standfirst). A person should fill in fields, not arrange blocks, so Write's
 * block editor shows this as a form and keeps the blocks underneath.
 *
 * `splitArticle` takes a page's blocks apart into the form and the body;
 * `joinArticle` puts them back in the same order the importer uses, so an
 * article opened and saved without a change keeps its address (tested).
 *
 * Pure.
 */
import { factsOf, type Block } from './blocks';
import { formatMonthYear } from './publication';

export interface ArticleForm {
	title: string;
	subtitle: string;
	cover: string;
	coverAlt: string;
	role: string;
	location: string;
	partner: string;
	/** What the credits band shows as the date, e.g. "July – September 2022". */
	dateShown: string;
	logo: string;
	logoAlt: string;
	standfirst: string;
}

type AnyBlock = Block & { settings?: Record<string, unknown> };

const str = (b: AnyBlock | undefined, k: string) => {
	const v = b?.settings?.[`q:block/${k}`];
	return typeof v === 'string' ? v : '';
};

const CHROME = ['cover', 'facts', 'standfirst'];

export function splitArticle(blocks: AnyBlock[]): { form: ArticleForm; body: AnyBlock[]; ids: Record<string, string> } {
	const find = (kind: string) => blocks.find((b) => b.kind === kind);
	const cover = find('cover');
	const facts = find('facts');
	const standfirst = find('standfirst');
	const f = new Map(facts ? factsOf(facts as unknown as Record<string, unknown>).map((x) => [x.label, x.value]) : []);
	return {
		form: {
			title: str(cover, 'says'),
			subtitle: str(cover, 'under'),
			cover: str(cover, 'at'),
			coverAlt: str(cover, 'alt'),
			role: f.get('Role') ?? '',
			location: f.get('Location') ?? '',
			partner: f.get('With') ?? '',
			dateShown: f.get('Date') ?? '',
			logo: str(standfirst, 'at'),
			logoAlt: str(standfirst, 'alt'),
			standfirst: str(standfirst, 'says')
		},
		body: blocks.filter((b) => !CHROME.includes(b.kind)),
		ids: Object.fromEntries(CHROME.map((k) => [k, find(k)?.id ?? `${k}-1`]))
	};
}

/* Only what says something, so an empty field is no field — as the importer does. */
const tidy = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim() !== ''));

/**
 * The blocks again: cover, then facts and standfirst if they say anything,
 * then the body. `published` fills the credits date when none is written, the
 * way the importer does.
 */
export function joinArticle(form: ArticleForm, body: AnyBlock[], ids: Record<string, string>, published = ''): AnyBlock[] {
	const out: AnyBlock[] = [
		{
			kind: 'cover',
			id: ids.cover ?? 'cover-1',
			settings: tidy({ 'q:block/says': form.title, 'q:block/under': form.subtitle, 'q:block/at': form.cover, 'q:block/alt': form.coverAlt })
		}
	];
	const credited = !!(form.role || form.location || form.partner || form.dateShown);
	if (credited) {
		const date = form.dateShown || formatMonthYear(published);
		const lines = [
			['Role', form.role],
			['Location', form.location],
			['With', form.partner],
			['Date', date]
		]
			.filter(([, v]) => v)
			.map(([k, v]) => `${k}: ${v}`);
		out.push({ kind: 'facts', id: ids.facts ?? 'facts-2', settings: { 'q:block/facts': lines.join('\n') } });
	}
	if (form.standfirst || form.logo) {
		out.push({
			kind: 'standfirst',
			id: ids.standfirst ?? 'standfirst-3',
			settings: tidy({ 'q:block/says': form.standfirst, 'q:block/at': form.logo, 'q:block/alt': form.logoAlt })
		});
	}
	return [...out, ...body];
}
