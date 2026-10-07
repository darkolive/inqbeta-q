/*
 * Vouchers in the app (ADR-Q-044, build steps 3–4; 7 October 2026).
 *
 * A voucher's master is kept publicly at the storage gate, signed by its
 * issuer and named by its content hash, so its page (/v/<voucher>) and QR
 * code open for anyone. A paid voucher is sold through the issuer's shop: a
 * shop offer whose terms name it. Buying is the shop's own Buy: the credits
 * are held by agreement until the voucher is redeemed (voucher-sales.ts).
 */
import { checkReceipt } from '@inqbeta/q-core/seal';
import { isAgreementStep } from '@inqbeta/q-core/agreements';
import { checkVoucher, makeVoucher, type Voucher, type VoucherReceipt } from '@inqbeta/q-core/vouchers';
import { listingLimit, listingTerms } from '@inqbeta/q-core/voucher-sales';
import type { Identity } from '@inqbeta/q-core/passkey';
import { readHome } from '$lib/home';
import { newAgreementId, takeStep } from '$lib/agreements';
import { publishListing, type ShopListing, type ShopWindow } from '$lib/shop';
import type { Ledger } from '$lib/ledger';
import type { Person } from '$lib/people';
import type { MintView } from '$lib/money';

export type VoucherDraft = Omit<Voucher, 'schema' | 'source' | 'issuer' | 'at'>;

async function storage(): Promise<string | null> {
	const h = await readHome().catch(() => null);
	return h?.ok && h.services.storage ? h.services.storage.replace(/\/$/, '') : null;
}

/** The voucher's own address: its page, and what its QR code opens. */
export const voucherLink = (hash: string, origin = typeof location === 'undefined' ? '' : location.origin) => `${origin}/v/${encodeURIComponent(hash)}`;

/** The voucher a shop offer sells, by its name in the terms; null if it sells something else. */
export function voucherIn(listing: Pick<ShopListing, 'offer'>): string | null {
	const t = listing.offer.content.terms?.aGives;
	const m = t && 'thing' in t ? /\(([A-Za-z0-9_-]{43})\)$/.exec(t.thing) : null;
	return m?.[1] ?? null;
}

export async function publishVoucher(v: VoucherReceipt): Promise<{ ok: true } | { ok: false; says: string }> {
	const where = await storage();
	if (!where) return { ok: false, says: 'Q can’t find the storage just now. Try again in a moment.' };
	try {
		const r = await fetch(`${where}/voucher/${encodeURIComponent(v.contentHash)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v), signal: AbortSignal.timeout(15_000) });
		const out = (await r.json().catch(() => ({}))) as { ok?: boolean; says?: string };
		return r.ok && out.ok ? { ok: true } : { ok: false, says: out.says ?? `The storage said ${r.status}.` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The storage didn’t answer.' };
	}
}

export interface VoucherView {
	voucher: VoucherReceipt;
	/** Its shop offer, checked here, with how many are left; null if it isn't on sale. */
	listing: ShopListing | null;
	shop: ShopWindow | null;
}

/** A voucher, as anyone sees it. Its signature and its shop offer's are checked here, not trusted. */
export async function readVoucher(hash: string): Promise<{ ok: true; view: VoucherView } | { ok: false; says: string }> {
	const where = await storage();
	if (!where) return { ok: false, says: 'Q can’t find the storage just now. Try again in a moment.' };
	try {
		const r = await fetch(`${where}/voucher/${encodeURIComponent(hash)}`, { signal: AbortSignal.timeout(15_000) });
		if (r.status === 404) return { ok: false, says: 'There’s no voucher by that name here.' };
		if (!r.ok) return { ok: false, says: `Couldn’t open the voucher (${r.status}).` };
		const raw = (await r.json()) as { voucher?: unknown; listing?: { offer?: unknown; left?: number } | null; about?: ShopWindow['about'] };
		const v = raw.voucher as VoucherReceipt;
		const c = await checkVoucher(v);
		if (!c.ok || v.contentHash !== hash) return { ok: false, says: c.ok ? 'That isn’t the voucher asked for.' : c.says };
		const o = raw.listing?.offer;
		const listing = isAgreementStep(o) && o.did === v.content.issuer && o.content.step === 'proposed' && (await checkReceipt(o)).ok && voucherIn({ offer: o }) === hash ? { offer: o, left: Math.max(0, Math.trunc(Number(raw.listing?.left) || 0)) } : null;
		return { ok: true, view: { voucher: v, listing, shop: listing ? { seller: v.content.issuer, about: raw.about ?? {}, listings: [listing] } : null } };
	} catch {
		return { ok: false, says: 'The voucher couldn’t be read just now.' };
	}
}

/**
 * Sell a voucher: sign it, keep it at the storage, and put it in your shop at
 * its price, as many times as the edition allows (or `limit` for open ones).
 */
export async function sellVoucher(identity: Identity, ledger: Ledger | null, people: Person[], mint: MintView, draft: VoucherDraft, limit?: number): Promise<{ ok: true; hash: string; says?: string } | { ok: false; says: string }> {
	let v: VoucherReceipt;
	let count: number;
	try {
		v = await makeVoucher(identity, draft);
		count = listingLimit(v.content, limit);
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
	const kept = await publishVoucher(v);
	if (!kept.ok) return kept;
	const id = newAgreementId();
	const out = await takeStep(identity, ledger, id, { step: 'proposed', parent: null, terms: listingTerms(v, mint.mode), limit: count }, people, mint);
	if (!out.ok) return { ok: false, says: out.says };
	const put = await publishListing(out.signed, ledger);
	return { ok: true, hash: v.contentHash, ...(put.ok ? {} : { says: `The voucher is kept, but it isn’t in your shop yet: ${put.says}` }) };
}
