/*
 * Places — the ways your data can be reached, held as receipts.
 *
 * Darren, 2026-09-20: "each hard drive that you've plugged in or flash drive
 * that you've plugged in has its own DID. You can describe it so it's a flash
 * drive or it was a mini PC, that's the device information. And it's either
 * available or unavailable. But you know what it is. And I called that one
 * flash drive 2026… They're the channels."
 *
 * He is right, and it is the same shape as channels.ts: a named, described,
 * verified route to somewhere, identified by a DID rather than by a path.
 *
 * WHERE IT DIFFERS FROM A CHANNEL, AND WHY THAT IS GOOD NEWS. A channel's
 * address has to be sealed to a service key, because a sending service must
 * resolve it while you are not here. Nothing ever resolves a PLACE except you.
 * So a place is a channel with no service in it — simpler, and nobody else can
 * read where your things are. That difference is worth keeping rather than
 * collapsing the two files together.
 *
 * THE DID IS THE LABEL ON THE DRIVE. This is the whole reason archiving works.
 * You write "flash drive 2026" on a drive with a marker, put it in a drawer,
 * and months later you can walk to the drawer and find it. The DID is that
 * label, in a form a receipt can name. A receipt can say what it is on without
 * saying where that is, and a person can still go and get it.
 *
 * AND THEREFORE: A DRIVE'S DID IS NEVER ANNOUNCED. Publishing it to Mainline
 * would tell a public network that this key owns a flash drive, forever, for
 * anyone who was crawling. Routing only, announcement opt-in — same rule as
 * everything else today. mustNotAnnounce() says so where it can be tested.
 *
 * CONFIRMED MEANS TRIED, NOT SUPPORTED. Darren: "created, found, findable, and
 * can be written to and read, then that becomes a live confirmed storage." The
 * important word is AND READ. A browser saying it supports folders is a
 * capability; a byte written and read back is a fact. Q has been burned by the
 * difference once already.
 *
 * Pure. The round trip happens in folder.ts; this decides what its result means.
 */

import { canonical, sha256 } from './canonical';
import { isAnswerSet, type AnswerSet } from './questions';

export type PlaceKind =
	/** Inside the browser. Not a place, and named for what it actually is. */
	| 'cache'
	/** A folder on this computer, chosen with a picker. */
	| 'folder'
	/** A folder something else copies — iCloud Drive, Dropbox, OneDrive, Google Drive. */
	| 'synced'
	/** An S3 endpoint: a rented bucket, or a federation's. */
	| 'bucket'
	/** Removable media. Has a label, lives in a drawer, is usually not plugged in. */
	| 'drive';

/**
 * The four things asked of every place, whatever kind it is.
 *
 * The same four every time, so a person learns the shape once and the archive
 * screen and the folder screen are recognisably the same screen.
 */
export const PLACE_QUESTIONS = [
	{ id: 'q:place/kind', asks: 'What kind of place is it?' },
	{ id: 'q:place/called', asks: 'What do you call it?' },
	{ id: 'q:place/proved', asks: 'Has something been written there and read back?' },
	{ id: 'q:place/seen', asks: 'When did you last see it?' }
] as const;

/**
 * The one line a kind of place always carries, said once and kept short.
 *
 * Darren on the browser: "This is a cache file and can be destroyed without
 * notice. That's all that needs to say. That's its warning." He is right that
 * it is the whole warning, and right that calling it a cache does more work
 * than calling it browser storage — everybody already knows a cache is
 * something that gets cleared.
 */
export function warningFor(kind: PlaceKind): string {
	switch (kind) {
		case 'cache':
			return 'This is a cache. It can be destroyed without notice.';
		case 'synced':
			return 'Whoever runs the sync holds a copy. It is sealed, so they cannot read it.';
		case 'bucket':
			return 'Sealed copies on somebody else’s disks. They cannot read them, and they will not delete them because you asked.';
		case 'drive':
			return 'Only real while it is plugged in. Q cannot check it from here.';
		case 'folder':
			return '';
	}
}

/** Whether a place can hold the only copy of anything. One kind cannot, ever. */
export function canHoldTheOnlyCopy(kind: PlaceKind): boolean {
	return kind !== 'cache';
}

/**
 * Whether this place's DID may be announced to a public network.
 *
 * False for everything. A place is yours to know. Kept as a function rather
 * than an assumption so that the day somebody wants an exception, they have to
 * come here and argue for it in front of a test.
 */
export function mustNotAnnounce(_kind: PlaceKind): boolean {
	return true;
}

