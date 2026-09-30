/* The shape of an action definition — no Cedar needed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkActionDefinition, hashAction, describeAction, effectOf, type ActionDefinition } from '../src/actions';
import { MONEY_SPEND } from '../src/core/money-spend';
import { clubMoneySpend } from './camping-club';

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));

test('money.spend is a well-formed core action', () => {
	assert.deepEqual(checkActionDefinition(MONEY_SPEND), { ok: true, problems: [] });
});

test("the camping club's version is well-formed and names its parent by hash", async () => {
	const club = await clubMoneySpend();
	assert.deepEqual(checkActionDefinition(club), { ok: true, problems: [] });
	assert.equal(club.parent, await hashAction(MONEY_SPEND));
});

test('a federation cannot add a may', async () => {
	const club = await clubMoneySpend();
	(club.rules as Record<string, unknown>)['camping-club/money.spend/may/anything'] = {
		kind: 'may',
		says: 'Anything goes',
		checked: 'enforced',
		policy: '@id("camping-club/money.spend/may/anything")\npermit (principal, action == Action::"money.spend", resource);'
	};
	const c = checkActionDefinition(club);
	assert.equal(c.ok, false);
	assert.ok(c.problems.some((p) => p.includes('forbids only')));
});

test('a cannot dressed as a permit is refused', () => {
	const a = copy(MONEY_SPEND);
	a.rules['money.spend/cannot/backdate'].policy = '@id("money.spend/cannot/backdate")\npermit (principal, action == Action::"money.spend", resource);';
	assert.ok(checkActionDefinition(a).problems.some((p) => p.includes('a cannot rule is a forbid, but its policy is permit')));
});

test('a rule must carry its own @id and stay inside its action', () => {
	const a = copy(MONEY_SPEND);
	a.rules['money.spend/cannot/ai-approval'].policy = '@id("something-else")\nforbid (principal, action == Action::"member.join", resource);';
	const p = checkActionDefinition(a).problems;
	assert.ok(p.some((x) => x.includes('must carry @id("money.spend/cannot/ai-approval")')));
	assert.ok(p.some((x) => x.includes('limited to this action')));
});

test('one rule, one policy — no smuggling a second policy into a rule', () => {
	const a = copy(MONEY_SPEND);
	a.rules['money.spend/cannot/backdate'].policy += '\npermit (principal, action == Action::"money.spend", resource);';
	assert.ok(checkActionDefinition(a).problems.some((p) => p.includes('exactly one policy')));
});

test('a rule id must agree with its kind', () => {
	const a = copy(MONEY_SPEND);
	a.rules['money.spend/cannot/backdate'].kind = 'must';
	assert.ok(checkActionDefinition(a).problems.some((p) => p.includes('its id says "cannot" but its kind is "must"')));
});

test('declared rules carry no policy, and a may can never be merely declared', () => {
	const a = copy(MONEY_SPEND);
	a.rules['money.spend/may/record'].checked = 'declared';
	assert.ok(checkActionDefinition(a).problems.some((p) => p.includes('a may must be enforced')));
});

test('only q:core publishes an action with no parent', () => {
	const a = copy(MONEY_SPEND) as ActionDefinition;
	a.by = 'did:key:z6MkSomebody';
	assert.ok(checkActionDefinition(a).problems.some((p) => p.includes('Only Q core')));
});

test('a derived action cannot bring its own facts, and its rules carry an owner', async () => {
	const club = await clubMoneySpend();
	club.facts = 'entity Person;';
	club.rules = { 'money.spend/cannot/sneak': { kind: 'cannot', says: 'x', checked: 'enforced', policy: '@id("money.spend/cannot/sneak")\nforbid (principal, action == Action::"money.spend", resource);' } };
	const p = checkActionDefinition(club).problems;
	assert.ok(p.some((x) => x.includes("uses its parent's facts")));
	assert.ok(p.some((x) => x.includes('start with the owner')));
});

test('every problem is reported at once', () => {
	const p = checkActionDefinition({ schema: 'nope', id: 'Money', rules: {} }).problems;
	assert.ok(p.length >= 5, p.join('\n'));
});

test('the hash changes when any rule changes, and not otherwise', async () => {
	const h = await hashAction(MONEY_SPEND);
	assert.match(h, /^action:sha256:[A-Za-z0-9_-]{43}$/);
	assert.equal(await hashAction(copy(MONEY_SPEND)), h);
	const a = copy(MONEY_SPEND);
	a.rules['money.spend/cannot/payee-signs'].says = 'Be signed by the payee, unless they ask nicely';
	assert.notEqual(await hashAction(a), h);
});

test('effectOf reads past annotations and comments', () => {
	assert.equal(effectOf('// note\n@id("a/b/c")\n@other("x")\nforbid (principal, action, resource);'), 'forbid');
	assert.equal(effectOf('@id("a")\npermit(principal, action, resource);'), 'permit');
	assert.equal(effectOf('nonsense'), null);
});

test('the brief lists may, must and cannot, and marks declared rules', async () => {
	const brief = describeAction([MONEY_SPEND, await clubMoneySpend()]);
	for (const s of ['## May', '## Must', '## Cannot', 'money.spend/cannot/payee-signs', 'camping-club/money.spend/cannot/over-200-without-vote', 'declared, not yet checked']) {
		assert.ok(brief.includes(s), `brief lacks ${s}`);
	}
});
