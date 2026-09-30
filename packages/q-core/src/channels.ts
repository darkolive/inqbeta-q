/*
 * Channels — the ways you can be reached, held as receipts.
 *
 * Darren, 2026-09-19:
 *
 *   > "…we should be storing the verified method and it'd be a did type email
 *   > or SMS. And they can be stored in as a receipt, for backup. And for
 *   > marketing or messaging, it's useful for all of those channels, isn't it?
 *   > That's what they are, channels."
 *
 *   > "Is there a way that the receipt… is somehow a hash of the email and the
 *   > did of the owner… and when you send an API, you're sending it to a
 *   > decryption of that DID or that hash… And if it doesn't send it to its
 *   > decrypted email, it goes nowhere. And gets rejected."
 *
 * HOW. A verified channel is a receipt that carries two things about one
 * address:
 *
 *   hash     sha256 of {did, kind, address}. Anyone holding an address can
 *            check it against this; nobody can work backwards from it. This is
 *            what makes the channel PROVABLE without being readable.
 *   address  the address itself, sealed (seal.ts, X25519) to two DIDs — yours,
 *            so it is yours to recover on any device your passkey reaches, and
 *            the sending service's, so a send can happen when you are not
 *            here. Sealing takes a list of recipients, so this is one seal with
 *            two ways in, not two copies.
 *
 * WHY THE SERVICE KEY. A returning person has not signed in yet — that is the
 * whole point of the sign-in code — so their own key cannot open anything at
 * the moment the code must be sent. Something server-side has to resolve the
 * channel, or a sign-in code could only ever go to an address typed in again by
 * hand. Said plainly: the service CAN read an address it has been sealed for.
 * What it cannot do is be handed one.
 *
 * WHAT THAT BUYS. The send API takes a channel reference — a DID and a channel
 * id — and never an address. It resolves the reference, or it refuses. So:
 *
 *   - no arbitrary recipient can be injected into a send;
 *   - nothing is sent anywhere that a signed receipt does not already say
 *     belongs to that DID;
 *   - dropping the receipt from your folder ends the channel.
 *
 * NOT A CONTACT LIST. Someone else's address belongs in contacts.ts, hashed and
 * never stored whole. This file is only about the ways YOU said you could be
 * reached.
 */
import { canonical, sha256, unb64url } from './canonical';
import { publicKeyFrom } from './did';
import { openWith, sealTo, type SealedToPeople } from './seal';

/** What kind of address it is — the two we can actually deliver to. */
export type ChannelKind = 'email' | 'sms';

/**
 * What a channel may be used for. Kept apart on purpose: agreeing to a sign-in
 * code is not agreeing to marketing, and the receipt should say which was
 * given.
 */
export type ChannelUse = 'sign-in' | 'notify' | 'messages' | 'marketing';

export const CHANNEL_SOURCE = 'inqbeta:channel:verified';

/**
 * What the sending service saw: this identity opened a receipt at this address.
 *
 * The passkey comes FIRST (decided 2026-09-19), so there is a DID before a
 * claim is ever sent — and the attestation names it. An earlier design had the
 * service attest to an address alone, because the address was proved before the
 * identity existed; putting the passkey first deleted the need for that, and
 * the proof is stronger for naming both halves of what it saw.
 */
export interface ChannelProof {
	/** The service that sent the claim. */
	by: string;
	/** Whose identity opened it. */
	did: string;
	/** sha256(canonical({ kind, address })). */
	addressHash: string;
	verifiedAt: string;
	/** The service's signature over canonical(proofDoc(...)). */
	signature: string;
}

/** The hash a proof is about. The address alone — the DID sits beside it in the proof. */
export async function addressHash(kind: ChannelKind, address: string): Promise<string> {
	return sha256(canonical({ kind, address: normaliseAddress(kind, address) }));
}

/**
 * Exactly what a service signs, and exactly what a reader checks. One
 * definition, so the two can never drift apart.
 */
export function proofDoc(did: string, kind: ChannelKind, addressHash: string, verifiedAt: string) {
	return { did, kind, addressHash, verifiedAt };
}

export interface VerifiedChannel {
	source: typeof CHANNEL_SOURCE;
	/** Whose channel this is. */
	did: string;
	kind: ChannelKind;
	/** Short, stable name for this channel — the first 16 of the hash. */
	id: string;
	/** sha256(canonical({ did, kind, address })). Checks an address; never yields one. */
	hash: string;
	/** The address, sealed to `openableBy`. */
	address: SealedToPeople;
	/** The DIDs that can open it, said plainly so a reader need not try. */
	openableBy: string[];
	/** When the code sent to it was answered correctly. */
	verifiedAt: string;
	/** What this channel was given for. */
	uses: ChannelUse[];
	/** The sending service's attestation that a code sent here was answered. */
	proof?: ChannelProof;
}

/**
 * The same address written two ways must give the same hash, or a channel
 * silently becomes two. Email case and surrounding space are noise; a phone
 * number's spaces, dashes and brackets are too, but a leading + is not.
 */
