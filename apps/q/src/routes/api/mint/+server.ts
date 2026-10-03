/*
 * The host's mint (ADR-Q-027, 3 October 2026). Public: every Q on this host
 * buys and cashes out here.
 *
 *   GET                       the mint: its DID, test or live, the rate, its books
 *   POST { buy: request }     a signed request from the buyer → credits minted to them
 *   POST { cashout: ask }     a holder's signed ask → the ask kept, the credits destroyed, the payout recorded
 *   POST { file: receipt }    an agreement step in the mint's credits, filed in its ledger
 *
 * In test mode everything works and no money moves: payments and payouts are
 * test references. Once the host is published (live), buying waits for the
 * payment provider and cashing out for the payout — not connected yet, so
 * they're refused with a plain reason rather than faked.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { sealWith, checkReceipt } from '@inqbeta/q-core/seal';
import { MINT_SCHEMA, MINT_SOURCE, isMintEvent, type MintEvent, type MintReceipt } from '@inqbeta/q-core/mint';
import { mintFacts } from '@inqbeta/q-actions/core/mint';
import { MintRefused, appendLedger, books, decideMint, fileable, hostOf, mintIdentity, moneyOf, pencePerCredit, readLedger } from '$lib/server/mint';

export const prerender = false;

const REQUEST_SCHEMA = 'inqbeta.mint-request/1';
const FRESH_MS = 10 * 60 * 1000;
const MOST_AT_ONCE = 10_000;

async function context(origin: string) {
	const host = await hostOf(origin);
	if (!host) throw new MintRefused('This copy has no host set up yet.');
	const me = await mintIdentity();
	const state = await moneyOf(origin, host);
	const mode = state.mode;
	const pence = pencePerCredit(state);
	if (state.publication && state.publication.mint !== me.did) throw new MintRefused('The published mint isn’t this one: the mint’s key has changed since publishing.');
	return { host, me, state, mode, pence };
}

/*
 * When the mint signs: now, or just after the latest step it follows, whichever
 * is later. A person's clock can run a little ahead of this server's, and a burn
 * dated before the ask it answers was refused as backdated (3 October 2026).
 */
function stampAfter(times: (string | undefined)[]): string {
	const latest = Math.max(0, ...times.map((t) => Date.parse(t ?? '')).filter(Number.isFinite));
	return new Date(Math.max(Date.now(), latest + 1)).toISOString();
}
const latestIn = (ledger: unknown[]) => ledger.map((r) => (r as { content?: { at?: string } })?.content?.at);

const refuse = (e: unknown, status = 409) => json({ ok: false, says: e instanceof Error ? e.message : String(e) }, { status: e instanceof MintRefused ? status : 500 });

export const GET: RequestHandler = async ({ url }) => {
	try {
		const { host, me, state, mode, pence } = await context(url.origin);
		const ledger = await readLedger(host, me.did, mode);
		const b = books(ledger, me.did, mode, pence);
		return json({
			ok: true,
			mint: me.did,
			mode,
			pencePerCredit: pence,
			publishedId: state.publishedId ?? null,
			/* The latest step in the mint's books: an ask signed on someone's device is dated after it. */
			lastAt: stampAfter(latestIn(ledger)),
			books: { minted: b.minted, destroyed: b.destroyed, circulation: b.circulation, cashReserve: b.cashReserve, capitalReserve: b.capitalReserve, reconciled: b.reconciled, backed: b.backed, holders: b.holders.size }
		});
	} catch (e) {
		return refuse(e);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	let body: { buy?: unknown; cashout?: unknown; file?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, says: 'That isn’t JSON.' }, { status: 400 });
	}
	try {
		const { host, me, mode, pence } = await context(url.origin);
		const ledger = await readLedger(host, me.did, mode);

		/* ---- Buy: minted to the buyer, citing the payment ---- */
		if (body.buy) {
			const r = body.buy as { did?: string; content?: { schema?: string; credits?: number; mint?: string; at?: string } };
			if (!(await checkReceipt(r)).ok || r.content?.schema !== REQUEST_SCHEMA) throw new MintRefused('The request isn’t signed by you.');
			const c = r.content;
			if (c.mint !== me.did) throw new MintRefused('That request is for another mint.');
			if (!c.at || Math.abs(Date.now() - Date.parse(c.at)) > FRESH_MS) throw new MintRefused('That request is too old. Try again.');
			const credits = Math.trunc(Number(c.credits));
			if (!(credits >= 1 && credits <= MOST_AT_ONCE)) throw new MintRefused(`Buy between 1 and ${MOST_AT_ONCE} credits at a time.`);
			if (mode === 'live') throw new MintRefused('This host is live, and payments aren’t connected yet. Nothing has been charged.');
			const event: MintEvent = { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: me.did, kind: 'mint', credits, mode, to: r.did!, pence: credits * pence, cites: [`test-payment-${crypto.randomUUID()}`], at: stampAfter(latestIn(ledger)) };
			const draft = { did: me.did, content: event, contentHash: '' } as MintReceipt;
			const { facts } = mintFacts(ledger.map((json) => ({ json })), draft, pence);
			const checked = await decideMint('credits.mint', me.did, me.did, facts);
			const minted = (await sealWith(me, { ...event, checked })) as MintReceipt;
			await appendLedger(host, me.did, mode, minted);
			return json({ ok: true, minted });
		}

		/* ---- Cash out: the holder's ask, kept; the credits destroyed; the payout recorded ---- */
		if (body.cashout) {
			const ask = body.cashout as MintReceipt;
			if (!isMintEvent(ask) || ask.content.kind !== 'cashout' || !(await checkReceipt(ask)).ok) throw new MintRefused('The ask isn’t signed by you.');
			if (ask.content.mint !== me.did || ask.content.mode !== mode) throw new MintRefused(mode === 'live' && ask.content.mode === 'test' ? 'This host is live now: test credits can’t be cashed out.' : 'That ask is for another mint.');
			if (mode === 'live') throw new MintRefused('This host is live, and payouts aren’t connected yet. Your credits are untouched.');
			const prior = ledger.map((json) => ({ json }));
			const asked = mintFacts(prior, ask, pence);
			await decideMint('credits.cashout', ask.did, me.did, asked.facts);
			const burnEvent: MintEvent = { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: me.did, kind: 'burn', credits: ask.content.credits, mode, from: ask.content.from, pence: ask.content.credits * pence, asks: ask.contentHash, payout: `test-payout-${crypto.randomUUID()}`, at: stampAfter([...latestIn(ledger), ask.content.at]) };
			const draft = { did: me.did, content: burnEvent, contentHash: '' } as MintReceipt;
			const { facts } = mintFacts([...prior, { json: ask }], draft, pence);
			const checked = await decideMint('credits.burn', me.did, me.did, facts);
			const burned = (await sealWith(me, { ...burnEvent, checked })) as MintReceipt;
			await appendLedger(host, me.did, mode, ask);
			await appendLedger(host, me.did, mode, burned);
			return json({ ok: true, ask, burned });
		}

		/* ---- File: an agreement step in this mint's credits ---- */
		if (body.file) {
			const wrong = await fileable(body.file, me.did, mode, ledger);
			if (wrong) throw new MintRefused(wrong);
			await appendLedger(host, me.did, mode, body.file as { contentHash: string });
			return json({ ok: true });
		}
		return json({ ok: false, says: 'Buy, cash out, or file.' }, { status: 400 });
	} catch (e) {
		return refuse(e);
	}
};
