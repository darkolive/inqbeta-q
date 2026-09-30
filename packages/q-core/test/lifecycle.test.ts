/*
 * Where things live as they age.
 *
 * The tiers are ordinary records practice and need little defending. What
 * needs defending is the three places this differs from how such a screen is
 * usually built: checked is not told, counting is not safety, and a reminder
 * that never escalates is wallpaper.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	ARCHIVE_GOES_UNSEEN_MS,
	CHECK_GOES_STALE_MS,
	archiveDue,
	canBeChecked,
	howSafe,
	standingOfPlace,
	waysToSurvive,
	whatComesBack,
	type Place,
} from '../src/lifecycle';

const MONTH = 30 * 24 * 60 * 60 * 1000;
const at = (tier: Place['tier'], fate: string, over: Partial<Place> = {}): Place => ({
	id: fate + tier,
	name: fate,
	tier,
	fate,
	lastChecked: Date.now(),
	...over,
});

test('only the drive in the cupboard cannot be checked, and that is the whole point', () => {
	assert.equal(canBeChecked('here'), true);
	assert.equal(canBeChecked('synced'), true);
	assert.equal(canBeChecked('cold'), true);
	assert.equal(canBeChecked('archive'), false);
});

test('an archive copy is a memory, and says so rather than showing a tick', () => {
	const now = Date.now();
	const s = standingOfPlace(at('archive', 'the blue SSD', { lastChecked: now - 2 * MONTH }), now);
	assert.equal(s.confidence, 'told');
	assert.match(s.says, /cannot check it/i);
	/* Never "verified", never "backed up". It was plugged in once and unplugged. */
	assert.doesNotMatch(s.says, /verified|confirmed/i);
});

test('an archive unseen for over a year is called a memory, not a fact', () => {
	const now = Date.now();
	const s = standingOfPlace(at('archive', 'the blue SSD', { lastChecked: now - ARCHIVE_GOES_UNSEEN_MS - MONTH }), now);
	assert.match(s.says, /memory, not a fact/i);
});

test('a bucket that answered is the only thing allowed to sound certain', () => {
	const now = Date.now();
	assert.equal(standingOfPlace(at('cold', 'the bucket'), now).confidence, 'checked');
	const old = standingOfPlace(at('cold', 'the bucket', { lastChecked: now - CHECK_GOES_STALE_MS - 1 }), now);
	assert.equal(old.confidence, 'stale');
	assert.match(old.says, /not been checked/i);
});

test('two folders in one Dropbox are one copy wearing two coats', () => {
	const places = [
		at('synced', 'dropbox', { id: 'a', name: 'Dropbox/Q' }),
		at('synced', 'dropbox', { id: 'b', name: 'Dropbox/Backups/Q' }),
	];
	assert.equal(waysToSurvive(places), 1, 'one account suspension takes both');
});

test('three copies on one laptop is a danger, and the sentence says why', () => {
	const places = [
		at('here', 'this mac', { id: 'a', name: 'Documents' }),
		at('here', 'this mac', { id: 'b', name: 'Desktop' }),
		at('here', 'this mac', { id: 'c', name: 'a second folder' }),
	];
	const s = howSafe(places);
	assert.equal(s.level, 'danger');
	assert.match(s.says, /all go together/i);
	assert.match(s.fix, /not this computer/i);
});

test('safety counts ways, not copies, and asks for three of them', () => {
	const now = Date.now();
	const two = howSafe([at('here', 'this mac'), at('synced', 'dropbox')], now);
	assert.equal(two.level, 'warn');
	assert.equal(two.ways, 2);
	assert.match(two.fix, /unplug/i, 'name the missing kind, not just the missing number');

	const three = howSafe([at('here', 'this mac'), at('synced', 'dropbox'), at('cold', 'the bucket')], now);
	assert.equal(three.level, 'fine');
	assert.equal(three.ways, 3);
});

test('three ways nobody has confirmed lately is still only a warning', () => {
	const now = Date.now();
	const stale = { lastChecked: now - CHECK_GOES_STALE_MS - 1 };
	const s = howSafe(
		[at('here', 'this mac', stale), at('synced', 'dropbox', stale), at('cold', 'the bucket', stale)],
		now,
	);
	assert.equal(s.level, 'warn');
	assert.match(s.says, /none of them has been confirmed/i);
	assert.match(s.fix, /fact rather than a hope/i);
});

test('the archive reminder escalates, or it becomes wallpaper', () => {
	const now = Date.now();
	const year = 365 * 24 * 60 * 60 * 1000;

	assert.equal(archiveDue({ afterMs: year, lastWrittenAt: now - MONTH }, now).due, false);

	const justDue = archiveDue({ afterMs: year, lastWrittenAt: now - year - 1 }, now);
	assert.equal(justDue.due, true);
	assert.match(justDue.says, /due/i);

	const long = archiveDue({ afterMs: year, lastWrittenAt: now - year - 7 * MONTH }, now);
	assert.equal(long.due, true);
	/* A different sentence, naming the consequence. The same one twice is ignored twice. */
	assert.notEqual(long.says, justDue.says);
	assert.match(long.says, /exists only where you are working/i);
	assert.match(long.fix, /waited long enough/i);
});

test('never having archived is due immediately, and says why now is easier than later', () => {
	const d = archiveDue({ afterMs: 365 * 24 * 60 * 60 * 1000, lastWrittenAt: null });
	assert.equal(d.due, true);
	assert.match(d.fix, /before there is a year of it/i);
});

test('a federation gives back a catalogue, and the difference is stated not blurred', () => {
	const records = whatComesBack({ records: true, blobs: false });
	assert.equal(records.can, 'catalogue');
	assert.match(records.says, /not the things themselves/i);

	assert.equal(whatComesBack({ records: true, blobs: true }).can, 'everything');
	assert.equal(whatComesBack({ records: false, blobs: false }).can, 'nothing');
});
