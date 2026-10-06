/*
 * Money in Q, as the page sees it (ADR-Q-027, 3 October 2026): the host's
 * mint, buying credits from it and cashing them out.
 *
 * The mint (/api/mint) signs; this keeps what it signed in your vault, so
 * your balance is added up from your own receipts like everything else.
 * In test mode everything works and no money moves.
 */
import type { Acting as ActingProof } from '@inqbeta/q-core/inrole';
import { creditsWorth, money } from '@inqbeta/q-core/currency';
import { sealWith } from '@inqbeta/q-core/seal';
import type { Identity } from '@inqbeta/q-core/passkey';
import { saveLocked } from '@inqbeta/q-core/folder';
import { MINT_SCHEMA, MINT_SOURCE, RECONCILE_ASK_SCHEMA, booksOf, isMintEvent, isReconciliation, spendable, type MintEvent, type MintReceipt, type ReconciliationReceipt } from '@inqbeta/q-core/mint';
import { PAYOUT_ACCOUNT_SCHEMA, isPayoutAccount, type CoinDesign, type PayoutAccount, type PayoutAccountReceipt } from '@inqbeta/q-core/money';
import { refreshLedger, type Ledger } from '$lib/ledger';

export interface MintView {
	mint: string;
	/** The coin's own name, as its bank named it (ADR-Q-035); empty when it has none yet. */
	name?: string;
	/** How the coin looks, as its bank designed it. */
	design?: CoinDesign;
	/** Who answers for it (ADR-Q-037): the office, and who holds it today. */
	contact?: { office: string; called: string; answerer: string; answererOffice: string; holders?: { holder: string; inbox: string }[] };
	mode: 'test' | 'live';
	/** The mint's currency (ISO 4217): one credit is one unit of it (ADR-Q-042 §3). */
	currency: string;
	publishedId: string | null;
	/** Just after the latest step in the mint's books. */
	lastAt?: string;
	/** The bank's last signed reconciliation (ADR-Q-035): when, at whose ask, and the receipt itself. */
	lastReconciled?: { at: string; by: string; hash: string; receipt: ReconciliationReceipt } | null;
	/** How many of the mint's own receipts have come since it. */
	movesSince?: number;
	books: { minted: number; destroyed: number; circulation: number; cashReserve: number; capitalReserve: number; reconciled: boolean; backed: boolean; holders: number; drift?: number };
	/** The safety valve (ADR-Q-027): whether cash-outs are paused, and why. */
	valve?: { shut: boolean; warn: boolean; drift: number; unknown: boolean; says: string };
}

let cached: { at: number; view: MintView | null; says?: string } | null = null;
/** The host's mint, as it says itself. Never throws: `says` explains when there's none. */
export async function readMint(fresh = false): Promise<{ view: MintView | null; says?: string }> {
	if (!fresh && cached && Date.now() - cached.at < 30_000) return cached;
	try {
		const r = await fetch('/api/mint', { cache: 'no-store' });
		const out = (await r.json().catch(() => ({}))) as Partial<MintView> & { ok?: boolean; says?: string };
		cached = out.ok ? { at: Date.now(), view: out as MintView } : { at: Date.now(), view: null, says: out.says ?? `The mint said ${r.status}.` };
	} catch {
		cached = { at: Date.now(), view: null, says: 'The mint didn’t answer.' };
	}
	return cached;
}

async function keep(r: MintReceipt) {
	await saveLocked('credits', `mint-${r.content.kind}-${r.content.at.slice(0, 19).replace(/[:T]/g, '-')}-${r.contentHash.slice(0, 8)}.json`, JSON.stringify(r, null, 2), 'application/json');
}

const said = async (r: Response) => ((await r.json().catch(() => ({}))) as { says?: string }).says ?? `The mint said ${r.status}.`;

