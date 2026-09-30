/*
 * What a page may be made of.
 *
 * Two rules carry this. The vocabulary is CLOSED, so a page cannot name a
 * block nothing draws — which fails silently on somebody else's screen,
 * showing less than the author meant and saying nothing about it. And a
 * template carries NO BEHAVIOUR, because it lands in a stranger's folder and
 * renders against their own things.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, checkBlock, checkTemplate, looksLikeContent, move, type Block } from '../src/blocks';

const HASH = 'a'.repeat(64);
const ok = (over: Partial<Block> = {}): Record<string, unknown> => ({
	kind: 'heading',
	id: 'b1',
	says: 'Hello',
	...over,
});

test('every block in the vocabulary says what it is and what it holds', () => {
	for (const b of BLOCKS) {
		assert.ok(b.called.length > 2, `${b.kind} needs a name a person would use`);
		assert.ok(b.holds.length > 5, `${b.kind} needs to say what goes in it`);
	}
	/* And 'custom' is gone. It was an escape hatch, and the thing that wants
	 * to go in it is a script. */
	assert.equal(BLOCKS.some((b) => (b.kind as string) === 'custom'), false);
});

test('behaviour is refused by name, one at a time', () => {
	for (const field of [
		'onclick', 'onload', 'script', 'src', 'href', 'action', 'trigger',
		'triggers', 'run', 'eval', 'fetch', 'url', 'webhook', 'innerHTML',
	]) {
		const c = checkBlock(ok({ [field]: 'anything' } as Partial<Block>));
		assert.equal(c.ok, false, `${field} must not be allowed in a template`);
		assert.deepEqual(c.refused, [field]);
		assert.match(c.says, /runs against their own things|cannot say what to do/i);
	}
});

test('style and class are refused too, because a template is not a stylesheet', () => {
	/* They look harmless and they are how arbitrary rendering gets in. */
	for (const field of ['style', 'class', 'html']) {
		assert.equal(checkBlock(ok({ [field]: 'x' } as Partial<Block>)).ok, false);
	}
});

test('a block nothing draws is refused, and the message names it', () => {
	const c = checkBlock({ kind: 'course-grid', id: 'b1' });
	assert.equal(c.ok, false);
	assert.match(c.says, /no such block as .course-grid./);
	assert.match(c.says, /show less than it meant to/i, 'say why a silent failure is the worst kind');
});

test('every block needs its own name, so a move is a move', () => {
	assert.match(checkBlock({ kind: 'heading', says: 'Hi' }).says, /name of its own/i);
	const clash = checkTemplate([ok({ id: 'same' }), ok({ id: 'same' })]);
	assert.equal(clash.ok, false);
	assert.ok(clash.wrong.some((w) => /share a name/i.test(w.says)));
});

test('a picture is one you hold, never a link to somewhere else', () => {
	assert.equal(checkBlock({ kind: 'image', id: 'i', at: `content://sha256/${HASH}` }).ok, true);
	const remote = checkBlock({ kind: 'image', id: 'i', at: 'https://example.org/logo.png' });
	assert.equal(remote.ok, false);
	assert.match(remote.says, /every time this page is opened/i, 'name the beacon, not just the rule');

	assert.equal(looksLikeContent(`content://sha256/${HASH}`), true);
	assert.equal(looksLikeContent('content://sha256/short'), false);
	assert.equal(looksLikeContent('https://example.org/x.png'), false);
});

test('an answers block names questions and never carries an answer', () => {
	assert.equal(checkBlock({ kind: 'answers', id: 'a', shows: ['q:person/called'] }).ok, true);
	assert.match(checkBlock({ kind: 'answers', id: 'a' }).says, /which questions/i);
	assert.match(checkBlock({ kind: 'answers', id: 'a', shows: [] }).says, /which questions/i);
});

test('an empty heading is caught, because a blank line is not a design', () => {
	assert.match(checkBlock({ kind: 'heading', id: 'h', says: '   ' }).says, /nothing written/i);
});

test('a whole page reports every problem, not the first', () => {
	const page = checkTemplate([
		ok(),
		{ kind: 'heading', id: 'b2', says: 'Hi', onclick: 'x' },
		{ kind: 'nope', id: 'b3' },
	]);
	assert.equal(page.ok, false);
	assert.equal(page.wrong.length, 2, 'an author fixing one at a time stops before the end');
	assert.deepEqual(page.wrong.map((w) => w.at), [2, 3]);
	assert.match(page.says, /2 blocks need attention/);
});

