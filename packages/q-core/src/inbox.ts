/*
 * Your inbox at the storage (2 October 2026): how a message reaches
 * someone, with or without the bell.
 *
 *   your inbox   an id only you can make: from your vault key, sealing a
 *                fixed phrase in a fixed way, so every device of yours makes
 *                the same one. (Not from a signature: Safari's Ed25519 adds
 *                randomness to every signature, so a signature-based inbox
 *                changed each sign-in and messages went to an inbox nobody
 *                was checking — found 2 October 2026.) The id goes on your
 *                cards, so people you give a card to can write to you.
 *   the key      proves the inbox is yours: its hash IS the id. You show it
 *                to list, collect and let go of what's waiting; nobody else
 *                can make it.
 *   a post       a message sealed to you (only your key opens it), wrapped in
 *                a receipt the sender signs, saying when it may go (at most
 *                30 days). The storage sees who sent it, to which inbox,
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
import type { Attachment, Piece } from './attachments';

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

/** Your inbox: its id (to share) and its key (to keep). The same on every device and every browser. */
export async function inboxOf(identity: Pick<Identity, 'vault'>): Promise<{ id: string; key: string }> {
	/* A fixed phrase, sealed with a fixed (all-zero) nonce under your vault key:
	 * the same bytes every time, and nobody without your key can make them.
	 * The vault key's own files always use fresh random nonces, so this one
	 * fixed use never meets them. */
	const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12) }, identity.vault, new TextEncoder().encode(canonical(INBOX_PHRASE))));
	const key = b64url(await sha256(sealed));
	return { id: await inboxIdFor(key), key };
}

/** What a message says, inside the seal. Signed by its sender. */
export interface Message {
	schema: typeof MESSAGE_SCHEMA;
	source: 'inqbeta:q/message';
	kind: 'message' | 'linked-back' | 'call' | 'call-reply' | 'call-declined' | 'call-ended' | 'voicemail' | 'agreement' | 'piece';
	/** Whose it is: the DID it was sealed for. */
	to: string;
	/** Where to write back. */
	replyTo?: string;
	text?: string;
	/** The sender's card, as they chose to show it (linked-back). */
	card?: Record<string, string>;
	/** A call's invitation or reply link. */
	link?: string;
	/** A voice message (ADR-Q-022): the recording as a data: URL and its length. */
	audio?: string;
	seconds?: number;
	/** Which call this is about (call, call-ended, voicemail), so a call that has ended never rings late. */
	call?: string;
	/** An agreement step (ADR-Q-025): its own signed receipt, carried inside the message. */
	step?: unknown;
	/** Pictures, files, links, places and cards (q-core/attachments.ts). */
	attachments?: Attachment[];
	/** One piece of a big file (kind 'piece'): not conversation, joined on arrival. */
	piece?: Piece;
	/** Who else the same message went to, each with their own sealed copy. */
	alsoTo?: string[];
	at: string;
}

/** The post the storage keeps: the sealed message, signed by the sender, with when it may go. */
export function makePost(identity: Pick<Identity, 'did' | 'publicKey' | 'signing'>, to: string, sealed: SealedToPeople, days = POST_DAYS, now = new Date()): Promise<SealedReceipt> {
	const until = new Date(now.getTime() + Math.min(days, POST_DAYS) * 86400000).toISOString();
	return sealWith(identity, { schema: POST_SCHEMA, source: 'inqbeta:q/post', to, sealed, until });
}
