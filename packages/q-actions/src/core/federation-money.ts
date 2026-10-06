/*
 * federation.spend — the federation's own money, moved in role (ADR-Q-038 §8;
 * ADR-Q-007 the Money block), 6 October 2026. A spend or cash-out from the
 * federation's account needs: two office holders with the money mandate, in
 * role, signing the same words (q-core cosign); a recorded decision that
 * allows it (q-core decisions); and the federation's own account as the place
 * it's paid, unless the decision names a payee. Who decided and who actioned
 * it are both on the record.
 */
import { ACTION_SCHEMA, type ActionDefinition } from '../actions';
import { CEDAR_VERSION } from '../version';
import { checkCosigned } from '@inqbeta/q-core/cosign';
import { decisionCovers } from '@inqbeta/q-core/decisions';

const on = (id: string) => `principal, action == Action::"${id}", resource`;
const rule = (action: string, kind: 'may' | 'must' | 'cannot', slug: string, says: string, when?: string) => ({
	[`${action}/${kind}/${slug}`]: when
		? {
				kind,
				says,
				checked: 'enforced' as const,
				policy: `@id("${action}/${kind}/${slug}")\n${kind === 'may' ? 'permit' : 'forbid'} (${on(action)})\nwhen { ${when} };`
			}
		: { kind, says, checked: 'declared' as const }
});

export const FEDERATION_SPEND: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'federation.spend',
	version: '1.0.0',
	by: 'q:core',
	says: 'The federation’s own credits are spent or cashed out, in role: two office holders sign, naming the decision that allows it.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "federation.spend" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    twoHolders: Bool,
    waitingForSecond: Bool,
    hasDecision: Bool,
    paidRightly: Bool,
    valveOpen: Bool,
  }
};`,
	rules: {
		...rule('federation.spend', 'may', 'spend', 'Spend or cash out the federation’s credits, signed by two office holders in role', 'context.twoHolders'),
		...rule('federation.spend', 'cannot', 'one-purse', 'Be done by one person holding the purse alone', '!context.twoHolders'),
		...rule('federation.spend', 'must', 'decision', 'Name the recorded decision that allows it, for at least this much', '!context.hasDecision'),
		...rule('federation.spend', 'must', 'paid-rightly', 'Be paid into the federation’s own account, or to the payee the decision names', '!context.paidRightly'),
		...rule('federation.spend', 'cannot', 'valve', 'Cash out while the mint’s safety valve is shut', '!context.valveOpen'),
		...rule('federation.spend', 'cannot', 'ai', 'Be approved by an AI — checked when the Standing block vouches for people')
	}
};

/**
 * Facts for federation.spend. `cosigned` is the two-signature record; its
 * action carries `credits` and `to`; `account` is where the federation is paid.
 */
export async function spendFacts(
	cosigned: unknown,
	decision: unknown,
	o: { federation: string; account: string; payee?: string; spentSoFar?: number; valveShut?: boolean; founder?: string; now?: Date; revoked?: Set<string> }
) {
	const c = await checkCosigned(cosigned, { founder: o.founder, now: o.now, revoked: o.revoked });
	const action = ((cosigned as { action?: Record<string, unknown> } | null)?.action ?? {}) as { credits?: number; to?: string };
	const d = await decisionCovers(decision, { federation: o.federation, credits: action.credits, spentSoFar: o.spentSoFar, founder: o.founder, now: o.now, revoked: o.revoked });
	return {
		twoHolders: c.ok && (cosigned as { federation?: string }).federation === o.federation,
		waitingForSecond: !c.ok && c.waiting,
		hasDecision: d.ok,
		paidRightly: action.to === o.account || (!!o.payee && action.to === o.payee),
		valveOpen: !o.valveShut
	};
}

export const FEDERATION_MONEY_ACTIONS = [FEDERATION_SPEND];
