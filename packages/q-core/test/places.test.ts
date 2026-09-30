/*
 * Places, which are channels for data rather than for messages.
 *
 * Two rules are doing the work here. A place is confirmed by a round trip and
 * not by a capability — written AND read back — because Q has already been
 * caught believing a browser that said it could keep things. And a place's own
 * name is never announced anywhere public, because a key that owns a flash
 * drive should not be a fact strangers can archive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	PLACE_QUESTIONS,
	confirmation,
	canHoldTheOnlyCopy,
	chosenTargets,
	fateOf,
	mustNotAnnounce,
	situationOf,
	warningFor,
	type PlaceKind,
} from '../src/places';

const KINDS: PlaceKind[] = ['cache', 'folder', 'synced', 'bucket', 'drive'];

test('every place is asked the same four questions', () => {
	assert.equal(PLACE_QUESTIONS.length, 4);
	assert.deepEqual(
		PLACE_QUESTIONS.map((q) => q.id),
		['q:place/kind', 'q:place/called', 'q:place/proved', 'q:place/seen'],
	);
});

test('the cache warning is one sentence, and calls it a cache', () => {
	const w = warningFor('cache');
	assert.equal(w, 'This is a cache. It can be destroyed without notice.');
	/* Short enough to be read. A paragraph about seven-day timers is a paragraph
	 * nobody finishes. */
	assert.ok(w.length < 60);
});

test('a cache can never hold the only copy, and no other kind is forbidden outright', () => {
	assert.equal(canHoldTheOnlyCopy('cache'), false);
	for (const k of KINDS.filter((k) => k !== 'cache')) {
		assert.equal(canHoldTheOnlyCopy(k), true, `${k} should be allowed to be a home`);
	}
});

test('no place is ever announced to a public network', () => {
	for (const k of KINDS) assert.equal(mustNotAnnounce(k), true, `${k} must stay private`);
});

test('confirmed means written and read back, not that the browser said it could', () => {
	const now = Date.now();
	const ok = confirmation('folder', { tried: true, wrote: true, readBack: true, matched: true, at: now }, 'Documents');
	assert.equal(ok.state, 'confirmed');
	assert.match(ok.says, /written to and read back/i);

	const untried = confirmation('folder', { tried: false }, 'Documents');
	assert.equal(untried.state, 'untried');
	assert.match(untried.fix, /read it back/i, 'say what Q is about to do, before it does it');
});

test('a place that gives back something different is damaged, which is worse than refusing', () => {
	const now = Date.now();
	const bad = confirmation('drive', { tried: true, wrote: true, readBack: true, matched: false, at: now }, 'flash drive 2026');
	assert.equal(bad.state, 'damaged');
	assert.match(bad.says, /changing what is stored in it/i);
	assert.match(bad.fix, /stop using it/i);
	/* And it must name the thing, because there may be several drives in the drawer. */
	assert.match(bad.says, /flash drive 2026/);
});

test('written but unreadable is refused, and says not to trust it yet', () => {
	const now = Date.now();
	const r = confirmation('bucket', { tried: true, wrote: true, readBack: false, matched: false, at: now }, 'the bucket');
	assert.equal(r.state, 'refused');
	assert.match(r.fix, /until that is understood/i);
});

test('a cache cannot be confirmed at all, whatever it reports', () => {
	const now = Date.now();
	const c = confirmation('cache', { tried: true, wrote: true, readBack: true, matched: true, at: now });
	assert.equal(c.state, 'cannot', 'a successful write to a cache is still a cache');
	assert.match(c.says, /destroyed without notice/i);
});

test('away means opposite things for a drive and a folder', () => {
	const drive = situationOf('drive', 'away', 'flash drive 2026');
	assert.equal(drive.expected, true);
	assert.match(drive.says, /where it should be/i);

	const folder = situationOf('folder', 'away', 'Documents');
	assert.equal(folder.expected, false);
	assert.match(folder.says, /moved, renamed or deleted/i);
});

test('three free accounts at three companies really are three fates', () => {
	const fates = new Set([
		fateOf('synced', 'Dropbox'),
		fateOf('synced', 'Google Drive'),
		fateOf('synced', 'OneDrive'),
	]);
	assert.equal(fates.size, 3);
	/* But two folders in one of them are not. */
	assert.equal(fateOf('synced', 'Dropbox'), fateOf('synced', 'dropbox'));
	/* And anything on this computer shares its fate with everything else on it. */
	assert.equal(fateOf('folder'), fateOf('cache'));
});

