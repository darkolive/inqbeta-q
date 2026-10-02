/*
 * A federation is a key founded by a person. ADR-Q-007.
 *
 * Replaces federation.ts, whose record kept a permanent founder role, a
 * trust score and one signature — everything ADR-Q-007 rules out. Records
 * already written that way are still recognised (isLegacyFederation) and shown
 * as what they are.
 *
 *   A DRAFT IS NOT A RECEIPT. It is working state in your vault: unsigned by
 *   the federation, editable, saved as often as you like, listed as Draft.
 *   Nothing about it is final until it is founded.
 *
 *   FOUNDING TAKES TWO SIGNATURES, like a site (ADR-Q-003): the founder's and
 *   the new federation key's, over the same words, naming the manifest by its
 *   hash. Neither alone founds anything. The federation key is random — not
 *   derived from the founder — so it can be handed on.
 *
 *   THE MANIFEST carries the fixed principles (Layer A, which no vote can
 *   change) and the federation's own constitution (Layer B) as drafted.
 *
 *   THE FOUNDER IS MEMBER ONE, by the same receipt any member signs:
 *   `federation.joined`, signed by the member and countersigned by the
 *   federation, naming the manifest and the agreement they signed up to.
 *
 *   THE CARETAKER HAS A TERM. The federation key delegates `/fed` to the
 *   founder as a UCAN that expires. It lapses unless the members renew it.
 *
 * Pure: no storage, no window. The app decides where things are kept.
 */
import { canonical, b64url, unb64url, sha256 } from './canonical';
import { publicKeyFrom, toDid } from './did';
import { identityFromSeed, signerFor, type Identity } from './passkey';
import { sealTo, type Signer, type SealedToPeople } from './seal';
import { delegate, type Delegation } from './ucan/token';

export const FEDERATION_DRAFT_SCHEMA = 'inqbeta.federation-draft/1';
export const FEDERATION_MANIFEST_SCHEMA = 'inqbeta.federation-manifest/1';
export const FEDERATION_FOUNDED_SCHEMA = 'inqbeta.federation-founded/1';
export const FEDERATION_JOINED_SCHEMA = 'inqbeta.federation-joined/1';
export const FEDERATION_KEY_SCHEMA = 'inqbeta.federation-key/1';

/** Layer A (ADR-Q-007 §2): every federation carries these, and no vote can change them. */
export const PRINCIPLES = [
	{ id: 'leave', says: 'Anyone may leave, at any time, alone, keeping their receipts.' },
	{ id: 'person-first', says: 'The person sits above the federation: it never owns a member’s identity, keys, receipts or consent.' },
	{ id: 'nothing-permanent', says: 'Nothing institutional is permanent: every office has a term.' },
	{ id: 'removal-ends-belonging', says: 'Removal ends belonging only; past receipts stay valid.' },
	{ id: 'one-person-one-vote', says: 'Wherever there are votes, one person has one vote.' },
	{ id: 'rules-for-rules', says: 'The rules for changing the rules can never be voted below these principles.' }
] as const;

export type Strand = 'circle' | 'association' | 'legal' | 'event';
export const STRANDS: { id: Strand; called: string; means: string }[] = [
	{ id: 'circle', called: 'Circle or club', means: 'A place where everyone agrees to get on. No money, no offices — just the agreement and the members.' },
	{ id: 'association', called: 'Association', means: 'Members agree plans together, and some people act for the group.' },
	{ id: 'legal', called: 'CIC, co-op or charity', means: 'A legal body. The law sets a floor the federation keeps to.' },
	{ id: 'event', called: 'Event', means: 'Something with an end date — a festival, a weekend, a workshop.' }
];

export type JoinPolicy = 'open' | 'request' | 'invite';
export const JOIN_POLICIES: { id: JoinPolicy; called: string; means: string }[] = [
	{ id: 'open', called: 'Open', means: 'Anyone who signs the agreement is a member.' },
	{ id: 'request', called: 'Ask to join', means: 'The caretaker says yes to each person.' },
	{ id: 'invite', called: 'By invitation', means: 'Only people invited can join.' }
];

/** The "we agree to be nice", in words a club can keep or change. */
export const SUGGESTED_AGREEMENT =
	'We agree to be kind to each other, to say plainly when we disagree, and to look after what we share.';

