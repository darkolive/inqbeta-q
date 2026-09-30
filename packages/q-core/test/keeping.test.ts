/*
 * The rules about where work is kept.
 *
 * Written after a real loss: browser storage was the silent default on a
 * browser with no folder picker, the warning sat in a hint at the bottom of a
 * panel, and clearing website data took everything. Safari would have taken it
 * anyway after seven days of not opening the site.
 *
 * These are the sentences a person actually sees, so they are tested like
 * anything else that can be wrong.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHERE_NOT_TO_KEEP, WHERE_TO_KEEP, canKeep, howStale, riskOf, type Keeping } from '../src/keeping';

/*
 * Revised 2026-09-23. The browser is the working copy and "Back up now" is the
 * safe one. So the browser's answer turns on the age of the last backup, and
 * is never a wall of danger.
 */
const DAY = 86_400_000;

test('a browser never backed up asks for a backup, calmly', () => {
	const risk = riskOf({ where: 'browser', copies: 0 });
	assert.equal(risk.level, 'warn');
	assert.equal(risk.temporary, true);
	assert.match(risk.says, /not backed up/i);
	assert.match(risk.fix, /back up now/i);
});

test('a browser backed up this week is fine, and says when', () => {
	const now = Date.now();
	assert.equal(riskOf({ where: 'browser', copies: 0, backedUpAt: now }, now).level, 'fine');
	assert.match(riskOf({ where: 'browser', copies: 0, backedUpAt: now }, now).says, /today/);
	assert.match(riskOf({ where: 'browser', copies: 0, backedUpAt: now - 3 * DAY }, now).says, /3 days ago/);
});

test('a backup older than Safari\'s seven days asks again', () => {
	const now = Date.now();
	const risk = riskOf({ where: 'browser', copies: 0, backedUpAt: now - 8 * DAY }, now);
	assert.equal(risk.level, 'warn');
	assert.match(risk.says, /8 days ago/);
	assert.match(risk.fix, /back up now/i);
});

test('a folder on disk with no other copy is a warning, not a crisis', () => {
	const risk = riskOf({ where: 'disk', copies: 0 });
	assert.equal(risk.level, 'warn');
	assert.equal(risk.temporary, false);
	assert.match(risk.fix, /not a backup/i);
});

test('a folder on disk with a copy elsewhere is fine, and nothing is nagged', () => {
	const risk = riskOf({ where: 'disk', copies: 2 });
	assert.equal(risk.level, 'fine');
	assert.equal(risk.temporary, false);
	assert.equal(risk.fix, '');
});

test('nothing chosen yet is a warning with something to do, not a danger', () => {
	const risk = riskOf({ where: 'none', copies: 0 });
	assert.equal(risk.level, 'warn');
	assert.equal(risk.temporary, false);
	assert.ok(risk.fix.trim());
});

test('a folder, or the browser with Back up now, is where work lives', () => {
	assert.equal(canKeep('disk'), true);
	assert.equal(canKeep('browser'), true);
	assert.equal(canKeep('none'), false);
});

test('every place has an answer, and every danger has a way out', () => {
	for (const where of ['disk', 'browser', 'none'] as Keeping[]) {
		for (const copies of [0, 1, 5]) {
			const risk = riskOf({ where, copies });
			assert.ok(risk.says.trim(), `${where}/${copies} says nothing`);
			if (risk.level !== 'fine') {
				assert.ok(risk.fix.trim(), `${where}/${copies} is not fine and offers nothing to do`);
			}
		}
	}
});

test('a folder that syncs is as good as a copy, and says so differently', () => {
	const synced = riskOf({ where: 'disk', copies: 0, synced: true });
	assert.equal(synced.level, 'fine');
	assert.match(synced.says, /syncs/i);
	assert.equal(synced.fix, '');

	/* Both, and it says both rather than picking one. */
	const both = riskOf({ where: 'disk', copies: 2, synced: true });
	assert.equal(both.level, 'fine');
	assert.match(both.says, /syncs/i);
	assert.match(both.says, /2 other copies/i);
});

test('the advice names somewhere to put it, and somewhere not to', () => {
	assert.ok(WHERE_TO_KEEP.length >= 2);
	for (const place of WHERE_TO_KEEP) {
		assert.ok(place.name.trim(), 'a suggestion with no name');
		assert.ok(place.why.trim(), `${place.name} is suggested without a reason`);
	}
	/* Downloads must be warned against by name: it is what most pickers open in,
	 * and it is the folder people empty. */
	assert.ok(
		WHERE_NOT_TO_KEEP.some((p) => /downloads/i.test(p.name)),
		'Downloads is the obvious wrong answer and must be named'
	);
	for (const place of WHERE_NOT_TO_KEEP) {
		assert.ok(place.why.trim(), `${place.name} is warned against without a reason`);
	}
});

/*
 * Remote copies.
 *
 * The promise is that the version in front of you is the real one. That is
 * only worth anything if Q is willing to say, out loud, that everything else
 * is behind — including the thing someone is paying for.
 */
test('a federation copy is a copy, and says who can be asked and what they can refuse', () => {
	const risk = riskOf({ where: 'federation', copies: 1 });
	assert.equal(risk.level, 'warn');
	assert.match(risk.says, /can refuse/i, 'do not imply a right that does not exist');
	assert.match(risk.says, /last time you pushed/i);
});

test('a network copy promises less, and is honest about the part that cannot be fixed', () => {
	const risk = riskOf({ where: 'network', copies: 1 });
	assert.match(risk.says, /cannot read it/i);
	assert.match(risk.says, /will not delete it because you asked/i);
});

test('a remote place holding the only copy is a danger, however much it cost', () => {
	for (const where of ['federation', 'network'] as const) {
		const risk = riskOf({ where, copies: 0 });
		assert.equal(risk.level, 'danger', `${where} alone is not a home`);
		assert.match(risk.fix, /in front of you/i);
	}
});

test('nowhere remote can be the place work lives', () => {
	assert.equal(canKeep('federation'), false);
	assert.equal(canKeep('network'), false);
	assert.equal(canKeep('disk'), true);
});

test('how far behind a copy is, said plainly rather than as a timestamp', () => {
	const now = Date.now();
	assert.match(howStale(null, now), /never pushed/i);
	assert.match(howStale(now, now), /just now/i);
	assert.match(howStale(now - 5 * 60_000, now), /5 minutes ago/);
	assert.match(howStale(now - 3 * 3_600_000, now), /3 hours behind/);
	assert.match(howStale(now - 2 * 86_400_000, now), /2 days behind/);
	/* Singulars, because "1 days behind" is how a person stops trusting a screen. */
	assert.match(howStale(now - 3_600_000, now), /1 hour behind/);
	assert.match(howStale(now - 86_400_000, now), /1 day behind/);
});