test('a push goes where the person chose, and never to a cache', () => {
	const all = [
		{ id: 'c', kind: 'cache' as const },
		{ id: 's1', kind: 'bucket' as const },
		{ id: 's2', kind: 'bucket' as const },
		{ id: 's3', kind: 'bucket' as const },
	];
	assert.deepEqual(chosenTargets(all, ['s1', 's3']), ['s1', 's3']);
	assert.deepEqual(chosenTargets(all, ['s1', 's2', 's3']), ['s1', 's2', 's3'], 'all three is a choice');
	assert.deepEqual(chosenTargets(all, ['c', 's2']), ['s2'], 'a cache is never a push target');
});

/*
 * A place, written down.
 *
 * Mirrors the card tests: the same thing said twice must come out with the
 * same id, and a new answering must not overwrite the evidence of an old one.
 */
import { buildAnswerSet, type AnswerSet } from '../src/questions';
import {
	PLACE_Q,
	PLACE_SET_ID,
	buildPlace,
	isKeyed,
	newestPlaces,
	placeFromAnswers,
	readPlace,
	type PlaceRecord,
} from '../src/places';
/* The real set from apps/q, not a copy — a copy would drift and the test
 * would keep passing while the app was wrong. q-sets.test.ts does the same. */
import { A_PLACE } from '../../../apps/q/src/lib/questions/a-place';

const ME = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

const answered = async (values: Record<string, unknown>): Promise<AnswerSet> => {
	const built = await buildAnswerSet({ did: ME, set: A_PLACE, values });
	assert.equal(built.ok, true);
	return (built as { ok: true; answers: AnswerSet }).answers;
};

test('the same place said twice gets the same name, however it was written', async () => {
	const a = await buildPlace({ did: ME, called: 'flash drive 2026', kind: 'drive' });
	const b = await placeFromAnswers(
		await answered({ [PLACE_Q.kind]: 'drive', [PLACE_Q.called]: '  flash drive 2026  ', [PLACE_Q.proved]: false }),
	);
	assert.equal(b?.id, a.id, 'trimmed, and built by either path, is one place');
	assert.match(a.id, /^place:[A-Za-z0-9_-]{43}$/, 'the same base64url address shape as a card');
});

test('a place names itself with a hash, not a key it would have to protect', async () => {
	const p = await buildPlace({ did: ME, called: 'the bucket', kind: 'bucket' });
	assert.equal(isKeyed(p), false);
	/* A place that really is a peer brings its own key, and says so. */
	assert.equal(isKeyed({ id: ME }), true);
});

test('the fate defaults from the kind, and the person can correct it', async () => {
	const dropbox = await buildPlace({ did: ME, called: 'Dropbox', kind: 'synced' });
	const drive = await buildPlace({ did: ME, called: 'Google Drive', kind: 'synced' });
	assert.notEqual(dropbox.fate, drive.fate, 'two companies are two fates');

	const corrected = await buildPlace({ did: ME, called: 'Dropbox/Backups', kind: 'synced', fate: 'service:dropbox' });
	assert.equal(corrected.fate, 'service:dropbox');
});

test('a blank name and an invented kind are refused before anything is written', async () => {
	/* buildAnswerSet is the gate, and it already holds. placeFromAnswers' own
	 * guards are for what comes off a disk, not for what this app builds. */
	const blank = await buildAnswerSet({ did: ME, set: A_PLACE, values: { [PLACE_Q.kind]: 'drive', [PLACE_Q.called]: '   ' } });
	assert.equal(blank.ok, false);

	const invented = await buildAnswerSet({ did: ME, set: A_PLACE, values: { [PLACE_Q.kind]: 'shed', [PLACE_Q.called]: 'the shed' } });
	assert.equal(invented.ok, false);
});

