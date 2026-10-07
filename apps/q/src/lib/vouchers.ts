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
import { acceptRedeem, askRedeem, checkVoucher, editionOf, issueCopy, makeVoucher, nextNumber, receive, type EditionState, type Holding, type Redemption, type Voucher, type VoucherHeld, type VoucherReceipt } from '@inqbeta/q-core/vouchers';
import { isSaleOf, listingLimit, listingTerms, releaseProblem, saleOf, type Sale } from '@inqbeta/q-core/voucher-sales';
import { voucherIssueFacts, voucherRedeemFacts } from '@inqbeta/q-actions/core/vouchers';
import { signerFor, type Identity } from '@inqbeta/q-core/passkey';
import { actionHash, decide } from '$lib/actions/engine';
import { readHome } from '$lib/home';
import { agreementsFrom, newAgreementId, takeStep, type AgreementView } from '$lib/agreements';
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
	/** Every copy and redemption the storage holds, as given; `edition` is what holds of them, checked here. */
	copies: VoucherHeld[];
	redemptions: Redemption[];
	edition: EditionState;
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
		const raw = (await r.json()) as { voucher?: unknown; listing?: { offer?: unknown; left?: number } | null; about?: ShopWindow['about']; copies?: VoucherHeld[]; redemptions?: Redemption[] };
		const v = raw.voucher as VoucherReceipt;
		const c = await checkVoucher(v);
		if (!c.ok || v.contentHash !== hash) return { ok: false, says: c.ok ? 'That isn’t the voucher asked for.' : c.says };
		const o = raw.listing?.offer;
		const listing = isAgreementStep(o) && o.did === v.content.issuer && o.content.step === 'proposed' && (await checkReceipt(o)).ok && voucherIn({ offer: o }) === hash ? { offer: o, left: Math.max(0, Math.trunc(Number(raw.listing?.left) || 0)) } : null;
		const copies = (raw.copies ?? []).filter((x) => x?.voucher === hash);
		const redemptions = (raw.redemptions ?? []).filter((x) => x?.voucher === hash);
		const edition = await editionOf(v, copies, redemptions);
		return { ok: true, view: { voucher: v, copies, redemptions, edition, listing, shop: listing ? { seller: v.content.issuer, about: raw.about ?? {}, listings: [listing] } : null } };
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

/* ---- Step 5: handing out, signing for, redeeming, releasing ---- */

type Done = { ok: true; says: string } | { ok: false; says: string };

