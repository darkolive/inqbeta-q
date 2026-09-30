/*
 * Ways back in — the browser side of ADR-Q-005.
 *
 * Everything here needs the seed for one action and then lets go of it: a
 * touch of a passkey you already have rebuilds it, the action uses it, and it
 * is zeroed. The seed is never held between actions and never written down.
 *
 *   add a passkey      touch the one you have, then make the new one; the new
 *                      passkey's secret wraps the seed (continuity.addWay)
 *   recovery card      touch, make a key, show it ONCE; it is saved only after
 *                      the person types its last group back — proof it was
 *                      written down, not just seen
 *   remove a way       no touch needed — the identity already in memory signs
 *                      the new envelope; never the last way
 *
 * Every change writes continuity.json into the vault (so the next backup
 * carries it) and keeps this browser's copy current.
 */
import {
	addWay,
	checkEnvelope,
	CONTINUITY_FILE,
	formatRecoveryKey,
	knownEnvelope,
	newRecoveryKey,
	openEnvelope,
	parseRecoveryKey,
	passkeyRole,
	rememberEnvelope,
	removeWay,
	wayInHandle,
	type Envelope
} from './continuity';
import { readContinuity, writeContinuity } from './folder';
import { holdIdentity, identityFromSeed, makeWayInPasskey, passkeyDomain, touchPasskey, type Identity, type KeyPlace } from './passkey';
import { unzip } from './zip';

export type Done<T = object> = ({ ok: true } & T) | { ok: false; says: string; cancelled?: boolean };

/** The envelope for this identity: the vault's, else this browser's. */
export async function currentEnvelope(identity: Identity): Promise<Envelope | null> {
	const inVault = await readContinuity();
	if (inVault) {
		const c = await checkEnvelope(inVault);
		if (c.ok && c.did === identity.did) return inVault as Envelope;
	}
	return knownEnvelope(identity.did);
}

async function save(e: Envelope): Promise<void> {
	await writeContinuity(e);
	await rememberEnvelope(e);
}

/* One touch of a passkey that is already yours, and the seed it gives. */
async function seedByTouch(identity: Identity, env: Envelope | null, place?: KeyPlace): Promise<Done<{ seed: Uint8Array }>> {
	const t = await touchPasskey(place);
	if (!t.ok) return t;
	const role = passkeyRole(t.userHandle);
	let seed: Uint8Array;
	if (role.role === 'founding') {
		seed = t.prf;
	} else {
		if (!env) return { ok: false, says: 'This passkey opens a continuity file this vault does not have yet.' };
		const opened = await openEnvelope(env, t.prf, 'passkey');
		if (!opened.ok) return opened;
		seed = opened.seed;
	}
	if ((await identityFromSeed(seed)).did !== identity.did) {
		seed.fill(0);
		return { ok: false, says: 'That passkey belongs to a different identity — another world. Touch the passkey you signed in with.' };
	}
	return { ok: true, seed };
}

