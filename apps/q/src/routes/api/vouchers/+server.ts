/*
 * Given vouchers in the host's bank (ADR-Q-044 step 6; 8 October 2026).
 *
 * A grant is a voucher, given, bound, with a realm. Its credits stay in the
 * giver's account, held behind each copy handed out; when an accepted
 * provider honours a copy, the bank pays them; when it ends, what's unspent
 * returns. The holder holds a voucher, never credits.
 *
 *   GET ?voucher=<hash>          where each given copy stands: held, paid, returned
 *   POST { give: copy }          the giver hands out a copy → checked (voucher.issue), its worth held behind it
 *   POST { pay: redemption }     signed by holder and provider → checked (voucher.redeem), the provider paid
 *   POST { return: { voucher, number } }  after it ends → what's held goes back to the giver
 *
 * In test, nothing moves but the bank's own records. While the host is in
 * test, every POST asks the door first (ADR-Q-034).
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { sealWith } from '@inqbeta/q-core/seal';
import { MINT_SOURCE, VOUCHER_MONEY_SCHEMA, givenCopies, spendable, type VoucherMoneyEntry } from '@inqbeta/q-core/mint';
import { checkVoucher, heldSignedBy, redemptionSigned, type Redemption, type VoucherHeld, type VoucherReceipt } from '@inqbeta/q-core/vouchers';
import { VOUCHER_ISSUE, VOUCHER_REDEEM, voucherIssueFacts, voucherRedeemFacts } from '@inqbeta/q-actions/core/vouchers';
import { nodeEngine } from '@inqbeta/q-actions/node';
import { MintRefused, LedgerMoved, appendLedger, books, currencyOf, hostOf, mintIdentity, moneyOf, readLedgerAt } from '$lib/server/mint';
import { doorSays } from '$lib/server/door';
import { isDevelopmentSite } from '$lib/server/site';

export const prerender = false;

async function context(origin: string) {
	const host = await hostOf(origin);
	if (!host) throw new MintRefused('This copy has no host set up yet.');
	if (!host.storage) throw new MintRefused('This host has no storage node for vouchers yet.');
	const me = await mintIdentity();
	const state = await moneyOf(origin, host);
	const mode = isDevelopmentSite(origin) ? ('test' as const) : state.mode;
	const { receipts: ledger, tip } = await readLedgerAt(host, me.did, mode);
	return { host, storage: host.storage, me, mode, currency: currencyOf(state), ledger, tip };
}
type Ctx = Awaited<ReturnType<typeof context>>;

/** The voucher and everything the node keeps of it: its copies and redemptions. */
async function voucherAt(c: Ctx, hash: string) {
	if (!/^[A-Za-z0-9_-]{43}$/.test(hash)) throw new MintRefused('That isn’t a voucher’s name.');
	const r = await fetch(`${c.storage}/voucher/${hash}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
	const j = r?.ok ? ((await r.json().catch(() => null)) as { voucher?: VoucherReceipt; copies?: VoucherHeld[]; redemptions?: Redemption[] } | null) : null;
	if (!j?.voucher || j.voucher.contentHash !== hash) throw new MintRefused('The node doesn’t have that voucher.');
	const ok = await checkVoucher(j.voucher);
	if (!ok.ok) throw new MintRefused(ok.says);
	const v = j.voucher;
	const p = v.content.price;
	if (p.paid || p.from !== 'credits') throw new MintRefused('Only a voucher given from credits has credits held behind it.');
	if (p.mint !== c.me.did) throw new MintRefused('That voucher’s credits are in another bank.');
	return { v, worth: p.worth, copies: j.copies ?? [], redemptions: j.redemptions ?? [] };
}

let hashes: Record<string, string> = {};
async function decide(action: typeof VOUCHER_ISSUE, principal: string, voucher: string, facts: Record<string, unknown>) {
	const engine = nodeEngine();
	hashes[action.id] ??= await engine.load([action]);
	const d = engine.decide(hashes[action.id], { principal: { type: 'Person', id: principal }, resource: { type: 'Voucher', id: voucher }, facts });
	if (!d.holds) throw new MintRefused(d.because.join(' '));
	return { action: hashes[action.id], rules: d.rules };
}

async function file(c: Ctx, e: Omit<VoucherMoneyEntry, 'schema' | 'source' | 'mint' | 'mode' | 'at'>) {
	const at = new Date(Math.max(Date.now(), ...c.ledger.map((r) => Date.parse((r as { content?: { at?: string } })?.content?.at ?? '') + 1).filter(Number.isFinite))).toISOString();
	const content: VoucherMoneyEntry = { schema: VOUCHER_MONEY_SCHEMA, source: MINT_SOURCE, mint: c.me.did, mode: c.mode, ...e, at };
	const filed = await sealWith(c.me, content);
	await appendLedger(c.host, c.me.did, c.mode, filed, c.tip ?? undefined);
	return filed;
}

const refuse = (e: unknown) => json({ ok: false, says: e instanceof Error ? e.message : String(e) }, { status: e instanceof MintRefused ? 409 : 500 });

export const GET: RequestHandler = async ({ url }) => {
	try {
		const c = await context(url.origin);
		const hash = url.searchParams.get('voucher') ?? '';
		const g = givenCopies(c.ledger, c.me.did, c.mode, hash);
		return json({ ok: true, mint: c.me.did, copies: [...g].map(([number, x]) => ({ number, ...x })) });
	} catch (e) {
		return refuse(e);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	let body: { give?: VoucherHeld; pay?: Redemption; return?: { voucher?: string; number?: number } };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, says: 'That isn’t JSON.' }, { status: 400 });
	}
	for (let attempt = 1; ; attempt++) {
		try {
			const c = await context(url.origin);
			const asker = body.give?.signatures?.at(-1)?.did ?? body.pay?.signatures?.at(-1)?.did;
			if (asker) {
				const shut = isDevelopmentSite(url.origin) ? null : await doorSays(asker, c.host, c.mode);
				if (shut) return json({ ok: false, says: shut, door: 'closed' }, { status: 403 });
			}

			/* ---- The giver hands out a copy: its worth held behind it ---- */
			if (body.give) {
				const copy = body.give;
				const { v, worth, copies } = await voucherAt(c, copy.voucher);
				if (!(await heldSignedBy(copy, 'from')) || copy.from !== v.content.issuer) throw new MintRefused('A copy is handed out signed by the voucher’s giver.');
				const now = givenCopies(c.ledger, c.me.did, c.mode, v.contentHash);
				if (now.has(copy.number)) return json({ ok: true, says: 'Its credits are already held.' });
				/* Handing it out is the giver's word that the holder qualifies under its programme (ADR-Q-036 §3): nobody else's attestation is read yet. */
				const checked = await decide(VOUCHER_ISSUE, v.content.issuer, v.contentHash, await voucherIssueFacts(v, copy, copies, { by: v.content.issuer, eligible: true }));
				const b = books(c.ledger, c.me.did, c.mode, c.currency);
				if (spendable(b, v.content.issuer) < worth) throw new MintRefused(`The giver has ${spendable(b, v.content.issuer)} credits free; this copy needs ${worth} held behind it.`);
				await file(c, { kind: 'held', voucher: v.contentHash, number: copy.number, giver: v.content.issuer, credits: worth, record: { copy, checked } });
				return json({ ok: true, says: `${worth} credits are held behind copy ${copy.number}.` });
			}

			/* ---- Honoured by a provider: the bank pays them ---- */
			if (body.pay) {
				const r = body.pay;
				const { v, copies, redemptions } = await voucherAt(c, r.voucher);
				if (!(await redemptionSigned(r))) throw new MintRefused('A redemption is signed by its holder and whoever honours it.');
				const held = givenCopies(c.ledger, c.me.did, c.mode, v.contentHash).get(r.number);
				if (!held) throw new MintRefused('Nothing is held behind that copy.');
				if (held.state !== 'held') return json({ ok: true, says: held.state === 'paid' ? 'It’s already been paid.' : 'What was held has gone back to the giver.' });
				const others = redemptions.filter((x) => !(x.number === r.number && x.redeemer === r.redeemer && x.at === r.at));
				const checked = await decide(VOUCHER_REDEEM, r.redeemer, v.contentHash, await voucherRedeemFacts(v, r, copies, others, { by: r.redeemer }));
				if (r.redeemer === v.content.issuer) {
					await file(c, { kind: 'returned', voucher: v.contentHash, number: r.number, giver: v.content.issuer, credits: held.credits, record: { redemption: r, checked } });
					return json({ ok: true, says: 'Redeemed with the giver itself: what was held is theirs again.' });
				}
				await file(c, { kind: 'paid', voucher: v.contentHash, number: r.number, giver: v.content.issuer, credits: held.credits, to: r.redeemer, record: { redemption: r, checked } });
				return json({ ok: true, says: `Paid: ${held.credits} credits to whoever honoured it.` });
			}

			/* ---- Ended: what's unspent returns ---- */
			if (body.return) {
				const { v } = await voucherAt(c, String(body.return.voucher ?? ''));
				const n = Number(body.return.number);
				const ends = v.content.ends;
				if (!ends || Date.parse(ends.at) > Date.now()) throw new MintRefused('It hasn’t ended yet.');
				const held = givenCopies(c.ledger, c.me.did, c.mode, v.contentHash).get(n);
				if (!held || held.state !== 'held') return json({ ok: true, says: 'Nothing is held behind that copy now.' });
				await file(c, { kind: 'returned', voucher: v.contentHash, number: n, giver: v.content.issuer, credits: held.credits, record: { ended: ends.at } });
				return json({ ok: true, says: `${held.credits} credits returned to the giver.` });
			}
			return json({ ok: false, says: 'Give, pay or return.' }, { status: 400 });
		} catch (e) {
			if (e instanceof LedgerMoved && attempt < 3) continue;
			if (e instanceof LedgerMoved) return json({ ok: false, says: 'The books are busy just now. Try again in a moment.' }, { status: 409 });
			return refuse(e);
		}
	}
};
