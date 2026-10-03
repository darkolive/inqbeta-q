/*
 * Offers by link (ADR-Q-026, 3 October 2026): shared the way a card is.
 *
 * Darren: "You create the first receipt by making an offer. And that offer can
 * be shared … email them, … address book, … WhatsApp them the link, all the
 * same channels. But whoever receives the offer can open that link and see
 * what the offer is, all of that card, and then either counter offer or
 * accept or decline … it just gets bellboyed. A very simple system,
 * self-deleting."
 *
 * The offer (its signed `proposed` receipt), your card as it shows, and your
 * inbox wait locked in the storage — the same drop as a card link — and the
 * link is inqbeta.com/offer/<id>#<key>: the key is in the #fragment, which
 * no server sees. Opening needs a fresh signed claim, and the first person to
 * open it keeps it. Opening keeps the offer in their vault and links you up,
 * so their answer reaches your inbox and your bell rings.
 */
import { seal, sealWith, checkReceipt } from '@inqbeta/q-core/seal';
import { b64url } from '@inqbeta/q-core/canonical';
import { current } from '@inqbeta/q-core/passkey';
import { lockForLink, unlockFromLink, makeDrop, type Box } from '@inqbeta/q-core/drop';
import { isAgreementStep, type AgreementReceipt } from '@inqbeta/q-core/agreements';
import { saveLocked } from '@inqbeta/q-core/folder';
import { readHome } from '$lib/home';
import { keepStep, myInbox, sendTo } from '$lib/messages';
import { myCardDetails } from '$lib/mycard';
import { refreshLedger, type Ledger } from '$lib/ledger';

export const OFFER_LINK_SCHEMA = 'inqbeta.offer-link/1';
export interface OfferLink {
	schema: typeof OFFER_LINK_SCHEMA;
	/** The offer itself: its signed first step. */
	offer: AgreementReceipt;
	/** The maker's card, as it shows. */
	card: Record<string, string>;
	/** Where answers go: the maker's inbox. */
	inbox?: string;
	at: string;
}

async function storage(): Promise<string | null> {
	const h = await readHome().catch(() => null);
	return h?.ok && h.services.storage ? h.services.storage.replace(/\/$/, '') : null;
}

/** Make the link for an offer you made. */
export async function makeOfferLink(offer: AgreementReceipt, ledger: Ledger | null): Promise<{ ok: true; link: string } | { ok: false; says: string }> {
	const me = current();
	const where = await storage();
	if (!me) return { ok: false, says: 'Sign in first.' };
	if (!where) return { ok: false, says: 'Q can’t find the storage just now, so the link can’t be made.' };
	if (offer.did !== me.did || offer.content.step !== 'proposed') return { ok: false, says: 'Only your own offer can be shared.' };
	try {
		const whole: OfferLink = { schema: OFFER_LINK_SCHEMA, offer, card: await myCardDetails(me, ledger), inbox: (await myInbox(me))?.id, at: new Date().toISOString() };
		const signed = await seal(whole);
		const { box, key } = await lockForLink(signed);
		const drop = await makeDrop(me, box);
		const res = await fetch(`${where}/drop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(drop), signal: AbortSignal.timeout(15_000) });
		const out = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; says?: string };
		if (!res.ok || !out.ok || !out.id) return { ok: false, says: out.says ?? `The storage said ${res.status}.` };
		return { ok: true, link: `${location.origin}/offer/${out.id}#${key}` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The link couldn’t be made.' };
	}
}

export type OpenedOffer = { ok: true; link: OfferLink; from: string } | { ok: false; says: string };

/** Open an offer link: claim it, unlock it, check every signature. */
export async function openOfferDrop(id: string, fragment: string): Promise<OpenedOffer> {
	const key = fragment.replace(/^#/, '');
	if (!key) return { ok: false, says: 'This link is missing its key. Ask them to send it again.' };
	const where = await storage();
	const me = current();
	if (!where) return { ok: false, says: 'Q can’t find where offers are kept just now. Try again in a moment.' };
	if (!me) return { ok: false, says: 'Sign in to see the offer.' };
	try {
		const claim = await sealWith(me, { schema: 'inqbeta.drop-claim/1', source: 'inqbeta:q/drop-claim', drop: id, at: new Date().toISOString() });
		const res = await fetch(`${where}/drop/${encodeURIComponent(id)}`, { headers: { 'x-q-claim': b64url(new TextEncoder().encode(JSON.stringify(claim))) }, signal: AbortSignal.timeout(15_000) });
		if (res.status === 404) return { ok: false, says: 'This offer has gone: shared links are kept for 30 days. Ask them to send it again.' };
		if (res.status === 401 || res.status === 403) return { ok: false, says: String(((await res.json().catch(() => ({}))) as { says?: string }).says ?? 'This offer was opened by someone else first.') };
		if (!res.ok) return { ok: false, says: `Couldn’t fetch the offer (${res.status}).` };
		const drop = (await res.json()) as { content?: { box?: Box } };
		if (!drop.content?.box) return { ok: false, says: 'This link isn’t an offer.' };
		const signed = (await unlockFromLink(drop.content.box, key)) as { did?: string; content?: OfferLink };
		if (!(await checkReceipt(signed)).ok || signed.content?.schema !== OFFER_LINK_SCHEMA) return { ok: false, says: 'This link isn’t an offer, or it doesn’t hold up.' };
		const offer = signed.content.offer;
		if (!isAgreementStep(offer) || offer.content.step !== 'proposed' || !(await checkReceipt(offer)).ok || offer.did !== signed.did) return { ok: false, says: 'The offer in this link doesn’t hold up.' };
		return { ok: true, link: signed.content, from: signed.did! };
	} catch {
		return { ok: false, says: 'This link is damaged or its key is wrong. Ask them to send it again.' };
	}
}

/**
 * Take an opened offer in: keep it in your vault and link up with whoever
 * made it, so your answer reaches them (and their card shows who they are).
 */
export async function takeOfferIn(opened: Extract<OpenedOffer, { ok: true }>, ledger: Ledger | null): Promise<string> {
	const me = current();
	if (!me) throw new Error('Sign in first.');
	await keepStep(opened.link.offer);
	if (opened.from !== me.did) {
		const card = { schema: 'inqbeta.card-link/1', name: 'Personal', details: opened.link.card, ...(opened.link.inbox ? { inbox: opened.link.inbox } : {}), at: opened.link.at };
		const record = { schema: 'inqbeta.linked/1', source: 'inqbeta:q/link', with: opened.from, card, signed: null, at: new Date().toISOString() };
		await saveLocked('contacts', `linked-${opened.from.slice(-16)}.json`, JSON.stringify(await seal(record), null, 2), 'application/json');
		if (opened.link.inbox) await sendTo({ did: opened.from, inbox: opened.link.inbox }, { kind: 'linked-back', card: await myCardDetails(me, ledger) }).catch(() => null);
	}
	await refreshLedger();
	return opened.link.offer.content.agreement;
}
