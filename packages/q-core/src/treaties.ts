/*
 * Treaties and settlement (ADR-Q-042), 6 October 2026: E1–E3.
 *
 *   banking card   where a federation is paid: signed by its key, only the last
 *                  four digits shown, the full details kept as a fingerprint.
 *                  The details go to a treaty partner sealed to its key alone.
 *   treaty         why two federations join (ethics, connections offered and
 *                  sought), both banking cards, the rate (par in one currency,
 *                  a named published source across two), the most of each
 *                  other's credits either will hold, and how often they
 *                  settle. Signed by each federation's key and a mandate
 *                  holder, in role. It counts only with both sides.
 *   settlement     swap first: each hands back the other's credits, which are
 *                  cancelled; only the difference is paid, to the banking card
 *                  the treaty names. One record both sides sign; the entries
 *                  must balance.
 *   standing       in force, or suspended (a period closed unsettled; a
 *                  partner's drift over 20% or books unreconciled for over 30
 *                  days), or ended.
 *
 * Amounts are in minor units (pence, cents) of each mint's own currency: one
 * credit is one unit of it (ADR-Q-042 §3).
 *
 * Pure: no storage, no window. Not legal, financial or tax advice.
 */
import { canonical, sha256, unb64url } from './canonical';
import { publicKeyFrom, toDid } from './did';
import { checkReceipt, sealTo, sealWith, type SealedReceipt, type SealedToPeople, type Signer } from './seal';
import type { Identity } from './passkey';
import { isCurrency, minorPerCredit } from './currency';
import { DRIFT_VALVE, DRIFT_WARN, UNRECONCILED_DAYS } from './mint';

const DAY = 86_400_000;
type Check = { ok: true; says: string } | { ok: false; says: string };
type Signature = { by: string; did: string; signature: string };

async function verify(did: string, doc: unknown, signature: string): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(signature), new TextEncoder().encode(canonical(doc)));
	} catch {
		return false;
	}
}
const unsigned = <T extends { signatures: Signature[] }>(x: T) => {
	const { signatures: _s, ...rest } = x;
	return rest;
};

/* ---------------------------------------------------------------- E1 -- */

export const BANKING_CARD_SCHEMA = 'inqbeta.banking-card/1';
export const BANKING_DETAILS_SCHEMA = 'inqbeta.banking-details/1';

export interface BankDetails {
	/** The name on the account. */
	name: string;
	sortCode: string;
	account: string;
}
export interface BankingCard {
	schema: typeof BANKING_CARD_SCHEMA;
	source: 'inqbeta:q/treaties';
	federation: string;
	/** The currency it's paid in: its mint's. */
	currency: string;
	ends: string;
	/** SHA-256 of the full details, never the details. */
	fingerprint: string;
	/** The card it replaces, by content hash; null for the first. */
	replaces: string | null;
	at: string;
}
export type BankingCardReceipt = SealedReceipt & { content: BankingCard };

const cleanDetails = (d: BankDetails): BankDetails => ({ name: d.name.trim().replace(/\s+/g, ' '), sortCode: d.sortCode.replace(/\D/g, ''), account: d.account.replace(/\s/g, '').toUpperCase() });
export const detailsFingerprint = async (d: BankDetails) => sha256(canonical(cleanDetails(d)));

export function detailsProblem(d: BankDetails): string | null {
	const c = cleanDetails(d);
	if (!c.name) return 'Give the name on the account.';
	if (!/^\d{6}$/.test(c.sortCode) && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(c.account)) return 'A sort code is six numbers (or give an IBAN as the account).';
	if (!/^\d{8}$/.test(c.account) && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(c.account)) return 'An account number is eight numbers, or an IBAN.';
	return null;
}

/** The federation signs its banking card. Only the last four digits and a fingerprint go in it. */
export async function makeBankingCard(federation: Pick<Identity, 'did' | 'publicKey' | 'signing'>, d: BankDetails, o: { currency: string; replaces?: string | null }, now = new Date()): Promise<BankingCardReceipt> {
	const p = detailsProblem(d);
	if (p) throw new Error(p);
	if (!isCurrency(o.currency)) throw new Error('Name the currency it’s paid in.');
	const c = cleanDetails(d);
	const content: BankingCard = {
		schema: BANKING_CARD_SCHEMA,
		source: 'inqbeta:q/treaties',
		federation: federation.did,
		currency: o.currency,
		ends: c.account.slice(-4),
		fingerprint: await detailsFingerprint(c),
		replaces: o.replaces ?? null,
		at: now.toISOString()
	};
	return (await sealWith(federation, content)) as BankingCardReceipt;
}