test('a clean page says it can be handed to anyone', () => {
	const page = checkTemplate([ok(), { kind: 'places', id: 'p' }, { kind: 'space', id: 's' }]);
	assert.equal(page.ok, true);
	assert.match(page.says, /handed to anyone/i);
});

test('an empty page is refused rather than published as a blank', () => {
	assert.match(checkTemplate([]).says, /nothing on this page/i);
});

test('moving a block is a rule here, not in whatever library does the dragging', () => {
	const b = (id: string): Block => ({ kind: 'space', id });
	const list = [b('a'), b('b'), b('c')];
	assert.deepEqual(move(list, 'c', 0).map((x) => x.id), ['c', 'a', 'b']);
	assert.deepEqual(move(list, 'a', 2).map((x) => x.id), ['b', 'c', 'a']);
	/* Out of range clamps rather than throwing or dropping a block. */
	assert.deepEqual(move(list, 'a', 99).map((x) => x.id), ['b', 'c', 'a']);
	assert.deepEqual(move(list, 'a', -5).map((x) => x.id), ['a', 'b', 'c']);
	/* Nothing is ever lost. */
	assert.equal(move(list, 'b', 2).length, 3);
	assert.deepEqual(move(list, 'nope', 0), list);
});

/*
 * Settings, widths and plugins.
 *
 * The claim being tested: a closed vocabulary costs no freedom worth having.
 * Arrangement — what, in what order, how wide, with what settings, as often as
 * you like — is unlimited. Execution is zero, for everyone, always.
 */
import { QUESTION_SET_SCHEMA, checkSet } from '../src/questions';
import { BLOCKS as KINDS_LIST, SETTINGS, WIDTHS, checkPlugin } from '../src/blocks';

test('every block kind declares its own settings, so none is uncustomisable', () => {
	for (const { kind } of KINDS_LIST) {
		const set = SETTINGS[kind];
		assert.ok(set, `${kind} has no settings`);
		const wrong = checkSet(set);
		assert.equal(wrong.ok, true, `${kind}: ${!wrong.ok ? wrong.says.join(' ') : ''}`);
	}
});

test('every block can be resized and given a heading, whatever kind it is', () => {
	for (const { kind } of KINDS_LIST) {
		const asked = SETTINGS[kind].questions.map((q) => q.id);
		assert.ok(asked.includes('q:block/width'), `${kind} cannot be resized`);
		assert.ok(asked.includes('q:block/heading'), `${kind} cannot be titled`);
	}
});

test('width is a closed list, because a free width is a layout engine', () => {
	assert.deepEqual(WIDTHS.map((w) => w.width), ['full', 'half', 'third', 'quarter']);
	assert.equal(checkBlock(ok({ width: 'half' } as Partial<Block>)).ok, true);
	const made_up = checkBlock(ok({ width: '37%' } as Partial<Block>));
	assert.equal(made_up.ok, false);
	assert.match(made_up.says, /no width called .37%./);
});

test('the same kind can appear as often as somebody likes', () => {
	const many = Array.from({ length: 12 }, (_, i) => ({ kind: 'answers', id: `a${i}`, shows: ['q:person/called'] }));
	assert.equal(checkTemplate(many).ok, true, 'repetition is arrangement, and arrangement is free');
});

test('a plugin is data describing what to show, and is drawn by one of the ten', () => {
	const p = {
		id: 'dostudy:evidence',
		called: 'Evidence for this course',
		does: 'Shows what you have submitted.',
		draws: 'receipts',
		by: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
		settings: {
			schema: QUESTION_SET_SCHEMA,
			id: 'q/block-evidence',
			title: { 'en-GB': 'Evidence' },
			questions: [{ id: 'q:evidence/course', answer: 'text' as const, asks: { 'en-GB': 'Which course?' } }],
		},
	};
	assert.equal(checkPlugin(p).ok, true);
	assert.match(checkPlugin(p).says, /offered to anyone/i);
});

test('a plugin cannot introduce an eleventh way of drawing', () => {
	const c = checkPlugin({ id: 'x:y', called: 'X', does: 'Y', by: 'did:key:z1', draws: 'canvas', settings: {} });
	assert.equal(c.ok, false);
	assert.match(c.says, /nothing that draws that/i);
});

