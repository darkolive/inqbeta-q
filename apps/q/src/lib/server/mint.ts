/*
 * The host's mint, on the server (ADR-Q-027, 3 October 2026).
 *
 * The mint signs as itself: its key is made for you on localhost
 * (Q_MINT_SEED, like Q_SERVICE_SEED) and sent to the live site with the other
 * keys. It signs only what the rules allow (Cedar, on the server), and keeps
 * its own receipts — what it made and destroyed, holders' asks, agreements in
 * its credits — in its ledger at the storage node (the gate's /mint ledger),
 * or, on a copy with no storage node, in mint.local/ beside this app
 * (development only).
 *
 * Test or live comes from the host's public record: live only once the
 * founder has signed the money publication (q-core money.ts).
 */
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { identityFromSeed, type Identity } from '@inqbeta/q-core/passkey';
import { unb64url } from '@inqbeta/q-core/canonical';
import { checkReceipt } from '@inqbeta/q-core/seal';
import { checkInvitation, isInvitation, unpack } from '@inqbeta/q-core/membership';
import { coinContactFrom, coinDesignFrom, moneyStateOf, publishedCurrency, type CoinDesign, type MoneyState } from '@inqbeta/q-core/money';
import { currencyFrom } from '@inqbeta/q-core/currency';
import { booksOf, isMintEvent, type MintMode, type MintReceipt } from '@inqbeta/q-core/mint';
import { isAgreementStep } from '@inqbeta/q-core/agreements';
import { MINT_ACTIONS } from '@inqbeta/q-actions/core/mint';
import { nodeEngine } from '@inqbeta/q-actions/node';
import { readHomeFile, readServicesFile, type ServicesFile } from '$lib/server/host';
import { isDevelopmentSite } from '$lib/server/site';
import type { HomeFile } from '$lib/home';

export class MintRefused extends Error {}
/** The books moved on while a cash-out or a spend was being decided (audit A4): read again, decide again. */
export class LedgerMoved extends Error {}

let identity: Promise<Identity> | null = null;
/** The mint's own identity, from Q_MINT_SEED. */
export function mintIdentity(): Promise<Identity> {
	identity ??= (async () => {
		const seed = env.Q_MINT_SEED?.trim();
		if (!seed) throw new MintRefused('Money isn’t set up on this host yet: make the mint’s key on the console (Services → Money).');
		const raw = unb64url(seed);
		if (raw.length !== 32) throw new MintRefused('Q_MINT_SEED should be 32 bytes.');
		return identityFromSeed(raw);
	})();
	return identity.catch((e) => {
		identity = null;
		throw e;
	});
}

/**
 * The mint's currency (ADR-Q-042 §3): one credit costs, and cashes out for,
 * one whole unit of it. Once published, the one signed into the publication,
 * for good; before that, Q_CURRENCY in Money (pounds if unset).
 */
export function currencyOf(state?: MoneyState): string {
	if (state?.publication) return publishedCurrency(state.publication);
	return currencyFrom(env.Q_CURRENCY);
}

/**
 * The coin's name (ADR-Q-035): once published, the name signed into the
 * publication; before that, Q_COIN_NAME in Money. Empty when it has none yet.
 */
export function coinNameOf(state?: MoneyState): string {
	if (state?.publication) return state.publication.coinName?.trim() ?? '';
	return (env.Q_COIN_NAME ?? '').trim().slice(0, 40);
}

/** Who answers for the coin (ADR-Q-037): an office, signed into the publication once live; before that, Q_COIN_CONTACT in Money. Treasurer unless chosen. */
export function coinContactOf(state?: MoneyState): string {
	if (state?.publication) return coinContactFrom(state.publication.coinContact);
	return coinContactFrom(env.Q_COIN_CONTACT);
}