/** Buy credits: a signed request; the mint mints them to you; the receipt is kept in your vault. */
export async function buyCredits(identity: Identity, mint: MintView, credits: number): Promise<{ ok: true; minted: MintReceipt } | { ok: false; says: string }> {
	const request = await sealWith(identity, { schema: 'inqbeta.mint-request/1', source: MINT_SOURCE, kind: 'buy', mint: mint.mint, credits, at: new Date().toISOString() });
	const r = await fetch('/api/mint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ buy: request }) });
	if (!r.ok) return { ok: false, says: await said(r) };
	const { minted } = (await r.json()) as { minted: MintReceipt };
	if (!isMintEvent(minted) || minted.content.to !== identity.did) return { ok: false, says: 'The mint sent back something that isn’t yours.' };
	await keep(minted);
	cached = null;
	await refreshLedger();
	return { ok: true, minted };
}

/** Cash out: your signed ask; the mint destroys the credits and records the payout; both receipts kept. */
export async function cashOut(identity: Identity, mint: MintView, credits: number, ledger: Ledger | null = null): Promise<{ ok: true; burned: MintReceipt } | { ok: false; says: string }> {
	/* Dated after the mint's latest step, even if this device's clock runs behind the mint's. */
	const fresh = await readMint(true);
	const after = Date.parse(fresh.view?.lastAt ?? '');
	const at = new Date(Math.max(Date.now(), Number.isFinite(after) ? after : 0)).toISOString();
	/* Paid only to your cashing-out account, as a standing order (ADR-Q-035). */
	const account = payoutAccountOf(ledger ?? accountCache, identity.did);
	if (!account) return { ok: false, says: 'Set your cashing-out account in Settings first: cashing out pays only to it, as a standing order.' };
	const event: MintEvent = { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: mint.mint, kind: 'cashout', credits, mode: mint.mode, from: identity.did, account: { receipt: account.contentHash, ends: account.content.ends }, at };
	const ask = (await sealWith(identity, event)) as MintReceipt;
	const r = await fetch('/api/mint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cashout: ask }) });
	if (!r.ok) return { ok: false, says: await said(r) };
	const { burned } = (await r.json()) as { burned: MintReceipt };
	if (!isMintEvent(burned) || burned.content.asks !== ask.contentHash) return { ok: false, says: 'The mint’s answer doesn’t match your ask.' };
	await keep(ask);
	await keep(burned);
	cached = null;
	await refreshLedger();
	return { ok: true, burned };
}

/* ---- Reconciliation: the treasurer asks, the bank signs its books ---- */
export async function reconcile(identity: Identity, mint: MintView, acting: ActingProof | null): Promise<{ ok: true; reconciliation: ReconciliationReceipt } | { ok: false; says: string }> {
	/* Asked in role (ADR-Q-038): the office, its mandate and the take-up go with the ask, for the bank to check. */
	if (!acting) return { ok: false, says: 'Take up your office first: reconciling is done for the federation.' };
	const ask = await sealWith(identity, { schema: RECONCILE_ASK_SCHEMA, source: MINT_SOURCE, mint: mint.mint, acting, at: new Date().toISOString() });
	const r = await fetch('/api/mint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reconcile: ask }) });
	if (!r.ok) return { ok: false, says: await said(r) };
	const { reconciliation } = (await r.json()) as { reconciliation: ReconciliationReceipt };
	if (!isReconciliation(reconciliation) || reconciliation.content.asks !== ask.contentHash) return { ok: false, says: 'The bank’s answer doesn’t match your ask.' };
	await saveLocked('credits', `mint-reconciled-${reconciliation.content.at.slice(0, 19).replace(/[:T]/g, '-')}-${reconciliation.contentHash.slice(0, 8)}.json`, JSON.stringify(reconciliation, null, 2), 'application/json');
	cached = null;
	await refreshLedger();
	return { ok: true, reconciliation };
}

/* ---- Your cashing-out account: a standing order, set in Settings ---- */
let accountCache: Ledger | null = null;
/** Every cashing-out account you've set, oldest first: each change a receipt naming the one it replaces. */
export function payoutAccountsOf(ledger: Ledger | null, did: string): PayoutAccountReceipt[] {
	if (ledger) accountCache = ledger;
	const seen = new Map<string, PayoutAccountReceipt>();
	for (const x of (ledger ?? accountCache)?.receipts ?? []) if (x.holds !== 'no' && isPayoutAccount(x.json) && x.json.content.holder === did && x.json.did === did) seen.set(x.json.contentHash, x.json);
	return [...seen.values()].sort((a, b) => a.content.at.localeCompare(b.content.at));
}
/** The account cashing out pays to now: the latest you set. */
export function payoutAccountOf(ledger: Ledger | null, did: string, fallback: Ledger | null = null): PayoutAccountReceipt | null {
	return payoutAccountsOf(ledger ?? fallback, did).at(-1) ?? null;
}
async function fingerprintOf(name: string, sort: string, number: string): Promise<string> {
	const bytes = new TextEncoder().encode(`${name.trim().toLowerCase()}|${sort.replace(/\D/g, '')}|${number.replace(/\D/g, '')}`);
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Set (or change) your cashing-out account: a receipt you sign, naming the one it replaces. Only the last four digits are kept in the clear. */
export async function setPayoutAccount(identity: Identity, ledger: Ledger | null, details: { name: string; sort: string; number: string }): Promise<{ ok: true; account: PayoutAccountReceipt } | { ok: false; says: string }> {
	const sort = details.sort.replace(/\D/g, '');
	const number = details.number.replace(/\D/g, '');
	if (!details.name.trim()) return { ok: false, says: 'Add the name on the account.' };
	if (sort.length !== 6) return { ok: false, says: 'A sort code is six digits.' };
	if (number.length !== 8) return { ok: false, says: 'An account number is eight digits.' };
	const prev = payoutAccountOf(ledger, identity.did);
	const content: PayoutAccount = { schema: PAYOUT_ACCOUNT_SCHEMA, source: 'inqbeta:q/credits', holder: identity.did, ends: number.slice(-4), fingerprint: await fingerprintOf(details.name, sort, number), replaces: prev?.contentHash ?? null, at: new Date().toISOString() };
	const account = (await sealWith(identity, content)) as PayoutAccountReceipt;
	await saveLocked('credits', `payout-account-${content.at.slice(0, 19).replace(/[:T]/g, '-')}-${account.contentHash.slice(0, 8)}.json`, JSON.stringify(account, null, 2), 'application/json');
	await refreshLedger();
	return { ok: true, account };
}

/** File an agreement step in the mint's ledger, so every credit's whereabouts is known. Best effort. */
export async function fileWithMint(receipt: unknown): Promise<boolean> {
	const r = await fetch('/api/mint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: receipt }) }).catch(() => null);
	return !!r?.ok;
}

/** Your credits from this mint, from your own vault: what you hold, and what you can spend or cash out now. */
export function mintBalance(ledger: Ledger | null, mint: MintView | null, did: string) {
	if (!mint) return { held: 0, spendable: 0 };
	const b = booksOf(ledger?.receipts ?? [], mint.mint, mint.mode, mint.currency);
	return { held: b.holders.get(did) ?? 0, spendable: spendable(b, did) };
}

/** Your mint receipts, newest first, with what each did for you. */
export function mintMoves(ledger: Ledger | null, mint: MintView | null, did: string): { r: MintReceipt; n: number }[] {
	if (!mint) return [];
	const seen = new Map<string, MintReceipt>();
	for (const x of ledger?.receipts ?? []) if (x.holds !== 'no' && isMintEvent(x.json) && x.json.content.mint === mint.mint) seen.set(x.json.contentHash, x.json);
	return [...seen.values()]
		.map((r) => ({ r, n: r.content.kind === 'mint' && r.content.to === did ? r.content.credits : r.content.kind === 'burn' && r.content.from === did ? -r.content.credits : 0 }))
		.filter((m) => m.r.content.kind !== 'cashout')
		.sort((a, b) => b.r.content.at.localeCompare(a.r.content.at));
}

/** An amount in the mint's minor units (pence, cents), in its currency: 250 → "£2.50". */
export const amount = (minor: number, mint: Pick<MintView, 'currency'>) => money(minor, mint.currency);
/** What some credits are worth: one credit is one unit of the mint's currency. 3 → "£3.00". */
export const worth = (credits: number, mint: Pick<MintView, 'currency'>) => creditsWorth(credits, mint.currency);