test('a plugin that carries behaviour is refused exactly like a block that does', () => {
	for (const field of ['script', 'fetch', 'url', 'onclick', 'run']) {
		const c = checkPlugin({ id: 'x:y', called: 'X', does: 'Y', by: 'did:key:z1', draws: 'text', [field]: 'x' });
		assert.equal(c.ok, false, field);
		assert.deepEqual(c.refused, [field]);
		assert.match(c.says, /run on somebody else/i);
	}
});

test('and behaviour hidden inside one of its settings is caught too', () => {
	const c = checkPlugin({
		id: 'x:y',
		called: 'X',
		does: 'Y',
		by: 'did:key:z1',
		draws: 'text',
		settings: {
			schema: QUESTION_SET_SCHEMA,
			id: 'q/x',
			title: { 'en-GB': 'X' },
			/* The obvious place to try it. */
			questions: [{ id: 'q:x/a', answer: 'text', asks: { 'en-GB': 'A?' }, src: 'https://elsewhere' }],
		},
	});
	assert.equal(c.ok, false);
	assert.deepEqual(c.refused, ['src']);
	assert.match(c.says, /one of its settings/i);
});

test('a plugin has to say who made it, so a person can decline that author', () => {
	for (const missing of ['id', 'called', 'does', 'by']) {
		const p: Record<string, unknown> = {
			id: 'x:y', called: 'X', does: 'Y', by: 'did:key:z1', draws: 'text',
			settings: { schema: QUESTION_SET_SCHEMA, id: 'q/x', title: {}, questions: [] },
		};
		delete p[missing];
		assert.equal(checkPlugin(p).ok, false, missing);
	}
});

/*
 * Furniture and content.
 *
 * Darren asked for a header with sign-in and search, a side menu and a drawer.
 * Those DO things, which looks like it breaks "a template carries no
 * behaviour" and does not — because a template NAMES Q's chrome and never
 * implements it. The behaviour lives in Q, in one place; a page chooses where
 * it sits. So the test that matters is that furniture cannot be AIMED.
 */
import { isFurniture } from '../src/blocks';

test('exactly three kinds are Q’s own chrome, and every kind declares which it is', () => {
	const furniture = KINDS_LIST.filter((b) => isFurniture(b.kind)).map((b) => b.kind);
	assert.deepEqual(furniture, ['header', 'menu', 'drawer']);
	for (const { kind } of KINDS_LIST) assert.equal(typeof isFurniture(kind), 'boolean');
});

test('furniture is told which PARTS to show, never what to point at', () => {
	for (const kind of ['header', 'menu', 'drawer'] as const) {
		for (const q of SETTINGS[kind].questions) {
			if (q.id.startsWith('q:style/') || q.id === 'q:block/width' || q.id === 'q:block/heading') continue;
			/* No setting may take a destination. A header that could be told
			 * where sign-in goes is Q's chrome aimed at somebody else's target. */
			assert.notEqual(q.answer, 'link', `${kind}.${q.id} takes a link`);
			assert.notEqual(q.answer, 'did', `${kind}.${q.id} takes a did`);
			assert.doesNotMatch(q.id, /url|href|to|target|endpoint/i, `${kind}.${q.id} names a destination`);
		}
	}
});

test('Darren’s seven starting points all exist and are offered', () => {
	const offered = KINDS_LIST.map((b) => b.kind);
	for (const kind of ['table', 'header', 'menu', 'drawer', 'card', 'hero', 'blog']) {
		assert.ok(offered.includes(kind as never), `${kind} is not offered`);
		assert.ok(SETTINGS[kind as keyof typeof SETTINGS], `${kind} has no settings`);
	}
});

test('a hero without its line, and a drawer without its name, are refused', () => {
	assert.match(checkBlock({ kind: 'hero', id: 'h' }).says, /needs its big line/i);
	assert.equal(checkBlock({ kind: 'hero', id: 'h', says: 'Welcome' }).ok, true);
	/* Set through settings rather than directly — both count. */
	assert.equal(checkBlock({ kind: 'hero', id: 'h', settings: { 'q:block/says': 'Welcome' } }).ok, true);

	assert.match(checkBlock({ kind: 'drawer', id: 'd' }).says, /nobody knows what is in it/i);
});