/** The coin's design: signed into the publication once live; before that, Q_COIN_DESIGN in Money. */
export function coinDesignOf(state?: MoneyState): CoinDesign {
	if (state?.publication) return coinDesignFrom(state.publication.coinDesign);
	return coinDesignFrom(env.Q_COIN_DESIGN ?? '');
}

/* The host's public files: from disk on localhost, from the site itself when deployed. */
/*
 * A host file as this site serves it. The development site reads its own
 * (static/dev/…, ADR-Q-034 §5), falling back to the shared one until its
 * host is founded.
 */
async function siteFile<T>(origin: string, p: string): Promise<T | null> {
	const tries = isDevelopmentSite(origin) ? [`/dev${p}`, p] : [p];
	for (const t of tries) {
		const r = await fetch(`${origin}${t}`).catch(() => null);
		if (r?.ok) return (await r.json().catch(() => null)) as T | null;
	}
	return null;
}
async function homeFile(origin: string): Promise<HomeFile | null> {
	if (dev) return readHomeFile();
	return siteFile<HomeFile>(origin, '/incubator.json');
}
async function servicesFile(origin: string): Promise<ServicesFile | null> {
	if (dev) return readServicesFile();
	return siteFile<ServicesFile>(origin, '/host/services.json');
}

export interface Host {
	federation: string;
	founder: string;
	storage?: string;
}
/** The host this copy runs: its federation, its founder (checked from the invitation), its storage. */
export async function hostOf(origin: string): Promise<Host | null> {
	const f = await homeFile(origin);
	if (!f) return null;
	const inv = await unpack(f.invitation).catch(() => null);
	if (!isInvitation(inv) || !(await checkInvitation(inv)).ok) return null;
	const storage = typeof f.services?.storage === 'string' && /^https?:\/\//.test(f.services.storage) ? f.services.storage.replace(/\/$/, '') : undefined;
	return { federation: f.federation, founder: inv.founding.root, storage };
}

/** Test or live, from the host's public record. */
export async function moneyOf(origin: string, host: Host): Promise<MoneyState> {
	const s = await servicesFile(origin);
	return moneyStateOf(s?.money ? [s.money] : [], host.federation, host.founder);
}

/* ---- The ledger ---- */
const LOCAL = (mint: string, mode: MintMode) => path.resolve(process.cwd(), 'mint.local', `${mint.slice(-16)}-${mode}.json`);

export async function readLedger(host: Host, mint: string, mode: MintMode): Promise<unknown[]> {
	return (await readLedgerAt(host, mint, mode)).receipts;
}

