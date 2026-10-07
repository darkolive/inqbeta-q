/*
 * Treaties, server side (ADR-Q-042; 7 October 2026, E5). Each federation's
 * mint files the treaty in its own books as it's proposed and agreed, with the
 * office proof of whoever signed for each side. Nothing here moves money:
 * trading and settling under a treaty come later.
 */
import { nodeEngine } from '@inqbeta/q-actions/node';
import { TREATY_AGREE, treatyAgreeFacts } from '@inqbeta/q-actions/core/treaties';
import type { Side, Treaty } from '@inqbeta/q-core/treaties';
import { readRegistration } from '$lib/registry';
import { MintRefused } from './mint';

let agreeHash: string | null = null;

/** Both sides signed, each by a money office holder in role: checked by the rules. */
export async function decideTreatyAgree(t: Treaty, o: { actingA: unknown; actingB: unknown; founderA?: string; founderB?: string }): Promise<{ action: string; rules: string[] }> {
	/* Side A's holder signed when it was proposed; side B's just now. */
	const atProposal = await treatyAgreeFacts(t, { ...o, now: new Date(t.at) });
	const now = await treatyAgreeFacts(t, o);
	const facts = { ...now, holderAInRole: atProposal.holderAInRole };
	const engine = nodeEngine();
	agreeHash ??= await engine.load([TREATY_AGREE]);
	const d = engine.decide(agreeHash, { principal: { type: 'Person', id: t.signatures.at(-1)?.did ?? '' }, resource: { type: 'Federation', id: t.a.federation }, facts });
	if (!d.holds) throw new MintRefused(d.because.join(' '));
	return { action: agreeHash, rules: d.rules };
}

export interface Partner {
	side: Side;
	site: string;
	founder: string;
	/** Its published books, for the treaty's standing. */
	health: { drift: number; reconciled: string | null };
}

/** Another federation as a treaty partner: its registration with Incubator, then its own bank. */
export async function partnerOf(federation: string): Promise<Partner> {
	const { latest } = await readRegistration(federation);
	if (!latest) throw new MintRefused('That federation isn’t registered with Incubator.');
	if (!latest.holds) throw new MintRefused(`${latest.card.name}’s registration doesn’t hold: ${latest.says}`);
	const site = latest.card.site.replace(/\/$/, '');
	const r = await fetch(`${site}/api/mint`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
	const m = r?.ok ? ((await r.json().catch(() => null)) as { mint?: string; currency?: string; mode?: 'test' | 'live'; books?: { drift?: number }; lastReconciled?: { at?: string } | null; federation?: { federation?: string; card?: { hash?: string } | null } } | null) : null;
	if (!m?.mint || !m.currency || !m.mode) throw new MintRefused(`${latest.card.name}’s bank didn’t answer at ${site}.`);
	if (m.federation?.federation !== federation) throw new MintRefused(`The bank at ${site} is for another federation.`);
	if (!m.federation.card?.hash) throw new MintRefused(`${latest.card.name} hasn’t set its banking card yet: a treaty names both.`);
	return {
		side: { federation, name: latest.card.name, mint: m.mint, currency: m.currency, mode: m.mode, bankingCard: m.federation.card.hash },
		site,
		founder: latest.card.founder,
		health: { drift: m.books?.drift ?? 0, reconciled: m.lastReconciled?.at ?? null }
	};
}

/** The side as the partner's bank says it is now: a treaty naming anything else is refused. */
export function sideMatches(said: Side, now: Side): string | null {
	for (const k of ['federation', 'mint', 'currency', 'mode', 'bankingCard'] as const) if (said[k] !== now[k]) return `${now.name}’s ${k === 'bankingCard' ? 'banking card' : k} has changed since this was written. Write it again.`;
	return null;
}