test('the new kinds still cannot carry behaviour, furniture least of all', () => {
	for (const kind of ['table', 'hero', 'blog', 'header', 'menu', 'drawer'] as const) {
		const c = checkBlock({ kind, id: 'x', says: 'x', onclick: 'steal()' });
		assert.equal(c.ok, false, kind);
		assert.deepEqual(c.refused, ['onclick']);
	}
});

/*
 * Nesting.
 *
 * A group is the only kind that holds others, and one container kind is
 * enough: blocks inside it flow by their widths, so a row of three cards is a
 * group with three thirds in it. What these tests defend is the two ways a
 * tree goes wrong — a loop, and a depth nobody meant.
 */
import { DEEPEST, holdsOthers, reparent } from '../src/blocks';

const group = (id: string, children: Block[] = []): Block => ({ kind: 'section', id, children });
const leaf = (id: string): Block => ({ kind: 'space', id });

test('exactly one kind holds others, and everything says which it is', () => {
	assert.deepEqual(KINDS_LIST.filter((b) => holdsOthers(b.kind)).map((b) => b.kind), ['section']);
});

test('only a group may have children, and the message says where they go', () => {
	assert.equal(checkBlock({ kind: 'section', id: 'g', children: [] }).ok, true);
	const wrong = checkBlock({ kind: 'heading', id: 'h', says: 'Hi', children: [leaf('a')] });
	assert.equal(wrong.ok, false);
	assert.match(wrong.says, /cannot hold other blocks. Put them in a group/i);
	assert.match(checkBlock({ kind: 'section', id: 'g', children: 'nope' }).says, /not a list of blocks/i);
});

test('a block buried deep is checked as hard as one at the top', () => {
	const deep = group('g1', [group('g2', [{ kind: 'heading', id: 'h', says: '   ' }])]);
	const out = checkTemplate([deep] as unknown as Record<string, unknown>[]);
	assert.equal(out.ok, false);
	assert.ok(out.wrong.some((w) => /nothing written/i.test(w.says)), 'a hiding place is not allowed');
});

test('names are unique across the whole page, not within a group', () => {
	const clash = checkTemplate([group('g', [leaf('same')]), leaf('same')] as unknown as Record<string, unknown>[]);
	assert.equal(clash.ok, false);
	assert.ok(clash.wrong.some((w) => /share a name/i.test(w.says)));
});

test('nesting is capped, because an arriving template should not hang a tab', () => {
	let deep: Block = leaf('bottom');
	for (let i = 0; i < DEEPEST + 2; i++) deep = group(`g${i}`, [deep]);
	const out = checkTemplate([deep] as unknown as Record<string, unknown>[]);
	assert.equal(out.ok, false);
	assert.ok(out.wrong.some((w) => new RegExp(`more than ${DEEPEST} groups deep`).test(w.says)));
	assert.ok(out.wrong.some((w) => /another page/i.test(w.says)), 'say what to do instead');
});

test('a block is reordered among its own siblings, wherever it lives', () => {
	const page = [group('g', [leaf('a'), leaf('b'), leaf('c')])];
	const moved = move(page, 'c', 0);
	assert.deepEqual(moved[0].children!.map((b) => b.id), ['c', 'a', 'b']);
	/* And the group itself is untouched at the top level. */
	assert.equal(moved.length, 1);
	assert.equal(move(page, 'nowhere', 0), page);
});

test('dragging into a group moves it, and out of one puts it back on the page', () => {
	const page = [group('g', [leaf('a')]), leaf('b')];
	const into = reparent(page, 'b', 'g', 0);
	assert.deepEqual(into[0].children!.map((x) => x.id), ['b', 'a']);
	assert.equal(into.length, 1, 'and it is no longer at the top');

	const out = reparent(into, 'b', null, 0);
	assert.deepEqual(out.map((x) => x.id), ['b', 'g']);
});

test('a group cannot be put inside itself, or inside its own child', () => {
	const page = [group('outer', [group('inner', [])])];
	assert.equal(reparent(page, 'outer', 'outer'), page, 'into itself');
	assert.equal(reparent(page, 'outer', 'inner'), page, 'into its own child — that is a loop');
	/* And nothing that cannot hold others may be dropped into. */
	const flat = [leaf('a'), leaf('b')];
	assert.equal(reparent(flat, 'a', 'b'), flat);
});