export const CARETAKER_MONTHS = { least: 1, most: 24, usual: 12 } as const;

/*
 * CONSENT BLOCKS (Darren, 2026-09-28): "a consent form that is done in
 * neurodivergent steps rather than overwhelm … those consent blocks are the
 * rules you are agreeing to in becoming a member … each federation can build
 * its own blocks into the consent form needed to fully know what you're
 * signing up for."
 *
 * A federation adds its own blocks; every federation also has two it cannot
 * leave out — its agreement and the fixed principles. A joiner sees one block
 * at a time and agrees to each; the joining names every block it agreed to,
 * by hash, so what someone signed up to can always be shown exactly.
 */
export interface ConsentBlock {
	/** Lower-case words joined by hyphens: `photos`, `subs`. */
	id: string;
	title: string;
	/** Plain words: what it means for the member. */
	says: string;
}

/** Blocks a founder can start from and change. */
export const CONSENT_SUGGESTIONS: ConsentBlock[] = [
	{ id: 'photos', title: 'Photos at our events', says: 'We take photos at events and may share them with members. Tell a caretaker on the day if you would rather not be in them.' },
	{ id: 'subs', title: 'Subs', says: 'Membership costs a small yearly sub, agreed by members. You can leave at any time; subs already paid are not refunded.' },
	{ id: 'children', title: 'Looking after children', says: 'Children come to some of our events. We follow a safeguarding policy, and a named lead looks after it.' },
	{ id: 'keeping-in-touch', title: 'Keeping in touch', says: 'We send members news and plans. You choose how you hear from us, and can change it.' },
	{ id: 'what-we-keep', title: 'What we keep about you', says: 'We keep only that you are a member, how you chose to be known, and what you sign. You can see all of it, and it stays yours.' }
];

const CONSENT_ID = /^[a-z0-9][a-z0-9-]*$/;
const FIXED_CONSENT = ['agreement', 'principles'];

export interface FederationDraft {
	schema: typeof FEDERATION_DRAFT_SCHEMA;
	/** The draft's own id — not the federation's, which only exists once founded. */
	id: string;
	name: string;
	/** One sentence: what it is for. */
	purpose: string;
	/** The shared agreement every member signs when joining. */
	agreement: string;
	strand: Strand;
	joinPolicy: JoinPolicy;
	/** How long the founder's caretaker mandate lasts before members must renew it. */
	caretakerMonths: number;
	/** Events only: the last day, YYYY-MM-DD. */
	endsOn?: string;
	/**
	 * Whether it sends its members news (2 October 2026). Only a federation
	 * that says yes appears on a member's notifications card, with a switch;
	 * one that never notifies doesn't add to the list.
	 */
	notifies?: boolean;
	/** The federation's own consent blocks, in the order a joiner sees them. */
	consent?: ConsentBlock[];
	started: string;
	updated: string;
	/** Set once founded: the federation's DID. A founded draft is no longer listed. */
	foundedAs?: string;
}

export function isFederationDraft(x: unknown): x is FederationDraft {
	const d = x as FederationDraft;
	return !!d && d.schema === FEDERATION_DRAFT_SCHEMA && typeof d.id === 'string';
}

export function newDraft(now = new Date()): FederationDraft {
	const at = now.toISOString();
	return {
		schema: FEDERATION_DRAFT_SCHEMA,
		id: `draft_${b64url(crypto.getRandomValues(new Uint8Array(9)))}`,
		name: '',
		purpose: '',
		agreement: SUGGESTED_AGREEMENT,
		strand: 'circle',
		joinPolicy: 'open',
		caretakerMonths: CARETAKER_MONTHS.usual,
		consent: [],
		started: at,
		updated: at
	};
}

