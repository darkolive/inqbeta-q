/*
 * Publishing a page.
 *
 * The rule the whole file turns on: a published page merges the DESIGN and
 * never the ANSWERS. One file, no lookups to draw it — and still true next
 * month, because it names questions rather than carrying what they were
 * answered with.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTION_SET_SCHEMA } from '../src/questions';
import { PAGE_SCHEMA, publish, readsOf, stillMatches, type Page } from '../src/pages';
import type { Block, Plugin } from '../src/blocks';

const b = (over: Partial<Block> = {}): Block => ({ kind: 'space', id: 's1', ...over });

const page = (): Block[] => [
	{ kind: 'heading', id: 'h', says: 'My week', width: 'full' },
	{ kind: 'answers', id: 'a', shows: ['q:person/called', 'q:person/site'], width: 'half' },
	{ kind: 'places', id: 'p', width: 'half' },
];

test('a published page is one self-contained thing with one address', async () => {
	const out = await publish('Dashboard', page());
	assert.equal(out.ok, true);
	if (!out.ok) return;
	assert.equal(out.page.schema, PAGE_SCHEMA);
	assert.equal(out.page.blocks.length, 3);
	assert.match(out.address, /^content:\/\/sha256\/[0-9a-f]{64}$/);
	/* Nothing left to resolve: every block has its width and its settings. */
	for (const f of out.page.blocks) assert.ok(f.width, `${f.id} has no width`);
});

test('THE RULE: it merges the design and never the answers', async () => {
	const out = await publish('Dashboard', page());
	assert.equal(out.ok, true);
	if (!out.ok) return;

	const answers = out.page.blocks.find((f) => f.id === 'a')!;
	/* It names the questions… */
	assert.deepEqual(answers.reads, ['q:person/called', 'q:person/site']);
	/* …and carries nothing anybody answered. A page with values baked in is
	 * stale by the end of the week and hands over what a card would withhold. */
	const asText = JSON.stringify(out.page);
	assert.doesNotMatch(asText, /Darren|darkolive/i);
});

test('everything the page will ever read is gathered, so it can be shown before publishing', async () => {
	const out = await publish('Dashboard', [
		...page(),
		{ kind: 'answers', id: 'a2', shows: ['q:person/site', 'q:person/born'] },
	]);
	assert.equal(out.ok, true);
	if (!out.ok) return;
	assert.deepEqual(out.reads, ['q:person/born', 'q:person/called', 'q:person/site'], 'sorted, once each');
});

test('only an answers block reads anything of a person’s', () => {
	assert.deepEqual(readsOf(b({ kind: 'answers', shows: ['q:a/b'] })), ['q:a/b']);
	for (const kind of ['heading', 'places', 'receipts', 'contacts', 'space'] as const) {
		assert.deepEqual(readsOf(b({ kind })), []);
	}
});

test('the same design compiles to the same address, however many times it is built', async () => {
	const a = await publish('Dashboard', page());
	await new Promise((r) => setTimeout(r, 5));
	const c = await publish('Dashboard', page());
	assert.equal(a.ok && c.ok && a.address === c.address, true, 'no timestamp may leak into the body');
});

test('a different design is a different address', async () => {
	const a = await publish('Dashboard', page());
	const c = await publish('Dashboard', [...page(), b({ id: 'extra' })]);
	const d = await publish('Другое', page());
	assert.notEqual((a as { address: string }).address, (c as { address: string }).address);
	assert.notEqual((a as { address: string }).address, (d as { address: string }).address, 'the name is part of it');
});

