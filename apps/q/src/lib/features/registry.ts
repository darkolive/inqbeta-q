/*
 * Feature packs — what each federation adds to Q.
 *
 * Darren, 2026-09-16: "each type of federation can add features and UI. For
 * example, evidence capture for courses."
 *
 * A pack names its federation, says what it recognises in your folder, and
 * where its screens live. Q lists the packs under Federations and puts their
 * screens in the navigation. Everything a pack shows is built from the same
 * q-ui roles and blocks, so every federation's screens read the same way.
 */
import type { FolderItem } from '@inqbeta/q-core/folder';
import type { Whose } from '@inqbeta/q-core/seal';
import { isVerifiedChannel, type VerifiedChannel } from '@inqbeta/q-core/channels';
import { isAnswerSet, type AnswerSet } from '@inqbeta/q-core/questions';
import { isCard, looksLikeCard, CARD_QUESTIONS, type Card } from '@inqbeta/q-core/cards';
import { PLACE_Q, looksLikePlace, type PlaceKind } from '@inqbeta/q-core/places';
import { PAGE_SCHEMA } from '@inqbeta/q-core/pages';
import type { IconName } from '@inqbeta/q-ui';
import { dostudy } from './dostudy';
import { isSetAside, isSiteRecord } from '$lib/sites';
import { isVersion } from '@inqbeta/q-core/articles';
import { isRelease } from '@inqbeta/q-core/releases';
import { isCarrierRecord } from '$lib/releases';
import { isFederationDraft, isLegacyFederation } from '@inqbeta/q-core/federations';
import { standingAt } from '@inqbeta/q-core/membership';
import { isFederationRecord, isMembershipRecord, isMemberRecord } from '$lib/federations';

/** Something a pack recognised in the folder. */
export interface Found {
	/**
	 * Whether the receipt this came out of holds up, and whose it is.
	 *
	 * Filled in by the ledger once per file rather than by each pack, so every
	 * screen gets it for free and no reader can forget to ask. Absent only on
	 * entries built from something that is not a receipt at all.
	 */
	checked?: { whose: Whose; says: string };
	feature: string;
	/** 'course' | 'federation' | 'membership' | 'read' | 'note' … — pack-defined. */
	kind: string;
	/** Stable key, e.g. a course id, so several files about one thing merge. */
	key: string;
	title: string;
	description?: string;
	meta?: string;
	status?: { text: string; tone: 'good' | 'waiting' | 'needs-you' | 'bad' | 'plain' };
	at: string;
	item: FolderItem;
}

export interface Feature {
	id: string;
	/** The federation this belongs to, in words. */
	federation: string;
	title: string;
	description: string;
	icon: IconName;
	href: string;
	recognise(json: unknown, item: FolderItem): Found[] | null;
}

/*
 * Recognise a published page.
 *
 * REPLACES recogniseUIPages, which read two shapes of the ui-receipts.ts
 * format — block NAMES with open props and nothing that drew them. A page is
 * now the compiled thing from q-core/pages.ts: self-contained, content-
 * addressed, and with a vocabulary that refuses anything that runs.
 *
 * The old shape is still recognised, and will be for ever. A receipt already
 * written keeps its own signature and its own time, and rewriting one to a
 * newer taste is the one thing an append-only folder must not do. It is shown
 * as what it is — something made before pages could be drawn.
 */
function recognisePages(json: unknown, item: FolderItem): Found[] | null {
	const content = ((json as { content?: unknown })?.content ?? json) as {
		schema?: string;
		called?: string;
		blocks?: unknown[];
		namespace?: string;
		id?: string;
		name?: string;
		description?: string;
	};

	if (content?.schema === PAGE_SCHEMA && Array.isArray(content.blocks)) {
		/* Counted through the whole tree: a page of one group holding six things
		 * is six things, and saying "1 block" would be a strange kind of lie. */
		const deep = (list: unknown[]): number =>
			list.reduce<number>(
				(n, b) => n + 1 + deep(Array.isArray((b as { children?: unknown[] }).children) ? (b as { children: unknown[] }).children : []),
				0
			);
		const count = deep(content.blocks);
		return [
			{
				feature: 'pages',
				kind: 'page',
				/* Keyed by name, so publishing again supersedes rather than piles up. */
				key: content.called ?? 'A page',
				title: content.called ?? 'A page',
				description: `${count} ${count === 1 ? 'thing' : 'things'} on it`,
				meta: '',
				status: { text: 'Published', tone: 'good' as const },
				at: new Date(item.meta?.saved ?? item.modified).toISOString(),
				item
			}
		];
	}

	/* The old ui-receipts shape, in both the spellings it was written in. */
	const old = (json as { sealed?: { namespace?: string; id?: string; name?: string } })?.sealed;
	const legacy = content?.namespace === 'ui' && content?.id ? content : old?.namespace === 'ui' && old?.id ? old : null;
	if (legacy) {
		return [
			{
				feature: 'pages',
				kind: 'page-old',
				key: legacy.id!,
				title: legacy.name || 'A page',
				description: 'Made before pages could be drawn. Kept as it was written.',
				meta: '',
				status: { text: 'Older kind', tone: 'waiting' as const },
				at: new Date(item.meta?.saved ?? item.modified).toISOString(),
				item
			}
		];
	}
	return null;
}

