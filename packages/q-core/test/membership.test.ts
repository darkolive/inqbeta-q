/*
 * Joining, leaving and removal (ADR-Q-007 §4). Real keys, real signatures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { foundFederation, newDraft, type JoinPolicy } from '../src/federations';
import {
	acceptRequest,
	checkInvitation,
	checkLeft,
	checkMembership,
	checkRemoved,
	hashReceipt,
	isInvitation,
	isJoining,
	joinFrom,
	leave,
	makeInvitation,
	pack,
	remove,
	unpack
} from '../src/membership';

const NOW = new Date('2026-09-28T12:00:00Z');
const LATER = new Date('2026-09-29T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 11 + n) % 251);

async function club(joinPolicy: JoinPolicy = 'open') {
	const darren = await identityFromSeed(seed(1));
	const theo = await identityFromSeed(seed(2));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Wem Stamp Club', purpose: 'Stamps.', joinPolicy }, { now: NOW });
	const fed = signerFor(f.key);
	const inv = await makeInvitation(fed, f.founding, f.manifest, { for: 'Theo', now: NOW });
	return { darren, theo, f, fed, inv };
}

test('an invitation checks out offline, and says who it is from', async () => {
	const { inv } = await club();
	const c = await checkInvitation(inv, LATER);
	assert.equal(c.ok, true, c.says);
	assert.match(c.says, /Wem Stamp Club/);
	assert.equal(inv.offer.admits, true);
	assert.equal(inv.offer.for, 'Theo');
});

test('only the federation key can invite', async () => {
	const { darren, f } = await club();
	await assert.rejects(makeInvitation(signerFor(darren), f.founding, f.manifest, { now: NOW }), /Only the federation/);
});

test('a changed, stale or forged invitation is refused', async () => {
	const { inv, theo } = await club();
	assert.equal((await checkInvitation({ ...inv, offer: { ...inv.offer, admits: false } }, LATER)).ok, false);
	assert.equal((await checkInvitation({ ...inv, manifest: { ...inv.manifest, principles: [] } }, LATER)).ok, false);
	const stale = await checkInvitation(inv, new Date('2026-11-01T00:00:00Z'));
	assert.equal(stale.ok, false);
	assert.match(stale.says, /ran out/);
	const forged = { ...inv, offer: { ...inv.offer, signatures: [{ by: 'federation', did: inv.offer.federation, signature: inv.offer.signatures[0].signature.replace(/^./, 'A') }] } };
	assert.equal((await checkInvitation(forged, LATER)).ok, false);
	await assert.rejects(joinFrom(signerFor(theo), inv, new Date('2026-11-01T00:00:00Z')), /ran out/);
});

test('open: signing the agreement makes a member at once, no round trip', async () => {
	const { theo, inv, f } = await club('open');
	const j = await joinFrom(signerFor(theo), inv, LATER);
	assert.equal(j.member, theo.did);
	assert.equal(j.manifest, f.founding.manifest);
	const m = await checkMembership(j);
	assert.equal(m.state, 'member', m.says);
	assert.equal(m.how, 'offer');
});

test('invite works the same way — the invitation itself is the countersignature', async () => {
	const { theo, inv } = await club('invite');
	assert.equal((await checkMembership(await joinFrom(signerFor(theo), inv, LATER))).state, 'member');
});

test('ask to join: a request waits until the caretaker countersigns it', async () => {
	const { theo, inv, fed, f } = await club('request');
	assert.equal(inv.offer.admits, false);
	const request = await joinFrom(signerFor(theo), inv, LATER);
	assert.equal((await checkMembership(request)).state, 'waiting');
	const accepted = await acceptRequest(fed, request, f.founding.manifest);
	const m = await checkMembership(accepted);
	assert.equal(m.state, 'member', m.says);
	assert.equal(m.how, 'countersigned');
	await assert.rejects(acceptRequest(fed, request, 'manifest:sha256:other'), /different rules/);
});

test('a joining cannot be altered or claimed by someone else', async () => {
	const { theo, darren, inv } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	assert.equal((await checkMembership({ ...j, member: darren.did })).state, 'invalid');
	assert.equal((await checkMembership({ ...j, agreement: 'agreement:sha256:none' })).state, 'invalid');
	assert.equal((await checkMembership({ ...j, at: '2026-12-25T00:00:00Z' })).state, 'invalid', 'signed after the offer ran out');
});

test('the founder, from founding, is a member too', async () => {
	const { f } = await club();
	assert.equal((await checkMembership(f.joined)).state, 'member');
});

test('leaving needs only the member — and nobody can leave for them', async () => {
	const { theo, darren, inv } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	const left = await leave(signerFor(theo), j, LATER);
	assert.equal(left.signatures.length, 1);
	assert.equal(left.joined, await hashReceipt(j));
	assert.equal((await checkLeft(left)).ok, true);
	await assert.rejects(leave(signerFor(darren), j, LATER), /Only the member/);
	assert.equal((await checkLeft({ ...left, member: darren.did })).ok, false);
});

test('removal is signed by the federation, cites a clause, and leaves the joining valid', async () => {
	const { theo, darren, inv, fed, f } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	await assert.rejects(remove(fed, { federation: f.founding.federation, member: theo.did, clause: '', says: 'x' }, LATER), /cite the clause/);
	await assert.rejects(remove(signerFor(darren), { federation: f.founding.federation, member: theo.did, clause: 'agreement', says: 'x' }, LATER), /federation’s own key/);
	const r = await remove(fed, { federation: f.founding.federation, member: theo.did, clause: 'agreement', says: 'Repeatedly unkind at meetings.' }, LATER);
	assert.equal((await checkRemoved(r)).ok, true);
	assert.equal((await checkMembership(j)).state, 'member', 'removal ends belonging from now on; it does not rewrite the joining');
});

test('invitations and joinings travel in a link and come back intact', async () => {
	const { theo, inv } = await club();
	const packed = await pack(inv);
	assert.ok(packed.length < 2600, `${packed.length} characters`);
	const back = await unpack(`#${packed}`);
	assert.ok(isInvitation(back));
	assert.equal((await checkInvitation(back, LATER)).ok, true);
	const j = await joinFrom(signerFor(theo), back, LATER);
	const jb = await unpack(await pack(j));
	assert.ok(isJoining(jb));
	assert.equal((await checkMembership(jb)).state, 'member');
	assert.equal(await unpack('not a packet'), null);
});

/* ---- Suspension ---- */
import { SUSPENSION_MOST_DAYS, checkLifted, checkSuspended, isNotice, lift, standingAt, suspend } from '../src/membership';

