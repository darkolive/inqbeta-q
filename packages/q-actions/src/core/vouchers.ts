/*
 * voucher.issue, voucher.move and voucher.redeem — Q core (ADR-Q-044, build
 * step 2; 7 October 2026). Facts come from the voucher, its held copies and
 * its redemptions, read by q-core/vouchers: the chain back to the issuer is
 * what proves a copy, so nothing here trusts a stored balance.
 *
 * Plain words, as the ADR says them: no 51st of 50; title only with an
 * original; a bound voucher never moves; a given voucher is never sold; resale
 * within the issuer's limit; redeemed once, in its realm, by an accepted
 * provider, before it ends. Never approved by an AI.
 */
import { ACTION_SCHEMA, type ActionDefinition } from '../actions';
import { CEDAR_VERSION } from '../version';
import { checkVoucher, editionOf, hashHeld, heldSignedBy, passesTitle, redemptionSigned, voucherProblem, type Redemption, type VoucherHeld, type VoucherReceipt } from '@inqbeta/q-core/vouchers';

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
const NO_AI = (action: string) => rule(action, 'cannot', 'ai', 'Be approved by an AI — checked when the Standing block vouches for people');
const ctx = (fields: string[]) => fields.map((f) => `    ${f}: Bool,`).join('\n');
const facts = (id: string, fields: string[]) => `entity Person;
entity Voucher;

action "${id}" appliesTo {
  principal: [Person],
  resource: [Voucher],
  context: {
${ctx(fields)}
  }
};`;
const ended = (v: VoucherReceipt, now: Date) => !!v.content.ends && Date.parse(v.content.ends.at) <= now.getTime();

export const VOUCHER_ISSUE: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'voucher.issue',
	version: '1.0.0',
	by: 'q:core',
	says: 'The issuer hands out a numbered copy of its voucher to someone, who signs to receive it.',
	engine: { cedar: CEDAR_VERSION },
	facts: facts('voucher.issue', ['masterSigned', 'termsHold', 'byIssuer', 'signedByIssuer', 'withinEdition', 'numberFree', 'titleRight', 'notEnded', 'eligible']),
	rules: {
		...rule('voucher.issue', 'may', 'issue', 'Hand out a copy of a voucher you signed, on terms the core allows', 'context.masterSigned && context.termsHold && context.byIssuer && context.signedByIssuer'),
		...rule('voucher.issue', 'cannot', 'past-edition', 'Hand out more than the edition: no 51st of 50', '!context.withinEdition'),
		...rule('voucher.issue', 'cannot', 'twice', 'Hand out the same number twice', '!context.numberFree'),
		...rule('voucher.issue', 'cannot', 'title', 'Pass title with anything but an original: a copy of a copyable or an edition is yours, the work isn’t', '!context.titleRight'),
		...rule('voucher.issue', 'cannot', 'ended', 'Hand out a voucher after it has ended', '!context.notEnded'),
		...rule('voucher.issue', 'must', 'eligible', 'Give a given voucher only to someone eligible under its programme, shown by attestation, never by the reason', '!context.eligible'),
		...NO_AI('voucher.issue')
	}
};

/** Facts for voucher.issue. `existing` are the copies already out; `eligible` is whether the holder's attestation for `eligibleUnder` checked (ignored for paid vouchers). */
export async function voucherIssueFacts(v: VoucherReceipt, copy: VoucherHeld, existing: VoucherHeld[], o: { by: string; eligible?: boolean; now?: Date }) {
	const now = o.now ?? new Date();
	const e = await editionOf(v, existing);
	return {
		masterSigned: (await checkVoucher(v)).ok,
		termsHold: voucherProblem(v.content) === null,
		byIssuer: o.by === v.content.issuer && copy.from === v.content.issuer && copy.how === 'issued' && copy.previous === null && copy.voucher === v.contentHash,
		signedByIssuer: await heldSignedBy(copy, 'from'),
		withinEdition: Number.isInteger(copy.number) && copy.number >= 1 && (v.content.of === null || copy.number <= v.content.of),
		numberFree: !e.holdings.some((h) => h.number === copy.number),
		titleRight: copy.title === passesTitle(v.content),
		notEnded: !ended(v, now),
		eligible: v.content.price.paid || !v.content.eligibleUnder || o.eligible === true
	};
}

