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
import { current } from '@inqbeta/q-core/passkey';
import { lockForLink, unlockFromLink, makeDrop, type Box } from '@inqbeta/q-core/drop';
import { readHome } from '$lib/home';

/*
 * 2 October 2026: the card no longer travels IN the link (Darren: "why does
 * that need to be in the link?"). It waits, locked, in the home federation's
 * storage unit; the link is short — inqbeta.com/card/<id>#<key> — so it fits
 * any message or code, and the card keeps its full pictures, cover too. The
 * key is in the #fragment, which no server ever sees, so the storage unit
 * holds a box it can't open. If the storage unit can't be reached, the link
 * falls back to carrying the card itself, as before.
 */
async function storageUnit(): Promise<string | null> {
	const h = await readHome().catch(() => null);
	return h?.ok && h.services.storage ? h.services.storage.replace(/\/$/, '') : null;
}

async function dropLink(card: CardLink): Promise<string | null> {
	const me = current();
	const storage = await storageUnit();
	if (!me || !storage) return null;
	try {
		const signed = await seal(card);
		const { box, key } = await lockForLink(signed);
		const drop = await makeDrop(me, box);
		const res = await fetch(`${storage}/drop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(drop), signal: AbortSignal.timeout(15_000) });
		const out = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
		return res.ok && out.ok && out.id ? `${location.origin}/card/${out.id}#${key}` : null;
	} catch {
		return null;
	}
}

/** Open a short link's card: fetch the locked box, open it with the key, check the signature. */
export async function openCardDrop(id: string, fragment: string): Promise<OpenedLink> {
	const key = fragment.replace(/^#/, '');
	if (!key) return { ok: false, says: 'This link is missing its key. Ask them to send it again.' };
	const storage = await storageUnit();
	if (!storage) return { ok: false, says: 'Q can’t find where cards are kept just now. Try again in a moment.' };
	try {
		const res = await fetch(`${storage}/drop/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15_000) });
		if (res.status === 404) return { ok: false, says: 'This card has gone: shared cards are only kept for 30 days. Ask them to send it again.' };
		if (!res.ok) return { ok: false, says: `Couldn’t fetch the card (${res.status}).` };
		const drop = (await res.json()) as { content?: { box?: Box } };
		if (!drop.content?.box) return { ok: false, says: 'This link isn’t a card.' };
		const signed = (await unlockFromLink(drop.content.box, key)) as { did?: string; content?: CardLink };
		const check = await checkReceipt(signed);
		if (!check.ok) return { ok: false, says: `This card doesn’t hold up: ${check.says}` };
		if (signed.content?.schema !== CARD_LINK_SCHEMA) return { ok: false, says: 'This link isn’t a card.' };
		return { ok: true, card: signed.content, from: signed.did ?? '', signed };
	} catch {
		return { ok: false, says: 'This link is damaged or its key is wrong. Ask them to send it again.' };
	}
}

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

/** Make the link. Signed with the passkey held in this tab. Short when the storage unit can keep it. */
export async function makeCardLink(name: string, details: Record<string, string>, inbox?: string): Promise<string> {
	const whole: CardLink = { schema: CARD_LINK_SCHEMA, name, details, ...(inbox ? { inbox } : {}), at: new Date().toISOString() };
	const short = await dropLink(whole);
	if (short) return short;
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
