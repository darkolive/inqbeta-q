/*
 * federation.join, federation.leave, federation.remove — Q core
 * (ADR-Q-007 §4, checked as ADR-Q-008 rules). Facts come from the receipts
 * themselves, checked by q-core/membership.
 */
import { ACTION_SCHEMA, type ActionDefinition } from '../actions';
import { CEDAR_VERSION } from '../version';
import { consentHashes, hashAgreement, type FederationFounding, type FederationManifest } from '@inqbeta/q-core/federations';
import { cardFits, type MemberCard } from '@inqbeta/q-core/membership';
import { checkMembership, hashReceipt, joiningParts, checkLeft, checkRemoved, checkSuspended, SUSPENSION_MOST_DAYS, type Joining, type Left, type Removed, type Suspended } from '@inqbeta/q-core/membership';

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

export const FEDERATION_JOIN: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'federation.join',
	version: '1.0.0',
	by: 'q:core',
	says: 'A person joins a federation by signing its agreement; the federation countersigns.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "federation.join" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    signedByMember: Bool,
    countersigned: Bool,
    offerAdmits: Bool,
    offerExpired: Bool,
    offerForged: Bool,
    rulesAreCurrent: Bool,
    agreementMatches: Bool,
    consentedToEveryStep: Bool,
    saidHowKnown: Bool,
    cardWithinChoice: Bool,
  }
};`,
	rules: {
		...rule('federation.join', 'may', 'join', 'Make someone a member, signed by them and countersigned by the federation or its standing offer',
			'context.signedByMember && (context.countersigned || context.offerAdmits)'),
		...rule('federation.join', 'must', 'current-rules', 'Name the rules the federation was founded under', '!context.rulesAreCurrent'),
		...rule('federation.join', 'must', 'agreement', 'Name the exact agreement the member signed up to', '!context.agreementMatches'),
		...rule('federation.join', 'cannot', 'expired-offer', 'Be signed after the invitation ran out', 'context.offerExpired && !context.countersigned'),
		...rule('federation.join', 'cannot', 'forged-offer', 'Rely on an offer the federation did not sign', 'context.offerForged && !context.countersigned'),
		...rule('federation.join', 'must', 'consent-every-step', 'Agree to every part of the consent, one step at a time, each named by its hash', '!context.consentedToEveryStep'),
		...rule('federation.join', 'must', 'say-how-known', 'Say how the member chose to be known: anonymous, by name, or by name and picture', '!context.saidHowKnown'),
		...rule('federation.join', 'cannot', 'share-more-than-chosen', 'Carry more about the member than they chose to share', '!context.cardWithinChoice'),
		...rule('federation.join', 'must', 'one-person', 'Be one person joining once — checked by vouching when the Standing block is on')
	}
};

export const FEDERATION_LEAVE: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'federation.leave',
	version: '1.0.0',
	by: 'q:core',
	says: 'A member leaves. Nobody else is asked.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "federation.leave" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    signedByMember: Bool,
    wasMember: Bool,
    citesTheirJoining: Bool,
  }
};`,
	rules: {
		...rule('federation.leave', 'may', 'leave', 'End their own membership, alone, at any time', 'context.signedByMember'),
		...rule('federation.leave', 'must', 'was-member', 'End a membership that existed', '!context.wasMember'),
		...rule('federation.leave', 'must', 'cite-joining', 'Name the joining it ends', '!context.citesTheirJoining'),
		...rule('federation.leave', 'cannot', 'for-someone-else', 'Be signed by anyone but the member leaving', '!context.signedByMember'),
		...rule('federation.leave', 'must', 'keep-receipts', 'Leave the member every receipt they had')
	}
};

