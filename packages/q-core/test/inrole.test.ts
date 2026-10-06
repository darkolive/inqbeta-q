/* Acting in role, checked (ADR-Q-038 step 2): the take-up receipt and a running mandate that covers the command. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { b64url } from '../src/canonical';
import { foundFederation, newDraft } from '../src/federations';
import { appoint } from '../src/offices';
import { actingCovers, isInRole, setDown, takeUp, type InRoleReceipt } from '../src/inrole';
import { sealWith } from '../src/seal';
import { readDelegation } from '../src/ucan/token';
import { unb64url } from '../src/canonical';

const NOW = new Date('2026-10-06T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 31 + n) % 251);
const RECONCILE = '/fed/money/reconcile';

async function club() {
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const tess = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Green Space', purpose: 'Gardening.' }, { now: NOW });
	const id = f.founding.federation;
	const grant = b64url(f.grant.bytes);
	const treasurer = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant }, NOW);
	const secretary = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'secretary', holder: tess.did, months: 12, says: 'Chosen.', grant }, NOW);
	return { darren, sam, tess, f, id, grant, treasurer, secretary };
}
const NONE = { kind: 'none' } as const;
const up = async (who: Parameters<typeof takeUp>[0], id: string, office: string, declaration: Parameters<typeof takeUp>[1]['declaration'] = NONE) => (await takeUp(who, { federation: id, name: 'Green Space', office, declaration }, NOW)) as InRoleReceipt;

test('the treasurer, in role, may reconcile; the receipts read back', async () => {
	const { sam, id, treasurer } = await club();
	const t = await up(sam, id, 'treasurer');
	assert.ok(isInRole(t));
	const ok = await actingCovers(sam.did, { federation: id, office: 'treasurer', mandates: treasurer.tokens, takenUp: t }, { federation: id, cmd: RECONCILE, now: NOW });
	assert.deepEqual(ok, { ok: true, office: 'treasurer', by: 'mandate', interest: null });
	assert.match(t.content.words!, /no conflict of interest/);
	const down = await setDown(sam, t, NOW);
	assert.ok(isInRole(down) && down.content.takenUp === t.contentHash);
});

test('the caretaker may too: by the founding grant, or by the founding itself when the vault isn’t here', async () => {
	const { darren, id, grant } = await club();
	const t = await up(darren, id, 'caretaker');
	assert.equal((await actingCovers(darren.did, { federation: id, office: 'caretaker', mandates: [grant], takenUp: t }, { federation: id, cmd: RECONCILE, now: NOW })).ok, true);
	const byFounding = await actingCovers(darren.did, { federation: id, office: 'caretaker', mandates: [], takenUp: t }, { federation: id, cmd: RECONCILE, founder: darren.did, now: NOW });
	assert.deepEqual(byFounding, { ok: true, office: 'caretaker', by: 'founding', interest: null });
});

test('refused: not in role, the wrong office, someone else’s take-up or mandate, run out, recalled', async () => {
	const { darren, sam, tess, id, treasurer, secretary } = await club();
	const t = await up(sam, id, 'treasurer');
	const as = { federation: id, office: 'treasurer', mandates: treasurer.tokens, takenUp: t };
	const check = (asker: string, acting: unknown, now = NOW, revoked?: Set<string>) => actingCovers(asker, acting, { federation: id, cmd: RECONCILE, founder: darren.did, now, revoked });

	assert.match(((await check(sam.did, null)) as { says: string }).says, /Take up your office first/);
	const ts = await up(tess, id, 'secretary');
	assert.match(((await check(tess.did, { federation: id, office: 'secretary', mandates: secretary.tokens, takenUp: ts })) as { says: string }).says, /secretary can’t do money work/);
	assert.equal((await check(tess.did, { ...as, takenUp: ts })).ok, false, 'Tess with Sam’s mandate and her own take-up');
	const tessAsTreasurer = await up(tess, id, 'treasurer');
	assert.equal((await check(tess.did, { ...as, takenUp: tessAsTreasurer })).ok, false, 'the mandate is to Sam, not to Tess');
	assert.equal((await check(darren.did, { ...as })).ok, false, 'Sam’s take-up, Darren asking');
	assert.equal((await check(darren.did, { federation: id, office: 'caretaker', mandates: [], takenUp: t })).ok, false);
	assert.equal((await check(sam.did, { ...as, federation: 'did:key:z6MkElsewhere' })).ok, false);
	assert.equal((await check(sam.did, as, new Date(treasurer.until * 1000 + 1000))).ok, false, 'the term ran out');
	assert.equal((await check(sam.did, as, new Date(NOW.getTime() - 3600_000))).ok, false, 'taken up after the ask');
	const cid = (await readDelegation(unb64url(treasurer.tokens[0]))).cid.toString();
	const told = await check(sam.did, as, NOW, new Set([cid]));
	assert.match((told as { says: string }).says, /ended early/, 'a recall the server has been told of');
});

test('every take-up is a declaration: none, or the interest, signed; without one it doesn’t count', async () => {
	const { sam, id, treasurer } = await club();
	await assert.rejects(takeUp(sam, { federation: id, name: 'Green Space', office: 'treasurer', declaration: { kind: 'interest', says: ' ' } }), /Declare first/);
	const declared = await up(sam, id, 'treasurer', { kind: 'interest', says: 'My partner sells to the club.' });
	assert.match(declared.content.words!, /I declare it: My partner sells to the club\.$/);
	const ok = await actingCovers(sam.did, { federation: id, office: 'treasurer', mandates: treasurer.tokens, takenUp: declared }, { federation: id, cmd: RECONCILE, now: NOW });
	assert.deepEqual(ok, { ok: true, office: 'treasurer', by: 'mandate', interest: 'My partner sells to the club.' }, 'an interest declared doesn’t stop you: it travels with what you do');
	const bare = (await sealWith(sam, { schema: 'inqbeta.in-role/1', source: 'inqbeta:q/role', event: 'role.taken-up', federation: id, name: 'Green Space', office: 'treasurer', at: NOW.toISOString() })) as InRoleReceipt;
	const no = await actingCovers(sam.did, { federation: id, office: 'treasurer', mandates: treasurer.tokens, takenUp: bare }, { federation: id, cmd: RECONCILE, now: NOW });
	assert.match((no as { says: string }).says, /needs a declaration/);
});

test('offices of responsibility: verifier, reviewer, compliance officer', async () => {
	const { officeMay, APPOINTABLE } = await import('../src/offices');
	assert.ok(['verifier', 'reviewer', 'compliance'].every((o) => APPOINTABLE.some((k) => k.id === o)));
	assert.ok(officeMay('verifier', '/fed/verify') && officeMay('reviewer', '/fed/review/decision') && officeMay('compliance', '/fed/compliance'));
	assert.ok(!officeMay('verifier', '/fed/money') && officeMay('caretaker', '/fed/verify'));
});