export async function checkBankingCard(x: unknown, federation?: string): Promise<Check> {
	const r = x as BankingCardReceipt;
	const c = r?.content;
	if (c?.schema !== BANKING_CARD_SCHEMA || !/^[A-Z0-9]{4}$/.test(c.ends ?? '') || typeof c.fingerprint !== 'string') return { ok: false, says: 'This isn’t a banking card.' };
	if (r.did !== c.federation || !(await checkReceipt(r)).ok) return { ok: false, says: 'The federation’s key didn’t sign this banking card.' };
	if (federation && c.federation !== federation) return { ok: false, says: 'It’s another federation’s banking card.' };
	return { ok: true, says: `Paid to the account ending ${c.ends}.` };
}

/** The full details, sealed to the partner (and to the federation itself), naming the card they belong to. */
export async function sealDetailsFor(card: BankingCardReceipt, d: BankDetails, partner: string): Promise<SealedToPeople> {
	if ((await detailsFingerprint(d)) !== card.content.fingerprint) throw new Error('These details aren’t the ones on the card.');
	const { sealed } = await sealTo({ schema: BANKING_DETAILS_SCHEMA, card: card.contentHash, ...cleanDetails(d) }, [partner, card.content.federation], 'banking-details');
	return sealed;
}

/** Opened details hold only if they match the card's fingerprint: a changed account can't arrive as a message. */
export async function detailsMatch(opened: unknown, card: BankingCardReceipt): Promise<Check> {
	const o = opened as BankDetails & { schema?: string; card?: string };
	if (o?.schema !== BANKING_DETAILS_SCHEMA || o.card !== card.contentHash) return { ok: false, says: 'These details are for another card.' };
	if ((await detailsFingerprint(o)) !== card.content.fingerprint) return { ok: false, says: 'These details don’t match the card. Don’t pay them.' };
	return { ok: true, says: `They match the card ending ${card.content.ends}.` };
}

/** The current card from a federation's history: the newest that holds and whose chain of replacements is whole. */
export async function currentBankingCard(cards: unknown[], federation: string): Promise<BankingCardReceipt | null> {
	const ok: BankingCardReceipt[] = [];
	for (const c of cards) if ((await checkBankingCard(c, federation)).ok) ok.push(c as BankingCardReceipt);
	const hashes = new Set(ok.map((c) => c.contentHash));
	const replaced = new Set(ok.map((c) => c.content.replaces).filter(Boolean));
	return ok.filter((c) => (c.content.replaces === null || hashes.has(c.content.replaces)) && !replaced.has(c.contentHash)).sort((a, b) => b.content.at.localeCompare(a.content.at))[0] ?? null;
}

/* ---------------------------------------------------------------- E2 -- */

export const TREATY_SCHEMA = 'inqbeta.treaty/1';
export const PERIODS = [1, 3, 7, 30] as const;
export type Period = (typeof PERIODS)[number];
/** Published reference rates a treaty may name across currencies. */
export const RATE_SOURCES = [
	{ id: 'boe', called: 'Bank of England daily spot rates' },
	{ id: 'ecb', called: 'European Central Bank euro reference rates' }
] as const;
export type RateSource = (typeof RATE_SOURCES)[number]['id'];
export const NOTICE_DAYS = 30;

