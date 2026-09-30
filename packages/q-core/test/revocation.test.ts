/*
 * Revocation.
 *
 * Two jobs. Keep the shape small enough to hand to a stranger, because a
 * revocation travels further than anything else in the system. And stop it
 * being mistaken for a remedy, because a person told "done" will not re-key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canBeUndone, checkRevocation, exposureAfter, timeStanding, type Revocation } from '../src/revocation';

const DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const DRIVE = 'did:key:z6MkweTn4zvvHVT4a2Vvpah2Q6QhnJhAqZgHwj3ni4bEpGnc';

const good = (over: Partial<Revocation> = {}): Record<string, unknown> => ({
	subject: DRIVE,
	by: DID,
	at: '2026-09-20T14:32:00Z',
	...over,
});

test('the smallest thing that works, passes', () => {
	const c = checkRevocation(good());
	assert.equal(c.ok, true);
	assert.match(c.says, /handed to anyone/i);
});

test('nothing rides along — this is the most widely distributed receipt there is', () => {
	for (const field of ['content', 'location', 'path', 'serial', 'address', 'contents']) {
		const c = checkRevocation(good({ [field]: 'anything at all' } as Partial<Revocation>));
		assert.equal(c.ok, false, `${field} must not travel in a revocation`);
		assert.deepEqual(c.refused, [field]);
		assert.match(c.says, /nothing private can travel in it/i);
	}
});

test('it names a DID, never a drive label or a path', () => {
	assert.equal(checkRevocation(good({ subject: 'flash drive 2026' } as Partial<Revocation>)).ok, false);
	assert.equal(checkRevocation(good({ subject: '/Volumes/ARCHIVE' } as Partial<Revocation>)).ok, false);
});

test('who and when are both required, because an incident record is both', () => {
	const noBy = { ...good() };
	delete noBy.by;
	assert.match(checkRevocation(noBy).says, /who is declaring/i);

	assert.match(checkRevocation(good({ at: 'last Tuesday' } as Partial<Revocation>)).says, /when/i);
});

test('a reason is free text, because a kernel that understands reasons is one that judges', () => {
	const c = checkRevocation(good({ because: 'we got robbed and I cannot find it' }));
	assert.equal(c.ok, true);
});

test('an unwitnessed time is your own word, and says so rather than implying proof', () => {
	const mine = timeStanding(good() as Revocation);
	assert.equal(mine.trusted, false);
	assert.match(mine.says, /not proof to someone disputing it/i);

	const witnessed = timeStanding({ ...(good() as Revocation), anchor: 'fed:sig:abc' });
	assert.equal(witnessed.trusted, true);
});

test('found is not unrevoked', () => {
	assert.equal(canBeUndone(), false);
});

test('the robbery, told honestly: identity key and no rotation is permanent', () => {
	const v = exposureAfter({
		sealedToItsOwnKey: false,
		keyCanBeDestroyed: false,
		opensWithIdentityKey: true,
		identityKeyIsFixed: true,
	});
	assert.equal(v.exposure, 'permanent');
	assert.match(v.says, /does not close what is already out there/i);
	assert.match(v.fix, /treat everything that was on it as read/i);
	/* And it names the change that stops it happening again. */
	assert.match(v.fix, /key of their own/i);
});

test('sealed to its own destroyable key is the case where revoking is nearly a remedy', () => {
	const v = exposureAfter({
		sealedToItsOwnKey: true,
		keyCanBeDestroyed: true,
		opensWithIdentityKey: false,
		identityKeyIsFixed: false,
	});
	assert.equal(v.exposure, 'closable');
	assert.match(v.fix, /destroy that key/i);
	assert.match(v.says, /only with that drive/i);
});

test('a key nobody has means the drive is already noise', () => {
	const v = exposureAfter({
		sealedToItsOwnKey: true,
		keyCanBeDestroyed: false,
		opensWithIdentityKey: false,
		identityKeyIsFixed: false,
	});
	assert.equal(v.exposure, 'closed');
	assert.equal(v.fix, '');
});

test('not knowing what could open it is its own answer, and it is pessimistic', () => {
	const v = exposureAfter({
		sealedToItsOwnKey: false,
		keyCanBeDestroyed: false,
		opensWithIdentityKey: false,
		identityKeyIsFixed: false,
	});
	assert.equal(v.exposure, 'unknown');
	assert.match(v.fix, /assume it is readable/i);
});