/** What still stands between a draft and founding, in sentences. Empty when ready. */
export function stillNeeded(d: FederationDraft, now = new Date()): string[] {
	const out: string[] = [];
	if (!d.name.trim()) out.push('It needs a name.');
	if (!d.purpose.trim()) out.push('Say in a sentence what it is for.');
	if (!d.agreement.trim()) out.push('Write the agreement members will sign when they join.');
	if (!STRANDS.some((s) => s.id === d.strand)) out.push('Choose what kind of federation it is.');
	if (!JOIN_POLICIES.some((p) => p.id === d.joinPolicy)) out.push('Choose how people join.');
	if (!Number.isInteger(d.caretakerMonths) || d.caretakerMonths < CARETAKER_MONTHS.least || d.caretakerMonths > CARETAKER_MONTHS.most)
		out.push(`The caretaker’s term is between ${CARETAKER_MONTHS.least} and ${CARETAKER_MONTHS.most} months.`);
	if (d.strand === 'event') {
		if (!d.endsOn || !/^\d{4}-\d{2}-\d{2}$/.test(d.endsOn)) out.push('An event needs its last day.');
		else if (d.endsOn < now.toISOString().slice(0, 10)) out.push('The event’s last day has already passed.');
	}
	const ids = new Set<string>();
	for (const [i, b] of (d.consent ?? []).entries()) {
		const n = i + 1;
		if (!b.title?.trim()) out.push(`Consent block ${n} needs a title.`);
		if (!b.says?.trim()) out.push(`Consent block ${n} needs its words.`);
		if (!CONSENT_ID.test(b.id ?? '') || FIXED_CONSENT.includes(b.id) || ids.has(b.id)) out.push(`Consent block ${n} needs its own short name.`);
		ids.add(b.id);
	}
	if (d.foundedAs) out.push('This draft has already been founded.');
	return out;
}

export interface FederationManifest {
	schema: typeof FEDERATION_MANIFEST_SCHEMA;
	/** Layer A, by id. */
	principles: string[];
	/** Layer L. Empty until a legal-form block exists. */
	legalForm: null;
	/** Layer B, as drafted. */
	constitution: {
		purpose: string;
		agreement: string;
		strand: Strand;
		joinPolicy: JoinPolicy;
		caretakerMonths: number;
		endsOn?: string;
		/** It sends members news, so it appears on their notifications card. Absent means no. */
		notifies?: boolean;
		/** The federation's own consent blocks. Absent in manifests from before 28 September. */
		consent?: ConsentBlock[];
	};
}

export function manifestOf(d: FederationDraft): FederationManifest {
	return {
		schema: FEDERATION_MANIFEST_SCHEMA,
		principles: PRINCIPLES.map((p) => p.id),
		legalForm: null,
		constitution: {
			purpose: d.purpose.trim(),
			agreement: d.agreement.trim(),
			strand: d.strand,
			joinPolicy: d.joinPolicy,
			caretakerMonths: d.caretakerMonths,
			...(d.strand === 'event' && d.endsOn ? { endsOn: d.endsOn } : {}),
			...(d.notifies ? { notifies: true } : {}),
			consent: (d.consent ?? []).map((b) => ({ id: b.id, title: b.title.trim(), says: b.says.trim() }))
		}
	};
}

export async function hashManifest(m: FederationManifest): Promise<string> {
	return `manifest:sha256:${await sha256(canonical(m))}`;
}

export async function hashAgreement(text: string): Promise<string> {
	return `agreement:sha256:${await sha256(text.trim())}`;
}

/**
 * Every step a joiner agrees to, in order: the agreement, the federation's own
 * blocks, then what can never change. One screen each.
 */
export function consentSteps(m: FederationManifest): ConsentBlock[] {
	return [
		{ id: 'agreement', title: 'The agreement', says: m.constitution.agreement },
		...(m.constitution.consent ?? []),
		{ id: 'principles', title: 'What can never change', says: PRINCIPLES.filter((p) => m.principles.includes(p.id)).map((p) => p.says).join(' ') }
	];
}

export async function hashConsent(b: ConsentBlock): Promise<string> {
	return `consent:sha256:${await sha256(canonical({ id: b.id, title: b.title, says: b.says }))}`;
}

/** Each step with its hash — what a joining names to show exactly what was agreed. */
export async function consentHashes(m: FederationManifest): Promise<{ id: string; hash: string }[]> {
	return Promise.all(consentSteps(m).map(async (b) => ({ id: b.id, hash: await hashConsent(b) })));
}

/** How a member chose to be known to the federation. Part of their consent. */
export type KnownAs = 'anonymous' | 'name' | 'name-and-picture';
export const KNOWN_AS: { id: KnownAs; called: string; means: string }[] = [
	{ id: 'anonymous', called: 'Anonymous', means: 'The federation knows only that a member joined — not who.' },
	{ id: 'name', called: 'Your name', means: 'Your name, and nothing else.' },
	{ id: 'name-and-picture', called: 'Your name and picture', means: 'Your name and a small profile picture.' }
];

