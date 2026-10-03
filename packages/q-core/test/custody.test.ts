/* Custody (ADR-Q-028 §4): nothing is let go until it's held elsewhere — and the receipts are the meter. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith, checkReceipt } from '../src/seal';
import { CUSTODY_SCHEMA, CUSTODY_SOURCE, mayForget, mayLetGo, problemsWithCustody, relayOf, usageOf, type Custody, type CustodyReceipt } from '../src/custody';

const seed = (n: number) => new Uint8Array(32).fill(n);
const H = (c: string) => c.repeat(64);
const T0 = Date.parse('2026-10-03T12:00:00Z');
const at = (h: number) => new Date(T0 + h * 3_600_000).toISOString();
const RELAY = 'relay:did:key:zNode';
const c = (x: Partial<Custody> & Pick<Custody, 'kind' | 'item'>): Custody => ({ schema: CUSTODY_SCHEMA, source: CUSTODY_SOURCE, bytes: 1000, where: RELAY, at: at(0), ...x });

test('custody receipts say what, how big, where, and (held) until when; an arrival names what it releases', () => {
	assert.deepEqual(problemsWithCustody(c({ kind: 'held', item: H('a'), until: at(168) })), []);
	assert.ok(problemsWithCustody(c({ kind: 'held', item: H('a') })).some((p) => /let go at the latest/.test(p)));
	assert.ok(problemsWithCustody(c({ kind: 'held', item: 'x', until: at(1) })).some((p) => /content hash/.test(p)));
	assert.deepEqual(problemsWithCustody(c({ kind: 'arrived', item: H('a'), where: 'google-drive', releases: RELAY })), []);
	assert.ok(problemsWithCustody(c({ kind: 'arrived', item: H('a'), where: RELAY, releases: RELAY })).some((p) => /somewhere other/.test(p)));
});

test('no receipt, no letting go: only the owner’s arrival elsewhere, or the time running out', async () => {
	const ana = await identityFromSeed(seed(71));
	const eve = await identityFromSeed(seed(72));
	const node = await identityFromSeed(seed(73));
	const held = (await sealWith(node, c({ kind: 'held', item: H('a'), until: at(168) }))) as CustodyReceipt;
	assert.equal(mayLetGo(H('a'), RELAY, ana.did, [held], T0 + 3_600_000).ok, false, 'held, not yet arrived: keep it');
	const byEve = (await sealWith(eve, c({ kind: 'arrived', item: H('a'), where: 'google-drive', releases: RELAY, at: at(2) }))) as CustodyReceipt;
	assert.equal(mayLetGo(H('a'), RELAY, ana.did, [held, byEve]).ok, false, 'only the owner can say it arrived');
	const arrived = (await sealWith(ana, c({ kind: 'arrived', item: H('a'), where: 'google-drive', releases: RELAY, at: at(2) }))) as CustodyReceipt;
	assert.deepEqual(mayLetGo(H('a'), RELAY, ana.did, [held, arrived]), { ok: true, because: 'arrived' });
	assert.deepEqual(mayLetGo(H('a'), RELAY, ana.did, [held], T0 + 169 * 3_600_000), { ok: true, because: 'time-up' });
	assert.equal((await checkReceipt(arrived)).ok, true);

	/* The browser keeps a file until something has signed that it holds it. */
	assert.equal(mayForget(H('a'), [], T0), false);
	assert.equal(mayForget(H('a'), [held], T0), true);
	assert.equal(mayForget(H('a'), [held], T0 + 169 * 3_600_000), false, 'a held receipt past its time is no reason to forget');
});

test('the receipts are the meter: files, bytes, byte-hours, still open', async () => {
	const ana = await identityFromSeed(seed(74));
	const node = await identityFromSeed(seed(75));
	const rs = [
		(await sealWith(node, c({ kind: 'held', item: H('a'), bytes: 1000, until: at(168) }))) as CustodyReceipt,
		(await sealWith(ana, c({ kind: 'arrived', item: H('a'), where: 'google-drive', releases: RELAY, at: at(2) }))) as CustodyReceipt,
		(await sealWith(node, c({ kind: 'held', item: H('b'), bytes: 500, at: at(1), until: at(169) }))) as CustodyReceipt
	];
	const u = usageOf(rs, RELAY, T0 + 5 * 3_600_000);
	assert.equal(u.items, 2);
	assert.equal(u.bytes, 1500);
	assert.equal(u.open, 1);
	assert.equal(u.byteHours, 1000 * 2 + 500 * 4);
	assert.equal(u.meanHours, 2);
});

test('your relay space is the same on every device, and not your inbox', async () => {
	const ana = await identityFromSeed(seed(76));
	const again = await identityFromSeed(seed(76));
	const a = await relayOf(ana);
	assert.deepEqual(a, await relayOf(again));
	assert.equal(a.id.length, 22);
	assert.ok(a.key.length >= 40, 'a real key');
	const { inboxOf } = await import('../src/inbox');
	assert.notEqual(a.id, (await inboxOf(ana)).id);
});