export type Proof =
	/** Nothing has been written here yet. */
	| { tried: false }
	/** Something was written, and this is what happened. */
	| { tried: true; wrote: boolean; readBack: boolean; matched: boolean; at: number };

export type Confirmation = 'confirmed' | 'damaged' | 'refused' | 'untried' | 'cannot';

export interface Told {
	state: Confirmation;
	/** One line, in the words a person would use. Shown, not paraphrased. */
	says: string;
	fix: string;
}

/**
 * What a round trip proved.
 *
 * Four outcomes, and the one that matters most is `damaged`: written, read
 * back, and different. That is a place quietly eating things, and it is worse
 * than a place that refuses, because it looks like it is working.
 */
export function confirmation(kind: PlaceKind, proof: Proof, name = 'This place'): Told {
	if (kind === 'cache') {
		return {
			state: 'cannot',
			says: warningFor('cache'),
			fix: 'Choose a folder, so what you save is somewhere that lasts.'
		};
	}
	if (!proof.tried) {
		return {
			state: 'untried',
			says: `${name} has not been tried yet.`,
			fix: 'Q will write something small there and read it back, to be sure.'
		};
	}
	if (!proof.wrote) {
		return {
			state: 'refused',
			says: `${name} would not accept anything written to it.`,
			fix: 'Check it is plugged in, unlocked, and not full — then try again.'
		};
	}
	if (!proof.readBack) {
		return {
			state: 'refused',
			says: `${name} took what was written and then could not give it back.`,
			fix: 'Do not keep anything here until that is understood.'
		};
	}
	if (!proof.matched) {
		return {
			state: 'damaged',
			says: `${name} gave back something different from what was written. It is changing what is stored in it.`,
			fix: 'Stop using it. Check anything already kept there against its own name.'
		};
	}
	return {
		state: 'confirmed',
		says: `${name} was written to and read back. It works.`,
		fix: ''
	};
}

export type Availability =
	/** Reachable right now. */
	| 'here'
	/** Known, named, and not plugged in. Normal for a drive; a problem for a folder. */
	| 'away'
	/** Q has no way of telling. */
	| 'unknown';

export interface Situation {
	says: string;
	/** True when being away is expected rather than wrong. */
	expected: boolean;
}

/**
 * What it means that a place is or is not reachable.
 *
 * A drive in a drawer is away, and that is the drive working correctly. A
 * folder that has gone away has been moved, renamed or deleted, and that is a
 * person about to lose something. Same word, opposite news.
 */
export function situationOf(kind: PlaceKind, at: Availability, name = 'This place'): Situation {
	if (at === 'here') return { says: `${name} is reachable.`, expected: true };
	if (at === 'unknown') return { says: `Q cannot tell whether ${name} is there.`, expected: kind === 'drive' };
	if (kind === 'drive') return { says: `${name} is not plugged in. That is where it should be.`, expected: true };
	return { says: `${name} has gone. It has been moved, renamed or deleted.`, expected: false };
}

/**
 * What would have to go wrong for a place to be lost — the default, before the
 * person corrects it.
 *
 * Two free accounts at the same company are one fate. Two free accounts at
 * different companies are genuinely two, which is why "I have a free Dropbox,
 * a free Drive and a free OneDrive, may as well use all three" is sound
 * reasoning and not just thrift.
 *
 * The catch worth one sentence and no lecture: if all three are recovered
 * through the same email address, that address is the fate, not the companies.
 */
export function fateOf(kind: PlaceKind, provider?: string): string {
	switch (kind) {
		case 'cache':
		case 'folder':
			return 'this device';
		case 'drive':
			return `drive:${provider ?? 'unknown'}`;
		case 'synced':
		case 'bucket':
			return `service:${(provider ?? 'unknown').toLowerCase()}`;
	}
}

/**
 * Where a push should go.
 *
 * Darren: "whether this folder or this account gets sent to S1, S2, S3 or all
 * three of them. That's your choice." So it is a choice, held as one, and not
 * a setting Q decides on someone's behalf.
 */
export function chosenTargets(all: { id: string; kind: PlaceKind }[], chosen: string[]): string[] {
	const usable = new Set(all.filter((p) => canHoldTheOnlyCopy(p.kind)).map((p) => p.id));
	return chosen.filter((id) => usable.has(id));
}


