/*
 * What may be published to BitTorrent's Mainline DHT, and what never may.
 *
 * A DID is an Ed25519 public key. BEP 44 lets an Ed25519 key store a signed
 * value in Mainline at SHA-1(pubkey), and did:dht (a DIF specification) uses
 * exactly that to make a DID resolvable without a registry, a registrar, or
 * us. Our key already fits: nothing to convert, only a publish and a resolve.
 *
 * WHY THIS FILE IS A GUARD RATHER THAN A CLIENT. Mainline is public, and a
 * public DHT can be crawled cheaply and archived forever. Vanish learned this
 * the hard way in 2009: it relied on DHT churn to destroy old keys, and about
 * 600 hopping nodes were enough to harvest a quarter of everything before it
 * expired. The DHT did forget. The attacker did not.
 *
 *   EXPIRY IS NOT DELETION.
 *
 * So the rule is not "keep it small". The rule is:
 *
 *   MAINLINE CARRIES ROUTING. MAINLINE NEVER CARRIES CONTENT.
 *
 * Publishing says "this key exists, and here is how to reach whoever holds
 * it." It does not say who they are, what they answered, who they know, or
 * what they have. Anything of that kind put here is put here permanently, in
 * public, for anyone who happened to be crawling — including people who were
 * not crawling yet and bought the archive later.
 *
 * Someone will eventually want to put a card in the DID document so it is
 * discoverable. This file is the thing that says no, in a sentence, with a
 * test behind it — because the last three times a rule like this lived only
 * in a document, the next screen to touch it broke it.
 *
 * Pure. No network, no DHT, no signing. Those go elsewhere; this decides.
 */

/** BEP 44: storing nodes MAY reject a bencoded value longer than this. */
export const MAINLINE_VALUE_LIMIT = 1000;

/** BEP 44: a salt lets one key hold several independent items. Max 64 bytes. */
export const MAINLINE_SALT_LIMIT = 64;

/** BEP 44: items MAY be dropped this long after the last announcement. */
export const MAINLINE_EXPIRY_MS = 2 * 60 * 60 * 1000;

/** BEP 44: items SHOULD be re-announced this often to stay alive. */
export const MAINLINE_REPUBLISH_MS = 60 * 60 * 1000;

/**
 * The only things that may go into a published record.
 *
 * Every one of these answers "how do I reach the holder of this key". None of
 * them answers "who is the holder of this key".
 */
export type Routing =
	/** A public key the holder signs or seals with. The key, never a name for it. */
	| { kind: 'key'; id: string; publicKey: string }
	/**
	 * Somewhere the holder can be reached. `at` is a protocol address — an iroh
	 * node, a relay, an https endpoint. Never an email address, a phone number,
	 * or anything a person would recognise as belonging to someone.
	 */
	| { kind: 'service'; id: string; type: string; at: string }
	/** Another DID that is the same holder. Used for rotation, which is public and permanent. */
	| { kind: 'also-known-as'; as: string };

export interface Publication {
	/** did:dht:… or did:key:… — the key this record belongs to. */
	did: string;
	entries: Routing[];
	/** BEP 44 salt, when this is one of several records under the same key. */
	salt?: string;
}

export interface PublishVerdict {
	/** True only when every entry is routing and the whole thing plausibly fits. */
	ok: boolean;
	/** One line, in the words a person would use. Shown, not paraphrased. */
	says: string;
	/** What to do about it. Empty when there is nothing to do. */
	fix: string;
	/** Which entries were refused, by id, so a caller can name them. */
	refused: string[];
	/** Rough encoded size. See roughSize — this is a budget, not a measurement. */
	roughBytes: number;
}

/**
 * Anything whose id starts with one of these is about a person, not about
 * reaching them. Kept as prefixes because question ids grow and this list
 * should not have to grow with them.
 */
const NEVER_PUBLISH = ['q:', 'card:', 'channel:', 'answer:', 'contact:', 'set:'];

/** True when this id names something about a person rather than a route to them. */
export function isAboutAPerson(id: string): boolean {
	const lower = id.trim().toLowerCase();
	return NEVER_PUBLISH.some((p) => lower.startsWith(p));
}

/**
 * An address a person would recognise as belonging to someone. An email or a
 * phone number in a service endpoint is a channel wearing a routing coat, and
 * publishing it to Mainline publishes it permanently.
 */
export function looksPersonal(at: string): boolean {
	const v = at.trim();
	if (/^mailto:/i.test(v)) return true;
	if (/^(tel|sms):/i.test(v)) return true;
	/* A bare address with an @ and a dot after it. */
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
	/* A bare international phone number. */
	if (/^\+?[0-9][0-9\s().-]{7,}$/.test(v)) return true;
	return false;
}