export const VOUCHER_MOVE: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'voucher.move',
	version: '1.0.0',
	by: 'q:core',
	says: 'A holder passes their copy on — given, swapped or sold — as the voucher allows. The next holder signs to receive it.',
	engine: { cedar: CEDAR_VERSION },
	facts: facts('voucher.move', ['fromHolder', 'signedByHolder', 'unbound', 'saleAllowed', 'withinResale', 'notRedeemed', 'notEnded']),
	rules: {
		...rule('voucher.move', 'may', 'move', 'Pass on the copy you hold, signed by you, chained to the copy before', 'context.fromHolder && context.signedByHolder'),
		...rule('voucher.move', 'cannot', 'bound', 'Move a bound voucher: a grant or a capacity gift stays with its person', '!context.unbound'),
		...rule('voucher.move', 'cannot', 'sell-given', 'Sell a voucher its issuer made giftable only, or one that was given', '!context.saleAllowed'),
		...rule('voucher.move', 'cannot', 'over-resale', 'Sell on for more than the issuer’s limit', '!context.withinResale'),
		...rule('voucher.move', 'cannot', 'redeemed', 'Pass on a copy already redeemed', '!context.notRedeemed'),
		...rule('voucher.move', 'cannot', 'ended', 'Pass on a voucher that has ended', '!context.notEnded'),
		...NO_AI('voucher.move')
	}
};

/** Facts for voucher.move: `next` is the new copy; `copies` and `redemptions` are what's known so far. */
export async function voucherMoveFacts(v: VoucherReceipt, next: VoucherHeld, copies: VoucherHeld[], redemptions: Redemption[] = [], o: { by: string; now?: Date }) {
	const now = o.now ?? new Date();
	const holding = (await editionOf(v, copies, redemptions)).holdings.find((h) => h.number === next.number);
	const c = v.content;
	return {
		fromHolder: !!holding && next.voucher === v.contentHash && o.by === holding.holder && next.from === holding.holder && next.previous === (await hashHeld(holding.latest)) && next.how !== 'issued',
		signedByHolder: await heldSignedBy(next, 'from'),
		unbound: c.moves !== 'bound',
		saleAllowed: next.how !== 'sold' || c.moves === 'sellable',
		withinResale: next.how !== 'sold' || c.resaleUpTo === undefined || (next.price ?? 0) <= c.resaleUpTo,
		notRedeemed: !holding?.redeemed,
		notEnded: !ended(v, now)
	};
}

export const VOUCHER_REDEEM: ActionDefinition = {
	schema: ACTION_SCHEMA,
	id: 'voucher.redeem',
	version: '1.0.0',
	by: 'q:core',
	says: 'A holder exchanges their copy for what it vouches for, with the issuer or a provider in its realm. Both sign.',
	engine: { cedar: CEDAR_VERSION },
	facts: facts('voucher.redeem', ['bothSigned', 'holderHolds', 'notRedeemed', 'inRealm', 'accepted', 'notEnded']),
	rules: {
		...rule('voucher.redeem', 'may', 'redeem', 'Redeem the copy you hold, signed by you and by whoever honours it', 'context.bothSigned && context.holderHolds'),
		...rule('voucher.redeem', 'cannot', 'twice', 'Redeem the same copy twice', '!context.notRedeemed'),
		...rule('voucher.redeem', 'cannot', 'realm', 'Redeem it for anything outside its realm', '!context.inRealm'),
		...rule('voucher.redeem', 'cannot', 'provider', 'Be honoured by a provider the issuer hasn’t accepted, on its list or by treaty', '!context.accepted'),
		...rule('voucher.redeem', 'cannot', 'ended', 'Redeem it after it ends: a paid one is refunded, a grant returns, a gift lapses', '!context.notEnded'),
		...NO_AI('voucher.redeem')
	}
};

/** Facts for voucher.redeem. `redemptions` are the ones before this; `inTreaty` is whether the redeemer is in treaty with the issuer. */
export async function voucherRedeemFacts(v: VoucherReceipt, r: Redemption, copies: VoucherHeld[], redemptions: Redemption[] = [], o: { by: string; inTreaty?: boolean; now?: Date }) {
	const now = o.now ?? new Date();
	const holding = (await editionOf(v, copies, redemptions)).holdings.find((h) => h.number === r.number);
	const c = v.content;
	const own = r.redeemer === c.issuer || r.redeemer === c.redeemer;
	return {
		bothSigned: await redemptionSigned(r),
		holderHolds: !!holding && r.voucher === v.contentHash && holding.holder === r.holder && (o.by === r.holder || o.by === r.redeemer),
		notRedeemed: !holding?.redeemed,
		inRealm: c.realm.kinds === 'itself' ? own && r.for === 'itself' : (own && r.for === 'itself') || c.realm.kinds.includes(r.for),
		accepted: own || !!o.inTreaty || (c.realm.kinds !== 'itself' && c.realm.accepted.includes(r.redeemer)),
		notEnded: !ended(v, now)
	};
}

export const VOUCHER_ACTIONS = [VOUCHER_ISSUE, VOUCHER_MOVE, VOUCHER_REDEEM];
