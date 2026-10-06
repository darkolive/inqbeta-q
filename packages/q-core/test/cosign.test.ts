/* Two signatures (ADR-Q-007 Money block; ADR-Q-038 §6): money, your own account, a declared interest. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { b64url } from '../src/canonical';
import { foundFederation, newDraft } from '../src/federations';
import { appoint } from '../src/offices';
import { takeUp, type Acting, type InRoleReceipt } from '../src/inrole';
import { askSecond, checkCosigned, needsSecond, signSecond } from '../src/cosign';

const NOW = new Date('2026-10-06T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 43 + n) % 251);
const CASH_OUT = '/fed/money/cash-out';
const NONE = { kind: 'none' } as const;

async function club() {
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const tess = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Green Space', purpose: 'Gardening.' }, { now: NOW });
	const id = f.founding.federation;
	const grant = b64url(f.grant.bytes);
	const treasurer = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant }, NOW);
	const secretary = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'secretary', holder: tess.did, months: 12, says: 'Chosen.', grant }, NOW);
	const acting = async (who: typeof darren, office: string, mandates: string[], declaration: Parameters<typeof takeUp>[1]['declaration'] = NONE): Promise<Acting> => ({
		federation: id,
		office,
		mandates,
		takenUp: (await takeUp(who, { federation: id, name: 'Green Space', office, declaration }, NOW)) as InRoleReceipt
	});
	return { darren, sam, tess, id, grant, treasurer, secretary, acting };
}
const action = { kind: 'cash-out', credits: 120, to: 'the federation’s account ending 5678' };

test('money needs two: the treasurer asks, the caretaker signs, it holds', async () => {
	const { darren, sam, treasurer, grant, acting } = await club();
	const asSam = await acting(sam, 'treasurer', treasurer.tokens);
	assert.deepEqual(needsSecond({ cmd: CASH_OUT, holder: sam.did, acting: asSam }), ['money']);
	const asked = await askSecond(signerFor(sam), asSam, { cmd: CASH_OUT, action, says: 'Cash out £120 to pay the hall hire.' }, NOW);
	const waiting = await checkCosigned(asked, { now: NOW });
	assert.equal(waiting.ok, false);
	assert.ok(!waiting.ok && waiting.waiting, 'one signature is only asked');

	const both = await signSecond(asked, signerFor(darren), await acting(darren, 'caretaker', [grant]));
	const c = await checkCosigned(both, { now: NOW });
	assert.ok(c.ok, c.says);
	if (c.ok) assert.deepEqual([c.first.office, c.second.office], ['treasurer', 'caretaker']);

	const changed = await checkCosigned({ ...both, action: { ...action, credits: 1200 } }, { now: NOW });
	assert.equal(changed.ok, false, 'a changed amount breaks both signatures');
});

test('not the same person twice, not someone without the money mandate, not the one it pays', async () => {
	const { darren, sam, tess, treasurer, secretary, grant, acting } = await club();
	const asSam = await acting(sam, 'treasurer', treasurer.tokens);
	const asked = await askSecond(signerFor(sam), asSam, { cmd: CASH_OUT, action, says: 'Cash out £120.' }, NOW);
	await assert.rejects(signSecond(asked, signerFor(sam), asSam), /someone else/);
	const bySecretary = await signSecond(asked, signerFor(tess), await acting(tess, 'secretary', secretary.tokens));
	assert.match((await checkCosigned(bySecretary, { now: NOW })).says, /secretary can’t do money/);

	/* The treasurer pays themselves back: it touches their own account. */
	const own = await askSecond(signerFor(sam), asSam, { cmd: CASH_OUT, action: { ...action, to: 'Sam' }, says: 'Repay Sam’s expenses.', subject: sam.did }, NOW);
	assert.deepEqual(own.why, ['money', 'own']);
	const okOwn = await checkCosigned(await signSecond(own, signerFor(darren), await acting(darren, 'caretaker', [grant])), { now: NOW });
	assert.ok(okOwn.ok, 'another holder may agree it');

	/* The caretaker asks to repay themselves; the treasurer can agree, but the caretaker can't sign their own. */
	const asDarren = await acting(darren, 'caretaker', [grant]);
	const mine = await askSecond(signerFor(darren), asDarren, { cmd: CASH_OUT, action, says: 'Repay Darren.', subject: darren.did }, NOW);
	await assert.rejects(signSecond(mine, signerFor(darren), asDarren), /someone else/);
	assert.ok((await checkCosigned(await signSecond(mine, signerFor(sam), asSam), { now: NOW })).ok);
});

test('a declared interest sends it to another holder, and that holder can’t carry one too', async () => {
	const { darren, sam, treasurer, grant, acting } = await club();
	const interested = await acting(sam, 'treasurer', treasurer.tokens, { kind: 'interest', says: 'My partner runs the hall we’re paying.' });
	const asked = await askSecond(signerFor(sam), interested, { cmd: CASH_OUT, action, says: 'Pay the hall.' }, NOW);
	assert.deepEqual(asked.why, ['money', 'interest']);
	const darrenInterested = await acting(darren, 'caretaker', [grant], { kind: 'interest', says: 'I use the hall too.' });
	await assert.rejects(signSecond(asked, signerFor(darren), darrenInterested), /declared an interest/);
	assert.ok((await checkCosigned(await signSecond(asked, signerFor(darren), await acting(darren, 'caretaker', [grant])), { now: NOW })).ok);
});
