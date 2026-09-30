/*
 * Calls as a chain of receipts (ADR-Q-004): placed → accepted → each side's
 * own ending. Real keys; SDP shaped like a browser's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, openerFor } from '../src/passkey';
import {
	acceptCall, callChain, checkAccepted, checkCallChain, checkPlaced, endCall, fingerprintOf,
	packHandshake, placeCall, unpackHandshake
} from '../src/calls';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 7 + n) % 251);
const FP_A = 'AA:' + '11:'.repeat(30) + 'FF';
const FP_B = 'BB:' + '22:'.repeat(30) + 'EE';
const sdp = (fp: string, extra = '') =>
	['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', `a=fingerprint:sha-256 ${fp}`,
		'a=candidate:1 1 udp 2122260223 192.0.2.10 54321 typ host', 'm=video 9 UDP/TLS/RTP/SAVPF 96', `a=fingerprint:sha-256 ${fp}`, extra, ''].join('\r\n');
const T0 = Date.parse('2026-09-25T20:00:00Z');

async function people() {
	return { darren: await identityFromSeed(seed(1)), theo: await identityFromSeed(seed(2)), stranger: await identityFromSeed(seed(9)) };
}

async function answered() {
	const p = await people();
	const placed = await placeCall(p.darren, { sdp: sdp(FP_A), to: p.theo.did }, T0);
	const accepted = await acceptCall(p.theo, placed.step, sdp(FP_B), T0 + 5_000);
	return { ...p, placed, accepted };
}

test('fingerprintOf: one agreed fingerprint, or nothing', () => {
	assert.equal(fingerprintOf(sdp(FP_A)), `sha-256 ${FP_A}`);
	assert.equal(fingerprintOf(sdp(FP_A, `a=fingerprint:sha-256 ${FP_B}`)), null);
	assert.equal(fingerprintOf('v=0\r\n'), null);
});

test('placed then accepted: each checks, and accepted names placed by its hash', async () => {
	const { darren, theo, placed, accepted } = await answered();
	const p = await checkPlaced(placed, { me: theo.did, now: T0 });
	assert.equal(p.ok, true, p.ok ? '' : p.says);
	const a = await checkAccepted(accepted, { placed: placed.step, now: T0 });
	assert.equal(a.ok, true, a.ok ? '' : a.says);
	assert.equal(accepted.step.content.parent, placed.step.contentHash);
	assert.equal(placed.step.content.parent, null);
	/* Facts only: the receipt holds the SDP's hash, not the SDP. */
	assert.ok(!JSON.stringify(placed.step).includes('192.0.2.10'));
	void darren;
});

test('a swapped SDP (a man in the middle) is caught, however it is swapped', async () => {
	const { placed } = await answered();
	assert.equal((await checkPlaced({ ...placed, sdp: sdp(FP_B) }, { now: T0 })).ok, false, 'new key');
	assert.equal((await checkPlaced({ ...placed, sdp: sdp(FP_A, 'a=candidate:9 1 udp 1 203.0.113.9 9 typ host') }, { now: T0 })).ok, false, 'same key, other address');
	const edited = structuredClone(placed);
	edited.step.content.fingerprint = `sha-256 ${FP_B}`;
	assert.equal((await checkPlaced(edited, { now: T0 })).ok, false, 'receipt edited');
});

test('stops ringing after an hour; a call for someone else, or an answer to another call, is refused', async () => {
	const { darren, theo, stranger, placed, accepted } = await answered();
	assert.equal((await checkPlaced(placed, { now: T0 + 2 * 60 * 60 * 1000 })).ok, false);
	assert.equal((await checkPlaced(placed, { me: stranger.did, now: T0 })).ok, false);
	const other = await placeCall(darren, { sdp: sdp(FP_A, 'a=ice-ufrag:x'), to: theo.did }, T0);
	assert.equal((await checkAccepted(accepted, { placed: other.step, now: T0 })).ok, false);
	assert.equal((await checkAccepted(placed, { placed: placed.step, now: T0 })).ok, false, 'wrong kind');
	await assert.rejects(acceptCall(darren, placed.step, sdp(FP_B)), 'own call');
});

