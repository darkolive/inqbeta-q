/*
 * office.appoint and office.end — Q core (ADR-Q-007 §5 "Offices", checked as
 * ADR-Q-008 rules; ADR-Q-038 step 5). Facts come from the receipts
 * themselves, checked by q-core/offices.
 *
 * The Offices block's charter: each office is a named slot with scope, term
 * and a recall path, held as a UCAN mandate from the federation key with an
 * expiry. It cannot be permanent, renew silently, or be held by an AI.
 */
import { ACTION_SCHEMA, type ActionDefinition } from '../actions';
import { CEDAR_VERSION } from '../version';
import { checkMembership, type Joining } from '@inqbeta/q-core/membership';
import { appointmentParts, checkEnded, type Appointed, type Ended } from '@inqbeta/q-core/offices';

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

export const OFFICE_APPOINT: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'office.appoint',
	version: '1.0.0',
	by: 'q:core',
	says: 'The federation gives a member an office — treasurer, secretary, chair, safeguarding lead or steward — for a term, as a mandate from its key.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "office.appoint" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    signedByFederation: Bool,
    signedByAppointer: Bool,
    appointerWasCaretaker: Bool,
    knownOffice: Bool,
    isCaretaker: Bool,
    scopeIsTheOffice: Bool,
    mandatesMatch: Bool,
    selfAppointed: Bool,
    hasTerm: Bool,
    termWithinBounds: Bool,
    saysWhy: Bool,
    holderIsMember: Bool,
  }
};`,
	rules: {
		...rule('office.appoint', 'may', 'appoint', 'Give a member an office, signed by the federation and by its caretaker', 'context.signedByFederation && context.signedByAppointer && context.appointerWasCaretaker'),
		...rule('office.appoint', 'must', 'known-office', 'Be one of the offices: treasurer, secretary, chair, safeguarding lead or steward', '!context.knownOffice'),
		...rule('office.appoint', 'must', 'scope', 'Give exactly the office’s powers, no more', '!context.scopeIsTheOffice || !context.mandatesMatch'),
		...rule('office.appoint', 'must', 'term', 'Have a term, between one month and two years, that its mandates end with', '!context.hasTerm || !context.termWithinBounds'),
		...rule('office.appoint', 'must', 'say-why', 'Say how they were chosen, in plain words', '!context.saysWhy'),
		...rule('office.appoint', 'must', 'member', 'Go to a member of the federation', '!context.holderIsMember'),
		...rule('office.appoint', 'cannot', 'self', 'Be given by someone to themselves — that is renewing silently', 'context.selfAppointed'),
		...rule('office.appoint', 'cannot', 'caretaker', 'Make or renew the caretaker: that comes from the founding, and only the members renew it', 'context.isCaretaker'),
		...rule('office.appoint', 'cannot', 'ai', 'Be held by an AI — checked when the Standing block vouches for people'),
		...rule('office.appoint', 'must', 'recall-path', 'Be open to recall by the federation, and to standing down at any time')
	}
};

/** Facts for office.appoint. `holderJoining` is the holder's joining receipt, as the federation holds it. */
export async function appointFacts(a: Appointed, holderJoining: Joining | null | undefined, now = new Date()) {
	const p = await appointmentParts(a, now);
	const member = !!holderJoining && holderJoining.member === a?.holder && holderJoining.federation === a?.federation && (await checkMembership(holderJoining)).state === 'member';
	return {
		signedByFederation: !!p?.signedByFederation,
		signedByAppointer: !!p?.signedByAppointer,
		appointerWasCaretaker: !!p?.appointerWasCaretaker,
		knownOffice: !!p?.knownOffice,
		isCaretaker: !!p?.isCaretaker,
		scopeIsTheOffice: !!p?.scopeIsTheOffice,
		mandatesMatch: !!p?.mandatesMatch,
		selfAppointed: !!p?.selfAppointed,
		hasTerm: !!p?.hasTerm,
		termWithinBounds: !!p?.termWithinBounds,
		saysWhy: !!p?.saysWhy,
		holderIsMember: member
	};
}

export const OFFICE_END: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'office.end',
	version: '1.0.0',
	by: 'q:core',
	says: 'An office ends early: the holder stands down, or the federation recalls it, saying why.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "office.end" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    endsThatAppointment: Bool,
    signedRightly: Bool,
    saysWhy: Bool,
  }
};`,
	rules: {
		...rule('office.end', 'may', 'end', 'End an office early: the holder standing down, or the federation recalling it', 'context.endsThatAppointment && context.signedRightly'),
		...rule('office.end', 'must', 'say-why', 'Say why', '!context.saysWhy'),
		...rule('office.end', 'cannot', 'rewrite-past', 'Undo what was signed in the office while it was held')
	}
};

/** Facts for office.end. */
export async function endFacts(e: Ended, a: Appointed) {
	const c = await checkEnded(e, a);
	return {
		endsThatAppointment: c.ok || c.says !== 'It ends a different appointment.',
		signedRightly: c.ok,
		saysWhy: !!e?.says?.trim()
	};
}

export const OFFICE_ACTIONS = [OFFICE_APPOINT, OFFICE_END];
