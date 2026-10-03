/*
 * A receipt, read the way a person reads it (3 October 2026).
 *
 * Darren: "when you click on [a receipt] … you see the whole JSON kind of file
 * which isn't very human friendly … it looks like a card that's read only, and
 * the meta is at the start — the DID, the date, creation, all of those things
 * that are relevant to the receipt identity — and then what it affects … what
 * the content says, what the impact."
 *
 * So a receipt is laid out in three parts, from the JSON itself, with nothing
 * made up:
 *
 *   who and when   its identity: what kind of record, who signed it, when,
 *                  its proof ID (the content hash), and whether it holds up
 *   what it says   the content, field by field, in words: people by name,
 *                  dates as dates, yes and no, long codes folded away
 *   what changes   the effect, where Q knows one: credits in or out, who it
 *                  involves, what it links or permits
 *
 * The JSON stays one tap away for anyone who wants it. Nothing here decides
 * whether a receipt holds up — that's receipts.ts; this only reads.
 */
import { isCreditMove, effectOn } from '@inqbeta/q-core/credits';

export interface Field {
	label: string;
	/** Plain text, or a nested group. */
	text?: string;
	/** A person: their name, and whether it's you. */
	person?: { name: string; you: boolean; did: string };
	/** Folded away: long codes, keys, signatures. */
	code?: string;
	group?: Field[];
	list?: string[];
}

export interface ReadReceipt {
	kind: string;
	signer?: { name: string; you: boolean; did: string };
	signedAt?: string;
	proof?: string;
	says: Field[];
	changes: string[];
}

