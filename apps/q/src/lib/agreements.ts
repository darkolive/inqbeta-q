/*
 * Agreements in Q (ADR-Q-025, 3 October 2026): agree first — the contract
 * point — then settle, which is the accounting.
 *
 * Every step you take is read against the chain so far, decided by the rule
 * engine (agreement.*, Cedar), signed with what the rules said written in,
 * kept in your vault's agreements folder, and sent to the other person inside
 * a sealed message, where their Q keeps it too (messages.ts). Each side holds
 * every step, so either can show what was agreed and how it was settled.
 *
 * Credits: what you hold is your credit moves plus what agreements have
 * settled (balances only ever come from settlements both have signed).
 * What you can still promise is that, less what other agreements have
 * committed. Q can't see the other person's wallet: their own Q checks their
 * side when they act.
 */
import { sealWith } from '@inqbeta/q-core/seal';
import type { Identity } from '@inqbeta/q-core/passkey';
import { balanceOf } from '@inqbeta/q-core/credits';
import {
	AGREEMENT_SCHEMA,
	AGREEMENT_SOURCE,
	committedBy,
	effectOf,
	isAgreementStep,
	isOpenOffer,
	isStandingOffer,
	standingOf,
	type AgreementReceipt,
	type AgreementStep,
	type Standing,
	type Terms
} from '@inqbeta/q-core/agreements';
import { agreementFacts, type Wallets } from '@inqbeta/q-actions/core/agreements';
import { actionHash, decide } from '$lib/actions/engine';
import { keepStep, sendTo } from '$lib/messages';
import { refreshLedger, type Ledger } from '$lib/ledger';
import type { Person } from '$lib/people';
import { fileWithMint, mintBalance, type MintView } from '$lib/money';

export interface AgreementView {
	id: string;
	steps: AgreementReceipt[];
	standing: Standing;
	/** The newest step's time, for sorting. */
	at: string;
	/** A shop listing (a standing offer), rather than an agreement with someone. */
	listing: boolean;
}