test('a plugin’s settings are inlined, and its author is recorded rather than laundered', async () => {
	const plugin: Plugin = {
		id: 'dostudy:evidence',
		called: 'Evidence',
		does: 'What you submitted.',
		draws: 'receipts',
		by: 'did:key:zFederation',
		settings: { schema: QUESTION_SET_SCHEMA, id: 'q/block-evidence', title: {}, questions: [] },
	};
	const out = await publish('Course', [
		{ kind: 'receipts', id: 'e', settings: { 'q:block/plugin': 'dostudy:evidence', 'q:evidence/course': 'ENG101' } },
	], [plugin]);
	assert.equal(out.ok, true);
	if (!out.ok) return;

	const block = out.page.blocks[0];
	assert.equal(block.settings['q:evidence/course'], 'ENG101', 'inlined, so a withdrawn plugin still draws');
	assert.deepEqual(block.from, { plugin: 'dostudy:evidence', by: 'did:key:zFederation' });
	assert.deepEqual(out.authors, [{ plugin: 'dostudy:evidence', by: 'did:key:zFederation' }]);
});

test('a page nobody can draw is refused before it is published, not after', async () => {
	const out = await publish('Broken', [{ kind: 'nope', id: 'x' } as unknown as Block]);
	assert.equal(out.ok, false);
	if (out.ok) return;
	assert.equal(out.wrong.length, 1);
	assert.match(out.wrong[0].says, /no such block/i);
});

test('compiling is never a way past what a block was refused for', async () => {
	/* Behaviour hidden in settings rather than on the block itself. The input
	 * check does not look inside settings; the output check does. */
	const out = await publish('Sneaky', [
		{ kind: 'text', id: 't', says: 'hi', settings: { 'q:block/fetch': 'https://elsewhere' } },
	]);
	assert.equal(out.ok, false);
	if (out.ok) return;
	assert.match(out.says, /got as far as the finished page. It has not been published/i);
	assert.deepEqual(out.wrong[0].refused, ['q:block/fetch']);
});

test('a page needs a name', async () => {
	assert.match(((await publish('  ', page())) as { says: string }).says, /needs a name/i);
});

test('what was shared and what is being edited are told apart', async () => {
	const out = await publish('Dashboard', page());
	assert.equal(out.ok, true);
	if (!out.ok) return;

	assert.equal((await stillMatches(out.address, out.page)).same, true);

	const edited: Page = { ...out.page, called: 'Dashboard v2' };
	const drift = await stillMatches(out.address, edited);
	assert.equal(drift.same, false);
	assert.match(drift.says, /anyone with the link still sees the old one/i, 'say the consequence, not "out of date"');
});

/*
 * Nesting, once published.
 *
 * The rule: a block three groups deep is as much part of this page as one at
 * the top. Anything that read only the top would be a hiding place — for a
 * question nobody was shown, or for something that runs.
 */
test('what a page reads is gathered from the whole tree, not only its top', async () => {
	const out = await publish('Nested', [
		{ kind: 'heading', id: 'h', says: 'Top' },
		{
			kind: 'section',
			id: 'g',
			children: [
				{ kind: 'answers', id: 'a', shows: ['q:person/called'] },
				{ kind: 'section', id: 'g2', children: [{ kind: 'answers', id: 'a2', shows: ['q:person/born'] }] },
			],
		},
	]);
	assert.equal(out.ok, true);
	if (!out.ok) return;
	assert.deepEqual(out.reads, ['q:person/born', 'q:person/called'], 'the buried one counts too');
});

test('behaviour buried in a group is caught, not just behaviour at the top', async () => {
	const out = await publish('Sneaky', [
		{ kind: 'section', id: 'g', children: [{ kind: 'text', id: 't', says: 'hi', settings: { 'q:block/fetch': 'https://elsewhere' } }] },
	]);
	assert.equal(out.ok, false);
	if (out.ok) return;
	assert.match(out.says, /got as far as the finished page/i);
});

test('a plugin used inside a group still has its author recorded', async () => {
	const plugin = {
		id: 'x:y', called: 'X', does: 'Y', draws: 'receipts' as const, by: 'did:key:zAuthor',
		settings: { schema: QUESTION_SET_SCHEMA, id: 'q/x', title: {}, questions: [] },
	};
	const out = await publish('Nested', [
		{ kind: 'section', id: 'g', children: [{ kind: 'receipts', id: 'r', settings: { 'q:block/plugin': 'x:y' } }] },
	], [plugin]);
	assert.equal(out.ok, true);
	if (!out.ok) return;
	assert.deepEqual(out.authors, [{ plugin: 'x:y', by: 'did:key:zAuthor' }]);
	assert.equal(out.page.blocks[0].children![0].from?.by, 'did:key:zAuthor');
});