/*
 * Recognise a verified channel — a way you said you could be reached, proved
 * by answering a code. The address itself is sealed inside and stays that way:
 * nothing here opens it, because a list does not need to.
 */
function recogniseChannels(json: unknown, item: FolderItem): Found[] | null {
	const content = (json as { content?: unknown })?.content ?? json;
	if (!isVerifiedChannel(content)) return null;
	const c = content as VerifiedChannel;
	const shared = c.uses.filter((u) => u !== 'sign-in');
	return [
		{
			feature: 'channels',
			kind: 'channel',
			key: c.id,
			title: c.kind === 'email' ? 'Email' : 'Phone',
			description: shared.length ? `Also for ${shared.join(', ')}` : 'Sign-in only',
			meta: c.proof ? 'Verified, with proof' : 'Verified',
			status: { text: 'Verified', tone: 'good' as const },
			at: c.verifiedAt,
			item
		}
	];
}

/*
 * Recognise a set of answers. The questions themselves are not here — the
 * receipt cites their address, and fetching them is a separate act. A list can
 * say how many things were said and when, without saying what any of them were.
 */
function recogniseAnswers(json: unknown, item: FolderItem): Found[] | null {
	const content = (json as { content?: unknown })?.content ?? json;
	if (!isAnswerSet(content)) return null;
	/* A card is answers too, and so is a place. They belong to their own packs,
	 * and saying so here means nothing depends on which pack is asked first. */
	if (looksLikeCard(content) || looksLikePlace(content)) return null;
	const a = content as AnswerSet;
	const count = Object.keys(a.answers).length;
	return [
		{
			feature: 'questions',
			kind: 'answers',
			/* Keyed by the questions, so answering again supersedes rather than piles up. */
			key: a.asked,
			title: a.setId,
			description: `${count} ${count === 1 ? 'answer' : 'answers'}`,
			meta: a.askedCid,
			status: { text: 'Answered', tone: 'good' as const },
			at: a.at,
			item
		}
	];
}

/*
 * Recognise a card. It names question ids, so a list of cards can say how much
 * each one shows without reading a single answer.
 */
function recogniseCards(json: unknown, item: FolderItem): Found[] | null {
	const content = (json as { content?: unknown })?.content ?? json;
	if (!looksLikeCard(content)) return null;

	/* Both shapes, read without resolving either: a card receipt says it
	 * directly, an answer set says it in its answers. Resolving needs a hash,
	 * and a list has no business awaiting one. */
	const c: Pick<Card, 'name' | 'shows' | 'channels' | 'at'> = isCard(content)
		? (content as Card)
		: {
				name: String((content as AnswerSet).answers[CARD_QUESTIONS.name]?.value ?? 'A card'),
				shows: asStrings((content as AnswerSet).answers[CARD_QUESTIONS.shows]?.value),
				channels: asStrings((content as AnswerSet).answers[CARD_QUESTIONS.channels]?.value),
				at: (content as AnswerSet).at
			};
	const n = c.shows.length;
	return [
		{
			feature: 'cards',
			kind: 'card',
			/* Keyed by name, so editing a card supersedes rather than piles up. */
			key: c.name,
			title: c.name,
			description: `Shows ${n} ${n === 1 ? 'thing' : 'things'}${c.channels.length ? `, ${c.channels.length} way to reach you` : ''}`,
			meta: '',
			status: { text: 'Yours', tone: 'good' as const },
			at: c.at,
			item
		}
	];
}

const asStrings = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : [];