test('anything else in a folder reads as not-a-place, which is not a fault', async () => {
	assert.equal(await readPlace({ just: 'json' }), null);
	assert.equal(await readPlace(null), null);
	/* An answer set about something else entirely. */
	const other = await buildAnswerSet({ did: ME, set: A_PLACE, values: { [PLACE_Q.kind]: 'drive', [PLACE_Q.called]: 'ok' } });
	assert.equal(other.ok, true);
	const notPlace = { ...(other as { ok: true; answers: AnswerSet }).answers, answers: {} };
	assert.equal(await readPlace(notPlace), null, 'an answer set with no place answers in it');
});

test('answering again is a new fact, and the earlier one survives as evidence', async () => {
	const march: PlaceRecord = await buildPlace({
		did: ME, called: 'flash drive 2026', kind: 'drive', proved: true, seen: '2026-03-01', at: '2026-03-01T00:00:00.000Z',
	});
	const september: PlaceRecord = await buildPlace({
		did: ME, called: 'flash drive 2026', kind: 'drive', proved: false, seen: null, at: '2026-09-20T00:00:00.000Z',
	});
	const now = newestPlaces([march, september]);
	assert.equal(now.length, 1, 'one place');
	assert.equal(now[0].proved, false, 'the newest answering is what counts now');
	/* And nothing here deleted March. What is stored is both. */
	assert.equal(march.proved, true);
});

test('places come back in a stable order, so a list does not shuffle', async () => {
	const list = newestPlaces([
		await buildPlace({ did: ME, called: 'the bucket', kind: 'bucket' }),
		await buildPlace({ did: ME, called: 'Documents', kind: 'folder' }),
		await buildPlace({ did: ME, called: 'flash drive 2026', kind: 'drive' }),
	]);
	assert.deepEqual(list.map((p) => p.called), ['Documents', 'flash drive 2026', 'the bucket']);
	assert.equal(PLACE_SET_ID, 'q/a-place');
});

/*
 * The round trip, as the folder reports it.
 *
 * proveFolder() itself needs a real File System Access handle and is exercised
 * in the browser. What is tested here is the part that decides what a person
 * is told — that each way it can go wrong maps to a different sentence, and
 * that the one nobody expects is called out.
 */
test('every way a round trip can go wrong reaches a different sentence', () => {
	const at = Date.now();
	const outcomes = [
		{ proof: { tried: false } as const, want: 'untried' },
		{ proof: { tried: true, wrote: false, readBack: false, matched: false, at }, want: 'refused' },
		{ proof: { tried: true, wrote: true, readBack: false, matched: false, at }, want: 'refused' },
		{ proof: { tried: true, wrote: true, readBack: true, matched: false, at }, want: 'damaged' },
		{ proof: { tried: true, wrote: true, readBack: true, matched: true, at }, want: 'confirmed' },
	];
	const said = new Set<string>();
	for (const { proof, want } of outcomes) {
		const told = confirmation('folder', proof, 'Documents');
		assert.equal(told.state, want);
		said.add(told.says);
	}
	assert.equal(said.size, outcomes.length, 'two different outcomes must never read the same');
});

test('a place nobody has proved does not claim to be confirmed', () => {
	/* A bucket and a drive have no round trip to run from a browser tab, so
	 * they stay untried — which is the honest state, not a pessimistic one. */
	for (const kind of ['bucket', 'drive'] as const) {
		assert.equal(confirmation(kind, { tried: false }, 'somewhere').state, 'untried');
	}
});

/*
 * Adding a place.
 *
 * The rule worth a test is that a place which REFUSES is still recorded. A
 * list that only shows what works hides exactly the entries worth knowing
 * about, and a person would find out on the day they needed the copy.
 */
test('a place that refuses is still a place, and says so rather than vanishing', () => {
	const at = Date.now();
	const refused = confirmation('folder', { tried: true, wrote: false, readBack: false, matched: false, at }, 'Documents');
	assert.equal(refused.state, 'refused');
	assert.ok(refused.says.includes('Documents'), 'name it, or a list of several says nothing');
	assert.ok(refused.fix.trim(), 'a refusal with nothing to do about it is just bad news');
});

test('a cache offered as a place is accepted, and immediately told what it is', () => {
	/* Offering it is honest only because it is refused as a home in the same
	 * breath — otherwise it is a trap with a friendly label. */
	const told = confirmation('cache', { tried: false }, 'Kept in this browser');
	assert.equal(told.state, 'cannot');
	assert.equal(canHoldTheOnlyCopy('cache'), false);
	assert.match(told.fix, /choose a folder/i);
});
