/*
 * Credits in Q (ADR-Q-023, 2 October 2026): buying, in test mode first.
 *
 * A move is signed by you, inspected by the rule engine (credits.buy, Cedar),
 * and kept in your vault only if it holds — with what the rules said written
 * into it. Your balance is added up from those receipts.
 */
import { sealWith } from '@inqbeta/q-core/seal';
import { saveLocked } from '@inqbeta/q-core/folder';
import type { Identity } from '@inqbeta/q-core/passkey';
import { CREDIT_SCHEMA, TEST_PACKS, buyFacts, lastMoveOf, type CreditMove, type Pack } from '@inqbeta/q-core/credits';
import { actionHash, decide } from '$lib/actions/engine';
import type { Ledger } from '$lib/ledger';

export { TEST_PACKS, type Pack };

export async function buyTestPack(
	identity: Identity,
	ledger: Ledger | null,
	pack: Pack
): Promise<{ ok: true; hash: string } | { ok: false; says: string; rules?: string[] }> {
	const prev = lastMoveOf(ledger?.receipts ?? [], identity.did);
	const move: CreditMove = {
		schema: CREDIT_SCHEMA,
		source: 'inqbeta:q/credits',
		kind: 'buy',
		credits: pack.credits,
		mode: 'test',
		to: identity.did,
		pack,
		at: new Date().toISOString(),
		follows: prev?.contentHash ?? null
	};
	try {
		const action = await actionHash('credits.buy');
		const decision = await decide(action, {
			principal: { type: 'Person', id: identity.did },
			resource: { type: 'Wallet', id: `${identity.did}#credits` },
			facts: buyFacts(move, [identity.did], TEST_PACKS, prev?.content.at)
		});
		if (!decision.holds) return { ok: false, says: decision.because.join(' '), rules: decision.rules };
		const signed = await sealWith(identity, { ...move, checked: { action, rules: decision.rules } });
		await saveLocked('credits', `credits-${move.at.slice(0, 19).replace(/[:T]/g, '-')}-${signed.contentHash.slice(0, 8)}.json`, JSON.stringify(signed, null, 2), 'application/json');
		return { ok: true, hash: signed.contentHash };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

export const kindSays: Record<CreditMove['kind'], string> = { buy: 'Bought', spend: 'Spent', reward: 'Rewarded', trade: 'Traded' };
