/* A camping club's money.spend, derived from Q core: forbids only. */
import { deriveAction } from '../src/actions';
import { MONEY_SPEND } from '../src/core/money-spend';

export const CLUB_DID = 'did:key:z6MkCampingClubExample';

export const clubMoneySpend = () =>
	deriveAction(MONEY_SPEND, {
		by: CLUB_DID,
		version: '1.0.0',
		says: 'The camping club pays for things; anything over £200 also needs a members’ vote.',
		rules: {
			'camping-club/money.spend/cannot/over-200-without-vote': {
				kind: 'cannot',
				says: 'Spend over £200 without citing a members’ vote',
				checked: 'enforced',
				policy: `@id("camping-club/money.spend/cannot/over-200-without-vote")
forbid (principal, action == Action::"money.spend", resource)
when { context.amountPence > 20000 && !context.citesMembersVote };`
			}
		}
	});