/** What sort of record, from its schema. */
const KINDS: Record<string, string> = {
	'inqbeta.credit/1': 'Credit move',
	'inqbeta.message/1': 'Message',
	'inqbeta.received/1': 'Something received',
	'inqbeta.card/1': 'Card',
	'inqbeta.member-card/1': 'Membership card',
	'inqbeta.membership/1': 'Membership',
	'inqbeta.federation/1': 'Federation founding',
	'inqbeta.call/1': 'Call',
	'inqbeta.answers/1': 'Your details',
	'inqbeta.announcement/1': 'Announcement'
};
export function kindOf(schema: unknown): string {
	if (typeof schema !== 'string') return 'Record';
	if (KINDS[schema]) return KINDS[schema];
	const m = /^inqbeta\.([a-z-]+)\/(\d+)$/.exec(schema);
	if (!m) return 'Record';
	const words = m[1].replace(/-/g, ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Field names, in words. Anything not here is split from its camelCase or dashes. */
const LABELS: Record<string, string> = {
	to: 'To',
	from: 'From',
	with: 'With',
	at: 'When',
	createdAt: 'Made',
	collectedAt: 'Collected',
	signedAt: 'Signed',
	until: 'Until',
	since: 'Since',
	text: 'Says',
	title: 'Title',
	says: 'Says',
	kind: 'Kind',
	credits: 'Credits',
	mode: 'Test or real',
	pounds: 'Pounds',
	business: 'Business',
	pack: 'Pack',
	previous: 'Follows',
	inbox: 'Where to reply',
	replyTo: 'Where to reply',
	federation: 'Federation',
	founder: 'Founder',
	name: 'Name',
	label: 'Label',
	origin: 'Website',
	event: 'What happened',
	schema: 'Type of record',
	seconds: 'Seconds',
	media: 'Kind of call',
	card: 'Card',
	details: 'Details',
	decision: 'The rules said'
};
/** The kind of move or record, in words. */
const KIND_WORDS: Record<string, string> = {
	buy: 'Bought a pack',
	spend: 'Spent',
	reward: 'Earned',
	trade: 'Traded',
	message: 'A message',
	voicemail: 'A voice message',
	personal: 'Personal card',
	business: 'Business card'
};
/** Profile keys (q:person/called) in words. */
const PERSON: Record<string, string> = {
	called: 'Known as',
	first: 'First name',
	last: 'Last name',
	picture: 'Photo',
	cover: 'Cover image',
	email: 'Email',
	phone: 'Phone'
};
export function labelOf(key: string): string {
	if (LABELS[key]) return LABELS[key];
	const q = /^q:(?:person|biz\/[^/]+)\/(.+)$/.exec(key);
	if (q) return PERSON[q[1]] ?? words(q[1]);
	return words(key);
}
function words(key: string): string {
	const w = key.replace(/^q:/, '').replace(/[/_.-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
	return w ? w.charAt(0).toUpperCase() + w.slice(1) : key;
}

/* What the top of a receipt is made of: identity, not content. */
const META = new Set(['schema', 'source', 'did', 'publicKey', 'signedAt', 'contentHash', 'signature', 'signatures', 'content', 'system']);
const SECRET = /^(signature|signatures|publicKey|key|sealed|ciphertext|nonce|iv|wrapped|proof|hash|contentHash|cid)$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DID = /^did:[a-z0-9]+:/;

export const when = (iso: string) =>
	new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export interface Names {
	me: string;
	/** A DID's name, if Q knows it. */
	nameOf: (did: string) => string | undefined;
}
function person(did: string, names: Names) {
	const you = did === names.me;
	return { did, you, name: you ? 'You' : (names.nameOf(did) ?? 'Someone') };
}

function fieldOf(key: string, value: unknown, names: Names, depth: number): Field | null {
	const label = labelOf(key);
	if (value === null || value === undefined || value === '') return null;
	if (typeof value === 'boolean') return { label, text: value ? 'Yes' : 'No' };
	if (typeof value === 'number') return { label, text: value.toLocaleString('en-GB') };
	if (typeof value === 'string') {
		if (DID.test(value)) return { label, person: person(value, names) };
		if (ISO.test(value) && !Number.isNaN(Date.parse(value))) return { label, text: when(value) };
		if (key === 'kind' && KIND_WORDS[value]) return { label, text: KIND_WORDS[value] };
		if (key === 'mode') return { label, text: value === 'test' ? 'Test — no money involved' : 'Real' };
		if (key === 'schema') return { label, text: kindOf(value) };
		if (value.startsWith('data:image/')) return { label, text: 'A picture' };
		if (SECRET.test(key) || (value.length > 80 && !/\s/.test(value))) return { label, code: value };
		return { label, text: value };
	}
	if (Array.isArray(value)) {
		if (!value.length) return null;
		if (value.every((v) => typeof v !== 'object' || v === null)) {
			return { label, list: value.map((v) => (typeof v === 'string' && DID.test(v) ? person(v, names).name : String(v))) };
		}
		if (depth >= 3) return { label, text: `${value.length} items` };
		const group = value
			.map((v, i) => fieldOf(`${i + 1}`, v, names, depth + 1))
			.filter((f): f is Field => !!f)
			.map((f, i) => ({ ...f, label: `${labelOf(key)} ${i + 1}` }));
		return { label, group };
	}
	if (typeof value === 'object') {
		if (depth >= 3) return { label, text: 'More detail in the record' };
		const group = Object.entries(value as Record<string, unknown>)
			.map(([k, v]) => fieldOf(k, v, names, depth + 1))
			.filter((f): f is Field => !!f);
		return group.length ? { label, group } : null;
	}
	return null;
}

/** Every DID a receipt mentions, once each. */
function peopleIn(v: unknown, out = new Set<string>()): Set<string> {
	if (typeof v === 'string' && DID.test(v)) out.add(v);
	else if (Array.isArray(v)) v.forEach((x) => peopleIn(x, out));
	else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => !SECRET.test(k) && peopleIn(x, out));
	return out;
}

export function readReceipt(json: unknown, names: Names, fallback?: { what: string; at: string; signers: string[] }): ReadReceipt {
	const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
	const content = (j.content && typeof j.content === 'object' ? j.content : Object.fromEntries(Object.entries(j).filter(([k]) => !META.has(k)))) as Record<string, unknown>;
	const schema = (content.schema as string | undefined) ?? (j.schema as string | undefined);
	const signerDid = (typeof j.did === 'string' ? j.did : undefined) ?? fallback?.signers[0];

	const says = Object.entries(content)
		.filter(([k]) => k !== 'schema')
		.map(([k, v]) => fieldOf(k, v, names, 0))
		.filter((f): f is Field => !!f);

	/* What changes: what Q knows how to say, and nothing more. */
	const changes: string[] = [];
	if (isCreditMove(json)) {
		const n = effectOn(json.content, names.me);
		const test = json.content.mode === 'test' ? ' test' : '';
		if (n) changes.push(`Your${test} credits: ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
	}
	const who = [...new Set([signerDid, ...peopleIn(content)].filter((d): d is string => !!d))].map((d) => person(d, names).name);
	const inLine = (n: string, i: number) => (i > 0 && n === 'You' ? 'you' : n);
	if (who.length > 1) changes.push(`Between ${who.slice(0, -1).map(inLine).join(', ')} and ${inLine(who.at(-1)!, 1)}`);
	else if (who.length === 1) changes.push(`Made by ${who[0] === 'You' ? 'you' : who[0]}`);

	return {
		kind: schema ? kindOf(schema) : (fallback?.what ?? 'Record'),
		signer: signerDid ? person(signerDid, names) : undefined,
		signedAt: (typeof j.signedAt === 'string' ? j.signedAt : undefined) ?? fallback?.at,
		proof: typeof j.contentHash === 'string' ? j.contentHash : undefined,
		says,
		changes
	};
}