export function normaliseAddress(kind: ChannelKind, address: string): string {
	const trimmed = address.trim();
	if (kind === 'email') return trimmed.toLowerCase();
	const digits = trimmed.replace(/[^\d+]/g, '');
	return digits.startsWith('+') ? `+${digits.slice(1).replace(/\+/g, '')}` : digits;
}

/** The hash a channel is known by. Bound to the DID, so the same address under two identities is two channels. */
export async function channelHash(did: string, kind: ChannelKind, address: string): Promise<string> {
	return sha256(canonical({ did, kind, address: normaliseAddress(kind, address) }));
}

/** The short name, for a reference that fits in a URL or a line of a log. */
export function channelIdFrom(hash: string): string {
	return hash.slice(0, 16);
}

/** Does this channel belong to this address? The only question the hash answers. */
export async function matchesAddress(channel: VerifiedChannel, address: string): Promise<boolean> {
	return (await channelHash(channel.did, channel.kind, address)) === channel.hash;
}

/**
 * Build a verified channel. `serviceDid` is the sending service; leave it out
 * and only you will ever be able to open the address — which is stricter, and
 * means no code can be sent to it while you are signed out.
 */
export async function buildChannel(params: {
	did: string;
	kind: ChannelKind;
	address: string;
	uses: ChannelUse[];
	serviceDid?: string;
	verifiedAt?: string;
	proof?: ChannelProof;
}): Promise<VerifiedChannel> {
	const address = normaliseAddress(params.kind, params.address);
	if (!address) throw new Error('A channel needs an address.');
	const hash = await channelHash(params.did, params.kind, address);
	const openableBy = [params.did, ...(params.serviceDid ? [params.serviceDid] : [])];
	const { sealed } = await sealTo({ kind: params.kind, address }, openableBy, 'a channel');
	return {
		source: CHANNEL_SOURCE,
		did: params.did,
		kind: params.kind,
		id: channelIdFrom(hash),
		hash,
		address: sealed,
		openableBy,
		verifiedAt: params.verifiedAt ?? params.proof?.verifiedAt ?? new Date().toISOString(),
		uses: [...new Set(params.uses)],
		...(params.proof ? { proof: params.proof } : {})
	};
}

/**
 * Is the service's attestation real, and is it about THIS address?
 *
 * Both halves matter. The signature alone says a service saw some address
 * answer a code; the address check says it was this one. A proof lifted from
 * another channel fails the second.
 */
export async function checkChannelProof(channel: VerifiedChannel, address: string): Promise<boolean> {
	const proof = channel.proof;
	if (!proof) return false;
	/* The proof must be about this identity, not merely about this address —
	 * otherwise one person's proof would vouch for another person's channel. */
	if (proof.did !== channel.did) return false;
	if ((await addressHash(channel.kind, address)) !== proof.addressHash) return false;
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(proof.by), { name: 'Ed25519' }, false, ['verify']);
		const doc = proofDoc(proof.did, channel.kind, proof.addressHash, proof.verifiedAt);
		return await crypto.subtle.verify(
			{ name: 'Ed25519' },
			key,
			unb64url(proof.signature),
			new TextEncoder().encode(canonical(doc))
		);
	} catch {
		return false;
	}
}

/**
 * Open the address — with your own key, or the service's. Returns null rather
 * than throwing when the key is not one of the two, because "not for me" is an
 * ordinary answer here, not a fault.
 */
export async function openChannelAddress(
	channel: VerifiedChannel,
	key: { did: string; opening: CryptoKey }
): Promise<string | null> {
	const opened = await openWith(channel.address, key);
	if (!opened.ok) return null;
	const body = opened.body as { kind?: string; address?: string };
	if (typeof body?.address !== 'string' || body.kind !== channel.kind) return null;
	/* The seal proves who it was for; the hash proves it is the address the
	 * receipt is about. Both, or the channel is not what it says it is. */
	return (await matchesAddress(channel, body.address)) ? normaliseAddress(channel.kind, body.address) : null;
}

export function isVerifiedChannel(body: unknown): body is VerifiedChannel {
	const c = body as VerifiedChannel;
	return (
		!!c &&
		typeof c === 'object' &&
		c.source === CHANNEL_SOURCE &&
		typeof c.did === 'string' &&
		(c.kind === 'email' || c.kind === 'sms') &&
		typeof c.hash === 'string' &&
		Array.isArray(c.openableBy) &&
		!!c.address
	);
}

/** Every channel a person can be reached on, newest verification of each kept. */
export function newestPerChannel(channels: VerifiedChannel[]): VerifiedChannel[] {
	const byId = new Map<string, VerifiedChannel>();
	for (const c of channels) {
		const seen = byId.get(c.id);
		if (!seen || c.verifiedAt > seen.verifiedAt) byId.set(c.id, c);
	}
	return [...byId.values()].sort((a, b) => (a.verifiedAt < b.verifiedAt ? 1 : -1));
}
