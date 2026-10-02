/* Credits (ADR-Q-023): every move inspected by the real Cedar, and a treaty that tightens trades. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { createEngine, type CedarModule } from '../src/engine';
import { deriveAction } from '../src/actions';
import { CREDITS_BUY, CREDITS_SPEND, CREDITS_REWARD, CREDITS_TRADE } from '../src/core/credits';

const engine = createEngine(cedar as unknown as CedarModule);
const P = (id: string) => ({ __entity: { type: 'Person', id } });
const who = (id: string) => ({ type: 'Person', id });
const wallet = { type: 'Wallet', id: 'ann-credits' };
const decide = async (a: Parameters<typeof engine.load>[0], principal: string, facts: Record<string, unknown>) =>
	engine.decide(await engine.load(a), { principal: who(principal), resource: wallet, facts });

const buy = { buyer: P('ann'), signers: [P('ann')], credits: 10, packPublished: true, priceMatchesPack: true, live: false, paymentConfirmed: false, datedBeforePrevious: false };
test('buy: a published pack in test mode holds; real credits wait for payment', async () => {
	assert.equal((await decide([CREDITS_BUY], 'ann', buy)).holds, true, 'test mode, no money taken');
	const unpaid = await decide([CREDITS_BUY], 'ann', { ...buy, live: true });
	assert.deepEqual(unpaid.rules, ['credits.buy/cannot/live-without-payment']);
	assert.equal((await decide([CREDITS_BUY], 'ann', { ...buy, live: true, paymentConfirmed: true })).holds, true);
	assert.deepEqual((await decide([CREDITS_BUY], 'ann', { ...buy, packPublished: false, priceMatchesPack: false })).rules, ['credits.buy/must/pack-price', 'credits.buy/must/published-pack']);
	assert.deepEqual((await decide([CREDITS_BUY], 'ann', { ...buy, credits: 0 })).rules, ['credits.buy/cannot/nothing']);
	assert.equal((await decide([CREDITS_BUY], 'ann', { ...buy, signers: [P('bob')] })).holds, false, 'someone else can’t buy into your wallet');
});

const spend = { holder: P('ann'), signers: [P('ann')], credits: 3, balanceBefore: 10, citesUsage: true, usageSignedByService: true, testCredits: true, liveService: false, datedBeforePrevious: false };
test('spend: never more than you hold, always for a use the service signed', async () => {
	assert.equal((await decide([CREDITS_SPEND], 'ann', spend)).holds, true);
	assert.deepEqual((await decide([CREDITS_SPEND], 'ann', { ...spend, credits: 11 })).rules, ['credits.spend/cannot/overdraw']);
	assert.deepEqual((await decide([CREDITS_SPEND], 'ann', { ...spend, usageSignedByService: false })).rules, ['credits.spend/must/cite-usage']);
	assert.deepEqual((await decide([CREDITS_SPEND], 'ann', { ...spend, liveService: true })).rules, ['credits.spend/cannot/test-on-live']);
});

const reward = {
	recipient: P('dan'),
	signers: [P('ann'), P('bob')],
	distinctSignerCount: 2,
	rewardMandateHolders: [P('ann'), P('bob'), P('cat')],
	credits: 20,
	verifiedUnits: 40,
	unitsRewarded: 40,
	reservePence: 5000,
	reserveNeededPence: 1200,
	approvedByAI: false,
	datedBeforePrevious: false
};
test('reward: only for capacity delivered, within the reserve, never to yourself', async () => {
	assert.equal((await decide([CREDITS_REWARD], 'ann', reward)).holds, true, 'Dan ran storage that others used');
	assert.deepEqual((await decide([CREDITS_REWARD], 'ann', { ...reward, unitsRewarded: 60 })).rules, ['credits.reward/must/delivered-capacity']);
	assert.deepEqual((await decide([CREDITS_REWARD], 'ann', { ...reward, reserveNeededPence: 6000 })).rules, ['credits.reward/must/within-reserve']);
	const self = await decide([CREDITS_REWARD], 'ann', { ...reward, recipient: P('ann') });
	assert.deepEqual(self.rules, ['credits.reward/cannot/self-reward']);
	assert.deepEqual((await decide([CREDITS_REWARD], 'ann', { ...reward, signers: [P('ann')], distinctSignerCount: 1 })).rules, ['credits.reward/must/two-signers']);
	assert.deepEqual((await decide([CREDITS_REWARD], 'ann', { ...reward, approvedByAI: true })).rules, ['credits.reward/cannot/ai-approval']);
});

const trade = {
	giver: P('ann'),
	taker: P('bob'),
	signers: [P('ann'), P('bob')],
	credits: 5,
	giverBalanceBefore: 10,
	business: false,
	recordsPoundValue: false,
	testCredits: false,
	live: true,
	sameFederation: true,
	underTreaty: false,
	datedBeforePrevious: false
};
const treaty = () =>
	deriveAction(CREDITS_TRADE, {
		by: 'did:key:z6MkTreatyIncubatorDoStudy',
		version: '1.0.0',
		says: 'Incubator and DoStudy trade with each other, up to 500 credits at a time.',
		rules: {
			'incubator-dostudy-treaty/credits.trade/cannot/over-500': {
				kind: 'cannot',
				says: 'Move more than 500 credits in one trade between Incubator and DoStudy',
				checked: 'enforced',
				policy: `@id("incubator-dostudy-treaty/credits.trade/cannot/over-500")
forbid (principal, action == Action::"credits.trade", resource)
when { context.credits > 500 };`
			}
		}
	});
test('trade: both sign, nobody overdraws, businesses record a value, other federations need a treaty', async () => {
	assert.equal((await decide([CREDITS_TRADE], 'ann', trade)).holds, true);
	assert.equal((await decide([CREDITS_TRADE], 'ann', { ...trade, signers: [P('ann')] })).holds, false, 'the taker must sign too');
	assert.deepEqual((await decide([CREDITS_TRADE], 'ann', { ...trade, credits: 12 })).rules, ['credits.trade/cannot/overdraw']);
	assert.deepEqual((await decide([CREDITS_TRADE], 'ann', { ...trade, business: true })).rules, ['credits.trade/must/value-business-trades']);
	assert.equal((await decide([CREDITS_TRADE], 'ann', { ...trade, business: true, recordsPoundValue: true })).holds, true);
	assert.deepEqual((await decide([CREDITS_TRADE], 'ann', { ...trade, sameFederation: false })).rules, ['credits.trade/must/treaty-across-federations']);
	assert.deepEqual((await decide([CREDITS_TRADE], 'ann', { ...trade, testCredits: true })).rules, ['credits.trade/cannot/test-in-live']);
	assert.deepEqual((await decide([CREDITS_TRADE], 'ann', { ...trade, taker: P('ann'), signers: [P('ann')] })).rules, ['credits.trade/cannot/self-trade']);
});

test('a treaty is inspected too: it can only tighten the core rules', async () => {
	const across = { ...trade, sameFederation: false, underTreaty: true, giverBalanceBefore: 1000 };
	const t = await treaty();
	assert.equal((await decide([CREDITS_TRADE, t], 'ann', { ...across, credits: 400 })).holds, true);
	const big = await decide([CREDITS_TRADE, t], 'ann', { ...across, credits: 600 });
	assert.deepEqual(big.rules, ['incubator-dostudy-treaty/credits.trade/cannot/over-500']);
	assert.equal((await decide([CREDITS_TRADE], 'ann', { ...across, credits: 600 })).holds, true, 'core alone allows it; the treaty is what says no');
});