/* ------------------------------------------------------------------ *
 * A place, written down.
 *
 * Mirrors cards.ts deliberately: a place is answers to a question set, and a
 * new KIND of place is a question set rather than new code.
 *
 * WHY THE ID IS NOT A did:key. A drive has nothing to sign. Generating a
 * keypair for it would mean protecting a private key for no benefit, and the
 * benefit it would buy — the place authenticating itself — is not a thing a
 * drawer can do. So a place's name is a CONTENT ADDRESS of what was said about
 * it, which is stable, unforgeable and free.
 *
 * That is also the honest version of "the DID is the label on the drive": a
 * label is a name, not a key. A place that genuinely IS a peer — a mini PC
 * running a node — has a key already, and names itself with that instead; the
 * field takes either, and `isKeyed()` says which this is.
 * ------------------------------------------------------------------ */

/** Lookup by role, for code. The array above is for screens. */
export const PLACE_Q = {
	kind: 'q:place/kind',
	called: 'q:place/called',
	proved: 'q:place/proved',
	seen: 'q:place/seen'
} as const;

export const PLACE_SET_ID = 'q/a-place';

export interface PlaceRecord {
	/** Whose place it is. */
	did: string;
	/** `place:<sha256>` for a named place, or a did: for one that holds a key. */
	id: string;
	called: string;
	kind: PlaceKind;
	/** What would have to go wrong for it to be lost. Defaulted from kind, then the person's to correct. */
	fate: string;
	/** Whether a round trip has ever succeeded here. */
	proved: boolean;
	/** When it was last seen, as answered. */
	seen: string | null;
	at: string;
}

/** True when this place names itself with a key rather than with a hash. */
export function isKeyed(place: { id: string }): boolean {
	return place.id.startsWith('did:');
}

export async function placeId(params: { did: string; kind: PlaceKind; called: string }): Promise<string> {
	const hash = await sha256(
		canonical({ v: 'inqbeta.place/1', did: params.did, kind: params.kind, called: params.called.trim() })
	);
	return `place:${hash}`;
}

export async function buildPlace(params: {
	did: string;
	called: string;
	kind: PlaceKind;
	fate?: string;
	proved?: boolean;
	seen?: string | null;
	at?: string;
}): Promise<PlaceRecord> {
	const called = params.called.trim();
	return {
		did: params.did,
		id: await placeId({ did: params.did, kind: params.kind, called }),
		called,
		kind: params.kind,
		fate: params.fate?.trim() || fateOf(params.kind, called),
		proved: params.proved ?? false,
		seen: params.seen ?? null,
		at: params.at ?? new Date().toISOString()
	};
}

const KINDS: PlaceKind[] = ['cache', 'folder', 'synced', 'bucket', 'drive'];

function asKind(v: unknown): PlaceKind | null {
	return typeof v === 'string' && (KINDS as string[]).includes(v) ? (v as PlaceKind) : null;
}

/** A place out of an answer set, or null when that is not what this is. */
export async function placeFromAnswers(answers: AnswerSet): Promise<PlaceRecord | null> {
	const called = answers.answers[PLACE_Q.called]?.value;
	const kind = asKind(answers.answers[PLACE_Q.kind]?.value);
	if (typeof called !== 'string' || !called.trim() || !kind) return null;

	const seen = answers.answers[PLACE_Q.seen]?.value;
	return buildPlace({
		did: answers.did,
		called,
		kind,
		proved: answers.answers[PLACE_Q.proved]?.value === true,
		seen: typeof seen === 'string' && seen ? seen : null,
		at: answers.at
	});
}

/**
 * Is this a place, without resolving anything?
 *
 * Synchronous on purpose: a list of what is in a folder has no business
 * awaiting a hash, and a place is answers like everything else, so something
 * has to tell them apart before either is read properly.
 */
export function looksLikePlace(content: unknown): boolean {
	if (!isAnswerSet(content)) return false;
	const a = content as AnswerSet;
	return a.setId === PLACE_SET_ID || PLACE_Q.kind in a.answers;
}

export async function readPlace(content: unknown): Promise<PlaceRecord | null> {
	return isAnswerSet(content) ? placeFromAnswers(content) : null;
}

/**
 * The newest answering about each place, by id.
 *
 * Earlier ones stay as evidence of what was true before — a drive that was
 * proved in March and unreachable in September is two facts, not a correction.
 */
export function newestPlaces(all: PlaceRecord[]): PlaceRecord[] {
	const by = new Map<string, PlaceRecord>();
	for (const p of all) {
		const seen = by.get(p.id);
		if (!seen || seen.at < p.at) by.set(p.id, p);
	}
	return [...by.values()].sort((a, b) => a.called.localeCompare(b.called));
}
