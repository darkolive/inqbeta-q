/*
 * Vouchers in the app (ADR-Q-044, build steps 3–4; 7 October 2026).
 *
 * A voucher's master is kept publicly at the storage gate, signed by its
 * issuer and named by its content hash, so its page (/v/<voucher>) and QR
 * code open for anyone. A paid voucher is sold through the issuer's shop: a
 * shop offer whose terms name it. Buying is the shop's own Buy: the credits
 * are held by agreement until the voucher is redeemed (voucher-sales.ts).
 */
import { checkReceipt, sealWith } from '@inqbeta/q-core/seal';
import { saveLocked } from '@inqbeta/q-core/folder';
import { toBase64 } from '@inqbeta/q-core/attachments';
import { isAgreementStep } from '@inqbeta/q-core/agreements';
import { acceptRedeem, askRedeem, checkVoucher, editionOf, hashHeld, issueCopy, makeVoucher, nextNumber, passOn, receive, type EditionState, type Holding, type Redemption, type Voucher, type VoucherHeld, type VoucherReceipt } from '@inqbeta/q-core/vouchers';
import { isSaleOf, listingLimit, listingTerms, releaseProblem, resaleOf, resaleReleaseProblem, resaleTerms, saleOf, type Resale, type Sale } from '@inqbeta/q-core/voucher-sales';
import { voucherIssueFacts, voucherMoveFacts, voucherRedeemFacts } from '@inqbeta/q-actions/core/vouchers';
import { sendTo } from '$lib/messages';
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
	/* A first sale names the voucher; a copy sold on adds which copy: "… (hash) #7". */
	const m = t && 'thing' in t ? /\(([A-Za-z0-9_-]{43})\)(?: #\d+)?$/.exec(t.thing) : null;
	return m?.[1] ?? null;
}

/** A picture for a voucher, ready to sign in: made smaller if it's big, as WebP, named by its SHA-256. */
export interface PreparedPicture {
	hash: string;
	type: string;
	bytes: Uint8Array;
	/** For showing it before it's kept: an object URL. */
	preview: string;
}
const MOST_SIDE = 1600;
export async function preparePicture(file: File): Promise<PreparedPicture> {
	if (!file.type.startsWith('image/')) throw new Error('That isn’t a picture.');
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MOST_SIDE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.82));
	if (!blob) throw new Error('That picture couldn’t be read.');
	const bytes = new Uint8Array(await blob.arrayBuffer());
	if (bytes.length > 2 * 1024 * 1024) throw new Error('That picture is still over 2 MB once made smaller. Try another.');
	const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
	return { hash, type: blob.type || 'image/webp', bytes, preview: URL.createObjectURL(blob) };
}