async function postMove(hash: string, kind: 'copy' | 'redeemed', x: unknown): Promise<Done> {
	const where = await storage();
	if (!where) return { ok: false, says: 'Q can’t find the storage just now. Try again in a moment.' };
	try {
		const r = await fetch(`${where}/voucher/${encodeURIComponent(hash)}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(x), signal: AbortSignal.timeout(15_000) });
		const out = (await r.json().catch(() => ({}))) as { ok?: boolean; says?: string };
		return r.ok && out.ok ? { ok: true, says: 'Kept.' } : { ok: false, says: out.says ?? `The storage said ${r.status}.` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The storage didn’t answer.' };
	}
}

export interface SaleView {
	agreement: AgreementView;
	sale: Sale;
	/** A first copy naming this sale, received or not. */
	copy: VoucherHeld | null;
}

/** The sales of this voucher in your own agreements: as its issuer, or as a buyer. */
export function salesOf(view: VoucherView, ledger: Ledger | null): SaleView[] {
	const v = view.voucher;
	return agreementsFrom(ledger)
		.filter((a) => !a.listing && isSaleOf(v, a.standing))
		.map((a) => {
			const copy = view.copies.find((c) => c.previous === null && c.via === a.id) ?? null;
			return { agreement: a, sale: saleOf(v, a.standing, view.edition.holdings, { issuedTo: !!copy })!, copy };
		})
		.filter((x) => !!x.sale)
		.sort((x, y) => y.agreement.at.localeCompare(x.agreement.at));
}

/** Copies handed to you that you haven't signed for yet. */
export const waitingForMe = (view: VoucherView, me: string) => view.copies.filter((c) => c.holder === me && !c.signatures.some((g) => g.by === 'holder'));

const refused = (d: { holds: boolean; because: string[] }) => (d.holds ? null : d.because.join(' '));

/** The issuer hands the buyer their copy: the next number, naming the sale; checked by voucher.issue. */
export async function handOut(identity: Identity, view: VoucherView, s: SaleView): Promise<Done> {
	const v = view.voucher;
	/* Numbers already handed out count, received or not. */
	const out0 = view.copies.filter((c) => c.previous === null && c.from === v.content.issuer).map((c) => ({ number: c.number }));
	const number = nextNumber({ of: view.edition.of, holdings: [...view.edition.holdings, ...out0] as Holding[] });
	if (number === null) return { ok: false, says: 'The edition has all been handed out.' };
	try {
		const copy = await issueCopy(signerFor(identity), v, { number, holder: s.sale.buyer, via: s.agreement.id });
		const facts = await voucherIssueFacts(v, copy, view.copies, { by: identity.did, sales: [s.agreement.standing] });
		const no = refused(await decide(await actionHash('voucher.issue'), { principal: { type: 'Person', id: identity.did }, resource: { type: 'Voucher', id: v.contentHash }, facts }));
		if (no) return { ok: false, says: no };
		const out = await postMove(v.contentHash, 'copy', copy);
		return out.ok ? { ok: true, says: `Copy ${number} handed out. They sign for it next.` } : out;
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** The holder signs for a copy handed to them. */
export async function signFor(identity: Identity, view: VoucherView, copy: VoucherHeld): Promise<Done> {
	try {
		const out = await postMove(view.voucher.contentHash, 'copy', await receive(copy, signerFor(identity)));
		return out.ok ? { ok: true, says: `Copy ${copy.number} is yours.` } : out;
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** The holder asks to redeem it with its issuer. */
export async function askToRedeem(identity: Identity, view: VoucherView, h: Holding): Promise<Done> {
	try {
		const out = await postMove(view.voucher.contentHash, 'redeemed', await askRedeem(h, signerFor(identity), { redeemer: view.voucher.content.issuer, forKind: 'itself' }));
		return out.ok ? { ok: true, says: 'Asked. When you have it, the issuer signs too.' } : out;
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Whoever honours it signs the redemption: checked by voucher.redeem. */
export async function honour(identity: Identity, view: VoucherView, asked: Redemption): Promise<Done> {
	const v = view.voucher;
	try {
		const r = await acceptRedeem(asked, signerFor(identity));
		const others = view.redemptions.filter((x) => x !== asked);
		const facts = await voucherRedeemFacts(v, r, view.copies, others, { by: identity.did });
		const no = refused(await decide(await actionHash('voucher.redeem'), { principal: { type: 'Person', id: identity.did }, resource: { type: 'Voucher', id: v.contentHash }, facts }));
		if (no) return { ok: false, says: no };
		const out = await postMove(v.contentHash, 'redeemed', r);
		return out.ok ? { ok: true, says: 'Redeemed. Now settle the sale, and the credits held come to you.' } : out;
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Settle the sale once it's redeemed: sign the release, or confirm the other side's. */
export async function release(identity: Identity, ledger: Ledger | null, people: Person[], mint: MintView | null, s: SaleView): Promise<Done> {
	const st = s.agreement.standing;
	const entries = st.pending ? st.pending.entries : (s.sale.release ?? []);
	const why = releaseProblem(s.sale, entries);
	if (why) return { ok: false, says: why };
	if (st.pending?.by === identity.did) return { ok: false, says: 'You’ve signed it: it waits for the other side.' };
	const out = await takeStep(identity, ledger, s.agreement.id, { step: 'settled', parent: st.pending?.hash ?? st.lastHash ?? null, entries }, people, mint);
	return out.ok ? { ok: true, says: st.pending ? 'Settled: the credits held are paid over.' : 'Signed. It waits for the other side to sign the same.' } : { ok: false, says: out.says };
}
