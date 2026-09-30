/*
 * federation.found — Q core (ADR-Q-007 §1–3, checked as ADR-Q-008 rules).
 *
 * Decided on every founding before it is kept. The facts come from the
 * founding itself (foundingFacts, below): signatures are checked by q-core,
 * then the engine decides whether what was founded keeps the rules.
 */
import { ACTION_SCHEMA, type ActionDefinition } from '../actions';
import { CEDAR_VERSION } from '../version';
import { PRINCIPLES, checkJoined, foundingSignatures, hashManifest, type FederationFounded } from '@inqbeta/q-core/federations';

const ON = 'principal, action == Action::"federation.found", resource';

export const FEDERATION_FOUND: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'federation.found',
	version: '1.0.0',
	by: 'q:core',
	says: 'A person founds a federation: a new key, signed into being by them and by itself.',
	engine: { cedar: CEDAR_VERSION },
	facts: `entity Person;
entity Federation;

action "federation.found" appliesTo {
  principal: [Person],
  resource: [Federation],
  context: {
    signedByFounder: Bool,
    signedByFederation: Bool,
    manifestMatches: Bool,
    hasPurpose: Bool,
    hasAgreement: Bool,
    allPrinciples: Bool,
    founderJoined: Bool,
    caretakerExpires: Bool,
    caretakerMonths: Long,
    isEvent: Bool,
    eventHasEnd: Bool,
    foundedByAI: Bool,
  }
};`,
	rules: {
		'federation.found/may/found': {
			kind: 'may',
			says: 'Bring a federation into being, signed by its founder and by its own new key',
			checked: 'enforced',
			policy: `@id("federation.found/may/found")
permit (${ON})
when { context.signedByFounder && context.signedByFederation };`
		},
		'federation.found/must/manifest': {
			kind: 'must',
			says: 'Name the manifest it was founded under, by its exact hash',
			checked: 'enforced',
			policy: `@id("federation.found/must/manifest")
forbid (${ON})
when { !context.manifestMatches };`
		},
		'federation.found/must/purpose': {
			kind: 'must',
			says: 'Say what it is for',
			checked: 'enforced',
			policy: `@id("federation.found/must/purpose")
forbid (${ON})
when { !context.hasPurpose };`
		},
		'federation.found/must/agreement': {
			kind: 'must',
			says: 'Carry the agreement members sign when they join',
			checked: 'enforced',
			policy: `@id("federation.found/must/agreement")
forbid (${ON})
when { !context.hasAgreement };`
		},
		'federation.found/must/principles': {
			kind: 'must',
			says: 'Carry every fixed principle, which no vote can change',
			checked: 'enforced',
			policy: `@id("federation.found/must/principles")
forbid (${ON})
when { !context.allPrinciples };`
		},
		'federation.found/must/founder-joins': {
			kind: 'must',
			says: 'Make the founder member one, by a joining both sides signed',
			checked: 'enforced',
			policy: `@id("federation.found/must/founder-joins")
forbid (${ON})
when { !context.founderJoined };`
		},
		'federation.found/must/event-ends': {
			kind: 'must',
			says: 'Give an event its last day',
			checked: 'enforced',
			policy: `@id("federation.found/must/event-ends")
forbid (${ON})
when { context.isEvent && !context.eventHasEnd };`
		},
		'federation.found/cannot/permanent-caretaker': {
			kind: 'cannot',
			says: 'Give the founder a caretaker mandate that never ends',
			checked: 'enforced',
			policy: `@id("federation.found/cannot/permanent-caretaker")
forbid (${ON})
when { !context.caretakerExpires };`
		},
		'federation.found/cannot/caretaker-over-two-years': {
			kind: 'cannot',
			says: 'Give the founder a caretaker term longer than two years',
			checked: 'enforced',
			policy: `@id("federation.found/cannot/caretaker-over-two-years")
forbid (${ON})
when { context.caretakerMonths > 24 };`
		},
		'federation.found/cannot/ai-founder': {
			kind: 'cannot',
			says: 'Be founded by an AI',
			checked: 'enforced',
			policy: `@id("federation.found/cannot/ai-founder")
forbid (${ON})
when { context.foundedByAI };`
		},
		'federation.found/must/renew-caretaker': {
			kind: 'must',
			says: 'Have its members renew or replace the caretaker before the term ends',
			checked: 'declared'
		}
	}
};

/** Facts for federation.found, gathered from a founding. The kernel's side of §4. */
export async function foundingFacts(f: FederationFounded, o: { foundedByAI?: boolean } = {}): Promise<Record<string, unknown>> {
	const c = f.manifest.constitution;
	const signed = await foundingSignatures(f.founding);
	const joined = await checkJoined(f.joined);
	const exp = f.grant.payload.exp;
	return {
		signedByFounder: signed.root,
		signedByFederation: signed.federation,
		manifestMatches: (await hashManifest(f.manifest)) === f.founding.manifest,
		hasPurpose: !!c.purpose.trim(),
		hasAgreement: !!c.agreement.trim(),
		allPrinciples: PRINCIPLES.every((p) => f.manifest.principles.includes(p.id)),
		founderJoined: joined.ok && f.joined.member === f.founding.root && f.joined.federation === f.founding.federation,
		caretakerExpires: typeof exp === 'number',
		caretakerMonths: c.caretakerMonths,
		isEvent: c.strand === 'event',
		eventHasEnd: !!c.endsOn,
		foundedByAI: !!o.foundedByAI
	};
}