const DAY = 86_400_000;

test('a month’s suspension pauses a member, then ends on its own', async () => {
	const { theo, inv, fed, f } = await club();
	await joinFrom(signerFor(theo), inv, LATER);
	const s = await suspend(fed, { federation: f.founding.federation, member: theo.did, clause: 'The agreement', says: 'Shouting at the AGM.', until: new Date(LATER.getTime() + 30 * DAY) }, LATER);
	assert.equal((await checkSuspended(s)).ok, true);
	assert.equal(standingAt({ suspended: s }, new Date(LATER.getTime() + 10 * DAY)).is, 'suspended');
	assert.equal(standingAt({ suspended: s }, new Date(LATER.getTime() + 31 * DAY)).is, 'member', 'back on its own');
});

test('a suspension must end, within a year, cite a clause, say why, and not be backdated', async () => {
	const { theo, fed, f, darren } = await club();
	const base = { federation: f.founding.federation, member: theo.did, clause: 'The agreement', says: 'x' };
	await assert.rejects(suspend(fed, { ...base, until: new Date(LATER.getTime() + (SUSPENSION_MOST_DAYS + 5) * DAY) }, LATER), /a year at most/);
	await assert.rejects(suspend(fed, { ...base, until: new Date(LATER.getTime() - DAY) }, LATER), /end after it starts/);
	await assert.rejects(suspend(fed, { ...base, clause: ' ', until: new Date(LATER.getTime() + DAY) }, LATER), /cite the clause/);
	await assert.rejects(suspend(fed, { ...base, says: '', until: new Date(LATER.getTime() + DAY) }, LATER), /Say why/);
	await assert.rejects(suspend(fed, { ...base, from: new Date(LATER.getTime() - 7 * DAY), until: new Date(LATER.getTime() + DAY) }, LATER), /before it is signed/);
	await assert.rejects(suspend(signerFor(darren), { ...base, until: new Date(LATER.getTime() + DAY) }, LATER), /federation’s own key/);
});