test('the tree survives publishing intact, and its shape is part of the address', async () => {
	const nested = await publish('P', [{ kind: 'section', id: 'g', children: [{ kind: 'space', id: 's' }] }]);
	const flat = await publish('P', [{ kind: 'section', id: 'g' }, { kind: 'space', id: 's' }]);
	assert.equal(nested.ok && flat.ok, true);
	if (!nested.ok || !flat.ok) return;
	assert.equal(nested.page.blocks[0].children?.length, 1);
	assert.notEqual(nested.address, flat.address, 'the same blocks arranged differently are a different page');
});

/*
 * THE SHAPE THE BUILDER ACTUALLY PRODUCES.
 *
 * Every other test in this file builds a block the way code does — `says` and
 * `shows` as fields. /my-pages does not: its settings panel is generated from
 * a question set, so answers land under their question ids, in `settings`.
 *
 * checkBlock read only the first spelling. So every heading, paragraph, table
 * and answers block made in the builder failed to publish, with a message
 * about nothing being written in a block that plainly had words in it — and
 * 302 tests passed throughout, because not one of them used the shape the
 * builder builds.
 *
 * These do. A test suite that only exercises what the code produces tests the
 * code against itself.
 */
const fromBuilder = (kind: string, id: string, settings: Record<string, unknown> = {}): Block =>
	({ kind, id, width: 'full', settings }) as unknown as Block;

test('a page built the way the builder builds it publishes', async () => {
	const out = await publish('My week', [
		fromBuilder('heading', 'b1', { 'q:block/says': 'My week', 'q:block/size': 'large' }),
		fromBuilder('text', 'b2', { 'q:block/says': 'What is going on.' }),
		fromBuilder('answers', 'b3', { 'q:block/shows': ['q:person/called'] }),
		fromBuilder('places', 'b4'),
	]);
	assert.equal(out.ok, true, out.ok ? '' : JSON.stringify((out as { wrong: unknown }).wrong));
	if (!out.ok) return;
	assert.deepEqual(out.reads, ['q:person/called'], 'and what it reads is found in settings too');
});

test('both spellings mean the same thing, and produce the same page', async () => {
	const viaField = await publish('P', [{ kind: 'heading', id: 'h', says: 'Hello', width: 'full' }]);
	const viaSettings = await publish('P', [fromBuilder('heading', 'h', { 'q:block/says': 'Hello' })]);
	assert.equal(viaField.ok && viaSettings.ok, true);
	if (!viaField.ok || !viaSettings.ok) return;
	assert.equal(viaField.address, viaSettings.address, 'one value, one page, however it was written');
});

test('an empty block is still caught when it comes from the builder', async () => {
	for (const [kind, why] of [
		['heading', /nothing written/i],
		['text', /nothing written/i],
		['answers', /which questions/i],
		['table', /which columns/i],
		['hero', /big line/i],
		['card', /which card/i],
	] as const) {
		const out = await publish('P', [fromBuilder(kind, 'x')]);
		assert.equal(out.ok, false, `${kind} with nothing set should be refused`);
		if (out.ok) continue;
		assert.match(out.wrong[0].says, why, kind);
	}
});

test('a table names its columns the way an answers block names its questions', async () => {
	const out = await publish('P', [fromBuilder('table', 't', { 'q:block/shows': ['q:person/called', 'q:person/site'] })]);
	assert.equal(out.ok, true);
	if (!out.ok) return;
	assert.deepEqual(out.reads, ['q:person/called', 'q:person/site'], 'a table reads too, and it must be declared');
});