export async function publishVoucher(v: VoucherReceipt, pictures: PreparedPicture[] = []): Promise<{ ok: true } | { ok: false; says: string }> {
	const where = await storage();
	if (!where) return { ok: false, says: 'Q can’t find the storage just now. Try again in a moment.' };
	try {
		const body = pictures.length ? { voucher: v, pictures: Object.fromEntries(pictures.map((p) => [p.hash, toBase64(p.bytes)])) } : v;
		const r = await fetch(`${where}/voucher/${encodeURIComponent(v.contentHash)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
		const out = (await r.json().catch(() => ({}))) as { ok?: boolean; says?: string };
		return r.ok && out.ok ? { ok: true } : { ok: false, says: out.says ?? `The storage said ${r.status}.` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The storage didn’t answer.' };
	}
}

export interface VoucherView {
	voucher: VoucherReceipt;
	/** Where its pictures are: add the picture's hash. */
	pictureBase: string;
	/** Every copy and redemption the storage holds, as given; `edition` is what holds of them, checked here. */
	copies: VoucherHeld[];
	redemptions: Redemption[];
	edition: EditionState;
	/** Copies passed on and not yet signed for, by number: the holder waits for the receiver. */
	passing: Record<number, VoucherHeld>;
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
		const passing: Record<number, VoucherHeld> = {};
		for (const h of edition.holdings) {
			const latest = await hashHeld(h.latest);
			const next = copies.find((c) => c.previous === latest && c.number === h.number && !c.signatures.some((g) => g.by === 'holder'));
			if (next) passing[h.number] = next;
		}
		return { ok: true, view: { voucher: v, passing, pictureBase: `${where}/voucher/${encodeURIComponent(hash)}/picture/`, copies, redemptions, edition, listing, shop: listing ? { seller: v.content.issuer, about: raw.about ?? {}, listings: [listing] } : null } };
	} catch {
		return { ok: false, says: 'The voucher couldn’t be read just now.' };
	}
}

/**
 * Sell a voucher: sign it, keep it at the storage, and put it in your shop at
 * its price, as many times as the edition allows (or `limit` for open ones).
 */
export async function sellVoucher(identity: Identity, ledger: Ledger | null, people: Person[], mint: MintView, draft: VoucherDraft, limit?: number, pictures: PreparedPicture[] = []): Promise<{ ok: true; hash: string; says?: string } | { ok: false; says: string }> {
	let v: VoucherReceipt;
	let count: number;
	try {
		v = await makeVoucher(identity, draft);
		count = listingLimit(v.content, limit);
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
	const kept = await publishVoucher(v, pictures);
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
		if (!out.ok) return out;
		/* A note in your vault, so it's under Your vouchers even when it came as a gift, with no agreement behind it. */
		const note = await sealWith(identity, { schema: HELD_NOTE_SCHEMA, source: 'inqbeta:q/vouchers', voucher: view.voucher.contentHash, title: view.voucher.content.title, number: copy.number, from: copy.from, at: new Date().toISOString() });
		await saveLocked('vouchers', `held-${view.voucher.contentHash.slice(0, 16)}-${copy.number}.json`, JSON.stringify(note, null, 2), 'application/json').catch(() => null);
		return { ok: true, says: `Copy ${copy.number} is yours.` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** The holder asks to redeem it with its issuer. */
export async function askToRedeem(identity: Identity, view: VoucherView, h: Holding, with_?: { provider: Person; forKind: string }): Promise<Done> {
	try {
		const redeemer = with_?.provider.did ?? view.voucher.content.issuer;
		const asked = await askRedeem(h, signerFor(identity), { redeemer, forKind: with_?.forKind ?? 'itself' });
		const out = await postMove(view.voucher.contentHash, 'redeemed', asked);
		if (!out.ok) return out;
		/* A provider under a grant needs to know: tell them where to sign. */
		if (with_?.provider.inbox) await sendTo(with_.provider, { kind: 'message', text: `I’d like to use a voucher with you for ${with_.forKind}: ${view.voucher.content.title}. Open it to honour it: ${voucherLink(view.voucher.contentHash)}` }).catch(() => null);
		return { ok: true, says: with_ ? `Asked. When ${with_.provider.name} has given you the ${with_.forKind}, they sign too, and the bank pays them.` : 'Asked. When you have it, the issuer signs too.' };
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
		if (!out.ok) return out;
		/* A given voucher: the bank pays whoever honoured it from what's held behind it. */
		if (!v.content.price.paid && v.content.price.from === 'credits') {
			const paid = await mintVouchers({ pay: r });
			return paid.ok ? { ok: true, says: `Redeemed. ${paid.says}` } : { ok: false, says: `Redeemed, but the bank didn’t pay yet: ${paid.says} Try again from this page.` };
		}
		return { ok: true, says: 'Redeemed. Now settle the sale, and the credits held come to you.' };
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

/* ---- Your vouchers, from your own agreements and notes (step 5) ---- */

export const HELD_NOTE_SCHEMA = 'inqbeta.voucher-held-note/1';

export interface MyVoucher {
	hash: string;
	title: string;
	as: 'bought' | 'selling' | 'given' | 'giving';
	/** The other side: who you bought it from. */
	with: string;
	agreement: string;
	at: string;
	/** Bought: still held for it (agreed), settled (complete) or cancelled (ended). */
	phase: string;
}

/** The vouchers you've bought, and the ones you sell in your shop: read from your agreements, newest first. */
export function myVouchers(ledger: Ledger | null, me: string): MyVoucher[] {
	const out: MyVoucher[] = [];
	for (const a of agreementsFrom(ledger)) {
		const t = a.standing.terms;
		const thing = t && 'thing' in t.aGives ? t.aGives.thing : '';
		const m = /^Voucher: (.*) \(([A-Za-z0-9_-]{43})\)( #\d+)?$/.exec(thing);
		if (!t || !m) continue;
		/* Your own copy, put up for sale: it's already under Yours. */
		if (a.listing && m[3]) continue;
		if (a.listing && t.a === me) out.push({ hash: m[2], title: m[1], as: 'selling', with: '', agreement: a.id, at: a.at, phase: a.standing.phase });
		else if (!a.listing && t.b === me) out.push({ hash: m[2], title: m[1], as: 'bought', with: t.a, agreement: a.id, at: a.at, phase: a.standing.phase });
	}
	/* Grants you give: your own note, kept when you made it. */
	for (const r of ledger?.receipts ?? []) {
		const j = r.json as { did?: string; content?: { schema?: string; voucher?: string; title?: string; at?: string } } | undefined;
		const c = j?.content;
		if (c?.schema !== GIVING_NOTE_SCHEMA || j?.did !== me || !c.voucher) continue;
		out.push({ hash: c.voucher, title: c.title ?? 'A grant', as: 'giving', with: '', agreement: `giving-${c.voucher}`, at: c.at ?? '', phase: 'giving' });
	}
	/* Copies given to you: your own signed note, kept when you signed for one. Bought ones are already listed. */
	for (const r of ledger?.receipts ?? []) {
		const j = r.json as { did?: string; content?: { schema?: string; voucher?: string; title?: string; from?: string; at?: string } } | undefined;
		const c = j?.content;
		if (c?.schema !== HELD_NOTE_SCHEMA || j?.did !== me || !c.voucher || out.some((x) => x.hash === c.voucher)) continue;
		out.push({ hash: c.voucher, title: c.title ?? 'A voucher', as: 'given', with: c.from ?? '', agreement: `note-${c.voucher}`, at: c.at ?? '', phase: 'held' });
	}
	return out.sort((x, y) => y.at.localeCompare(x.at));
}

/** Give your copy to someone you know: signed by you, checked by voucher.move; they sign for it, and Q tells them where. */
export async function giveTo(identity: Identity, view: VoucherView, h: Holding, to: Person): Promise<Done> {
	const v = view.voucher;
	try {
		const next = await passOn(h.latest, v, signerFor(identity), { to: to.did, how: 'given' });
		const facts = await voucherMoveFacts(v, next, view.copies, view.redemptions, { by: identity.did });
		const no = refused(await decide(await actionHash('voucher.move'), { principal: { type: 'Person', id: identity.did }, resource: { type: 'Voucher', id: v.contentHash }, facts }));
		if (no) return { ok: false, says: no };
		const out = await postMove(v.contentHash, 'copy', next);
		if (!out.ok) return out;
		const told = to.inbox ? await sendTo(to, { kind: 'message', text: `I’ve given you a voucher: ${v.content.title}. Open it to sign for it: ${voucherLink(v.contentHash)}` }) : null;
		return { ok: true, says: `Given to ${to.name}. It’s theirs once they sign for it${told?.ok ? ': Q has told them.' : '. Send them the voucher’s link.'}` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/* ---- Step 6: given vouchers, a grant (ADR-Q-044 §7) ---- */

async function mintVouchers(body: unknown): Promise<Done> {
	try {
		const r = await fetch('/api/vouchers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const out = (await r.json().catch(() => ({}))) as { ok?: boolean; says?: string };
		return r.ok && out.ok ? { ok: true, says: out.says ?? 'Done.' } : { ok: false, says: out.says ?? `The bank said ${r.status}.` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The bank didn’t answer.' };
	}
}

/** Where each given copy stands in the bank's books: held, paid to a provider, or returned. */
export async function givenFromBank(hash: string): Promise<Map<number, { state: 'held' | 'paid' | 'returned'; credits: number; to?: string }>> {
	const r = await fetch(`/api/vouchers?voucher=${encodeURIComponent(hash)}`).catch(() => null);
	const j = r?.ok ? ((await r.json().catch(() => null)) as { copies?: { number: number; state: 'held' | 'paid' | 'returned'; credits: number; to?: string }[] } | null) : null;
	return new Map((j?.copies ?? []).map((c) => [c.number, c]));
}

export const GIVING_NOTE_SCHEMA = 'inqbeta.voucher-giving-note/1';

/** Make a grant: sign the voucher, keep it at the node, and a note in your vault so it's under Your vouchers. No shop: it's given, not sold. */
export async function makeGrant(identity: Identity, draft: VoucherDraft, pictures: PreparedPicture[] = []): Promise<{ ok: true; hash: string } | { ok: false; says: string }> {
	let v: VoucherReceipt;
	try {
		v = await makeVoucher(identity, draft);
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
	const kept = await publishVoucher(v, pictures);
	if (!kept.ok) return kept;
	const note = await sealWith(identity, { schema: GIVING_NOTE_SCHEMA, source: 'inqbeta:q/vouchers', voucher: v.contentHash, title: v.content.title, at: new Date().toISOString() });
	await saveLocked('vouchers', `giving-${v.contentHash.slice(0, 16)}.json`, JSON.stringify(note, null, 2), 'application/json').catch(() => null);
	return { ok: true, hash: v.contentHash };
}

/** The giver hands a copy to someone who qualifies: the bank holds its worth first, then the copy goes to the node, and Q tells them. */
export async function giveGrant(identity: Identity, view: VoucherView, to: Person): Promise<Done> {
	const v = view.voucher;
	const out0 = view.copies.filter((c) => c.previous === null && c.from === v.content.issuer).map((c) => ({ number: c.number }));
	const number = nextNumber({ of: view.edition.of, holdings: [...view.edition.holdings, ...out0] as Holding[] });
	if (number === null) return { ok: false, says: 'They’ve all been given.' };
	try {
		const copy = await issueCopy(signerFor(identity), v, { number, holder: to.did, via: 'grant' });
		const facts = await voucherIssueFacts(v, copy, view.copies, { by: identity.did, eligible: true });
		const no = refused(await decide(await actionHash('voucher.issue'), { principal: { type: 'Person', id: identity.did }, resource: { type: 'Voucher', id: v.contentHash }, facts }));
		if (no) return { ok: false, says: no };
		const held = await mintVouchers({ give: copy });
		if (!held.ok) return held;
		const out = await postMove(v.contentHash, 'copy', copy);
		if (!out.ok) return { ok: false, says: `The bank holds the credits, but the node didn’t take the copy: ${out.says}` };
		const told = to.inbox ? await sendTo(to, { kind: 'message', text: `You’ve been given a voucher: ${v.content.title}. Open it to sign for it: ${voucherLink(v.contentHash)}` }) : null;
		return { ok: true, says: `${held.says} Given to ${to.name}${told?.ok ? ': Q has told them.' : '. Send them the voucher’s link.'}` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** After it ends: what's still held behind a copy goes back to the giver. */
export const returnUnspent = (hash: string, number: number) => mintVouchers({ return: { voucher: hash, number } });

/* ---- Selling a copy on (ADR-Q-044 §5) ---- */

export interface ResaleView {
	agreement: AgreementView;
	resale: Resale;
}

/** Copies of this voucher sold on, in your own agreements: as seller or buyer. */
export function resalesOf(view: VoucherView, ledger: Ledger | null): ResaleView[] {
	return agreementsFrom(ledger)
		.filter((a) => !a.listing)
		.map((a) => ({ agreement: a, resale: resaleOf(view.voucher, a.standing, view.copies, view.edition.holdings) }))
		.filter((x): x is ResaleView => !!x.resale)
		.sort((x, y) => y.agreement.at.localeCompare(x.agreement.at));
}

/** Put your copy up for sale in your shop, once, within the issuer's limit. Returns your shop's link to share. */
export async function sellOn(identity: Identity, ledger: Ledger | null, people: Person[], mint: MintView, view: VoucherView, h: Holding, credits: number): Promise<{ ok: true; says: string; link: string } | { ok: false; says: string }> {
	try {
		const terms = resaleTerms(view.voucher, { holder: identity.did, number: h.number, credits, mode: mint.mode, mint: mint.mint });
		const out = await takeStep(identity, ledger, newAgreementId(), { step: 'proposed', parent: null, terms, limit: 1 }, people, mint);
		if (!out.ok) return { ok: false, says: out.says };
		const put = await publishListing(out.signed, ledger);
		const link = `${location.origin}/shop/${encodeURIComponent(identity.did)}`;
		return put.ok ? { ok: true, says: `Copy ${h.number} is in your shop for ${credits} credits. Share your shop’s link.`, link } : { ok: false, says: `Kept, but not in your shop yet: ${put.says}` };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** The seller hands the copy over to whoever bought it: passed on, sold, naming the sale; checked by voucher.move. */
export async function handOver(identity: Identity, view: VoucherView, x: ResaleView, people: Person[]): Promise<Done> {
	const v = view.voucher;
	const h = view.edition.holdings.find((k) => k.number === x.resale.number);
	if (!h || h.holder !== identity.did) return { ok: false, says: 'You don’t hold that copy now.' };
	try {
		const next = await passOn(h.latest, v, signerFor(identity), { to: x.resale.buyer, how: 'sold', price: x.resale.credits, via: x.agreement.id });
		const facts = await voucherMoveFacts(v, next, view.copies, view.redemptions, { by: identity.did });
		const no = refused(await decide(await actionHash('voucher.move'), { principal: { type: 'Person', id: identity.did }, resource: { type: 'Voucher', id: v.contentHash }, facts }));
		if (no) return { ok: false, says: no };
		const out = await postMove(v.contentHash, 'copy', next);
		if (!out.ok) return out;
		const buyer = people.find((p) => p.did === x.resale.buyer);
		if (buyer?.inbox) await sendTo(buyer, { kind: 'message', text: `I’ve handed over the voucher you bought: ${v.content.title}, copy ${x.resale.number}. Open it to sign for it: ${voucherLink(v.contentHash)}` }).catch(() => null);
		return { ok: true, says: 'Handed over. Once they sign for it, you both settle.' };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Settle a resale once the buyer has the copy: sign the release, or confirm the other side's. */
export async function releaseResale(identity: Identity, ledger: Ledger | null, people: Person[], mint: MintView | null, x: ResaleView): Promise<Done> {
	const st = x.agreement.standing;
	const entries = st.pending ? st.pending.entries : (x.resale.release ?? []);
	const why = resaleReleaseProblem(x.resale, entries);
	if (why) return { ok: false, says: why };
	if (st.pending?.by === identity.did) return { ok: false, says: 'You’ve signed it: it waits for the other side.' };
	const out = await takeStep(identity, ledger, x.agreement.id, { step: 'settled', parent: st.pending?.hash ?? st.lastHash ?? null, entries }, people, mint);
	return out.ok ? { ok: true, says: st.pending ? 'Settled: the credits are paid over.' : 'Signed. It waits for the other side to sign the same.' } : { ok: false, says: out.says };
}