test('a suspension can be lifted early, and a tampered one is caught', async () => {
	const { theo, fed, f } = await club();
	const s = await suspend(fed, { federation: f.founding.federation, member: theo.did, clause: 'The agreement', says: 'x', until: new Date(LATER.getTime() + 30 * DAY) }, LATER);
	const l = await lift(fed, s, 'Apologised.', new Date(LATER.getTime() + 3 * DAY));
	assert.equal((await checkLifted(l, s)).ok, true);
	assert.equal(standingAt({ suspended: s, lifted: l }, new Date(LATER.getTime() + 10 * DAY)).is, 'member');
	assert.equal((await checkSuspended({ ...s, until: new Date(LATER.getTime() + 300 * DAY).toISOString() })).ok, false, 'lengthening it breaks the signature');
});

test('leaving and removal outrank suspension; a suspended member can still leave', async () => {
	const { theo, inv, fed, f } = await club();
	const j = await joinFrom(signerFor(theo), inv, LATER);
	const s = await suspend(fed, { federation: f.founding.federation, member: theo.did, clause: 'c', says: 'x', until: new Date(LATER.getTime() + 30 * DAY) }, LATER);
	const left = await leave(signerFor(theo), j, new Date(LATER.getTime() + DAY));
	assert.equal(standingAt({ suspended: s, left }, new Date(LATER.getTime() + 2 * DAY)).is, 'left');
});

test('notices travel in a link too', async () => {
	const { theo, fed, f } = await club();
	const s = await suspend(fed, { federation: f.founding.federation, member: theo.did, clause: 'c', says: 'x', until: new Date(LATER.getTime() + 30 * DAY) }, LATER);
	const back = await unpack(await pack(s));
	assert.ok(isNotice(back));
	assert.equal((await checkSuspended(back)).ok, true);
});

/* ---- Consent, step by step, and how a member is known ---- */
import { consentSteps, consentHashes, CONSENT_SUGGESTIONS } from '../src/federations';
import { cardFits, openMemberCard, hashCard, MEMBER_CARD_SCHEMA } from '../src/membership';

const PIC = 'data:image/webp;base64,' + 'A'.repeat(400);

async function clubWithBlocks() {
	const darren = await identityFromSeed(seed(1));
	const theo = await identityFromSeed(seed(2));
	const consent = [CONSENT_SUGGESTIONS[0], CONSENT_SUGGESTIONS[1]];
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Wem Stamp Club', purpose: 'Stamps.', consent }, { now: NOW });
	const inv = await makeInvitation(signerFor(f.key), f.founding, f.manifest, { now: NOW });
	return { darren, theo, f, inv };
}

test('consent comes as steps: the agreement, the federation’s own blocks, then what never changes', async () => {
	const { f } = await clubWithBlocks();
	assert.deepEqual(consentSteps(f.manifest).map((s) => s.id), ['agreement', 'photos', 'subs', 'principles']);
	assert.deepEqual(f.joined.consented, await consentHashes(f.manifest), 'the founder agreed to all of it too');
});

