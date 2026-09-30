import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { act, answer, approveDestroy, ask, grant, isAllowed } from '../src/permissions';
import { approveLinkUcan, requestLinkUcan, rootOfUcan, ucanLinks, unlinkKeyUcan } from '../src/links';
import { asRevocation } from '../src/ucan/revoke';
import { readToken, readInvocation, type Token } from '../src/ucan/token';
import { readContainerTokens, writeContainer } from '../src/ucan/container';

const person = async (n: number) => signerFor(await identityFromSeed(new Uint8Array(32).fill(n)));
const thing = 'sha256:course-42';

test('the passkey signer signs UCANs', async () => {
	const owner = await person(1);
	const d = await grant(owner, { to: owner.did, thing, can: 'read' });
	assert.equal((await readToken(d.bytes)).payload.iss, owner.did);
});

test('owner → reviewer → reviewer’s helper: merge allowed on review branches of that thing only', async () => {
	const [owner, reviewer, helper] = await Promise.all([person(1), person(2), person(3)]);
	const g1 = await grant(owner, { to: reviewer.did, thing, can: 'merge', branch: 'review-*' });
	const g2 = await grant(reviewer, { to: helper.did, thing, can: 'merge', from: g1 });

	const ok = await act(helper, { owner: owner.did, thing, can: 'merge', args: { branch: 'review-2' }, proofs: [g1, g2] });
	const r = isAllowed(await readInvocation(ok.bytes), { proofs: [g1, g2] });
	assert.equal(r.root, owner.did);
	assert.deepEqual(r.chain.map((d) => d.payload.iss), [owner.did, reviewer.did], 'every pass-on shows');

	const otherThing = await act(helper, { owner: owner.did, thing: 'sha256:other', can: 'merge', args: { branch: 'review-2' }, proofs: [g1, g2] });
	assert.throws(() => isAllowed(otherThing, { proofs: [g1, g2] }), { code: 'MatchError' });
	const main = await act(helper, { owner: owner.did, thing, can: 'merge', args: { branch: 'main' }, proofs: [g1, g2] });
	assert.throws(() => isAllowed(main, { proofs: [g1, g2] }), { code: 'MatchError' });
	const shred = await act(helper, { owner: owner.did, thing, can: 'shred', proofs: [g1, g2] });
	assert.throws(() => isAllowed(shred, { proofs: [g1, g2] }), { code: 'InvalidClaim' });
	await assert.rejects(grant(helper, { to: owner.did, thing, can: 'merge', from: g1 }), { code: 'InvalidAudience' });
});

test('destroy needs a second signature from the council', async () => {
	const [owner, council, stranger] = await Promise.all([person(1), person(9), person(4)]);
	await assert.rejects(act(owner, { owner: owner.did, thing, can: 'destroy' }), { code: 'NeedsApproval' });

	const yes = await approveDestroy(council, { owner: owner.did, thing, reason: 'duplicate course' });
	const kill = await act(owner, { owner: owner.did, thing, can: 'destroy', approval: yes });
	const r = isAllowed(kill, { proofs: [], approvals: [yes], council: [council.did] });
	assert.equal(r.approvedBy, council.did);

	assert.throws(() => isAllowed(kill, { proofs: [], approvals: [], council: [council.did] }), { code: 'UnavailableProof' });
	assert.throws(() => isAllowed(kill, { proofs: [], approvals: [yes], council: [] }), { code: 'NeedsApproval' });
	const selfYes = await approveDestroy(owner, { owner: owner.did, thing });
	const selfKill = await act(owner, { owner: owner.did, thing, can: 'destroy', approval: selfYes });
	assert.throws(() => isAllowed(selfKill, { proofs: [], approvals: [selfYes], council: [owner.did] }), { code: 'NeedsApproval' });
	const wrong = await approveDestroy(council, { owner: owner.did, thing: 'sha256:other' });
	const wrongKill = await act(owner, { owner: owner.did, thing, can: 'destroy', approval: wrong });
	assert.throws(() => isAllowed(wrongKill, { proofs: [], approvals: [wrong], council: [council.did] }), { code: 'NeedsApproval' });
	void stranger;
});

test('a system asks; a person answers with a short, narrow grant that names them', async () => {
	const [owner, system] = await Promise.all([person(1), person(5)]);
	const req = await ask(system, { owner: owner.did, thing, want: 'read', reason: 'index the course' });
	const g = await answer(owner, req);
	assert.equal(g.payload.aud, system.did);
	assert.ok(g.payload.exp !== null && g.payload.exp <= Math.floor(Date.now() / 1000) + 7 * 86400);
	assert.equal(g.payload.meta?.['inqbeta/approved-by'], owner.did);
	const use = await act(system, { owner: owner.did, thing, can: 'read', proofs: [g] });
	assert.doesNotThrow(() => isAllowed(use, { proofs: [g] }));
	assert.throws(() => isAllowed(use, { proofs: [g], at: (g.payload.exp as number) + 1 }), { code: 'Expired' });
	const greedy = await ask(system, { owner: owner.did, thing, want: 'destroy', reason: 'tidy up' });
	await assert.rejects(answer(owner, greedy), { code: 'NeedsApproval' });
});

test('a site key linked to a root by UCAN, carried in a container, unlinked forward only', async () => {
	const [root, site] = await Promise.all([person(1), person(6)]);
	const request = await requestLinkUcan(site, root.did, 'Dark Olive', 'https://darkolive.co.uk');
	const approval = await approveLinkUcan(root, request);
	const text = (await writeContainer([request, approval])) as string;
	const tokens: Token[] = await readContainerTokens(text);
	assert.equal(ucanLinks(tokens).length, 1);
	const hit = rootOfUcan(site.did, tokens);
	assert.equal(hit?.root, root.did);
	assert.equal(hit?.label, 'Dark Olive');

	const stranger = await person(7);
	const forged = await approveLinkUcan(stranger, await requestLinkUcan(site, stranger.did, 'x')).catch(() => null);
	assert.ok(forged, 'anyone can answer a request made to them…');
	assert.equal(rootOfUcan(site.did, [request, forged!]), null, '…but not someone else’s request');
	await assert.rejects(approveLinkUcan(stranger, request), { code: 'InvalidAudience' });

	const off = await unlinkKeyUcan(root, approval, 'lost laptop');
	const known = asRevocation(await readInvocation(off.bytes), [approval]);
	assert.equal(rootOfUcan(site.did, tokens, [known], known.at - 1)?.root, root.did, 'what it signed before stands');
	assert.equal(rootOfUcan(site.did, tokens, [known], known.at), null);
	const notRoot = { ...known, by: site.did };
	assert.equal(rootOfUcan(site.did, tokens, [notRoot])?.root, root.did, 'only the root can unlink');
});
