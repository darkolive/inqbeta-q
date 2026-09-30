/*
 * Revocation — and an honest account of what it can and cannot reach.
 *
 * Darren, 2026-09-20: "I have a flash drive, 2026, it's in my drawer. That's
 * my archive. We got robbed… I cannot find that flash drive. I need to revoke
 * it because otherwise someone has got it and potentially trying to hack it."
 *
 * THE PART THAT IS TRUE. Everything in Q is a DID — identity, places,
 * channels, cards. So everything can be named, and anything that can be named
 * can be revoked with one signature. That is a real capability and most
 * systems do not have it.
 *
 * THE PART THAT IS NOT. A revocation cannot reach the drive. The thief has the
 * bytes; no signature erases them. This is the fourth time today the same
 * truth has turned up — a relay cannot be made to delete, a DHT cannot be made
 * to forget, an archive cannot be checked from here, and now: a revocation
 * cannot be made to travel.
 *
 *   THE DRIVE IS SAFE BECAUSE IT WAS SEALED, NOT BECAUSE IT WAS REVOKED.
 *
 * What revoking DOES do, and each of these is worth having:
 *
 *   1. Stops the future. Nothing that DID produces or claims is accepted
 *      again, by you or by anyone federated with you.
 *   2. Fixes the moment. A signed, timestamped declaration that this place was
 *      compromised at a known time. That is the compliance artefact — an
 *      incident record wants the declaration and its time, not a promise.
 *   3. Scopes the damage. Names what lived there, so you know what to re-key
 *      and whom to tell.
 *
 * AND THE THING THAT MUST BE SAID OUT LOUD. You cannot revoke your way out of
 * a key that still exists. If the drive held a vault sealed to your OWN
 * identity key, the thief holds ciphertext your passkey opens — not the
 * drive's. Revoking the drive changes that exposure by exactly nothing. Worse,
 * a did:dht identity key cannot be rotated (see mainline.ts), so there is no
 * recovering from it at all.
 *
 * The fix is architectural, not procedural: SEAL AN ARCHIVE TO ITS OWN KEY,
 * never to the identity key. Then losing a drive costs one key, and that key
 * can be destroyed. exposureAfter() exists to make that difference visible
 * before somebody relies on the wrong one.
 *
 * WHAT THE KERNEL MAY HOLD. The incubator's design invariant is that the
 * kernel stays minimal, and its own guardrails document ends with
 * "Intentionally Deferred: capability expiration/revocation (future)". This is
 * that gap. So the shape below is deliberately the smallest thing that works,
 * and checkRevocation() refuses anything smuggled in beside it — because a
 * revocation is the MOST widely distributed receipt in the system. It has to
 * reach everyone who might accept that DID, which makes it the last place
 * anything private belongs.
 *
 * Pure. No signing, no network. This says what a revocation must be.
 */

export interface Revocation {
	/** What is being revoked. A DID, never a path, a name, or a serial number. */
	subject: string;
	/** Who says so. Must be the subject's controller. */
	by: string;
	/** When it was declared. ISO 8601. */
	at: string;
	/**
	 * Why, in the person's own words, or absent.
	 *
	 * Free text on purpose. A controlled vocabulary would mean the kernel
	 * understands reasons, and a kernel that understands reasons is a kernel
	 * that judges. It records, flags and constrains. It does not judge.
	 */
	because?: string;
	/**
	 * Something outside the revoker that fixes the time — a federation's
	 * counter-signature, or a hash chained to a previous entry. Absent means
	 * the time is the revoker's word alone.
	 */
	anchor?: string;
}

/** Everything a revocation must not carry, named so it can be tested. */
const SMUGGLED = ['content', 'payload', 'data', 'address', 'location', 'where', 'path', 'serial', 'contents'];

export interface Check {
	ok: boolean;
	says: string;
	/** Fields that were present and should not have been. */
	refused: string[];
}