/** Add a passkey — a security key, or one on another device — as a way back in. */
export async function addPasskeyWay(identity: Identity, label: string, place: KeyPlace): Promise<Done<{ envelope: Envelope }>> {
	try {
		const env = await currentEnvelope(identity);
		const got = await seedByTouch(identity, env);
		if (!got.ok) return got;
		try {
			const made = await makeWayInPasskey(label, await wayInHandle(identity.did), place);
			if (!made.ok) return made;
			const next = await addWay(identity, got.seed, env, made.prf, {
				kind: 'passkey',
				label,
				rpId: passkeyDomain() ?? (typeof location !== 'undefined' ? location.hostname : undefined),
				carrier: place === 'security-key' ? 'security-key' : 'keychain'
			});
			made.prf.fill(0);
			await save(next);
			return { ok: true, envelope: next };
		} finally {
			got.seed.fill(0);
		}
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

export interface PendingCard {
	/** The card, in groups of five. Show it once. */
	card: string;
	/** Save the new way in — only if `lastGroup` matches what is on the card. */
	confirm(lastGroup: string): Promise<Done<{ envelope: Envelope }>>;
}

/** Make a recovery card. Nothing is saved until the person proves they have it. */
export async function prepareRecoveryCard(identity: Identity): Promise<Done<{ pending: PendingCard }>> {
	try {
		const env = await currentEnvelope(identity);
		const got = await seedByTouch(identity, env);
		if (!got.ok) return got;
		const key = newRecoveryKey();
		let next: Envelope;
		let card: string;
		try {
			const day = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
			next = await addWay(identity, got.seed, env, key, { kind: 'recovery', label: `Recovery card, ${day}` });
			card = await formatRecoveryKey(key);
		} finally {
			got.seed.fill(0);
			key.fill(0);
		}
		const last = card.split('-').pop()!;
		return {
			ok: true,
			pending: {
				card,
				async confirm(lastGroup: string) {
					if (lastGroup.trim().toUpperCase().replace(/O/g, '0') !== last)
						return { ok: false, says: 'That is not the last group on the card. Check what you wrote down.' };
					await save(next);
					return { ok: true, envelope: next };
				}
			}
		};
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Take a way out — a lost phone, an old card. Never the last one. */
export async function removeWayAt(identity: Identity, index: number): Promise<Done<{ envelope: Envelope }>> {
	try {
		const env = await currentEnvelope(identity);
		if (!env) return { ok: false, says: 'There are no ways back in to remove.' };
		const next = await removeWay(identity, env, index);
		await save(next);
		return { ok: true, envelope: next };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** The continuity envelope inside a backup zip, checked. */
export async function envelopeFromBackup(file: File): Promise<Done<{ envelope: Envelope }>> {
	try {
		const inside = await unzip(new Uint8Array(await file.arrayBuffer()));
		const found = inside.find((e) => e.name === CONTINUITY_FILE || e.name.endsWith(`/${CONTINUITY_FILE}`));
		if (!found) return { ok: false, says: 'That backup has no continuity file in it. Choose one made after you added a way back in.' };
		const env = JSON.parse(new TextDecoder().decode(found.bytes)) as Envelope;
		const c = await checkEnvelope(env);
		if (!c.ok) return c;
		return { ok: true, envelope: env };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * At sign-in, when a way-in passkey's envelope is not in this browser: read it
 * out of a backup zip and keep it here, so the next touch signs in.
 */
export async function learnEnvelopeFrom(file: File): Promise<Done<{ did: string }>> {
	const got = await envelopeFromBackup(file);
	if (!got.ok) return got;
	await rememberEnvelope(got.envelope);
	return { ok: true, did: got.envelope.did };
}

/* ------------------------------------------------------------------ *
 * The recovery ritual (ADR-Q-005 step 5; incubator charter §3):
 * Find → Unlock → Sign → Reconnect. One step at a time; pausing is allowed.
 * ------------------------------------------------------------------ */

export interface Recovered {
	identity: Identity;
	/** Make a passkey on this device and add it as a way back in, so next time is one touch. */
	addThisDevice(label: string, place?: KeyPlace): Promise<Done>;
	/** Let go of the seed. Call when the person is finished, whether or not they added a passkey. */
	done(): void;
}

/**
 * Unlock with the recovery card and sign in as the same DID. The seed is held
 * only inside the returned object, for the one optional action it allows, and
 * is zeroed by `done()`.
 */
export async function recoverWithCard(envelope: Envelope, cardText: string): Promise<Done<{ recovered: Recovered }>> {
	const parsed = await parseRecoveryKey(cardText);
	if (!parsed.ok) return parsed;
	const opened = await openEnvelope(envelope, parsed.key, 'recovery');
	parsed.key.fill(0);
	if (!opened.ok) return opened;
	holdIdentity(opened.identity);
	await rememberEnvelope(envelope);
	const seed = opened.seed;
	let env = envelope;
	const identity = opened.identity;
	return {
		ok: true,
		recovered: {
			identity,
			async addThisDevice(label: string, place: KeyPlace = 'device') {
				try {
					const made = await makeWayInPasskey(label, await wayInHandle(identity.did), place);
					if (!made.ok) return made;
					const current = (await currentEnvelope(identity)) ?? env;
					env = await addWay(identity, seed, current, made.prf, {
						kind: 'passkey',
						label,
						rpId: passkeyDomain() ?? (typeof location !== 'undefined' ? location.hostname : undefined),
						carrier: place === 'security-key' ? 'security-key' : 'keychain'
					});
					made.prf.fill(0);
					await rememberEnvelope(env);
					/* Into the vault too, once it is open — and it will be carried by the next backup. */
					await writeContinuity(env).catch(() => {});
					return { ok: true };
				} catch (e) {
					return { ok: false, says: e instanceof Error ? e.message : String(e) };
				}
			},
			done() {
				seed.fill(0);
			}
		}
	};
}
