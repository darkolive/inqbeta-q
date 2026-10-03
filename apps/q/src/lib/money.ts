/*
 * Money in Q, as the page sees it (ADR-Q-027, 3 October 2026): the host's
 * mint, buying credits from it and cashing them out.
 *
 * The mint (/api/mint) signs; this keeps what it signed in your vault, so
 * your balance is added up from your own receipts like everything else.
 * In test mode everything works and no money moves.
 */
import { sealWith } from '@inqbeta/q-core/seal';
import type { Identity } from '@inqbeta/q-core/passkey';
import { saveLocked } from '@inqbeta/q-core/folder';
import { MINT_SCHEMA, MINT_SOURCE, booksOf, isMintEvent, spendable, type MintEvent, type MintReceipt } from '@inqbeta/q-core/mint';
import { refreshLedger, type Ledger } from '$lib/ledger';

export interface MintView {
	mint: string;
	mode: 'test' | 'live';
	pencePerCredit: number;
	publishedId: string | null;
	/** Just after the latest step in the mint's books. */
	lastAt?: string;
	books: { minted: number; destroyed: number; circulation: number; cashReserve: number; capitalReserve: number; reconciled: boolean; backed: boolean; holders: number };
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
export async function cashOut(identity: Identity, mint: MintView, credits: number): Promise<{ ok: true; burned: MintReceipt } | { ok: false; says: string }> {
	/* Dated after the mint's latest step, even if this device's clock runs behind the mint's. */
	const fresh = await readMint(true);
	const after = Date.parse(fresh.view?.lastAt ?? '');
	const at = new Date(Math.max(Date.now(), Number.isFinite(after) ? after : 0)).toISOString();
	const event: MintEvent = { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: mint.mint, kind: 'cashout', credits, mode: mint.mode, from: identity.did, at };
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

/** File an agreement step in the mint's ledger, so every credit's whereabouts is known. Best effort. */
export async function fileWithMint(receipt: unknown): Promise<boolean> {
	const r = await fetch('/api/mint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: receipt }) }).catch(() => null);
	return !!r?.ok;
}

/** Your credits from this mint, from your own vault: what you hold, and what you can spend or cash out now. */
export function mintBalance(ledger: Ledger | null, mint: MintView | null, did: string) {
	if (!mint) return { held: 0, spendable: 0 };
	const b = booksOf(ledger?.receipts ?? [], mint.mint, mint.mode, mint.pencePerCredit);
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

export const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