/**
 * Whether this is a revocation, or a revocation with something riding along.
 *
 * The checks are few because the shape is small, and the shape is small on
 * purpose. Anything that passes here can be handed to a stranger.
 */
export function checkRevocation(r: Record<string, unknown>): Check {
	const refused = Object.keys(r).filter((k) => SMUGGLED.includes(k.toLowerCase()));
	if (refused.length) {
		return {
			ok: false,
			says: 'A revocation is sent to everyone who might trust this. Nothing private can travel in it.',
			refused
		};
	}
	if (typeof r.subject !== 'string' || !r.subject.startsWith('did:')) {
		return { ok: false, says: 'A revocation names a DID, not a place or a name.', refused: [] };
	}
	if (typeof r.by !== 'string' || !r.by.startsWith('did:')) {
		return { ok: false, says: 'A revocation has to say who is declaring it.', refused: [] };
	}
	if (typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) {
		return { ok: false, says: 'A revocation has to say when.', refused: [] };
	}
	return { ok: true, says: 'This can be handed to anyone.', refused: [] };
}

/**
 * How much the stated time is worth.
 *
 * A self-signed timestamp is the revoker's word. That is enough for "I acted
 * promptly" among people who already trust you, and not enough for a dispute.
 * Saying which, at the time of revoking, is the difference between a person
 * who knows their position and one who finds out later.
 */
export function timeStanding(r: Revocation): { trusted: boolean; says: string } {
	return r.anchor
		? { trusted: true, says: 'The time is witnessed, so it holds up to someone who does not trust you.' }
		: {
				trusted: false,
				says: 'The time is your own word. Fine for your own records; not proof to someone disputing it.'
			};
}

/** A revocation is never taken back. Found is not unrevoked. */
export function canBeUndone(): boolean {
	return false;
}

export interface WhatWasThere {
	/** True when what was on it was sealed to a key belonging only to that place. */
	sealedToItsOwnKey: boolean;
	/** True when that key still exists somewhere and can be destroyed. */
	keyCanBeDestroyed: boolean;
	/** True when what was on it opens with the person's identity key. */
	opensWithIdentityKey: boolean;
	/** True when the identity key cannot be rotated — did:dht, for one. */
	identityKeyIsFixed: boolean;
}

export type Exposure = 'closed' | 'closable' | 'permanent' | 'unknown';

export interface ExposureVerdict {
	exposure: Exposure;
	says: string;
	fix: string;
}

/**
 * What revoking actually bought, for this thing, in this situation.
 *
 * This is the function that stops a revocation being mistaken for a remedy. A
 * person who has revoked a lost drive and been told "done" will not re-key,
 * and will not tell anyone, and will be wrong about where they stand.
 */
export function exposureAfter(was: WhatWasThere): ExposureVerdict {
	if (was.opensWithIdentityKey && was.identityKeyIsFixed) {
		return {
			exposure: 'permanent',
			says: 'What was on it opens with your identity key, and that key cannot be changed. Revoking stops it being trusted from now on. It does not close what is already out there.',
			fix: 'Treat everything that was on it as read. From here, seal archives to a key of their own.'
		};
	}
	if (was.opensWithIdentityKey) {
		return {
			exposure: 'closable',
			says: 'What was on it opens with your identity key, so revoking the drive changes nothing about it.',
			fix: 'Change that key and re-seal, or this stays open.'
		};
	}
	if (was.sealedToItsOwnKey && was.keyCanBeDestroyed) {
		return {
			exposure: 'closable',
			says: 'What was on it opens only with that drive’s own key.',
			fix: 'Destroy that key and the drive becomes noise, wherever it is.'
		};
	}
	if (was.sealedToItsOwnKey) {
		return {
			exposure: 'closed',
			says: 'What was on it opens only with a key nobody has. It is already noise.',
			fix: ''
		};
	}
	return {
		exposure: 'unknown',
		says: 'It is not recorded what could open what was on that drive, so what a thief has cannot be said.',
		fix: 'Assume it is readable and act accordingly.'
	};
}
