/* Testing Q page by page: claims, reports, how a list stands. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { allChecks, checkItem, claim, listVersion, report, standing, EVERY_PAGE, LANGUAGE_CHECKS, type Checklist } from '../src/checks';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 61 + n) % 251);
const NOW = new Date('2026-10-06T12:00:00Z');
const later = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const list: Checklist = { id: 'keys', page: '/keys', title: 'Keys', group: 'you', needs: 'Signed in', checks: [{ id: 'link-site', says: 'Link a site.', how: 'human', area: 'works' }] };

test('a list is its own checks, every page’s, and the languages; its version moves when a check does', async () => {
	assert.equal(allChecks(list).length, 1 + EVERY_PAGE.length + LANGUAGE_CHECKS.length);
	const v = await listVersion(list);
	assert.notEqual(v, await listVersion({ ...list, checks: [{ ...list.checks[0], says: 'Link a site, then unlink it.' }] }));
});

test('claimed, part done, problems, passed, out of date', async () => {
	const tess = await identityFromSeed(seed(1));
	const robot = await identityFromSeed(seed(2));
	const v = await listVersion(list);
	assert.equal(standing(list, v, [], NOW).state, 'open');

	const c = await claim(tess, list, { name: 'Tess' }, NOW);
	assert.ok((await checkItem(c)).ok);
	assert.equal(standing(list, v, [c], later(1)).state, 'claimed');
	assert.equal(standing(list, v, [c], later(49)).state, 'open', 'a claim runs out after two days');

	const ai = await report(robot, list, { by: 'ai', site: 'https://inqbeta.com', results: [{ check: 'every-loads', outcome: 'pass' }, { check: 'every-phone', outcome: 'pass' }] }, later(2));
	const s1 = standing(list, v, [c, ai], later(3));
	assert.equal(s1.state, 'claimed', 'still being tested by Tess');
	assert.equal(s1.passed, 2);

	await assert.rejects(report(tess, list, { site: 'x', results: [{ check: 'link-site', outcome: 'fail' }] }), /what went wrong/);
	const bad = await report(tess, list, { name: 'Tess', site: 'https://inqbeta.com', results: [{ check: 'link-site', outcome: 'fail', note: 'The Link button does nothing on Safari.' }, { check: 'nonsense', outcome: 'pass' }] }, later(4));
	assert.equal(bad.content.results.length, 1, 'checks not on the list are dropped');
	const s2 = standing(list, v, [c, ai, bad], later(5));
	assert.equal(s2.state, 'issues');
	assert.equal(s2.problems[0].note, 'The Link button does nothing on Safari.');
	assert.equal(s2.claimed, undefined, 'her report ends her claim');

	const all = allChecks(list).map((x) => ({ check: x.id, outcome: 'pass' as const }));
	const good = await report(tess, list, { site: 'https://inqbeta.com', results: all }, later(6));
	assert.equal(standing(list, v, [c, ai, bad, good], later(7)).state, 'passed');

	const changed = { ...list, checks: [...list.checks, { id: 'unlink', says: 'Unlink it.', how: 'human' as const, area: 'works' as const }] };
	assert.equal(standing(changed, await listVersion(changed), [c, ai, bad, good], later(7)).state, 'out-of-date');

	assert.equal((await checkItem({ ...good, content: { ...good.content, list: 'other' } })).ok, false, 'tampered');
});