type Signed<T> = T & { signatures: { by: string; did: string; signature: string }[] };

export interface FoundingStatement {
	schema: typeof FEDERATION_FOUNDED_SCHEMA;
	event: 'federation.founded';
	/** The federation's own key: its identity. */
	federation: string;
	/** Who founded it — the first signer. */
	root: string;
	name: string;
	strand: Strand;
	/** The manifest it was founded under, by hash. */
	manifest: string;
	/** 1 for the first key; each rotation or handover adds one. */
	generation: number;
	at: string;
}
export type FederationFounding = Signed<FoundingStatement>;

export interface JoinedStatement {
	schema: typeof FEDERATION_JOINED_SCHEMA;
	event: 'federation.joined';
	federation: string;
	member: string;
	/** The rules as they stood when they joined. */
	manifest: string;
	/** The agreement they signed up to, by hash. */
	agreement: string;
	/** Every consent step they agreed to, by hash. Absent on joinings from before 28 September. */
	consented?: { id: string; hash: string }[];
	/** How they chose to be known. */
	knownAs?: KnownAs;
	/** Their card, by hash — sealed to the federation, carried beside the joining. */
	card?: string;
	at: string;
}
export type Joined = Signed<JoinedStatement>;

export interface FederationFounded {
	founding: FederationFounding;
	manifest: FederationManifest;
	/** The founder, member one. */
	joined: Joined;
	/** The federation → founder caretaker mandate, with an expiry. */
	grant: Delegation;
	/** When the caretaker mandate ends, unix seconds. */
	caretakerUntil: number;
	/** The federation key, open, for this session only. Never stored as it is. */
	key: Identity;
	/** The seed, sealed to the founder. What the vault keeps. */
	sealedKey: SealedToPeople;
}

/** Commands a federation's key can delegate. `/fed` covers all of them. */
export const FEDERATION_COMMANDS = {
	all: '/fed',
	admit: '/fed/admit',
	remove: '/fed/remove',
	close: '/fed/close'
} as const;

const MONTH_SECONDS = Math.round(30.4375 * 24 * 60 * 60);

function unsigned<T>(x: Signed<T>): T {
	const { signatures: _s, ...rest } = x;
	return rest as T;
}

async function verify(did: string, doc: unknown, signature: string): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(signature), new TextEncoder().encode(canonical(doc)));
	} catch {
		return false;
	}
}

/**
 * Found a federation from a ready draft. `root` is the founder's signer (the
 * passkey, touched). Returns everything to keep; the open key is for this
 * session only.
 */
export async function foundFederation(
	root: Signer,
	draft: FederationDraft,
	o: { seed?: Uint8Array; now?: Date } = {}
): Promise<FederationFounded> {
	const now = o.now ?? new Date();
	const missing = stillNeeded(draft, now);
	if (missing.length) throw new Error(missing.join(' '));

	const raw = o.seed ?? crypto.getRandomValues(new Uint8Array(32));
	if (raw.length !== 32) throw new Error('A federation key is 32 bytes.');
	const key = await identityFromSeed(raw);
	const fed = signerFor(key);
	const founder = toDid(root.did);
	const at = now.toISOString();

	const manifest = manifestOf(draft);
	const manifestHash = await hashManifest(manifest);

	const statement: FoundingStatement = {
		schema: FEDERATION_FOUNDED_SCHEMA,
		event: 'federation.founded',
		federation: key.did,
		root: founder,
		name: draft.name.trim(),
		strand: draft.strand,
		manifest: manifestHash,
		generation: 1,
		at
	};
	const founding: FederationFounding = {
		...statement,
		signatures: [
			{ by: 'federation', did: key.did, signature: await fed.signCanonical(statement) },
			{ by: 'root', did: founder, signature: await root.signCanonical(statement) }
		]
	};

	const joinedStatement: JoinedStatement = {
		schema: FEDERATION_JOINED_SCHEMA,
		event: 'federation.joined',
		federation: key.did,
		member: founder,
		manifest: manifestHash,
		agreement: await hashAgreement(manifest.constitution.agreement),
		consented: await consentHashes(manifest),
		at
	};
	const joined: Joined = {
		...joinedStatement,
		signatures: [
			{ by: 'member', did: founder, signature: await root.signCanonical(joinedStatement) },
			{ by: 'federation', did: key.did, signature: await fed.signCanonical(joinedStatement) }
		]
	};

	const caretakerUntil = Math.floor(now.getTime() / 1000) + draft.caretakerMonths * MONTH_SECONDS;
	const grant = await delegate(fed, {
		to: founder,
		subject: key.did,
		cmd: FEDERATION_COMMANDS.all,
		exp: caretakerUntil,
		meta: { 'inqbeta/federation': statement.name, 'inqbeta/office': 'caretaker' }
	});

	const { sealed: sealedKey } = await sealTo(
		{ schema: FEDERATION_KEY_SCHEMA, federation: key.did, name: statement.name, generation: 1, seed: b64url(raw) },
		[founder],
		`The key to ${statement.name}`
	);
	if (!o.seed) raw.fill(0);
	return { founding, manifest, joined, grant, caretakerUntil, key, sealedKey };
}