test('a joining names every step it agreed to — and skipping one refuses to join', async () => {
	const { theo, inv, f } = await clubWithBlocks();
	const j = await joinFrom(signerFor(theo), inv, { now: LATER });
	assert.deepEqual(j.consented, await consentHashes(f.manifest));
	await assert.rejects(joinFrom(signerFor(theo), inv, { now: LATER, agreed: ['agreement', 'photos', 'principles'] }), /Not agreed: subs/);
});

test('anonymous sends no card; the federation learns only that a member joined', async () => {
	const { theo, inv } = await clubWithBlocks();
	const j = await joinFrom(signerFor(theo), inv, { now: LATER, knownAs: 'anonymous', card: { name: 'Theo' } });
	assert.equal(j.knownAs, 'anonymous');
	assert.equal(j.card, undefined);
	assert.equal(j.sealedCard, undefined, 'a name offered while anonymous is not sent');
});

test('name and picture: sealed so only the federation opens it, and it is the card they signed', async () => {
	const { theo, inv, f } = await clubWithBlocks();
	const j = await joinFrom(signerFor(theo), inv, { now: LATER, knownAs: 'name-and-picture', card: { name: 'Theo', picture: PIC } });
	assert.ok(j.sealedCard && j.card);
	const card = await openMemberCard(j, f.key);
	assert.deepEqual(card, { schema: MEMBER_CARD_SCHEMA, name: 'Theo', picture: PIC });
	assert.equal(await hashCard(card!), j.card);
	await assert.rejects(openMemberCard(j, theo), /./, 'nobody but the federation can open it');
	assert.equal((await checkMembership(j)).state, 'member', 'the sealed card rides beside the signature');
});

test('a name-only joining never carries a picture, and a card cannot be swapped', async () => {
	const { theo, inv, f } = await clubWithBlocks();
	const j = await joinFrom(signerFor(theo), inv, { now: LATER, knownAs: 'name', card: { name: 'Theo', picture: PIC } });
	assert.deepEqual(await openMemberCard(j, f.key), { schema: MEMBER_CARD_SCHEMA, name: 'Theo' });
	const other = await joinFrom(signerFor(theo), inv, { now: LATER, knownAs: 'name', card: { name: 'Somebody else' } });
	await assert.rejects(openMemberCard({ ...j, sealedCard: other.sealedCard }, f.key), /not the one they signed/);
});

test('a card holds only what was chosen', () => {
	assert.equal(cardFits('anonymous', null).ok, true);
	assert.equal(cardFits('anonymous', { schema: MEMBER_CARD_SCHEMA, name: 'x' }).ok, false);
	assert.equal(cardFits('name', { schema: MEMBER_CARD_SCHEMA }).ok, false);
	assert.equal(cardFits('name', { schema: MEMBER_CARD_SCHEMA, name: 'Theo', picture: PIC }).ok, false);
	assert.equal(cardFits('name-and-picture', { schema: MEMBER_CARD_SCHEMA, name: 'Theo', picture: 'data:text/html;base64,AA' }).ok, false);
	assert.equal(cardFits('name-and-picture', { schema: MEMBER_CARD_SCHEMA, name: 'Theo', picture: PIC + 'A'.repeat(40_000) }).ok, false);
	assert.equal(cardFits('name', { schema: MEMBER_CARD_SCHEMA, name: 'Theo', email: 'x' } as never).ok, false);
});

test('a request with a card keeps it when the caretaker accepts', async () => {
	const darren = await identityFromSeed(seed(1));
	const theo = await identityFromSeed(seed(2));
	const f = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Club', purpose: 'x', joinPolicy: 'request' }, { now: NOW });
	const inv = await makeInvitation(signerFor(f.key), f.founding, f.manifest, { now: NOW });
	const req = await joinFrom(signerFor(theo), inv, { now: LATER, knownAs: 'name', card: { name: 'Theo' } });
	const ok = await acceptRequest(signerFor(f.key), req, f.founding.manifest);
	assert.equal((await checkMembership(ok)).state, 'member');
	assert.equal((await openMemberCard(ok, f.key))?.name, 'Theo');
});
