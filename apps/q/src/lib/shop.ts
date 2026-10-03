/*
 * Shops (ADR-Q-026, 3 October 2026): a page of standing offers.
 *
 * Darren: a shop is a product page — offers anyone can take. A standing offer
 * is an open offer with a number available. Each purchase is its own
 * agreement with the buyer, agreed the moment they buy (the contract point),
 * then settled like any other (the accounting).
 *
 * Listings are held publicly at the storage gate, signed by the seller, so
 * people can buy while the seller is away. The gate counts purchases against
 * the number available, one at a time, so the last jar can't be sold twice.
 * A purchase is signed by the buyer, checked by the rules (agreement.take),
 * filed at the gate first — if the gate says sold out, nothing is kept — then
 * kept in the buyer's vault and sent to the seller sealed through the bellboy.
 */
import { checkReceipt, seal } from '@inqbeta/q-core/seal';
import { current, type Identity } from '@inqbeta/q-core/passkey';
import { isAgreementStep, takingId, type AgreementReceipt } from '@inqbeta/q-core/agreements';
import { saveLocked } from '@inqbeta/q-core/folder';
import { readHome } from '$lib/home';
import { keepStep, myInbox, sendTo } from '$lib/messages';
import { myCardDetails } from '$lib/mycard';
import { refreshLedger, type Ledger } from '$lib/ledger';
import type { Person } from '$lib/people';
import type { MintView } from '$lib/money';
import { takeStep } from '$lib/agreements';

export interface ShopListing {
	offer: AgreementReceipt;
	left: number;
}
export interface ShopWindow {
	seller: string;
	about: { name?: string; inbox?: string };
	listings: ShopListing[];
}

async function storage(): Promise<string | null> {
	const h = await readHome().catch(() => null);
	return h?.ok && h.services.storage ? h.services.storage.replace(/\/$/, '') : null;
}

const nameFrom = (card: Record<string, string>) => card['q:person/called'] || [card['q:person/first'], card['q:person/last']].filter(Boolean).join(' ') || '';

async function post(seller: string, body: unknown): Promise<{ ok: true } | { ok: false; says: string }> {
	const where = await storage();
	if (!where) return { ok: false, says: 'Q can’t find the storage just now. Try again in a moment.' };
	try {
		const res = await fetch(`${where}/shop/${encodeURIComponent(seller)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
		const out = (await res.json().catch(() => ({}))) as { ok?: boolean; says?: string };
		return res.ok && out.ok ? { ok: true } : { ok: false, says: out.says ?? `The storage said ${res.status}.` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The storage didn’t answer.' };
	}
}

/** Put your standing offer in your shop, with your name and where purchases should go. */
export async function publishListing(offer: AgreementReceipt, ledger: Ledger | null) {
	const me = current();
	if (!me || offer.did !== me.did) return { ok: false as const, says: 'Only your own offer goes in your shop.' };
	const about = { name: nameFrom(await myCardDetails(me, ledger)), inbox: (await myInbox(me))?.id ?? '' };
	return post(me.did, { receipt: offer, about });
}

/** Tell the shop about a step: a withdrawn listing, or a sale cancelled as sold out. */
export const tellShop = (seller: string, step: AgreementReceipt) => post(seller, step);

/** Someone's shop, as anyone sees it. Every offer's signature is checked here, not trusted. */
export async function readShop(seller: string): Promise<{ ok: true; shop: ShopWindow } | { ok: false; says: string }> {
	const where = await storage();
	if (!where) return { ok: false, says: 'Q can’t find the storage just now. Try again in a moment.' };
	try {
		const res = await fetch(`${where}/shop/${encodeURIComponent(seller)}`, { signal: AbortSignal.timeout(15_000) });
		if (!res.ok) return { ok: false, says: `Couldn’t open the shop (${res.status}).` };
		const raw = (await res.json()) as { about?: ShopWindow['about']; listings?: { offer: unknown; left: number }[] };
		const listings: ShopListing[] = [];
		for (const l of raw.listings ?? []) {
			const o = l.offer;
			if (isAgreementStep(o) && o.did === seller && o.content.step === 'proposed' && o.content.limit && (await checkReceipt(o)).ok) listings.push({ offer: o, left: Math.max(0, Math.trunc(Number(l.left) || 0)) });
		}
		return { ok: true, shop: { seller, about: raw.about ?? {}, listings } };
	} catch {
		return { ok: false, says: 'The shop couldn’t be read just now.' };
	}
}

/**
 * Buy: link up with the seller, sign the purchase, file it at the shop (which
 * holds the stock), keep it and send it. Returns the new agreement's id.
 */
export async function buy(
	identity: Identity,
	ledger: Ledger | null,
	shop: ShopWindow,
	listing: ShopListing,
	people: Person[],
	mint?: MintView | null
): Promise<{ ok: true; id: string; says?: string } | { ok: false; says: string }> {
	const offer = listing.offer;
	const terms = offer.content.terms;
	if (!terms) return { ok: false, says: 'That offer has no terms.' };
	const id = takingId(offer.content.agreement, crypto.randomUUID().slice(0, 8));
	const seller: Person = people.find((p) => p.did === shop.seller) ?? {
		did: shop.seller,
		name: shop.about.name || 'The seller',
		details: shop.about.name ? { 'q:person/called': shop.about.name } : {},
		cardName: 'Shop',
		inbox: shop.about.inbox || undefined,
		at: new Date().toISOString(),
		how: 'shop'
	};
	const out = await takeStep(identity, ledger, id, { step: 'taken', parent: offer.contentHash, terms: { ...terms, b: identity.did } }, [...people.filter((p) => p.did !== seller.did), { ...seller, inbox: seller.inbox ?? (shop.about.inbox || undefined) }], mint, {
		prior: [offer],
		stockLeft: listing.left,
		/* The shop holds the stock: if it's gone, nothing is kept. */
		before: async (signed) => {
			const told = await tellShop(shop.seller, signed);
			return told.ok ? null : told.says;
		}
	});
	if (!out.ok) return out;
	/* Keep the shop offer beside the purchase (so it reads whole), and link up so they know who you are. */
	await keepStep(offer);
	const people0 = people.some((p) => p.did === shop.seller);
	if (!people0) {
		const card = { schema: 'inqbeta.card-link/1', name: 'Shop', details: seller.details, ...(seller.inbox ? { inbox: seller.inbox } : {}), at: new Date().toISOString() };
		const record = { schema: 'inqbeta.linked/1', source: 'inqbeta:q/link', with: shop.seller, card, signed: null, at: new Date().toISOString() };
		await saveLocked('contacts', `linked-${shop.seller.slice(-16)}.json`, JSON.stringify(await seal(record), null, 2), 'application/json').catch(() => null);
		if (seller.inbox) await sendTo({ did: shop.seller, inbox: seller.inbox }, { kind: 'linked-back', card: await myCardDetails(identity, ledger) }).catch(() => null);
	}
	await refreshLedger();
	return { ok: true, id, says: out.says };
}

/** A link to your shop, to share any way you like. */
export const shopLink = (did: string) => `${location.origin}/shop/${encodeURIComponent(did)}`;
