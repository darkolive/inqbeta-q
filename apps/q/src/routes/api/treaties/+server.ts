/*
 * Treaties between federations (ADR-Q-042; 7 October 2026, E5). Public to
 * read; each step filed in this federation's mint books.
 *
 *   GET                         this federation's treaties, with where each stands
 *   GET ?hash=                  one treaty, as filed here (the partner reads a proposal this way)
 *   GET ?partner=<federation>   that federation as a treaty side: from Incubator's registry and its own bank
 *   GET ?from=<host>&hash=      a proposal filed at another host, read for the person here (no cross-site fetch in the browser)
 *   POST { propose, acting }    side A: signed by the federation's key and a money office holder in role
 *   POST { agree, acting, from } side B: the same, then checked by the rules (treaty.agree), filed, and sent back to A
 *   POST { agreed, actingB }    side A, from B's host: checked the same way and filed
 *   POST { notice }             either side: notice to end it, signed by the federation's key
 *
 * While the host is in test, a person's POST asks the door first (ADR-Q-034).
 * Nothing here trades or settles: that comes with the money moving.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { actingCovers } from '@inqbeta/q-core/inrole';
import { OFFICE_COMMANDS } from '@inqbeta/q-core/offices';
import { sealWith } from '@inqbeta/q-core/seal';
import { FED_MONEY_SCHEMA, MINT_SOURCE, isReconciliation, type FedMoneyEntry, type FedMoneyReceipt } from '@inqbeta/q-core/mint';
import { hashTreaty, noticeSigned, treatyParts, type Ending, type PartnerHealth, type Treaty } from '@inqbeta/q-core/treaties';
import { federationAccount, federationTreaties } from '@inqbeta/q-core/federation-money';
import { MintRefused, LedgerMoved, appendLedger, books, currencyOf, hostOf, mintIdentity, moneyOf, readLedgerAt } from '$lib/server/mint';
import { decideTreatyAgree, partnerOf, sideMatches } from '$lib/server/treaties';
import { revokedMandates } from '$lib/server/revoked';
import { doorSays } from '$lib/server/door';
import { isDevelopmentSite } from '$lib/server/site';

export const prerender = false;
const MONEY = OFFICE_COMMANDS.money;

async function context(origin: string) {
	const host = await hostOf(origin);
	if (!host) throw new MintRefused('This copy has no host set up yet.');
	const me = await mintIdentity();
	const state = await moneyOf(origin, host);
	const mode = isDevelopmentSite(origin) ? ('test' as const) : state.mode;
	const { receipts: ledger, tip } = await readLedgerAt(host, me.did, mode);
	return { host, me, mode, currency: currencyOf(state), ledger, tip };
}
type Ctx = Awaited<ReturnType<typeof context>>;

const refuse = (e: unknown, status = 409) => json({ ok: false, says: e instanceof Error ? e.message : String(e) }, { status: e instanceof MintRefused ? status : 500 });

function ownHealth(c: Ctx): PartnerHealth {
	const b = books(c.ledger, c.me.did, c.mode, c.currency);
	const recs = c.ledger.filter((r) => isReconciliation(r) && r.content.mint === c.me.did && r.content.mode === c.mode).map((r) => (r as { content: { at: string } }).content.at).sort();
	return { drift: b.drift, reconciled: recs.at(-1) ?? null };
}

async function file(c: Ctx, kind: FedMoneyEntry['kind'], record: unknown) {
	const at = new Date(Math.max(Date.now(), ...c.ledger.map((r) => Date.parse((r as { content?: { at?: string } })?.content?.at ?? '') + 1).filter(Number.isFinite))).toISOString();
	const content: FedMoneyEntry = { schema: FED_MONEY_SCHEMA, source: MINT_SOURCE, mint: c.me.did, mode: c.mode, kind, federation: c.host.federation, record, at };
	const filed = (await sealWith(c.me, content)) as FedMoneyReceipt;
	await appendLedger(c.host, c.me.did, c.mode, filed, c.tip ?? undefined);
	return filed;
}

/** Our own side, as our bank has it now. */
async function ownSide(c: Ctx) {
	const acct = await federationAccount(c.ledger, books(c.ledger, c.me.did, c.mode, c.currency), { mint: c.me.did, mode: c.mode, federation: c.host.federation });
	return { federation: c.host.federation, mint: c.me.did, currency: c.currency, mode: c.mode, bankingCard: acct.card?.hash ?? '' };
}
function ourSideHolds(t: Treaty, side: 'a' | 'b', own: Awaited<ReturnType<typeof ownSide>>): string | null {
	if (!own.bankingCard) return 'Set the federation’s banking card first: a treaty names it.';
	for (const k of ['federation', 'mint', 'currency', 'mode', 'bankingCard'] as const) if (t[side][k] !== own[k]) return `This treaty names our ${k === 'bankingCard' ? 'banking card' : k} wrongly. Write it again.`;
	return null;
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const partner = url.searchParams.get('partner');
		if (partner) {
			const p = await partnerOf(partner);
			return json({ ok: true, side: p.side, site: p.site });
		}
		const from = url.searchParams.get('from');
		if (from) {
			if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(from) && !/^http:\/\/localhost(:\d+)?$/.test(from)) throw new MintRefused('That isn’t a host’s address.');
			const r = await fetch(`${from}/api/treaties?hash=${encodeURIComponent(url.searchParams.get('hash') ?? '')}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
			const j = r ? await r.json().catch(() => null) : null;
			return json(j ?? { ok: false, says: `${from} didn’t answer.` }, { status: r?.status ?? 502 });
		}
		const c = await context(url.origin);
		const health: Record<string, PartnerHealth> = { [c.host.federation]: ownHealth(c) };
		const hash = url.searchParams.get('hash');
		let ts = await federationTreaties(c.ledger, { mint: c.me.did, mode: c.mode, federation: c.host.federation });
		if (hash) {
			const t = ts.find((x) => x.hash === hash);
			return t ? json({ ok: true, treaty: t }) : json({ ok: false, says: 'No treaty by that name is filed here.' }, { status: 404 });
		}
		/* The partner's books, for treaties in force: a partner short of reserves or unreconciled suspends it. */
		for (const t of ts.filter((x) => x.inForceSince)) {
			const p = await partnerOf(t.partner.federation).catch(() => null);
			if (p) health[t.partner.federation] = p.health;
		}
		ts = await federationTreaties(c.ledger, { mint: c.me.did, mode: c.mode, federation: c.host.federation, health });
		return json({ ok: true, federation: c.host.federation, treaties: ts });
	} catch (e) {
		return refuse(e);
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	let body: { propose?: Treaty; agree?: Treaty; agreed?: Treaty; acting?: unknown; actingB?: unknown; from?: string; notice?: Ending };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, says: 'That isn’t JSON.' }, { status: 400 });
	}
	for (let attempt = 1; ; attempt++) {
		try {
			const c = await context(url.origin);
			const t = (body.propose ?? body.agree ?? body.agreed) as Treaty | undefined;
			/* The door: a person asking here (A proposing, B agreeing). A's host receiving B's signature is checked by its signatures instead. */
			if (body.propose || body.agree) {
				const asker = t?.signatures?.at(-1)?.did;
				const shut = isDevelopmentSite(url.origin) ? null : await doorSays(asker, c.host, c.mode);
				if (shut) return json({ ok: false, says: shut, door: 'closed' }, { status: 403 });
			}
			const own = await ownSide(c);
			const revoked = await revokedMandates(c.host);
			const inRole = async (holder: string | null, acting: unknown) => {
				const a = await actingCovers(holder ?? '', acting, { federation: c.host.federation, cmd: MONEY, founder: c.host.founder, revoked });
				if (!a.ok) throw new MintRefused(a.says);
			};

			/* ---- Side A proposes ---- */
			if (body.propose) {
				const t = body.propose;
				const parts = await treatyParts(t);
				if (!parts.termsOk) throw new MintRefused(parts.problem ?? 'Its terms don’t hold.');
				if (!parts.signedByA || parts.signedByB) throw new MintRefused('A proposal is signed by this federation’s key and one money office holder, and nobody else yet.');
				const ours = ourSideHolds(t, 'a', own);
				if (ours) throw new MintRefused(ours);
				await inRole(parts.holderA, body.acting);
				const p = await partnerOf(t.b.federation);
				const theirs = sideMatches(t.b, p.side);
				if (theirs) throw new MintRefused(theirs);
				const hash = await hashTreaty(t);
				const ts = await federationTreaties(c.ledger, { mint: c.me.did, mode: c.mode, federation: c.host.federation });
				if (!ts.some((x) => x.hash === hash)) await file(c, 'treaty', { treaty: t, actingA: body.acting });
				const link = `${p.site}/federations/one?id=${encodeURIComponent(t.b.federation)}&tab=bank&treaty=${encodeURIComponent(hash)}&from=${encodeURIComponent(url.origin)}`;
				return json({ ok: true, hash, link, says: `Proposed. Send ${p.side.name} the link: a money office holder there reads it and signs.` });
			}

			/* ---- Side B agrees, then tells A ---- */
			if (body.agree) {
				const t = body.agree;
				const from = String(body.from ?? '').replace(/\/$/, '');
				const parts = await treatyParts(t);
				if (!parts.signedByA || !parts.signedByB) throw new MintRefused('Sign it for this federation first.');
				const ours = ourSideHolds(t, 'b', own);
				if (ours) throw new MintRefused(ours);
				await inRole(parts.holderB, body.acting);
				const p = await partnerOf(t.a.federation);
				if (p.site !== from) throw new MintRefused(`${p.side.name} is at ${p.site}, not where this came from.`);
				const theirs = sideMatches(t.a, p.side);
				if (theirs) throw new MintRefused(theirs);
				const hash = await hashTreaty(t);
				/* What A filed, with its holder's office proof. */
				const r = await fetch(`${p.site}/api/treaties?hash=${encodeURIComponent(hash)}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
				const filedThere = r?.ok ? ((await r.json().catch(() => null)) as { treaty?: { actingA?: unknown } } | null) : null;
				if (!filedThere?.treaty) throw new MintRefused(`${p.side.name} hasn’t this proposal on file.`);
				const actingA = filedThere.treaty.actingA;
				const checked = await decideTreatyAgree(t, { actingA, actingB: body.acting, founderA: p.founder, founderB: c.host.founder });
				const ts = await federationTreaties(c.ledger, { mint: c.me.did, mode: c.mode, federation: c.host.federation });
				if (!ts.some((x) => x.hash === hash && x.inForceSince)) await file(c, 'treaty', { treaty: t, actingA, actingB: body.acting, checked });
				/* Tell A's bank: it checks the same and files it. */
				const back = await fetch(`${p.site}/api/treaties`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agreed: t, actingB: body.acting }), signal: AbortSignal.timeout(20_000) }).catch(() => null);
				const said = back ? ((await back.json().catch(() => ({}))) as { ok?: boolean; says?: string }) : null;
				return json({ ok: true, hash, toldPartner: !!said?.ok, says: said?.ok ? `Agreed, and filed by both banks. The treaty with ${p.side.name} is in force.` : `Agreed and filed here. ${p.side.name}’s bank didn’t take it yet${said?.says ? `: ${said.says}` : ''}. Send it again from the treaty below.` });
			}

			/* ---- Side A's bank hears from B's ---- */
			if (body.agreed) {
				const t = body.agreed;
				const hash = await hashTreaty(t);
				const ts = await federationTreaties(c.ledger, { mint: c.me.did, mode: c.mode, federation: c.host.federation });
				const mine = ts.find((x) => x.hash === hash);
				if (!mine || mine.side !== 'a') throw new MintRefused('We didn’t propose this treaty.');
				if (mine.inForceSince) return json({ ok: true, says: 'Already filed.' });
				const ours = ourSideHolds(t, 'a', own);
				if (ours) throw new MintRefused(ours);
				const p = await partnerOf(t.b.federation);
				const checked = await decideTreatyAgree(t, { actingA: mine.actingA, actingB: body.actingB, founderA: c.host.founder, founderB: p.founder });
				await file(c, 'treaty', { treaty: t, actingB: body.actingB, checked });
				return json({ ok: true, says: 'Filed. In force.' });
			}

			/* ---- Notice to end it ---- */
			if (body.notice) {
				const n = body.notice;
				const ts = await federationTreaties(c.ledger, { mint: c.me.did, mode: c.mode, federation: c.host.federation });
				const mine = ts.find((x) => x.hash === n?.treaty);
				if (!mine?.inForceSince) throw new MintRefused('There’s no treaty in force by that name.');
				if (!(await noticeSigned(n, mine.treaty))) throw new MintRefused('That notice isn’t signed by either federation’s key.');
				if (mine.ending) return json({ ok: true, says: 'Notice is already given.' });
				await file(c, 'treaty-notice', n);
				/* Tell the partner too, when it's ours to tell. */
				if (n.did === c.host.federation) {
					const p = await partnerOf(mine.partner.federation).catch(() => null);
					if (p) await fetch(`${p.site}/api/treaties`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notice: n }), signal: AbortSignal.timeout(20_000) }).catch(() => null);
				}
				return json({ ok: true, says: 'Notice given. It ends in 30 days, with a final settlement that day.' });
			}
			return json({ ok: false, says: 'Propose, agree, or give notice.' }, { status: 400 });
		} catch (e) {
			if (e instanceof LedgerMoved && attempt < 3) continue;
			if (e instanceof LedgerMoved) return json({ ok: false, says: 'The books are busy just now. Try again in a moment.' }, { status: 409 });
			return refuse(e);
		}
	}
};