export interface Side {
	federation: string;
	name: string;
	/** Its mint's DID. */
	mint: string;
	currency: string;
	mode: 'test' | 'live';
	/** Its banking card, by content hash. */
	bankingCard: string;
}
export interface Purpose {
	/** Principles both sides hold. */
	ethics: string[];
	/** What each brings, and what each is looking for. */
	offered: string[];
	sought: string[];
}
export interface TreatyStatement {
	schema: typeof TREATY_SCHEMA;
	event: 'treaty.propose' | 'treaty.vary';
	a: Side;
	b: Side;
	purpose: Purpose;
	/** Par in one currency; across two, a named published source on the day. */
	rate: { kind: 'par' } | { kind: 'source'; source: RateSource };
	/** The most of the other's credits either side holds between settlements, and optionally as a share of the holder's own reserve. */
	cap: { credits: number; shareOfReserve?: number };
	/** Days between settlements. */
	period: Period;
	/** Services excluded; none means everything. */
	excludes: string[];
	/** A fixed end, or open-ended (either side ends it on 30 days’ notice). */
	until: string | null;
	/** The treaty this varies, by hash; null for a new one. */
	varies: string | null;
	/** Who proposed it: 'a'. */
	at: string;
}
/** Each side signs twice: its federation's key, and the mandate holder (caretaker or treasurer) who signs for it. */
export type TreatySignature = Signature & { side: 'a' | 'b'; office?: string };
export type Treaty = TreatyStatement & { signatures: TreatySignature[] };

const short = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).slice(0, 12);

export function termsProblem(t: Omit<TreatyStatement, 'schema' | 'event' | 'at' | 'varies'>): string | null {
	if (t.a.federation === t.b.federation) return 'A treaty is between two federations.';
	if (t.a.mode !== t.b.mode) return 'Test and live never mix: a test mint treats only with test mints.';
	if (!isCurrency(t.a.currency) || !isCurrency(t.b.currency)) return 'Each side names its mint’s currency.';
	if (t.a.currency === t.b.currency && t.rate.kind !== 'par') return 'In one currency a credit is a credit: the rate is par.';
	if (t.a.currency !== t.b.currency) {
		const r = t.rate;
		if (r.kind !== 'source' || !RATE_SOURCES.some((s) => s.id === r.source)) return 'Across two currencies, name the published rate it uses on the day.';
	}
	if (!Number.isInteger(t.cap.credits) || t.cap.credits <= 0) return 'Say the most of each other’s credits either side will hold.';
	if (t.cap.shareOfReserve !== undefined && !(t.cap.shareOfReserve > 0 && t.cap.shareOfReserve <= 1)) return 'A share of the reserve is between 0 and 100%.';
	if (!PERIODS.includes(t.period)) return 'Settle daily, every 3, 7 or 30 days.';
	if (!t.a.bankingCard || !t.b.bankingCard) return 'Each side’s banking card goes in the treaty.';
	return null;
}

export const hasPurpose = (p: Purpose) => !!(p.ethics.length || p.offered.length || p.sought.length);

/** Side A proposes: its federation's key and its mandate holder sign. */
export async function proposeTreaty(
	federation: Signer,
	holder: Signer,
	office: string,
	t: Omit<TreatyStatement, 'schema' | 'event' | 'at' | 'varies'> & { varies?: string | null },
	now = new Date()
): Promise<Treaty> {
	const p = termsProblem(t);
	if (p) throw new Error(p);
	if (toDid(federation.did) !== t.a.federation) throw new Error('Side A proposes, with its own key.');
	const st: TreatyStatement = {
		schema: TREATY_SCHEMA,
		event: t.varies ? 'treaty.vary' : 'treaty.propose',
		a: t.a,
		b: t.b,
		purpose: { ethics: short(t.purpose.ethics), offered: short(t.purpose.offered), sought: short(t.purpose.sought) },
		rate: t.rate,
		cap: t.cap,
		period: t.period,
		excludes: short(t.excludes),
		until: t.until,
		varies: t.varies ?? null,
		at: now.toISOString()
	};
	return {
		...st,
		signatures: [
			{ side: 'a', by: 'federation', did: st.a.federation, signature: await federation.signCanonical(st) },
			{ side: 'a', by: 'holder', office, did: toDid(holder.did), signature: await holder.signCanonical(st) }
		]
	};
}

/** Side B agrees to exactly what A signed: its key and its mandate holder. */
export async function agreeTreaty(t: Treaty, federation: Signer, holder: Signer, office: string): Promise<Treaty> {
	if (toDid(federation.did) !== t.b.federation) throw new Error('Side B agrees, with its own key.');
	const st = unsigned(t);
	return {
		...t,
		signatures: [
			...t.signatures.filter((s) => s.side === 'a'),
			{ side: 'b', by: 'federation', did: t.b.federation, signature: await federation.signCanonical(st) },
			{ side: 'b', by: 'holder', office, did: toDid(holder.did), signature: await holder.signCanonical(st) }
		]
	};
}

