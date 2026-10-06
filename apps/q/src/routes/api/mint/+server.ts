/*
 * The host's mint (ADR-Q-027, 3 October 2026). Public: every Q on this host
 * buys and cashes out here.
 *
 *   GET                       the mint: its DID, test or live, the rate, its books
 *   POST { buy: request }     a signed request from the buyer → credits minted to them
 *   POST { cashout: ask }     a holder's signed ask → the ask kept, the credits destroyed, the payout recorded
 *   POST { file: receipt }    an agreement step in the mint's credits, filed in its ledger
 *   POST { reconcile: ask }   the treasurer's (or caretaker's) signed ask, made in role → the books added up and signed (ADR-Q-035, ADR-Q-038)
 *
 * While the host is in test, every POST asks the door first (ADR-Q-034).
 *
 * A cash-out goes only to the holder's cashing-out account, named in the ask
 * by its receipt (ADR-Q-035): a standing order, never an account typed in at
 * the time.
 *
 * In test mode everything works and no money moves: payments and payouts are
 * test references. Once the host is published (live), buying waits for the
 * payment provider and cashing out for the payout — not connected yet, so
 * they're refused with a plain reason rather than faked.
 */
import { actingCovers } from '@inqbeta/q-core/inrole';
import { revokedMandates } from '$lib/server/revoked';
import { OFFICE_COMMANDS } from '@inqbeta/q-core/offices';
import { json, type RequestHandler } from '@sveltejs/kit';
import { sealWith, checkReceipt } from '@inqbeta/q-core/seal';
import { MINT_SCHEMA, MINT_SOURCE, RECONCILED_SCHEMA, RECONCILE_ASK_SCHEMA, isMintEvent, isReconciliation, type MintEvent, type MintReceipt, type Reconciliation, type ReconciliationReceipt } from '@inqbeta/q-core/mint';
import { mintFacts } from '@inqbeta/q-actions/core/mint';
import { doorSays } from '$lib/server/door';
import { isDevelopmentSite } from '$lib/server/site';
import { MintRefused, appendLedger, books, coinDesignOf, coinNameOf, decideMint, fileable, hostOf, mintIdentity, moneyOf, currencyOf, coinContactOf, readLedger } from '$lib/server/mint';
import { officeKind } from '@inqbeta/q-core/offices';
import { minorPerCredit } from '@inqbeta/q-core/currency';

export const prerender = false;

const REQUEST_SCHEMA = 'inqbeta.mint-request/1';
const FRESH_MS = 10 * 60 * 1000;
const MOST_AT_ONCE = 10_000;

