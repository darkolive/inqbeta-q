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
 * The federation's own account (ADR-Q-038 §8; 6 October 2026, C4), each filed
 * by the mint in its books:
 *   POST { fedcard }          its banking card, signed by the federation's key
 *   POST { fedminute }        a decision, minuted in role by the secretary or chair
 *   POST { fedask }           a cash-out for the federation, signed by one office holder in role
 *   POST { fedagree }         the same, signed by a second → checked (federation.spend), the credits destroyed, the payout recorded
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
import { officeAddressesFor } from '$lib/server/offices';
import { OFFICE_COMMANDS } from '@inqbeta/q-core/offices';
import { json, type RequestHandler } from '@sveltejs/kit';
import { sealWith, checkReceipt } from '@inqbeta/q-core/seal';
import { MINT_SCHEMA, MINT_SOURCE, RECONCILED_SCHEMA, RECONCILE_ASK_SCHEMA, isMintEvent, isReconciliation, valveOf, type Books, type MintEvent, type MintReceipt, type Reconciliation, type ReconciliationReceipt } from '@inqbeta/q-core/mint';
import { mintFacts } from '@inqbeta/q-actions/core/mint';
import { doorSays } from '$lib/server/door';
import { isDevelopmentSite } from '$lib/server/site';
import { checkBankingCard } from '@inqbeta/q-core/treaties';
import { checkCosigned, hashCosigned, type Cosigned } from '@inqbeta/q-core/cosign';
import { decisionCovers, type DecisionReceipt } from '@inqbeta/q-core/decisions';
import { federationAccount } from '@inqbeta/q-core/federation-money';
import { FED_MONEY_SCHEMA, type FedMoneyEntry, type FedMoneyReceipt } from '@inqbeta/q-core/mint';
import { spendFacts } from '@inqbeta/q-actions/core/federation-money';
import { MintRefused, decideFederationSpend, appendLedger, books, coinDesignOf, coinNameOf, decideMint, fileable, hostOf, mintIdentity, moneyOf, currencyOf, coinContactOf, readLedger, readLedgerAt, LedgerMoved } from '$lib/server/mint';
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
/* The safety valve (ADR-Q-027 addendum; job D3): drift, and how long since the books were reconciled. */
function valveFor(ledger: unknown[], b: Books, mint: string, mode: string) {
	const { last } = lastReconciliation(ledger, mint, mode);
	const opened = ledger.filter((r): r is MintReceipt => isMintEvent(r) && r.content.mint === mint && r.content.mode === mode).map((r) => r.content.at).sort()[0] ?? null;
	return valveOf(b, { lastReconciledAt: last?.content.at ?? null, openedAt: opened });
}

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
			contact: await (async () => {
				const office = coinContactOf(state);
				/* Whoever holds the office now, from their own signed notices; with nobody in it, the caretaker answers. */
				const holders = (await officeAddressesFor(host)).filter((a) => a.office === office).map((a) => ({ holder: a.holder, inbox: a.inbox, ...(a.hours ? { hours: a.hours } : {}), ...(a.officeKey ? { officeKey: a.officeKey } : {}) }));
				return { office, called: officeKind(office)?.called ?? office, answerer: holders[0]?.holder ?? host.founder, answererOffice: holders.length ? office : 'caretaker', holders };
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
			books: { minted: b.minted, destroyed: b.destroyed, circulation: b.circulation, cashReserve: b.cashReserve, capitalReserve: b.capitalReserve, reconciled: b.reconciled, backed: b.backed, holders: b.holders.size, drift: b.drift },
			valve: (({ shut, warn, drift, unknown, says }) => ({ shut, warn, drift, unknown, says }))(valveFor(ledger, b, me.did, mode)),
			/* The federation's own account (ADR-Q-038 §8): open to read, like the rest of the bank. */
			federation: await federationAccount(ledger, b, { mint: me.did, mode, federation: host.federation })
		});
	} catch (e) {
		return refuse(e);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	let body: { buy?: unknown; cashout?: unknown; file?: unknown; reconcile?: unknown; fedcard?: unknown; fedminute?: unknown; fedask?: unknown; fedagree?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, says: 'That isn’t JSON.' }, { status: 400 });
	}
	/* A cash-out or a spend is filed only on the books it was decided on; if they moved, read again and decide again (audit A4). */
	for (let attempt = 1; ; attempt++) {
		try {
			const { host, me, mode, currency, unit } = await context(url.origin);
			const { receipts: ledger, tip } = await readLedgerAt(host, me.did, mode);
			/* The door (ADR-Q-034): while in test, only those let in may act. */
			const lastSigner = (x: unknown) => ((x as Cosigned | undefined)?.signatures ?? []).at(-1)?.did;
			const asker = body.fedask || body.fedagree ? lastSigner(body.fedask ?? body.fedagree) : ((body.buy ?? body.cashout ?? body.file ?? body.reconcile ?? body.fedcard ?? body.fedminute) as { did?: string } | undefined)?.did;
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
				/* The safety valve: paused cash-outs say why, in one sentence; buying is never paused. */
				const valve = valveFor(ledger, books(ledger, me.did, mode, currency), me.did, mode);
				if (valve.shut) throw new MintRefused(valve.says);
				const asked = mintFacts(prior, ask, currency, { valveShut: valve.shut });
				await decideMint('credits.cashout', ask.did, me.did, asked.facts);
				const burnEvent: MintEvent = { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: me.did, kind: 'burn', credits: ask.content.credits, mode, from: ask.content.from, pence: ask.content.credits * unit, asks: ask.contentHash, account, payout: `test-standing-order-${crypto.randomUUID()}`, at: stampAfter([...latestIn(ledger), ask.content.at]) };
				const draft = { did: me.did, content: burnEvent, contentHash: '' } as MintReceipt;
				const { facts } = mintFacts([...prior, { json: ask }], draft, currency);
				const checked = await decideMint('credits.burn', me.did, me.did, facts);
				const burned = (await sealWith(me, { ...burnEvent, checked })) as MintReceipt;
				/* The ask goes in only on the books it was decided on; then the burn that answers it. */
				await appendLedger(host, me.did, mode, ask, tip);
				await appendLedger(host, me.did, mode, burned);
				return json({ ok: true, ask, burned });
			}

			/* ---- File: an agreement step in this mint's credits ---- */
			if (body.file) {
				const wrong = await fileable(body.file, me.did, mode, ledger);
				if (wrong) throw new MintRefused(wrong);
				await appendLedger(host, me.did, mode, body.file as { contentHash: string }, tip);
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
			/* ---- The federation's own account (ADR-Q-038 §8) ---- */
			const fileFed = async (kind: FedMoneyEntry['kind'], record: unknown, extra: Partial<FedMoneyEntry> = {}, onTip?: number) => {
				const content: FedMoneyEntry = { schema: FED_MONEY_SCHEMA, source: MINT_SOURCE, mint: me.did, mode, kind, federation: host.federation, record, ...extra, at: stampAfter(latestIn(ledger)) };
				const filed = (await sealWith(me, content)) as FedMoneyReceipt;
				await appendLedger(host, me.did, mode, filed, onTip);
				return filed;
			};
			const revoked = () => revokedMandates(host);
			if (body.fedcard) {
				const c = await checkBankingCard(body.fedcard, host.federation);
				if (!c.ok) throw new MintRefused(c.says);
				await fileFed('bank-card', body.fedcard, {}, tip ?? undefined);
				return json({ ok: true, says: c.says });
			}
			if (body.fedminute) {
				const d = await decisionCovers(body.fedminute, { federation: host.federation, founder: host.founder, revoked: await revoked() });
				if (!d.ok) throw new MintRefused(d.says);
				await fileFed('decision', body.fedminute, {}, tip ?? undefined);
				return json({ ok: true, says: d.says });
			}
			if (body.fedask || body.fedagree) {
				const cos = (body.fedask ?? body.fedagree) as Cosigned;
				const action = (cos?.action ?? {}) as { credits?: number; to?: string; decision?: string };
				if (cos?.federation !== host.federation) throw new MintRefused('That’s another federation’s money.');
				if (cos.cmd !== `${OFFICE_COMMANDS.money}/cash-out`) throw new MintRefused('Only a cash-out for the federation is asked here.');
				const credits = Math.trunc(Number(action.credits));
				if (credits !== action.credits || !(credits >= 1 && credits <= MOST_AT_ONCE)) throw new MintRefused(`Cash out between 1 and ${MOST_AT_ONCE} credits at a time.`);
				const b = books(ledger, me.did, mode, currency);
				const acct = await federationAccount(ledger, b, { mint: me.did, mode, federation: host.federation });
				if (!acct.card) throw new MintRefused('Set the federation’s banking card first: the federation is paid only into it.');
				const decision = acct.decisions.find((d) => d.hash === action.decision);
				if (!decision) throw new MintRefused('Name a decision that allows it: minuted by the secretary or chair.');
				const hash = await hashCosigned(cos);
				const c = await checkCosigned(cos, { founder: host.founder, revoked: await revoked() });
				if (body.fedask) {
					if (c.ok || !c.waiting) throw new MintRefused(c.ok ? 'This already has two signatures: send it to be paid.' : c.says);
					if (acct.waiting.some((w) => w.hash === hash)) return json({ ok: true, says: 'It’s already waiting for a second signature.' });
					if (credits > acct.spendable) throw new MintRefused(`The federation can move ${acct.spendable} credits just now.`);
					await fileFed('asked', cos, { credits, decision: decision.hash }, tip ?? undefined);
					return json({ ok: true, says: 'Asked. It waits on the federation’s books for a second office holder to sign.' });
				}
				/* Agreed by two: the rules, the valve, then filed and paid. */
				if (!acct.waiting.some((w) => w.hash === hash)) throw new MintRefused('That cash-out wasn’t asked here, or it’s already been paid.');
				const valve = valveFor(ledger, b, me.did, mode);
				const facts = await spendFacts(cos, decision.receipt, { federation: host.federation, account: acct.card.hash, spentSoFar: decision.spent, valveShut: valve.shut, founder: host.founder, revoked: await revoked() });
				await decideFederationSpend(lastSigner(cos) ?? '', host.federation, facts);
				if (mode === 'live') throw new MintRefused('This host is live, and payouts aren’t connected yet. The federation’s credits are untouched.');
				const agreed = await fileFed('agreed', cos, { credits, decision: decision.hash }, tip ?? undefined);
				const prior = [...ledger, agreed].map((json) => ({ json }));
				const account = { receipt: acct.card.hash, ends: acct.card.ends };
				const burnEvent: MintEvent = { schema: MINT_SCHEMA, source: MINT_SOURCE, mint: me.did, kind: 'burn', credits, mode, from: host.federation, pence: credits * unit, asks: agreed.contentHash, account, payout: `test-standing-order-${crypto.randomUUID()}`, at: stampAfter([...latestIn(ledger), agreed.content.at]) };
				const { facts: burnFacts } = mintFacts(prior, { did: me.did, content: burnEvent, contentHash: '' } as MintReceipt, currency);
				const checked = await decideMint('credits.burn', me.did, me.did, burnFacts);
				const burned = (await sealWith(me, { ...burnEvent, checked })) as MintReceipt;
				await appendLedger(host, me.did, mode, burned);
				return json({ ok: true, says: `Paid: ${credits} credits to the federation’s account ending ${acct.card.ends}.`, burned });
			}
			return json({ ok: false, says: 'Buy, cash out, file, or reconcile.' }, { status: 400 });
		} catch (e) {
			if (e instanceof LedgerMoved && attempt < 3) continue;
			if (e instanceof LedgerMoved) return json({ ok: false, says: 'The books are busy just now. Try again in a moment.' }, { status: 409 });
			return refuse(e);
		}
	}
};