/*
 * Recognise a place. Named, kinded, and either proved or not — which is all a
 * list needs, and all it should say. Where a place actually IS never appears
 * here, because a folder's contents are not a map to anybody's drives.
 */
function recognisePlaces(json: unknown, item: FolderItem): Found[] | null {
	const content = (json as { content?: unknown })?.content ?? json;
	if (!looksLikePlace(content)) return null;
	const a = content as AnswerSet;
	const called = String(a.answers[PLACE_Q.called]?.value ?? 'Somewhere');
	const kind = String(a.answers[PLACE_Q.kind]?.value ?? '') as PlaceKind;
	const proved = a.answers[PLACE_Q.proved]?.value === true;
	return [
		{
			feature: 'places',
			kind: 'place',
			/* Keyed by name, so proving a place again supersedes rather than piles up. */
			key: called,
			title: called,
			description: KIND_WORDS[kind] ?? 'Somewhere',
			meta: '',
			status: proved
				? { text: 'Confirmed', tone: 'good' as const }
				: { text: 'Not tried', tone: 'waiting' as const },
			at: a.at,
			item
		}
	];
}

const KIND_WORDS: Record<string, string> = {
	cache: 'Inside this browser',
	folder: 'A folder on this computer',
	synced: 'A folder that syncs',
	bucket: 'A bucket',
	drive: 'A drive you unplug'
};

/* Recognise a site you founded (ADR-Q-003). Keyed by the site's own key. */
const onDay = (iso: string) =>
	iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/*
 * Federations of Q's own (ADR-Q-007): drafts, founded federations, and the
 * one-signature records federation.ts wrote before, shown as what they are.
 */
function recogniseFederations(json: unknown, item: FolderItem): Found[] | null {
	const content = (json as { content?: unknown })?.content ?? json;
	if (isFederationDraft(content)) {
		/* Founded: it lives on as the federation, so the draft is claimed and not listed. */
		if (content.foundedAs) return [];
		return [
			{
				feature: 'federations',
				kind: 'federation-draft',
				key: `draft:${content.id}`,
				title: content.name.trim() || 'Untitled federation',
				description: content.purpose,
				meta: `Last saved ${onDay(content.updated)}`,
				status: { text: 'Draft', tone: 'waiting' as const },
				at: content.updated,
				item
			}
		];
	}
	if (isFederationRecord(content)) {
		const f = content.founding;
		return [
			{
				feature: 'federations',
				kind: 'federation',
				key: `federation:${f.federation}`,
				title: f.name,
				description: content.manifest.constitution.purpose,
				meta: `Founded ${onDay(f.at)} · you are caretaker until ${onDay(new Date(content.caretakerUntil * 1000).toISOString())}`,
				status: { text: 'Founded', tone: 'good' as const },
				at: f.at,
				item
			}
		];
	}
	if (isMembershipRecord(content)) {
		const j = content.joining;
		const complete = j.signatures.some((s) => s.by === 'federation') || !!j.offer?.admits;
		const st = standingAt(content);
		const status = st.is === 'left'
			? { text: 'Left', tone: 'plain' as const }
			: st.is === 'removed'
				? { text: 'Removed', tone: 'plain' as const }
				: st.is === 'suspended'
					? { text: `Suspended until ${onDay(st.until)}`, tone: 'waiting' as const }
					: complete
				? { text: 'Member', tone: 'good' as const }
				: { text: 'Waiting to be accepted', tone: 'waiting' as const };
		return [
			{
				feature: 'federations',
				kind: 'membership',
				key: `membership:${j.federation}`,
				title: content.founding.name,
				description: content.manifest.constitution.purpose,
				meta: content.left ? `Left ${onDay(content.left.at)}` : `Joined ${onDay(j.at)}`,
				status,
				at: content.at,
				item
			}
		];
	}
	if (isMemberRecord(content)) {
		const j = content.joining;
		const complete = j.signatures.some((s) => s.by === 'federation') || !!j.offer?.admits;
		return [
			{
				feature: 'federations',
				kind: 'member',
				key: `member:${content.federation}:${j.member}`,
				title: content.called ?? `${j.member.slice(0, 16)}…${j.member.slice(-6)}`,
				description: j.member,
				meta: content.removed ? `Removed ${onDay(content.removed.at)}: ${content.removed.says}` : `Joined ${onDay(j.at)}`,
				status: content.removed
					? { text: 'Removed', tone: 'plain' as const }
					: standingAt(content).is === 'suspended'
						? { text: `Suspended until ${onDay(content.suspended!.until)}`, tone: 'waiting' as const }
						: complete
						? { text: 'Member', tone: 'good' as const }
						: { text: 'Waiting', tone: 'waiting' as const },
				at: content.at,
				item
			}
		];
	}
	if (isLegacyFederation(content)) {
		return [
			{
				feature: 'federations',
				kind: 'federation',
				key: `federation:${content.id}`,
				title: content.name,
				description: content.description,
				meta: `Made ${onDay(new Date(content.created).toISOString())}, before founding took two signatures. Kept as it was written.`,
				status: { text: 'Old record', tone: 'plain' as const },
				at: new Date(content.created).toISOString(),
				item
			}
		];
	}
	return null;
}