export const FEDERATION_REMOVE: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'federation.remove',
	version: '1.0.0',
	by: 'q:core',
	says: 'The federation ends someone’s membership, citing the rule it relies on.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "federation.remove" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    signedByFederation: Bool,
    citesClause: Bool,
    saysWhy: Bool,
    wasMember: Bool,
  }
};`,
	rules: {
		...rule('federation.remove', 'may', 'remove', 'End someone’s membership, signed by the federation', 'context.signedByFederation'),
		...rule('federation.remove', 'must', 'cite-clause', 'Cite the clause of the agreement or rules it relies on', '!context.citesClause'),
		...rule('federation.remove', 'must', 'say-why', 'Say why, in plain words', '!context.saysWhy'),
		...rule('federation.remove', 'must', 'was-member', 'Remove someone who was a member', '!context.wasMember'),
		...rule('federation.remove', 'cannot', 'rewrite-past', 'Make any earlier receipt invalid — removal ends belonging from now on')
	}
};

/**
 * Facts for federation.join. `founding`/`manifest` are the federation's own, as
 * the checker holds them. `card` is the opened card, where the checker can
 * open it (the joiner, or the caretaker with the federation key); without it,
 * the check is that a card is present exactly when the choice calls for one.
 */
export async function joinFacts(j: Joining, founding: FederationFounding, manifest: FederationManifest, card?: MemberCard | null) {
	const parts = await joiningParts(j);
	const want = await consentHashes(manifest);
	const got = new Map((j.consented ?? []).map((c) => [c.id, c.hash]));
	const knownAs = j.knownAs;
	const saidHowKnown = knownAs === 'anonymous' || knownAs === 'name' || knownAs === 'name-and-picture';
	const cardWithinChoice = !saidHowKnown
		? false
		: card !== undefined
			? cardFits(knownAs!, card).ok
			: knownAs === 'anonymous'
				? !j.card && !j.sealedCard
				: !!j.card && !!j.sealedCard;
	return {
		consentedToEveryStep: want.every((w) => got.get(w.id) === w.hash) && got.size === want.length,
		saidHowKnown,
		cardWithinChoice,
		signedByMember: parts.member,
		countersigned: parts.countersigned,
		offerAdmits: parts.offer === 'admits',
		offerExpired: parts.offer === 'expired',
		offerForged: parts.offer === 'forged',
		rulesAreCurrent: j.federation === founding.federation && j.manifest === founding.manifest,
		agreementMatches: j.agreement === (await hashAgreement(manifest.constitution.agreement))
	};
}

/** Facts for federation.leave. */
export async function leaveFacts(l: Left, joining: Joining) {
	return {
		signedByMember: (await checkLeft(l)).ok,
		wasMember: (await checkMembership(joining)).state === 'member' && joining.member === l.member && joining.federation === l.federation,
		citesTheirJoining: l.joined === (await hashReceipt(joining))
	};
}

/** Facts for federation.remove. */
export async function removeFacts(r: Removed, joining: Joining) {
	const signed = await checkRemoved(r);
	return {
		signedByFederation: signed.ok || signed.says === 'It cites no clause.',
		citesClause: !!r.clause?.trim(),
		saysWhy: !!r.says?.trim(),
		wasMember: (await checkMembership(joining)).state === 'member' && joining.member === r.member && joining.federation === r.federation
	};
}

export const FEDERATION_SUSPEND: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'federation.suspend',
	version: '1.0.0',
	by: 'q:core',
	says: 'The federation pauses someone’s membership until a date. They stay a member, and it ends on its own.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "federation.suspend" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    signedByFederation: Bool,
    citesClause: Bool,
    saysWhy: Bool,
    hasEnd: Bool,
    days: Long,
    startsBeforeSigned: Bool,
    wasMember: Bool,
  }
};`,
	rules: {
		...rule('federation.suspend', 'may', 'suspend', 'Pause someone’s membership until a date, signed by the federation', 'context.signedByFederation'),
		...rule('federation.suspend', 'must', 'cite-clause', 'Cite the clause of the agreement or rules it relies on', '!context.citesClause'),
		...rule('federation.suspend', 'must', 'say-why', 'Say why, in plain words', '!context.saysWhy'),
		...rule('federation.suspend', 'must', 'end', 'Have an end date — nothing here is indefinite', '!context.hasEnd'),
		...rule('federation.suspend', 'must', 'was-member', 'Suspend someone who is a member', '!context.wasMember'),
		...rule('federation.suspend', 'cannot', 'over-a-year', `Last more than ${SUSPENSION_MOST_DAYS} days — anything longer is a removal`, `context.days > ${SUSPENSION_MOST_DAYS}`),
		...rule('federation.suspend', 'cannot', 'backdate', 'Start before it was signed', 'context.startsBeforeSigned'),
		...rule('federation.suspend', 'cannot', 'stop-leaving', 'Stop the member leaving while suspended'),
		...rule('federation.suspend', 'cannot', 'chain-into-permanent', 'Be renewed back to back to become permanent')
	}
};

/** Facts for federation.suspend. */
export async function suspendFacts(s: Suspended, joining: Joining) {
	const signed = await checkSuspended(s);
	const from = Date.parse(s.from);
	const until = Date.parse(s.until);
	return {
		signedByFederation: signed.ok,
		citesClause: !!s.clause?.trim(),
		saysWhy: !!s.says?.trim(),
		hasEnd: Number.isFinite(until) && until > from,
		days: Number.isFinite(until) ? Math.ceil((until - from) / 86_400_000) : 0,
		startsBeforeSigned: from < Date.parse(s.at) - 60_000,
		wasMember: (await checkMembership(joining)).state === 'member' && joining.member === s.member && joining.federation === s.federation
	};
}