export const hashTreaty = async (t: Treaty) => `treaty:sha256:${await sha256(canonical(unsigned(t)))}`;

export interface TreatyParts {
	termsOk: boolean;
	problem: string | null;
	signedByA: boolean;
	signedByB: boolean;
	holderA: string | null;
	holderB: string | null;
	hasPurpose: boolean;
}

/** What each side has signed, checked. */
export async function treatyParts(t: Treaty): Promise<TreatyParts> {
	const st = unsigned(t);
	const sig = async (side: 'a' | 'b', by: 'federation' | 'holder') => {
		const s = t.signatures?.find((x) => x.side === side && x.by === by);
		if (!s) return null;
		if (by === 'federation' && s.did !== t[side].federation) return null;
		return (await verify(s.did, st, s.signature)) ? s : null;
	};
	const [af, ah, bf, bh] = await Promise.all([sig('a', 'federation'), sig('a', 'holder'), sig('b', 'federation'), sig('b', 'holder')]);
	const problem = t?.schema === TREATY_SCHEMA ? termsProblem(t) : 'This isn’t a treaty.';
	return { termsOk: !problem, problem, signedByA: !!af && !!ah, signedByB: !!bf && !!bh, holderA: ah?.did ?? null, holderB: bh?.did ?? null, hasPurpose: !!t?.purpose && hasPurpose(t.purpose) };
}

/* ---------------------------------------------------------------- E3 -- */

export const SETTLEMENT_SCHEMA = 'inqbeta.treaty-settlement/1';

export interface Holdings {
	/** Of B's credits, what A holds, in B's minor units. */
	aHoldsOfB: number;
	/** Of A's credits, what B holds, in A's minor units. */
	bHoldsOfA: number;
}
export interface SettlementSums {
	/** Each side hands back the other's credits; the issuing mint cancels them. In each issuer's minor units. */
	swap: { aReturnsToB: number; bReturnsToA: number };
	/** Only the difference is paid, in the payer's own currency, to the payee's banking card. */
	net: { payer: 'a' | 'b'; minor: number; currency: string; toCard: string } | null;
}
/**
 * Swap first, then pay the difference (ADR-Q-042 §6). `aPerB` is what one of
 * B's credits is worth in A's currency on settlement day (1 at par).
 */
export function settleSums(t: Pick<TreatyStatement, 'a' | 'b'>, h: Holdings, aPerB = 1): SettlementSums {
	if (!(aPerB > 0)) throw new Error('A rate is more than nothing.');
	if (![h.aHoldsOfB, h.bHoldsOfA].every((n) => Number.isInteger(n) && n >= 0)) throw new Error('Holdings are whole minor units, none negative.');
	const ma = minorPerCredit(t.a.currency);
	const mb = minorPerCredit(t.b.currency);
	/* Both holdings as value in A's minor units. */
	const aHoldsValue = (h.aHoldsOfB / mb) * aPerB * ma;
	const bHoldsValue = h.bHoldsOfA;
	const matched = Math.min(aHoldsValue, bHoldsValue);
	const bReturnsToA = Math.round(matched);
	const aReturnsToB = Math.min(h.aHoldsOfB, Math.round(((matched / ma) * mb) / aPerB));
	const left = { a: h.aHoldsOfB - aReturnsToB, b: h.bHoldsOfA - bReturnsToA };
	let net: SettlementSums['net'] = null;
	/* A still holds B's credits: B redeems them, paying A in B's currency. Or the other way about. */
	if (left.a > 0) net = { payer: 'b', minor: left.a, currency: t.b.currency, toCard: t.a.bankingCard };
	else if (left.b > 0) net = { payer: 'a', minor: left.b, currency: t.a.currency, toCard: t.b.bankingCard };
	return { swap: { aReturnsToB, bReturnsToA }, net };
}

export interface SettlementStatement {
	schema: typeof SETTLEMENT_SCHEMA;
	event: 'treaty.settle';
	treaty: string;
	/** The period it closes. */
	from: string;
	to: string;
	holdings: Holdings;
	/** The rate on the day, and where it came from. */
	rate: { aPerB: number; source: 'par' | RateSource; on: string };
	sums: SettlementSums;
	at: string;
}
export type Settlement = SettlementStatement & { signatures: (Signature & { side: 'a' | 'b' })[] };

