import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { requestLink, approveLink, checkLink, rootOf, unlinkKey } from '../src/links';

const seed = (n: number) => new Uint8Array(32).fill(n);

test('a site key and the root, both signing, make one identity — offline', async () => {
	const root = await identityFromSeed(seed(1));
	const site = await identityFromSeed(seed(2));
	const req = await requestLink(signerFor(site), root.did, 'Dark Olive (local)', 'http://localhost:5173');
	const pending = await checkLink(req);
	assert.ok(pending.ok && !pending.complete, 'a request alone links nothing');
	assert.equal(await rootOf(site.did, [req]), null);

	const link = await approveLink(signerFor(root), req);
	const done = await checkLink(link);
	assert.ok(done.ok && done.complete);
	const r = await rootOf(site.did, [link]);
	assert.equal(r?.root, root.did);
	assert.equal(r?.label, 'Dark Olive (local)');
});

test('a key cannot be claimed without its own signature, nor linked by the wrong root', async () => {
	const root = await identityFromSeed(seed(1));
	const other = await identityFromSeed(seed(3));
	const site = await identityFromSeed(seed(2));
	const req = await requestLink(signerFor(site), root.did, 'Dark Olive');

	// someone rewrites the key field to claim a key they do not hold
	const hijack = structuredClone(req);
	hijack.key = other.did;
	assert.ok(!(await checkLink(hijack)).ok);

	// a different root cannot approve it
	await assert.rejects(approveLink(signerFor(other), req));

	// a forged root signature does not pass
	const forged = await approveLink(signerFor(root), req);
	forged.label = 'Something else';
	assert.ok(!(await checkLink(forged)).ok);
});

test('unlinking is forward only, and must come from the root', async () => {
	const root = await identityFromSeed(seed(1));
	const site = await identityFromSeed(seed(2));
	const link = await approveLink(signerFor(root), await requestLink(signerFor(site), root.did, 'Old laptop'));
	const before = new Date(Date.now() + 1).toISOString();
	await new Promise((r) => setTimeout(r, 5));
	const off = await unlinkKey(signerFor(root), link, 'lost');
	assert.ok((await checkLink(off)).ok);
	assert.equal(await rootOf(site.did, [link, off]), null, 'no longer speaks for the root');
	assert.equal((await rootOf(site.did, [link, off], before))?.root, root.did, 'but did before the unlink');

	const selfUnlink = await unlinkKey(signerFor(site), link);
	assert.ok(!(await checkLink({ ...selfUnlink, root: root.did })).ok, 'only the root can unlink');
});
