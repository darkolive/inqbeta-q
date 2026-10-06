/* Trust travels down: the core as served, judged against Incubator's releases (ADR-Q-019 addendum). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { foundFederation, newDraft } from '../src/federations';
import { checkCard, checkRegistration, makeCard, register } from '../src/registration';
import { compareLink, coreInWords, coreReleases, judgeCore, readCoreServed, signCoreRelease, sourceProblem, MASTER_REPO, type CoreServed } from '../src/core-served';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 59 + n) % 251);
const NOW = new Date('2026-10-06T12:00:00Z');
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const served = (sha256: string, release = '0.1.0'): CoreServed => ({ schema: 'inqbeta.core-served/1', release, commit: '99fa8041a237beb4ccaec6d7c5e9ec0322efb4dd', kernel: '/_app/immutable/chunks/PM49vtXs.js', sha256 });

test('a site’s word about its core is read only when well formed', () => {
	assert.ok(readCoreServed(served(A)));
	assert.equal(readCoreServed({ ...served(A), kernel: 'https://elsewhere.example/x.js' }), null, 'the chunk must be on the site itself');
	assert.equal(readCoreServed({ ...served(A), sha256: 'nope' }), null);
});

test('only the registrar’s releases count; then unchanged, a named branch, or changed', async () => {
	const incubator = await identityFromSeed(seed(1));
	const mallory = await identityFromSeed(seed(2));
	const list = [await signCoreRelease(incubator, served(A), NOW), await signCoreRelease(mallory, served(B), NOW)];
	const releases = await coreReleases(list, incubator.did);
	assert.deepEqual(releases.map((r) => r.sha256), [A], 'someone else can’t add a release');

	const straight = judgeCore({ served: served(A), fetched: A, releases });
	assert.equal(straight.kind, 'unchanged');
	assert.match(coreInWords(straight), /unchanged, release 0\.1\.0/);

	assert.equal(judgeCore({ served: served(A), fetched: B, releases }).kind, 'changed', 'its word must match what it serves');
	assert.equal(judgeCore({ served: served(B), fetched: B, releases }).kind, 'changed', 'changed, and says nothing');
	assert.equal(judgeCore({ served: null, fetched: null, releases }).kind, 'changed', 'no core.json');

	const source = { repo: 'https://github.com/hillfarm/q', branch: 'hill-farm', commit: '1234567abcdef' };
	const branch = judgeCore({ served: served(B), fetched: B, releases, source });
	assert.equal(branch.kind, 'branch');
	if (branch.kind === 'branch') {
		assert.equal(branch.nearest, '99fa8041a237beb4ccaec6d7c5e9ec0322efb4dd');
		assert.equal(compareLink(branch.source, branch.nearest), `${MASTER_REPO}/compare/99fa8041a237beb4ccaec6d7c5e9ec0322efb4dd...hillfarm:q:1234567abcdef`);
	}
	assert.equal(judgeCore({ served: served(B), fetched: B, releases, source: { ...source, commit: 'main' } }).kind, 'changed', 'a branch must name a real commit');
	assert.equal(compareLink({ ...source, repo: 'https://git.hillfarm.example/q' }, null), 'https://git.hillfarm.example/q');
});

test('a branch names its source on the card, and the registration keeps what Incubator found', async () => {
	const ana = await identityFromSeed(seed(3));
	const incubator = await identityFromSeed(seed(4));
	const f = await foundFederation(signerFor(ana), { ...newDraft(NOW), name: 'Hill Farm Co-op', purpose: 'Growing together.' }, { now: NOW });
	const source = { repo: 'https://github.com/hillfarm/q/', branch: ' hill-farm ', commit: '1234567abcdef' };
	const base = { name: 'Hill Farm Co-op', purpose: 'Growing together.', site: 'https://hillfarm.example', visibility: 'public' as const, runs: { q: '0.1.0' }, previous: null };
	const card = await makeCard(signerFor(f.key), signerFor(ana), { ...base, source }, NOW);
	assert.deepEqual(card.source, { repo: 'https://github.com/hillfarm/q', branch: 'hill-farm', commit: '1234567abcdef' });
	assert.ok((await checkCard(card, f.founding)).ok);
	assert.equal((await checkCard({ ...card, source: { ...card.source!, commit: '7654321abcdef' } })).ok, false, 'the source is signed');
	await assert.rejects(makeCard(signerFor(f.key), signerFor(ana), { ...base, source: { ...source, repo: 'http://x' } }), /https/);
	assert.equal(sourceProblem({ repo: 'https://github.com/a/b', branch: '', commit: '1234567' }), 'Name the branch.');

	const finding = judgeCore({ served: served(B), fetched: B, releases: [], source: card.source });
	const reg = await register(incubator, card, ['…', coreInWords(finding)], NOW, finding);
	assert.equal(reg.content.core?.kind, 'branch');
	assert.ok((await checkRegistration(reg, card, incubator.did, NOW)).ok);
});
