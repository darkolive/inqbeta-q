/*
 * How sure you have to be.
 *
 * Two things are being defended. A set declares what must be TRUE, never what
 * to COLLECT — a receipt travels, and what make of key somebody used is not
 * part of what they said. And the ladder never bends: a device that cannot
 * meet the bar produces a refusal, not an answering quietly recorded lower
 * down.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	ASSURANCE,
	ASSURANCE_MEANS,
	canAnswer,
	checkAttested,
	meets,
	needsFor,
	rung,
	type Assurance,
} from '../src/assurance';
import { QUESTION_SET_SCHEMA, buildAnswerSet, type QuestionSet } from '../src/questions';

const ME = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

const set = (over: Partial<QuestionSet> = {}): QuestionSet => ({
	schema: QUESTION_SET_SCHEMA,
	id: 'q/test',
	title: { 'en-GB': 'Test' },
	questions: [{ id: 'q:test/one', answer: 'text', asks: { 'en-GB': 'Something?' } }],
	...over,
});

test('the ladder is ordered by meaning, and every rung says what it means', () => {
	assert.deepEqual(ASSURANCE, ['none', 'signed', 'present', 'verified', 'witnessed']);
	for (const a of ASSURANCE) assert.ok(ASSURANCE_MEANS[a].length > 20, `${a} needs a real sentence`);
	assert.equal(meets('verified', 'present'), true);
	assert.equal(meets('present', 'verified'), false);
});

test('comparing the WORDS instead of the rungs would lower the bar', () => {
	/* The bug this test exists for: 'signed' sorts after 'present'
	 * alphabetically and before it in meaning. */
	assert.ok('signed' > 'present', 'alphabetically, yes');
	assert.ok(rung('signed') < rung('present'), 'in meaning, no');
	assert.equal(meets('signed', 'present'), false);
});

test('a question raises the bar and can never lower it', () => {
	assert.equal(needsFor('signed', 'verified'), 'verified');
	assert.equal(needsFor('verified', 'signed'), 'verified', 'a hole in a declared standard is not an override');
	assert.equal(needsFor(undefined, undefined), 'signed', 'the default is a signature');
});

test('a set that needs more than the device can do is refused, not downgraded', async () => {
	const strict = set({ needs: 'verified' });
	const out = await buildAnswerSet({ did: ME, set: strict, values: { 'q:test/one': 'hello' }, held: 'signed' });
	assert.equal(out.ok, false);
	assert.match((out as { says: string[] }).says.join(' '), /fingerprint, face or PIN/i);
	assert.match((out as { says: string[] }).says.join(' '), /device that can/i, 'say what would work');
});

test('what was achieved is written down, so a receipt cites its own standard', async () => {
	const out = await buildAnswerSet({ did: ME, set: set({ needs: 'present' }), values: { 'q:test/one': 'hi' }, held: 'verified' });
	assert.equal(out.ok, true);
	assert.equal((out as { answers: { held: Assurance } }).answers.held, 'verified',
		'what happened, not what was asked for');
});

test('one strict question raises the whole answering', async () => {
	const mixed = set({
		needs: 'signed',
		questions: [
			{ id: 'q:test/one', answer: 'text', asks: { 'en-GB': 'Something?' } },
			{ id: 'q:test/two', answer: 'text', asks: { 'en-GB': 'Confirm?' }, needs: 'verified' },
		],
	});
	const out = await buildAnswerSet({ did: ME, set: mixed, values: { 'q:test/one': 'a', 'q:test/two': 'b' }, held: 'signed' });
	assert.equal(out.ok, false, 'the strictest question sets the bar for the answering');
});

test('the bar is part of the address, so it cannot be raised retrospectively', async () => {
	const { setAddress } = await import('../src/questions');
	const plain = await setAddress(set());
	const strict = await setAddress(set({ needs: 'verified' }));
	assert.notEqual(plain.address, strict.address);
	/* And a set with no bar declared addresses exactly as it always did, so
	 * every receipt written before today still verifies. */
	const same = await setAddress(set({ needs: undefined }));
	assert.equal(same.address, plain.address);
});

test('a hardware fingerprint never travels in a receipt', () => {
	for (const field of ['aaguid', 'signCount', 'clientDataJSON', 'origin', 'transports', 'credentialId', 'userAgent']) {
		const c = checkAttested({ held: 'verified', sig: 'abc', [field]: 'anything' });
		assert.equal(c.ok, false, `${field} must not travel`);
		assert.deepEqual(c.refused, [field]);
		assert.match(c.says, /what make of key you used/i);
	}
});

test('the whole of what a signing may leave behind', () => {
	assert.equal(checkAttested({ held: 'verified', sig: 'abc' }).ok, true);
	assert.equal(checkAttested({ held: 'none' }).ok, true, 'a note needs no signature');
	assert.match(checkAttested({ held: 'signed' }).says, /carry the signature/i);
	assert.match(checkAttested({ held: 'witnessed', sig: 'a' }).says, /witnessed by whom/i);
	assert.match(checkAttested({ held: 'excellent', sig: 'a' }).says, /how sure it is/i);
});

test('a shortfall says what would work, not only that it did not', () => {
	for (const need of ['signed', 'present', 'verified', 'witnessed'] as Assurance[]) {
		const s = canAnswer('none', need);
		assert.equal(s.ok, false);
		assert.ok(s.fix.trim(), `${need} needs a way forward`);
	}
	assert.equal(canAnswer('witnessed', 'signed').ok, true);
});