export type Check = { ok: true; says: string } | { ok: false; says: string };

/** Each signature on a founding, checked on its own. */
export async function foundingSignatures(f: FederationFounding): Promise<{ federation: boolean; root: boolean }> {
	if (!f || f.schema !== FEDERATION_FOUNDED_SCHEMA || !Array.isArray(f.signatures)) return { federation: false, root: false };
	const st = unsigned(f);
	const byFed = f.signatures.find((s) => s.by === 'federation');
	const byRoot = f.signatures.find((s) => s.by === 'root');
	return {
		federation: !!byFed && byFed.did === st.federation && (await verify(st.federation, st, byFed.signature)),
		root: !!byRoot && byRoot.did === st.root && (await verify(st.root, st, byRoot.signature))
	};
}

/** Check a founding, offline: both signatures, and the manifest if given. */
export async function checkFederationFounding(f: unknown, manifest?: FederationManifest): Promise<Check> {
	const x = f as FederationFounding;
	if (!x || x.schema !== FEDERATION_FOUNDED_SCHEMA || !Array.isArray(x.signatures)) return { ok: false, says: 'This is not a federation founding.' };
	const st = unsigned(x);
	const signed = await foundingSignatures(x);
	if (!signed.federation) return { ok: false, says: 'The federation key did not sign this, so it was not founded.' };
	if (!signed.root) return { ok: false, says: 'The founder did not sign this, so nobody founded it.' };
	if (manifest && (await hashManifest(manifest)) !== st.manifest) return { ok: false, says: 'The manifest is not the one it was founded under.' };
	return { ok: true, says: `${st.name} was founded by ${st.root.slice(0, 20)}… on ${st.at.slice(0, 10)}.` };
}

/** Check a joining, offline: the member signed, and the federation countersigned. */
export async function checkJoined(j: unknown): Promise<Check> {
	const x = j as Joined;
	if (!x || x.schema !== FEDERATION_JOINED_SCHEMA || !Array.isArray(x.signatures)) return { ok: false, says: 'This is not a joining.' };
	const st = unsigned(x);
	const byMember = x.signatures.find((s) => s.by === 'member');
	const byFed = x.signatures.find((s) => s.by === 'federation');
	if (!byMember || byMember.did !== st.member || !(await verify(st.member, st, byMember.signature)))
		return { ok: false, says: 'The member did not sign this, so nobody joined.' };
	if (!byFed || byFed.did !== st.federation || !(await verify(st.federation, st, byFed.signature)))
		return { ok: false, says: 'The federation did not countersign this.' };
	return { ok: true, says: `${st.member.slice(0, 20)}… joined on ${st.at.slice(0, 10)}.` };
}

/**
 * The record federation.ts wrote before ADR-Q-007: one signature, a
 * permanent founder role. Still read, never written.
 */
export function isLegacyFederation(x: unknown): x is { id: string; name: string; description?: string; founder: string; created: number } {
	const r = x as { id?: unknown; founder?: unknown; members?: unknown };
	return !!r && typeof r.id === 'string' && r.id.startsWith('fed_') && typeof r.founder === 'string' && Array.isArray(r.members);
}