test('links pack small, round-trip, and a sealed one opens only for the person called', async () => {
	const { theo, stranger, placed } = await answered();
	const plain = await packHandshake(placed);
	const back = await unpackHandshake(`https://q.example/call#o=${plain}`);
	assert.equal(back.ok && (await checkPlaced(back.handshake, { now: T0 })).ok, true);
	const sealed = await packHandshake(placed, [theo.did]);
	assert.equal((await unpackHandshake(sealed)).ok, false, 'needs a key');
	const opened = await unpackHandshake(sealed, openerFor(theo));
	assert.equal(opened.ok && opened.sealed && (await checkPlaced(opened.handshake, { now: T0 })).ok, true);
	assert.equal((await unpackHandshake(sealed, openerFor(stranger))).ok, false);
	assert.equal((await unpackHandshake('not a link')).ok, false);
});

test('each side closes its own end; the chain is complete when both have', async () => {
	const { darren, theo, placed, accepted } = await answered();
	const began = T0 + 6_000;
	const mine = await endCall(darren, accepted.step, { began, ended: began + 754_000, media: ['video', 'audio'], route: 'direct', how: 'hung-up' });
	const theirs = await endCall(theo, accepted.step, { began: began + 400, ended: began + 755_000, media: ['audio', 'video'], route: 'direct', how: 'they-left' });
	const half = await checkCallChain(callChain([placed.step, accepted.step, mine]));
	assert.equal(half.ok && !half.summary.complete, true);
	const c = await checkCallChain(callChain([placed.step, accepted.step, mine, theirs]));
	assert.equal(c.ok, true, c.ok ? '' : c.says);
	if (!c.ok) return;
	assert.equal(c.summary.complete, true);
	assert.deepEqual(c.summary.closedBy, [darren.did, theo.did]);
	assert.match(c.says, /Video call, 13 minutes, direct\. Placed, accepted, and each of you closed your own side\./);
	assert.equal(mine.content.parent, accepted.step.contentHash);
	assert.equal(theirs.content.parent, accepted.step.contentHash);
});

test('a call nobody answered is still a chain: placed, then the caller closes it', async () => {
	const { darren, theo, placed } = await answered();
	const closed = await endCall(darren, placed.step, { ended: T0 + 60_000, media: [], how: 'no-answer' });
	const c = await checkCallChain(callChain([placed.step, closed]));
	assert.equal(c.ok && !c.summary.accepted && c.says === 'Placed, and not answered.', true, c.ok ? c.says : c.says);
	await assert.rejects(endCall(theo, placed.step, { ended: T0, media: [], how: 'cancelled' }), 'only the caller');
});

test('a broken chain is refused: edits, strangers, wrong parents, twice-closed, out of order', async () => {
	const { darren, theo, stranger, placed, accepted } = await answered();
	const end = (who: typeof darren, from = accepted.step) => endCall(who, from, { began: T0, ended: T0 + 40_000, media: ['audio'], how: 'hung-up' });
	const mine = await end(darren);

	const edited = structuredClone(mine);
	edited.content.seconds = 4000;
	assert.equal((await checkCallChain(callChain([placed.step, accepted.step, edited]))).ok, false, 'edited');

	assert.equal((await checkCallChain(callChain([placed.step, accepted.step, await end(stranger)]))).ok, false, 'stranger');
	assert.equal((await checkCallChain(callChain([placed.step, accepted.step, mine, await end(darren)]))).ok, false, 'twice');
	assert.equal((await checkCallChain(callChain([accepted.step, placed.step, mine]))).ok, false, 'order');

	const other = await placeCall(darren, { sdp: sdp(FP_A, 'a=ice-ufrag:y'), to: theo.did }, T0);
	assert.equal((await checkCallChain(callChain([other.step, accepted.step, mine]))).ok, false, 'accepted follows another call');

	/* An impostor accepting a call addressed to Theo. */
	const hijack = await acceptCall(stranger, placed.step, sdp(FP_B), T0);
	assert.equal((await checkCallChain(callChain([placed.step, hijack.step]))).ok, false, 'wrong person accepted');
});
