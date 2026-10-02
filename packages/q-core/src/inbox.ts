/*
 * Your inbox at the storage unit (2 October 2026): how a message reaches
 * someone, with or without the bell.
 *
 *   your inbox   an id only you can make: from a signature by your key over a
 *                fixed phrase (Ed25519 signatures are deterministic, so every
 *                device of yours makes the same one). The id goes on your
 *                cards, so people you give a card to can write to you.
 *   the key      proves the inbox is yours: its hash IS the id. You show it
 *                to list, collect and let go of what's waiting; nobody else
 *                can make it.
 *   a post       a message sealed to you (only your key opens it), wrapped in
 *                a receipt the sender signs, saying when it may go (at most
 *                30 days). The storage unit sees who sent it, to which inbox,
 *                and its size — never what it says.
 *
 * The bellboy only pings "something's waiting" on q/inbox/<id>; Q collects it
 * whenever it opens anyway, so nothing depends on being online at the time.
 *
 * Pure: WebCrypto only, so it's tested in Node.
 */
import { b64url, canonical } from './canonical';
import { sealWith, type SealedReceipt, type SealedToPeople } from './seal';
import type { Identity } from './passkey';

export const INBOX_PHRASE = 'inqbeta.inbox/1';
export const POST_SCHEMA = 'inqbeta.post/1';
export const MESSAGE_SCHEMA = 'inqbeta.message/1';
export const POST_DAYS = 30;

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

/** The id that names an inbox, from its key. The gate does exactly this. */
export async function inboxIdFor(key: string): Promise<string> {
	return b64url(await sha256(new TextEncoder().encode(key))).slice(0, 22);
}

/** Your inbox: its id (to share) and its key (to keep). */
export async function inboxOf(identity: Pick<Identity, 'signing'>): Promise<{ id: string; key: string }> {
	const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, identity.signing.privateKey, new TextEncoder().encode(canonical(INBOX_PHRASE))));
	const key = b64url(await sha256(sig));
	return { id: await inboxIdFor(key), key };
}

/** What a message says, inside the seal. Signed by its sender. */
export interface Message {
	schema: typeof MESSAGE_SCHEMA;
	source: 'inqbeta:q/message';
	kind: 'message' | 'linked-back' | 'call' | 'call-reply';
	/** Whose it is: the DID it was sealed for. */
	to: string;
	/** Where to write back. */
	replyTo?: string;
	text?: string;
	/** The sender's card, as they chose to show it (linked-back). */
	card?: Record<string, string>;
	/** A call's invitation or reply link. */
	link?: string;
	at: string;
}

/** The post the storage unit keeps: the sealed message, signed by the sender, with when it may go. */
export function makePost(identity: Pick<Identity, 'did' | 'publicKey' | 'signing'>, to: string, sealed: SealedToPeople, days = POST_DAYS, now = new Date()): Promise<SealedReceipt> {
	const until = new Date(now.getTime() + Math.min(days, POST_DAYS) * 86400000).toISOString();
	return sealWith(identity, { schema: POST_SCHEMA, source: 'inqbeta:q/post', to, sealed, until });
}