async function context(origin: string) {
	const host = await hostOf(origin);
	if (!host) throw new MintRefused('This copy has no host set up yet.');
	const me = await mintIdentity();
	const state = await moneyOf(origin, host);
	/* The development site is test only, whatever the host's record says (ADR-Q-034 §5). */
	const mode = isDevelopmentSite(origin) ? 'test' : state.mode;
	/* One credit is one unit of the mint's currency: `unit` minor units (ADR-Q-042 §3). */
	const currency = currencyOf(state);
	const unit = minorPerCredit(currency);
	if (state.publication && state.publication.mint !== me.did) throw new MintRefused('The published mint isn’t this one: the mint’s key has changed since publishing.');
	return { host, me, state, mode, currency, unit };
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

/* The latest reconciliation in the books, and how many of the mint's own receipts have come since. */
function lastReconciliation(ledger: unknown[], mint: string, mode: string) {
	const recs = ledger.filter((r): r is ReconciliationReceipt => isReconciliation(r) && r.content.mint === mint && r.content.mode === mode).sort((a, b) => a.content.at.localeCompare(b.content.at));
	const last = recs.at(-1) ?? null;
	const movesSince = ledger.filter((r) => isMintEvent(r) && (!last || r.content.at > last.content.at)).length;
	return { last, movesSince };
}

const refuse = (e: unknown, status = 409) => json({ ok: false, says: e instanceof Error ? e.message : String(e) }, { status: e instanceof MintRefused ? status : 500 });

export const GET: RequestHandler = async ({ url }) => {
	try {
		const { host, me, state, mode, currency } = await context(url.origin);
		const ledger = await readLedger(host, me.did, mode);
		const b = books(ledger, me.did, mode, currency);
		return json({
			ok: true,
			mint: me.did,
			name: coinNameOf(state),
			design: coinDesignOf(state),
			/* Who answers for the coin (ADR-Q-037): the office, and who holds it today. Until office holders are published, the caretaker (the founder) answers. */
			contact: (() => {
				const office = coinContactOf(state);
				return { office, called: officeKind(office)?.called ?? office, answerer: host.founder, answererOffice: 'caretaker' };
			})(),
			mode,
			currency,
			publishedId: state.publishedId ?? null,
			/* The latest step in the mint's books: an ask signed on someone's device is dated after it. */
			lastAt: stampAfter(latestIn(ledger)),
			...(() => {
				const { last, movesSince } = lastReconciliation(ledger, me.did, mode);
				return { lastReconciled: last ? { at: last.content.at, by: last.content.by, hash: last.contentHash, receipt: last } : null, movesSince };
			})(),
			books: { minted: b.minted, destroyed: b.destroyed, circulation: b.circulation, cashReserve: b.cashReserve, capitalReserve: b.capitalReserve, reconciled: b.reconciled, backed: b.backed, holders: b.holders.size }
		});
	} catch (e) {
		return refuse(e);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	let body: { buy?: unknown; cashout?: unknown; file?: unknown; reconcile?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, says: 'That isn’t JSON.' }, { status: 400 });
	}
	try {
		const { host, me, mode, currency, unit } = await context(url.origin);
		const ledger = await readLedger(host, me.did, mode);
		/* The door (ADR-Q-034): while in test, only those let in may act. */
		const asker = ((body.buy ?? body.cashout ?? body.file ?? body.reconcile) as { did?: string } | undefined)?.did;
		const shut = isDevelopmentSite(url.origin) ? null : await doorSays(asker, host, mode);
		if (shut) return json({ ok: false, says: shut, door: 'closed' }, { status: 403 });

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
			const event: MintEvent = { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: me.did, kind: 'mint', credits, mode, to: r.did!, pence: credits * unit, cites: [`test-payment-${crypto.randomUUID()}`], at: stampAfter(latestIn(ledger)) };
			const draft = { did: me.did, content: event, contentHash: '' } as MintReceipt;
			const { facts } = mintFacts(ledger.map((json) => ({ json })), draft, currency);
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
			const account = ask.content.account;
			if (!account || typeof account.receipt !== 'string' || !/^\d{4}$/.test(account.ends ?? '')) throw new MintRefused('Set your cashing-out account in Settings first: cashing out pays only to it, as a standing order.');
			if (mode === 'live') throw new MintRefused('This host is live, and payouts aren’t connected yet. Your credits are untouched.');
			const prior = ledger.map((json) => ({ json }));
			const asked = mintFacts(prior, ask, currency);
			await decideMint('credits.cashout', ask.did, me.did, asked.facts);
			const burnEvent: MintEvent = { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: me.did, kind: 'burn', credits: ask.content.credits, mode, from: ask.content.from, pence: ask.content.credits * unit, asks: ask.contentHash, account, payout: `test-standing-order-${crypto.randomUUID()}`, at: stampAfter([...latestIn(ledger), ask.content.at]) };
			const draft = { did: me.did, content: burnEvent, contentHash: '' } as MintReceipt;
			const { facts } = mintFacts([...prior, { json: ask }], draft, currency);
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
		/* ---- Reconcile: the treasurer asks; the mint adds up its books and signs them ---- */
		if (body.reconcile) {
			const r = body.reconcile as { did?: string; contentHash?: string; content?: { schema?: string; mint?: string; at?: string; acting?: unknown } };
			if (!(await checkReceipt(r)).ok || r.content?.schema !== RECONCILE_ASK_SCHEMA) throw new MintRefused('The ask to reconcile isn’t signed.');
			/* Asked for by an office, not a person (ADR-Q-038 step 2): the treasurer, or the caretaker, in role, with a mandate that covers it. */
			const acting = await actingCovers(r.did ?? '', r.content.acting, { federation: host.federation, cmd: `${OFFICE_COMMANDS.money}/reconcile`, founder: host.founder, revoked: await revokedMandates(host) });
			if (!acting.ok) throw new MintRefused(acting.says);
			if (r.content.mint !== me.did) throw new MintRefused('That ask is for another bank.');
			if (!r.content.at || Math.abs(Date.now() - Date.parse(r.content.at)) > FRESH_MS) throw new MintRefused('That ask is too old. Try again.');
			const b = books(ledger, me.did, mode, currency);
			const own = ledger.filter((x) => isMintEvent(x)) as MintReceipt[];
			const latest = own.sort((x, y) => x.content.at.localeCompare(y.content.at)).at(-1) ?? null;
			const content: Reconciliation = {
				schema: RECONCILED_SCHEMA,
				source: MINT_SOURCE,
				mint: me.did,
				mode,
				books: { minted: b.minted, destroyed: b.destroyed, circulation: b.circulation, cashReserve: b.cashReserve, capitalReserve: b.capitalReserve, holders: b.holders.size, reconciled: b.reconciled, backed: b.backed },
				covers: { count: own.length, latest: latest?.contentHash ?? null },
				by: r.did!,
				byOffice: acting.office,
				...(acting.interest ? { byInterest: acting.interest } : {}),
				asks: r.contentHash ?? '',
				at: stampAfter([...latestIn(ledger), r.content.at])
			};
			const reconciliation = (await sealWith(me, content)) as ReconciliationReceipt;
			await appendLedger(host, me.did, mode, r as { contentHash: string });
			await appendLedger(host, me.did, mode, reconciliation);
			return json({ ok: true, reconciliation });
		}
		return json({ ok: false, says: 'Buy, cash out, file, or reconcile.' }, { status: 400 });
	} catch (e) {
		return refuse(e);
	}
};