/**
 * Roughly how many bytes a publication will take once it is DNS-packed,
 * compressed and bencoded.
 *
 * This is deliberately a BUDGET, not a measurement: the real size depends on
 * the DNS encoder, name compression, and bencoding, none of which live here.
 * It overestimates on purpose, so a record that passes this comfortably will
 * pass the real encoder. Check the real length before you put.
 */
export function roughSize(p: Publication): number {
	/* Record overhead per entry, measured against did:dht's TXT record shape
	 * and rounded up. */
	const perEntry = 12;
	let n = 40 /* root record and envelope */ + (p.salt?.length ?? 0);
	for (const e of p.entries) {
		n += perEntry;
		if (e.kind === 'key') n += e.id.length + e.publicKey.length;
		else if (e.kind === 'service') n += e.id.length + e.type.length + e.at.length;
		else n += e.as.length;
	}
	return n;
}

/**
 * Whether this may be published to Mainline.
 *
 * Refuses on content before it refuses on size, because a record that is too
 * big is a thing to trim and a record carrying a person is a thing to stop.
 */
export function checkPublication(p: Publication): PublishVerdict {
	const roughBytes = roughSize(p);
	const refused: string[] = [];

	for (const e of p.entries) {
		const id = e.kind === 'also-known-as' ? e.as : e.id;
		if (isAboutAPerson(id)) {
			refused.push(id);
			continue;
		}
		if (e.kind === 'service' && looksPersonal(e.at)) refused.push(id);
	}

	if (refused.length) {
		return {
			ok: false,
			says:
				'This would publish something about you to a public network that cannot be ' +
				'made to forget it. Only a key and a way to reach you can go there.',
			fix: 'Keep it in your vault and share it on a card instead.',
			refused,
			roughBytes,
		};
	}

	if (p.salt && p.salt.length > MAINLINE_SALT_LIMIT) {
		return {
			ok: false,
			says: `The label on this record is longer than ${MAINLINE_SALT_LIMIT} characters, which the network will not take.`,
			fix: 'Shorten it.',
			refused: [],
			roughBytes,
		};
	}

	if (roughBytes > MAINLINE_VALUE_LIMIT) {
		return {
			ok: false,
			says: `This record is about ${roughBytes} bytes and the network takes ${MAINLINE_VALUE_LIMIT}.`,
			fix: 'Remove a service or a key. Everything here has to fit in one small record.',
			refused: [],
			roughBytes,
		};
	}

	if (!p.entries.length) {
		return {
			ok: false,
			says: 'There is nothing to publish — no key and no way to reach you.',
			fix: 'Add at least one.',
			refused: [],
			roughBytes,
		};
	}

	return {
		ok: true,
		says: 'This publishes your key and how to reach you, and nothing about you.',
		fix: '',
		refused: [],
		roughBytes,
	};
}

export interface Announcement {
	/** When this was last announced, ms since epoch. Null when never. */
	lastAt: number | null;
}

export interface AddressStanding {
	/** 'live' while the network should still hold it, 'due' past the republish mark, 'gone' past expiry. */
	state: 'live' | 'due' | 'gone';
	says: string;
	/** ms until the next announcement is due. Zero or negative when it already is. */
	dueIn: number;
}

/**
 * Whether a published record is still standing, and what to say about it.
 *
 * Nothing published to Mainline stays published. It goes in about two hours
 * without a re-announcement, which means a phone that was asleep has an
 * unreachable owner — and the person should be told that plainly rather than
 * discovering it when someone says they could not find them.
 */
export function standingOf({ lastAt }: Announcement, now = Date.now()): AddressStanding {
	if (lastAt === null) {
		return {
			state: 'gone',
			says: 'Your address has not been published, so nobody can look you up.',
			dueIn: 0,
		};
	}
	const age = now - lastAt;
	const dueIn = MAINLINE_REPUBLISH_MS - age;
	if (age >= MAINLINE_EXPIRY_MS) {
		return {
			state: 'gone',
			says: 'Your address has dropped off the network. Nobody can look you up until it goes back.',
			dueIn,
		};
	}
	if (age >= MAINLINE_REPUBLISH_MS) {
		return {
			state: 'due',
			says: 'Your address is due to be published again, or it will drop off within the hour.',
			dueIn,
		};
	}
	return { state: 'live', says: 'Your address is published and findable.', dueIn };
}
