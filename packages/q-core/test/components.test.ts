/*
 * Components — ADR-Q-006.
 *
 * A block names a component pinned to one version and carries answers; the
 * code lives in the library; the manifest says what that code may touch and
 * promise, in words a person and a model can both read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	CORE_COMPONENTS,
	SIGN_IN,
	TOUCHES,
	checkComponentManifest,
	checkComponentSettings,
	describeComponent,
	findComponent,
	pinOf,
	type ComponentManifest
} from '../src/components';
import { checkBlock, checkTemplate, settingsFor, SETTINGS } from '../src/blocks';
import { staticCheck } from '../src/static-page';
import { PAGE_SCHEMA } from '../src/pages';

const clone = (m: ComponentManifest): ComponentManifest => JSON.parse(JSON.stringify(m));

test('every core component has a manifest that passes its own check', () => {
	for (const m of CORE_COMPONENTS) {
		const r = checkComponentManifest(m);
		assert.equal(r.ok, true, `${m.id}: ${r.wrong.join(' | ')}`);
	}
});

test('every touch says what it means, in a sentence', () => {
	for (const t of TOUCHES) assert.ok(t.means.length > 20 && t.means.endsWith('.'), t.id);
});

test('only core components may touch identity, the vault or keys', () => {
	const m = clone(SIGN_IN);
	m.tier = 'approved';
	m.by = 'did:key:z6MkSomebodyElse';
	const r = checkComponentManifest(m);
	assert.equal(r.ok, false);
	assert.ok(r.wrong.some((w) => w.includes('identity.passkey')));
	assert.ok(r.wrong.some((w) => w.includes('vault.open')));
});

test('anything touching identity runs in Q, never on a site page', () => {
	const m = clone(SIGN_IN);
	m.runsOn = ['q', 'site'];
	assert.ok(checkComponentManifest(m).wrong.some((w) => w.includes('never on a site page')));
});

test('a manifest cannot carry code, and says everything wrong at once', () => {
	const m = { ...clone(SIGN_IN), script: 'alert(1)', version: 'one', design: [] } as unknown;
	const r = checkComponentManifest(m);
	assert.equal(r.ok, false);
	assert.ok(r.wrong.length >= 3, r.wrong.join(' | '));
	assert.ok(r.wrong.some((w) => w.includes('script')));
});

test('access commitments are required, and targets are generous', () => {
	const m = clone(SIGN_IN);
	m.access = { ...m.access, labelledIcons: false, minTarget: 24 };
	const r = checkComponentManifest(m);
	assert.ok(r.wrong.some((w) => w.includes('word with it')));
	assert.ok(r.wrong.some((w) => w.includes('44px')));
});

test('settings are namespaced to the component', () => {
	const m = clone(SIGN_IN);
	m.settings.questions[0].id = 'q:block/title';
	assert.ok(checkComponentManifest(m).wrong.some((w) => w.includes('should start with “q:sign-in/”')));
});

test('a pin is one exact version', () => {
	assert.deepEqual(pinOf('q:sign-in@1.0.0'), { id: 'q:sign-in', version: '1.0.0' });
	assert.equal(pinOf('q:sign-in'), null);
	assert.equal(pinOf('q:sign-in@latest'), null);
	assert.equal(findComponent('q:sign-in@1.0.0'), SIGN_IN);
	assert.equal(findComponent('q:sign-in@2.0.0'), null, 'an update never changes a page quietly');
});

test('a component block is data: a pin and answers', () => {
	assert.equal(checkBlock({ kind: 'component', id: 'c1', component: 'q:sign-in@1.0.0' }).ok, true);
	assert.equal(
		checkBlock({ kind: 'component', id: 'c1', settings: { 'q:block/component': 'q:sign-in@1.0.0', 'q:sign-in/title': 'Welcome' } }).ok,
		true
	);
	assert.match(checkBlock({ kind: 'component', id: 'c1' }).says, /Which component/);
	assert.match(checkBlock({ kind: 'component', id: 'c1', component: 'q:sign-in@9.9.9' }).says, /exact version/);
	assert.match(
		checkBlock({ kind: 'component', id: 'c1', component: 'q:sign-in@1.0.0', settings: { 'q:sign-in/aim': 'x' } }).says,
		/no setting/
	);
	/* The no-behaviour rule still stands for the block itself. */
	assert.equal(checkBlock({ kind: 'component', id: 'c1', component: 'q:sign-in@1.0.0', onclick: 'x' }).ok, false);
});

test('a draft component can be previewed, never put on a page', () => {
	const draft: ComponentManifest = { ...clone(SIGN_IN), id: 'club:booking', tier: 'draft', by: 'did:key:z6MkClub', touches: [], code: undefined,
		settings: { ...SIGN_IN.settings, questions: [] } };
	assert.equal(checkComponentManifest(draft).ok, true, checkComponentManifest(draft).wrong.join(' | '));
	const r = checkTemplate([{ kind: 'component', id: 'c1', component: 'club:booking@1.0.0' }], [...CORE_COMPONENTS, draft]);
	assert.equal(r.ok, false);
	assert.match(r.wrong[0].says, /still a draft/);
});

test('answers are checked against the component’s questions', () => {
	const required = clone(SIGN_IN);
	required.settings.questions[0].optional = false;
	assert.match(checkComponentSettings(required, {})[0], /needs an answer/);
	assert.match(checkComponentSettings(SIGN_IN, { 'q:sign-in/title': { on: 'x' } })[0], /words, a number/);
});

test('the settings panel shows the component’s own questions', () => {
	const set = settingsFor({ kind: 'component', settings: { 'q:block/component': 'q:sign-in@1.0.0' } });
	assert.ok(set.questions.some((q) => q.id === 'q:sign-in/title'));
	assert.equal(set.questions[0].id, 'q:block/component');
	assert.equal(settingsFor({ kind: 'heading', settings: {} }), SETTINGS.heading);
});

test('a public page cannot carry Q’s own components', () => {
	const r = staticCheck({
		schema: PAGE_SCHEMA,
		called: 'Home',
		blocks: [{ kind: 'component', id: 'c1', width: 'full', settings: { 'q:block/component': 'q:sign-in@1.0.0' }, reads: [] }]
	});
	assert.equal(r.ok, false);
	if (!r.ok) assert.match(r.wrong[0].says, /part of Q itself/);
});

test('the brief a model reads carries every constraint', () => {
	const brief = describeComponent(SIGN_IN);
	for (const must of ['q:sign-in@1.0.0', 'identity.passkey', 'passkey-first', 'Design brief', 'Skeleton', '44px', 'q:sign-in/title']) {
		assert.ok(brief.includes(must), `brief is missing ${must}`);
	}
});