/** The books and their tip (how many entries), so a cash-out or a spend can be filed only on the books it was decided on. */
export async function readLedgerAt(host: Host, mint: string, mode: MintMode): Promise<{ receipts: unknown[]; tip: number | null }> {
	if (host.storage) {
		const r = await fetch(`${host.storage}/mint/${mint}/${mode}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
		if (r?.ok) {
			const j = (await r.json().catch(() => ({}))) as { receipts?: unknown[]; tip?: number };
			return { receipts: j.receipts ?? [], tip: typeof j.tip === 'number' ? j.tip : null };
		}
		/* Say what the storage said, and which mint was asked for: the node keeps only mints listed in its GATE_MINTS. */
		if (!dev) {
			if (r?.status === 404) throw new MintRefused(`The storage doesn’t keep this mint’s books yet. On the node, GATE_MINTS needs to be ${mint}, then the gate restarted.`);
			throw new MintRefused(r ? `The mint’s ledger at the storage said ${r.status}. Try again in a moment.` : 'The mint’s ledger at the storage didn’t answer. Try again in a moment.');
		}
	}
	if (!dev) throw new MintRefused('This host has no storage node for the mint’s ledger.');
	try {
		const receipts = existsSync(LOCAL(mint, mode)) ? (JSON.parse(readFileSync(LOCAL(mint, mode), 'utf8')) as unknown[]) : [];
		return { receipts, tip: receipts.length };
	} catch {
		return { receipts: [], tip: 0 };
	}
}

/**
 * File a receipt in the mint's ledger. With `onTip`, only if the books still
 * hold that many entries (the tip it was decided on); otherwise LedgerMoved.
 */
export async function appendLedger(host: Host, mint: string, mode: MintMode, receipt: { contentHash: string }, onTip?: number | null): Promise<void> {
	if (host.storage) {
		const headers: Record<string, string> = { 'content-type': 'application/json', ...(typeof onTip === 'number' ? { 'x-ledger-tip': String(onTip) } : {}) };
		const r = await fetch(`${host.storage}/mint/${mint}/${mode}`, { method: 'POST', headers, body: JSON.stringify(receipt), signal: AbortSignal.timeout(15_000) }).catch(() => null);
		if (r?.ok) return;
		if (r?.status === 409) throw new LedgerMoved('The books moved on while this was being decided.');
		if (!dev) throw new MintRefused(`The storage didn’t keep it: ${r ? ((await r.json().catch(() => ({}))) as { says?: string }).says ?? r.status : 'no answer'}.`);
	}
	if (!dev) throw new MintRefused('This host has no storage node for the mint’s ledger.');
	const had = await readLedger({ ...host, storage: undefined }, mint, mode);
	if (had.some((x) => (x as { contentHash?: string }).contentHash === receipt.contentHash)) return;
	if (typeof onTip === 'number' && had.length !== onTip) throw new LedgerMoved('The books moved on while this was being decided.');
	mkdirSync(path.dirname(LOCAL(mint, mode)), { recursive: true });
	writeFileSync(LOCAL(mint, mode), JSON.stringify([...had, receipt], null, 2));
}

/** Whether a receipt may be filed in this mint's ledger (the gate checks the same, again). */
export async function fileable(r: unknown, mint: string, mode: MintMode, ledger: unknown[]): Promise<string | null> {
	if (!(await checkReceipt(r)).ok) return 'It isn’t signed.';
	if (isMintEvent(r)) {
		const c = r.content;
		if (c.mint !== mint || c.mode !== mode) return 'It belongs to another mint or mode.';
		if (c.kind === 'cashout' && r.did === c.from) return null;
		return 'Only the mint files what it makes and destroys.';
	}
	if (isAgreementStep(r)) {
		const c = r.content;
		const credit = (v: unknown) => !!v && typeof v === 'object' && (v as { mint?: string }).mint === mint && (v as { mode?: string }).mode === mode;
		if ((c.terms && (credit(c.terms.aGives) || credit(c.terms.bGives))) || (c.entries ?? []).some((e) => credit(e.value))) return null;
		if (ledger.some((x) => isAgreementStep(x) && x.content.agreement === c.agreement)) return null;
		return 'That agreement isn’t in this mint’s credits.';
	}
	return 'That isn’t a mint receipt or an agreement.';
}

/* ---- The rules ---- */
const hashes = new Map<string, string>();
/** Decide a mint step with Cedar. Refuses (MintRefused) with the rules' own words. */
export async function decideMint(action: string, principal: string, mint: string, facts: Record<string, unknown>): Promise<{ action: string; rules: string[] }> {
	const engine = nodeEngine();
	if (!hashes.size) for (const a of MINT_ACTIONS) hashes.set(a.id, await engine.load([a]));
	const hash = hashes.get(action);
	if (!hash) throw new MintRefused(`The engine has no ${action}.`);
	const d = engine.decide(hash, { principal: { type: 'Person', id: principal }, resource: { type: 'Mint', id: mint }, facts });
	if (!d.holds) throw new MintRefused(d.because.join(' '));
	return { action: hash, rules: d.rules };
}

/** The mint's books, from its own ledger. */
export function books(ledger: unknown[], mint: string, mode: MintMode, currency: string) {
	return booksOf(ledger.map((json) => ({ json })), mint, mode, currency);
}

export type { MintReceipt };