/** Every agreement in your vault, newest activity first. */
export function agreementsFrom(ledger: Ledger | null): AgreementView[] {
	const by = new Map<string, AgreementReceipt[]>();
	for (const r of ledger?.receipts ?? []) {
		if (r.holds === 'no' || !isAgreementStep(r.json)) continue;
		const id = r.json.content.agreement;
		by.set(id, [...(by.get(id) ?? []), r.json]);
	}
	/* A purchase from a shop (ADR-Q-026) reads with the shop offer it took, which carries the listing's id. */
	const listingOf = (steps: AgreementReceipt[]) => {
		const taken = steps.find((s) => s.content.step === 'taken');
		if (!taken) return [];
		const dot = taken.content.agreement.lastIndexOf('.');
		return (by.get(taken.content.agreement.slice(0, dot)) ?? []).filter((s) => s.contentHash === taken.content.parent);
	};
	return [...by.entries()]
		.map(([id, own]) => {
			const steps = [...listingOf(own), ...own];
			const standing = standingOf(steps);
			const at = own.map((s) => s.content.at).sort().at(-1) ?? '';
			const listing = !!standing.limit && !standing.takenFrom;
			return { id, steps: [...new Map(steps.map((s) => [s.contentHash, s])).values()].sort((a, b) => a.content.at.localeCompare(b.content.at)), standing, at, listing };
		})
		.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Credits you can use: the host's mint (ADR-Q-027) — what it made for you,
 * less what you cashed out or have asked to, plus what agreements in its
 * credits moved — and any older credit moves and agreements from before the
 * mint, which name no mint.
 */
export function creditsHeld(ledger: Ledger | null, did: string, mode: 'test' | 'live', mint?: MintView | null): number {
	const moves = balanceOf(ledger?.receipts ?? [], did, mode);
	const older = agreementsFrom(ledger).reduce(
		(n, a) => n + effectOf(a.standing.settled.flat().filter((e) => !('credits' in e.value) || !e.value.mint), did).credits[mode],
		0
	);
	const minted = mint && mint.mode === mode ? mintBalance(ledger, mint, did).spendable : 0;
	return moves + older + minted;
}

/** Credits held for agreements that aren't settled yet (open offers you made, and agreed but unsettled). */
export function creditsCommitted(ledger: Ledger | null, did: string, mode: 'test' | 'live', except?: string): number {
	return agreementsFrom(ledger)
		.filter((a) => a.id !== except)
		.reduce((n, a) => n + committedBy(a.standing, did, mode), 0);
}

/* Big enough never to be the reason: for wallets Q can't see. */
const UNSEEN = 1_000_000_000;

function walletsFor(ledger: Ledger | null, me: string, agreement: string, mint?: MintView | null, stockLeft?: number): Wallets {
	return {
		...(stockLeft !== undefined ? { stockLeft } : {}),
		balance: (did, mode) => (did === me ? creditsHeld(ledger, did, mode, mint) : UNSEEN),
		available: (did, mode) => (did === me ? creditsHeld(ledger, did, mode, mint) - creditsCommitted(ledger, did, mode, agreement) : UNSEEN)
	};
}

export type StepInput = Omit<AgreementStep, 'schema' | 'source' | 'agreement' | 'at' | 'checked'>;

/**
 * Take a step: decided by the rules, signed, kept, and sent to the other
 * person. Refused steps are never signed; the answer says why, in words.
 */
export async function takeStep(
	identity: Identity,
	ledger: Ledger | null,
	agreement: string,
	input: StepInput,
	people: Person[],
	mint?: MintView | null,
	opts: {
		/** The steps before, when they aren't yet an agreement in your vault (buying: the shop offer). */
		prior?: AgreementReceipt[];
		/** Buying: how many the shop says are left. */
		stockLeft?: number;
		/** After signing, before keeping: a reason not to go on (the shop sold out first), or null. */
		before?: (signed: AgreementReceipt) => Promise<string | null>;
	} = {}
): Promise<{ ok: true; signed: AgreementReceipt; sent: boolean; says?: string } | { ok: false; says: string; rules?: string[] }> {
	const prior = opts.prior ?? agreementsFrom(ledger).find((a) => a.id === agreement)?.steps ?? [];
	const content: AgreementStep = { schema: AGREEMENT_SCHEMA, source: AGREEMENT_SOURCE, agreement, at: new Date().toISOString(), ...input };
	const draft = { did: identity.did, content, contentHash: '', signedAt: content.at } as AgreementReceipt;
	try {
		const { action, facts } = agreementFacts(prior, draft, walletsFor(ledger, identity.did, agreement, mint, opts.stockLeft));
		const hash = await actionHash(action);
		const decision = await decide(hash, {
			principal: { type: 'Person', id: identity.did },
			resource: { type: 'Agreement', id: agreement },
			facts
		});
		if (!decision.holds) return { ok: false, says: decision.because.join(' '), rules: decision.rules };
		const signed = (await sealWith(identity, { ...content, checked: { action: hash, rules: decision.rules } })) as AgreementReceipt;
		const stop = opts.before ? await opts.before(signed) : null;
		if (stop) return { ok: false, says: stop };
		await keepStep(signed);

		/* Send it to the other person, if Q knows where they are. */
		const terms: Terms | null | undefined = content.terms ?? standingOf(prior).terms;
		const them = terms ? (terms.a === identity.did ? terms.b : terms.a) : '';
		/* An open offer you've just made has nobody to send to yet: you share it by link. */
		const person = people.find((p) => p.did === them);
		let sent = false;
		let says: string | undefined;
		if (!them) says = undefined;
		else if (person?.inbox) {
			const out = await sendTo(person, { kind: 'agreement', step: signed });
			sent = out.ok;
			if (!out.ok) says = `Kept in your vault, but not sent yet: ${out.says}`;
		} else says = 'Kept in your vault. Q doesn’t know where to send it yet.';
		/* In the mint's credits: filed in its ledger, so every credit's whereabouts is known (ADR-Q-027). */
		const inMint = !!terms && [terms.aGives, terms.bGives].some((v) => 'credits' in v && !!v.mint);
		/* Every step of the chain, each time: the ledger keeps one copy, so a step missed before is filed now. */
		if (inMint) {
			let last = false;
			for (const r of [...prior, signed]) last = await fileWithMint(r);
			if (!last) says = [says, 'The mint’s ledger didn’t take it just now; it will be filed again with the next step.'].filter(Boolean).join(' ');
		}
		await refreshLedger();
		return { ok: true, signed, sent, says };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** A new agreement's id. */
export const newAgreementId = () => crypto.randomUUID();

/** Does this agreement need your answer? Decided in q-core, beside agreementNow. */
export { needsMe } from '@inqbeta/q-core/agreements';

/** Where an agreement stands, in a few words, from your side. */
export function standingWords(s: Standing, me: string): { text: string; tone: 'good' | 'waiting' | 'needs-you' | 'plain' | 'bad' } {
	if (s.phase === 'complete') return { text: 'Settled', tone: 'good' };
	if (isStandingOffer(s)) return s.offeredBy === me ? { text: 'In your shop', tone: 'good' } : { text: 'In a shop', tone: 'plain' };
	if (s.ended === 'sold-out') return { text: 'Sold out, cancelled', tone: 'plain' };
	if (s.takenFrom && s.terms?.service?.kind === 'pass-through' && s.phase === 'agreed' && !s.pending) return { text: s.terms.a === me ? 'Hired: paid as it’s used' : 'Hired: settle for what it held', tone: 'plain' };
	if (s.takenFrom && s.phase === 'agreed' && !s.settled.length && !s.pending) return { text: s.terms?.a === me ? 'Sold: waiting to be paid' : 'Bought: pay when ready', tone: s.terms?.a === me ? 'waiting' : 'needs-you' };
	if (isOpenOffer(s) && s.offeredBy === me) return { text: 'Shared by link', tone: 'waiting' };
	if (isOpenOffer(s)) return { text: 'Your answer', tone: 'needs-you' };
	if (s.phase === 'ended') return { text: s.ended === 'declined' ? 'Declined' : s.ended === 'withdrawn' ? 'Withdrawn' : 'Ran out', tone: 'plain' };
	if (s.waitingFor === me) return { text: s.phase === 'agreeing' ? 'Your answer' : 'Confirm the settlement', tone: 'needs-you' };
	if (s.phase === 'agreeing') return { text: 'Waiting for an answer', tone: 'waiting' };
	if (s.settled.length) return { text: 'Partly settled', tone: 'waiting' };
	return { text: 'Agreed', tone: 'good' };
}
