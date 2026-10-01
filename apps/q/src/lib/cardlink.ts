/*
 * Sharing a card by link (ADR-Q-015, 1 October 2026).
 *
 * Darren: "send your link to a friend so they can then link up with you …
 * by your email, by WhatsApp, whatever … it has nothing to do with us, we're
 * not involved." The link IS the card: signed by you, deflated into the
 * #fragment, so it never reaches a server — not even Q's. Email, WhatsApp or
 * a QR code just carry it.
 *
 * What travels: the details the card shows (pictures made small; the cover
 * stays behind, the link has to fit in a message), your DID, and your bellboy
 * inbox, so their Q can ring you back when they link up.
 */
import { seal, checkReceipt } from '@inqbeta/q-core/seal';
import { b64url, unb64url } from '@inqbeta/q-core/canonical';
import { thumbnail } from '$lib/pictures';

export const CARD_LINK_SCHEMA = 'inqbeta.card-link/1';
export interface CardLink {
	schema: typeof CARD_LINK_SCHEMA;
	/** The card's name: Personal, Business. */
	name: string;
	/** Question id → value, exactly what the card shows. */
	details: Record<string, string>;
	/** Where to ring you back: your inbox on your bellboy. */
	inbox?: string;
	at: string;
}

async function deflate(text: string): Promise<Uint8Array> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes: Uint8Array): Promise<string> {
	const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Response(stream).text();
}

/** Make the link. Signed with the passkey held in this tab. */
export async function makeCardLink(name: string, details: Record<string, string>, inbox?: string): Promise<string> {
	const small: Record<string, string> = {};
	for (const [k, v] of Object.entries(details)) {
		if (k === 'q:person/cover') continue;
		/* Every picture made small, yours included: a link has to fit in a message. */
		small[k] = v.startsWith('data:image/') ? await thumbnail(v) : v;
	}
	const card: CardLink = { schema: CARD_LINK_SCHEMA, name, details: small, ...(inbox ? { inbox } : {}), at: new Date().toISOString() };
	const signed = await seal(card);
	return `${location.origin}/link#${b64url(await deflate(JSON.stringify(signed)))}`;
}

export type OpenedLink = { ok: true; card: CardLink; from: string; signed: unknown } | { ok: false; says: string };

/** Read a link's #fragment: unpack, check the signature, hand back the card. */
export async function openCardLink(fragment: string): Promise<OpenedLink> {
	try {
		const signed = JSON.parse(await inflate(unb64url(fragment.replace(/^#/, '')))) as { did?: string; content?: CardLink };
		const check = await checkReceipt(signed);
		if (!check.ok) return { ok: false, says: `This card doesn’t hold up: ${check.says}` };
		if (signed.content?.schema !== CARD_LINK_SCHEMA) return { ok: false, says: 'This link isn’t a card.' };
		return { ok: true, card: signed.content, from: signed.did ?? '', signed };
	} catch {
		return { ok: false, says: 'This link is damaged or incomplete. Ask them to send it again.' };
	}
}