function recogniseSites(json: unknown, item: FolderItem): Found[] | null {
	const content = (json as { content?: unknown })?.content ?? json;
	if (isSetAside(content)) {
		return [{ feature: 'sites', kind: 'site-set-aside', key: content.site, title: content.domain, at: (content as { at?: string }).at ?? '', item }];
	}
	/* A release of a site (ADR-Q-003 §5): newest per site is what is live. */
	if (isRelease(json)) {
		const c = json.content;
		return [{ feature: 'sites', kind: 'site-release', key: c.site, title: c.domain, description: `${Object.keys(c.files).length} files`, at: json.signedAt, item }];
	}
	/* Where a site is carried, and the (sealed) token to carry it there. */
	if (isCarrierRecord(content)) {
		return [{ feature: 'sites', kind: 'site-carrier', key: `${content.site}/${content.carrier}`, title: content.carrier, description: content.domain, at: content.at, item }];
	}
	if (!isSiteRecord(content)) return null;
	const f = content.founding;
	return [
		{
			feature: 'sites',
			kind: 'site',
			key: f.site,
			title: f.name,
			description: f.domain,
			meta: `Generation ${f.generation}`,
			status: { text: 'Yours', tone: 'good' as const },
			at: f.at,
			item
		}
	];
}

/* Recognise a saved version of an article on a site (ADR-Q-003 §4). One key per
 * article, so the newest version of each is what a list shows. */
function recogniseVersions(json: unknown, item: FolderItem): Found[] | null {
	if (!isVersion(json)) return null;
	const c = json.content;
	return [
		{
			feature: 'write',
			kind: 'article-version',
			key: `${c.site}/${c.section}/${c.slug}`,
			title: c.page.called,
			description: `${c.domain} · ${c.section}/${c.slug}`,
			meta: c.address.slice(-12),
			status: { text: 'Saved', tone: 'good' as const },
			at: json.signedAt,
			item
		}
	];
}

export const FEATURES: Feature[] = [
	{
		id: 'places',
		federation: 'Personal',
		title: 'Places',
		description: 'Where your work is kept',
		icon: 'network',
		href: '/network',
		recognise: recognisePlaces
	},
	{
		id: 'cards',
		federation: 'Personal',
		title: 'Cards',
		description: 'What you show, to whom, for what',
		icon: 'card',
		href: '/cards',
		recognise: recogniseCards
	},
	{
		id: 'questions',
		federation: 'Personal',
		title: 'Questions',
		description: 'What you have been asked, and what you said',
		icon: 'info',
		href: '/questions',
		recognise: recogniseAnswers
	},
	{
		id: 'channels',
		federation: 'Personal',
		title: 'Channels',
		description: 'How you can be reached',
		icon: 'phone',
		href: '/settings',
		recognise: recogniseChannels
	},
	{
		id: 'pages',
		federation: 'Personal',
		title: 'My pages',
		description: 'Pages you have built',
		icon: 'files',
		href: '/my-pages',
		recognise: recognisePages
	},
	{
		id: 'sites',
		federation: 'Personal',
		title: 'Sites',
		description: 'Websites you own — each one a key',
		icon: 'network',
		href: '/sites',
		recognise: recogniseSites
	},
	{
		id: 'federations',
		federation: 'Personal',
		title: 'Federations',
		description: 'Federations you are founding, have founded, or belong to',
		icon: 'federations',
		href: '/federations',
		recognise: recogniseFederations
	},
	{
		id: 'write',
		federation: 'Personal',
		title: 'Write',
		description: 'Articles on your sites, written and signed',
		icon: 'documents',
		href: '/write',
		recognise: recogniseVersions
	},
	dostudy
];