export async function proposeSettlement(
	treaty: Treaty,
	federationA: Signer,
	o: { from: string; to: string; holdings: Holdings; rate: { aPerB: number; on: string } },
	now = new Date()
): Promise<Settlement> {
	const source = treaty.rate.kind === 'par' ? 'par' : treaty.rate.source;
	const aPerB = treaty.rate.kind === 'par' ? 1 : o.rate.aPerB;
	const st: SettlementStatement = {
		schema: SETTLEMENT_SCHEMA,
		event: 'treaty.settle',
		treaty: await hashTreaty(treaty),
		from: o.from,
		to: o.to,
		holdings: o.holdings,
		rate: { aPerB, source, on: o.rate.on },
		sums: settleSums(treaty, o.holdings, aPerB),
		at: now.toISOString()
	};
	return { ...st, signatures: [{ side: 'a', by: 'federation', did: treaty.a.federation, signature: await federationA.signCanonical(st) }] };
}

export async function agreeSettlement(s: Settlement, treaty: Treaty, federationB: Signer): Promise<Settlement> {
	return { ...s, signatures: [...s.signatures.filter((x) => x.side === 'a'), { side: 'b', by: 'federation', did: treaty.b.federation, signature: await federationB.signCanonical(unsigned(s)) }] };
}

export interface SettlementParts {
	forThisTreaty: boolean;
	signedByBoth: boolean;
	/** The sums are exactly what swap-then-pay gives from the holdings at the rate. */
	balances: boolean;
	/** Nothing was paid that could have been swapped. */
	swappedFirst: boolean;
	/** The net goes to the banking card the treaty names for the payee. */
	toNamedCard: boolean;
	rateIsTheTreatys: boolean;
}

export async function settlementParts(s: Settlement, treaty: Treaty): Promise<SettlementParts> {
	const st = unsigned(s);
	const signed = async (side: 'a' | 'b') => {
		const x = s.signatures?.find((y) => y.side === side && y.did === treaty[side].federation);
		return !!x && (await verify(x.did, st, x.signature));
	};
	const forThisTreaty = s?.schema === SETTLEMENT_SCHEMA && s.treaty === (await hashTreaty(treaty));
	const rateIsTheTreatys = treaty.rate.kind === 'par' ? s.rate.source === 'par' && s.rate.aPerB === 1 : s.rate.source === treaty.rate.source;
	let expected: SettlementSums | null = null;
	try {
		expected = settleSums(treaty, s.holdings, s.rate.aPerB);
	} catch {
		expected = null;
	}
	const balances = !!expected && canonical(expected) === canonical(s.sums);
	/* Pounds move only if one side has nothing left to swap. */
	const leftA = s.holdings.aHoldsOfB - s.sums.swap.aReturnsToB;
	const leftB = s.holdings.bHoldsOfA - s.sums.swap.bReturnsToA;
	const swappedFirst = !(leftA > 0 && leftB > 0);
	const payee = s.sums.net ? (s.sums.net.payer === 'a' ? 'b' : 'a') : null;
	const toNamedCard = !s.sums.net || (payee !== null && s.sums.net.toCard === treaty[payee].bankingCard);
	return { forThisTreaty, signedByBoth: (await signed('a')) && (await signed('b')), balances, swappedFirst, toNamedCard, rateIsTheTreatys };
}

/* ---------------------------------------------------------- standing -- */

export const TREATY_END_SCHEMA = 'inqbeta.treaty-end/1';
export interface Ending {
	schema: typeof TREATY_END_SCHEMA;
	treaty: string;
	by: 'a' | 'b';
	says: string;
	/** The last day: notice runs NOTICE_DAYS from `at`. */
	on: string;
	at: string;
	signature: string;
	did: string;
}

/** Either side gives notice to end it; it ends after 30 days, with a final settlement on the last day. */
export async function giveNotice(treaty: Treaty, side: 'a' | 'b', federation: Signer, says: string, now = new Date()): Promise<Ending> {
	if (toDid(federation.did) !== treaty[side].federation) throw new Error('Notice comes from one of the two federations.');
	if (!says.trim()) throw new Error('Say why.');
	const st = { schema: TREATY_END_SCHEMA, treaty: await hashTreaty(treaty), by: side, says: says.trim(), on: new Date(now.getTime() + NOTICE_DAYS * DAY).toISOString(), at: now.toISOString() };
	return { ...st, did: treaty[side].federation, signature: await federation.signCanonical(st) } as Ending;
}

export type TreatyState = 'proposed' | 'in-force' | 'suspended' | 'ending' | 'ended';
export interface Standing {
	state: TreatyState;
	says: string;
	/** When the next settlement is due. */
	due: string | null;
	warnings: string[];
}
export interface PartnerHealth {
	/** The mint's published drift (0.1 is 10%). */
	drift: number;
	/** When its books were last reconciled. */
	reconciled: string | null;
}

/**
 * Where a treaty stands. `settlements` are those already checked as signed by
 * both; `health` is each side's published books.
 */
export function treatyStanding(
	treaty: Treaty,
	parts: Pick<TreatyParts, 'signedByA' | 'signedByB' | 'termsOk'>,
	o: { inForceSince: string; settlements: Pick<SettlementStatement, 'to'>[]; health?: { a?: PartnerHealth; b?: PartnerHealth }; ending?: Pick<Ending, 'on' | 'by'> | null },
	now = new Date()
): Standing {
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	if (!parts.termsOk) return { state: 'proposed', says: 'Its terms don’t hold.', due: null, warnings: [] };
	if (!parts.signedByA || !parts.signedByB) return { state: 'proposed', says: parts.signedByA ? `Waiting for ${treaty.b.name} to sign.` : 'Not signed yet.', due: null, warnings: [] };
	const lastTo = [o.inForceSince, ...o.settlements.map((s) => s.to)].sort().at(-1)!;
	const dueAt = Date.parse(lastTo) + treaty.period * DAY;
	const due = new Date(dueAt).toISOString();
	const endAt = [treaty.until, o.ending?.on].filter(Boolean).map((x) => Date.parse(x!)).sort((x, y) => x - y)[0];
	if (endAt !== undefined && now.getTime() >= endAt) return { state: 'ended', says: `Ended on ${day(new Date(endAt).toISOString())}.`, due: null, warnings: [] };
	const warnings: string[] = [];
	const suspend: string[] = [];
	if (now.getTime() > dueAt) suspend.push(`Settlement overdue since ${day(due)}.`);
	for (const side of ['a', 'b'] as const) {
		const h = o.health?.[side];
		if (!h) continue;
		const name = treaty[side].name;
		if (h.drift > DRIFT_VALVE) suspend.push(`${name}’s books are ${Math.round(h.drift * 100)}% short of what it has issued.`);
		else if (h.drift > DRIFT_WARN) warnings.push(`${name}’s books are ${Math.round(h.drift * 100)}% short: watch it.`);
		if (!h.reconciled || now.getTime() - Date.parse(h.reconciled) > UNRECONCILED_DAYS * DAY) suspend.push(`${name}’s books haven’t been reconciled for over ${UNRECONCILED_DAYS} days.`);
	}
	if (suspend.length) return { state: 'suspended', says: `Suspended: ${suspend.join(' ')} No new trades until it’s put right; what’s held stays valid.`, due, warnings };
	if (o.ending) return { state: 'ending', says: `Ending on ${day(o.ending.on)}, with a final settlement that day.`, due, warnings };
	return { state: 'in-force', says: `In force. Next settlement by ${day(due)}.`, due, warnings };
}

/** May a side take `adding` more of the partner's credits, holding `held` now (both in the partner's minor units)? */
export function withinCap(treaty: Treaty, side: 'a' | 'b', held: number, adding: number, o: { ownReserveMinor?: number; partnerToOwn?: number } = {}): Check {
	const partner = side === 'a' ? treaty.b : treaty.a;
	const m = minorPerCredit(partner.currency);
	const after = held + adding;
	if (after > treaty.cap.credits * m) return { ok: false, says: `That would hold more than ${treaty.cap.credits} of ${partner.name}’s credits, the treaty’s cap. Settle first.` };
	if (treaty.cap.shareOfReserve !== undefined && o.ownReserveMinor !== undefined) {
		const inOwn = after * (o.partnerToOwn ?? 1);
		if (inOwn > o.ownReserveMinor * treaty.cap.shareOfReserve) return { ok: false, says: `That would be more than ${Math.round(treaty.cap.shareOfReserve * 100)}% of our reserve in ${partner.name}’s credits.` };
	}
	return { ok: true, says: 'Within the treaty’s cap.' };
}
